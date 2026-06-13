// Geometry & geodesy helpers. proj4 is loaded globally from the CDN.
/* global proj4 */

proj4.defs('EPSG:27700',
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 ' +
  '+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs');

export const toOSGB = (lon, lat) => proj4('EPSG:4326', 'EPSG:27700', [lon, lat]);
export const toWGS = (e, n) => proj4('EPSG:27700', 'EPSG:4326', [e, n]);

/** Distance in metres between two lat/lon points (equirectangular — fine below ~2km). */
export function dist (lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const x = (lon2 - lon1) * Math.PI / 180 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
  const y = (lat2 - lat1) * Math.PI / 180;
  return Math.sqrt(x * x + y * y) * R;
}

/** Area of intersection of two circles, as a fraction of circle r2's area. */
export function overlapFrac (d, r1, r2) {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return r1 >= r2 ? 1 : (r1 * r1) / (r2 * r2);
  const a1 = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const a2 = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  const a3 = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  return (a1 + a2 - a3) / (Math.PI * r2 * r2);
}

/** Convex hull (monotone chain) of [lat,lon,...] points → [[lat,lon],…] or null. */
export function convexHull (pts) {
  const p = pts.map(q => [q[1], q[0]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return null;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1)).map(q => [q[1], q[0]]);
}

/** Bounding box [[minLat,minLon],[maxLat,maxLon]] of [lat,lon] pairs. */
export function bounds (pts) {
  const las = pts.map(p => p[0]), los = pts.map(p => p[1]);
  return [[Math.min(...las), Math.min(...los)], [Math.max(...las), Math.max(...los)]];
}
