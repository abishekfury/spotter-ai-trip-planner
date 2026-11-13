/**
 * Client-side mirror of backend risk + ranking rules (routing_core/services).
 * Lets the 0-48h slider re-evaluate every route instantly from pre-fetched hourly
 * forecasts. Both implementations are covered by the same boundary vectors.
 */

import { describeWeather } from './format.js';

export const RISK_TIERS = ['Low', 'Moderate', 'High', 'Severe', 'No Travel'];

const WIND_BREAKS = [25, 35, 45, 55];
const RAIN_BREAKS = [0.1, 0.25, 0.5, 1.0];
const SNOW_BREAKS = [0.5, 1.0, 2.0, 3.0];

// Half-open bands [lo, hi): the score is the number of breakpoints <= value.
const score = (value, breaks) => breaks.filter((b) => value >= b).length;

export const classifyWind = (v) => RISK_TIERS[score(v, WIND_BREAKS)];
export const classifyRain = (v) => RISK_TIERS[score(v, RAIN_BREAKS)];
export const classifySnow = (v) => RISK_TIERS[score(v, SNOW_BREAKS)];

export function evaluateRisk(wind, rain, snow, loadLbs) {
  const windScore = score(wind, WIND_BREAKS);
  const base = Math.max(windScore, score(rain, RAIN_BREAKS), score(snow, SNOW_BREAKS));
  let overall = base;
  let loadRule = null;

  if (wind >= 55) {
    overall = 4;
    loadRule = `${Math.round(wind)} mph wind is at or above 55 mph: No Travel for any load`;
  } else if (wind >= 45 && loadLbs > 30000) {
    overall = 4;
    loadRule = `${Math.round(wind)} mph wind with >30,000 lb load (${loadLbs.toLocaleString()} lb): No Travel`;
  } else if (wind >= 35 && loadLbs > 40000) {
    overall = Math.max(overall, 3);
    loadRule = `${Math.round(wind)} mph wind with >40,000 lb load (${loadLbs.toLocaleString()} lb): escalated to Severe`;
  }

  const penalty = overall > base;
  return {
    wind_mph: wind,
    rain_in_per_hr: rain,
    snow_in_per_hr: snow,
    wind_risk: RISK_TIERS[windScore],
    rain_risk: RISK_TIERS[score(rain, RAIN_BREAKS)],
    snow_risk: RISK_TIERS[score(snow, SNOW_BREAKS)],
    base_risk: RISK_TIERS[base],
    overall_risk: RISK_TIERS[overall],
    risk_score: overall,
    load_penalty_applied: penalty,
    load_rule: penalty ? loadRule : null,
  };
}

const TIER_KEYS = ['low_miles', 'moderate_miles', 'high_miles', 'severe_miles', 'no_travel_miles'];

export function buildSegments(cps) {
  const segments = [];
  for (let i = 0; i < cps.length - 1; i++) {
    const a = cps[i];
    const b = cps[i + 1];
    const s = Math.max(a.risk_assessment.risk_score, b.risk_assessment.risk_score);
    segments.push({
      from_index: a.index,
      to_index: b.index,
      miles: b.distance_from_start_miles - a.distance_from_start_miles,
      risk: RISK_TIERS[s],
      risk_score: s,
    });
  }
  return segments;
}

export function computeMetrics(route, segments) {
  const miles = Object.fromEntries(TIER_KEYS.map((k) => [k, 0]));
  let weighted = 0;
  let total = 0;
  for (const seg of segments) {
    miles[TIER_KEYS[seg.risk_score]] += seg.miles;
    weighted += seg.risk_score * seg.miles;
    total += seg.miles;
  }
  const out = {};
  for (const k of TIER_KEYS) out[k] = Math.round(miles[k] * 100) / 100;
  out.average_risk_score = total > 0 ? Math.round((weighted / total) * 1000) / 1000 : 0;
  out.total_distance_miles = route.distance_miles;
  out.duration_hours = route.duration_hours;
  return out;
}

const g = (n) => String(Math.round(n * 100) / 100);

function warningReason(cps, noTravelMiles) {
  const cp = cps.find((c) => c.risk_assessment.overall_risk === 'No Travel');
  const cause = cp?.risk_assessment.load_rule
    || (cp && `${cp.weather.wind_speed_mph} mph wind / ${cp.weather.rain_in_per_hr} in/hr rain / ${cp.weather.snow_in_per_hr} in/hr snow`)
    || 'extreme weather';
  return `Contains ${g(noTravelMiles)} miles of No Travel conditions: ${cause}`;
}

