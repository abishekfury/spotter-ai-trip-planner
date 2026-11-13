from datetime import datetime, timedelta, timezone
from unittest import mock

from django.core.cache import cache
from django.test import SimpleTestCase
from rest_framework.test import APIClient

from routing_core.services import weather


def fake_forecast(start, hours=120, wind=20.0, rain=0.0, snow=0.0):
    times = [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:00") for i in range(hours)]
    return {
        "time": times, "wind": [wind] * hours, "rain": [rain] * hours,
        "snow": [snow] * hours, "temp": [50.0] * hours, "code": [0] * hours,
    }


class WeatherServiceTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.now = datetime(2026, 1, 10, 15, 30, tzinfo=timezone.utc)
        self.start = self.now.replace(hour=0, minute=0)

    def test_cache_dedupes_and_serves_repeats(self):
        coords = [(39.7392, -104.9903), (39.7401, -104.9899), (41.25, -95.93)]  # first two share a cache cell
        with mock.patch.object(weather, "_fetch_batch",
                               side_effect=lambda pts: [fake_forecast(self.start) for _ in pts]) as fetch:
            out = weather.fetch_forecasts(coords, now=self.now)
            self.assertEqual(len(out), 3)
            self.assertEqual(sum(len(c.args[0]) for c in fetch.call_args_list), 2)
            weather.fetch_forecasts(coords, now=self.now)
            self.assertEqual(fetch.call_count, 1)  # second call fully cached

    def test_window_and_eta_hour_matching(self):
        forecast = fake_forecast(self.start)
        forecast["wind"][17] = 48.0  # 17:00 UTC
        window = weather.hourly_window(forecast, self.now, 60)
        self.assertEqual(len(window["wind_mph"]), 60)
        self.assertEqual(window["wind_mph"][0], 20.0)  # 15:00 slot
        self.assertEqual(weather.weather_at(window, 2.0)["wind_speed_mph"], 48.0)
        self.assertEqual(weather.weather_at(window, 1.6)["wind_speed_mph"], 48.0)  # nearest hour
        self.assertEqual(weather.weather_at(window, 500)["wind_speed_mph"], 20.0)  # clamped

    def test_departure_outside_window_is_rejected(self):
        with self.assertRaises(ValueError):
            weather.hourly_window(fake_forecast(self.start), self.now + timedelta(days=30), 10)


class RouteApiTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        now = datetime.now(timezone.utc)
        self.start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        self.payload = {
            "origin": {"lat": 39.7392, "lng": -104.9903, "name": "Denver, CO"},
            "destination": {"lat": 41.2565, "lng": -95.9345, "name": "Omaha, NE"},
            "load_weight": 42000,
            "sample_interval_miles": 50,
        }

    def post(self, wind=48.0):
        # OSRM unavailable -> flagged synthetic routes; weather mocked with strong wind.
        with mock.patch("routing_core.services.routing._osrm_request", return_value=[]), \
             mock.patch.object(weather, "_fetch_batch",
                               side_effect=lambda pts: [fake_forecast(self.start, wind=wind) for _ in pts]):
            return self.client.post("/api/routes/", self.payload, format="json")

    def test_heavy_load_in_48mph_wind_is_unsafe(self):
        res = self.post(wind=48.0)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["routes"]), 3)
        self.assertTrue(data["all_routes_unsafe"])
        route = data["routes"][0]
        self.assertTrue(route["synthetic"])
        self.assertTrue(route["unsafe_no_travel"])
        self.assertIn("No Travel", route["warning_reason"])
        cp = route["checkpoints"][0]
        self.assertEqual(cp["distance_from_start_miles"], 0)
        self.assertEqual(cp["risk_assessment"]["base_risk"], "Severe")
        self.assertTrue(cp["risk_assessment"]["load_penalty_applied"])
        self.assertGreaterEqual(len(cp["forecast"]["wind_mph"]), 48)

    def test_calm_weather_recommends_a_route(self):
        data = self.post(wind=10.0).json()
        self.assertIsNotNone(data["best_route_id"])
        self.assertTrue(data["routes"][0]["is_best"])
        self.assertEqual(data["routes"][0]["metrics"]["low_miles"], data["routes"][0]["distance_miles"])

    def test_validation_errors(self):
        self.payload["sample_interval_miles"] = 7
        res = self.client.post("/api/routes/", self.payload, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.json())

    def test_weather_outage_returns_503_not_fake_data(self):
        with mock.patch("routing_core.services.routing._osrm_request", return_value=[]), \
             mock.patch.object(weather, "_fetch_batch", side_effect=weather.WeatherUnavailable("down")):
            res = self.client.post("/api/routes/", self.payload, format="json")
        self.assertEqual(res.status_code, 503)

    def test_health(self):
        self.assertEqual(self.client.get("/api/health/").status_code, 200)
