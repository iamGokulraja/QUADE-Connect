// Current place for attendance: browser GPS (navigator.geolocation) -> city / town name via OpenStreetMap (free, no key).
// If the name lookup fails, the coordinates are saved as the location text, so a check-in is never lost.

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser cannot find your location."));
    navigator.geolocation.getCurrentPosition(resolve, (e) => {
      reject(new Error(
        e.code === 1 ? "Location is blocked. Allow location for this site in the browser (lock icon next to the address), then try again."
          : e.code === 3 ? "Finding your location took too long. Check GPS / internet and try again."
          : "Your location is not available right now. Try again."));
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

export async function placeName(lat, lng) {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=${lat}&lon=${lng}`,
      { signal: ctl.signal, headers: { "Accept-Language": "en" } });
    clearTimeout(timer);
    if (!res.ok) throw new Error("lookup failed");
    const j = await res.json();
    const a = j?.address || {};
    // City / town / village name only (for example "Surandai"); the exact point stays in the coordinates + map link.
    const name = a.city || a.town || a.village || a.suburb || a.hamlet || a.municipality || a.city_district || a.county || a.state_district || a.state;
    if (name) return String(name).slice(0, 120);
    if (j?.display_name) return String(j.display_name).split(",")[0].slice(0, 120);
  } catch { /* fall through */ }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// -> { location, lat, lng }  (rounded to ~1 m)
export async function currentLocation() {
  const { coords } = await getPosition();
  const lat = Math.round(coords.latitude * 1e6) / 1e6;
  const lng = Math.round(coords.longitude * 1e6) / 1e6;
  return { location: await placeName(lat, lng), lat, lng };
}

export const mapUrl = (lat, lng) => (lat == null || lng == null ? null : `https://www.google.com/maps?q=${lat},${lng}`);
