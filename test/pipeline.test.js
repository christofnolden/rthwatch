import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  updateSnapshot, validateSnapshot, parseHexOverrides, parseStationOverrides,
  viewFromSources
} from '../src/pipeline.js';

const fixture = filename => readFileSync(new URL(`fixtures/${filename}`, import.meta.url), 'utf8');
const overview = fixture('overview.html');
const config = {
  overviewUrl: 'https://www.rth.info/stationen.db/stationen.php',
  registrationDbUrl: 'https://example.invalid/regIcao.js',
  requestDelayMs: 0,
  minStations: 3
};
const fakeAircraft = () => ({ DHXAD: '3e0f5f', DHUTH: '3e0965' });
function detail(callsign, registration = 'D-HXAD') {
  return `<table><tr><td>Rufname</td><td>${callsign}</td></tr>
    <tr><td>Ort</td><td>München</td></tr><tr><td>Betreiber</td><td>ADAC</td></tr>
    <tr><td>Standard-Hubschraubertyp</td><td>H145</td></tr>
    <tr><td>Zuletzt gesichtete Maschine</td><td><a>${registration}</a> 27.09.2026</td></tr></table>`;
}
const fetchPage = async url => {
  if (url.includes('stationen.php')) return overview;
  const id = Number(new URL(url).searchParams.get('id'));
  const names = { 1: 'Christoph 1', 3: 'Christoph 3', 68: 'Christoph 68', 171: 'Air Rescue Nürburgring', 210: 'Lifeliner 1', 220: 'Air Rescue 2' };
  if (!names[id]) throw new Error(`Unrecognized station ${id}`);
  return detail(names[id]);
};
const options = { mode: 'full', config, fetchPage, fetchAircraft: fakeAircraft,
  now: () => new Date('2026-09-27T10:10:00Z'), wait: async () => {} };

test('first full import creates valid static snapshot and links', async () => {
  const generated = await updateSnapshot(null, options);
  assert.equal(generated.schemaVersion, 2);
  assert.equal(generated.stations.length, 6);
  assert.equal(generated.status.mapped, 6);
  assert.equal(generated.stations[0].adsbUrl, 'https://globe.adsbexchange.com/?icao=3e0f5f');
  assert.equal(generated.stations.find(s => s.id === 171).rthUrl, 'https://www.rth.info/stationen.db/station.php?id=171&show=1');
  assert.doesNotThrow(() => validateSnapshot(generated, 3));
});

test('failed overview keeps previous published station and ICAO data', async () => {
  const previous = await updateSnapshot(null, options);
  const result = await updateSnapshot(previous, { ...options, mode: 'stations',
    fetchPage: async () => { throw new Error('503 rth.info'); } });
  assert.equal(result.stations.length, 6);
  assert.equal(result.status.lastStationsSync, previous.status.lastStationsSync);
  assert.match(result.status.lastStationsError, /503/);
  assert.equal(result.status.mapped, 6);
});

test('one failed detail keeps old ID while changing successfully fetched registrations', async () => {
  const previous = await updateSnapshot(null, options);
  const result = await updateSnapshot(previous, { ...options, mode: 'stations',
    fetchPage: async url => {
      if (url.includes('stationen.php')) return overview;
      const id = Number(new URL(url).searchParams.get('id'));
      if (id === 1) throw new Error('timeout');
      const item = previous.sourceStations.find(row => row.id === id);
      return detail(item.callsign, 'D-HUTH');
    }
  });
  assert.equal(result.stations.find(x => x.id === 1).registration, 'D-HXAD');
  assert.equal(result.stations.find(x => x.id === 3).registration, 'D-HUTH');
  assert.equal(result.status.lastResult.errors, 1);
  assert.equal(result.status.mapped, 6);
});

test('a station override survives RTH updates and is removed cleanly in publish mode', async () => {
  const previous = await updateSnapshot(null, options);
  const override = { 1: { registration: 'D-HUTH', icao: '3e0965' } };
  const overridden = await updateSnapshot(previous, {
    ...options, mode: 'publish', stationOverrides: override, hexOverrides: {}
  });
  const row = overridden.stations.find(x => x.id === 1);
  assert.equal(row.assignmentSource, 'manual');
  assert.equal(row.sightingDate, null);
  assert.equal(row.icao, '3e0965');
  const restored = await updateSnapshot(overridden, { ...options, mode: 'publish' });
  const original = restored.stations.find(x => x.id === 1);
  assert.equal(original.registration, 'D-HXAD');
  assert.equal(original.assignmentSource, 'rth.info');
  assert.equal(original.sightingDate, '2026-09-27');
});

test('new registration triggers fresh download on a station run', async () => {
  const previous = await updateSnapshot(null, options);
  let refreshed = 0;
  const changed = await updateSnapshot(previous, { ...options, mode: 'stations',
    fetchPage: async url => {
      if (url.includes('stationen.php')) return overview;
      const id = Number(new URL(url).searchParams.get('id'));
      return detail(previous.sourceStations.find(s => s.id === id).callsign, id === 3 ? 'D-HUTH' : 'D-HXAD');
    },
    fetchAircraft: () => { refreshed++; return fakeAircraft(); }
  });
  assert.equal(refreshed, 1);
  assert.equal(changed.stations.find(x => x.id === 3).icao, '3e0965');
});

test('aircraft download fails: previously known ICAO codes remain', async () => {
  const previous = await updateSnapshot(null, options);
  const result = await updateSnapshot(previous, { ...options, mode: 'aircraft',
    fetchAircraft: async () => { throw new Error('rate limited'); } });
  assert.equal(result.status.mapped, 6);
  assert.match(result.status.lastAircraftError, /rate limited/);
});

test('manual registration and hex settings are strictly validated', () => {
  assert.throws(() => parseStationOverrides({ Christoph1: { registration: 'D-HXAD' } }), /Invalid station override/);
  assert.throws(() => parseStationOverrides({ 1: { registration: 'D-HXAD', icao: 'invalid' } }), /Invalid station override ICAO/);
  assert.throws(() => parseHexOverrides({ 'D-HXAD': 'not-hex' }), /Invalid ICAO/);
  const [id, override] = [...parseStationOverrides({ 1: { registration: 'd-hxad' } })][0];
  assert.equal(id, 1);
  assert.equal(override.registration, 'D-HXAD');
});

test('per-station ICAO outranks global hex override and upstream mapping', () => {
  const raw = [{ id: 1, callsign: 'Christoph 1', registration: 'D-HXAD', sightingDate: '2026-09-27' }];
  const view = viewFromSources(raw, { DHXAD: '111111' }, parseHexOverrides({ 'D-HXAD': '222222' }),
    parseStationOverrides({ 1: { registration: 'D-HXAD', icao: '333333' } }), {});
  assert.equal(view.stations[0].icao, '333333');
  assert.equal(view.stations[0].mappingSource, 'station-override');
});

test('no first publication with an unavailable source', async () => {
  await assert.rejects(updateSnapshot(null, { ...options,
    fetchPage: async () => { throw new Error('website down'); } }), /website down/);
  await assert.rejects(updateSnapshot(null, { ...options, mode: 'publish' }), /Cannot publish/);
});
