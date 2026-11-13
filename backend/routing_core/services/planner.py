"""Orchestrates routing -> checkpoints -> weather -> risk -> ranking."""

import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Tuple

from .geometry import sample_checkpoints
from .recommendation import rank_and_recommend_routes
from .risk_engine import evaluate_checkpoint_risk
from .routing import get_three_routes
from .weather import fetch_forecasts, hourly_window, weather_at

SLIDER_HOURS = 48


def plan_trip(
    origin: Tuple[float, float],
    destination: Tuple[float, float],
    departure: datetime,
    load_weight_lbs: float,
    interval_miles: float,
) -> Dict[str, Any]:
    routes = get_three_routes(origin, destination)

    for route in routes:
        raw = sample_checkpoints(route["geometry"], interval_miles)
        # Distance-proportional ETA: uniform average speed over the Haversine path.
        total = route["distance_miles"] or 1.0
        for cp in raw:
            elapsed = route["duration_hours"] * (cp["distance_miles"] / total)
            cp["distance_from_start_miles"] = cp.pop("distance_miles")
            cp["elapsed_hours"] = round(elapsed, 4)
            cp["eta"] = departure + timedelta(hours=elapsed)
        route["checkpoints"] = raw

    coords = [(cp["lat"], cp["lng"]) for r in routes for cp in r["checkpoints"]]
    forecasts = iter(fetch_forecasts(coords))

    dep_hour = departure.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
    horizon = SLIDER_HOURS + math.ceil(max(r["duration_hours"] for r in routes)) + 2

    for route in routes:
        for cp in route["checkpoints"]:
            window = hourly_window(next(forecasts), dep_hour, horizon)
            offset = (cp["eta"].astimezone(timezone.utc) - dep_hour).total_seconds() / 3600.0
            weather = weather_at(window, offset)
            cp["estimated_arrival_time"] = cp.pop("eta").isoformat()
            cp["eta_offset_hours"] = round(offset, 3)
            cp["weather"] = weather
            cp["risk_assessment"] = evaluate_checkpoint_risk(
                weather["wind_speed_mph"], weather["rain_in_per_hr"],
                weather["snow_in_per_hr"], load_weight_lbs,
            )
            cp["forecast"] = window

    ranked = rank_and_recommend_routes(routes)
    recommended = next((r["id"] for r in ranked if r["is_best"]), None)
    return {
        "request_params": {
            "departure_time": departure.isoformat(),
            "departure_hour_utc": dep_hour.isoformat(),
            "load_weight_lbs": load_weight_lbs,
            "sample_interval_miles": interval_miles,
            "slider_hours": SLIDER_HOURS,
        },
        "best_route_id": recommended,
        "all_routes_unsafe": recommended is None,
        "routes": ranked,
    }
