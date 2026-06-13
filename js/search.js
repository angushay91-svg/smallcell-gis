// Geocoding: postcodes.io first (UK postcodes), Nominatim fallback (place names).
export async function geocode (q) {
  try {
    let r = await fetch('https://api.postcodes.io/postcodes?q=' + encodeURIComponent(q) + '&limit=1');
    let d = await r.json();
    if (d.result && d.result.length) return { lat: d.result[0].latitude, lon: d.result[0].longitude };
    r = await fetch('https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&limit=1&q=' + encodeURIComponent(q));
    d = await r.json();
    if (d.length) return { lat: +d[0].lat, lon: +d[0].lon };
  } catch (e) { /* network */ }
  return null;
}
