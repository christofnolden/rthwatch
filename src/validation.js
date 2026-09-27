/** Validate published snapshots and versioned config files before use. */
import { normalizeRegistration, cleanIcao, safeStationUrl } from './util.js';

export const SCHEMA_VERSION = 2;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Reject broken backup files instead of propagating malformed data into a deployment. */
export function validateSnapshot(value, minStations = 3) {
  if (!isPlainObject(value) || value.schemaVersion !== SCHEMA_VERSION ||
      !Array.isArray(value.sourceStations) || value.sourceStations.length < minStations ||
      !isPlainObject(value.registrations) || !isPlainObject(value.status)) {
    throw new Error('Invalid RTH Watch v2 snapshot (version, stations, mappings or status)');
  }
  const ids = new Set();
  for (const station of value.sourceStations) {
    if (!Number.isSafeInteger(station?.id) || station.id <= 0 || ids.has(station.id) ||
        typeof station.callsign !== 'string' || !station.callsign.trim() ||
        station.rthUrl !== safeStationUrl(station.id)) {
      throw new Error('Invalid or duplicated station in previous dataset');
    }
    ids.add(station.id);
  }
  for (const [registration, icao] of Object.entries(value.registrations)) {
    if (!/^[A-Z0-9]{3,12}$/.test(registration) || !cleanIcao(icao)) {
      throw new Error('Invalid registration mapping in previous dataset');
    }
  }
  return value;
}

export function parseHexOverrides(json) {
  if (!isPlainObject(json)) throw new Error('hex-overrides.json must be an object');
  const result = new Map();
  for (const [registration, hex] of Object.entries(json)) {
    const key = normalizeRegistration(registration);
    const icao = cleanIcao(hex);
    if (!key || !icao) throw new Error(`Invalid ICAO override: ${registration}`);
    result.set(key, icao);
  }
  return result;
}

export function parseStationOverrides(json) {
  if (!isPlainObject(json)) throw new Error('station-overrides.json must be an object');
  const result = new Map();
  for (const [idText, record] of Object.entries(json)) {
    const id = Number(idText);
    if (!/^\d+$/.test(idText) || !Number.isSafeInteger(id) || id <= 0 || !isPlainObject(record)) {
      throw new Error(`Invalid station override ID: ${idText}`);
    }
    const registration = record.registration;
    if (typeof registration !== 'string' || !/^[A-Z]{1,3}-[A-Z0-9]{2,6}$/i.test(registration)) {
      throw new Error(`Invalid station override registration at ID ${id}`);
    }
    const icao = record.icao === undefined ? null : cleanIcao(record.icao);
    if (record.icao !== undefined && !icao) throw new Error(`Invalid station override ICAO at ID ${id}`);
    if (record.note !== undefined && typeof record.note !== 'string') throw new Error(`Invalid note at station ID ${id}`);
    const allowed = new Set(['registration', 'icao', 'note']);
    if (Object.keys(record).some(key => !allowed.has(key))) throw new Error(`Unknown field at station ID ${id}`);
    result.set(id, { registration: registration.toUpperCase(), icao });
  }
  return result;
}

