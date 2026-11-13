import React, { useEffect, useState } from 'react';
import { Play, Pause, RotateCcw, Flame, Wind, CloudRain, Eye, EyeOff } from 'lucide-react';

export default function ForecastSlider({
  currentHour,
  setCurrentHour,
  maxHours = 48,
  departureMs,
  showHeatmap,
  setShowHeatmap,
  heatmapMetric,
  setHeatmapMetric,
}) {
  const [isPlaying, setIsPlaying] = useState(false);

  // Auto-play interval
  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentHour((prev) => {
          if (prev >= maxHours) {
            setIsPlaying(false);
            return maxHours;
          }
          return prev + 1;
        });
      }, 700);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isPlaying, maxHours, setCurrentHour]);

  const formattedTime = new Date(departureMs + currentHour * 3600000).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-2xl backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>Trip Corridor Forecast Slider</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Departure shift 0–48h
              </span>
            </div>
            <div className="text-[11px] text-slate-300 font-medium flex items-center gap-1.5 mt-0.5">
              <span className="text-orange-400 font-bold">Depart +{currentHour}h</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-300">{formattedTime}</span>
            </div>
          </div>
        </div>

        {/* Controls: Metric Selector & Visibility Toggle */}
        <div className="flex items-center gap-2">
          {/* Metric Selector */}
          <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
            <button
              type="button"
              onClick={() => setHeatmapMetric('risk')}
              className={`px-2 py-1 rounded transition ${
                heatmapMetric === 'risk'
                  ? 'bg-orange-500 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Risk Level
            </button>
            <button
              type="button"
              onClick={() => setHeatmapMetric('wind')}
              className={`px-2 py-1 rounded transition ${
                heatmapMetric === 'wind'
                  ? 'bg-cyan-500 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Wind mph
            </button>
            <button
              type="button"
              onClick={() => setHeatmapMetric('precip')}
              className={`px-2 py-1 rounded transition ${
                heatmapMetric === 'precip'
                  ? 'bg-blue-500 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Precip / Snow
            </button>
          </div>

          {/* Toggle Heatmap Overlay */}
          <button
            type="button"
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition ${
              showHeatmap
                ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title={showHeatmap ? 'Hide Corridor Heatmap' : 'Show Corridor Heatmap'}
          >
            {showHeatmap ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span className="text-[11px] font-medium hidden sm:inline">
              {showHeatmap ? 'Heatmap On' : 'Heatmap Off'}
            </span>
          </button>
        </div>
      </div>

      {/* Slider Track and Play Buttons */}
      <div className="flex items-center gap-3">
        {/* Play / Pause Button */}
        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 transition shrink-0"
          title={isPlaying ? 'Pause 48h simulation' : 'Play 48h forecast simulation'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
        </button>

        {/* Reset to 0 */}
        <button
          type="button"
          onClick={() => {
            setIsPlaying(false);
            setCurrentHour(0);
          }}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition shrink-0"
          title="Reset to departure (Hour 0)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Range Slider */}
        <div className="flex-1 relative flex flex-col justify-center">
          <input
            type="range"
            min="0"
            max={maxHours}
            step="1"
            value={currentHour}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentHour(Number(e.target.value));
            }}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 focus:outline-none"
          />

          {/* Time markers */}
          <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1 px-1">
            <span>0h Dep</span>
            <span>+12h</span>
            <span>+24h</span>
            <span>+36h</span>
            <span>+48h Max</span>
          </div>
        </div>
      </div>
    </div>
  );
}
