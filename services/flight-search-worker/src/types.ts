export type AirlineType = "skyteam" | "other" | "frontier";
export type FareClass = "basic" | "main" | "comfort" | "premium";
export type PlannerBranch = "preferred" | "alternate";
export type ProviderName = "mock" | "amadeus";

export interface FlightSearchRules {
  branch?: PlannerBranch;
  preferSkyTeam?: boolean;
  excludeBasic?: boolean;
  maxStops?: number;
  pmDepart?: boolean;
}

export interface FlightSearchRequest {
  origin: string;
  destination: string;
  travelWindow: {
    startDate: string;
    endDate?: string;
  };
  passengers?: number;
  budget?: number;
  tripStyle?: string;
  rules?: FlightSearchRules;
}

export interface FlightCandidate {
  id: string;
  airline: string;
  airlineType: AirlineType;
  price: number;
  stops: number;
  fareClass: FareClass;
  departTime: string;
  returnTime: string;
  link: string;
  notes: string;
  origin: string;
  destination: string;
  createdAt: string;
  sourceProvider: ProviderName;
  sourceId: string;
  fetchedAt: string;
}

export interface FlightSearchResponse {
  query: FlightSearchRequest;
  generatedAt: string;
  provider: ProviderName;
  cache: {
    hit: boolean;
    key: string;
    ttlSeconds: number;
  };
  candidates: FlightCandidate[];
  warnings: string[];
  guardrails?: {
    rateLimit?: {
      limit: number;
      remaining: number;
      windowSeconds: number;
    };
    providerDailyLimit?: {
      limit: number;
      remaining: number;
      date: string;
    };
  };
}

export interface Env {
  SEARCH_CACHE?: KVNamespace;
  FLIGHT_PROVIDER?: ProviderName;
  CACHE_TTL_SECONDS?: string;
  RATE_LIMIT_MAX_REQUESTS?: string;
  RATE_LIMIT_WINDOW_SECONDS?: string;
  PROVIDER_DAILY_CALL_LIMIT?: string;
  ENFORCE_PROVIDER_DAILY_LIMIT_FOR_MOCK?: string;
  ALLOWED_ORIGINS?: string;
  AMADEUS_CLIENT_ID?: string;
  AMADEUS_CLIENT_SECRET?: string;
  AMADEUS_BASE_URL?: string;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface FlightSearchProvider {
  name: ProviderName;
  search(request: FlightSearchRequest, env: Env): Promise<FlightCandidate[]>;
}
