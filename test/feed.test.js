import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { decodeAircraftDatabase, selectAircraftMappings, validateAircraftDatabase } from '../src/feed.js';

test('aircraft importer handles JSON and GZIP and selects only wanted registrations', () => {
  const db = { DHXAD: '3E0F5F', DHUTH: '3e0965', TEST: 'not-hex' };
  const text = Buffer.from(JSON.stringify(db));
  assert.deepEqual(decodeAircraftDatabase(text), db);
  assert.deepEqual(decodeAircraftDatabase(gzipSync(text)), db);
  assert.deepEqual(selectAircraftMappings(db, ['D-HXAD', 'D-HUTH', 'TEST']), {
    DHXAD: '3e0f5f', DHUTH: '3e0965'
  });
  assert.throws(() => validateAircraftDatabase(db), /Suspicious/);
});
