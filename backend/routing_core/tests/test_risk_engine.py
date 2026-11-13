from django.test import SimpleTestCase

from routing_core.services.geometry import (
    checkpoint_miles,
    cumulative_distances,
    haversine_miles,
    sample_checkpoints,
)
from routing_core.services.recommendation import rank_and_recommend_routes
from routing_core.services.risk_engine import (
    classify_rain,
    classify_snow,
    classify_wind,
    evaluate_checkpoint_risk,
)

MILES_PER_DEGREE = 3958.8 * 3.141592653589793 / 180


class ClassificationBoundaryTests(SimpleTestCase):
    def test_wind_boundaries(self):
        cases = [(0, "Low"), (24.99, "Low"), (25, "Moderate"), (34.99, "Moderate"),
                 (35, "High"), (44.99, "High"), (45, "Severe"), (54.99, "Severe"),
                 (55, "No Travel"), (90, "No Travel")]
        for value, expected in cases:
            self.assertEqual(classify_wind(value), expected, value)

    def test_rain_boundaries(self):
        cases = [(0.099, "Low"), (0.10, "Moderate"), (0.249, "Moderate"), (0.25, "High"),
                 (0.499, "High"), (0.50, "Severe"), (0.999, "Severe"), (1.00, "No Travel")]
        for value, expected in cases:
            self.assertEqual(classify_rain(value), expected, value)

    def test_snow_boundaries(self):
        cases = [(0.49, "Low"), (0.5, "Moderate"), (0.99, "Moderate"), (1.0, "High"),
                 (1.99, "High"), (2.0, "Severe"), (2.99, "Severe"), (3.0, "No Travel")]
        for value, expected in cases:
            self.assertEqual(classify_snow(value), expected, value)

    def test_overall_is_max_of_components(self):
        r = evaluate_checkpoint_risk(10, 0.3, 0.6, 10_000)
        self.assertEqual((r["rain_risk"], r["snow_risk"], r["overall_risk"]), ("High", "Moderate", "High"))
        self.assertFalse(r["load_penalty_applied"])


class LoadRuleTests(SimpleTestCase):
    def risk(self, wind, load, rain=0, snow=0):
        return evaluate_checkpoint_risk(wind, rain, snow, load)

    def test_55_mph_is_no_travel_for_any_load(self):
        for load in (0, 30_000, 45_000):
            self.assertEqual(self.risk(55, load)["overall_risk"], "No Travel")

    def test_45_to_55_depends_on_30k(self):
        self.assertEqual(self.risk(48, 30_000)["overall_risk"], "Severe")
        self.assertEqual(self.risk(48, 30_001)["overall_risk"], "No Travel")
        self.assertEqual(self.risk(54.9, 35_000)["overall_risk"], "No Travel")
        self.assertEqual(self.risk(54.9, 45_000)["load_penalty_applied"], True)
        self.assertEqual(self.risk(45, 25_000)["overall_risk"], "Severe")

    def test_35_to_45_depends_on_40k(self):
        self.assertEqual(self.risk(40, 35_000)["overall_risk"], "High")
        self.assertEqual(self.risk(40, 40_000)["overall_risk"], "High")
        r = self.risk(44.99, 45_000)
        self.assertEqual((r["overall_risk"], r["base_risk"], r["load_penalty_applied"]), ("Severe", "High", True))
        self.assertIn(">40,000", r["load_rule"])

    def test_load_rule_never_downgrades(self):
        self.assertEqual(self.risk(40, 45_000, rain=1.2)["overall_risk"], "No Travel")

    def test_light_wind_ignores_load(self):
        r = self.risk(30, 45_000)
        self.assertEqual(r["overall_risk"], "Moderate")
        self.assertFalse(r["load_penalty_applied"])


class GeometryTests(SimpleTestCase):
    def test_haversine_known_distance(self):
        self.assertAlmostEqual(haversine_miles(0, 0, 0, 1), MILES_PER_DEGREE, places=3)
        # Denver -> Omaha great-circle distance is about 482 miles.
        self.assertAlmostEqual(haversine_miles(39.7392, -104.9903, 41.2565, -95.9345), 482, delta=5)

    def test_checkpoint_miles_include_endpoints(self):
        self.assertEqual(checkpoint_miles(100, 25), [0, 25, 50, 75, 100])
        self.assertEqual(checkpoint_miles(105, 50), [0, 50, 100, 105])
        self.assertEqual(checkpoint_miles(30, 50), [0, 30])

    def test_interpolation_is_exact_across_vertices(self):
        coords = [[0, 0], [1, 0], [2, 0]]
        cps = sample_checkpoints(coords, 50)
        total = 2 * MILES_PER_DEGREE
        self.assertEqual([c["distance_miles"] for c in cps[:3]], [0, 50, 100])
        self.assertAlmostEqual(cps[-1]["distance_miles"], total, places=2)
        self.assertEqual((cps[0]["lat"], cps[0]["lng"]), (0, 0))
        self.assertAlmostEqual(cps[1]["lng"], 50 / MILES_PER_DEGREE, places=4)
        self.assertAlmostEqual(cps[2]["lng"], 100 / MILES_PER_DEGREE, places=4)
        self.assertEqual(cps[2]["geometry_index"], 1)
        self.assertAlmostEqual(cps[-1]["lng"], 2.0, places=4)

    def test_checkpoints_use_haversine_not_vertex_count(self):
        # Many tightly spaced vertices, then one long hop: array slicing would be wrong.
        coords = [[i * 0.001, 0] for i in range(100)] + [[5.0, 0]]
        cum = cumulative_distances(coords)
        cps = sample_checkpoints(coords, 25)
        for cp in cps[:-1]:
            self.assertEqual(cp["distance_miles"] % 25, 0)
        self.assertAlmostEqual(cps[1]["lng"], 25 / MILES_PER_DEGREE, places=4)
        self.assertAlmostEqual(cps[-1]["distance_miles"], cum[-1], places=2)


