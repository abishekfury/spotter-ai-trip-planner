"""
API views for geocoding, route generation, weather sampling, risk assessment, and corridor heatmap.
"""

import logging
from datetime import datetime, timezone
import requests
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .risk_engine import evaluate_checkpoint_risk
from .route_service import (
    get_three_routes,
    sample_route_checkpoints,
    compute_corridor_grid,
)
from .weather_service import (
    fetch_open_meteo_forecasts,
    extract_weather_at_eta,
    generate_corridor_heatmap_data,
)
from .recommendation import rank_and_recommend_routes

logger = logging.getLogger(__name__)

# Fallback hubs for instant offline testing and resilient geocoding
POPULAR_HUBS = [
    {"name": "Chicago", "admin1": "Illinois", "country": "United States", "latitude": 41.8781, "longitude": -87.6298},
    {"name": "Denver", "admin1": "Colorado", "country": "United States", "latitude": 39.7392, "longitude": -104.9903},
    {"name": "Dallas", "admin1": "Texas", "country": "United States", "latitude": 32.7767, "longitude": -96.7970},
    {"name": "Atlanta", "admin1": "Georgia", "country": "United States", "latitude": 33.7490, "longitude": -84.3880},
    {"name": "New York", "admin1": "New York", "country": "United States", "latitude": 40.7128, "longitude": -74.0060},
    {"name": "Los Angeles", "admin1": "California", "country": "United States", "latitude": 34.0522, "longitude": -118.2437},
    {"name": "Seattle", "admin1": "Washington", "country": "United States", "latitude": 47.6062, "longitude": -122.3321},
    {"name": "Minneapolis", "admin1": "Minnesota", "country": "United States", "latitude": 44.9778, "longitude": -93.2650},
    {"name": "Kansas City", "admin1": "Missouri", "country": "United States", "latitude": 39.0997, "longitude": -94.5786},
    {"name": "Salt Lake City", "admin1": "Utah", "country": "United States", "latitude": 40.7608, "longitude": -111.8910},
    {"name": "Nashville", "admin1": "Tennessee", "country": "United States", "latitude": 36.1627, "longitude": -86.7816},
    {"name": "Indianapolis", "admin1": "Indiana", "country": "United States", "latitude": 39.7684, "longitude": -86.1581},
]

class HealthCheckView(APIView):
    def get(self, request):
        return Response({
            "status": "healthy",
            "service": "Weather-Aware Truck Routing API",
            "version": "1.0.0",
        })

class GeocodeView(APIView):
    """
    Search places and freight hubs using Open-Meteo Geocoding API with fallback.
    """
    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if not query or len(query) < 2:
            return Response([])

        results = []
        try:
            url = f"https://geocoding-api.open-meteo.com/v1/search?name={query}&count=6&language=en&format=json"
            resp = requests.get(url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("results", []):
                    results.append({
                        "name": item.get("name"),
                        "admin1": item.get("admin1", ""),
                        "country": item.get("country", ""),
                        "latitude": round(item.get("latitude"), 4),
                        "longitude": round(item.get("longitude"), 4),
                        "display_name": f"{item.get('name')}, {item.get('admin1', '')} {item.get('country', '')}".strip(", "),
                    })
        except Exception as e:
            logger.warning(f"Geocoding request failed: {e}")

        # Fallback local search if no results
        if not results:
            q_lower = query.lower()
            for hub in POPULAR_HUBS:
                if q_lower in hub["name"].lower() or q_lower in hub["admin1"].lower():
                    results.append({
                        "name": hub["name"],
                        "admin1": hub["admin1"],
                        "country": hub["country"],
                        "latitude": hub["latitude"],
                        "longitude": hub["longitude"],
                        "display_name": f"{hub['name']}, {hub['admin1']} {hub['country']}",
                    })

        return Response(results)

class RouteCalculationView(APIView):
    """
    Main endpoint:
    Calculates 3 route options, samples checkpoints at 10/25/50 miles with ETA,
    fetches weather along the route and corridor, computes weather risk with load rules,
    recommends the best route, and prepares 0–48h corridor heatmap data.
    """
    def post(self, request):
        data = request.data
        origin = data.get("origin")
        destination = data.get("destination")
        dep_str = data.get("departure_time")
        load_weight = float(data.get("load_weight", 35000))
        interval_miles = float(data.get("sample_interval_miles", 25))

        if not origin or not destination:
            return Response(
                {"error": "Both origin and destination coordinates are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        orig_lat = float(origin.get("lat", origin.get("latitude", 41.8781)))
        orig_lng = float(origin.get("lng", origin.get("longitude", -87.6298)))
        dest_lat = float(destination.get("lat", destination.get("latitude", 39.7392)))
        dest_lng = float(destination.get("lng", destination.get("longitude", -104.9903)))

        # Validate interval
        if interval_miles not in [10, 25, 50]:
            interval_miles = 25.0

        # Parse departure time
        if dep_str:
            try:
                departure_time = datetime.fromisoformat(dep_str.replace("Z", "+00:00"))
            except Exception:
                departure_time = datetime.now(timezone.utc)
        else:
            departure_time = datetime.now(timezone.utc)

        # 1. Generate 3 routes
        routes = get_three_routes((orig_lat, orig_lng), (dest_lat, dest_lng))

        # 2. Sample checkpoints for each route
        all_checkpoints_flat = []
        for r in routes:
            cps = sample_route_checkpoints(r, departure_time, interval_miles)
            r["checkpoints"] = cps
            all_checkpoints_flat.extend(cps)

        # 3. Create corridor grid points for 0-48h heatmap
        corridor_grid_coords = compute_corridor_grid(routes)

        # 4. Batch query Open-Meteo for checkpoint coordinates + corridor grid
        cp_coords = [(cp["lat"], cp["lng"]) for cp in all_checkpoints_flat]
        all_query_coords = cp_coords + corridor_grid_coords
        
        forecasts = fetch_open_meteo_forecasts(all_query_coords, forecast_days=3)

        cp_forecasts = forecasts[: len(cp_coords)]
        corridor_forecasts = forecasts[len(cp_coords) :]

        # 5. Populate weather and evaluate risk for each checkpoint
        forecast_idx = 0
        for r in routes:
            for cp in r["checkpoints"]:
                fc = cp_forecasts[forecast_idx] if forecast_idx < len(cp_forecasts) else {}
                weather = extract_weather_at_eta(fc, cp["eta_datetime"])
                risk_eval = evaluate_checkpoint_risk(
                    weather["wind_speed_mph"],
                    weather["rain_in_per_hr"],
                    weather["snow_in_per_hr"],
                    load_weight,
                )

                cp["weather"] = weather
                cp["risk_assessment"] = risk_eval
                # Clean up non-serializable datetime
                cp.pop("eta_datetime", None)
                forecast_idx += 1

        # 6. Rank and recommend routes according to preferences
        ranked_routes = rank_and_recommend_routes(routes)
        best_route = ranked_routes[0]

        # 7. Generate 0–48h corridor heatmap data
        heatmap_data = generate_corridor_heatmap_data(
            corridor_grid_coords,
            corridor_forecasts,
            departure_time,
            load_weight,
            max_forecast_hours=48,
        )

        return Response({
            "request_params": {
                "origin": origin,
                "destination": destination,
                "departure_time": departure_time.isoformat(),
                "load_weight_lbs": load_weight,
                "sample_interval_miles": interval_miles,
            },
            "best_route_id": best_route["id"],
            "routes": ranked_routes,
            "corridor_heatmap": heatmap_data,
        })
