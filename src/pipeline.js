/** Incremental, failure-tolerant static data pipeline (no database or Git write access). */
import { parseOverview, parseStationDetail } from './parse.js';
import { fetchHtml, downloadAircraftDatabase, selectAircraftMappings } from './feed.js';
import { cleanIcao, normalizeRegistration, sleep } from './util.js';

import {
  SCHEMA_VERSION, validateSnapshot, parseHexOverrides, parseStationOverrides
} from './validation.js';
export { SCHEMA_VERSION, validateSnapshot, parseHexOverrides, parseStationOverrides } from './validation.js';
const MODES = new Set(['full', 'stations', 'aircraft', 'publish']);

export function activeRegistrationKeys(rawStations, stationOverrides) {
  const keys = new Set();
  for (const row of rawStations) {
    const key = normalizeRegistration(row.registration);
    if (key) keys.add(key);
    const manual = normalizeRegistration(stationOverrides.get(row.id)?.registration);
    if (manual) keys.add(manual);
  }
  return keys;
}

export function viewFromSources(rawStations, registrations, hexOverrides, stationOverrides, status) {
  const stations = rawStations.map(raw => {
    const manual = stationOverrides.get(raw.id);
    const registration = manual ? manual.registration : raw.registration;
    const key = normalizeRegistration(registration);
    const byStation = manual?.icao || null;
    const byHexOverride = key ? hexOverrides.get(key) : null;
    const fromDb = key ? cleanIcao(registrations[key]) : null;
    const icao = byStation || byHexOverride || fromDb || null;
    const mappingSource = byStation ? 'station-override' :
      byHexOverride ? 'hex-override' : fromDb ? 'tar1090' : null;
    return {
      ...raw,
      registration: registration || null,
      regKey: key,
      sightingDate: manual ? null : raw.sightingDate,
      assignmentSource: manual ? 'manual' : 'rth.info',
      icao,
      mappingSource,
      adsbUrl: icao ? `https://globe.adsbexchange.com/?icao=${icao}` : null
    };
  }).sort((a, b) => a.callsign.localeCompare(b.callsign, 'de', { numeric: true }));
  const computedStatus = {
    ...status,
    timezone: 'Europe/Berlin',
    total: stations.length,
    mapped: stations.filter(row => row.icao).length,
    noRegistration: stations.filter(row => !row.registration).length
  };
  return { stations, status: computedStatus };
}

function conciseError(error) {
  const message = String(error?.message || error).replace(/\s+/g, ' ').slice(0, 180);
  return `${new Date().toISOString()} — ${message}`;
}

/**
 * Keeps previous published data if rth.info is offline or its page layout changes.
 * A fresh mapping download is needed once daily and only on demand for new aircraft.
 */
