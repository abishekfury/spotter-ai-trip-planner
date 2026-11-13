"""
Concurrent Open-Meteo hourly forecasts with a per-(lat, lon, date) cache.

Units are requested explicitly from the API: wind in mph, precipitation in inches
(hourly rain/showers in in/hr, snowfall in in/hr), temperature in °F.
"""

import logging
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Sequence, Tuple

import httpx
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
FORECAST_DAYS = 5          # >= 48h slider window + longest trip
BATCH_SIZE = 40            # coordinates per Open-Meteo request
CACHE_PRECISION = 2        # ~0.7 mi grid: nearby checkpoints share one forecast
CACHE_TTL_SECONDS = 30 * 60
HOURLY_VARS = ["temperature_2m", "rain", "showers", "snowfall", "wind_speed_10m", "weather_code"]

WMO_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog",
    48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
    56: "Freezing drizzle", 57: "Dense freezing drizzle", 61: "Slight rain", 63: "Rain",
    65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain", 71: "Slight snow",
    73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Moderate showers",
    82: "Violent showers", 85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorm",
    96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail",
}


class WeatherUnavailable(Exception):
    """Raised when forecasts cannot be retrieved; we never fabricate weather."""


def describe_weather(code: int) -> str:
    return WMO_CODES.get(code, "Variable")


def _key(lat: float, lon: float, day: str) -> Tuple[float, float, str]:
    return round(lat, CACHE_PRECISION), round(lon, CACHE_PRECISION), day


def _cache_key(k: Tuple[float, float, str]) -> str:
    return "wx:%.2f:%.2f:%s" % k


def _num(values: Iterable[Any]) -> List[float]:
    return [float(v) if v is not None else 0.0 for v in values]


def _parse(item: Dict[str, Any]) -> Dict[str, Any]:
    h = item["hourly"]
    rain = [r + s for r, s in zip(_num(h["rain"]), _num(h["showers"]))]
    return {
        "time": h["time"],
        "wind": _num(h["wind_speed_10m"]),
        "rain": rain,
        "snow": _num(h["snowfall"]),
        "temp": _num(h["temperature_2m"]),
        "code": [int(c) if c is not None else 0 for c in h["weather_code"]],
    }


def _fetch_batch(points: Sequence[Tuple[float, float]]) -> List[Dict[str, Any]]:
    params = {
        "latitude": ",".join(f"{p[0]:.2f}" for p in points),
        "longitude": ",".join(f"{p[1]:.2f}" for p in points),
        "hourly": ",".join(HOURLY_VARS),
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "forecast_days": FORECAST_DAYS,
        "timezone": "UTC",
    }
    last_exc: Exception = RuntimeError("unreachable")
    for attempt in range(2):
        try:
            resp = httpx.get(FORECAST_URL, params=params, timeout=settings.UPSTREAM_TIMEOUT_SECONDS)
            resp.raise_for_status()
            data = resp.json()
            items = data if isinstance(data, list) else [data]
            if len(items) != len(points):
                raise ValueError("Open-Meteo returned an unexpected number of locations")
            return [_parse(i) for i in items]
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            last_exc = exc
            logger.warning("Open-Meteo batch failed (attempt %d): %s", attempt + 1, exc)
    raise WeatherUnavailable(f"Weather provider unavailable: {last_exc}")


def fetch_forecasts(coords: Sequence[Tuple[float, float]], now: datetime = None) -> List[Dict[str, Any]]:
    """
    Hourly forecasts (UTC) for each (lat, lon), in input order. Cache hits are free;
    misses are de-duplicated and fetched concurrently in batches.
    """
    day = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
    keys = [_key(lat, lon, day) for lat, lon in coords]
    unique = list(dict.fromkeys(keys))

    cached = cache.get_many([_cache_key(k) for k in unique])
    resolved: Dict[Tuple[float, float, str], Dict[str, Any]] = {
        k: cached[_cache_key(k)] for k in unique if _cache_key(k) in cached
    }
    missing = [k for k in unique if k not in resolved]

    if missing:
        batches = [missing[i:i + BATCH_SIZE] for i in range(0, len(missing), BATCH_SIZE)]
        with ThreadPoolExecutor(max_workers=min(len(batches), 6)) as pool:
            results = list(pool.map(lambda b: _fetch_batch([(k[0], k[1]) for k in b]), batches))
        fresh = {}
        for batch, parsed in zip(batches, results):
            for k, forecast in zip(batch, parsed):
                resolved[k] = forecast
                fresh[_cache_key(k)] = forecast
        cache.set_many(fresh, CACHE_TTL_SECONDS)

    return [resolved[k] for k in keys]


def hourly_window(forecast: Dict[str, Any], start: datetime, hours: int) -> Dict[str, Any]:
    """Slice a forecast to `hours` entries starting at the UTC hour containing `start`."""
    start_str = start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:00")
    times = forecast["time"]
    try:
        i = times.index(start_str)
    except ValueError:
        raise ValueError("Departure time must fall within today's forecast window (UTC today through +4 days)")
    j = min(len(times), i + hours)
    return {
        "wind_mph": [round(v, 1) for v in forecast["wind"][i:j]],
        "rain_in_per_hr": [round(v, 3) for v in forecast["rain"][i:j]],
        "snow_in_per_hr": [round(v, 3) for v in forecast["snow"][i:j]],
        "temperature_f": [round(v) for v in forecast["temp"][i:j]],
        "weather_code": forecast["code"][i:j],
    }


def weather_at(window: Dict[str, Any], hour_offset: float) -> Dict[str, Any]:
    """Weather for the hourly slot nearest `hour_offset` hours after the window start."""
    n = len(window["wind_mph"])
    i = max(0, min(n - 1, int(math.floor(hour_offset + 0.5))))
    code = window["weather_code"][i]
    return {
        "temperature_f": window["temperature_f"][i],
        "wind_speed_mph": window["wind_mph"][i],
        "rain_in_per_hr": window["rain_in_per_hr"][i],
        "snow_in_per_hr": window["snow_in_per_hr"][i],
        "condition": describe_weather(code),
        "weather_code": code,
        "forecast_hour_index": i,
    }
