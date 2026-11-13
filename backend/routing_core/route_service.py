"""
Route service responsible for fetching and generating 3 distinct route options,
sampling checkpoints every 10 / 25 / 50 miles, computing ETAs, and building corridor grids.
"""

import math
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Tuple
import requests

from .geo_utils import (
    haversine_miles,
    calculate_initial_bearing,
    destination_point,
    sample_checkpoints_along_polyline,
    compute_polyline_distances,
)

logger = logging.getLogger(__name__)

OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving"

def fetch_osrm_route(coords: List[Tuple[float, float]], alternatives: bool = True) -> List[Dict[str, Any]]:
    """
    Calls OSRM routing API.
    coords is a list of (lat, lon).
    Returns list of route objects with geometry, distance_meters, duration_seconds.
    """
    # OSRM expects lon,lat;lon,lat;...
    coord_str = ";".join([f"{c[1]:.5f},{c[0]:.5f}" for c in coords])
    url = f"{OSRM_BASE_URL}/{coord_str}"
    params = {
        "overview": "full",
        "geometries": "geojson",
        "steps": "false",
        "alternatives": "true" if alternatives else "false",
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            routes = data.get("routes", [])
            out = []
            for r in routes:
                geom = r.get("geometry", {})
                coords_list = geom.get("coordinates", [])
                if coords_list:
                    out.append({
                        "geometry": coords_list, # [[lon, lat], ...]
                        "distance_meters": r.get("distance", 0.0),
                        "duration_seconds": r.get("duration", 0.0),
                    })
            return out
    except Exception as e:
        logger.warning(f"OSRM request failed: {e}")

    return []

def generate_synthetic_corridor_route(
    origin: Tuple[float, float],
    dest: Tuple[float, float],
    offset_fraction: float,
    route_index: int,
) -> Dict[str, Any]:
    """
    Generates a realistic curved highway polyline with waypoint detours
    when external routing needs an alternative or fails.
    """
    lat1, lon1 = origin
    lat2, lon2 = dest
    direct_dist = haversine_miles(lat1, lon1, lat2, lon2)
    bearing = calculate_initial_bearing(lat1, lon1, lat2, lon2)

    # Number of intermediate highway waypoints
    num_steps = max(20, int(direct_dist / 15.0))
    coords = []
    
    # Calculate lateral offset perpendicular to bearing
    perp_bearing = (bearing + 90.0) % 360.0
    max_lateral_miles = direct_dist * offset_fraction

    for i in range(num_steps + 1):
        frac = i / float(num_steps)
        # Point along direct line
        along_dist = direct_dist * frac
        base_lat, base_lon = destination_point(lat1, lon1, along_dist, bearing)

        # Smooth parabolic lateral displacement
        displacement = math.sin(frac * math.pi) * max_lateral_miles
        
        # Add slight natural curvature
        noise = math.sin(frac * math.pi * 3.0) * (max_lateral_miles * 0.15)
        total_disp = displacement + noise

        if total_disp >= 0:
            pt_lat, pt_lon = destination_point(base_lat, base_lon, total_disp, perp_bearing)
        else:
            pt_lat, pt_lon = destination_point(base_lat, base_lon, abs(total_disp), (perp_bearing + 180.0) % 360.0)

        coords.append([round(pt_lon, 5), round(pt_lat, 5)])

    # Ensure exact endpoints
    coords[0] = [round(lon1, 5), round(lat1, 5)]
    coords[-1] = [round(lon2, 5), round(lat2, 5)]

    dist_cum = compute_polyline_distances(coords)
    total_dist_miles = dist_cum[-1] if dist_cum else direct_dist
    # Commercial truck average speed ~ 55 mph
    duration_hours = max(0.5, total_dist_miles / 55.0)

    return {
        "geometry": coords,
        "distance_meters": total_dist_miles * 1609.344,
        "duration_seconds": duration_hours * 3600.0,
    }

def get_three_routes(
    origin: Tuple[float, float],
    dest: Tuple[float, float],
) -> List[Dict[str, Any]]:
    """
    Obtains 3 distinct route geometries:
    1. Primary Highway route
    2. Northern / Divergent route
    3. Southern / Alternate route
    """
    routes = []

    # 1. Try querying OSRM for direct routes
    osrm_routes = fetch_osrm_route([origin, dest], alternatives=True)
    for r in osrm_routes:
        routes.append(r)
        if len(routes) == 3:
            break

    # 2. If we need more routes to reach 3, query via intermediate waypoint offsets
    direct_dist = haversine_miles(origin[0], origin[1], dest[0], dest[1])
    bearing = calculate_initial_bearing(origin[0], origin[1], dest[0], dest[1])
    mid_lat, mid_lon = destination_point(origin[0], origin[1], direct_dist * 0.5, bearing)

    # Offsets of ~12% and -12% lateral distance
    offset_dist = max(25.0, direct_dist * 0.15)
    waypoint_north = destination_point(mid_lat, mid_lon, offset_dist, (bearing + 90.0) % 360.0)
    waypoint_south = destination_point(mid_lat, mid_lon, offset_dist, (bearing - 90.0) % 360.0)

    if len(routes) < 2:
        wp_routes = fetch_osrm_route([origin, waypoint_north, dest], alternatives=False)
        if wp_routes:
            routes.append(wp_routes[0])

    if len(routes) < 3:
        wp_routes = fetch_osrm_route([origin, waypoint_south, dest], alternatives=False)
        if wp_routes:
            routes.append(wp_routes[0])

    # 3. Fallback to synthetic highway routes if still fewer than 3
    fallback_fractions = [0.0, 0.16, -0.16]
    while len(routes) < 3:
        frac = fallback_fractions[len(routes)]
        routes.append(generate_synthetic_corridor_route(origin, dest, frac, len(routes) + 1))

    # Assign clear descriptive route names
    route_names = [
        "Primary Interstate Corridor",
        "Northern Highway Alternate",
        "Southern Valley Bypass",
    ]

    named_routes = []
    for idx, r in enumerate(routes[:3]):
        coords = r["geometry"]
        dist_cum = compute_polyline_distances(coords)
        total_dist_miles = round(dist_cum[-1], 1) if dist_cum else round(r["distance_meters"] / 1609.344, 1)
        
        # Duration: use OSRM duration, adjusted for truck speed (commercial truck speed ~ 55-60 mph)
        raw_hours = r["duration_seconds"] / 3600.0
        truck_hours = round(max(raw_hours * 1.12, total_dist_miles / 58.0), 2)

        named_routes.append({
            "id": idx + 1,
            "name": route_names[idx],
            "distance_miles": total_dist_miles,
            "duration_hours": truck_hours,
            "geometry": coords,
        })

    return named_routes

def sample_route_checkpoints(
    route: Dict[str, Any],
    departure_time: datetime,
    interval_miles: float,
) -> List[Dict[str, Any]]:
    """
    Samples checkpoints along the route at the given interval (10, 25, or 50 miles)
    and computes the estimated arrival time (ETA) for each checkpoint.
    """
    raw_checkpoints = sample_checkpoints_along_polyline(route["geometry"], interval_miles)
    total_distance = route["distance_miles"]
    total_duration_hours = route["duration_hours"]

    checkpoints = []
    for cp in raw_checkpoints:
        d = cp["distance_miles"]
        # Truck ETA based on progress along route
        progress = d / total_distance if total_distance > 0 else 0.0
        elapsed_hours = progress * total_duration_hours
        eta = departure_time + timedelta(hours=elapsed_hours)

        checkpoints.append({
            "index": cp["index"],
            "lat": cp["lat"],
            "lng": cp["lng"],
            "distance_from_start_miles": d,
            "segment_length_miles": cp["segment_length_miles"],
            "estimated_arrival_time": eta.isoformat(),
            "eta_datetime": eta,
        })

    return checkpoints

def compute_corridor_grid(routes: List[Dict[str, Any]], num_grid_points: int = 24) -> List[Tuple[float, float]]:
    """
    Generates a spaced grid of coordinate points spanning the corridor bounding box of all 3 routes.
    Used for pre-computing the 0–48 hour weather heatmap.
    """
    all_lats = []
    all_lons = []
    for r in routes:
        for lon, lat in r["geometry"]:
            all_lats.append(lat)
            all_lons.append(lon)

    min_lat = min(all_lats) - 0.35
    max_lat = max(all_lats) + 0.35
    min_lon = min(all_lons) - 0.45
    max_lon = max(all_lons) + 0.45

    # Grid dimensions (e.g. 5 x 5 or 6 x 4)
    rows = 5
    cols = 5
    grid = []

    for r in range(rows):
        lat = min_lat + (max_lat - min_lat) * (r / float(rows - 1)) if rows > 1 else min_lat
        for c in range(cols):
            lon = min_lon + (max_lon - min_lon) * (c / float(cols - 1)) if cols > 1 else min_lon
            grid.append((round(lat, 4), round(lon, 4)))

    return grid
