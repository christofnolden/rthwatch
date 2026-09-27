import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOverview, parseStationDetail, SPECIAL_CALLSIGN } from '../src/parse.js';
const fixture = file => readFileSync(new URL(`fixtures/${file}`, import.meta.url), 'utf8');

test('overview selects 3 categories and special names; excludes SAR, Northern Rescue, Christophorus and duplicates', () => {
  const data = parseOverview(fixture('overview.html'));
  assert.deepEqual(data.map(d => d.id), [1, 3, 68, 171, 210, 220]);
  assert.deepEqual(data.map(d => d.category), ['RTH', 'RTH', 'Dual-Use', 'ITH', 'Ausland', 'Ausland']);
  assert.equal(data[0].callsign, 'Christoph 1');
  assert.equal(data[0].url, 'https://www.rth.info/stationen.db/station.php?id=1&show=1');
});

test('callsign filter requires boundary after Christoph', () => {
  assert.equal(SPECIAL_CALLSIGN.test('Christophorus 1'), false);
  assert.equal(SPECIAL_CALLSIGN.test('Christoph Berlin'), true);
  assert.equal(SPECIAL_CALLSIGN.test('Christoph Berlin'), true); // JS \s includes NBSP
});

test('station parser ignores historical text and extracts active sighting', () => {
  const details = parseStationDetail(fixture('detail.html'), { id: 1, category: 'RTH', callsign: 'Christoph 1', url: 'https://www.rth.info/stationen.db/station.php?id=1&show=1' });
  assert.equal(details.callsign, 'Christoph 1');
  assert.equal(details.registration, 'D-HYAK');
  assert.equal(details.regKey, 'DHYAK');
  assert.equal(details.sightingDate, '2026-09-23');
  assert.equal(details.location, 'München');
  assert.equal(details.operator, 'ADAC Luftrettung');
  assert.equal(details.base, 'Städtisches Krankenhaus Harlaching');
});

test('invalid station document is rejected instead of corrupting DB', () => {
  assert.throws(() => parseStationDetail('<h1>Christoph 1</h1>', { id: 1 }), /missing required labeled fields/);
});
