import type { FlightSearchRequest } from "./types";

export interface ValidationResult {
  ok: boolean;
  request?: FlightSearchRequest;
  errors: string[];
}

export function validateFlightSearchRequest(value: unknown): ValidationResult {
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["Request body must be a JSON object."] };
  }

  const input = value as Record<string, unknown>;
  const origin = cleanAirport(input.origin);
  const destination = cleanAirport(input.destination);
  const travelWindow = readTravelWindow(input.travelWindow);
  const errors: string[] = [];

  if (!/^[A-Z]{3}$/.test(origin)) {
    errors.push("Origin must be a 3-letter airport code.");
  }

  if (!destination) {
    errors.push("Destination is required.");
  }

  if (!travelWindow.startDate || !isDateString(travelWindow.startDate)) {
    errors.push("travelWindow.startDate must be a YYYY-MM-DD date.");
  }

  if (travelWindow.endDate && !isDateString(travelWindow.endDate)) {
    errors.push("travelWindow.endDate must be a YYYY-MM-DD date.");
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  const budget = numberOrUndefined(input.budget);
  const passengers = numberOrUndefined(input.passengers) || 1;
  const rules = readRules(input.rules);

  return {
    ok: true,
    errors: [],
    request: {
      origin,
      destination,
      travelWindow,
      passengers: clamp(Math.round(passengers), 1, 9),
      budget: budget && budget > 0 ? Math.round(budget) : undefined,
      tripStyle: typeof input.tripStyle === "string" ? input.tripStyle : undefined,
      rules
    }
  };
}

export function cleanAirport(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function readTravelWindow(value: unknown): FlightSearchRequest["travelWindow"] {
  if (!value || typeof value !== "object") {
    return { startDate: "" };
  }

  const input = value as Record<string, unknown>;
  return {
    startDate: String(input.startDate || "").trim(),
    endDate: String(input.endDate || "").trim() || undefined
  };
}

function readRules(value: unknown): FlightSearchRequest["rules"] {
  if (!value || typeof value !== "object") {
    return {};
  }

  const input = value as Record<string, unknown>;
  const maxStops = numberOrUndefined(input.maxStops);
  const branch = input.branch === "alternate" ? "alternate" : "preferred";

  return {
    branch,
    preferSkyTeam: Boolean(input.preferSkyTeam),
    excludeBasic: input.excludeBasic !== false,
    maxStops: maxStops == null ? undefined : clamp(Math.round(maxStops), 0, 2),
    pmDepart: Boolean(input.pmDepart)
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === "" || value == null) {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + "T00:00:00Z").getTime());
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
