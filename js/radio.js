// RF model: ray-cast viewshed over the DSM + 3GPP TR 38.901 UMi path loss → RSRP per pixel.
import { RSRP_SERVING_THRESHOLD, RX_HEIGHT_M } from './config.js';
import { toOSGB } from './geo.js';
import { dsmAt } from './terrain.js';

/**
 * Compute the RSRP footprint around a candidate site.
 * @param d        DSM patch from terrain.fetchDSM
 * @param lat,lon  site position
 * @param opts     { mastHeight, Rmax, bandMHz, eirp }
 * @returns viewshed object or null when no usable surface under the mast
 */
export function viewshed (d, lat, lon, { mastHeight, Rmax, bandMHz, eirp }) {
  const [eC, nC] = toOSGB(lon, lat);
  let base = dsmAt(d, eC, nC);
  if (isNaN(base)) { // search nearby for a valid base height
    for (let r = 1; r < 10 && isNaN(base); r++) {
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
        const v = dsmAt(d, eC + dx * d.res, nC + dy * d.res);
        if (!isNaN(v)) { base = v; break; }
      }
    }
    if (isNaN(base)) return null;
  }

  const txH = base + mastHeight;
  const step = Math.max(d.res, 1);
  const size = Math.ceil(2 * Rmax / step) + 1;
  const half = Math.floor(size / 2);

  // --- line-of-sight mask by radial ray casting
  const mask = new Uint8Array(size * size);
  const nRays = Math.max(720, Math.ceil(2 * Math.PI * Rmax / step));
  for (let ri = 0; ri < nRays; ri++) {
    const az = ri / nRays * 2 * Math.PI, sx = Math.sin(az), sy = Math.cos(az);
    let maxAng = -Infinity;
    for (let distM = step; distM <= Rmax; distM += step) {
      const e = eC + sx * distM, n = nC + sy * distM;
      let z = dsmAt(d, e, n); if (isNaN(z)) z = base;
      if ((z + RX_HEIGHT_M - txH) / distM >= maxAng) {
        const mc = half + Math.round(sx * distM / step), mr = half - Math.round(sy * distM / step);
        if (mc >= 0 && mr >= 0 && mc < size && mr < size) mask[mr * size + mc] = 1;
      }
      const angObs = (z - txH) / distM;
      if (angObs > maxAng) maxAng = angObs;
    }
  }
  // dilate to close radial gaps
  const m2 = new Uint8Array(mask);
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      if (!mask[r * size + c] &&
        (mask[r * size + c - 1] + mask[r * size + c + 1] + mask[(r - 1) * size + c] + mask[(r + 1) * size + c]) >= 2) {
        m2[r * size + c] = 1;
      }
    }
  }
  m2[half * size + half] = 1;

  // --- 3GPP TR 38.901 UMi path loss: LOS curve where rays see, NLOS where shadowed
  const fGHz = bandMHz / 1000;
  const RE_OFF = 10 * Math.log10(12 * 100);   // per-resource-element offset (20 MHz / 100 RB)
  const hBS = Math.max(mastHeight, 4), hUT = RX_HEIGHT_M;
  const dBP = 4 * (hBS - 1) * (hUT - 1) * fGHz * 1e9 / 3e8;
  const plLOS = (d3, d2) => d2 <= dBP
    ? 32.4 + 21 * Math.log10(Math.max(d3, 1)) + 20 * Math.log10(fGHz)
    : 32.4 + 40 * Math.log10(d3) + 20 * Math.log10(fGHz) - 9.5 * Math.log10(dBP * dBP + (hBS - hUT) ** 2);

  const rsrp = new Float32Array(size * size).fill(-999);
  let cov = 0, tot = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const d2 = Math.hypot(c - half, r - half) * step;
      if (d2 > Rmax) continue;
      tot++;
      const e = eC + (c - half) * step, n = nC - (r - half) * step;
      let z = dsmAt(d, e, n); if (isNaN(z)) z = base;
      const d3 = Math.sqrt(d2 * d2 + (txH - (z + hUT)) ** 2);
      const los = plLOS(d3, d2);
      const pl = m2[r * size + c] ? los
        : Math.max(los, 22.4 + 35.3 * Math.log10(Math.max(d3, 1)) + 21.3 * Math.log10(fGHz));
      const v = eirp - RE_OFF - pl;
      rsrp[r * size + c] = v;
      if (v >= RSRP_SERVING_THRESHOLD) cov++;
    }
  }

  return {
    mask: m2, rsrp, size, half, step, eC, nC,
    frac: cov / tot, source: d.source, band: bandMHz, eirp, th: RSRP_SERVING_THRESHOLD,
    covered: (e, n) => {
      const c = half + Math.round((e - eC) / step), r = half - Math.round((n - nC) / step);
      return (c >= 0 && r >= 0 && c < size && r < size)
        ? (rsrp[r * size + c] >= RSRP_SERVING_THRESHOLD ? 1 : 0) : 0;
    },
  };
}
