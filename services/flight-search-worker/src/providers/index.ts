import type { Env, FlightSearchProvider, ProviderName } from "../types";
import { amadeusProvider } from "./amadeus";
import { mockProvider } from "./mock";

export function getProvider(env: Env): FlightSearchProvider {
  const name = (env.FLIGHT_PROVIDER || "mock") as ProviderName;

  if (name === "amadeus") {
    return amadeusProvider;
  }

  return mockProvider;
}
