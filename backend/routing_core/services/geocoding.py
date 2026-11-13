"""Place search via Open-Meteo geocoding with a small offline fallback of freight hubs."""

import hashlib
import logging
from typing import Any, Dict, List

import httpx
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"

_HUBS = [
    ("Denver", "Colorado", 39.7392, -104.9903), ("Omaha", "Nebraska", 41.2565, -95.9345),
    ("Chicago", "Illinois", 41.8781, -87.6298), ("Dallas", "Texas", 32.7767, -96.7970),
    ("Atlanta", "Georgia", 33.7490, -84.3880), ("New York", "New York", 40.7128, -74.0060),
    ("Los Angeles", "California", 34.0522, -118.2437), ("Seattle", "Washington", 47.6062, -122.3321),
    ("Minneapolis", "Minnesota", 44.9778, -93.2650), ("Kansas City", "Missouri", 39.0997, -94.5786),
    ("Salt Lake City", "Utah", 40.7608, -111.8910), ("Nashville", "Tennessee", 36.1627, -86.7816),
    ("Indianapolis", "Indiana", 39.7684, -86.1581), ("Cheyenne", "Wyoming", 41.1400, -104.8202),
    ("Des Moines", "Iowa", 41.5868, -93.6250), ("Wichita", "Kansas", 37.6872, -97.3301),
]
FALLBACK_HUBS = [
    {"name": n, "admin1": a, "country": "United States", "latitude": lat, "longitude": lon,
     "display_name": f"{n}, {a}, United States"}
    for n, a, lat, lon in _HUBS
]


def search_places(query: str) -> List[Dict[str, Any]]:
    query = query.strip()
    if len(query) < 2:
        return []
    key = "geo:" + hashlib.md5(query.lower().encode()).hexdigest()
    hit = cache.get(key)
    if hit is not None:
        return hit

    results: List[Dict[str, Any]] = []
    try:
        resp = httpx.get(
            GEOCODE_URL,
            params={"name": query, "count": 6, "language": "en", "format": "json"},
            timeout=settings.UPSTREAM_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        for item in resp.json().get("results", []):
            admin = item.get("admin1", "")
            results.append({
                "name": item["name"], "admin1": admin, "country": item.get("country", ""),
                "latitude": round(item["latitude"], 4), "longitude": round(item["longitude"], 4),
                "display_name": ", ".join(p for p in (item["name"], admin, item.get("country", "")) if p),
            })
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        logger.warning("Geocoding failed: %s", exc)

    if not results:
        q = query.lower()
        return [h for h in FALLBACK_HUBS if q in h["name"].lower() or q in h["admin1"].lower()]
    cache.set(key, results, 24 * 3600)
    return results
