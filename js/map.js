// Leaflet map: base layers and all drawing (pin, footprint, data blocks, saved sites,
// best-site stars, OSM mast overlay). Leaflet is loaded globally from the CDN.
/* global L */
import { IMD_COLOURS, rsrpColor, rsrpHex } from './config.js';
import { toWGS, overlapFrac } from './geo.js';

export let map = null;
let marker = null, circle = null, oaLayer = null, losLayer = null;
let siteLayer = null, bestLayer = null, mastLayer = null;

export function initMap (containerId, onClick) {
  map = L.map(containerId, { zoomControl: true }).setView([52.6, -1.8], 7);
  const baseDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { attribution: '&copy; OpenStreetMap contributors &copy; CARTO', maxZoom: 19 });
  const baseSat = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics', maxZoom: 19 }),
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', { maxZoom: 19, pane: 'shadowPane' }),
  ]);
  const baseStreets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 });
  baseDark.addTo(map);
  L.control.layers({ '🌑 Dark': baseDark, '🛰 Satellite': baseSat, '🗺 Streets': baseStreets },
    null, { position: 'topright' }).addTo(map);
  map.on('click', e => onClick(e.latlng.lat, e.latlng.lng));
  return map;
}

export function imdColor (d) { return IMD_COLOURS[Math.round(d)] || '#999'; }

// ---------- candidate-site pin + footprint ----------
export function setPin (lat, lon, R, dashed) {
  clearPin();
  marker = L.marker([lat, lon]).addTo(map);
  circle = L.circle([lat, lon], {
    radius: R, color: '#38bdf8', weight: 2,
    dashArray: dashed ? '6 6' : null, fillOpacity: dashed ? 0 : .12,
  }).addTo(map);
}
export function clearPin () {
  for (const l of [marker, circle, oaLayer, losLayer]) if (l) map.removeLayer(l);
  marker = circle = oaLayer = losLayer = null;
}

export function drawViewshed (vs) {
  if (losLayer) { map.removeLayer(losLayer); losLayer = null; }
  if (!vs) return;
  const cv = document.createElement('canvas'); cv.width = cv.height = vs.size;
  const cx = cv.getContext('2d'); const id = cx.createImageData(vs.size, vs.size);
  for (let i = 0; i < vs.size * vs.size; i++) {
    const col = rsrpColor(vs.rsrp[i]);
    if (col) { id.data[i * 4] = col[0]; id.data[i * 4 + 1] = col[1]; id.data[i * 4 + 2] = col[2]; id.data[i * 4 + 3] = col[3]; }
  }
  cx.putImageData(id, 0, 0);
  const ext = vs.half * vs.step;
  const [w1, s1] = toWGS(vs.eC - ext, vs.nC - ext), [e2, n2] = toWGS(vs.eC + ext, vs.nC + ext);
  losLayer = L.imageOverlay(cv.toDataURL(), [[s1, w1], [n2, e2]], { opacity: .85, interactive: false }).addTo(map);
}

export function toggleDataBlocks (res) {
  if (oaLayer) { map.removeLayer(oaLayer); oaLayer = null; return false; }
  if (!res) return false;
  oaLayer = L.layerGroup();
  for (const c of res.covered) {
    const f = overlapFrac(c.d, res.R, c.r);
    L.circleMarker([c.o[2], c.o[1]], { radius: 5, color: '#111', weight: 1, fillColor: imdColor(c.o[6]), fillOpacity: .95 })
      .bindTooltip(`<b>${c.o[0]}</b><br>Pop ${c.o[3]} · HH ${c.o[4]} · UPRNs ${c.o[9] || 0} · Biz ${c.o[8]}<br>` +
        `GVA £${(c.o[5] / 1000).toFixed(1)}m · IMD ${c.o[6] || '—'}<br>Counted at ${(f * 100).toFixed(0)}%`)
      .addTo(oaLayer);
  }
  for (const s of res.stopPts) {
    L.circleMarker([s[1], s[0]], { radius: 3, color: '#0b1220', weight: 1, fillColor: ['#fbbf24', '#f87171', '#c084fc', '#22d3ee'][s[2]], fillOpacity: 1 })
      .bindTooltip(['Bus stop', 'Rail access', 'Tram/metro access', 'Ferry'][s[2]]).addTo(oaLayer);
  }
  oaLayer.addTo(map);
  return true;
}

// ---------- saved sites ----------
export function drawSavedSites (pins, onRowClick) {
  if (siteLayer) map.removeLayer(siteLayer);
  siteLayer = L.layerGroup().addTo(map);
  const sorted = [...pins].sort((a, b) => b.value_k - a.value_k);
  sorted.forEach((p, rank) => {
    L.circle([p.lat, p.lon], { radius: p.R, color: '#34d399', weight: 1.5, fillOpacity: .08 }).addTo(siteLayer);
    L.marker([p.lat, p.lon], {
      icon: L.divIcon({
        className: '',
        html: `<div style="background:#34d399;color:#06281c;font-weight:800;font-size:11px;border-radius:99px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:2px solid #06281c">${rank + 1}</div>`,
        iconSize: [22, 22], iconAnchor: [11, 11],
      }),
    }).bindTooltip(`${p.name} — ${p.value_k.toLocaleString()} £k/yr`)
      .on('click', () => onRowClick(p)).addTo(siteLayer);
  });
}

export function flyTo (lat, lon, zoom = 15) { map.setView([lat, lon], zoom); }

// ---------- best-site scan markers ----------
export function drawBestSites (top, moneyFn, onPick) {
  if (bestLayer) map.removeLayer(bestLayer);
  bestLayer = L.layerGroup().addTo(map);
  top.forEach((s, i) => {
    L.marker([s.lat, s.lon], {
      icon: L.divIcon({
        className: '',
        html: `<div style="background:#fbbf24;color:#3b2a00;font-weight:800;font-size:11px;border-radius:99px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border:2px solid #3b2a00">★${i + 1}</div>`,
        iconSize: [24, 24], iconAnchor: [12, 12],
      }),
    }).bindTooltip(`Candidate ★${i + 1} — ~${moneyFn(s.v)}/yr · click for full assessment`)
      .on('click', () => onPick(s.lat, s.lon)).addTo(bestLayer);
  });
}

// ---------- OSM mast overlay ----------
export async function toggleMasts () {
  if (mastLayer) { map.removeLayer(mastLayer); mastLayer = null; return { shown: false }; }
  if (map.getZoom() < 10) return { error: 'Zoom in to a region first.' };
  const b = map.getBounds(), bb = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  const q = `[out:json][timeout:25];(node["man_made"="mast"]["tower:type"="communication"](${bb});` +
    `node["man_made"="mast"]["communication:mobile_phone"="yes"](${bb});` +
    `node["man_made"="communications_tower"](${bb});` +
    `node["man_made"="tower"]["tower:type"="communication"](${bb}););out body 1000;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) });
  const d = await r.json();
  mastLayer = L.layerGroup();
  for (const el of d.elements) {
    const op = el.tags['operator'] || el.tags['owner'] || 'unknown operator';
    L.circleMarker([el.lat, el.lon], { radius: 6, color: '#0b1220', weight: 1.5, fillColor: '#c084fc', fillOpacity: .95 })
      .bindTooltip(`🗼 ${el.tags['man_made']} — ${op}${el.tags['height'] ? ` · ${el.tags['height']}m` : ''}`).addTo(mastLayer);
  }
  mastLayer.addTo(map);
  return { shown: true, count: d.elements.length };
}

export { rsrpHex };
