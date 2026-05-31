import type { Env, FareClass, FlightCandidate, FlightSearchProvider, FlightSearchRequest } from "../types";

interface AmadeusTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface AmadeusFlightOffer {
  id?: string;
  validatingAirlineCodes?: string[];
  price?: {
    total?: string;
  };
  itineraries?: Array<{
    segments?: Array<{
      carrierCode?: string;
      number?: string;
      departure?: {
        iataCode?: string;
        at?: string;
      };
      arrival?: {
        iataCode?: string;
        at?: string;
      };
    }>;
  }>;
  travelerPricings?: Array<{
    fareDetailsBySegment?: Array<{
      cabin?: string;
      brandedFareLabel?: string;
    }>;
  }>;
}

const SKYTEAM_CODES = new Set(["AR", "AM", "AF", "CI", "DL", "GA", "KL", "KE", "ME", "MU", "RO", "SV", "UX", "VN", "VS", "MF"]);

export const amadeusProvider: FlightSearchProvider = {
  name: "amadeus",
  async search(request, env) {
    requireIataCode(request.destination, "Destination");

    const token = await getAccessToken(env);
    const url = buildSearchUrl(request, env);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Amadeus search failed with ${response.status}.`);
    }

    const payload = await response.json<{ data?: AmadeusFlightOffer[] }>();
    const fetchedAt = new Date().toISOString();

    return (payload.data || []).slice(0, 12).map((offer) => normalizeOffer(offer, request, fetchedAt));
  }
};

async function getAccessToken(env: Env): Promise<string> {
  if (!env.AMADEUS_CLIENT_ID || !env.AMADEUS_CLIENT_SECRET) {
    throw new Error("Amadeus credentials are not configured.");
  }

  const baseUrl = getBaseUrl(env);
  const response = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.AMADEUS_CLIENT_ID,
      client_secret: env.AMADEUS_CLIENT_SECRET
    })
  });

  if (!response.ok) {
    throw new Error(`Amadeus token request failed with ${response.status}.`);
  }

  const payload = await response.json<AmadeusTokenResponse>();
  if (!payload.access_token) {
    throw new Error("Amadeus token response did not include an access token.");
  }

  return payload.access_token;
}

function buildSearchUrl(request: FlightSearchRequest, env: Env): string {
  const params = new URLSearchParams({
    originLocationCode: request.origin,
    destinationLocationCode: request.destination.toUpperCase(),
    departureDate: request.travelWindow.startDate,
    adults: String(request.passengers || 1),
    currencyCode: "USD",
    max: "12"
  });

  if (request.travelWindow.endDate) {
    params.set("returnDate", request.travelWindow.endDate);
  }

  if (request.rules?.maxStops === 0) {
    params.set("nonStop", "true");
  }

  return `${getBaseUrl(env)}/v2/shopping/flight-offers?${params.toString()}`;
}

function normalizeOffer(offer: AmadeusFlightOffer, request: FlightSearchRequest, fetchedAt: string): FlightCandidate {
  const outbound = offer.itineraries?.[0]?.segments || [];
  const inbound = offer.itineraries?.[1]?.segments || [];
  const carrier = offer.validatingAirlineCodes?.[0] || outbound[0]?.carrierCode || "Flight";
  const sourceId = `amadeus:${offer.id || carrier}:${outbound[0]?.departure?.at || fetchedAt}`;

  return {
    id: sourceId,
    airline: carrier,
    airlineType: getAirlineType(carrier),
    price: Math.round(Number(offer.price?.total || 0)),
    stops: Math.max(0, Math.max(outbound.length, inbound.length || 1) - 1),
    fareClass: getFareClass(offer),
    departTime: timeFromIso(outbound[0]?.departure?.at),
    returnTime: timeFromIso(inbound[0]?.departure?.at),
    link: buildGoogleFlightsLink(request),
    notes: buildNotes(offer),
    origin: request.origin,
    destination: request.destination.toUpperCase(),
    createdAt: fetchedAt,
    sourceProvider: "amadeus",
    sourceId,
    fetchedAt
  };
}

function getAirlineType(code: string): FlightCandidate["airlineType"] {
  if (code.toUpperCase() === "F9") {
    return "frontier";
  }

  return SKYTEAM_CODES.has(code.toUpperCase()) ? "skyteam" : "other";
}

function getFareClass(offer: AmadeusFlightOffer): FareClass {
  const fare = offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0];
  const text = `${fare?.brandedFareLabel || ""} ${fare?.cabin || ""}`.toLowerCase();

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

function buildNotes(offer: AmadeusFlightOffer): string {
  const segments = (offer.itineraries || [])
    .flatMap((itinerary) => itinerary.segments || [])
    .map((segment) => `${segment.carrierCode || ""}${segment.number || ""}`.trim())
    .filter(Boolean);

  return segments.length ? `Amadeus result: ${segments.slice(0, 4).join(", ")}` : "Amadeus flight offer.";
}

function buildGoogleFlightsLink(request: FlightSearchRequest): string {
  const query = encodeURIComponent(`${request.origin} to ${request.destination} ${request.travelWindow.startDate}`);
  return `https://www.google.com/travel/flights?q=${query}`;
}

function timeFromIso(value?: string): string {
  if (!value) {
    return "";
  }

  const match = value.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function requireIataCode(value: string, label: string): void {
  if (!/^[A-Z]{3}$/i.test(value)) {
    throw new Error(`${label} must be a 3-letter airport code for the Amadeus provider.`);
  }
}

function getBaseUrl(env: Env): string {
  const host = env.AMADEUS_BASE_URL || "https://test.api.amadeus.com";
  return host.replace(/\/$/, "");
}
