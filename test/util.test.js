import test from 'node:test';
import assert from 'node:assert/strict';
import { isoDateFromGerman, normalizeRegistration, timeInBerlin } from '../src/util.js';

test('normalizes registrations and verifies calendar dates', () => {
  assert.equal(normalizeRegistration('D-HXAD'), 'DHXAD');
  assert.equal(normalizeRegistration('PH-ULP'), 'PHULP');
  assert.equal(isoDateFromGerman('D-HXAD – 23.09.2026'), '2026-09-23');
  assert.equal(isoDateFromGerman('31.02.2026'), null);
});

test('Europe/Berlin includes daylight-saving time', () => {
  assert.deepEqual(timeInBerlin(new Date('2026-09-26T08:00:00Z')), { day: '2026-09-26', hm: '10:00' });
  assert.deepEqual(timeInBerlin(new Date('2026-12-26T09:00:00Z')), { day: '2026-12-26', hm: '10:00' });
});
