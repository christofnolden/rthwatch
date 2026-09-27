import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot, parseHexOverrides, parseStationOverrides } from '../src/validation.js';

const fixture = () => ({
  schemaVersion: 2,
  sourceStations: Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    callsign: `Christoph ${i + 1}`,
    registration: 'D-HXAD',
    rthUrl: `https://www.rth.info/stationen.db/station.php?id=${i + 1}&show=1`
  })),
  registrations: { DHXAD: '3e0f5f' },
  status: { lastStationsSync: '2026-09-27T08:08:00Z' }
});

test('existing Pages snapshot can be validated without Cheerio or network', () => {
  const saved = fixture();
  assert.equal(validateSnapshot(saved, 15).sourceStations.length, 15);
  assert.throws(() => validateSnapshot({ ...saved, schemaVersion: 1 }, 15), /Invalid RTH Watch/);
  saved.sourceStations[1].id = 1;
  assert.throws(() => validateSnapshot(saved, 15), /duplicated/);
});

test('versioned station/hex overrides normalize and reject invalid files', () => {
  assert.equal(parseHexOverrides({ 'd-hxad': '3E0F5F' }).get('DHXAD'), '3e0f5f');
  const record = parseStationOverrides({ 1: { registration: 'd-hxad', icao: '3E0F5F' } }).get(1);
  assert.deepEqual(record, { registration: 'D-HXAD', icao: '3e0f5f' });
  assert.throws(() => parseStationOverrides({ 1: { registration: 'D-HXAD', unexpected: 'field' } }), /Unknown field/);
});
