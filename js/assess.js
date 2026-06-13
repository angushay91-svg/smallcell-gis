// Economic assessment of a candidate site: who and what the footprint reaches.
import { GREEN_BOOK_DISCOUNT } from './config.js';
import { dist, overlapFrac, toOSGB } from './geo.js';
import { tilesAround } from './datatiles.js';

/**
 * Assess a site. vs (optional) is a viewshed from radio.viewshed — when present,
 * all quantities are weighted by the actual RF footprint instead of the full circle.
 */
export async function assess (lat, lon, R, vs = null) {
  const tiles = await tilesAround(lat, lon, R + 2500);

  // candidate Output Areas near the site
  const cands = [];
  for (const t of tiles) {
    for (const o of t.oas) {
      const d = dist(lat, lon, o[2], o[1]);
      if (d < R + 2500) cands.push({ o, d, lad: t.lads[o[7]] });
    }
  }
  if (!cands.length) return null;

  // effective OA radius ≈ 0.62 × nearest-neighbour distance (disc packing), clamped
  for (const c of cands) {
    let nn = 1e9;
    for (const c2 of cands) {
      if (c2 !== c) { const dd = dist(c.o[2], c.o[1], c2.o[2], c2.o[1]); if (dd < nn) nn = dd; }
    }
    c.r = Math.min(2000, Math.max(60, 0.62 * (nn === 1e9 ? 300 : nn)));
  }

  // footprint weighting: fraction of an OA's disc the viewshed actually serves
  const maskFrac = (c) => {
    if (!vs) return 1;
    const [e, n] = toOSGB(c.o[1], c.o[2]);
    const rr = Math.min(c.r, 150);
    let s = 0, nPts = 0;
    for (const [dx, dy] of [[0, 0], [rr, 0], [-rr, 0], [0, rr], [0, -rr],
      [rr * .7, rr * .7], [-rr * .7, rr * .7], [rr * .7, -rr * .7], [-rr * .7, -rr * .7]]) {
      s += vs.covered(e + dx, n + dy); nPts++;
    }
    return s / nPts;
  };

  let pop = 0, hh = 0, gva = 0, biz = 0, uprn = 0, imdW = 0, imdN = 0;
  const lads = {}, covered = [];
  for (const c of cands) {
    let f = overlapFrac(Math.max(c.d, 0.01), R, c.r);
    if (f <= 0) continue;
    const mf = maskFrac(c);
    f *= mf; c.mf = mf;
    if (f <= 0) continue;
    pop += f * c.o[3]; hh += f * c.o[4]; gva += f * c.o[5]; biz += f * c.o[8]; uprn += f * (c.o[9] || 0);
    if (c.o[6] > 0) { imdW += f * c.o[3] * c.o[6]; imdN += f * c.o[3]; }
    lads[c.lad] = (lads[c.lad] || 0) + f * c.o[3];
    covered.push(c);
  }

  // transport stops inside the footprint (exact NaPTAN points)
  const stops = { bus: 0, rail: 0, tram: 0, ferry: 0 }, stopPts = [];
  for (const t of tiles) {
    for (const s of (t.stops || [])) {
      if (dist(lat, lon, s[1], s[0]) > R) continue;
      if (vs) { const [e, n] = toOSGB(s[0], s[1]); if (!vs.covered(e, n)) continue; }
      stops[['bus', 'rail', 'tram', 'ferry'][s[2]]]++; stopPts.push(s);
    }
  }

  const lad = Object.entries(lads).sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 2).join(' / ') || '—';
  return { lat, lon, R, pop, hh, gva, biz, uprn, stops, stopPts, imd: imdN > 0 ? imdW / imdN : 0, lad, covered, vs };
}

/** Annual + 10-year value of new coverage given slider assumptions. */
export function valueModel (res, upliftPct, consumerGBP) {
  const gvaYear = res.gva * 1000;                       // tiles store £k
  const productivity = upliftPct / 100 * gvaYear;
  const consumer = consumerGBP * res.pop;
  const annual = productivity + consumer;
  let npv10 = 0;
  for (let t = 1; t <= 10; t++) npv10 += annual / Math.pow(1 + GREEN_BOOK_DISCOUNT, t);
  return { gvaYear, productivity, consumer, annual, npv10 };
}
