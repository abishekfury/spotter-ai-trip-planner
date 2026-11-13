import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWind, classifyRain, classifySnow, evaluateRisk, buildScenario } from './engine.js';

test('wind boundaries match backend', () => {
  const cases = [[24.99, 'Low'], [25, 'Moderate'], [34.99, 'Moderate'], [35, 'High'], [44.99, 'High'], [45, 'Severe'], [54.99, 'Severe'], [55, 'No Travel']];
  for (const [v, t] of cases) assert.equal(classifyWind(v), t, String(v));
});

test('rain and snow boundaries match backend', () => {
  for (const [v, t] of [[0.099, 'Low'], [0.1, 'Moderate'], [0.249, 'Moderate'], [0.25, 'High'], [0.5, 'Severe'], [1.0, 'No Travel']]) assert.equal(classifyRain(v), t, String(v));
  for (const [v, t] of [[0.49, 'Low'], [0.5, 'Moderate'], [1.0, 'High'], [2.0, 'Severe'], [3.0, 'No Travel']]) assert.equal(classifySnow(v), t, String(v));
});

test('load rules', () => {
  assert.equal(evaluateRisk(60, 0, 0, 0).overall_risk, 'No Travel');
  assert.equal(evaluateRisk(48, 0, 0, 30000).overall_risk, 'Severe');
  assert.equal(evaluateRisk(48, 0, 0, 30001).overall_risk, 'No Travel');
  assert.equal(evaluateRisk(40, 0, 0, 40000).overall_risk, 'High');
  const r = evaluateRisk(40, 0, 0, 45000);
  assert.deepEqual([r.overall_risk, r.base_risk, r.load_penalty_applied], ['Severe', 'High', true]);
  assert.equal(evaluateRisk(40, 1.2, 0, 45000).overall_risk, 'No Travel');
});

const route = (id, winds, duration) => ({
  id, name: `R${id}`, distance_miles: (winds.length - 1) * 10, duration_hours: duration,
  checkpoints: winds.map((w, i) => ({
    index: i, distance_from_start_miles: i * 10, elapsed_hours: i, eta_offset_hours: i,
    forecast: { wind_mph: Array(60).fill(w), rain_in_per_hr: Array(60).fill(0), snow_in_per_hr: Array(60).fill(0), temperature_f: Array(60).fill(50), weather_code: Array(60).fill(0) },
  })),
});

test('scenario flags unsafe routes and recommends the safe one', () => {
  const s = buildScenario([route(1, [10, 50, 50, 10], 3), route(2, [40, 40, 40, 40], 8)], 0, 42000, Date.now());
  assert.equal(s.bestRouteId, 2);
  assert.equal(s.routes[1].unsafe_no_travel, true);
  assert.match(s.routes[1].warning_reason, /Contains 30 miles of No Travel/);
  assert.equal(s.routes[0].metrics.severe_miles, 30);
});

test('slider shifts the forecast hour', () => {
  const r = route(1, [10, 10], 1);
  r.checkpoints.forEach((cp) => { cp.forecast.wind_mph[5] = 60; });
  assert.equal(buildScenario([r], 0, 1000, 0).allUnsafe, false);
  assert.equal(buildScenario([r], 4, 1000, 0).allUnsafe, true);
});
