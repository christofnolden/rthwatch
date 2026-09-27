const HOSTS = Object.freeze({
  adsb: 'globe.adsbexchange.com',
  airplanes: 'globe.airplanes.live'
});

export function validIcao(value) {
  return typeof value === 'string' && /^[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

export function favoriteIcaos(stations, favorites) {
  const seen = new Set();
  for (const station of stations) {
    if (!favorites.has(station.id)) continue;
    const icao = validIcao(station.icao);
    if (icao) seen.add(icao);
  }
  return [...seen];
}

export function trackingUrl(provider, icaos) {
  const host = HOSTS[provider];
  if (!host || !Array.isArray(icaos) || !icaos.length) return null;
  const normalized = icaos.map(validIcao);
  if (normalized.some(value => !value)) return null;
  return `https://${host}/?icao=${[...new Set(normalized)].join(',')}`;
}

export function safeTrackingUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !Object.values(HOSTS).includes(url.hostname) ||
        url.username || url.password || url.port || url.pathname !== '/' || url.hash ||
        !/^\?icao=[0-9a-f]{6}(?:,[0-9a-f]{6})*$/i.test(url.search)) return null;
    return url.href;
  } catch { return null; }
}
