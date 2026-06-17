import type { Env, ProviderName } from "./types";

export interface GuardrailConfig {
  rateLimitMaxRequests: number;
  rateLimitWindowSeconds: number;
  providerDailyCallLimit: number;
}

export interface GuardrailResult {
  allowed: boolean;
  status: number;
  code: "RATE_LIMITED" | "PROVIDER_DAILY_LIMIT_REACHED" | "GUARDRAILS_UNAVAILABLE";
  message: string;
  retryAfterSeconds?: number;
  details: {
    limit?: number;
    remaining?: number;
    windowSeconds?: number;
    date?: string;
  };
}

export interface GuardrailContext {
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
}

interface CounterResult {
  key: string;
  value: number;
}

export function getGuardrailConfig(env: Env): GuardrailConfig {
  return {
    rateLimitMaxRequests: readPositiveInteger(env.RATE_LIMIT_MAX_REQUESTS, 30),
    rateLimitWindowSeconds: readPositiveInteger(env.RATE_LIMIT_WINDOW_SECONDS, 60),
    providerDailyCallLimit: readPositiveInteger(env.PROVIDER_DAILY_CALL_LIMIT, 25)
  };
}

export function shouldGuardProvider(provider: ProviderName, env: Env): boolean {
  return provider !== "mock" || env.ENFORCE_PROVIDER_DAILY_LIMIT_FOR_MOCK === "true";
}

export async function checkProviderGuardrailStore(env: Env, provider: ProviderName): Promise<GuardrailResult | null> {
  if (!shouldGuardProvider(provider, env) || env.SEARCH_CACHE) {
    return null;
  }

  return {
    allowed: false,
    status: 503,
    code: "GUARDRAILS_UNAVAILABLE",
    message: "Search is temporarily unavailable because quota guardrails are not configured.",
    details: {}
  };
}

export async function applyRateLimit(request: Request, env: Env, config: GuardrailConfig, now: Date = new Date()): Promise<GuardrailResult | GuardrailContext> {
  if (!env.SEARCH_CACHE) {
    return {
      rateLimit: {
        limit: config.rateLimitMaxRequests,
        remaining: config.rateLimitMaxRequests,
        windowSeconds: config.rateLimitWindowSeconds
      }
    };
  }

  const bucket = Math.floor(now.getTime() / (config.rateLimitWindowSeconds * 1000));
  const clientKey = await getClientKey(request);
  const counter = await incrementCounter(env, `rate:${clientKey}:${bucket}`, config.rateLimitWindowSeconds + 30);
  const remaining = Math.max(0, config.rateLimitMaxRequests - counter.value);

  if (counter.value > config.rateLimitMaxRequests) {
    return {
      allowed: false,
      status: 429,
      code: "RATE_LIMITED",
      message: "Too many uncached searches. Please wait a bit and try again.",
      retryAfterSeconds: secondsUntilNextWindow(now, config.rateLimitWindowSeconds),
      details: {
        limit: config.rateLimitMaxRequests,
        remaining: 0,
        windowSeconds: config.rateLimitWindowSeconds
      }
    };
  }

  return {
    rateLimit: {
      limit: config.rateLimitMaxRequests,
      remaining,
      windowSeconds: config.rateLimitWindowSeconds
    }
  };
}

export async function checkProviderDailyLimit(env: Env, provider: ProviderName, config: GuardrailConfig, now: Date = new Date()): Promise<GuardrailResult | GuardrailContext> {
  if (!shouldGuardProvider(provider, env)) {
    return {};
  }

  if (!env.SEARCH_CACHE) {
    return {
      allowed: false,
      status: 503,
      code: "GUARDRAILS_UNAVAILABLE",
      message: "Search is temporarily unavailable because quota guardrails are not configured.",
      details: {}
    };
  }

  const key = providerDailyCounterKey(now);
  const count = await readCounter(env, key);
  const remaining = Math.max(0, config.providerDailyCallLimit - count);
  const date = toUtcDateKey(now);

  if (count >= config.providerDailyCallLimit) {
    return {
      allowed: false,
      status: 429,
      code: "PROVIDER_DAILY_LIMIT_REACHED",
      message: "The daily flight-search quota has been reached. Please try again tomorrow.",
      retryAfterSeconds: secondsUntilUtcTomorrow(now),
      details: {
        limit: config.providerDailyCallLimit,
        remaining: 0,
        date
      }
    };
  }

  return {
    providerDailyLimit: {
      limit: config.providerDailyCallLimit,
      remaining,
      date
    }
  };
}

export async function recordProviderCall(env: Env, provider: ProviderName, config: GuardrailConfig, now: Date = new Date(), amount: number = 1): Promise<GuardrailContext> {
  if (!shouldGuardProvider(provider, env) || !env.SEARCH_CACHE) {
    return {};
  }

  const counter = await incrementCounter(env, providerDailyCounterKey(now), secondsUntilUtcTomorrow(now) + 60, amount);
  return {
    providerDailyLimit: {
      limit: config.providerDailyCallLimit,
      remaining: Math.max(0, config.providerDailyCallLimit - counter.value),
      date: toUtcDateKey(now)
    }
  };
}

export function guardrailErrorBody(result: GuardrailResult): Record<string, unknown> {
  return {
    error: result.message,
    code: result.code,
    retryAfterSeconds: result.retryAfterSeconds,
    guardrails: result.details
  };
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

async function incrementCounter(env: Env, key: string, ttlSeconds: number, amount: number = 1): Promise<CounterResult> {
  const current = await readCounter(env, key);
  const next = current + amount;
  await env.SEARCH_CACHE?.put(key, String(next), { expirationTtl: ttlSeconds });
  return { key, value: next };
}

async function readCounter(env: Env, key: string): Promise<number> {
  const raw = await env.SEARCH_CACHE?.get(key);
  const parsed = Number(raw || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

async function getClientKey(request: Request): Promise<string> {
  const forwardedFor = request.headers.get("X-Forwarded-For") || "";
  const clientIp = request.headers.get("CF-Connecting-IP") || forwardedFor.split(",")[0] || "unknown";
  return sha256(clientIp.trim() || "unknown");
}

function providerDailyCounterKey(now: Date): string {
  return `provider_calls:${toUtcDateKey(now)}`;
}

function toUtcDateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function secondsUntilNextWindow(now: Date, windowSeconds: number): number {
  const elapsed = Math.floor(now.getTime() / 1000) % windowSeconds;
  return Math.max(1, windowSeconds - elapsed);
}

function secondsUntilUtcTomorrow(now: Date): number {
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(1, Math.ceil((tomorrow.getTime() - now.getTime()) / 1000));
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}
