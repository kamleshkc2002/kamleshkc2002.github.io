# Vacation Planner Flight Search Worker

Cloudflare Worker microservice for the vacation planner discovery flow. It accepts a normalized flight-search request, checks a KV cache, asks a provider adapter for candidates, and returns planner-compatible flight options.

## Local Development

```sh
cd services/flight-search-worker
npm install
npm run dev
```

The vacation planner page defaults to `http://127.0.0.1:8787` when it is running on `localhost` or `127.0.0.1`, so the local Jekyll page can call the Worker without extra configuration.

## Production Setup

1. Create a KV namespace and replace the placeholder IDs in `wrangler.toml`.
2. Keep `FLIGHT_PROVIDER = "mock"` until provider credentials are ready.
3. For Amadeus, set secrets:

```sh
wrangler secret put AMADEUS_CLIENT_ID
wrangler secret put AMADEUS_CLIENT_SECRET
```

4. Change `FLIGHT_PROVIDER` to `amadeus`.
5. Deploy:

```sh
npm run deploy
```

After deployment, set the vacation planner page's `planner-api-base` meta tag to the Worker URL.

## Guardrails

The Worker is public, so CORS is not treated as abuse protection. Cache hits return before any limit checks so repeated identical searches do not consume provider quota.

Configured defaults:

- `RATE_LIMIT_MAX_REQUESTS = "30"` uncached searches per client window.
- `RATE_LIMIT_WINDOW_SECONDS = "60"` seconds per rate-limit window.
- `PROVIDER_DAILY_CALL_LIMIT = "25"` real provider calls per UTC day.

The daily provider cap applies when `FLIGHT_PROVIDER` is not `mock`. For local tests, `ENFORCE_PROVIDER_DAILY_LIMIT_FOR_MOCK = "true"` can force the mock provider through the same daily cap path.

## API

### `GET /health`

Returns service status and active provider.

### `POST /api/search/flights`

Request:

```json
{
  "origin": "BOS",
  "destination": "LAX",
  "travelWindow": {
    "startDate": "2026-07-02",
    "endDate": "2026-07-06"
  },
  "passengers": 1,
  "budget": 450,
  "tripStyle": "weekend_plus_one",
  "rules": {
    "branch": "preferred",
    "preferSkyTeam": true,
    "excludeBasic": true,
    "maxStops": 1,
    "pmDepart": true
  }
}
```

Response candidates are shaped for the existing frontend rule engine: airline, airline type, price, stops, fare class, departure/return times, link, notes, origin, destination, and source metadata.