export async function updateSnapshot(previous, options) {
  const {
    mode, config, hexOverrides = {}, stationOverrides = {},
    fetchPage = fetchHtml, fetchAircraft = downloadAircraftDatabase,
    now = () => new Date(), wait = sleep, signal
  } = options;
  if (!MODES.has(mode)) throw new Error(`Unknown mode: ${mode}`);
  if (previous) validateSnapshot(previous, config.minStations);
  const hex = hexOverrides instanceof Map ? hexOverrides : parseHexOverrides(hexOverrides);
  const manual = stationOverrides instanceof Map ? stationOverrides : parseStationOverrides(stationOverrides);
  if (mode === 'publish' && !previous) {
    throw new Error('Cannot publish without a previous dataset. Run mode=full first.');
  }
  const sourceStations = previous ? [...previous.sourceStations] : [];
  let rawStations = sourceStations;
  const registrations = { ...(previous?.registrations || {}) };
  const status = {
    lastStationsSync: previous?.status?.lastStationsSync || null,
    lastAircraftSync: previous?.status?.lastAircraftSync || null,
    lastStationsError: previous?.status?.lastStationsError || '',
    lastAircraftError: previous?.status?.lastAircraftError || '',
    lastResult: previous?.status?.lastResult || null
  };

  const shouldCrawl = mode === 'full' || mode === 'stations' || (!previous && mode === 'aircraft');
  if (shouldCrawl) {
    try {
      const overviewHtml = await fetchPage(config.overviewUrl, config, signal);
      const overview = parseOverview(overviewHtml, config.overviewUrl);
      if (overview.length < config.minStations ||
          (sourceStations.length >= config.minStations && overview.length < Math.floor(sourceStations.length * 0.65))) {
        throw new Error(`Suspicious overview: ${overview.length} entries, previous ${sourceStations.length}`);
      }
      console.info(`[stations] Overview: ${overview.length} matching stations`);
      const parsed = [];
      const failedIds = [];
      for (let i = 0; i < overview.length; i++) {
        const item = overview[i];
        if (i > 0) await wait(config.requestDelayMs, signal);
        try {
          const detailHtml = await fetchPage(item.url, config, signal);
          parsed.push(parseStationDetail(detailHtml, item));
        } catch (error) {
          if (signal?.aborted) throw error;
          failedIds.push(item.id);
          console.warn(`[stations] ID ${item.id} (${item.callsign}) skipped: ${error.message}`);
        }
      }
      if (parsed.length < config.minStations) {
        throw new Error(`Only ${parsed.length} of ${overview.length} details valid; previous stations retained`);
      }
      if (failedIds.length > 0) {
        const byId = new Map(sourceStations.map(s => [s.id, s]));
        for (const current of parsed) byId.set(current.id, current);
        rawStations = [...byId.values()];
      } else {
        rawStations = parsed; // Complete valid crawl: remove genuinely missing stations.
      }
      status.lastStationsSync = now().toISOString();
      status.lastStationsError = failedIds.length ?
        `${status.lastStationsSync} — ${failedIds.length} Station(en) nicht aktualisiert; alte Daten beibehalten` : '';
      status.lastResult = { found: overview.length, updated: parsed.length, errors: failedIds.length, failedIds };
      console.info(`[stations] Completed: ${parsed.length} updated, ${failedIds.length} missing`);
    } catch (error) {
      if (!sourceStations.length) throw error; // First publication must NEVER be empty.
      status.lastStationsError = conciseError(error);
      console.warn(`[stations] Source unavailable; previous snapshot preserved: ${error.message}`);
    }
  }

  if (!rawStations.length) throw new Error('Refusing to produce empty station dataset');
  const wanted = activeRegistrationKeys(rawStations, manual);
  const unknown = [...wanted].filter(key => !cleanIcao(registrations[key]) && !hex.has(key) &&
    ![...manual.values()].some(item => normalizeRegistration(item.registration) === key && item.icao));
  const lastAircraftTime = status.lastAircraftSync ? new Date(status.lastAircraftSync).getTime() : 0;
  const stale = !Number.isFinite(lastAircraftTime) || now().getTime() - lastAircraftTime > 36 * 60 * 60 * 1000;
  const needsDownload = mode === 'full' || mode === 'aircraft' ||
    (mode === 'stations' && (unknown.length > 0 || stale));
  if (needsDownload) {
    try {
      const database = await fetchAircraft(config, signal);
      Object.assign(registrations, selectAircraftMappings(database, wanted));
      status.lastAircraftSync = now().toISOString();
      status.lastAircraftError = '';
      console.info(`[aircraft] Resolved ${Object.keys(registrations).length} locally relevant registrations`);
    } catch (error) {
      status.lastAircraftError = conciseError(error);
      console.warn(`[aircraft] Lookup unavailable; using saved mappings: ${error.message}`);
    }
  }
  // Retain only needed machine keys in public snapshot; avoid committing a huge upstream DB.
  const selected = Object.fromEntries([...wanted].filter(key => cleanIcao(registrations[key])).map(key => [key, registrations[key]]));
  const view = viewFromSources(rawStations, selected, hex, manual, status);
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now().toISOString(),
    sourceStations: rawStations.sort((a, b) => a.id - b.id),
    registrations: selected,
    stations: view.stations,
    status: view.status
  };
}
