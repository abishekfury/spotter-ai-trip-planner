import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { RISK_CONFIG } from '../utils/constants';
import { RISK_TIERS } from '../utils/engine';
import { formatEta } from '../utils/format';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

const HEAT_GRADIENT = { 0.1: '#06b6d4', 0.3: '#10b981', 0.5: '#f59e0b', 0.7: '#f97316', 0.9: '#ef4444' };

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function checkpointHtml(cp) {
  const risk = cp.risk_assessment;
  const cfg = RISK_CONFIG[risk.overall_risk];
  const w = cp.weather;
  const penalty = risk.load_penalty_applied
    ? `<div style="margin-top:6px;padding:4px 6px;border-radius:6px;background:#7f1d1d55;color:#fecaca;font-size:11px">Load penalty: ${esc(risk.base_risk)} → <b>${esc(risk.overall_risk)}</b><br/>${esc(risk.load_rule)}</div>`
    : '<div style="margin-top:6px;color:#94a3b8;font-size:11px">No load weight penalty</div>';
  return `<div style="min-width:210px;font-size:12px;line-height:1.5">
    <div style="display:flex;justify-content:space-between;gap:8px;font-weight:700">
      <span>Mile ${esc(Math.round(cp.distance_from_start_miles * 10) / 10)}</span>
      <span style="color:${cfg.color}">${esc(risk.overall_risk)}</span></div>
    <div>Local ETA: <b>${esc(formatEta(new Date(cp.estimated_arrival_time)))}</b></div>
    <div>Wind <b>${esc(w.wind_speed_mph)}</b> mph · Rain <b>${esc(w.rain_in_per_hr)}</b> in/hr · Snow <b>${esc(w.snow_in_per_hr)}</b> in/hr</div>
    <div>Base risk: <b>${esc(risk.base_risk)}</b></div>${penalty}</div>`;
}

function segmentStyle(riskName, selected) {
  const noTravel = riskName === 'No Travel';
  return {
    color: RISK_CONFIG[riskName].color,
    weight: selected ? 6 : 4,
    opacity: selected ? 0.95 : 0.5,
    dashArray: noTravel ? '8 8' : null,
  };
}

function heatValue(cp, metric) {
  if (metric === 'wind') return Math.min(1, cp.weather.wind_speed_mph / 55);
  if (metric === 'precip') return Math.min(1, Math.max(cp.weather.rain_in_per_hr / 1, cp.weather.snow_in_per_hr / 3));
  return [0.05, 0.3, 0.55, 0.8, 1][cp.risk_assessment.risk_score];
}

// Checkpoints plus interpolated midpoints give a continuous corridor band.
function heatPoints(scenario, metric) {
  const pts = [];
  for (const route of scenario.routes) {
    const cps = route.checkpoints;
    cps.forEach((cp, i) => {
      const v = heatValue(cp, metric);
      pts.push([cp.lat, cp.lng, v]);
      const next = cps[i + 1];
      if (next) {
        const nv = heatValue(next, metric);
        for (const t of [0.5]) {
          pts.push([cp.lat + (next.lat - cp.lat) * t, cp.lng + (next.lng - cp.lng) * t, v + (nv - v) * t]);
        }
      }
    });
  }
  return pts;
}

