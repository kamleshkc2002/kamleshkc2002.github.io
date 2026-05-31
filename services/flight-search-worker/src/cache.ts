import type { Env, FlightSearchRequest, FlightSearchResponse } from "./types";

export async function createCacheKey(request: FlightSearchRequest): Promise<string> {
  const canonical = JSON.stringify(sortObject(request));
  const digest = await sha256(canonical);
  return "flights:" + digest.slice(0, 32);
}

export function getCacheTtlSeconds(env: Env): number {
  const parsed = Number(env.CACHE_TTL_SECONDS || 21600);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 21600;
}

export async function readCachedResponse(env: Env, key: string): Promise<FlightSearchResponse | null> {
  if (!env.SEARCH_CACHE) {
    return null;
  }

  return env.SEARCH_CACHE.get<FlightSearchResponse>(key, "json");
}

export function writeCachedResponse(env: Env, key: string, response: FlightSearchResponse, ttlSeconds: number): Promise<void> | null {
  if (!env.SEARCH_CACHE) {
    return null;
  }

  return env.SEARCH_CACHE.put(key, JSON.stringify(response), {
    expirationTtl: ttlSeconds
  });
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const item = (value as Record<string, unknown>)[key];
        if (item !== undefined) {
          result[key] = sortObject(item);
        }
        return result;
      }, {});
  }

  return value;
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
