"""
Routing via OSRM (public demo server by default; override with OSRM_BASE_URL).

Routes synthesized because OSRM could not provide enough alternatives are explicitly
marked `"synthetic": True` so the UI never presents them as real roads.
"""

import logging
import math
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Tuple

import httpx
from django.conf import settings

from .geometry import (
    cumulative_distances,
    destination_point,
    haversine_miles,
    initial_bearing,
)

logger = logging.getLogger(__name__)

LatLng = Tuple[float, float]
# OSRM models cars; trucks are slower on grades and under speed governors.
TRUCK_TIME_FACTOR = 1.12
SYNTHETIC_TRUCK_MPH = 55.0

ROUTE_NAMES = ["Primary Corridor", "Northern Alternate", "Southern Alternate"]


def _osrm_request(points: List[LatLng], alternatives: bool) -> List[Dict[str, Any]]:
    coord_str = ";".join(f"{lng:.5f},{lat:.5f}" for lat, lng in points)
    url = f"{settings.OSRM_BASE_URL}/route/v1/driving/{coord_str}"
    params = {"overview": "full", "geometries": "geojson", "steps": "false",
              "alternatives": "true" if alternatives else "false"}
    try:
        resp = httpx.get(url, params=params, timeout=settings.UPSTREAM_TIMEOUT_SECONDS)
        resp.raise_for_status()
        return [
            {"geometry": r["geometry"]["coordinates"], "duration_seconds": r.get("duration", 0.0)}
            for r in resp.json().get("routes", [])
            if r.get("geometry", {}).get("coordinates")
        ]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        logger.warning("OSRM request failed: %s", exc)
        return []


def _synthetic_route(origin: LatLng, dest: LatLng, offset_fraction: float) -> Dict[str, Any]:
    direct = haversine_miles(*origin, *dest)
    bearing = initial_bearing(*origin, *dest)
    steps = max(20, int(direct / 15.0))
    max_lateral = direct * offset_fraction
    coords = []
    for i in range(steps + 1):
        frac = i / steps
        base = destination_point(*origin, direct * frac, bearing)
        lateral = math.sin(frac * math.pi) * max_lateral
        side = (bearing + 90.0) % 360.0 if lateral >= 0 else (bearing - 90.0) % 360.0
        lat, lon = destination_point(base[0], base[1], abs(lateral), side)
        coords.append([round(lon, 5), round(lat, 5)])
    coords[0] = [round(origin[1], 5), round(origin[0], 5)]
    coords[-1] = [round(dest[1], 5), round(dest[0], 5)]
    miles = cumulative_distances(coords)[-1]
    return {"geometry": coords, "duration_seconds": miles / SYNTHETIC_TRUCK_MPH * 3600.0, "synthetic": True}


def _signature(route: Dict[str, Any]) -> Tuple[int, int]:
    return len(route["geometry"]), round(route["duration_seconds"] / 60)


def get_three_routes(origin: LatLng, dest: LatLng) -> List[Dict[str, Any]]:
    """Return exactly three routes with Haversine distance and truck-adjusted duration."""
    direct = haversine_miles(*origin, *dest)
    bearing = initial_bearing(*origin, *dest)
    mid = destination_point(*origin, direct * 0.5, bearing)
    offset = max(25.0, direct * 0.15)
    north = destination_point(mid[0], mid[1], offset, (bearing - 90.0) % 360.0)
    south = destination_point(mid[0], mid[1], offset, (bearing + 90.0) % 360.0)

    # The three OSRM queries are independent, so run them concurrently.
    with ThreadPoolExecutor(max_workers=3) as pool:
        f_direct = pool.submit(_osrm_request, [origin, dest], True)
        f_north = pool.submit(_osrm_request, [origin, north, dest], False)
        f_south = pool.submit(_osrm_request, [origin, south, dest], False)
        direct_routes, north_routes, south_routes = f_direct.result(), f_north.result(), f_south.result()

    routes: List[Dict[str, Any]] = direct_routes[:1]
    seen = {_signature(r) for r in routes}
    # Genuine OSRM alternatives first, then waypoint-forced detours, de-duplicated by shape.
    for candidate in direct_routes[1:] + north_routes[:1] + south_routes[:1]:
        if len(routes) == 3:
            break
        if _signature(candidate) not in seen:
            seen.add(_signature(candidate))
            routes.append(candidate)

    fallback_offsets = [0.0, -0.16, 0.16]
    while len(routes) < 3:
        routes.append(_synthetic_route(origin, dest, fallback_offsets[len(routes)]))

    result = []
    for idx, r in enumerate(routes[:3]):
        miles = cumulative_distances(r["geometry"])[-1]
        synthetic = r.get("synthetic", False)
        hours = r["duration_seconds"] / 3600.0 * (1.0 if synthetic else TRUCK_TIME_FACTOR)
        result.append({
            "id": idx + 1,
            "name": ROUTE_NAMES[idx],
            "distance_miles": round(miles, 2),
            "duration_hours": round(max(hours, miles / 70.0), 3),
            "geometry": r["geometry"],
            "synthetic": synthetic,
        })
    return result
