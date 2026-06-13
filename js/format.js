// Display formatting helpers.

export function money (x) { // x in £
  if (x >= 1e9) return '£' + (x / 1e9).toFixed(2) + 'bn';
  if (x >= 1e6) return '£' + (x / 1e6).toFixed(2) + 'm';
  if (x >= 1e3) return '£' + (x / 1e3).toFixed(0) + 'k';
  return '£' + x.toFixed(0);
}

export function fmt (n) { return Math.round(n ?? 0).toLocaleString(); }

export function bandLabel (mhz) { return mhz >= 3000 ? (mhz / 1000) + ' GHz' : mhz + ' MHz'; }

export function ageOf (dateStr) {
  const days = Math.round((Date.now() - new Date(dateStr).getTime()) / 864e5);
  return days > 60 ? Math.round(days / 30) + 'mo ago' : days + 'd ago';
}
