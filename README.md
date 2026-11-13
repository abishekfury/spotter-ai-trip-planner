# SafeHaul: Weather-Aware Truck Routing

React + Django app that compares three routes for a truck, samples the forecast at the truck's exact arrival time at 10/25/50-mile checkpoints, applies load-weight-aware risk rules, and recommends the safest route. A 0–48 h slider re-evaluates every route and the weather heatmap instantly in the browser.

The app opens pre-filled with a demo trip (Denver, CO to Omaha, NE, 42,000 lb, 25-mile interval).

## Architecture

```
frontend/ (React 18, Vite, Tailwind, Leaflet)        backend/ (Django 5, DRF)
  App.jsx          state + data fetching               routing_core/
  utils/engine.js  client mirror of risk + ranking       views.py          thin HTTP layer
  MapComponent     imperative Leaflet layers             serializers.py    request validation
  ForecastSlider   0-48h control                         services/
                                                           routing.py        OSRM, 3 routes
        POST /api/routes/  (once per trip)                 geometry.py       Haversine, checkpoints
 ─────────────────────────────────────────►                weather.py        Open-Meteo, cache
 ◄─────────────────────────────────────────                risk_engine.py    thresholds + load rules
   routes + checkpoints + hourly forecasts                 recommendation.py segments, metrics, ranking
                                                           planner.py        orchestration
                                                           geocoding.py      place search
```

Design decisions:

- **One network call per trip.** The response carries a 48 h+ hourly forecast per checkpoint. Slider movement never touches the network; `buildScenario()` recomputes risk, segments, metrics, ranking and heatmap points locally (about 6 ms for 3 routes and ~75 checkpoints).
- **Shifted-departure model.** Slider hour *N* means "depart *N* hours later than requested". Every checkpoint ETA shifts by *N*, and the forecast slot used is `eta_offset_hours + N`. This answers "when should I leave?" rather than just showing a weather movie.
- **No fabricated data.** If Open-Meteo is unreachable the API returns `503` instead of invented weather. A route that OSRM could not provide is generated geometrically and flagged `synthetic: true` (shown in the UI).
- **Rules live in two places by necessity** (Python for the API, JS for the slider). Both are covered by the same boundary vectors in their test suites.

## APIs used

| Purpose | Provider | Notes |
|---|---|---|
| Routing | OSRM (`router.project-osrm.org`, override with `OSRM_BASE_URL`) | 3 queries run concurrently: direct + alternatives, plus north and south waypoint detours. The public demo has no SLA; self-host for production. |
| Weather | Open-Meteo hourly forecast | No key. Units requested explicitly: wind `mph`, precipitation `inch` (rain + showers in in/hr, snowfall in in/hr), `UTC` times. |
| Geocoding | Open-Meteo geocoding | 24 h cache, offline fallback list of freight hubs. |
| Basemap | OpenStreetMap tiles, darkened with a CSS filter | Respect the OSM tile usage policy for production traffic. |

Weather requests are de-duplicated and batched (40 locations per request), run concurrently in a thread pool, retried once, and cached for 30 minutes by rounded `(lat, lon, UTC date)` (0.01°, about 0.7 mi). Repeating a trip or nudging the departure time is served from cache. The default cache is process-local; use a shared Django cache backend (Redis) when running multiple workers.

## Calculation details

### Checkpoints and ETAs
- Cumulative Haversine distance is computed along the decoded route polyline.
- Checkpoints are placed at exact multiples of the chosen interval (10/25/50 mi), with the exact origin (mile 0) and destination always included. Coordinates are linearly interpolated inside the polyline segment containing the mile marker.
- `route distance` is the Haversine path length. `duration` is OSRM's duration × 1.12 (truck factor). ETA = `departure + duration × (mile / route distance)`, i.e. a uniform average speed over the same path used for distance.
- Each checkpoint's weather is the hourly slot nearest its ETA.

### Risk thresholds (half-open bands, lower bound inclusive)

| Tier | Wind (mph) | Rain (in/hr) | Snow (in/hr) |
|---|---|---|---|
| Low | < 25 | < 0.10 | < 0.5 |
| Moderate | 25 to < 35 | 0.10 to < 0.25 | 0.5 to < 1.0 |
| High | 35 to < 45 | 0.25 to < 0.50 | 1.0 to < 2.0 |
| Severe | 45 to < 55 | 0.50 to < 1.00 | 2.0 to < 3.0 |
| No Travel | ≥ 55 | ≥ 1.00 | ≥ 3.0 |

Base risk is the maximum of the three. Load rules then only ever escalate it:

- Wind ≥ 55 mph: **No Travel**, any load.
- Wind 45 to < 55 mph and load > 30,000 lb: **No Travel**.
- Wind 35 to < 45 mph and load > 40,000 lb: **Severe**.

Each checkpoint reports `base_risk`, `overall_risk`, `load_penalty_applied` and a `load_rule` explanation.

### Miles per risk tier
The stretch between two consecutive checkpoints takes the higher risk of its two endpoints (conservative). Segment lengths are exact mile differences, so `low + moderate + high + severe + no_travel` always equals the route distance.

