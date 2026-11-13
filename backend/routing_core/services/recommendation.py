"""
Per-route risk metrics and 4-tier route ranking.

Segment model: the stretch between two consecutive checkpoints takes the higher
risk of its two endpoints (conservative). Segment lengths are exact differences of
cumulative Haversine miles, so tier miles always sum to the route distance.

Ranking of routes without No Travel miles (safe routes):
  1. fewest Severe miles  2. fewest High miles
  3. lowest distance-weighted average risk score  4. shortest travel time
Routes with No Travel miles are flagged `unsafe_no_travel` and always rank behind
every safe route; they are never marked recommended.
"""

from typing import Any, Dict, List

from .risk_engine import RISK_SCORES, RISK_TIERS

TIER_KEYS = {
    "Low": "low_miles",
    "Moderate": "moderate_miles",
    "High": "high_miles",
    "Severe": "severe_miles",
    "No Travel": "no_travel_miles",
}


def build_segments(checkpoints: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    segments = []
    for a, b in zip(checkpoints, checkpoints[1:]):
        score = max(a["risk_assessment"]["risk_score"], b["risk_assessment"]["risk_score"])
        segments.append({
            "from_index": a["index"],
            "to_index": b["index"],
            "from_mile": a["distance_from_start_miles"],
            "to_mile": b["distance_from_start_miles"],
            "miles": b["distance_from_start_miles"] - a["distance_from_start_miles"],
            "risk": RISK_TIERS[score],
            "risk_score": score,
        })
    return segments


def compute_route_metrics(route: Dict[str, Any]) -> Dict[str, Any]:
    segments = build_segments(route["checkpoints"])
    miles = {key: 0.0 for key in TIER_KEYS.values()}
    weighted = 0.0
    total = 0.0
    for seg in segments:
        miles[TIER_KEYS[seg["risk"]]] += seg["miles"]
        weighted += seg["risk_score"] * seg["miles"]
        total += seg["miles"]
    metrics = {k: round(v, 2) for k, v in miles.items()}
    metrics["average_risk_score"] = round(weighted / total, 3) if total > 0 else 0.0
    metrics["total_distance_miles"] = route["distance_miles"]
    metrics["duration_hours"] = route["duration_hours"]
    return metrics


def no_travel_reason(route: Dict[str, Any], no_travel_miles: float) -> str:
    cause = "extreme weather"
    for cp in route["checkpoints"]:
        risk = cp["risk_assessment"]
        if risk["overall_risk"] == "No Travel":
            if risk.get("load_rule"):
                cause = risk["load_rule"]
            else:
                cause = "; ".join(f for f in risk["factors"] if "(No Travel)" in f) or cause
            break
    return f"Contains {no_travel_miles:g} miles of No Travel conditions: {cause}"


def _sort_key(route: Dict[str, Any]):
    m = route["metrics"]
    return (m["severe_miles"], m["high_miles"], m["average_risk_score"], m["duration_hours"])


def _winning_reason(winner: Dict[str, Any], runner_up: Dict[str, Any] = None) -> str:
    m = winner["metrics"]
    if runner_up is None:
        return "Only route without No Travel conditions" if not winner["unsafe_no_travel"] else "No safe route available"
    r = runner_up["metrics"]
    if m["severe_miles"] < r["severe_miles"]:
        return (f"Fewest Severe miles ({m['severe_miles']:g} vs {r['severe_miles']:g} "
                f"on {runner_up['name']})")
    if m["high_miles"] < r["high_miles"]:
        return (f"Tied on Severe miles, fewest High-risk miles ({m['high_miles']:g} vs "
                f"{r['high_miles']:g} on {runner_up['name']})")
    if m["average_risk_score"] < r["average_risk_score"]:
        return (f"Tied on Severe and High miles, lowest distance-weighted risk "
                f"({m['average_risk_score']:.2f} vs {r['average_risk_score']:.2f})")
    return (f"Tied on all weather metrics, shortest travel time "
            f"({m['duration_hours']:.1f} h vs {r['duration_hours']:.1f} h)")


def rank_and_recommend_routes(routes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Annotate routes with metrics, safety flags, rank and reasons; return them best-first."""
    for route in routes:
        route["metrics"] = compute_route_metrics(route)
        route["segments"] = build_segments(route["checkpoints"])
        nt = route["metrics"]["no_travel_miles"]
        route["unsafe_no_travel"] = nt > 0
        route["warning_reason"] = no_travel_reason(route, nt) if nt > 0 else None

    safe = sorted((r for r in routes if not r["unsafe_no_travel"]), key=_sort_key)
    unsafe = sorted(
        (r for r in routes if r["unsafe_no_travel"]),
        key=lambda r: (r["metrics"]["no_travel_miles"],) + _sort_key(r),
    )
    ranked = safe + unsafe

    for rank, route in enumerate(ranked, start=1):
        route["recommendation_rank"] = rank
        route["is_best"] = rank == 1 and not route["unsafe_no_travel"]
        if route["unsafe_no_travel"]:
            route["recommendation_badge"] = "UNSAFE"
            route["recommendation_reason"] = f"Not recommended. {route['warning_reason']}."
        elif rank == 1:
            route["recommendation_badge"] = "RECOMMENDED"
            runner_up = safe[1] if len(safe) > 1 else None
            reason = _winning_reason(route, runner_up)
            if runner_up is None and unsafe:
                reason = "Only route free of No Travel conditions"
            route["recommendation_reason"] = f"{reason}."
        else:
            route["recommendation_badge"] = "ALTERNATE"
            best = safe[0]["metrics"]
            m = route["metrics"]
            parts = []
            for label, key in (("Severe", "severe_miles"), ("High", "high_miles")):
                diff = m[key] - best[key]
                if diff > 0:
                    parts.append(f"{diff:g} more {label} miles")
            diff_h = m["duration_hours"] - best["duration_hours"]
            parts.append(f"{abs(diff_h):.1f} h {'longer' if diff_h > 0 else 'shorter'}")
            route["recommendation_reason"] = f"Ranked #{rank}: " + ", ".join(parts) + " than the recommended route."

    return ranked
