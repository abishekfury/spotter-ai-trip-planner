import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Compass, Layers, Loader2, ShieldAlert } from 'lucide-react';
import Sidebar from './components/Sidebar';
import RouteCard from './components/RouteCard';
import MapComponent from './components/MapComponent';
import ForecastSlider from './components/ForecastSlider';
import CheckpointTimeline from './components/CheckpointTimeline';
import RiskLegend from './components/RiskLegend';
import ErrorBoundary from './components/ErrorBoundary';
import { buildScenario } from './utils/engine';
import { defaultDeparture } from './utils/format';
import { DEFAULT_TRIP } from './utils/constants';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const EMPTY = { routes: [], bestRouteId: null, allUnsafe: false };

async function requestRoutes(payload, signal) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/api/routes/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return body;
      const detail = body.details ? ` ${JSON.stringify(body.details)}` : '';
      const err = new Error((body.error || `Server responded with ${res.status}`) + detail);
      // Client errors will not improve on retry.
      if (res.status < 500) throw Object.assign(err, { fatal: true });
      lastError = err;
    } catch (err) {
      if (err.name === 'AbortError' || err.fatal) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

export default function App() {
  const [origin, setOrigin] = useState(DEFAULT_TRIP.origin);
  const [destination, setDestination] = useState(DEFAULT_TRIP.destination);
  const [departureTime, setDepartureTime] = useState(defaultDeparture);
  const [loadWeight, setLoadWeight] = useState(DEFAULT_TRIP.loadWeight);
  const [intervalMiles, setIntervalMiles] = useState(DEFAULT_TRIP.intervalMiles);

  const [apiData, setApiData] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(null);
  const [hour, setHour] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [heatmapMetric, setHeatmapMetric] = useState('risk');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('routes');
  const abortRef = useRef(null);

  const calculateRoutes = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const data = await requestRoutes(
        {
          origin: { lat: origin.lat, lng: origin.lng, name: origin.name },
          destination: { lat: destination.lat, lng: destination.lng, name: destination.name },
          departure_time: new Date(departureTime).toISOString(),
          load_weight: Number(loadWeight),
          sample_interval_miles: Number(intervalMiles),
        },
        controller.signal,
      );
      setApiData(data);
      setSelectedRouteId(data.best_route_id ?? data.routes[0]?.id ?? null);
      setSelectedCheckpoint(null);
      setHour(0);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to analyze routes. Check your connection and inputs.');
      }
    } finally {
      if (abortRef.current === controller) setIsLoading(false);
    }
  }, [origin, destination, departureTime, loadWeight, intervalMiles]);

  useEffect(() => {
    calculateRoutes();
    return () => abortRef.current?.abort();
    // Initial demo load only; later runs are user-triggered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slider ticks are pure client-side recomputation from pre-fetched hourly forecasts.
  const deferredHour = useDeferredValue(hour);
  const params = apiData?.request_params;
  const departureMs = params ? new Date(params.departure_time).getTime() : 0;
  const scenario = useMemo(
    () => (apiData ? buildScenario(apiData.routes, deferredHour, params.load_weight_lbs, departureMs) : EMPTY),
    [apiData, deferredHour, params, departureMs],
  );

  const selectedRoute = scenario.routes.find((r) => r.id === selectedRouteId) || scenario.routes[0];
  const activeLoad = params?.load_weight_lbs ?? loadWeight;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="w-[440px] shrink-0 h-full flex flex-col border-r border-slate-800 z-10 bg-slate-900 shadow-2xl">
        <div className="flex border-b border-slate-800 bg-slate-950 text-xs">
          {[
            ['routes', Compass, `Route Planning (${scenario.routes.length})`],
            ['checkpoints', Layers, `Checkpoints (${selectedRoute?.checkpoints?.length || 0})`],
          ].map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex-1 py-3 font-semibold border-b-2 transition flex items-center justify-center gap-1.5 ${
                activeTab === id ? 'border-blue-500 text-white bg-slate-900' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'routes' ? (
          <div className="flex-1 overflow-y-auto">
            <Sidebar
              origin={origin}
              setOrigin={setOrigin}
              destination={destination}
              setDestination={setDestination}
              departureTime={departureTime}
              setDepartureTime={setDepartureTime}
              loadWeight={loadWeight}
              setLoadWeight={setLoadWeight}
              intervalMiles={intervalMiles}
              setIntervalMiles={setIntervalMiles}
              onCalculate={calculateRoutes}
              isLoading={isLoading}
            />

            {error && (
              <div role="alert" className="m-4 p-3 rounded-xl bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div>{error}</div>
                  <button type="button" onClick={calculateRoutes} className="mt-1.5 underline text-red-100 hover:text-white">
                    Retry
                  </button>
                </div>
              </div>
            )}

            <div className="p-4 space-y-3">
              {scenario.allUnsafe && (
                <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-700 text-rose-100 text-xs flex gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                  No route is free of No Travel conditions at this departure time. Move the slider to find a safer window.
                </div>
              )}
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">Route Comparison</h2>
                <span className="text-[11px] text-slate-400">Ranked by safety rules</span>
              </div>

              {!apiData && isLoading &&
                [0, 1, 2].map((i) => <div key={i} className="h-44 rounded-xl bg-slate-800/50 animate-pulse" />)}

              {scenario.routes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  isSelected={route.id === selectedRoute?.id}
                  onSelect={() => setSelectedRouteId(route.id)}
                  isBest={route.is_best}
                />
              ))}

              <div className="pt-2">
                <RiskLegend loadWeight={activeLoad} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
              <div className="font-bold text-white flex items-center justify-between">
                <span>Active Route: {selectedRoute?.name}</span>
                <span className="text-blue-400 font-mono">#{selectedRoute?.id}</span>
              </div>
              <div className="text-slate-400 text-[11px] mt-1">
                {selectedRoute?.distance_miles} mi · {selectedRoute?.checkpoints?.length} checkpoints every {params?.sample_interval_miles ?? intervalMiles} mi
              </div>
            </div>
            <CheckpointTimeline
              checkpoints={selectedRoute?.checkpoints || []}
              selectedCheckpointIndex={selectedCheckpoint?.index}
              onSelectCheckpoint={setSelectedCheckpoint}
              routeDistance={selectedRoute?.distance_miles || 0}
              loadWeight={activeLoad}
            />
            <RiskLegend loadWeight={activeLoad} />
          </div>
        )}
      </div>

      <div className="flex-1 relative h-full">
        <ErrorBoundary label="The map failed to render">
          <MapComponent
            routes={apiData?.routes || []}
            scenario={scenario}
            selectedRouteId={selectedRoute?.id}
            onSelectRoute={setSelectedRouteId}
            selectedCheckpoint={selectedCheckpoint}
            showHeatmap={showHeatmap}
            heatmapMetric={heatmapMetric}
          />
        </ErrorBoundary>

        {isLoading && (
          <div className="absolute top-4 right-4 z-[500] flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            Fetching routes &amp; 48h weather…
          </div>
        )}

        {apiData && (
          <div className="absolute bottom-6 left-6 right-20 z-[500] max-w-3xl mx-auto">
            <ForecastSlider
              currentHour={hour}
              setCurrentHour={setHour}
              maxHours={params.slider_hours || 48}
              departureMs={departureMs}
              showHeatmap={showHeatmap}
              setShowHeatmap={setShowHeatmap}
              heatmapMetric={heatmapMetric}
              setHeatmapMetric={setHeatmapMetric}
            />
          </div>
        )}
      </div>
    </div>
  );
}
