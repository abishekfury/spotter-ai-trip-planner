import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { RISK_CONFIG } from '../utils/constants';

// Fix Leaflet default icon paths in bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export default function MapComponent({
  routes = [],
  selectedRouteId,
  onSelectRoute,
  selectedCheckpoint,
  heatmapData,
  currentHour = 0,
  showHeatmap = true,
  heatmapMetric = 'risk',
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routesLayerGroupRef = useRef(null);
  const checkpointsLayerGroupRef = useRef(null);
  const heatmapLayerRef = useRef(null);
  const originDestLayerGroupRef = useRef(null);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [39.8283, -98.5795], // Center of continental US
      zoom: 5,
      zoomControl: false,
    });

    // Zoom control at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Dark Matter tile layer for high-contrast fleet operations
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    routesLayerGroupRef.current = L.layerGroup().addTo(map);
    checkpointsLayerGroupRef.current = L.layerGroup().addTo(map);
    originDestLayerGroupRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Routes and Markers on map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !routes || routes.length === 0) return;

    const routesGroup = routesLayerGroupRef.current;
    const cpsGroup = checkpointsLayerGroupRef.current;
    const odGroup = originDestLayerGroupRef.current;

    routesGroup.clearLayers();
    cpsGroup.clearLayers();
    odGroup.clearLayers();

    const selectedRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
    const allBounds = L.latLngBounds([]);

    // 1. Draw non-selected routes in background
    routes.forEach((r) => {
      if (r.id === selectedRoute.id) return;

      const latlngs = r.geometry.map((pt) => [pt[1], pt[0]]);
      latlngs.forEach((ll) => allBounds.extend(ll));

      const poly = L.polyline(latlngs, {
        color: '#475569',
        weight: 3.5,
        opacity: 0.5,
        dashArray: '6, 6',
      }).addTo(routesGroup);

      poly.on('click', () => onSelectRoute(r.id));
      poly.bindTooltip(
        `<div class="text-xs font-semibold">Route #${r.id}: ${r.name} (${r.distance_miles} mi) - Click to inspect</div>`,
        { sticky: true }
      );
    });

    // 2. Draw Selected Route with Risk-Colored Segments
    if (selectedRoute) {
      const coords = selectedRoute.geometry.map((pt) => [pt[1], pt[0]]);
      coords.forEach((ll) => allBounds.extend(ll));

      // Glow underlay for selected route
      L.polyline(coords, {
        color: '#3b82f6',
        weight: 8,
        opacity: 0.25,
      }).addTo(routesGroup);

      // Break selected route into risk segments between checkpoints
      const cps = selectedRoute.checkpoints || [];
      if (cps.length > 1) {
        for (let i = 0; i < cps.length - 1; i++) {
          const cpA = cps[i];
          const cpB = cps[i + 1];

          // Determine segment color from checkpoint risk
          const riskA = cpA.risk_assessment?.overall_risk || 'Low';
          const riskB = cpB.risk_assessment?.overall_risk || 'Low';
          // Use the higher risk of the two bounding checkpoints
          const tierA = RISK_CONFIG[riskA] || RISK_CONFIG.Low;
          const tierB = RISK_CONFIG[riskB] || RISK_CONFIG.Low;
          const segColor =
            cpB.risk_assessment?.risk_score > cpA.risk_assessment?.risk_score
              ? tierB.color
              : tierA.color;

          const segPoly = L.polyline(
            [
              [cpA.lat, cpA.lng],
              [cpB.lat, cpB.lng],
            ],
            {
              color: segColor,
              weight: 5,
              opacity: 0.9,
            }
          ).addTo(routesGroup);

          segPoly.bindTooltip(
            `<div class="text-xs">Mile ${cpA.distance_from_start_miles} to ${cpB.distance_from_start_miles} • Risk: <strong>${riskA}</strong></div>`,
            { sticky: true }
          );
        }
      } else {
        // Fallback solid line
        L.polyline(coords, {
          color: '#3b82f6',
          weight: 5,
          opacity: 0.9,
        }).addTo(routesGroup);
      }

      // 3. Draw Checkpoint Markers along Selected Route
      cps.forEach((cp) => {
        const risk = cp.risk_assessment || {};
        const tier = risk.overall_risk || 'Low';
        const cfg = RISK_CONFIG[tier] || RISK_CONFIG.Low;
        const weather = cp.weather || {};

        const etaFormatted = new Date(cp.estimated_arrival_time).toLocaleTimeString([], {
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });

        // Circle marker
        const circle = L.circleMarker([cp.lat, cp.lng], {
          radius: tier === 'No Travel' ? 8 : tier === 'Severe' ? 7 : 5.5,
          fillColor: cfg.color,
          fillOpacity: 1.0,
          color: tier === 'No Travel' ? '#ffffff' : '#0f172a',
          weight: 2,
        }).addTo(cpsGroup);

        // Rich Popup Card
        const popupContent = `
          <div class="p-3 bg-slate-900 text-slate-100 rounded-xl min-w-[220px]">
            <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-2 mb-2">
              <span class="text-xs font-bold text-white">Mile ${cp.distance_from_start_miles}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold" style="background-color: ${cfg.color}25; color: ${cfg.color}; border: 1px solid ${cfg.color}50">
                ${tier}
              </span>
            </div>
            <div class="space-y-1.5 text-xs">
              <div class="text-slate-400 text-[11px] flex justify-between">
                <span>ETA:</span>
                <span class="text-slate-200 font-mono font-semibold">${etaFormatted}</span>
              </div>
              <div class="text-slate-400 text-[11px] flex justify-between">
                <span>Condition:</span>
                <span class="text-slate-200 font-medium">${weather.condition || 'Normal'} (${weather.temperature_f}°F)</span>
              </div>
              <div class="grid grid-cols-3 gap-1 pt-1 text-center text-[10px]">
                <div class="bg-slate-950 p-1 rounded">
                  <div class="text-slate-500">Wind</div>
                  <div class="font-mono font-bold text-slate-200">${weather.wind_speed_mph} mph</div>
                </div>
                <div class="bg-slate-950 p-1 rounded">
                  <div class="text-slate-500">Rain</div>
                  <div class="font-mono font-bold text-slate-200">${weather.rain_in_per_hr}"/h</div>
                </div>
                <div class="bg-slate-950 p-1 rounded">
                  <div class="text-slate-500">Snow</div>
                  <div class="font-mono font-bold text-slate-200">${weather.snow_in_per_hr}"/h</div>
                </div>
              </div>
              ${
                risk.factors && risk.factors.length > 0
                  ? `<div class="mt-2 pt-1.5 border-t border-slate-800 text-[10px] text-amber-300">
                      ${risk.factors.map((f) => `<div>• ${f}</div>`).join('')}
                    </div>`
                  : ''
              }
            </div>
          </div>
        `;

        circle.bindPopup(popupContent, { maxWidth: 280 });
      });

      // 4. Origin & Destination Markers
      if (coords.length > 0) {
        const startPt = coords[0];
        const endPt = coords[coords.length - 1];

        // Custom HTML Origin Marker
        const originIcon = L.divIcon({
          className: 'custom-pin-icon',
          html: `<div class="w-6 h-6 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-bold text-white">A</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker(startPt, { icon: originIcon })
          .bindTooltip('<div class="font-bold text-xs">Origin (Departure)</div>')
          .addTo(odGroup);

        // Custom HTML Destination Marker
        const destIcon = L.divIcon({
          className: 'custom-pin-icon',
          html: `<div class="w-6 h-6 rounded-full bg-rose-600 border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-bold text-white">B</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker(endPt, { icon: destIcon })
          .bindTooltip('<div class="font-bold text-xs">Destination</div>')
          .addTo(odGroup);
      }
    }

    // Auto-fit bounds
    if (allBounds.isValid()) {
      map.fitBounds(allBounds, { padding: [50, 50], maxZoom: 11 });
    }
  }, [routes, selectedRouteId, onSelectRoute]);

  // Pan to selected checkpoint if user clicks one from the inspection table
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedCheckpoint) return;

    map.flyTo([selectedCheckpoint.lat, selectedCheckpoint.lng], 9, {
      animate: true,
      duration: 1.0,
    });
  }, [selectedCheckpoint]);

  // Update Weather Heatmap layer on hour slider change or toggle
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove existing heatmap layer if present
    if (heatmapLayerRef.current) {
      map.removeLayer(heatmapLayerRef.current);
      heatmapLayerRef.current = null;
    }

    if (!showHeatmap || !heatmapData || !heatmapData.frames) return;

    const framePoints = heatmapData.frames[String(currentHour)] || [];
    if (framePoints.length === 0) return;

    // Convert to [lat, lng, intensity] based on chosen metric
    const heatPoints = framePoints.map((pt) => {
      let val = 0.2;
      if (heatmapMetric === 'risk') {
        val = 0.2 + (pt.risk_score / 4.0) * 0.8;
      } else if (heatmapMetric === 'wind') {
        val = Math.min(1.0, Math.max(0.15, pt.wind_mph / 55.0));
      } else if (heatmapMetric === 'precip') {
        val = Math.min(1.0, Math.max(0.15, (pt.precip_in || 0) / 1.5));
      }
      return [pt.lat, pt.lng, val];
    });

    try {
      if (L.heatLayer) {
        const heat = L.heatLayer(heatPoints, {
          radius: 45,
          blur: 30,
          maxZoom: 10,
          max: 1.0,
          gradient: {
            0.2: '#06b6d4', // cyan-500
            0.4: '#10b981', // emerald-500
            0.6: '#f59e0b', // amber-500
            0.8: '#f97316', // orange-500
            1.0: '#ef4444', // red-500
          },
        }).addTo(map);

        heatmapLayerRef.current = heat;
      }
    } catch (err) {
      console.warn('Heatmap layer render error:', err);
    }
  }, [heatmapData, currentHour, showHeatmap, heatmapMetric]);

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden">
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Map Watermark / Title Badge */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 shadow-xl flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-white tracking-wide">
            Interactive Route Radar
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {routes.length} Active Corridors
          </span>
        </div>
      </div>
    </div>
  );
}
