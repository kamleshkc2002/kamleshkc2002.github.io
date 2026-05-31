import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src";
import type { Env, ExecutionContextLike } from "../src/types";

function ctx(): ExecutionContextLike {
  return {
    waitUntil: vi.fn()
  };
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
    const response = await handleRequest(new Request("http://worker.test/api/search/flights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: "BOS",
        destination: "LAX",
        travelWindow: { startDate: "2026-07-02", endDate: "2026-07-06" },
        budget: 450
      })
    }), { FLIGHT_PROVIDER: "mock" }, ctx());
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

    const response = await handleRequest(new Request("http://worker.test/api/search/flights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: "BOS",
        destination: "LAX",
        travelWindow: { startDate: "2026-07-02" }
      })
    }), env, ctx());
    const body = await response.json<{ cache: { hit: boolean } }>();

    expect(response.status).toBe(200);
    expect(body.cache.hit).toBe(true);
    expect(env.SEARCH_CACHE?.put).not.toHaveBeenCalled();
  });
});
