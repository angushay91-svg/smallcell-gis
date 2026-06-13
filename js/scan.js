// Best-site scan: grid-search the visible map area for the highest-value candidate sites.
// Uses whole-block counting (no terrain) — it's a fast relative ranking, not a full assessment.
import { dist } from './geo.js';
import { tilesInBounds } from './datatiles.js';

export async function findBest (mapBounds, R, upliftPct, consumerGBP, nTop = 5) {
  const tiles = await tilesInBounds(mapBounds);
  const b = mapBounds;
  const oas = [];
  for (const t of tiles) {
    for (const o of t.oas) {
      if (o[1] > b.getWest() - 0.01 && o[1] < b.getEast() + 0.01 &&
          o[2] > b.getSouth() - 0.01 && o[2] < b.getNorth() + 0.01) oas.push(o);
    }
  }
  // bucket OAs for speed
  const cell = Math.max(R, 250) / 111320, buck = {};
  for (const o of oas) {
    const k = Math.floor(o[1] / cell) + '_' + Math.floor(o[2] / cell);
    (buck[k] = buck[k] || []).push(o);
  }
  const N = 40, dLat = (b.getNorth() - b.getSouth()) / N, dLon = (b.getEast() - b.getWest()) / N;
  const scores = [];
  for (let gy = 0; gy <= N; gy++) {
    for (let gx = 0; gx <= N; gx++) {
      const lat = b.getSouth() + gy * dLat, lon = b.getWest() + gx * dLon;
      let pop = 0, gva = 0;
      const cx = Math.floor(lon / cell), cy = Math.floor(lat / cell);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          for (const o of (buck[(cx + i) + '_' + (cy + j)] || [])) {
            if (dist(lat, lon, o[2], o[1]) <= R) { pop += o[3]; gva += o[5]; }
          }
        }
      }
      if (pop + gva > 0) scores.push({ lat, lon, v: upliftPct / 100 * gva * 1000 + consumerGBP * pop });
    }
  }
  scores.sort((a, b2) => b2.v - a.v);
  const top = [];
  for (const s of scores) {
    if (top.length >= nTop) break;
    if (top.every(t => dist(s.lat, s.lon, t.lat, t.lon) >= 2 * R)) top.push(s);
  }
  return top;
}
