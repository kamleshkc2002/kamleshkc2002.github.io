import { describe, expect, it } from "vitest";
import { validateFlightSearchRequest } from "../src/validation";

describe("validateFlightSearchRequest", () => {
  it("normalizes a valid request", () => {
    const result = validateFlightSearchRequest({
      origin: "bos",
      destination: "lax",
      travelWindow: { startDate: "2026-07-02" },
      passengers: "2",
      budget: "450",
      rules: { branch: "alternate", maxStops: "0", excludeBasic: true }
    });

    expect(result.ok).toBe(true);
    expect(result.request).toMatchObject({
      origin: "BOS",
      destination: "lax",
      passengers: 2,
      budget: 450,
      rules: {
        branch: "alternate",
        maxStops: 0,
        excludeBasic: true
      }
    });
  });

  it("rejects missing destination and dates", () => {
    const result = validateFlightSearchRequest({
      origin: "BOS",
      travelWindow: {}
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Destination is required.");
    expect(result.errors).toContain("travelWindow.startDate must be a YYYY-MM-DD date.");
  });
});
