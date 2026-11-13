import React, { useState } from 'react';
import {
  ListFilter,
  Wind,
  CloudRain,
  Snowflake,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MapPin,
} from 'lucide-react';
import { RISK_CONFIG } from '../utils/constants';

export default function CheckpointTimeline({
  checkpoints = [],
  selectedCheckpointIndex,
  onSelectCheckpoint,
  routeDistance,
  loadWeight,
}) {
  const [filterRisk, setFilterRisk] = useState('ALL');
  const [isExpanded, setIsExpanded] = useState(false);

  const filtered = checkpoints.filter((cp) => {
    if (filterRisk === 'ALL') return true;
    const tier = cp.risk_assessment?.overall_risk || 'Low';
    if (filterRisk === 'HAZARD') return tier !== 'Low';
    return tier === filterRisk;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <ListFilter className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              Route Checkpoint Inspection
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                {checkpoints.length} sampled stops
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Weather & Load-Escalation at truck's calculated arrival time
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick filter tabs */}
          <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px]">
            {['ALL', 'HAZARD', 'Severe', 'No Travel'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilterRisk(f)}
                className={`px-2 py-0.5 rounded transition ${
                  filterRisk === f
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-400 hover:text-white"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Checkpoint List Table */}
      <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/60 text-xs">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs">
            No checkpoints match the "{filterRisk}" filter.
          </div>
        ) : (
          filtered.map((cp) => {
            const risk = cp.risk_assessment || {};
            const tier = risk.overall_risk || 'Low';
            const cfg = RISK_CONFIG[tier] || RISK_CONFIG.Low;
            const weather = cp.weather || {};
            const isSelected = selectedCheckpointIndex === cp.index;

            const etaDate = new Date(cp.estimated_arrival_time);
            const etaFormatted = etaDate.toLocaleTimeString([], {
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={cp.index}
                onClick={() => onSelectCheckpoint(cp)}
                className={`p-2.5 transition flex items-center justify-between gap-3 cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600/15 border-l-4 border-blue-500'
                    : 'hover:bg-slate-800/50'
                }`}
              >
                {/* Left: Mileage & ETA */}
                <div className="min-w-[110px]">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>Mile {cp.distance_from_start_miles}</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      (#{cp.index + 1})
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 font-mono">
                    <Clock className="w-3 h-3 text-blue-400" />
                    <span>ETA: {etaFormatted}</span>
                  </div>
                </div>

                {/* Middle: Weather Metrics */}
                <div className="flex-1 grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="bg-slate-950/40 p-1 rounded border border-slate-800/60">
                    <div className="text-slate-400 text-[10px] flex items-center justify-center gap-1">
                      <Wind className="w-3 h-3 text-cyan-400" /> Wind
                    </div>
                    <div className={`font-mono font-semibold ${risk.wind_risk !== 'Low' ? 'text-amber-400 font-bold' : 'text-slate-200'}`}>
                      {weather.wind_speed_mph} mph
                    </div>
                  </div>

                  <div className="bg-slate-950/40 p-1 rounded border border-slate-800/60">
                    <div className="text-slate-400 text-[10px] flex items-center justify-center gap-1">
                      <CloudRain className="w-3 h-3 text-blue-400" /> Rain
                    </div>
                    <div className={`font-mono font-semibold ${risk.rain_risk !== 'Low' ? 'text-blue-300 font-bold' : 'text-slate-200'}`}>
                      {weather.rain_in_per_hr} in/h
                    </div>
                  </div>

                  <div className="bg-slate-950/40 p-1 rounded border border-slate-800/60">
                    <div className="text-slate-400 text-[10px] flex items-center justify-center gap-1">
                      <Snowflake className="w-3 h-3 text-indigo-400" /> Snow
                    </div>
                    <div className={`font-mono font-semibold ${risk.snow_risk !== 'Low' ? 'text-indigo-300 font-bold' : 'text-slate-200'}`}>
                      {weather.snow_in_per_hr} in/h
                    </div>
                  </div>
                </div>

                {/* Right: Risk Badge & Condition */}
                <div className="min-w-[110px] text-right">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}
                  >
                    {tier}
                  </span>
                  <div className="text-[10px] text-slate-400 mt-1 truncate" title={weather.condition}>
                    {weather.condition}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
