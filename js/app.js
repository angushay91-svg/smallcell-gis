// Application layer: Vue 3 drives the sidebar UI; engine modules do the GIS work.
/* global Vue */
import { DEFAULTS } from './config.js';
import { money, fmt, bandLabel } from './format.js';
import { loadIndex } from './datatiles.js';
import { fetchDSM } from './terrain.js';
import { viewshed } from './radio.js';
import { assess, valueModel } from './assess.js';
import { findBest } from './scan.js';
import { geocode } from './search.js';
import * as M from './map.js';
import * as T from './towers.js';

const { createApp, reactive, computed } = Vue;

const state = reactive({
  mode: 'assess',                 // 'assess' | 'towers'
  // sliders / inputs
  los: true,
  rad: DEFAULTS.radius, mh: DEFAULTS.mastHeight,
  band: DEFAULTS.bandMHz, eirp: DEFAULTS.eirp,
  up: DEFAULTS.upliftPct, cs: DEFAULTS.consumerGBP,
  q: '',
  // assessment
  loading: null, res: null, showBlocks: false,
  // saved sites
  pins: JSON.parse(localStorage.getItem('sc_pins') || '[]'),
  // buttons
  bestBusy: false, mastLabel: '🗼 Known masts (OSM)',
  // towers
  towerCount: null, towerSel: null,
  carriers: ['ee', 'o2', 'three', 'vodafone'], techs: ['4G', '5G'],
});

async function dropPin (lat, lon) {
  state.showBlocks = false;
  M.setPin(lat, lon, state.rad, state.los);
  let vs = null;
  if (state.los) {
    state.loading = '⛰ Fetching 1m LiDAR elevation around the pin…';
    const d = await fetchDSM(lat, lon, state.rad);
    if (d) {
      state.loading = '📡 Casting rays over the rooftops…';
      await new Promise(r => setTimeout(r, 20));
      vs = viewshed(d, lat, lon, { mastHeight: state.mh, Rmax: state.rad, bandMHz: +state.band, eirp: state.eirp });
      M.drawViewshed(vs);
    }
  } else {
    M.drawViewshed(null);
  }
  state.loading = 'Measuring who the footprint reaches…';
  state.res = await assess(lat, lon, state.rad, vs);
  state.loading = null;
}

const app = createApp({
  setup () {
    const value = computed(() => state.res ? valueModel(state.res, state.up, state.cs) : null);
    const sortedPins = computed(() =>
      [...state.pins].map((p, i) => ({ ...p, _i: i })).sort((a, b) => b.value_k - a.value_k));
    const pinTotals = computed(() => ({
      pop: state.pins.reduce((s, p) => s + p.pop, 0),
      gva: state.pins.reduce((s, p) => s + p.gva_m, 0),
      val: state.pins.reduce((s, p) => s + p.value_k, 0),
    }));
    const visibleTowers = computed(() => state.towerCount);

    function setMode (m) {
      state.mode = m;
      if (m === 'towers') {
        M.clearPin(); M.drawViewshed(null);
        if (T.haveData()) redrawTowers();
      } else {
        T.exitMode();
      }
    }
    function redrawTowers () {
      state.towerCount = T.draw({ carriers: state.carriers, techs: state.techs }, async (t) => {
        const r = await T.showFootprint(t);
        state.towerSel = r ? { ...r.tower, points: r.points } : null;
      });
    }
    function onTowerFile (ev) {
      const f = ev.target.files[0];
      if (!f) return;
      T.loadFile(f, () => { redrawTowers(); T.fitAll(); }, (msg) => alert(msg));
    }
    function savePin () {
      if (!state.res) return;
      const v = valueModel(state.res, state.up, state.cs);
      const r = state.res;
      state.pins.push({
        name: r.lad + ' #' + (state.pins.length + 1), lat: r.lat, lon: r.lon, R: r.R,
        pop: Math.round(r.pop), hh: Math.round(r.hh), biz: Math.round(r.biz),
        uprn: Math.round(r.uprn), bus: r.stops.bus, rail: r.stops.rail + r.stops.tram,
        gva_m: +(r.gva / 1000).toFixed(2), imd: +r.imd.toFixed(1), value_k: Math.round(v.annual / 1000),
      });
      persistPins();
    }
    function persistPins () {
      localStorage.setItem('sc_pins', JSON.stringify(state.pins));
      M.drawSavedSites(state.pins, p => { M.flyTo(p.lat, p.lon); dropPin(p.lat, p.lon); });
    }
    function removePin (i) { state.pins.splice(i, 1); persistPins(); }
    function clearPins () { state.pins = []; persistPins(); }
    function exportCSV () {
      const head = 'name,lat,lon,radius_m,residents,uprn_premises,households,businesses,bus_stops,rail_tram_access,gva_2023_gbp_m,imd_decile,est_value_gbp_k_per_yr';
      const rows = state.pins.map(p => [p.name.replaceAll(',', ';'), p.lat.toFixed(6), p.lon.toFixed(6),
        p.R, p.pop, p.uprn ?? '', p.hh, p.biz, p.bus ?? '', p.rail ?? '', p.gva_m, p.imd, p.value_k].join(','));
      const blob = new Blob([head + '\n' + rows.join('\n')], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'small_cell_sites.csv'; a.click();
    }
    async function doSearch () {
      if (!state.q.trim()) return;
      const p = await geocode(state.q.trim());
      if (p) { M.flyTo(p.lat, p.lon); dropPin(p.lat, p.lon); }
    }
    async function best () {
      if (M.map.getZoom() < 13) { alert('Zoom in closer (a town/city district) first — then I scan the visible area.'); return; }
      state.bestBusy = true;
      const top = await findBest(M.map.getBounds(), state.rad, state.up, state.cs);
      M.drawBestSites(top, money, (lat, lon) => dropPin(lat, lon));
      state.bestBusy = false;
      if (!top.length) alert('No populated areas found in view.');
    }
    async function masts () {
      state.mastLabel = 'Searching…';
      try {
        const r = await M.toggleMasts();
        if (r.error) { alert(r.error); state.mastLabel = '🗼 Known masts (OSM)'; return; }
        state.mastLabel = r.shown ? `🗼 ${r.count} masts shown (hide)` : '🗼 Known masts (OSM)';
      } catch (e) {
        state.mastLabel = '🗼 Known masts (OSM)';
        alert('OpenStreetMap query failed — try again or zoom in further.');
      }
    }
    function toggleBlocks () { state.showBlocks = M.toggleDataBlocks(state.res); }
    function rerun () { if (state.res) dropPin(state.res.lat, state.res.lon); }
    function goPin (p) { M.flyTo(p.lat, p.lon); dropPin(p.lat, p.lon); }

    return {
      s: state, value, sortedPins, pinTotals, visibleTowers,
      money, fmt, bandLabel,
      setMode, onTowerFile, redrawTowers, savePin, removePin, clearPins, exportCSV,
      doSearch, best, masts, toggleBlocks, rerun, goPin,
      imdColor: M.imdColor,
    };
  },
});

// ---- boot
loadIndex();
M.initMap('map', (lat, lon) => {
  if (state.mode === 'assess') { dropPin(lat, lon); return; }
  T.clearFootprint(); state.towerSel = null;     // towers mode: background click deselects
});
app.mount('#sidebar');
M.drawSavedSites(state.pins, p => { M.flyTo(p.lat, p.lon); dropPin(p.lat, p.lon); });
