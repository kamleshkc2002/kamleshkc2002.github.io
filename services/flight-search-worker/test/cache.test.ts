import { describe, expect, it } from "vitest";
import { createCacheKey } from "../src/cache";
import type { FlightSearchRequest } from "../src/types";

describe("createCacheKey", () => {
  it("is stable for equivalent request object ordering", async () => {
    const requestA: FlightSearchRequest = {
      origin: "BOS",
      destination: "LAX",
      travelWindow: { startDate: "2026-07-02", endDate: "2026-07-06" },
      passengers: 1,
      budget: 450,
      rules: { preferSkyTeam: true, excludeBasic: true, maxStops: 1 }
    };
    const requestB = {
      destination: "LAX",
      origin: "BOS",
      budget: 450,
      passengers: 1,
      rules: { maxStops: 1, excludeBasic: true, preferSkyTeam: true },
      travelWindow: { endDate: "2026-07-06", startDate: "2026-07-02" }
    } as FlightSearchRequest;

    await expect(createCacheKey(requestA)).resolves.toBe(await createCacheKey(requestB));
  });
});
