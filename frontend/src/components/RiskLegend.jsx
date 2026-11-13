import React, { useState } from 'react';
import { ShieldAlert, Info, ChevronDown, ChevronUp, Scale, Wind, CloudRain, Snowflake } from 'lucide-react';

export default function RiskLegend({ loadWeight }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-xl shadow-lg backdrop-blur text-xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-slate-300 hover:text-white font-medium"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-blue-400" />
          <span>Risk Classification & Load Rules</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Quick compact color legend bar */}
      <div className="px-3 pb-2 pt-1 flex items-center justify-between border-t border-slate-800/60 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span className="text-slate-400">Low</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
          <span className="text-slate-400">Mod</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
          <span className="text-slate-400">High</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
          <span className="text-slate-400">Severe</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-800 ring-1 ring-red-400"></span>
          <span className="text-slate-300 font-semibold">No Travel</span>
        </div>
      </div>

      {isOpen && (
        <div className="p-3 border-t border-slate-800 space-y-3">
          {/* Thresholds Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-1 pr-2">Condition</th>
                  <th className="py-1 px-1 text-emerald-400">Low</th>
                  <th className="py-1 px-1 text-amber-400">Moderate</th>
                  <th className="py-1 px-1 text-orange-400">High</th>
                  <th className="py-1 px-1 text-red-400">Severe</th>
                  <th className="py-1 pl-1 text-red-500 font-bold">No Travel</th>
                </tr>
              </thead>
              <tbody className="text-slate-300 divide-y divide-slate-800/40">
                <tr>
                  <td className="py-1 pr-2 font-medium flex items-center gap-1">
                    <Wind className="w-3 h-3 text-cyan-400" /> Wind
                  </td>
                  <td className="py-1 px-1">&lt;25 mph</td>
                  <td className="py-1 px-1">25–34</td>
                  <td className="py-1 px-1">35–44</td>
                  <td className="py-1 px-1">45–54</td>
                  <td className="py-1 pl-1 font-semibold text-red-400">≥55 mph</td>
                </tr>
                <tr>
                  <td className="py-1 pr-2 font-medium flex items-center gap-1">
                    <CloudRain className="w-3 h-3 text-blue-400" /> Rain
                  </td>
                  <td className="py-1 px-1">&lt;0.10 in</td>
                  <td className="py-1 px-1">0.10–0.25</td>
                  <td className="py-1 px-1">0.25–0.50</td>
                  <td className="py-1 px-1">0.50–1.00</td>
                  <td className="py-1 pl-1 font-semibold text-red-400">&gt;1.00 in/hr</td>
                </tr>
                <tr>
                  <td className="py-1 pr-2 font-medium flex items-center gap-1">
                    <Snowflake className="w-3 h-3 text-indigo-400" /> Snow
                  </td>
                  <td className="py-1 px-1">&lt;0.5 in</td>
                  <td className="py-1 px-1">0.5–1.0</td>
                  <td className="py-1 px-1">1.0–2.0</td>
                  <td className="py-1 px-1">2.0–3.0</td>
                  <td className="py-1 pl-1 font-semibold text-red-400">&gt;3.0 in/hr</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Load Rules Box */}
          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-blue-400">
              <Scale className="w-3.5 h-3.5" />
              <span>Weight-Specific Escalation Rules (Active load: {Number(loadWeight).toLocaleString()} lbs)</span>
            </div>
            <ul className="space-y-1 text-slate-300 text-[11px] list-disc list-inside">
              <li>
                <span className="font-semibold text-red-400">≥55 mph Wind</span> →{' '}
                <span className="text-red-400 font-bold">No Travel</span> for any load weight.
              </li>
              <li className={loadWeight > 30000 ? 'text-amber-300 font-medium' : ''}>
                <span className="font-semibold">45–54 mph Wind + &gt;30,000 lb</span> →{' '}
                <span className="text-red-400 font-bold">No Travel</span>
                {loadWeight > 30000 && <span className="text-amber-400 ml-1">(ACTIVE FOR THIS LOAD)</span>}
              </li>
              <li className={loadWeight > 40000 ? 'text-amber-300 font-medium' : ''}>
                <span className="font-semibold">35–44 mph Wind + &gt;40,000 lb</span> →{' '}
                <span className="text-orange-400 font-bold">Severe</span>
                {loadWeight > 40000 && <span className="text-amber-400 ml-1">(ACTIVE FOR THIS LOAD)</span>}
              </li>
            </ul>
          </div>

          {/* Recommendation Preference Order */}
          <div className="bg-blue-950/30 p-2 rounded-lg border border-blue-900/40 text-[11px] text-blue-200">
            <span className="font-semibold text-blue-300 block mb-1">Recommendation Priorities:</span>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <div>1. Fewest Severe miles</div>
              <div>2. Fewest High miles</div>
              <div>3. Lowest average risk</div>
              <div>4. Shortest travel times</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
