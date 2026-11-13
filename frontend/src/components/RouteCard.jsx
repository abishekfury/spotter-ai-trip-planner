import React from 'react';
import { Award, Clock, Compass, ShieldAlert, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { RISK_CONFIG } from '../utils/constants';

export default function RouteCard({
  route,
  isSelected,
  onSelect,
  isBest,
}) {
  const m = route.metrics || {};
  const totalMiles = m.total_distance_miles || route.distance_miles || 1;

  // Format destination ETA
  const cps = route.checkpoints || [];
  const lastCp = cps.length > 0 ? cps[cps.length - 1] : null;
  const destEtaStr = lastCp?.estimated_arrival_time
    ? new Date(lastCp.estimated_arrival_time).toLocaleTimeString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : `${route.duration_hours} hrs`;

  // Percentages for risk bar
  const pNoTravel = ((m.no_travel_miles || 0) / totalMiles) * 100;
  const pSevere = ((m.severe_miles || 0) / totalMiles) * 100;
  const pHigh = ((m.high_miles || 0) / totalMiles) * 100;
  const pModerate = ((m.moderate_miles || 0) / totalMiles) * 100;
  const pLow = Math.max(0, 100 - (pNoTravel + pSevere + pHigh + pModerate));

  return (
    <div
      onClick={onSelect}
      className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
        isSelected
          ? 'bg-slate-900/90 border-blue-500 ring-2 ring-blue-500/30 shadow-xl'
          : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/70'
      }`}
    >
      {/* Top Header Badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {isBest ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-500/20">
              <Award className="w-3.5 h-3.5" /> #1 RECOMMENDED
            </span>
          ) : route.recommendation_rank === 2 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
              #2 RUNNER UP
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
              #3 ELEVATED RISK
            </span>
          )}
        </div>

        <div className="text-[11px] font-mono text-slate-400">
          Route #{route.id}
        </div>
      </div>

      {/* Route Name & Key Stats */}
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-bold text-white tracking-tight">{route.name}</h3>
        <span className="text-xs font-mono text-slate-300 font-semibold">
          {route.distance_miles} mi
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 py-2 px-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 mb-2.5 text-center">
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Drive Time</div>
          <div className="text-xs font-bold text-white mt-0.5 flex items-center justify-center gap-1">
            <Clock className="w-3 h-3 text-blue-400" />
            {route.duration_hours}h
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Est. Arrival</div>
          <div className="text-[11px] font-semibold text-slate-200 mt-0.5 truncate" title={destEtaStr}>
            {destEtaStr}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Avg Hazard</div>
          <div className="text-xs font-bold text-white mt-0.5">
            <span
              className={
                m.average_risk_score >= 2.0
                  ? 'text-red-400'
                  : m.average_risk_score >= 1.0
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }
            >
              {m.average_risk_score}
            </span>
            <span className="text-[10px] text-slate-500">/4.0</span>
          </div>
        </div>
      </div>

      {/* Risk Breakdown Progress Bar */}
      <div className="space-y-1 mb-2.5">
        <div className="flex justify-between items-center text-[10px] text-slate-400">
          <span>Route Risk Mileage Profile</span>
          <span>{cps.length} checkpoints</span>
        </div>
        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
          {pLow > 0 && (
            <div
              style={{ width: `${pLow}%` }}
              className="bg-emerald-500 transition-all duration-500"
              title={`Low Risk: ${m.low_miles} mi (${pLow.toFixed(1)}%)`}
            />
          )}
          {pModerate > 0 && (
            <div
              style={{ width: `${pModerate}%` }}
              className="bg-amber-500 transition-all duration-500"
              title={`Moderate Risk: ${m.moderate_miles} mi (${pModerate.toFixed(1)}%)`}
            />
          )}
          {pHigh > 0 && (
            <div
              style={{ width: `${pHigh}%` }}
              className="bg-orange-500 transition-all duration-500"
              title={`High Risk: ${m.high_miles} mi (${pHigh.toFixed(1)}%)`}
            />
          )}
          {pSevere > 0 && (
            <div
              style={{ width: `${pSevere}%` }}
              className="bg-red-500 transition-all duration-500"
              title={`Severe Risk: ${m.severe_miles} mi (${pSevere.toFixed(1)}%)`}
            />
          )}
          {pNoTravel > 0 && (
            <div
              style={{ width: `${pNoTravel}%` }}
              className="bg-red-900 transition-all duration-500"
              title={`No Travel: ${m.no_travel_miles} mi (${pNoTravel.toFixed(1)}%)`}
            />
          )}
        </div>

        {/* Breakdown chips */}
        <div className="flex flex-wrap gap-1.5 pt-1 text-[10px]">
          {m.no_travel_miles > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-800 font-bold">
              🚫 {m.no_travel_miles} mi No Travel
            </span>
          )}
          {m.severe_miles > 0 ? (
            <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">
              ⚠️ {m.severe_miles} mi Severe
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              ✓ 0 mi Severe
            </span>
          )}
          {m.high_miles > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">
              {m.high_miles} mi High
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
            {m.low_miles} mi Low
          </span>
        </div>
      </div>

      {/* Recommendation Narrative */}
      <div className="text-[11px] text-slate-300 bg-slate-950/40 p-2 rounded-lg border border-slate-800/60 leading-relaxed">
        {route.recommendation_reason}
      </div>
    </div>
  );
}
