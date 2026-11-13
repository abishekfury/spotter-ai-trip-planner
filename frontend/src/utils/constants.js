export const RISK_CONFIG = {
  Low: {
    label: 'Low',
    color: '#10B981', // emerald-500
    bg: 'bg-emerald-500/20',
    border: 'border-emerald-500/40',
    text: 'text-emerald-400',
    dot: 'bg-emerald-500',
  },
  Moderate: {
    label: 'Moderate',
    color: '#F59E0B', // amber-500
    bg: 'bg-amber-500/20',
    border: 'border-amber-500/40',
    text: 'text-amber-400',
    dot: 'bg-amber-500',
  },
  High: {
    label: 'High',
    color: '#F97316', // orange-500
    bg: 'bg-orange-500/20',
    border: 'border-orange-500/40',
    text: 'text-orange-400',
    dot: 'bg-orange-500',
  },
  Severe: {
    label: 'Severe',
    color: '#EF4444', // red-500
    bg: 'bg-red-500/20',
    border: 'border-red-500/40',
    text: 'text-red-400',
    dot: 'bg-red-500',
  },
  'No Travel': {
    label: 'No Travel',
    color: '#991B1B', // red-800
    bg: 'bg-red-950/70',
    border: 'border-red-600/70',
    text: 'text-red-300 font-semibold',
    dot: 'bg-red-700 ring-2 ring-red-400',
  },
};

export const QUICK_PRESETS = [
  {
    name: 'Midwest to Rockies (I-80 / I-76)',
    origin: { name: 'Chicago, IL', lat: 41.8781, lng: -87.6298 },
    destination: { name: 'Denver, CO', lat: 39.7392, lng: -104.9903 },
    weight: 42000,
    desc: 'High plains wind & mountain snow test corridor',
  },
  {
    name: 'Southern Cross-Country (I-20 / I-30)',
    origin: { name: 'Dallas, TX', lat: 32.7767, lng: -96.7970 },
    destination: { name: 'Atlanta, GA', lat: 33.7490, lng: -84.3880 },
    weight: 35000,
    desc: 'Severe thunderstorm & heavy rain front corridor',
  },
  {
    name: 'Pacific Northwest to Great Basin (I-84)',
    origin: { name: 'Seattle, WA', lat: 47.6062, lng: -122.3321 },
    destination: { name: 'Salt Lake City, UT', lat: 40.7608, lng: -111.8910 },
    weight: 46000,
    desc: 'Gorge winds & winter mountain pass corridor',
  },
  {
    name: 'Northern Freight Belt (I-90 / I-94)',
    origin: { name: 'Minneapolis, MN', lat: 44.9778, lng: -93.2650 },
    destination: { name: 'Chicago, IL', lat: 41.8781, lng: -87.6298 },
    weight: 28000,
    desc: 'Rapid lake-effect weather corridor',
  },
];
