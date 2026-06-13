// Elevation: EA 1m LiDAR DSM via live WCS, with open terrain-tile fallback.
// GeoTIFF is loaded globally from the CDN.
/* global GeoTIFF */
import { EA_WCS, TERRARIUM } from './config.js';
import { toOSGB, toWGS } from './geo.js';

let cache = null; // { e0, n0, nTop, res, w, h, grid, source, lat, lon, pad }

/** Fetch a DSM patch around (lat,lon) covering radius Rmax. Cached per location. */
export async function fetchDSM (lat, lon, Rmax) {
  if (cache && cache.lat === lat && cache.lon === lon && cache.pad >= Rmax + 20) return cache;
  const [e, n] = toOSGB(lon, lat);
  const pad = Rmax + 20;
  const e0 = Math.floor(e - pad), n0 = Math.floor(n - pad);
  const e1 = Math.ceil(e + pad), n1 = Math.ceil(n + pad);

  // 1) England: EA 1m LiDAR (includes buildings/trees)
  try {
    const r = await fetch(`${EA_WCS}&subset=E(${e0},${e1})&subset=N(${n0},${n1})`);
    if (r.ok) {
      const tiff = await GeoTIFF.fromArrayBuffer(await r.arrayBuffer());
      const img = await tiff.getImage();
      const data = (await img.readRasters())[0];
      const w = img.getWidth(), h = img.getHeight();
      const grid = new Float32Array(w * h);
      let valid = 0, zeros = 0;
      for (let i = 0; i < w * h; i++) {
        const v = data[i];
        if (v < -1e30 || v === undefined || isNaN(v)) grid[i] = NaN;
        else { grid[i] = v; valid++; if (v === 0) zeros++; }
      }
      // EA serves zero-fill outside England (e.g. Wales) — reject as fake
      if (valid > w * h * 0.4 && zeros < valid * 0.9) {
        cache = { e0, n0: n1 - h, nTop: n1, res: (e1 - e0) / w, w, h, grid, source: 'lidar', lat, lon, pad };
        return cache;
      }
    }
  } catch (err) { /* fall through */ }

  // 2) Fallback: AWS open terrain tiles (~30m, ground only) — Wales & gaps
  try {
    const z = 14, res = 5;
    const w2 = Math.ceil((e1 - e0) / res), h2 = Math.ceil((n1 - n0) / res);
    const grid = new Float32Array(w2 * h2).fill(NaN);
    const tileFor = (la, lo) => {
      const x = (lo + 180) / 360 * 2 ** z;
      const y = (1 - Math.log(Math.tan(la * Math.PI / 180) + 1 / Math.cos(la * Math.PI / 180)) / Math.PI) / 2 * 2 ** z;
      return [x, y];
    };
    const needed = {};
    for (const [ce, cn] of [[e0, n0], [e1, n0], [e0, n1], [e1, n1]]) {
      const [lo, la] = toWGS(ce, cn);
      const [tx, ty] = tileFor(la, lo);
      needed[`${Math.floor(tx)}_${Math.floor(ty)}`] = 1;
    }
    const tiles = {};
    await Promise.all(Object.keys(needed).map(async k => {
      const [tx, ty] = k.split('_').map(Number);
      const img = new Image(); img.crossOrigin = 'anonymous';
      await new Promise((res2, rej) => { img.onload = res2; img.onerror = rej; img.src = `${TERRARIUM}/${z}/${tx}/${ty}.png`; });
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
      tiles[k] = cx.getImageData(0, 0, 256, 256).data;
    }));
    for (let row = 0; row < h2; row++) {
      for (let col = 0; col < w2; col++) {
        const [lo, la] = toWGS(e0 + col * res, n1 - row * res);
        const [tx, ty] = tileFor(la, lo);
        const k = `${Math.floor(tx)}_${Math.floor(ty)}`;
        if (!tiles[k]) continue;
        const px = Math.min(255, Math.floor((tx % 1) * 256)), py = Math.min(255, Math.floor((ty % 1) * 256));
        const i4 = (py * 256 + px) * 4, d = tiles[k];
        grid[row * w2 + col] = (d[i4] * 256 + d[i4 + 1] + d[i4 + 2] / 256) - 32768; // terrarium decode
      }
    }
    cache = { e0, n0, nTop: n1, res, w: w2, h: h2, grid, source: 'terrain', lat, lon, pad };
    return cache;
  } catch (err) { return null; }
}

/** Sample the DSM grid at OSGB easting/northing (NaN if outside). */
export function dsmAt (d, e, n) {
  const col = Math.round((e - d.e0) / d.res), row = Math.round((d.nTop - n) / d.res);
  if (col < 0 || row < 0 || col >= d.w || row >= d.h) return NaN;
  return d.grid[row * d.w + col];
}
