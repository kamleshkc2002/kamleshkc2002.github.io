import type { Env, FareClass, FlightCandidate, FlightSearchProvider, FlightSearchRequest } from "../types";
import { ProviderError } from "./errors";
import { recordProviderCall, getGuardrailConfig } from "../guardrails";

interface SerpApiFlightSearchResponse {
  error?: string;
  search_metadata?: {
    id?: string;
    status?: string;
    google_flights_url?: string;
  };
  best_flights?: SerpApiFlightResult[];
  other_flights?: SerpApiFlightResult[];
}

interface SerpApiFlightResult {
  flights?: SerpApiFlightSegment[];
  layovers?: Array<unknown>;
  price?: number | string;
  total_duration?: number;
  type?: string;
  departure_token?: string;
  booking_token?: string;
}

interface SerpApiFlightSegment {
  departure_airport?: SerpApiAirportTime;
  arrival_airport?: SerpApiAirportTime;
  airline?: string;
  flight_number?: string;
  travel_class?: string;
  extensions?: string[];
}

interface SerpApiAirportTime {
  id?: string;
  time?: string;
}

const SKYTEAM_CODES = new Set(["AR", "AM", "AF", "CI", "DL", "GA", "KL", "KE", "ME", "MU", "RO", "SV", "UX", "VN", "VS", "MF"]);
const SKYTEAM_NAMES = [
  "aerolineas argentinas",
  "aeromexico",
  "air europa",
  "air france",
  "china airlines",
  "china eastern",
  "delta",
  "garuda indonesia",
  "kenya airways",
  "klm",
  "korean air",
  "middle east airlines",
  "saudia",
  "tarom",
  "vietnam airlines",
  "virgin atlantic",
  "xiamenair"
];

export const serpApiProvider: FlightSearchProvider = {
  name: "serpapi",
  async search(request, env) {
    requireIataCode(request.origin, "Origin");
    requireIataCode(request.destination, "Destination");

    if (!env.SERPAPI_API_KEY) {
      throw new ProviderError("PROVIDER_CREDENTIALS_MISSING", "SerpApi API key is not configured.", 503);
    }

    const response = await fetch(buildSearchUrl(request, env), {
      headers: {
        Accept: "application/json"
      }
    });

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError("PROVIDER_AUTH_FAILED", `SerpApi authorization failed with ${response.status}.`, 503);
    }

    if (!response.ok) {
      throw new ProviderError("PROVIDER_UNAVAILABLE", `SerpApi search failed with ${response.status}.`);
    }

    const outboundPayload = await response.json<SerpApiFlightSearchResponse>();
    if (outboundPayload.error) {
      throw new ProviderError(getPayloadErrorCode(outboundPayload.error), `SerpApi search failed: ${outboundPayload.error}`, 503);
    }

    if (outboundPayload.search_metadata?.status?.toLowerCase() === "error") {
      throw new ProviderError("PROVIDER_UNAVAILABLE", "SerpApi search failed with an error status.");
    }

    const fetchedAt = new Date().toISOString();
    const outboundResults = collectResults(outboundPayload);

    // If one-way search or no outbound results, just return normalized outbound results
    if (!request.travelWindow.endDate || outboundResults.length === 0) {
      return outboundResults
        .slice(0, 12)
        .map((result, index) => normalizeResult(result, request, outboundPayload, fetchedAt, index));
    }

    // Round-trip search! We will process the top outbound results and fetch their return options
    const maxOutboundFollowups = 3;
    const candidates: FlightCandidate[] = [];

    // Slice to the top few outbound options to respect SerpApi call quota limits
    const topOutbound = outboundResults.slice(0, maxOutboundFollowups);

    for (let i = 0; i < topOutbound.length; i++) {
      const outbound = topOutbound[i];
      if (!outbound.departure_token) {
        // If there's no departure token, return this as an outbound-only option
        candidates.push(normalizeResult(outbound, request, outboundPayload, fetchedAt, i));
        continue;
      }

      try {
        const returnPayload = await fetchReturnFlights(outbound.departure_token, request, env);
        const returnResults = collectResults(returnPayload);

        if (returnResults.length === 0) {
          // No return flights found for this outbound option, but we can still return the outbound-only candidate
          candidates.push(normalizeResult(outbound, request, outboundPayload, fetchedAt, i));
          continue;
        }

        // Pair the outbound flight with each return flight option
        for (let j = 0; j < returnResults.length; j++) {
          const returnFlight = returnResults[j];
          const combinedCandidate = combineFlights(outbound, returnFlight, request, outboundPayload, returnPayload, fetchedAt, i, j);
          candidates.push(combinedCandidate);
        }
      } catch (error) {
        // If a follow-up fails, fall back to the outbound-only candidate
        console.error("fetchReturnFlights error:", error);
        candidates.push(normalizeResult(outbound, request, outboundPayload, fetchedAt, i));
      }
    }

    // Slice to top 12 candidates
    return candidates.slice(0, 12);
  }
};

