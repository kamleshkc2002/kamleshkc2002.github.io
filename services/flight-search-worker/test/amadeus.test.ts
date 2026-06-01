import { afterEach, describe, expect, it, vi } from "vitest";
import { amadeusProvider } from "../src/providers/amadeus";
import type { Env, FlightSearchRequest } from "../src/types";

const request: FlightSearchRequest = {
  origin: "BOS",
  destination: "LAX",
  travelWindow: {
    startDate: "2026-07-02",
    endDate: "2026-07-06"
  },
  passengers: 1,
  budget: 450,
  rules: {
    maxStops: 1
  }
};

function env(overrides: Partial<Env> = {}): Env {
  return {
    FLIGHT_PROVIDER: "amadeus",
    AMADEUS_CLIENT_ID: "client-id",
    AMADEUS_CLIENT_SECRET: "client-secret",
    AMADEUS_BASE_URL: "https://amadeus.test",
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

function memoryKv(initial: Record<string, unknown> = {}): KVNamespace {
  const store = new Map<string, string>();

  Object.entries(initial).forEach(([key, value]) => {
    store.set(key, typeof value === "string" ? value : JSON.stringify(value));
  });

  return {
    get: vi.fn(async (key: string, type?: string) => {
      const value = store.get(key);
      if (value == null) {
        return null;
      }

      return type === "json" ? JSON.parse(value) : value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    })
  } as unknown as KVNamespace;
}

function amadeusOffer() {
  return {
    id: "offer-1",
    validatingAirlineCodes: ["DL"],
    price: {
      total: "388.20"
    },
    itineraries: [
      {
        segments: [
          {
            carrierCode: "DL",
            number: "123",
            departure: {
              iataCode: "BOS",
              at: "2026-07-02T17:35:00"
            },
            arrival: {
              iataCode: "LAX",
              at: "2026-07-02T20:42:00"
            }
          }
        ]
      },
      {
        segments: [
          {
            carrierCode: "DL",
            number: "456",
            departure: {
              iataCode: "LAX",
              at: "2026-07-06T15:20:00"
            },
            arrival: {
              iataCode: "BOS",
              at: "2026-07-06T23:41:00"
            }
          }
        ]
      }
    ],
    travelerPricings: [
      {
        fareDetailsBySegment: [
          {
            cabin: "ECONOMY",
            brandedFareLabel: "Main Cabin"
          }
        ]
      }
    ]
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("amadeusProvider", () => {
  it("requires provider credentials", async () => {
    await expect(amadeusProvider.search(request, env({
      AMADEUS_CLIENT_ID: undefined,
      AMADEUS_CLIENT_SECRET: undefined
    }))).rejects.toMatchObject({
      code: "PROVIDER_CREDENTIALS_MISSING",
      status: 503
    });
  });

  it("requires destination airport codes", async () => {
    await expect(amadeusProvider.search({
      ...request,
      destination: "Paris"
    }, env())).rejects.toMatchObject({
      code: "PROVIDER_BAD_AIRPORT",
      status: 400
    });
  });

  it("fetches and caches an access token while normalizing flight offers", async () => {
    const kv = memoryKv();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        access_token: "token-1",
        expires_in: 1800
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [amadeusOffer()]
      }));
    vi.stubGlobal("fetch", fetchMock);

    const candidates = await amadeusProvider.search(request, env({ SEARCH_CACHE: kv }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://amadeus.test/v1/security/oauth2/token");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/v2/shopping/flight-offers?");
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: "Bearer token-1",
      Accept: "application/json"
    });
    expect(kv.put).toHaveBeenCalledWith("amadeus:access_token", JSON.stringify({
      accessToken: "token-1"
    }), {
      expirationTtl: 1740
    });
    expect(candidates[0]).toMatchObject({
      airline: "DL",
      airlineType: "skyteam",
      price: 388,
      stops: 0,
      fareClass: "main",
      departTime: "17:35",
      returnTime: "15:20",
      origin: "BOS",
      destination: "LAX",
      sourceProvider: "amadeus"
    });
    expect(candidates[0].notes).toContain("DL123");
  });

  it("uses a cached access token when available", async () => {
    const kv = memoryKv({
      "amadeus:access_token": {
        accessToken: "cached-token"
      }
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      data: [amadeusOffer()]
    }));
    vi.stubGlobal("fetch", fetchMock);

    const candidates = await amadeusProvider.search(request, env({ SEARCH_CACHE: kv }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer cached-token"
    });
    expect(kv.put).not.toHaveBeenCalled();
    expect(candidates).toHaveLength(1);
  });

  it("maps token and search failures to provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      error: "invalid_client"
    }, 401)));

    await expect(amadeusProvider.search(request, env())).rejects.toMatchObject({
      code: "PROVIDER_AUTH_FAILED",
      status: 503
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        access_token: "token-1",
        expires_in: 1800
      }))
      .mockResolvedValueOnce(jsonResponse({
        errors: []
      }, 503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(amadeusProvider.search(request, env())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      status: 502
    });
  });
});
