import test from 'node:test';
import assert from 'node:assert/strict';
import { favoriteIcaos, safeTrackingUrl, trackingUrl, validIcao } from '../public/assets/tracking.js';

const stations = [
  { id: 1, callsign: 'Christoph Europa 1', icao: '3E0F5F' },
  { id: 2, callsign: 'Christoph 10', icao: '3ddc04' },
  { id: 3, callsign: 'Christoph 20', icao: '3e0f5f' },
  { id: 4, callsign: 'Christoph 30', icao: 'invalid' },
  { id: 5, callsign: 'Christoph 40', icao: null },
  { id: 6, callsign: 'Christoph 50', icao: 'ab1234' }
];

test('individual provider links use validated six-digit ICAO codes', () => {
  assert.equal(validIcao('3E0F5F'), '3e0f5f');
  assert.equal(trackingUrl('adsb', ['3E0F5F']), 'https://globe.adsbexchange.com/?icao=3e0f5f');
  assert.equal(trackingUrl('airplanes', ['3E0F5F']), 'https://globe.airplanes.live/?icao=3e0f5f');
  for (const invalid of [null, '', '3e0f5', '3e0f5g', '3e0f5f,123456', ' 3e0f5f']) {
    assert.equal(trackingUrl('adsb', [invalid]), null);
  }
  assert.equal(trackingUrl('unknown', ['3e0f5f']), null);
});

test('bulk tracking uses all stored favorites, irrespective of a filtered view', () => {
  const favorites = new Set([1, 2, 3, 4, 5]);
  const filteredView = stations.filter(station => station.id === 2);
  assert.equal(filteredView.length, 1);
  const icaos = favoriteIcaos(stations, favorites);
  assert.deepEqual(icaos, ['3e0f5f', '3ddc04']);
  assert.equal(trackingUrl('adsb', icaos), 'https://globe.adsbexchange.com/?icao=3e0f5f,3ddc04');
  assert.equal(trackingUrl('airplanes', icaos), 'https://globe.airplanes.live/?icao=3e0f5f,3ddc04');
  assert.deepEqual(favoriteIcaos(stations, new Set([6])), ['ab1234']);
  assert.equal(trackingUrl('airplanes', favoriteIcaos(stations, new Set([6]))), 'https://globe.airplanes.live/?icao=ab1234');
  assert.deepEqual(favoriteIcaos(stations, new Set([4, 5])), []);
  assert.deepEqual(favoriteIcaos(stations, new Set()), []);
  assert.equal(trackingUrl('adsb', []), null);
});

test('tracking URL validation rejects unsafe or foreign destinations', () => {
  for (const provider of ['adsb', 'airplanes']) {
    const link = trackingUrl(provider, ['3e0f5f', '3ddc04']);
    assert.equal(safeTrackingUrl(link), link);
  }
  for (const link of [
    'http://globe.adsbexchange.com/?icao=3e0f5f',
    'https://globe.adsbexchange.com.evil.test/?icao=3e0f5f',
    'https://globe.airplanes.live/other?icao=3e0f5f',
    'https://globe.airplanes.live/?icao=3e0f5f&x=1',
    'https://globe.airplanes.live/?icao=3e0f5f%2c3ddc04',
    'https://globe.airplanes.live/?icao=3e0f5f#fragment',
    'https://user@globe.airplanes.live/?icao=3e0f5f'
  ]) assert.equal(safeTrackingUrl(link), null);
});
