// The US EPA AQI of the particles (PM2.5 breakpoints of 2024) and its levels.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  aqiOf,
  levelOf,
  rankOf,
  limitsOf,
  percentOf,
  LEVELS,
  PM25_BREAKPOINTS,
  PM10_BREAKPOINTS,
  subIndex,
} from '../src/aqi.js';

test('PM2.5 breakpoints of 2024: the boundaries of each level', () => {
  const pm25 = (value) => aqiOf({ pm25: value });
  assert.deepEqual(
    [0, 9.0, 9.09, 9.1, 35.4, 35.5, 55.4, 55.5, 125.4, 125.5, 225.4, 225.5, 325.4].map(pm25),
    [0, 50, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301, 500],
  );
  assert.equal(pm25(169), 244, 'the Sensedge of the documentation');
  assert.equal(pm25(12), 56, 'what was still "good" before 2024');
  assert.equal(pm25(900), 500, 'beyond the table: capped at 500');
});

test('PM10 breakpoints, and the higher of both sub-indexes', () => {
  const pm10 = (value) => aqiOf({ pm10: value });
  assert.deepEqual(
    [0, 54, 54.9, 55, 154, 155, 254, 255, 354, 355, 424, 425, 604].map(pm10),
    [0, 50, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301, 500],
  );
  assert.equal(aqiOf({ pm25: 5, pm10: 160 }), 103);
  assert.equal(aqiOf({ pm25: 40, pm10: 20 }), 112);
  assert.equal(aqiOf({ co2: 2000 }), null, 'no particles, no AQI');
  assert.equal(subIndex(-1, PM25_BREAKPOINTS, 1), null);
  assert.equal(subIndex(Number.NaN, PM10_BREAKPOINTS, 0), null);
});

test('six levels from the index', () => {
  assert.deepEqual([0, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301, 500].map(levelOf), [
    'good',
    'good',
    'moderate',
    'moderate',
    'unhealthy_sensitive',
    'unhealthy_sensitive',
    'unhealthy',
    'unhealthy',
    'very_unhealthy',
    'very_unhealthy',
    'hazardous',
    'hazardous',
  ]);
  assert.equal(levelOf(null), null);
  assert.equal(rankOf('hazardous'), LEVELS.length - 1);
  assert.equal(rankOf(null), -1);
});

test('reference values: the WHO ones, CO₂ and TVOC from the configuration', () => {
  assert.deepEqual(limitsOf(), {
    pm25: 15,
    pm10: 45,
    no2: 25,
    o3: 100,
    co: 3.5,
    co2: 1000,
    tvoc: 500,
  });
  assert.equal(limitsOf({ co2: 800, tvoc: 300 }).co2, 800);
  assert.equal(percentOf(1673, 1000), 167);
});
