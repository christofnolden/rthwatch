import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.js';
import { updateSnapshot, validateSnapshot } from '../src/pipeline.js';

const rawMode = process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'full';
if (!['full', 'stations', 'aircraft', 'publish'].includes(rawMode)) {
  throw new Error('Usage: node scripts/generate.mjs --mode=full|stations|aircraft|publish');
}
let previous = null;
try {
  previous = validateSnapshot(JSON.parse(await fs.readFile(config.stateFile, 'utf8')), config.minStations);
  console.info(`[build] Previous snapshot loaded: ${previous.sourceStations.length} stations`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error; // Do not silently overwrite a corrupt cache.
  console.info('[build] No previous snapshot available');
}
const effectiveMode = previous ? rawMode : 'full';
if (!previous && rawMode === 'publish') {
  console.info('[build] Initial deployment: automatic full bootstrap instead of publish-only');
}
const hexOverrides = JSON.parse(await fs.readFile(path.join(config.configDir, 'hex-overrides.json'), 'utf8'));
const stationOverrides = JSON.parse(await fs.readFile(path.join(config.configDir, 'station-overrides.json'), 'utf8'));

// Never mix old dist files into a new deployment, especially old generated JSON.
const data = await updateSnapshot(previous, { mode: effectiveMode, config, hexOverrides, stationOverrides });
validateSnapshot(data, config.minStations);
await fs.rm(config.distDir, { recursive: true, force: true });
await fs.mkdir(path.join(config.distDir, 'data'), { recursive: true });
await fs.cp(config.publicDir, config.distDir, { recursive: true });
await fs.writeFile(path.join(config.distDir, '.nojekyll'), '');
await fs.writeFile(path.join(config.distDir, 'data', 'stations.json'), JSON.stringify(data, null, 2) + '\n');
console.info(`[build] Ready: ${data.status.total} stations, ${data.status.mapped} ICAO links, mode=${effectiveMode}`);
console.info(`[build] Last RTH-Info sync: ${data.status.lastStationsSync || 'never'}`);
if (data.status.lastStationsError) console.warn(`[build] Warning: ${data.status.lastStationsError}`);
if (data.status.lastAircraftError) console.warn(`[build] Warning: ${data.status.lastAircraftError}`);