function buildSearchUrl(request: FlightSearchRequest, env: Env): string {
  const url = new URL(getBaseUrl(env));
  url.searchParams.set("engine", "google_flights");
  url.searchParams.set("api_key", env.SERPAPI_API_KEY || "");
  url.searchParams.set("departure_id", request.origin);
  url.searchParams.set("arrival_id", request.destination.toUpperCase());
  url.searchParams.set("outbound_date", request.travelWindow.startDate);
  url.searchParams.set("currency", "USD");
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");
  url.searchParams.set("adults", String(request.passengers || 1));

  if (request.travelWindow.endDate) {
    url.searchParams.set("type", "1");
    url.searchParams.set("return_date", request.travelWindow.endDate);
  } else {
    url.searchParams.set("type", "2");
  }

  const stops = getStopsParameter(request.rules?.maxStops);
  if (stops) {
    url.searchParams.set("stops", stops);
  }

  if (env.SERPAPI_DEEP_SEARCH === "true") {
    url.searchParams.set("deep_search", "true");
  }

  return url.toString();
}

function collectResults(payload: SerpApiFlightSearchResponse): SerpApiFlightResult[] {
  return [
    ...(payload.best_flights || []),
    ...(payload.other_flights || [])
  ];
}

function normalizeResult(result: SerpApiFlightResult, request: FlightSearchRequest, payload: SerpApiFlightSearchResponse, fetchedAt: string, index: number): FlightCandidate {
  const segments = result.flights || [];
  const first = segments[0];
  const last = segments[segments.length - 1];
  const airline = first?.airline || "Flight";
  const sourceId = [
    "serpapi",
    payload.search_metadata?.id || "search",
    index,
    result.departure_token || result.booking_token || getFlightNumbers(segments).join("-") || fetchedAt
  ].join(":");

  return {
    id: sourceId,
    airline,
    airlineType: getAirlineType(first),
    price: parsePrice(result.price),
    stops: getStops(result),
    fareClass: getFareClass(segments),
    departTime: timeFromSerpApi(first?.departure_airport?.time),
    returnTime: "",
    link: payload.search_metadata?.google_flights_url || buildGoogleFlightsLink(request),
    notes: buildNotes(result, request),
    origin: first?.departure_airport?.id || request.origin,
    destination: last?.arrival_airport?.id || request.destination.toUpperCase(),
    createdAt: fetchedAt,
    sourceProvider: "serpapi",
    sourceId,
    fetchedAt
  };
}

function getStopsParameter(maxStops?: number): string | null {
  if (maxStops == null) {
    return null;
  }

  if (maxStops <= 0) {
    return "1";
  }

  if (maxStops === 1) {
    return "2";
  }

  return "3";
}

function getStops(result: SerpApiFlightResult): number {
  if (Array.isArray(result.layovers)) {
    return result.layovers.length;
  }

  return Math.max(0, (result.flights || []).length - 1);
}

