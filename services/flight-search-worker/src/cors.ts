import type { Env } from "./types";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:4000",
  "http://localhost:4000",
  "https://kamleshkc2002.github.io"
];

export function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin") || "";
  const allowed = getAllowedOrigins(env);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

export function jsonResponse(request: Request, env: Env, body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");

  Object.entries(corsHeaders(request, env)).forEach(([key, value]) => {
    headers.set(key, String(value));
  });

  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers
  });
}

function getAllowedOrigins(env: Env): string[] {
  if (!env.ALLOWED_ORIGINS) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  const configured = env.ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}