### Recommendation
1. Routes with any No Travel miles get `unsafe_no_travel = true` and a `warning_reason`, e.g. *"Contains 25 miles of No Travel conditions: 48 mph wind with >30,000 lb load (42,000 lb): No Travel"*. They always rank behind safe routes and are never "Recommended".
2. Safe routes are ranked by: fewest Severe miles, then fewest High miles, then lowest distance-weighted average risk score (0 to 4), then shortest travel time.
3. `recommendation_reason` names the first criterion that separated the winner from the runner-up. If every route is unsafe, `best_route_id` is `null` and the UI says so.

## Setup

Prerequisites: Python 3.11+, Node 20+.

### Development (hot reload)
```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # optional; defaults work for local dev
python manage.py runserver      # http://127.0.0.1:8000

# Frontend (second terminal); Vite proxies /api to port 8000
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

### Single-server build
```bash
cd frontend && npm ci && npm run build && cd ..
cd backend && python manage.py collectstatic --noinput
gunicorn truck_routing.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 60
```
Django (via WhiteNoise) serves the built SPA and the API from one origin. `./start.sh` does the same with `runserver` for a quick local run.

### Docker
```bash
docker compose up --build       # http://localhost:8000
```

### Deploying
`render.yaml` and `Procfile` are provided. In production set `DJANGO_DEBUG=false`; the app refuses to start without `DJANGO_SECRET_KEY`.

| Variable | Purpose |
|---|---|
| `DJANGO_DEBUG` | `true` (default) for local dev, `false` in production. |
| `DJANGO_SECRET_KEY` | Required when debug is off. |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hosts. |
| `CORS_ALLOWED_ORIGINS` | Origins of a separately hosted frontend. Not needed when Django serves the SPA. |
| `CSRF_TRUSTED_ORIGINS` | Same, for CSRF-protected endpoints. |
| `OSRM_BASE_URL`, `UPSTREAM_TIMEOUT_SECONDS` | Routing provider and upstream timeout. |
| `VITE_API_BASE_URL` (frontend) | Backend origin if the frontend is hosted separately. |

See [backend/.env.example](backend/.env.example) and [frontend/.env.example](frontend/.env.example).

## Tests
```bash
cd backend && python manage.py test routing_core   # 28 tests
cd frontend && npm test                            # 5 tests (Node test runner)
```
Backend tests cover threshold boundaries (e.g. wind 24.99/25/34.99/35, rain 0.249/0.25/1.00, snow 0.99/1.0/3.0), load rules at ≤30k / 35k / 45k lb, Haversine and checkpoint interpolation (including a polyline with uneven vertex spacing), each of the four ranking tie-breakers, the weather cache, ETA-hour matching, validation, and the 503 path. Upstream calls are mocked.

## API

### `POST /api/routes/`
```json
{
  "origin": { "name": "Denver, CO", "lat": 39.7392, "lng": -104.9903 },
  "destination": { "name": "Omaha, NE", "lat": 41.2565, "lng": -95.9345 },
  "departure_time": "2026-11-13T17:00:00Z",
  "load_weight": 42000,
  "sample_interval_miles": 25
}
```
`sample_interval_miles` must be 10, 25 or 50. The departure hour must fall in today's UTC forecast window (about 4 days). Errors: `400` with `error` and `details`, `503` when weather is unavailable.

Response: `best_route_id` (nullable), `all_routes_unsafe`, `request_params`, and `routes[]` ranked best-first, each with `distance_miles`, `duration_hours`, `geometry`, `synthetic`, `metrics` (`low_miles` … `no_travel_miles`, `average_risk_score`), `segments`, `unsafe_no_travel`, `warning_reason`, `recommendation_badge`, `recommendation_reason`, and `checkpoints[]` with `distance_from_start_miles`, `estimated_arrival_time`, `eta_offset_hours`, `weather`, `risk_assessment`, `geometry_index` and the hourly `forecast` arrays used by the slider.

The payload is about 600 KB uncompressed (about 140 KB with gzip, which is enabled).

### `GET /api/geocode/?q=Denver`
Place search, up to 6 results.

### `GET /api/health/`

## Known limitations
- Wind uses 10 m sustained speed, not gusts. Heavy-load rules may be optimistic in gusty conditions.
- Snowfall comes straight from Open-Meteo's `snowfall` (snow depth per hour, converted to inches).
- OSRM is a car profile; the 1.12 factor is an approximation of truck speeds, and routes ignore truck restrictions (height, weight, hazmat).
- A segment takes the worse of its two checkpoints, so very sparse intervals (50 mi) are more conservative than dense ones.
- The slider assumes the forecast for the shifted departure uses the same trip duration.

## Walkthrough outline (5 to 8 min)
1. **Problem and stack (1 min):** weather-aware dispatch; React/Leaflet, Django services, OSRM, Open-Meteo.
2. **Demo state (1 min):** Denver to Omaha at 42,000 lb. Show the load-rules legend.
3. **Route comparison (2 min):** the Recommended badge, the risk-mile bar, `recommendation_reason`, and an unsafe route with its No Travel warning and load-rule alert.
4. **Map (1 min):** colored segments along the real road, dashed crimson No Travel, hover or click a checkpoint for mile, local ETA, wind, rain, snow, base risk and load penalty.
5. **Slider and heatmap (1.5 min):** drag 0 to 48 h, no spinners, no network calls (show the Network tab). Cards, ranking and heatmap change instantly. Toggle heatmap metrics.
6. **Code (1.5 min):** `services/` split, exact Haversine checkpoints, concurrent cached weather, `risk_engine.py` boundary tests, and the JS mirror in `utils/engine.js`.
