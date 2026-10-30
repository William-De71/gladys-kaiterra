// Readings of the API in the units of Gladys, the hourly history, the metadata.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseLatest, parseHistory, parseMetadata, convert } from '../src/params.js';
import { fixture, rebase, hourlyHistory, NOW } from './helpers/fake-api.js';

test('the Sensedge of the documentation: values and the instant of the reading', () => {
  const reading = parseLatest(rebase(fixture('top_sensedge.json')));
  assert.equal(reading.at, NOW - 60000);
  assert.deepEqual(reading.values, {
    co2: 1673,
    humidity: 55.81,
    pm10: 125,
    pm25: 169,
    temperature: 26.25,
    tvoc: 397,
  });
});

test('every parameter code: °F, Pa and ppb converted, tvoc over rtvoc, unknown codes left out', () => {
  const reading = parseLatest(rebase(fixture('top_sensedge_full.json')));
  assert.deepEqual(reading.values, {
    co2: 612,
    pm1: 3,
    pm25: 5.2,
    pm10: 8,
    tvoc: 180,
    temperature: 22,
    humidity: 44.3,
    dew_point: 9.1,
    pressure: 1013.25,
    no2: 18.82,
    o3: 39.26,
    co: 0.4,
    light: 312.5,
    motion: 1,
  });
  assert.equal(reading.at, NOW - 60000, 'the newest point, not the motion one');
});

test('unit conversions, and units that cannot be converted', () => {
  assert.equal(convert('pm25', 0.012, 'mg/m³'), 12);
  assert.equal(convert('pm25', 12, 'ug/m3'), 12);
  assert.equal(convert('co2', 650000, 'ppb'), 650);
  assert.equal(convert('pressure', 1013, 'hPa'), 1013);
  assert.equal(Math.round(convert('co', 1.1456, 'mg/m³') * 100) / 100, 1);
  assert.equal(convert('no2', 30, 'µg/m³'), 30);
  assert.equal(convert('tvoc', 0.4, 'mg/m³'), null, 'TVOC mass: depends on the gas, never guessed');
  assert.equal(convert('humidity', 0.5, 'ratio'), null);
  assert.equal(convert('motion', 0, 'x'), 0);
});

test('nothing measured: null; null values and empty series are skipped', () => {
  assert.equal(parseLatest({ data: [] }), null);
  assert.equal(parseLatest({}), null);
  assert.equal(
    parseLatest({ data: [{ param: 'rco2', units: 'ppm', points: [{ ts: 'x', value: null }] }] }),
    null,
  );
  const reading = parseLatest({
    data: [{ param: 'rco2', units: 'ppm', points: [{ ts: 'not a date', value: 500 }] }],
  });
  assert.deepEqual(reading, { at: null, values: { co2: 500 } });
});

test('hourly history: oldest first, null hours left out', () => {
  const history = parseHistory(hourlyHistory(NOW));
  assert.equal(history.co2.length, 24);
  assert.equal(history.co2[0].at, NOW - 23 * 3600000);
  assert.equal(history.co2.at(-1).value, 450 + 23 * 30);
  assert.equal(history.pm25.length, 23);
  assert.equal(history.temperature[10].value, 20);
});

test('metadata: name, model, firmware, sensor modules (and the deprecated bay fields)', () => {
  assert.deepEqual(parseMetadata(fixture('metadata_sensedge.json')), {
    name: 'Office',
    model: 'SE-100',
    firmware: '1.15.0.2',
    modules: [
      { bay: 0, serial: 'VH21110009', type: 'KM-103', lifetime: 30 },
      { bay: 1, serial: 'VH21110010', type: 'KM-100', lifetime: 29.9 },
    ],
  });
  assert.deepEqual(parseMetadata(fixture('metadata_old_sensedge.json')).modules, [
    { bay: 0, serial: '', type: 'KM-102', lifetime: 8.1 },
    { bay: 1, serial: '', type: 'KM-100', lifetime: 71 },
  ]);
  assert.deepEqual(parseMetadata({ name: 'Bedroom', model: 'LE-101' }), {
    name: 'Bedroom',
    model: 'LE-101',
    firmware: '',
    modules: [],
  });
});
