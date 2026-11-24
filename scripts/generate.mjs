import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.js';
import { updateSnapshot, validateSnapshot } from '../src/pipeline.js';
import { reconcileDecision, recordReconcile } from '../src/reconcile.js';

const rawMode = process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'full';
if (!['full', 'stations', 'aircraft', 'publish', 'reconcile'].includes(rawMode)) {
  throw new Error('Usage: node scripts/generate.mjs --mode=full|stations|aircraft|publish|reconcile');
}
let previous = null;
try {
  previous = validateSnapshot(JSON.parse(await fs.readFile(config.stateFile, 'utf8')), config.minStations);
  console.info(`[build] Previous snapshot loaded: ${previous.sourceStations.length} stations`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error; // Do not silently overwrite a corrupt cache.
  console.info('[build] No previous snapshot available');
}
const decision = rawMode === 'reconcile' ? reconcileDecision(previous) : null;
if (decision) console.info(`[reconcile] ${decision.reason}; selected: ${decision.mode || 'none'}`);
if (decision && !decision.mode) {
  await fs.rm(config.distDir, { recursive: true, force: true });
  console.info('[reconcile] No import due; no build or deployment.');
  process.exit(0);
}
const effectiveMode = previous ? (decision?.mode || rawMode) : 'full';
if (!previous && rawMode === 'publish') {
  console.info('[build] Initial deployment: automatic full bootstrap instead of publish-only');
}
const hexOverrides = JSON.parse(await fs.readFile(path.join(config.configDir, 'hex-overrides.json'), 'utf8'));
const stationOverrides = JSON.parse(await fs.readFile(path.join(config.configDir, 'station-overrides.json'), 'utf8'));

// Never mix old dist files into a new deployment, especially old generated JSON.
const data = await updateSnapshot(previous, { mode: effectiveMode, config, hexOverrides, stationOverrides });
if (decision && previous) recordReconcile(data, previous, decision);
validateSnapshot(data, config.minStations);
await fs.rm(config.distDir, { recursive: true, force: true });
await fs.mkdir(path.join(config.distDir, 'data'), { recursive: true });
await fs.cp(config.publicDir, config.distDir, { recursive: true,
  filter: source => !['.DS_Store'].includes(path.basename(source)) && !path.basename(source).startsWith('._') });
await fs.writeFile(path.join(config.distDir, '.nojekyll'), '');
await fs.writeFile(path.join(config.distDir, 'CNAME'), 'rthwatch.nolden.cloud\n');
await fs.writeFile(path.join(config.distDir, 'data', 'stations.json'), JSON.stringify(data, null, 2) + '\n');
console.info(`[build] Ready: ${data.status.total} stations, ${data.status.mapped} ICAO links, mode=${effectiveMode}`);
console.info(`[build] Last RTH-Info sync: ${data.status.lastStationsSync || 'never'}`);
if (data.status.lastStationsError) console.warn(`[build] Warning: ${data.status.lastStationsError}`);
if (data.status.lastAircraftError) console.warn(`[build] Warning: ${data.status.lastAircraftError}`);

if (effectiveMode === 'publish') console.info('[build] Publish without source import');
else console.info(`[build] Station result: ${data.status.lastResult?.updated || 0} updated, ${data.status.lastResult?.errors || 0} failed; ICAO mappings: ${Object.keys(data.registrations).length}`);
console.info(`[build] Last complete stations import: ${data.status.lastStationsCompleteSync || 'never'}; last aircraft import: ${data.status.lastAircraftSync || 'never'}`);
console.info(`[build] Snapshot validation successful; website build successful`);
