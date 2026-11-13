"""
Weather risk classification with load-weight overrides.

All bands are half-open [lower, upper), so every real value maps to exactly one tier:
  Wind (mph):     <25 Low | 25-35 Moderate | 35-45 High | 45-55 Severe | >=55 No Travel
  Rain (in/hr):   <0.10 Low | 0.10-0.25 Moderate | 0.25-0.50 High | 0.50-1.00 Severe | >=1.00 No Travel
  Snow (in/hr):   <0.5 Low | 0.5-1.0 Moderate | 1.0-2.0 High | 2.0-3.0 Severe | >=3.0 No Travel
"""

from bisect import bisect_right
from typing import Dict, List

RISK_TIERS: List[str] = ["Low", "Moderate", "High", "Severe", "No Travel"]
RISK_SCORES: Dict[str, int] = {name: i for i, name in enumerate(RISK_TIERS)}

WIND_BREAKS = (25.0, 35.0, 45.0, 55.0)
RAIN_BREAKS = (0.10, 0.25, 0.50, 1.00)
SNOW_BREAKS = (0.5, 1.0, 2.0, 3.0)

HEAVY_LOAD_LBS = 30_000.0
VERY_HEAVY_LOAD_LBS = 40_000.0


def _score(value: float, breaks) -> int:
    return bisect_right(breaks, value)


def classify_wind(wind_mph: float) -> str:
    return RISK_TIERS[_score(wind_mph, WIND_BREAKS)]


def classify_rain(rain_in_per_hr: float) -> str:
    return RISK_TIERS[_score(rain_in_per_hr, RAIN_BREAKS)]


def classify_snow(snow_in_per_hr: float) -> str:
    return RISK_TIERS[_score(snow_in_per_hr, SNOW_BREAKS)]


def evaluate_checkpoint_risk(
    wind_mph: float,
    rain_in_per_hr: float,
    snow_in_per_hr: float,
    load_weight_lbs: float,
) -> dict:
    """Base risk = max(wind, rain, snow); then load rules can only escalate it."""
    wind_risk = classify_wind(wind_mph)
    rain_risk = classify_rain(rain_in_per_hr)
    snow_risk = classify_snow(snow_in_per_hr)
    base_score = max(RISK_SCORES[wind_risk], RISK_SCORES[rain_risk], RISK_SCORES[snow_risk])

    score = base_score
    load_rule = None
    if wind_mph >= WIND_BREAKS[3]:
        score = RISK_SCORES["No Travel"]
        load_rule = f"Wind {wind_mph:.0f} mph is at or above 55 mph: No Travel for any load"
    elif wind_mph >= WIND_BREAKS[2] and load_weight_lbs > HEAVY_LOAD_LBS:
        score = RISK_SCORES["No Travel"]
        load_rule = f"{wind_mph:.0f} mph wind with >30,000 lb load ({load_weight_lbs:,.0f} lb): No Travel"
    elif wind_mph >= WIND_BREAKS[1] and load_weight_lbs > VERY_HEAVY_LOAD_LBS:
        score = max(score, RISK_SCORES["Severe"])
        load_rule = f"{wind_mph:.0f} mph wind with >40,000 lb load ({load_weight_lbs:,.0f} lb): escalated to Severe"

    load_penalty_applied = score > base_score
    factors = []
    for label, value, unit, tier in (
        ("Wind", wind_mph, "mph", wind_risk),
        ("Rain", rain_in_per_hr, "in/hr", rain_risk),
        ("Snow", snow_in_per_hr, "in/hr", snow_risk),
    ):
        if tier != "Low":
            factors.append(f"{label} {value:.2f} {unit} ({tier})")
    if load_rule:
        factors.append(load_rule)

    return {
        "wind_mph": round(wind_mph, 1),
        "rain_in_per_hr": round(rain_in_per_hr, 3),
        "snow_in_per_hr": round(snow_in_per_hr, 3),
        "load_weight_lbs": load_weight_lbs,
        "wind_risk": wind_risk,
        "rain_risk": rain_risk,
        "snow_risk": snow_risk,
        "base_risk": RISK_TIERS[base_score],
        "overall_risk": RISK_TIERS[score],
        "risk_score": score,
        "load_penalty_applied": load_penalty_applied,
        "load_rule": load_rule if load_penalty_applied else None,
        "factors": factors or ["All parameters in Low range"],
    }
