from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from datetime import datetime, timezone

from .risk_engine import evaluate_checkpoint_risk, classify_wind, classify_rain, classify_snow
from .recommendation import rank_and_recommend_routes

class RiskEngineTestCase(TestCase):
    def test_wind_classification(self):
        self.assertEqual(classify_wind(15.0), "Low")
        self.assertEqual(classify_wind(25.0), "Moderate")
        self.assertEqual(classify_wind(34.0), "Moderate")
        self.assertEqual(classify_wind(35.0), "High")
        self.assertEqual(classify_wind(44.0), "High")
        self.assertEqual(classify_wind(45.0), "Severe")
        self.assertEqual(classify_wind(54.0), "Severe")
        self.assertEqual(classify_wind(55.0), "No Travel")
        self.assertEqual(classify_wind(70.0), "No Travel")

    def test_rain_classification(self):
        self.assertEqual(classify_rain(0.05), "Low")
        self.assertEqual(classify_rain(0.10), "Moderate")
        self.assertEqual(classify_rain(0.25), "Moderate")
        self.assertEqual(classify_rain(0.35), "High")
        self.assertEqual(classify_rain(0.50), "High")
        self.assertEqual(classify_rain(0.75), "Severe")
        self.assertEqual(classify_rain(1.00), "Severe")
        self.assertEqual(classify_rain(1.20), "No Travel")

    def test_snow_classification(self):
        self.assertEqual(classify_snow(0.2), "Low")
        self.assertEqual(classify_snow(0.5), "Moderate")
        self.assertEqual(classify_snow(1.0), "Moderate")
        self.assertEqual(classify_snow(1.5), "High")
        self.assertEqual(classify_snow(2.0), "High")
        self.assertEqual(classify_snow(2.5), "Severe")
        self.assertEqual(classify_snow(3.0), "Severe")
        self.assertEqual(classify_snow(3.5), "No Travel")

    def test_load_rules_severe_and_no_travel(self):
        # 1. Wind >= 55 -> No Travel for any load
        res1 = evaluate_checkpoint_risk(58.0, 0.0, 0.0, 15000.0)
        self.assertEqual(res1["overall_risk"], "No Travel")

        # 2. Wind 45-54 mph + load > 30,000 lb -> No Travel
        res2_light = evaluate_checkpoint_risk(48.0, 0.0, 0.0, 28000.0)
        self.assertEqual(res2_light["overall_risk"], "Severe")
        res2_heavy = evaluate_checkpoint_risk(48.0, 0.0, 0.0, 32000.0)
        self.assertEqual(res2_heavy["overall_risk"], "No Travel")

        # 3. Wind 35-44 mph + load > 40,000 lb -> Severe
        res3_light = evaluate_checkpoint_risk(40.0, 0.0, 0.0, 35000.0)
        self.assertEqual(res3_light["overall_risk"], "High")
        res3_heavy = evaluate_checkpoint_risk(40.0, 0.0, 0.0, 42000.0)
        self.assertEqual(res3_heavy["overall_risk"], "Severe")

class RouteRecommendationTestCase(TestCase):
    def test_recommendation_order(self):
        mock_routes = [
            {
                "id": 1,
                "name": "Route 1 - High Risk",
                "distance_miles": 300.0,
                "duration_hours": 5.0,
                "checkpoints": [
                    {"segment_length_miles": 150.0, "risk_assessment": {"overall_risk": "High", "risk_score": 2}},
                    {"segment_length_miles": 150.0, "risk_assessment": {"overall_risk": "Severe", "risk_score": 3}},
                ]
            },
            {
                "id": 2,
                "name": "Route 2 - Safe Route",
                "distance_miles": 320.0,
                "duration_hours": 5.5,
                "checkpoints": [
                    {"segment_length_miles": 200.0, "risk_assessment": {"overall_risk": "Low", "risk_score": 0}},
                    {"segment_length_miles": 120.0, "risk_assessment": {"overall_risk": "Moderate", "risk_score": 1}},
                ]
            },
            {
                "id": 3,
                "name": "Route 3 - Dangerous Route",
                "distance_miles": 290.0,
                "duration_hours": 4.8,
                "checkpoints": [
                    {"segment_length_miles": 200.0, "risk_assessment": {"overall_risk": "No Travel", "risk_score": 4}},
                    {"segment_length_miles": 90.0, "risk_assessment": {"overall_risk": "Severe", "risk_score": 3}},
                ]
            }
        ]

        ranked = rank_and_recommend_routes(mock_routes)
        self.assertEqual(ranked[0]["id"], 2, "Safe route with 0 severe and 0 no travel should be #1")
        self.assertEqual(ranked[0]["recommendation_badge"], "RECOMMENDED")
        self.assertEqual(ranked[1]["id"], 1, "Route 1 should be #2")
        self.assertEqual(ranked[2]["id"], 3, "Route with No Travel should be #3 (last)")

class APITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_check(self):
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get("status"), "healthy")

    def test_geocode_fallback(self):
        response = self.client.get('/api/geocode/?q=Chicago')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) > 0)
        self.assertIn("Chicago", response.data[0]["display_name"])

    def test_calculate_routes(self):
        payload = {
            "origin": {"lat": 41.8781, "lng": -87.6298, "name": "Chicago, IL"},
            "destination": {"lat": 39.7392, "lng": -104.9903, "name": "Denver, CO"},
            "departure_time": datetime.now(timezone.utc).isoformat(),
            "load_weight": 42000,
            "sample_interval_miles": 50
        }
        response = self.client.post('/api/routes/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["routes"]), 3)
        self.assertIn("corridor_heatmap", response.data)
        self.assertIn("best_route_id", response.data)

        # Verify checkpoints have ETAs and weather
        for r in response.data["routes"]:
            self.assertTrue(len(r["checkpoints"]) > 2)
            cp0 = r["checkpoints"][0]
            self.assertIn("estimated_arrival_time", cp0)
            self.assertIn("weather", cp0)
            self.assertIn("risk_assessment", cp0)
            self.assertIn("wind_mph", cp0["risk_assessment"])
            self.assertIn("overall_risk", cp0["risk_assessment"])
