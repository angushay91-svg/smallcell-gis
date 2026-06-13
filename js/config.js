// Central configuration: constants, palettes, data sources.
export const TILE_DEG = 1;                       // census data tile grid size (degrees)

// Environment Agency 1m LiDAR Composite DSM (last return) — live WCS, OGL v3
export const EA_WCS =
  'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-last-return-dsm-1m/wcs' +
  '?service=WCS&version=2.0.1&request=GetCoverage' +
  '&coverageId=9ba4d5ac-d596-445a-9056-dae3ddec0178__Lidar_Composite_Elevation_LZ_DSM_1m&format=image/tiff';

// AWS Terrain Tiles (terrarium encoding) — ~30m ground-only fallback (Wales / LiDAR gaps)
export const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

export const RSRP_SERVING_THRESHOLD = -110;      // dBm — below this a pixel is "not served"
export const RX_HEIGHT_M = 1.5;                  // receiver height above the DSM surface

export const DEFAULTS = {
  radius: 250,        // m, theoretical max small-cell radius
  mastHeight: 8,      // m above ground/roof
  bandMHz: 3400,      // n78
  eirp: 35,           // dBm
  upliftPct: 0.7,     // % of covered GVA per year
  consumerGBP: 200,   // £ per covered resident per year
};

export const GREEN_BOOK_DISCOUNT = 0.035;        // HMT 10-year discount rate

// Mobile operator brand colours (tower locator)
export const CARRIER_COLOURS = {
  ee: '#16b8b0', o2: '#3b6cff', three: '#a855f7', vodafone: '#e60000',
};

// IMD decile colours (1 = most deprived)
export const IMD_COLOURS = ['#999', '#d73027', '#f46d43', '#fdae61', '#fee08b',
  '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837'];

// RSRP heat ramp (shared by viewshed overlay + tower footprints)
export function rsrpColor (v) {
  if (v >= -85) return [34, 197, 94, 150];    // excellent — green
  if (v >= -95) return [163, 230, 53, 150];   // good — lime
  if (v >= -105) return [250, 204, 21, 150];  // fair — yellow
  if (v >= RSRP_SERVING_THRESHOLD) return [249, 115, 22, 150]; // edge — orange
  return null;
}
export function rsrpHex (v) {
  return v >= -85 ? '#22c55e' : v >= -95 ? '#a3e635' : v >= -105 ? '#facc15'
    : v >= -112 ? '#f97316' : '#ef4444';
}
