// Scene trigger transitions: a state counts once it held 5 minutes, the
// first reading is a baseline, thresholds clear below 90 %.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  settle,
  detectLevelChange,
  detectThresholds,
  detectConnection,
  detectWornModules,
  thresholdData,
  connectionData,
  moduleData,
  changedData,
  pick,
  STABLE_MS,
  OFFLINE_MS,
} from '../src/events.js';
import { limitsOf } from '../src/aqi.js';

const MINUTE = 60000;
const DEVICE = { deviceId: 'ext:kaiterra:sensor:abc', name: 'Office' };

test('settle: a new state must hold 5 minutes; a flap back cancels it', () => {
  let s = settle(undefined, 'good', 0);
  assert.deepEqual(s, { next: { value: 'good' }, changed: false });
  s = settle(s.next, 'moderate', MINUTE);
  assert.equal(s.changed, false);
  assert.deepEqual(s.next, { value: 'good', pending: 'moderate', since: MINUTE });
  const flap = settle(s.next, 'good', 2 * MINUTE);
  assert.deepEqual(flap.next, { value: 'good' });
  s = settle(s.next, 'moderate', MINUTE + STABLE_MS - 1);
  assert.equal(s.changed, false);
  s = settle(s.next, 'moderate', MINUTE + STABLE_MS);
  assert.equal(s.changed, true);
  assert.equal(s.previous, 'good');
  assert.deepEqual(s.next, { value: 'moderate' });
});

test('level change: direction, nothing without a level', () => {
  let r = detectLevelChange(undefined, 'good', 0);
  assert.equal(r.change, null);
  r = detectLevelChange(r.next, 'unhealthy', 0);
  r = detectLevelChange(r.next, 'unhealthy', STABLE_MS);
  assert.deepEqual(r.change, { previous: 'good', direction: 'worse' });
  r = detectLevelChange(r.next, 'moderate', STABLE_MS);
  r = detectLevelChange(r.next, 'moderate', 2 * STABLE_MS);
  assert.deepEqual(r.change, { previous: 'unhealthy', direction: 'better' });
  assert.equal(detectLevelChange(r.next, null, 3 * STABLE_MS).change, null);
});

test('thresholds: over above the reference, normal below 90 %, unchanged between', () => {
  const limits = limitsOf();
  let r = detectThresholds(undefined, { co2: 1200, pm25: 4 }, limits, 0);
  assert.deepEqual([r.exceeded, r.cleared], [[], []], 'the first reading is a baseline');
  assert.equal(r.next.co2.value, 'over');
  r = detectThresholds(r.next, { co2: 950, pm25: 20 }, limits, MINUTE);
  r = detectThresholds(r.next, { co2: 950, pm25: 20 }, limits, MINUTE + STABLE_MS);
  assert.deepEqual(r.exceeded, ['pm25']);
  assert.deepEqual(r.cleared, [], '950 ppm: between 900 and 1000, still over');
  r = detectThresholds(r.next, { co2: 850 }, limits, 2 * MINUTE + STABLE_MS);
  r = detectThresholds(r.next, { co2: 850 }, limits, 2 * MINUTE + 2 * STABLE_MS);
  assert.deepEqual(r.cleared, ['co2']);
  assert.equal(r.next.pm25.value, 'over', 'a value not measured keeps its state');
});

test('connection: offline after 15 minutes without a new reading; no event at first', () => {
  assert.deepEqual(detectConnection(undefined, 0, OFFLINE_MS + 1), {
    online: false,
    changed: false,
  });
  assert.deepEqual(detectConnection(true, 0, OFFLINE_MS), { online: true, changed: false });
  assert.deepEqual(detectConnection(true, 0, OFFLINE_MS + 1), { online: false, changed: true });
  assert.deepEqual(detectConnection(false, 10, 20), { online: true, changed: true });
});

test('worn modules: below 10 % once per bay, armed again by a new module', () => {
  const worn = [
    { bay: 0, type: 'KM-102', lifetime: 8.1 },
    { bay: 1, type: 'KM-100', lifetime: 71 },
  ];
  let r = detectWornModules(undefined, worn);
  assert.deepEqual(r, { next: ['0'], worn: [] }, 'already worn at the first reading: no event');
  r = detectWornModules([], worn);
  assert.deepEqual(
    r.worn.map((m) => m.type),
    ['KM-102'],
  );
  r = detectWornModules(r.next, worn);
  assert.deepEqual(r.worn, []);
  r = detectWornModules(r.next, [{ bay: 0, type: 'KM-102', lifetime: 99 }]);
  assert.deepEqual(r.next, []);
  assert.deepEqual(detectWornModules([], [{ bay: 0, lifetime: null }]).worn, []);
});

test('payloads: flat, scalar, the declared keys', () => {
  const reading = { aqi: 244, level: 'very_unhealthy', values: { pm25: 169, co2: 1673 } };
  const data = [
    changedData(DEVICE, reading, { previous: 'good', direction: 'worse' }, 'fr'),
    thresholdData(DEVICE, reading, 'co2', 1000, 'en'),
    connectionData(DEVICE, false, Date.parse('2026-10-30T17:00:00Z'), {
      language: 'fr',
      timeZone: 'Europe/Paris',
      now: Date.parse('2026-10-30T17:20:00Z'),
    }),
    moduleData(DEVICE, { bay: 1, type: 'KM-100', lifetime: 8 }),
  ];
  assert.equal(data[0].level_name, 'Très mauvaise');
  assert.equal(data[0].pm10, null);
  assert.deepEqual(data[1], {
    device: DEVICE.deviceId,
    name: 'Office',
    pollutant: 'co2',
    pollutant_name: 'CO₂',
    value: 1673,
    unit: 'ppm',
    limit: 1000,
    percent: 167,
  });
  assert.deepEqual(data[2], {
    device: DEVICE.deviceId,
    name: 'Office',
    state: 'offline',
    last_seen: '18:00',
    minutes: 20,
  });
  for (const payload of data) {
    assert.ok(Object.keys(payload).length <= 30);
    for (const value of Object.values(payload)) {
      assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
    }
  }
  assert.deepEqual(pick({ a: 1, b: 2 }, ['a', 'c']), { a: 1, c: null });
});
