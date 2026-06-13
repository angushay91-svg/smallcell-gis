// Census/economic data tiles: loading, caching, lookup.
// Tile record fields (see data/index.json meta):
// [oa21cd, lon, lat, population, households, gva_gbp_thousands, imd_decile, lad_index, businesses, uprn_count]
import { TILE_DEG } from './config.js';

const cache = {};
let index = null;

export async function loadIndex () {
  if (!index) {
    try { index = await (await fetch('data/index.json')).json(); } catch (e) { index = { tiles: {} }; }
  }
  return index;
}

export function tileId (lon, lat) {
  return Math.floor(lon / TILE_DEG) + '_' + Math.floor(lat / TILE_DEG);
}

export async function getTile (id) {
  if (cache[id] !== undefined) return cache[id];
  if (index && !(id in index.tiles)) { cache[id] = null; return null; }
  try {
    const r = await fetch('data/tiles/' + id + '.json');
    cache[id] = r.ok ? await r.json() : null;
  } catch (e) { cache[id] = null; }
  return cache[id];
}

/** All loaded tiles covering a padded box around (lat,lon). */
export async function tilesAround (lat, lon, padMetres) {
  const pad = padMetres / 111320;
  const ids = new Set();
  for (const dx of [-pad, 0, pad]) {
    for (const dy of [-pad, 0, pad]) {
      ids.add(tileId(lon + dx / Math.cos(lat * Math.PI / 180), lat + dy));
    }
  }
  return (await Promise.all([...ids].map(getTile))).filter(t => t);
}

/** Tiles intersecting a Leaflet-style bounds object. */
export async function tilesInBounds (b) {
  const ids = new Set();
  for (let lon = b.getWest(); lon <= b.getEast() + TILE_DEG; lon += TILE_DEG) {
    for (let lat = b.getSouth(); lat <= b.getNorth() + TILE_DEG; lat += TILE_DEG) {
      ids.add(tileId(lon, lat));
    }
  }
  return (await Promise.all([...ids].map(getTile))).filter(t => t);
}
