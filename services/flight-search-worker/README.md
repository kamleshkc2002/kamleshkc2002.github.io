# Vacation Planner Flight Search Worker

Cloudflare Worker microservice for the vacation planner discovery flow. It accepts a normalized flight-search request, checks a KV cache, asks a provider adapter for candidates, and returns planner-compatible flight options.

## Local Development

```sh
cd services/flight-search-worker
npm install
npm run dev
```

The vacation planner page defaults to `http://127.0.0.1:8787` when it is running on `localhost` or `127.0.0.1`, so the local Astro page can call the Worker without extra configuration.

### Local SerpApi Smoke Test

To test the SerpApi provider locally without committing secrets:

```sh
cd services/flight-search-worker
cp .dev.vars.example .dev.vars
# Edit .dev.vars and set SERPAPI_API_KEY.
npm run dev:serpapi
```

Then call the Worker:

```sh
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/api/search/flights \
  -H "Content-Type: application/json" \
  --data '{"origin":"BOS","destination":"LAX","travelWindow":{"startDate":"2026-07-02","endDate":"2026-07-06"},"passengers":1,"rules":{"maxStops":1}}'
```

The `.dev.vars` file is ignored by git. Use this flow to verify response shape and quota behavior before deploying provider changes.

## Production Setup

1. Create a KV namespace and replace the placeholder IDs in `wrangler.toml`.
2. Keep provider credentials in Worker secrets, not code.
3. For SerpApi Google Flights, set the API key as a secret:

```sh
wrangler secret put SERPAPI_API_KEY
```

4. For temporary Amadeus experiments, set secrets:

```sh
wrangler secret put AMADEUS_CLIENT_ID
wrangler secret put AMADEUS_CLIENT_SECRET
```

5. `FLIGHT_PROVIDER` is set to `serpapi` for production discovery searches.
6. Deploy:

```sh
npm run deploy
```

After deployment, set the vacation planner page's `planner-api-base` meta tag to the Worker URL.

## Guardrails

The Worker is public, so CORS is not treated as abuse protection. Cache hits return before any limit checks so repeated identical searches do not consume provider quota.

Configured defaults:

- `RATE_LIMIT_MAX_REQUESTS = "10"` uncached searches per client window.
- `RATE_LIMIT_WINDOW_SECONDS = "60"` seconds per rate-limit window.
- `PROVIDER_DAILY_CALL_LIMIT = "10"` real provider calls per UTC day.

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

The initial SerpApi Google Flights adapter is a discovery spike. It normalizes the first search result set into planner candidates; round-trip return selection may need a later `departure_token` follow-up flow before production activation.
