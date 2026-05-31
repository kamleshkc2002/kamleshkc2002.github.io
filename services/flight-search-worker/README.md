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
