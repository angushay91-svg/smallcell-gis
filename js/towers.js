// Tower Locator: estimated cell sites from drive-test data (loaded locally, never uploaded).
/* global L */
import { CARRIER_COLOURS, rsrpHex } from './config.js';
import { convexHull, bounds } from './geo.js';
import { map, flyTo } from './map.js';

let towersIdx = null;
const chunks = {};
let towerLayer = null, footLayer = null;
let selected = null;
// one shared canvas for towers + footprints so clicks always hit-test correctly
let sharedCanvas = null;
const canvas = () => (sharedCanvas ??= L.canvas({ padding: .3 }));

export function haveData () { return !!towersIdx; }
export function towers () { return towersIdx?.towers ?? []; }

/** Parse a local dorset_towers.json file (read in-browser; never uploaded). */
export function loadFile (file, onDone, onError) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      towersIdx = { meta: d.meta, towers: d.towers };
      if (d.chunks) Object.assign(chunks, d.chunks);
      onDone(d.towers.length);
    } catch (e) { onError('Could not read that file — is it the dorset_towers.json?'); }
  };
  rd.readAsText(file);
}

export function draw (filters, onSelect) {
  if (towerLayer) map.removeLayer(towerLayer);
  towerLayer = L.layerGroup();
  let n = 0;
  for (const t of towers()) {
    if (!filters.carriers.includes(t.car) || !filters.techs.includes(t.tech)) continue;
    n++;
    L.circleMarker([t.lat, t.lon], {
      renderer: canvas(), radius: t.tech === '5G' ? 7 : 5,
      color: '#0b1220', weight: 1.5, fillColor: CARRIER_COLOURS[t.car] || '#999', fillOpacity: .95,
    }).bindTooltip(`🗼 ${t.car.toUpperCase()} ${t.tech} · site ${t.gid}<br>${t.n.toLocaleString()} samples · best ${t.best} dBm`
        + (t.unc != null ? `<br>±${t.unc} m (conf ${t.conf || '?'})` : ''))
      .on('click', () => onSelect(t))
      .addTo(towerLayer);
  }
  towerLayer.addTo(map);
  return n;
}

export function isSelected (t) { return selected === t.id; }

/** Show a tower's measured footprint: spokes, points, hull. Hides other towers. */
export async function showFootprint (t) {
  if (selected === t.id && footLayer) { clearFootprint(); return null; }
  if (footLayer) { map.removeLayer(footLayer); footLayer = null; }
  selected = t.id;
  if (!chunks[t.ck]) {
    try { chunks[t.ck] = await (await fetch(`data/towers/c_${t.ck}.json`)).json(); }
    catch (e) { selected = null; return null; }
  }
  const pts = chunks[t.ck][t.id] || [];
  footLayer = L.layerGroup();
  const rend = canvas();
  for (const p of pts) {
    L.polyline([[t.lat, t.lon], [p[0], p[1]]],
      { renderer: rend, color: rsrpHex(p[2]), weight: 1, opacity: .22, interactive: false }).addTo(footLayer);
  }
  for (const p of pts) {
    L.circleMarker([p[0], p[1]],
      { renderer: rend, radius: 4, stroke: false, fillColor: rsrpHex(p[2]), fillOpacity: .85, interactive: false }).addTo(footLayer);
  }
  const hull = convexHull(pts.concat([[t.lat, t.lon, 0]]));
  if (hull) {
    L.polygon(hull, {
      color: CARRIER_COLOURS[t.car], weight: 2.5, dashArray: '8 5',
      fillColor: CARRIER_COLOURS[t.car], fillOpacity: .06, interactive: false,
    }).addTo(footLayer);
  }
  L.circleMarker([t.lat, t.lon],
    { radius: 11, color: '#fff', weight: 3, fillColor: CARRIER_COLOURS[t.car], fillOpacity: 1, interactive: false }).addTo(footLayer);
  map.removeLayer(towerLayer);            // hide the other towers while one is selected
  footLayer.addTo(map);
  map.fitBounds(bounds(pts.map(p => [p[0], p[1]]).concat([[t.lat, t.lon]])), { padding: [30, 30] });
  return { tower: t, points: pts.length };
}

export function clearFootprint () {
  if (footLayer) { map.removeLayer(footLayer); footLayer = null; }
  selected = null;
  if (towerLayer && !map.hasLayer(towerLayer)) towerLayer.addTo(map);
}

export function exitMode () {
  if (towerLayer) { map.removeLayer(towerLayer); towerLayer = null; }
  if (footLayer) { map.removeLayer(footLayer); footLayer = null; }
  selected = null;
}

export function fitAll () {
  const ts = towers();
  if (ts.length) map.fitBounds(bounds(ts.map(t => [t.lat, t.lon])), { padding: [20, 20] });
}

export { flyTo };
