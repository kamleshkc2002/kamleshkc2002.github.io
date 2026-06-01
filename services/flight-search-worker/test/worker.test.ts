import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src";
import type { Env, ExecutionContextLike } from "../src/types";

function ctx(): ExecutionContextLike {
  return {
    waitUntil: vi.fn()
  };
}

function searchRequest(headers: HeadersInit = {}): Request {
  return new Request("http://worker.test/api/search/flights", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify({
      origin: "BOS",
      destination: "LAX",
      travelWindow: { startDate: "2026-07-02", endDate: "2026-07-06" },
      budget: 450
    })
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

describe("worker", () => {
  it("responds to health checks", async () => {
    const response = await handleRequest(new Request("http://worker.test/health"), { FLIGHT_PROVIDER: "mock" }, ctx());
    const body = await response.json<{ ok: boolean; provider: string }>();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.provider).toBe("mock");
  });

  it("returns mock flight candidates", async () => {
    const response = await handleRequest(searchRequest(), { FLIGHT_PROVIDER: "mock" }, ctx());
    const body = await response.json<{ candidates: unknown[]; cache: { hit: boolean } }>();

    expect(response.status).toBe(200);
    expect(body.cache.hit).toBe(false);
    expect(body.candidates.length).toBeGreaterThan(0);
  });

  it("serves cached results when KV has a match", async () => {
    const cached = {
      query: {
        origin: "BOS",
        destination: "LAX",
        travelWindow: { startDate: "2026-07-02" }
      },
      generatedAt: "2026-05-31T00:00:00.000Z",
      provider: "mock",
      cache: { hit: false, key: "flights:cached", ttlSeconds: 21600 },
      candidates: [],
      warnings: []
    };
    const env: Env = {
      FLIGHT_PROVIDER: "mock",
      SEARCH_CACHE: {
        get: vi.fn().mockResolvedValue(cached),
        put: vi.fn()
      } as unknown as KVNamespace
    };

    const response = await handleRequest(searchRequest(), env, ctx());
    const body = await response.json<{ cache: { hit: boolean } }>();

    expect(response.status).toBe(200);
    expect(body.cache.hit).toBe(true);
    expect(env.SEARCH_CACHE?.put).not.toHaveBeenCalled();
  });

  it("rate limits uncached searches before provider execution", async () => {
    const env: Env = {
      FLIGHT_PROVIDER: "amadeus",
      RATE_LIMIT_MAX_REQUESTS: "1",
      RATE_LIMIT_WINDOW_SECONDS: "60",
      SEARCH_CACHE: memoryKv()
    };

    const first = await handleRequest(searchRequest({ "CF-Connecting-IP": "203.0.113.10" }), env, ctx());
    const second = await handleRequest(searchRequest({ "CF-Connecting-IP": "203.0.113.10" }), env, ctx());
    const body = await second.json<{ code: string; error: string }>();

    expect(first.status).toBe(503);
    expect(second.status).toBe(429);
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.error).toContain("Too many uncached searches");
  });

  it("does not call a real provider when the daily provider cap is exhausted", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const env: Env = {
      FLIGHT_PROVIDER: "amadeus",
      PROVIDER_DAILY_CALL_LIMIT: "1",
      SEARCH_CACHE: memoryKv({
        [`provider_calls:${today}`]: "1"
      })
    };

    const response = await handleRequest(searchRequest(), env, ctx());
    const body = await response.json<{ code: string; error: string }>();

    expect(response.status).toBe(429);
    expect(body.code).toBe("PROVIDER_DAILY_LIMIT_REACHED");
    expect(body.error).toContain("daily flight-search quota");
  });

  it("fails closed for real providers when guardrail storage is unavailable", async () => {
    const response = await handleRequest(searchRequest(), { FLIGHT_PROVIDER: "amadeus" }, ctx());
    const body = await response.json<{ code: string; error: string }>();

    expect(response.status).toBe(503);
    expect(body.code).toBe("GUARDRAILS_UNAVAILABLE");
    expect(body.error).toContain("quota guardrails");
  });

  it("returns structured provider errors", async () => {
    const response = await handleRequest(new Request("http://worker.test/api/search/flights", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        origin: "BOS",
        destination: "Paris",
        travelWindow: { startDate: "2026-07-02" }
      })
    }), {
      FLIGHT_PROVIDER: "amadeus",
      SEARCH_CACHE: memoryKv()
    }, ctx());
    const body = await response.json<{ code: string; error: string }>();

    expect(response.status).toBe(400);
    expect(body.code).toBe("PROVIDER_BAD_AIRPORT");
    expect(body.error).toContain("3-letter airport code");
  });

  it("bypasses rate and provider caps when a cached response exists", async () => {
    const cached = {
      query: {
        origin: "BOS",
        destination: "LAX",
        travelWindow: { startDate: "2026-07-02" }
      },
      generatedAt: "2026-05-31T00:00:00.000Z",
      provider: "amadeus",
      cache: { hit: false, key: "flights:cached", ttlSeconds: 21600 },
      candidates: [],
      warnings: []
    };
    const env: Env = {
      FLIGHT_PROVIDER: "amadeus",
      RATE_LIMIT_MAX_REQUESTS: "0",
      PROVIDER_DAILY_CALL_LIMIT: "0",
      SEARCH_CACHE: {
        get: vi.fn().mockResolvedValue(cached),
        put: vi.fn()
      } as unknown as KVNamespace
    };

    const response = await handleRequest(searchRequest(), env, ctx());
    const body = await response.json<{ cache: { hit: boolean }; provider: string }>();

    expect(response.status).toBe(200);
    expect(body.cache.hit).toBe(true);
    expect(body.provider).toBe("amadeus");
    expect(env.SEARCH_CACHE?.put).not.toHaveBeenCalled();
  });

  it("records daily provider calls after successful guarded searches", async () => {
    const env: Env = {
      FLIGHT_PROVIDER: "mock",
      ENFORCE_PROVIDER_DAILY_LIMIT_FOR_MOCK: "true",
      PROVIDER_DAILY_CALL_LIMIT: "5",
      SEARCH_CACHE: memoryKv()
    };

    const response = await handleRequest(searchRequest(), env, ctx());
    const body = await response.json<{ guardrails?: { providerDailyLimit?: { remaining: number } } }>();

    expect(response.status).toBe(200);
    expect(body.guardrails?.providerDailyLimit?.remaining).toBe(4);
  });
});
