import type { FlightCandidate, FlightSearchProvider, FlightSearchRequest } from "../types";

const now = () => new Date().toISOString();

export const mockProvider: FlightSearchProvider = {
  name: "mock",
  async search(request) {
    const fetchedAt = now();
    const destination = request.destination.toUpperCase();
    const budget = request.budget || 420;
    const rows = [
      ["Delta Air Lines", "skyteam", -35, 0, "main", "17:35", "15:20"],
      ["KLM via Amsterdam", "skyteam", 20, 1, "main", "18:10", "13:45"],
      ["JetBlue", "other", -55, 0, "main", "14:05", "11:30"],
      ["United Airlines", "other", -25, 1, "main", "19:20", "16:15"],
      ["Frontier", "frontier", -120, 0, "basic", "09:15", "08:40"]
    ] as const;

    return rows.map((row, index) => {
      const [airline, airlineType, delta, stops, fareClass, departTime, returnTime] = row;
      const price = Math.max(79, budget + Number(delta) + index * 9);
      return {
        id: stableCandidateId(request, airline),
        airline,
        airlineType,
        price,
        stops,
        fareClass,
        departTime,
        returnTime,
        link: buildGoogleFlightsLink(request),
        notes: "Mock API result for local planner testing.",
        origin: request.origin,
        destination,
        createdAt: fetchedAt,
        sourceProvider: "mock",
        sourceId: stableCandidateId(request, airline),
        fetchedAt
      } satisfies FlightCandidate;
    });
  }
};

function stableCandidateId(request: FlightSearchRequest, airline: string): string {
  return [
    "mock",
    request.origin,
    request.destination,
    request.travelWindow.startDate,
    airline.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  ].join(":");
}

function buildGoogleFlightsLink(request: FlightSearchRequest): string {
  const query = encodeURIComponent(`${request.origin} to ${request.destination} ${request.travelWindow.startDate}`);
  return `https://www.google.com/travel/flights?q=${query}`;
}
