import React, { useState, useEffect, useRef } from 'react';
import {
  Truck,
  MapPin,
  Calendar,
  Clock,
  Scale,
  Navigation,
  ArrowUpDown,
  Search,
  Sparkles,
  Sliders,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { QUICK_PRESETS } from '../utils/constants';

import { toLocalInput } from '../utils/format';

export default function Sidebar({
  origin,
  setOrigin,
  destination,
  setDestination,
  departureTime,
  setDepartureTime,
  loadWeight,
  setLoadWeight,
  intervalMiles,
  setIntervalMiles,
  onCalculate,
  isLoading,
}) {
  const [originSearch, setOriginSearch] = useState(origin?.name || 'Chicago, IL');
  const [destSearch, setDestSearch] = useState(destination?.name || 'Denver, CO');
  const [originResults, setOriginResults] = useState([]);
  const [destResults, setDestResults] = useState([]);
  const [showOriginDropdown, setShowOriginDropdown] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);

  // Debounced geocoding fetch
  useEffect(() => {
    if (!originSearch || originSearch.length < 2) {
      setOriginResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode/?q=${encodeURIComponent(originSearch)}`);
        if (res.ok) {
          const data = await res.json();
          setOriginResults(data);
        }
      } catch (err) {
        console.error('Origin geocode error:', err);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [originSearch]);

  useEffect(() => {
    if (!destSearch || destSearch.length < 2) {
      setDestResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode/?q=${encodeURIComponent(destSearch)}`);
        if (res.ok) {
          const data = await res.json();
          setDestResults(data);
        }
      } catch (err) {
        console.error('Dest geocode error:', err);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [destSearch]);

  const handleSelectOrigin = (item) => {
    setOrigin({
      name: item.display_name,
      lat: item.latitude,
      lng: item.longitude,
    });
    setOriginSearch(item.display_name);
    setShowOriginDropdown(false);
  };

  const handleSelectDest = (item) => {
    setDestination({
      name: item.display_name,
      lat: item.latitude,
      lng: item.longitude,
    });
    setDestSearch(item.display_name);
    setShowDestDropdown(false);
  };

  const handleSwap = () => {
    const tempOrig = { ...origin, name: originSearch };
    const tempDest = { ...destination, name: destSearch };
    setOrigin(tempDest);
    setOriginSearch(destSearch);
    setDestination(tempOrig);
    setDestSearch(originSearch);
  };

  const applyPreset = (preset) => {
    setOrigin(preset.origin);
    setOriginSearch(preset.origin.name);
    setDestination(preset.destination);
    setDestSearch(preset.destination.name);
    if (preset.weight) setLoadWeight(preset.weight);
  };

  const setDepartureShortcut = (type) => {
    const now = new Date();
    if (type === 'now') {
      setDepartureTime(toLocalInput(now));
    } else if (type === '+2h') {
      const d = new Date(now.getTime() + 2 * 3600 * 1000);
      setDepartureTime(toLocalInput(d));
    } else if (type === 'tomorrow') {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(6, 0, 0, 0);
      setDepartureTime(toLocalInput(d));
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              SafeHaul <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium">Weather Routing</span>
            </h1>
            <p className="text-xs text-slate-400">Load-Weighted Dynamic Safety Navigator</p>
          </div>
        </div>

        {/* Corridor Presets */}
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" /> Test Freight Corridors:
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyPreset(p)}
                className="text-left px-2 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/50 text-[11px] text-slate-300 hover:text-white transition truncate"
                title={`${p.name}: ${p.desc}`}
              >
                {p.origin.name.split(',')[0]} → {p.destination.name.split(',')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Input Form */}
      <div className="p-4 space-y-4 flex-1">
        {/* Origin & Destination */}
        <div className="space-y-2.5 relative">
          {/* Origin */}
          <div className="relative">
            <label className="text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Origin
            </label>
            <div className="relative">
              <input
                type="text"
                value={originSearch}
                onChange={(e) => {
                  setOriginSearch(e.target.value);
                  setShowOriginDropdown(true);
                }}
                onFocus={() => setShowOriginDropdown(true)}
                placeholder="Search origin city or hub..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <Search className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
            </div>

            {/* Origin Dropdown */}
            {showOriginDropdown && originResults.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                {originResults.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelectOrigin(item)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white border-b border-slate-800/50 last:border-0"
                  >
                    <div className="font-medium">{item.name}</div>
                    <div className="text-[10px] text-slate-400">{item.admin1} {item.country}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Swap Button */}
          <div className="flex justify-center -my-1">
            <button
              type="button"
              onClick={handleSwap}
              className="p-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition"
              title="Swap origin and destination"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Destination */}
          <div className="relative">
            <label className="text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-rose-400" /> Destination
            </label>
            <div className="relative">
              <input
                type="text"
                value={destSearch}
                onChange={(e) => {
                  setDestSearch(e.target.value);
                  setShowDestDropdown(true);
                }}
                onFocus={() => setShowDestDropdown(true)}
                placeholder="Search destination city or hub..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <Search className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
            </div>

            {/* Destination Dropdown */}
            {showDestDropdown && destResults.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                {destResults.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelectDest(item)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white border-b border-slate-800/50 last:border-0"
                  >
                    <div className="font-medium">{item.name}</div>
                    <div className="text-[10px] text-slate-400">{item.admin1} {item.country}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Departure Date & Time */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-400" /> Departure Date & Time
            </span>
          </label>
          <input
            type="datetime-local"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => setDepartureShortcut('now')}
              className="flex-1 py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] text-slate-300 hover:text-white"
            >
              Now
            </button>
            <button
              type="button"
              onClick={() => setDepartureShortcut('+2h')}
              className="flex-1 py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] text-slate-300 hover:text-white"
            >
              +2 Hours
            </button>
            <button
              type="button"
              onClick={() => setDepartureShortcut('tomorrow')}
              className="flex-1 py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] text-slate-300 hover:text-white"
            >
              Tomorrow 6am
            </button>
          </div>
        </div>

        {/* Load Weight */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-amber-400" /> Load Weight (lbs)
            </label>
            <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              {Number(loadWeight).toLocaleString()} lb
            </span>
          </div>

          <input
            type="number"
            min="5000"
            max="80000"
            step="1000"
            value={loadWeight}
            onChange={(e) => setLoadWeight(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
          />

          {/* Quick weight selector chips */}
          <div className="grid grid-cols-4 gap-1">
            {[
              { label: '20k Light', val: 20000 },
              { label: '35k Med', val: 35000 },
              { label: '45k Heavy', val: 45000 },
              { label: '65k Max', val: 65000 },
            ].map((w) => (
              <button
                key={w.val}
                type="button"
                onClick={() => setLoadWeight(w.val)}
                className={`py-1 px-1 rounded text-[10px] text-center border transition ${
                  loadWeight === w.val
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:text-slate-200'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>

          {/* Load Rule Active Notification */}
          <div className="text-[11px] p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
            {loadWeight > 40000 ? (
              <div className="flex items-start gap-1.5 text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <span>
                  <strong>&gt;40,000 lb active:</strong> Wind 35–44 mph escalates to <strong>Severe</strong>. Wind 45–54 mph triggers <strong>No Travel</strong>.
                </span>
              </div>
            ) : loadWeight > 30000 ? (
              <div className="flex items-start gap-1.5 text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <span>
                  <strong>&gt;30,000 lb active:</strong> Wind 45–54 mph triggers <strong>No Travel</strong>.
                </span>
              </div>
            ) : (
              <div className="text-slate-400">
                Standard baseline load (&le;30,000 lb). Wind &ge;55 mph triggers No Travel.
              </div>
            )}
          </div>
        </div>

        {/* Sampling Interval */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-purple-400" /> Weather Sampling Interval
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Every {intervalMiles} mi</span>
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {[10, 25, 50].map((miles) => (
              <button
                key={miles}
                type="button"
                onClick={() => setIntervalMiles(miles)}
                className={`py-1.5 text-xs font-medium rounded-lg border transition ${
                  intervalMiles === miles
                    ? 'bg-purple-600/30 text-purple-200 border-purple-500 font-bold'
                    : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
                }`}
              >
                {miles} miles
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/60">
        <button
          type="button"
          onClick={onCalculate}
          disabled={isLoading}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Analyzing Weather & Routing...</span>
            </>
          ) : (
            <>
              <Navigation className="w-4 h-4" />
              <span>Calculate Safest Route</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