export default function MapComponent({
  routes,
  scenario,
  selectedRouteId,
  onSelectRoute,
  selectedCheckpoint,
  showHeatmap,
  heatmapMetric,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({ segments: {}, markers: {}, groups: {}, heat: null, styleKeys: new WeakMap() });
  const scenarioRef = useRef(scenario);
  const onSelectRef = useRef(onSelectRoute);
  scenarioRef.current = scenario;
  onSelectRef.current = onSelectRoute;

  useEffect(() => {
    if (mapRef.current) return undefined;
    const map = L.map(containerRef.current, { center: [39.8, -98.6], zoom: 5, zoomControl: false, preferCanvas: true });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      className: 'dark-tiles',
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(map);
    layersRef.current.heat = L.heatLayer([], { radius: 30, blur: 24, maxZoom: 9, max: 1.6, minOpacity: 0.03, gradient: HEAT_GRADIENT });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Build geometry layers once per API response; the slider only restyles them.
  useEffect(() => {
    const map = mapRef.current;
    const L_ = layersRef.current;
    Object.values(L_.groups).forEach((g) => g.remove());
    L_.segments = {};
    L_.markers = {};
    L_.groups = {};
    L_.styleKeys = new WeakMap();
    if (!map || !routes.length) return;

    const bounds = L.latLngBounds([]);
    routes.forEach((route) => {
      const group = L.featureGroup().addTo(map);
      L_.groups[route.id] = group;
      L_.segments[route.id] = [];
      L_.markers[route.id] = {};
      const cps = route.checkpoints;
      const latlng = (pt) => [pt[1], pt[0]];

      for (let i = 0; i < cps.length - 1; i++) {
        const a = cps[i];
        const b = cps[i + 1];
        // Follow the real road geometry between consecutive checkpoints.
        const path = [[a.lat, a.lng], ...route.geometry.slice(a.geometry_index + 1, b.geometry_index + 1).map(latlng), [b.lat, b.lng]];
        const seg = L.polyline(path, { color: '#64748b', weight: 4, opacity: 0.5, lineCap: 'butt', lineJoin: 'round' }).addTo(group);
        seg.on('click', () => onSelectRef.current(route.id));
        seg.bindTooltip(() => {
          const sc = scenarioRef.current.routes.find((r) => r.id === route.id);
          const s = sc?.segments[i];
          return s
            ? `${esc(route.name)}${route.synthetic ? ' (estimated path)' : ''}<br/>Mile ${Math.round(a.distance_from_start_miles)}–${Math.round(b.distance_from_start_miles)}: <b>${esc(s.risk)}</b>`
            : esc(route.name);
        }, { sticky: true });
        L_.segments[route.id].push(seg);
      }
      route.geometry.forEach((pt) => bounds.extend(latlng(pt)));

      cps.forEach((cp) => {
        const marker = L.circleMarker([cp.lat, cp.lng], { radius: 5.5, weight: 2, color: '#0f172a', fillColor: '#64748b', fillOpacity: 1 }).addTo(group);
        const content = () => {
          const sc = scenarioRef.current.routes.find((r) => r.id === route.id);
          return sc ? checkpointHtml(sc.checkpoints[cp.index]) : '';
        };
        marker.bindTooltip(content, { direction: 'top', offset: [0, -6] });
        marker.bindPopup(content, { closeButton: false });
        L_.markers[route.id][cp.index] = marker;
      });
    });
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 9 });
  }, [routes]);

  // Cheap per-tick restyle (only touches layers whose appearance changed).
  useEffect(() => {
    const L_ = layersRef.current;
    const keys = L_.styleKeys;
    scenario.routes.forEach((sc) => {
      const selected = sc.id === selectedRouteId;
      const group = L_.groups[sc.id];
      if (!group) return;
      sc.segments.forEach((s, i) => {
        const layer = L_.segments[sc.id][i];
        const key = `${s.risk}|${selected}`;
        if (layer && keys.get(layer) !== key) {
          layer.setStyle(segmentStyle(s.risk, selected));
          keys.set(layer, key);
        }
      });
      sc.checkpoints.forEach((cp) => {
        const marker = L_.markers[sc.id][cp.index];
        const tier = cp.risk_assessment.overall_risk;
        const key = `${tier}|${selected}`;
        if (marker && keys.get(marker) !== key) {
          marker.setStyle({
            fillColor: RISK_CONFIG[tier].color,
            color: tier === 'No Travel' ? '#ffffff' : '#0f172a',
            radius: selected ? (tier === 'No Travel' ? 8 : 6) : 3.5,
            opacity: selected ? 1 : 0.6,
            fillOpacity: selected ? 1 : 0.6,
          });
          keys.set(marker, key);
        }
      });
    });
  }, [scenario, selectedRouteId]);

  useEffect(() => {
    const L_ = layersRef.current;
    const sel = L_.groups[selectedRouteId];
    if (sel) sel.bringToFront();
  }, [selectedRouteId, routes]);

  // Heatmap: one persistent layer, data swapped in place on every slider tick.
  useEffect(() => {
    const map = mapRef.current;
    const heat = layersRef.current.heat;
    if (!map || !heat) return;
    if (!showHeatmap) {
      if (map.hasLayer(heat)) map.removeLayer(heat);
      return;
    }
    heat.setLatLngs(heatPoints(scenario, heatmapMetric));
    if (!map.hasLayer(heat)) heat.addTo(map);
  }, [scenario, showHeatmap, heatmapMetric]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedCheckpoint) return;
    map.flyTo([selectedCheckpoint.lat, selectedCheckpoint.lng], 9, { duration: 0.8 });
    layersRef.current.markers[selectedRouteId]?.[selectedCheckpoint.index]?.openPopup();
  }, [selectedCheckpoint, selectedRouteId]);

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden">
      <div ref={containerRef} className="w-full h-full z-0" />
      <div className="absolute top-4 left-4 z-[400] pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 shadow-xl flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-white tracking-wide">Route Risk Radar</span>
          <span className="text-[10px] text-slate-400 font-mono">{RISK_TIERS.length} tiers · {routes.length} corridors</span>
        </div>
      </div>
    </div>
  );
}
