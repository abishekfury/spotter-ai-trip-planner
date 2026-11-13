"""Pure geometry helpers: Haversine distance, polyline interpolation, checkpoint sampling."""

import math
from typing import Dict, List, Sequence, Tuple

EARTH_RADIUS_MILES = 3958.8
LonLat = Sequence[float]


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return EARTH_RADIUS_MILES * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))


def initial_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlam = math.radians(lon2 - lon1)
    y = math.sin(dlam) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlam)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def destination_point(lat: float, lon: float, distance_miles: float, bearing_deg: float) -> Tuple[float, float]:
    phi1, lam1 = math.radians(lat), math.radians(lon)
    theta = math.radians(bearing_deg)
    delta = distance_miles / EARTH_RADIUS_MILES
    phi2 = math.asin(math.sin(phi1) * math.cos(delta) + math.cos(phi1) * math.sin(delta) * math.cos(theta))
    lam2 = lam1 + math.atan2(
        math.sin(theta) * math.sin(delta) * math.cos(phi1),
        math.cos(delta) - math.sin(phi1) * math.sin(phi2),
    )
    return math.degrees(phi2), math.degrees(lam2)


def cumulative_distances(coords: Sequence[LonLat]) -> List[float]:
    """Cumulative Haversine miles at each vertex of a [lon, lat] polyline."""
    if not coords:
        return []
    out = [0.0]
    for (lon1, lat1), (lon2, lat2) in zip(coords, coords[1:]):
        out.append(out[-1] + haversine_miles(lat1, lon1, lat2, lon2))
    return out


def interpolate_at(coords: Sequence[LonLat], cumulative: Sequence[float], mile: float) -> Tuple[float, float, int]:
    """Return (lat, lon, vertex_index_before) at `mile` along the polyline."""
    mile = max(0.0, min(mile, cumulative[-1]))
    lo, hi = 0, len(cumulative) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if cumulative[mid] <= mile:
            lo = mid
        else:
            hi = mid
    d1, d2 = cumulative[lo], cumulative[lo + 1]
    frac = (mile - d1) / (d2 - d1) if d2 > d1 else 0.0
    lon = coords[lo][0] + frac * (coords[lo + 1][0] - coords[lo][0])
    lat = coords[lo][1] + frac * (coords[lo + 1][1] - coords[lo][1])
    return lat, lon, lo


def checkpoint_miles(total_miles: float, interval_miles: float) -> List[float]:
    """Mile markers 0, interval, 2*interval, ... plus the exact destination."""
    if total_miles <= 0 or interval_miles <= 0:
        return [0.0]
    marks = []
    i = 0
    while i * interval_miles < total_miles - 1e-9:
        marks.append(i * interval_miles)
        i += 1
    marks.append(total_miles)
    return marks


def sample_checkpoints(coords: Sequence[LonLat], interval_miles: float) -> List[Dict]:
    """
    Checkpoints at exact cumulative-Haversine intervals, including mile 0 and the
    destination. `geometry_index` is the polyline vertex preceding the checkpoint.
    """
    if len(coords) < 2:
        return []
    cumulative = cumulative_distances(coords)
    total = cumulative[-1]
    result = []
    for idx, mile in enumerate(checkpoint_miles(total, interval_miles)):
        lat, lon, vertex = interpolate_at(coords, cumulative, mile)
        result.append({
            "index": idx,
            "lat": round(lat, 5),
            "lng": round(lon, 5),
            "distance_miles": round(mile, 3),
            "geometry_index": vertex,
        })
    return result
