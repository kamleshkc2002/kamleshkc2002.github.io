import { createCacheKey, getCacheTtlSeconds, readCachedResponse, writeCachedResponse } from "./cache";
import { corsHeaders, jsonResponse } from "./cors";
import {
  applyRateLimit,
  checkProviderDailyLimit,
  checkProviderGuardrailStore,
  getGuardrailConfig,
  guardrailErrorBody,
  recordProviderCall
} from "./guardrails";
import { getProvider } from "./providers";
import type { Env, ExecutionContextLike, FlightSearchResponse } from "./types";
import { validateFlightSearchRequest } from "./validation";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    return handleRequest(request, env, ctx);
  }
};

export async function handleRequest(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request, env)
    });
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse(request, env, {
      ok: true,
      provider: env.FLIGHT_PROVIDER || "mock",
      cacheConfigured: Boolean(env.SEARCH_CACHE)
    });
  }

  if (request.method === "POST" && url.pathname === "/api/search/flights") {
    return searchFlights(request, env, ctx);
  }

  return jsonResponse(request, env, {
    error: "Not found."
  }, { status: 404 });
}

async function searchFlights(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    return jsonResponse(request, env, {
      error: "Request body must be valid JSON."
    }, { status: 400 });
  }

  const validation = validateFlightSearchRequest(body);
  if (!validation.ok || !validation.request) {
    return jsonResponse(request, env, {
      error: "Invalid flight search request.",
      details: validation.errors
    }, { status: 400 });
  }

  const provider = getProvider(env);
  const guardrailConfig = getGuardrailConfig(env);
  const ttlSeconds = getCacheTtlSeconds(env);
  const cacheKey = await createCacheKey(validation.request);
  const cached = await readCachedResponse(env, cacheKey);

  if (cached) {
    return jsonResponse(request, env, {
      ...cached,
      cache: {
        ...cached.cache,
        hit: true
      }
    });
  }

  const guardrailStoreError = await checkProviderGuardrailStore(env, provider.name);
  if (guardrailStoreError) {
    return jsonResponse(request, env, guardrailErrorBody(guardrailStoreError), { status: guardrailStoreError.status });
  }

  const rateLimit = await applyRateLimit(request, env, guardrailConfig);
  if ("allowed" in rateLimit && !rateLimit.allowed) {
    return jsonResponse(request, env, guardrailErrorBody(rateLimit), {
      status: rateLimit.status,
      headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined
    });
  }

  const providerDailyLimit = await checkProviderDailyLimit(env, provider.name, guardrailConfig);
  if ("allowed" in providerDailyLimit && !providerDailyLimit.allowed) {
    return jsonResponse(request, env, guardrailErrorBody(providerDailyLimit), {
      status: providerDailyLimit.status,
      headers: providerDailyLimit.retryAfterSeconds ? { "Retry-After": String(providerDailyLimit.retryAfterSeconds) } : undefined
    });
  }

  try {
    const candidates = await provider.search(validation.request, env);
    const providerCall = await recordProviderCall(env, provider.name, guardrailConfig);
    const response: FlightSearchResponse = {
      query: validation.request,
      generatedAt: new Date().toISOString(),
      provider: provider.name,
      cache: {
        hit: false,
        key: cacheKey,
        ttlSeconds
      },
      candidates,
      warnings: env.SEARCH_CACHE ? [] : ["Search cache is not configured."],
      guardrails: {
        ...rateLimit,
        ...providerDailyLimit,
        ...providerCall
      }
    };

    const cacheWrite = writeCachedResponse(env, cacheKey, response, ttlSeconds);
    if (cacheWrite) {
      ctx.waitUntil(cacheWrite);
    }

    return jsonResponse(request, env, response);
  } catch (error) {
    return jsonResponse(request, env, {
      error: error instanceof Error ? error.message : "Flight search failed."
    }, { status: 502 });
  }
}
