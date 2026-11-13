"""
Route recommendation engine adhering strictly to user preferences:
1. Fewest Severe miles (and No Travel miles)
2. Fewest High miles
3. Lowest average risk
4. Shortest travel times
"""

from typing import List, Dict, Any

def compute_route_metrics(route: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes cumulative miles spent in each risk tier and average risk score.
    """
    checkpoints = route.get("checkpoints", [])
    total_distance = route.get("distance_miles", 0.0)

    miles_by_tier = {
        "No Travel": 0.0,
        "Severe": 0.0,
        "High": 0.0,
        "Moderate": 0.0,
        "Low": 0.0,
    }

    weighted_risk_sum = 0.0
    total_segmented_miles = 0.0

    for cp in checkpoints:
        seg_len = cp.get("segment_length_miles", 0.0)
        risk_info = cp.get("risk_assessment", {})
        tier = risk_info.get("overall_risk", "Low")
        score = risk_info.get("risk_score", 0)

        miles_by_tier[tier] = miles_by_tier.get(tier, 0.0) + seg_len
        weighted_risk_sum += score * seg_len
        total_segmented_miles += seg_len

    div = total_segmented_miles if total_segmented_miles > 0 else 1.0
    avg_risk_score = round(weighted_risk_sum / div, 2)

    return {
        "no_travel_miles": round(miles_by_tier["No Travel"], 1),
        "severe_miles": round(miles_by_tier["Severe"], 1),
        "high_miles": round(miles_by_tier["High"], 1),
        "moderate_miles": round(miles_by_tier["Moderate"], 1),
        "low_miles": round(miles_by_tier["Low"], 1),
        "average_risk_score": avg_risk_score,
        "total_distance_miles": total_distance,
        "duration_hours": route.get("duration_hours", 0.0),
    }

def rank_and_recommend_routes(routes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Ranks routes using lexicographical sorting tuple:
    (no_travel_miles, severe_miles, high_miles, average_risk_score, duration_hours)
    
    Generates actionable reasons and identifies the #1 Best Route.
    """
    for r in routes:
        metrics = compute_route_metrics(r)
        r["metrics"] = metrics

    # Sort key strictly following the 4 preferences
    def sort_key(r):
        m = r["metrics"]
        return (
            m["no_travel_miles"],
            m["severe_miles"],
            m["high_miles"],
            m["average_risk_score"],
            m["duration_hours"],
        )

    sorted_routes = sorted(routes, key=sort_key)

    # Assign ranks and explanations
    for rank_idx, r in enumerate(sorted_routes):
        rank = rank_idx + 1
        r["recommendation_rank"] = rank
        r["is_best"] = (rank == 1)

        m = r["metrics"]
        # Generate clear explanation
        if rank == 1:
            reasons = []
            if m["no_travel_miles"] == 0 and m["severe_miles"] == 0:
                reasons.append("Zero Severe or No-Travel conditions across the entire corridor")
            elif m["severe_miles"] > 0:
                reasons.append(f"Minimizes Severe weather to only {m['severe_miles']} miles")
            
            if m["high_miles"] == 0:
                reasons.append("zero High-risk miles")
            else:
                reasons.append(f"lowest high-risk exposure ({m['high_miles']} miles)")

            reasons.append(f"lowest average risk score ({m['average_risk_score']}/4.0)")
            reasons.append(f"efficient transit time of {r['duration_hours']} hrs")

            r["recommendation_badge"] = "RECOMMENDED"
            r["recommendation_reason"] = (
                f"Selected as the safest and most efficient path: {', '.join(reasons)}."
            )
        elif rank == 2:
            r["recommendation_badge"] = "RUNNER UP"
            # Compare with rank 1
            best_m = sorted_routes[0]["metrics"]
            diff_severe = m["severe_miles"] - best_m["severe_miles"]
            diff_high = m["high_miles"] - best_m["high_miles"]
            diff_time = round(r["duration_hours"] - sorted_routes[0]["duration_hours"], 1)

            diff_parts = []
            if m["no_travel_miles"] > 0:
                diff_parts.append(f"{m['no_travel_miles']} miles of No-Travel conditions")
            if diff_severe > 0:
                diff_parts.append(f"{diff_severe:.1f} more Severe miles")
            if diff_high > 0:
                diff_parts.append(f"{diff_high:.1f} more High-risk miles")
            if diff_time > 0:
                diff_parts.append(f"{diff_time} hrs longer")
            elif diff_time < 0:
                diff_parts.append(f"{abs(diff_time)} hrs faster, but with higher weather risk")

            diff_str = ", ".join(diff_parts) if diff_parts else "slightly higher weather risk"
            r["recommendation_reason"] = (
                f"Secondary option. Has {diff_str} compared to Recommended route."
            )
        else:
            r["recommendation_badge"] = "ELEVATED RISK"
            m = r["metrics"]
            if m["no_travel_miles"] > 0:
                r["recommendation_reason"] = (
                    f"Not recommended: Contains {m['no_travel_miles']} miles of No-Travel conditions."
                )
            else:
                r["recommendation_reason"] = (
                    f"Highest cumulative hazard: {m['severe_miles']} Severe miles and {m['high_miles']} High-risk miles."
                )

    # Return routes preserving original order or sorted by rank (sorted is much better for UI)
    return sorted_routes