def make_route(rid, name, scores, duration, distance=None):
    """Route with checkpoints every 10 miles carrying the given risk scores."""
    cps = []
    for i, s in enumerate(scores):
        cps.append({
            "index": i,
            "distance_from_start_miles": i * 10.0,
            "risk_assessment": {
                "risk_score": s,
                "overall_risk": ["Low", "Moderate", "High", "Severe", "No Travel"][s],
                "factors": ["Wind 48.00 mph (Severe)"] if s == 4 else [],
                "load_rule": "48 mph wind with >30,000 lb load (42,000 lb): No Travel" if s == 4 else None,
            },
        })
    return {"id": rid, "name": name, "distance_miles": (len(scores) - 1) * 10.0,
            "duration_hours": duration, "checkpoints": cps}


class RankingTests(SimpleTestCase):
    def test_tier_miles_sum_to_route_distance(self):
        r = rank_and_recommend_routes([make_route(1, "A", [0, 1, 2, 3, 0], 5)])[0]
        m = r["metrics"]
        total = sum(m[k] for k in ("low_miles", "moderate_miles", "high_miles", "severe_miles", "no_travel_miles"))
        self.assertEqual(total, 40)
        self.assertEqual(m["severe_miles"], 20)  # segments take the higher endpoint risk

    def test_no_travel_route_flagged_and_ranked_last(self):
        routes = [make_route(1, "Fast", [0, 4, 4, 0], 3), make_route(2, "Slow", [2, 2, 2, 2], 9)]
        ranked = rank_and_recommend_routes(routes)
        self.assertEqual([r["id"] for r in ranked], [2, 1])
        unsafe = ranked[1]
        self.assertTrue(unsafe["unsafe_no_travel"])
        self.assertEqual(unsafe["metrics"]["no_travel_miles"], 30)
        self.assertIn("Contains 30 miles of No Travel", unsafe["warning_reason"])
        self.assertIn(">30,000 lb", unsafe["warning_reason"])
        self.assertTrue(ranked[0]["is_best"])
        self.assertFalse(unsafe["is_best"])

    def test_all_unsafe_means_no_recommendation(self):
        ranked = rank_and_recommend_routes([make_route(1, "A", [4, 4], 3), make_route(2, "B", [4, 0, 4], 3)])
        self.assertFalse(any(r["is_best"] for r in ranked))
        self.assertEqual(ranked[0]["id"], 1)  # least No Travel miles first (10 vs 20)

    def test_tiebreak_1_fewest_severe(self):
        a = make_route(1, "A", [3, 3, 0, 0], 4)   # severe 20
        b = make_route(2, "B", [2, 2, 2, 2], 9)   # severe 0, high 30
        self.assertEqual(rank_and_recommend_routes([a, b])[0]["id"], 2)

    def test_tiebreak_2_fewest_high(self):
        a = make_route(1, "A", [2, 2, 2, 0], 4)   # high 30
        b = make_route(2, "B", [1, 1, 1, 2], 9)   # high 10
        ranked = rank_and_recommend_routes([a, b])
        self.assertEqual(ranked[0]["id"], 2)
        self.assertIn("High", ranked[0]["recommendation_reason"])

    def test_tiebreak_3_lowest_weighted_average(self):
        a = make_route(1, "A", [1, 1, 1, 1], 4)   # avg 1.0
        b = make_route(2, "B", [0, 0, 1, 1], 9)   # avg ~0.67
        ranked = rank_and_recommend_routes([a, b])
        self.assertEqual(ranked[0]["id"], 2)
        self.assertIn("distance-weighted", ranked[0]["recommendation_reason"])

    def test_tiebreak_4_shortest_time(self):
        a = make_route(1, "A", [0, 0, 0], 6)
        b = make_route(2, "B", [0, 0, 0], 5)
        ranked = rank_and_recommend_routes([a, b])
        self.assertEqual(ranked[0]["id"], 2)
        self.assertIn("shortest travel time", ranked[0]["recommendation_reason"])
