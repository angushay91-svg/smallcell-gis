// Tower Locator: estimated cell sites from drive-test data (loaded locally, never uploaded).
/* global L */
import { CARRIER_COLOURS, rsrpHex } from './config.js';
import { convexHull, bounds } from './geo.js';
import { map, flyTo, baseTheme, onBaseChange } from './map.js';

let towersIdx = null;
const chunks = {};
let towerLayer = null, footLayer = null;
let selected = null;
// remember the current view so we can re-render when the base map (and thus the
// contrast we need) changes; footprint colours are tuned per background.
let lastFilters = null, lastOnSelect = null, selTower = null;
// one shared canvas for towers + footprints so clicks always hit-test correctly
let sharedCanvas = null;
const canvas = () => (sharedCanvas ??= L.canvas({ padding: .3 }));

export function haveData () { return !!towersIdx; }
export function towers () { return towersIdx?.towers ?? []; }

// Per-base-map contrast. Dark is the original look (unchanged). Streets adds a
// dark outline so bright RSRP dots read on a light background; Satellite adds a
// white outline + heavier casing so they read on busy imagery.
function footStyle (theme) {
  if (theme === 'streets') return {
    ptStroke: true, ptColor: 'rgba(17,17,17,.9)', ptWeight: 1, ptFill: 1,
    spokeOpacity: .38, spokeWeight: 1, spokeColorDark: true,
    hullWeight: 3, hullFill: .12, casing: 'rgba(255,255,255,.9)', casingWeight: 5,
    ring: '#0b1220',
  };
  if (theme === 'satellite') return {
    ptStroke: true, ptColor: 'rgba(255,255,255,.92)', ptWeight: 1, ptFill: 1,
    spokeOpacity: .55, spokeWeight: 1.4, spokeColorDark: false,
    hullWeight: 3, hullFill: .14, casing: 'rgba(0,0,0,.6)', casingWeight: 5,
    ring: '#ffffff',
  };
  return { // dark — unchanged from original
    ptStroke: false, ptColor: null, ptWeight: 0, ptFill: .85,
    spokeOpacity: .22, spokeWeight: 1, spokeColorDark: false,
    hullWeight: 2.5, hullFill: .06, casing: null, casingWeight: 0,
    ring: '#fff',
  };
}

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
  lastFilters = filters; lastOnSelect = onSelect;
  if (towerLayer) map.removeLayer(towerLayer);
  towerLayer = L.layerGroup();
  const theme = baseTheme();
  const ring = theme === 'satellite' ? '#f8fafc' : '#0b1220';
  const ringW = theme === 'satellite' ? 2 : 1.5;
  let n = 0;
  for (const t of towers()) {
    if (!filters.carriers.includes(t.car) || !filters.techs.includes(t.tech)) continue;
    n++;
    L.circleMarker([t.lat, t.lon], {
      renderer: canvas(), radius: t.tech === '5G' ? 7 : 5,
      color: ring, weight: ringW, fillColor: CARRIER_COLOURS[t.car] || '#999', fillOpacity: .95,
    }).bindTooltip(`🗼 ${t.car.toUpperCase()} ${t.tech} · site ${t.gid}<br>${t.n.toLocaleString()} samples · best ${t.best} dBm`
        + (t.unc != null ? `<br>±${t.unc} m (conf ${t.conf || '?'})` : ''))
      .on('click', (e) => {
        // stop the click reaching the map's background handler (which clears
        // the footprint). NB: pass the LEAFLET event — L.DomEvent sets
        // originalEvent._stopped, which Map._fireDOMEvent checks; passing the
        // raw DOM event only calls native stopPropagation, which Leaflet's
        // canvas dispatch loop ignores.
        L.DomEvent.stopPropagation(e);
        onSelect(t);
      })
      .addTo(towerLayer);
  }
  towerLayer.addTo(map);
  return n;
}

export function isSelected (t) { return selected === t.id; }

/** Show a tower's measured footprint: spokes, points, hull. Hides other towers.
 *  refit=false keeps the current view (used when only re-styling for a new base map). */
export async function showFootprint (t, refit = true) {
  if (selected === t.id && footLayer && refit) { clearFootprint(); return null; }
  if (footLayer) { map.removeLayer(footLayer); footLayer = null; }
  selected = t.id; selTower = t;
  if (!chunks[t.ck]) {
    try { chunks[t.ck] = await (await fetch(`data/towers/c_${t.ck}.json`)).json(); }
    catch (e) { selected = null; return null; }
  }
  const pts = chunks[t.ck][t.id] || [];
  const st = footStyle(baseTheme());
  footLayer = L.layerGroup();
  const rend = canvas();
  for (const p of pts) {
    L.polyline([[t.lat, t.lon], [p[0], p[1]]],
      { renderer: rend, color: st.spokeColorDark ? '#334155' : rsrpHex(p[2]),
        weight: st.spokeWeight, opacity: st.spokeOpacity, interactive: false }).addTo(footLayer);
  }
  for (const p of pts) {
    L.circleMarker([p[0], p[1]],
      { renderer: rend, radius: 4, stroke: st.ptStroke, color: st.ptColor, weight: st.ptWeight,
        fillColor: rsrpHex(p[2]), fillOpacity: st.ptFill, interactive: false }).addTo(footLayer);
  }
  const hull = convexHull(pts.concat([[t.lat, t.lon, 0]])));
  if (hull) {
    if (st.casing) {  // contrast casing under the coloured outline (light/photo bases)
      L.polygon(hull, { renderer: rend, color: st.casing, weight: st.casingWeight,
        opacity: .9, fill: false, interactive: false }).addTo(footLayer);
    }
    L.polygon(hull, {
      renderer: rend, color: CARRIER_COLOURS[t.car], weight: st.hullWeight, dashArray: '8 5',
      fillColor: CARRIER_COLOURS[t.car], fillOpacity: st.hullFill, interactive: false,
    }).addTo(footLayer);
  }
  L.circleMarker([t.lat, t.lon],
    { radius: 11, color: st.ring, weight: 3, fillColor: CARRIER_COLOURS[t.car], fillOpacity: 1, interactive: false }).addTo(footLayer);
  map.removeLayer(towerLayer);            // hide the other towers while one is selected
  footLayer.addTo(map);
  if (refit) map.fitBounds(bounds(pts.map(p => [p[0], p[1]]).concat([[t.lat, t.lon]])), { padding: [30, 30] });
  return { tower: t, points: pts.length };
}

export function clearFootprint () {
  if (footLayer) { map.removeLayer(footLayer); footLayer = null; }
  selected = null; selTower = null;
  if (towerLayer && !map.hasLayer(towerLayer)) towerLayer.addTo(map);
}

export function exitMode () {
  if (towerLayer) { map.removeLayer(towerLayer); towerLayer = null; }
  if (footLayer) { map.removeLayer(footLayer); footLayer = null; }
  selected = null; selTower = null;
}

export function fitAll () {
  const ts = towers();
  if (ts.length) map.fitBounds(bounds(ts.map(t => [t.lat, t.lon])), { padding: [20, 20] });
}

// re-render with the right contrast when the base map changes (no view change)
onBaseChange(() => {
  if (!towersIdx) return;
  if (selTower && footLayer) { const t = selTower; selected = null; showFootprint(t, false); }
  else if (towerLayer && lastFilters) { draw(lastFilters, lastOnSelect); }
});

export { flyTo };
