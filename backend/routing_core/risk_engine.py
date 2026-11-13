"""
Risk calculation engine based on weather thresholds and truck load weight rules.
"""

RISK_TIERS = ["Low", "Moderate", "High", "Severe", "No Travel"]
RISK_SCORES = {
    "Low": 0,
    "Moderate": 1,
    "High": 2,
    "Severe": 3,
    "No Travel": 4,
}

def classify_wind(wind_mph: float) -> str:
    """
    Wind thresholds:
    < 25 mph: Low
    25–34 mph: Moderate
    35–44 mph: High
    45–54 mph: Severe
    ≥ 55 mph: No Travel
    """
    if wind_mph < 25.0:
        return "Low"
    elif wind_mph <= 34.0:
        return "Moderate"
    elif wind_mph <= 44.0:
        return "High"
    elif wind_mph <= 54.0:
        return "Severe"
    else:
        return "No Travel"

def classify_rain(rain_in_per_hr: float) -> str:
    """
    Rain thresholds:
    < 0.10 in/hr: Low
    0.10–0.25: Moderate
    0.25–0.50: High
    0.50–1.00: Severe
    > 1.00: No Travel
    """
    if rain_in_per_hr < 0.10:
        return "Low"
    elif rain_in_per_hr <= 0.25:
        return "Moderate"
    elif rain_in_per_hr <= 0.50:
        return "High"
    elif rain_in_per_hr <= 1.00:
        return "Severe"
    else:
        return "No Travel"

def classify_snow(snow_in_per_hr: float) -> str:
    """
    Snow thresholds:
    < 0.5 in/hr: Low
    0.5–1.0: Moderate
    1.0–2.0: High
    2.0–3.0: Severe
    > 3.0: No Travel
    """
    if snow_in_per_hr < 0.5:
        return "Low"
    elif snow_in_per_hr <= 1.0:
        return "Moderate"
    elif snow_in_per_hr <= 2.0:
        return "High"
    elif snow_in_per_hr <= 3.0:
        return "Severe"
    else:
        return "No Travel"

def evaluate_checkpoint_risk(
    wind_mph: float,
    rain_in_per_hr: float,
    snow_in_per_hr: float,
    load_weight_lbs: float,
) -> dict:
    """
    Evaluates risk for a checkpoint considering weather condition thresholds and load rules:
    Load rules:
    • ≥55 mph → No Travel for any load
    • 45–54 mph + >30,000 lb → No Travel
    • 35–44 mph + >40,000 lb → Severe
    """
    wind_risk = classify_wind(wind_mph)
    rain_risk = classify_rain(rain_in_per_hr)
    snow_risk = classify_snow(snow_in_per_hr)

    # Base risk is the maximum among individual conditions
    max_base_score = max(
        RISK_SCORES[wind_risk],
        RISK_SCORES[rain_risk],
        RISK_SCORES[snow_risk],
    )
    overall_score = max_base_score
    overall_risk = RISK_TIERS[overall_score]

    factors = []
    if wind_risk != "Low":
        factors.append(f"Wind {wind_mph:.1f} mph ({wind_risk})")
    if rain_risk != "Low":
        factors.append(f"Rain {rain_in_per_hr:.2f} in/hr ({rain_risk})")
    if snow_risk != "Low":
        factors.append(f"Snow {snow_in_per_hr:.2f} in/hr ({snow_risk})")

    # Apply Load Rules
    load_rule_applied = False
    if wind_mph >= 55.0:
        overall_risk = "No Travel"
        overall_score = 4
        factors.append(f"Wind ≥ 55 mph ({wind_mph:.1f} mph) triggers No Travel for any load")
        load_rule_applied = True
    elif 45.0 <= wind_mph <= 54.0 and load_weight_lbs > 30000.0:
        overall_risk = "No Travel"
        overall_score = 4
        factors.append(
            f"Wind 45–54 mph ({wind_mph:.1f} mph) with load > 30,000 lb ({load_weight_lbs:,.0f} lb) triggers No Travel"
        )
        load_rule_applied = True
    elif 35.0 <= wind_mph <= 44.0 and load_weight_lbs > 40000.0:
        if overall_score < 3:
            overall_risk = "Severe"
            overall_score = 3
        factors.append(
            f"Wind 35–44 mph ({wind_mph:.1f} mph) with load > 40,000 lb ({load_weight_lbs:,.0f} lb) escalated risk to Severe"
        )
        load_rule_applied = True

    if not factors:
        factors.append("Optimal conditions (all parameters in Low risk range)")

    return {
        "wind_mph": round(wind_mph, 1),
        "rain_in_per_hr": round(rain_in_per_hr, 3),
        "snow_in_per_hr": round(snow_in_per_hr, 3),
        "load_weight_lbs": load_weight_lbs,
        "wind_risk": wind_risk,
        "rain_risk": rain_risk,
        "snow_risk": snow_risk,
        "overall_risk": overall_risk,
        "risk_score": overall_score,
        "factors": factors,
        "load_rule_applied": load_rule_applied,
    }
