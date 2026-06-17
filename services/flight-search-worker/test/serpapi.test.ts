import { afterEach, describe, expect, it, vi } from "vitest";
import { serpApiProvider } from "../src/providers/serpapi";
import type { Env, FlightSearchRequest } from "../src/types";

const request: FlightSearchRequest = {
  origin: "BOS",
  destination: "LAX",
  travelWindow: {
    startDate: "2026-07-02",
    endDate: "2026-07-06"
  },
  passengers: 2,
  budget: 450,
  rules: {
    maxStops: 1
  }
};

function env(overrides: Partial<Env> = {}): Env {
  return {
    FLIGHT_PROVIDER: "serpapi",
    SERPAPI_API_KEY: "serpapi-key",
    SERPAPI_BASE_URL: "https://serpapi.test/search",
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function serpApiPayload() {
  return {
    search_metadata: {
      id: "search-1",
      status: "Success",
      google_flights_url: "https://www.google.com/travel/flights/search"
    },
    best_flights: [
      {
        flights: [
          {
            departure_airport: {
              id: "BOS",
              time: "2026-07-02 17:35"
            },
            arrival_airport: {
              id: "JFK",
              time: "2026-07-02 19:10"
            },
            airline: "Delta",
            flight_number: "DL 123",
            travel_class: "Economy"
          },
          {
            departure_airport: {
              id: "JFK",
              time: "2026-07-02 20:20"
            },
            arrival_airport: {
              id: "LAX",
              time: "2026-07-02 23:42"
            },
            airline: "Delta",
            flight_number: "DL 456",
            travel_class: "Economy"
          }
        ],
        layovers: [
          {
            name: "John F. Kennedy International Airport"
          }
        ],
        price: 388,
        total_duration: 427,
        type: "Round trip",
        departure_token: "departure-token-1"
      }
    ],
    other_flights: [
      {
        flights: [
          {
            departure_airport: {
              id: "BOS",
              time: "2026-07-02 09:15"
            },
            arrival_airport: {
              id: "LAX",
              time: "2026-07-02 12:40"
            },
            airline: "Frontier",
            flight_number: "F9 777",
            travel_class: "Basic Economy"
          }
        ],
        price: "$255",
        total_duration: 385
      }
    ]
  };
}

function serpApiReturnPayload() {
  return {
    search_metadata: {
      id: "search-2",
      status: "Success",
      google_flights_url: "https://www.google.com/travel/flights/search/return"
    },
    best_flights: [
      {
        flights: [
          {
            departure_airport: {
              id: "LAX",
              time: "2026-07-06 14:15"
            },
            arrival_airport: {
              id: "BOS",
              time: "2026-07-06 22:30"
            },
            airline: "Delta",
            flight_number: "DL 789",
            travel_class: "Economy"
          }
        ],
        price: 388,
        total_duration: 315
      }
    ],
    other_flights: []
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("serpApiProvider", () => {
  it("requires a SerpApi API key", async () => {
    await expect(serpApiProvider.search(request, env({
      SERPAPI_API_KEY: undefined
    }))).rejects.toMatchObject({
      code: "PROVIDER_CREDENTIALS_MISSING",
      status: 503
    });
  });

  it("requires airport codes for the current provider spike", async () => {
    await expect(serpApiProvider.search({
      ...request,
      destination: "Paris"
    }, env())).rejects.toMatchObject({
      code: "PROVIDER_BAD_AIRPORT",
      status: 400
    });
  });

  it("builds a Google Flights request and normalizes results", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(serpApiPayload()))
      .mockResolvedValueOnce(jsonResponse(serpApiReturnPayload()));
    vi.stubGlobal("fetch", fetchMock);

    const candidates = await serpApiProvider.search(request, env({
      SERPAPI_DEEP_SEARCH: "true"
    }));
    const url = new URL(String(fetchMock.mock.calls[0][0]));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(url.origin + url.pathname).toBe("https://serpapi.test/search");
    expect(url.searchParams.get("engine")).toBe("google_flights");
    expect(url.searchParams.get("api_key")).toBe("serpapi-key");
    expect(url.searchParams.get("departure_id")).toBe("BOS");
    expect(url.searchParams.get("arrival_id")).toBe("LAX");
    expect(url.searchParams.get("outbound_date")).toBe("2026-07-02");
    expect(url.searchParams.get("return_date")).toBe("2026-07-06");
    expect(url.searchParams.get("type")).toBe("1");
    expect(url.searchParams.get("stops")).toBe("2");
    expect(url.searchParams.get("deep_search")).toBe("true");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Accept: "application/json"
    });

    // Verify follow-up request URL
    const followUpUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(followUpUrl.searchParams.get("departure_token")).toBe("departure-token-1");

    expect(candidates[0]).toMatchObject({
      id: "serpapi:search-1:0:0:departure-token-1:DL 789",
      airline: "Delta",
      airlineType: "skyteam",
      price: 388,
      stops: 1,
      fareClass: "main",
      departTime: "17:35",
      returnTime: "14:15",
      link: "https://www.google.com/travel/flights/search/return",
      origin: "BOS",
      destination: "LAX",
      sourceProvider: "serpapi"
    });
    expect(candidates[0].notes).toContain("DL 123");
    expect(candidates[0].notes).toContain("DL 789");
    expect(candidates[0].notes).toContain("Duration: Outbound 7h 7m, Return 5h 15m");

    // The second candidate has no departure_token, so it remains outbound-only
    expect(candidates[1]).toMatchObject({
      id: "serpapi:search-1:1:F9 777",
      airline: "Frontier",
      airlineType: "frontier",
      price: 255,
      stops: 0,
      fareClass: "basic",
      departTime: "09:15",
      returnTime: "",
      sourceProvider: "serpapi"
    });
  });

  it("builds one-way searches when no return date is present", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ best_flights: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await serpApiProvider.search({
      ...request,
      travelWindow: {
        startDate: "2026-07-02"
      },
      rules: {
        maxStops: 0
      }
    }, env());
    const url = new URL(String(fetchMock.mock.calls[0][0]));

    expect(url.searchParams.get("type")).toBe("2");
    expect(url.searchParams.has("return_date")).toBe(false);
    expect(url.searchParams.get("stops")).toBe("1");
  });

  it("maps HTTP and payload failures to provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      error: "forbidden"
    }, 403)));

    await expect(serpApiProvider.search(request, env())).rejects.toMatchObject({
      code: "PROVIDER_AUTH_FAILED",
      status: 503
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      error: "Invalid API key"
    })));

    await expect(serpApiProvider.search(request, env())).rejects.toMatchObject({
      code: "PROVIDER_AUTH_FAILED",
      status: 503
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      error: "Search temporarily unavailable"
    })));

    await expect(serpApiProvider.search(request, env())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      status: 503
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      search_metadata: {
        status: "Error"
      }
    })));

    await expect(serpApiProvider.search(request, env())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      status: 502
    });
  });
});
