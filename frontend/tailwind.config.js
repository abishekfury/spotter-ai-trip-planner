/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        risk: {
          low: '#10B981',       // emerald-500
          moderate: '#F59E0B',  // amber-500
          high: '#F97316',      // orange-500
          severe: '#EF4444',    // red-500
          notravel: '#991B1B',  // red-800
        }
      }
    },
  },
  plugins: [],
};