function parsePrice(value: number | string | undefined): number {
  const parsed = typeof value === "number"
    ? value
    : Number(String(value || "").replace(/[^0-9.]+/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function getAirlineType(segment?: SerpApiFlightSegment): FlightCandidate["airlineType"] {
  const code = getAirlineCode(segment?.flight_number || "");
  const airline = (segment?.airline || "").toLowerCase();

  if (code === "F9" || airline.includes("frontier")) {
    return "frontier";
  }

  if (SKYTEAM_CODES.has(code) || SKYTEAM_NAMES.some((name) => airline.includes(name))) {
    return "skyteam";
  }

  return "other";
}

function getAirlineCode(flightNumber: string): string {
  const match = flightNumber.trim().toUpperCase().match(/^([A-Z0-9]{2})\s*\d+/);
  return match ? match[1] : "";
}

function getFareClass(segments: SerpApiFlightSegment[]): FareClass {
  const text = segments
    .flatMap((segment) => [
      segment.travel_class || "",
      ...(segment.extensions || [])
    ])
    .join(" ")
    .toLowerCase();

  if (text.includes("basic")) {
    return "basic";
  }

  if (text.includes("premium") || text.includes("business") || text.includes("first")) {
    return "premium";
  }

  if (text.includes("comfort") || text.includes("plus")) {
    return "comfort";
  }

  return "main";
}

function buildNotes(result: SerpApiFlightResult, request: FlightSearchRequest): string {
  const details = getFlightNumbers(result.flights || []);
  const notes = details.length ? [`SerpApi Google Flights result: ${details.slice(0, 4).join(", ")}`] : ["SerpApi Google Flights result."];

  if (result.total_duration) {
    notes.push(`Duration ${formatDuration(result.total_duration)}.`);
  }

  if (request.travelWindow.endDate && result.departure_token) {
    notes.push("Return options require a SerpApi departure-token follow-up.");
  }

  return notes.join(" ");
}

function getFlightNumbers(segments: SerpApiFlightSegment[]): string[] {
  return segments
    .map((segment) => String(segment.flight_number || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function timeFromSerpApi(value?: string): string {
  if (!value) {
    return "";
  }

  const match = value.match(/(\d{1,2}:\d{2})/);
  return match ? match[1].padStart(5, "0") : "";
}

function requireIataCode(value: string, label: string): void {
  if (!/^[A-Z]{3}$/i.test(value)) {
    throw new ProviderError("PROVIDER_BAD_AIRPORT", `${label} must be a 3-letter airport code for SerpApi Google Flights searches.`, 400);
  }
}

function getPayloadErrorCode(error: string): "PROVIDER_AUTH_FAILED" | "PROVIDER_UNAVAILABLE" {
  return /api key|unauthorized|forbidden|permission/i.test(error) ? "PROVIDER_AUTH_FAILED" : "PROVIDER_UNAVAILABLE";
}

function buildGoogleFlightsLink(request: FlightSearchRequest): string {
  const query = encodeURIComponent(`${request.origin} to ${request.destination} ${request.travelWindow.startDate}`);
  return `https://www.google.com/travel/flights?q=${query}`;
}

function getBaseUrl(env: Env): string {
  return (env.SERPAPI_BASE_URL || "https://serpapi.com/search").replace(/\/$/, "");
}

async function fetchReturnFlights(departureToken: string, request: FlightSearchRequest, env: Env): Promise<SerpApiFlightSearchResponse> {
  const url = new URL(getBaseUrl(env));
  url.searchParams.set("engine", "google_flights");
  url.searchParams.set("api_key", env.SERPAPI_API_KEY || "");
  url.searchParams.set("departure_id", request.origin);
  url.searchParams.set("arrival_id", request.destination.toUpperCase());
  url.searchParams.set("outbound_date", request.travelWindow.startDate);
  if (request.travelWindow.endDate) {
    url.searchParams.set("return_date", request.travelWindow.endDate);
  }
  url.searchParams.set("departure_token", departureToken);
  url.searchParams.set("currency", "USD");
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");
  url.searchParams.set("adults", String(request.passengers || 1));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError("PROVIDER_AUTH_FAILED", `SerpApi authorization failed with ${response.status}.`, 503);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errPayload = await response.json<{ error?: string }>();
      detail = errPayload.error || "";
    } catch (_) {}
    throw new ProviderError("PROVIDER_UNAVAILABLE", `SerpApi search failed with ${response.status}: ${detail}`);
  }

  const payload = await response.json<SerpApiFlightSearchResponse>();
  if (payload.error) {
    throw new ProviderError(getPayloadErrorCode(payload.error), `SerpApi search failed: ${payload.error}`, 503);
  }

  // Record this sequential request in the daily limit
  await recordProviderCall(env, "serpapi", getGuardrailConfig(env), new Date(), 1);

  return payload;
}

function combineFlights(
  outbound: SerpApiFlightResult,
  returnFlight: SerpApiFlightResult,
  request: FlightSearchRequest,
  outboundPayload: SerpApiFlightSearchResponse,
  returnPayload: SerpApiFlightSearchResponse,
  fetchedAt: string,
  outboundIndex: number,
  returnIndex: number
): FlightCandidate {
  const outboundSegments = outbound.flights || [];
  const returnSegments = returnFlight.flights || [];
  const firstOutbound = outboundSegments[0];
  const lastOutbound = outboundSegments[outboundSegments.length - 1];
  const firstReturn = returnSegments[0];
  const lastReturn = returnSegments[returnSegments.length - 1];

  const airline = firstOutbound?.airline || firstReturn?.airline || "Flight";
  const outboundStops = getStops(outbound);
  const returnStops = getStops(returnFlight);

  const sourceId = [
    "serpapi",
    outboundPayload.search_metadata?.id || "search",
    outboundIndex,
    returnIndex,
    outbound.departure_token || outbound.booking_token || getFlightNumbers(outboundSegments).join("-"),
    returnFlight.departure_token || returnFlight.booking_token || getFlightNumbers(returnSegments).join("-") || fetchedAt
  ].join(":");

  const outboundFlightNumbers = getFlightNumbers(outboundSegments);
  const returnFlightNumbers = getFlightNumbers(returnSegments);
  const details = [...outboundFlightNumbers, ...returnFlightNumbers];
  const notesList = details.length
    ? [`SerpApi Google Flights round-trip: Outbound (${outboundFlightNumbers.join(", ")}), Return (${returnFlightNumbers.join(", ")})`]
    : ["SerpApi Google Flights round-trip."];

  if (outbound.total_duration || returnFlight.total_duration) {
    const outDur = outbound.total_duration ? formatDuration(outbound.total_duration) : "unknown";
    const retDur = returnFlight.total_duration ? formatDuration(returnFlight.total_duration) : "unknown";
    notesList.push(`Duration: Outbound ${outDur}, Return ${retDur}.`);
  }

  return {
    id: sourceId,
    airline,
    airlineType: getAirlineType(firstOutbound),
    price: parsePrice(returnFlight.price || outbound.price),
    stops: Math.max(outboundStops, returnStops),
    fareClass: getFareClass([...outboundSegments, ...returnSegments]),
    departTime: timeFromSerpApi(firstOutbound?.departure_airport?.time),
    returnTime: timeFromSerpApi(firstReturn?.departure_airport?.time),
    link: returnPayload.search_metadata?.google_flights_url || outboundPayload.search_metadata?.google_flights_url || buildGoogleFlightsLink(request),
    notes: notesList.join(" "),
    origin: firstOutbound?.departure_airport?.id || request.origin,
    destination: lastOutbound?.arrival_airport?.id || request.destination.toUpperCase(),
    createdAt: fetchedAt,
    sourceProvider: "serpapi",
    sourceId,
    fetchedAt
  };
}
