import path from 'node:path';

function intFromEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

export const config = Object.freeze({
  timezone: 'Europe/Berlin',
  requestDelayMs: intFromEnv('RTH_REQUEST_DELAY_MS', 1200, 750, 30000),
  minStations: intFromEnv('RTH_MIN_STATIONS', 15, 3, 500),
  fetchTimeoutMs: intFromEnv('FETCH_TIMEOUT_MS', 45000, 3000, 120000),
  overviewUrl: 'https://www.rth.info/stationen.db/stationen.php',
  registrationDbUrl: 'https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/db/regIcao.js',
  configDir: path.resolve('./config'),
  stateFile: path.resolve('./.state/stations.json'),
  distDir: path.resolve('./dist'),
  publicDir: path.resolve('./public'),
  userAgent: 'RTHWatch/2.0 (scheduled informational dashboard; contact via repository issues)'
});