const sortKey = (r) => [r.metrics.severe_miles, r.metrics.high_miles, r.metrics.average_risk_score, r.metrics.duration_hours];

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function winningReason(winner, runnerUp) {
  if (!runnerUp) return 'Only route free of No Travel conditions';
  const m = winner.metrics;
  const r = runnerUp.metrics;
  if (m.severe_miles < r.severe_miles) return `Fewest Severe miles (${g(m.severe_miles)} vs ${g(r.severe_miles)} on ${runnerUp.name})`;
  if (m.high_miles < r.high_miles) return `Tied on Severe miles, fewest High-risk miles (${g(m.high_miles)} vs ${g(r.high_miles)} on ${runnerUp.name})`;
  if (m.average_risk_score < r.average_risk_score) return `Tied on Severe and High miles, lowest distance-weighted risk (${m.average_risk_score.toFixed(2)} vs ${r.average_risk_score.toFixed(2)})`;
  return `Tied on all weather metrics, shortest travel time (${m.duration_hours.toFixed(1)} h vs ${r.duration_hours.toFixed(1)} h)`;
}

export function rankRoutes(routes) {
  const safe = routes.filter((r) => !r.unsafe_no_travel).sort((a, b) => compareKeys(sortKey(a), sortKey(b)));
  const unsafe = routes
    .filter((r) => r.unsafe_no_travel)
    .sort((a, b) => compareKeys([a.metrics.no_travel_miles, ...sortKey(a)], [b.metrics.no_travel_miles, ...sortKey(b)]));
  const ranked = [...safe, ...unsafe];

  ranked.forEach((route, i) => {
    route.recommendation_rank = i + 1;
    route.is_best = i === 0 && !route.unsafe_no_travel;
    if (route.unsafe_no_travel) {
      route.recommendation_badge = 'UNSAFE';
      route.recommendation_reason = `Not recommended. ${route.warning_reason}.`;
    } else if (i === 0) {
      route.recommendation_badge = 'RECOMMENDED';
      route.recommendation_reason = `${winningReason(route, safe[1])}.`;
    } else {
      const best = safe[0].metrics;
      const m = route.metrics;
      const parts = [];
      if (m.severe_miles > best.severe_miles) parts.push(`${g(m.severe_miles - best.severe_miles)} more Severe miles`);
      if (m.high_miles > best.high_miles) parts.push(`${g(m.high_miles - best.high_miles)} more High miles`);
      const dh = m.duration_hours - best.duration_hours;
      parts.push(`${Math.abs(dh).toFixed(1)} h ${dh > 0 ? 'longer' : 'shorter'}`);
      route.recommendation_badge = 'ALTERNATE';
      route.recommendation_reason = `Ranked #${i + 1}: ${parts.join(', ')} than the recommended route.`;
    }
  });
  return ranked;
}

/**
 * Re-evaluate all routes as if the trip departed `hourShift` hours after the
 * requested departure. Pure and allocation-light: ~75 checkpoints per call.
 */
export function buildScenario(routes, hourShift, loadLbs, departureMs) {
  const evaluated = routes.map((route) => {
    const checkpoints = route.checkpoints.map((cp) => {
      const f = cp.forecast;
      const n = f.wind_mph.length;
      const i = Math.max(0, Math.min(n - 1, Math.floor(cp.eta_offset_hours + hourShift + 0.5)));
      const wind = f.wind_mph[i];
      const rain = f.rain_in_per_hr[i];
      const snow = f.snow_in_per_hr[i];
      return {
        ...cp,
        estimated_arrival_time: new Date(departureMs + (hourShift + cp.elapsed_hours) * 3600000).toISOString(),
        weather: {
          temperature_f: f.temperature_f[i],
          wind_speed_mph: wind,
          rain_in_per_hr: rain,
          snow_in_per_hr: snow,
          weather_code: f.weather_code[i],
          condition: describeWeather(f.weather_code[i]),
        },
        risk_assessment: evaluateRisk(wind, rain, snow, loadLbs),
      };
    });
    const segments = buildSegments(checkpoints);
    const metrics = computeMetrics(route, segments);
    const unsafe = metrics.no_travel_miles > 0;
    return {
      ...route,
      checkpoints,
      segments,
      metrics,
      unsafe_no_travel: unsafe,
      warning_reason: unsafe ? warningReason(checkpoints, metrics.no_travel_miles) : null,
    };
  });
  const ranked = rankRoutes(evaluated);
  const best = ranked.find((r) => r.is_best);
  return { routes: ranked, bestRouteId: best ? best.id : null, allUnsafe: !best };
}
