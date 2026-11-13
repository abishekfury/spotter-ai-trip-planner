"""
Geographic math utilities for distance, bearing, waypoint offset, and polyline sampling.
"""

import math
from typing import List, Tuple

EARTH_RADIUS_MILES = 3958.8

def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes the great-circle distance between two points on Earth in miles.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return EARTH_RADIUS_MILES * c

def calculate_initial_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates initial compass bearing in degrees (0..360) from point 1 to point 2.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)

    y = math.sin(delta_lambda) * math.cos(phi2)
    x = (math.cos(phi1) * math.sin(phi2) -
         math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda))

    bearing = math.degrees(math.atan2(y, x))
    return (bearing + 360.0) % 360.0

def destination_point(lat: float, lon: float, distance_miles: float, bearing_degrees: float) -> Tuple[float, float]:
    """
    Calculates destination point given start point, distance in miles, and bearing in degrees.
    """
    phi1 = math.radians(lat)
    lambda1 = math.radians(lon)
    theta = math.radians(bearing_degrees)
    delta = distance_miles / EARTH_RADIUS_MILES

    phi2 = math.asin(
        math.sin(phi1) * math.cos(delta) +
        math.cos(phi1) * math.sin(delta) * math.cos(theta)
    )
    lambda2 = lambda1 + math.atan2(
        math.sin(theta) * math.sin(delta) * math.cos(phi1),
        math.cos(delta) - math.sin(phi1) * math.sin(phi2)
    )

    return math.degrees(phi2), math.degrees(lambda2)

def compute_polyline_distances(coords: List[List[float]]) -> List[float]:
    """
    coords is a list of [lon, lat] pairs (GeoJSON standard).
    Returns a list of cumulative distances in miles from start for each point.
    """
    if not coords:
        return []
    
    cumulative = [0.0]
    total = 0.0
    for i in range(1, len(coords)):
        lon1, lat1 = coords[i - 1][0], coords[i - 1][1]
        lon2, lat2 = coords[i][0], coords[i][1]
        dist = haversine_miles(lat1, lon1, lat2, lon2)
        total += dist
        cumulative.append(total)
    
    return cumulative

def sample_checkpoints_along_polyline(
    coords: List[List[float]],
    interval_miles: float
) -> List[dict]:
    """
    Samples checkpoints every `interval_miles` along the polyline coordinates [[lon, lat], ...].
    Always includes the start (0 mi) and destination (end mi).
    Each sampled checkpoint contains:
    - index: int
    - lat: float
    - lng: float
    - distance_miles: float
    - segment_length_miles: float (length of the route segment represented by this checkpoint)
    """
    if not coords or len(coords) < 2:
        return []

    cumulative_dists = compute_polyline_distances(coords)
    total_distance = cumulative_dists[-1]
    
    if total_distance <= 0:
        return [{
            "index": 0,
            "lat": coords[0][1],
            "lng": coords[0][0],
            "distance_miles": 0.0,
            "segment_length_miles": 0.0,
        }]

    # Target distances for checkpoints
    target_dists = [0.0]
    curr = interval_miles
    while curr < total_distance - (interval_miles * 0.3):
        target_dists.append(curr)
        curr += interval_miles
    target_dists.append(total_distance)

    sampled = []
    coord_idx = 0
    num_coords = len(coords)

    for step_idx, target in enumerate(target_dists):
        # Find the segment in cumulative_dists that brackets target
        while coord_idx < num_coords - 2 and cumulative_dists[coord_idx + 1] < target:
            coord_idx += 1

        d1 = cumulative_dists[coord_idx]
        d2 = cumulative_dists[coord_idx + 1]
        lon1, lat1 = coords[coord_idx][0], coords[coord_idx][1]
        lon2, lat2 = coords[coord_idx + 1][0], coords[coord_idx + 1][1]

        if d2 > d1:
            fraction = (target - d1) / (d2 - d1)
            fraction = max(0.0, min(1.0, fraction))
            interp_lat = lat1 + fraction * (lat2 - lat1)
            interp_lon = lon1 + fraction * (lon2 - lon1)
        else:
            interp_lat, interp_lon = lat1, lon1

        sampled.append({
            "index": step_idx,
            "lat": round(interp_lat, 5),
            "lng": round(interp_lon, 5),
            "distance_miles": round(target, 1),
        })

    # Compute segment length attributed to each checkpoint
    # For checkpoint i, segment spans roughly midway between i-1 and i to midway between i and i+1
    for i in range(len(sampled)):
        if len(sampled) == 1:
            sampled[i]["segment_length_miles"] = round(total_distance, 1)
        elif i == 0:
            seg = (sampled[1]["distance_miles"] - sampled[0]["distance_miles"]) / 2.0
            sampled[i]["segment_length_miles"] = round(seg, 1)
        elif i == len(sampled) - 1:
            seg = (sampled[i]["distance_miles"] - sampled[i - 1]["distance_miles"]) / 2.0
            sampled[i]["segment_length_miles"] = round(seg, 1)
        else:
            prev_d = sampled[i - 1]["distance_miles"]
            next_d = sampled[i + 1]["distance_miles"]
            seg = (next_d - prev_d) / 2.0
            sampled[i]["segment_length_miles"] = round(seg, 1)

    return sampled
