import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import RouteCard from './components/RouteCard';
import MapComponent from './components/MapComponent';
import ForecastSlider from './components/ForecastSlider';
import CheckpointTimeline from './components/CheckpointTimeline';
import RiskLegend from './components/RiskLegend';
import { AlertCircle, ShieldCheck, Compass, Info, Layers } from 'lucide-react';

export default function App() {
  const [origin, setOrigin] = useState({
    name: 'Chicago, IL',
    lat: 41.8781,
    lng: -87.6298,
  });
  const [destination, setDestination] = useState({
    name: 'Denver, CO',
    lat: 39.7392,
    lng: -104.9903,
  });

  // Default departure time: now
  const [departureTime, setDepartureTime] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 16);
  });

  // Default load weight: 42,000 lbs (activates the critical 40k+ lb rule)
  const [loadWeight, setLoadWeight] = useState(42000);
  const [intervalMiles, setIntervalMiles] = useState(25);

  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);

  const [currentHour, setCurrentHour] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [heatmapMetric, setHeatmapMetric] = useState('risk');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('routes'); // 'routes' or 'checkpoints'

  // Fetch routes from backend
  const calculateRoutes = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = {
        origin,
        destination,
        departure_time: departureTime,
        load_weight: Number(loadWeight),
        sample_interval_miles: Number(intervalMiles),
      };

      const res = await fetch('/api/routes/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Server responded with ${res.status}`);
      }

      const data = await res.json();
      setRoutes(data.routes || []);
      setHeatmapData(data.corridor_heatmap || null);
      setSelectedRouteId(data.best_route_id || (data.routes[0] && data.routes[0].id));
      setCurrentHour(0);
      setSelectedCheckpoint(null);
    } catch (err) {
      console.error('Failed to calculate routes:', err);
      setError(err.message || 'Failed to analyze routes. Please check network or inputs.');
    } finally {
      setIsLoading(false);
    }
  };

  // Run on initial mount
  useEffect(() => {
    calculateRoutes();
  }, []);

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Left Column: Form & Route Summaries */}
      <div className="w-[440px] shrink-0 h-full flex flex-col border-r border-slate-800 z-10 bg-slate-900 shadow-2xl">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('routes')}
            className={`flex-1 py-3 font-semibold border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === 'routes'
                ? 'border-blue-500 text-white bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            Route Planning ({routes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('checkpoints')}
            className={`flex-1 py-3 font-semibold border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === 'checkpoints'
                ? 'border-blue-500 text-white bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Checkpoints ({selectedRoute?.checkpoints?.length || 0})
          </button>
        </div>

        {/* Tab 1: Input controls & Route Selection Cards */}
        {activeTab === 'routes' ? (
          <div className="flex-1 overflow-y-auto">
            {/* Input Form */}
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

            {/* Error Banner */}
            {error && (
              <div className="m-4 p-3 rounded-xl bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Route Cards */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  Evaluated Options (3 Generated)
                </h2>
                <span className="text-[11px] text-slate-400">Ranked by Safety Rules</span>
              </div>

              {routes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  isSelected={route.id === selectedRouteId}
                  onSelect={() => setSelectedRouteId(route.id)}
                  isBest={route.is_best}
                />
              ))}

              {/* Risk Legend & Load Rules Reference */}
              <div className="pt-2">
                <RiskLegend loadWeight={loadWeight} />
              </div>
            </div>
          </div>
        ) : (
          /* Tab 2: Detailed Checkpoint Timeline */
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
              <div className="font-bold text-white flex items-center justify-between">
                <span>Active Route: {selectedRoute?.name}</span>
                <span className="text-blue-400 font-mono">#{selectedRoute?.id}</span>
              </div>
              <div className="text-slate-400 text-[11px] mt-1">
                {selectedRoute?.distance_miles} mi • {selectedRoute?.duration_hours} hrs •{' '}
                {selectedRoute?.checkpoints?.length} sampled checkpoints at {intervalMiles} mi intervals
              </div>
            </div>

            <CheckpointTimeline
              checkpoints={selectedRoute?.checkpoints || []}
              selectedCheckpointIndex={selectedCheckpoint?.index}
              onSelectCheckpoint={(cp) => setSelectedCheckpoint(cp)}
              routeDistance={selectedRoute?.distance_miles || 0}
              loadWeight={loadWeight}
            />

            <RiskLegend loadWeight={loadWeight} />
          </div>
        )}
      </div>

      {/* Right Column: Fullscreen Map + Floating Corridor Heatmap Slider */}
      <div className="flex-1 relative h-full">
        <MapComponent
          routes={routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={(id) => setSelectedRouteId(id)}
          selectedCheckpoint={selectedCheckpoint}
          heatmapData={heatmapData}
          currentHour={currentHour}
          showHeatmap={showHeatmap}
          heatmapMetric={heatmapMetric}
        />

        {/* Floating 0–48h Forecast Slider at bottom */}
        {heatmapData && (
          <div className="absolute bottom-6 left-6 right-20 z-10 max-w-3xl mx-auto">
            <ForecastSlider
              currentHour={currentHour}
              setCurrentHour={setCurrentHour}
              maxHours={heatmapData.max_hours || 48}
              heatmapData={heatmapData}
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
