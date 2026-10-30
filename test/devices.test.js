// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): should_poll with poll_frequency, min /
// max / read_only / has_feedback on every feature, category / type pairs, and
// a single invalid field rejecting the whole discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';

import {
  deviceKey,
  idsOf,
  keyOfExternalId,
  givenKeysOf,
  buildDevice,
  buildStates,
  FEATURE_KEYS,
} from '../src/device.js';
import { parseLatest } from '../src/params.js';
import { aqiOf, levelOf } from '../src/aqi.js';
import { LANGUAGES } from '../src/i18n.js';
import { fixture, rebase, OFFICE, FULL } from './helpers/fake-api.js';

const fakeGladys = {
  externalIds: (type, id) => ({
    device: `ext:kaiterra:${type}:${id}`,
    feature: (key) => `ext:kaiterra:${type}:${id}:${key}`,
  }),
};
const readingOf = (name) => {
  const parsed = parseLatest(rebase(fixture(name)));
  const aqi = aqiOf(parsed.values);
  return { ...parsed, aqi, level: levelOf(aqi) };
};
const office = readingOf('top_sensedge.json');
const full = readingOf('top_sensedge_full.json');
const OFFICE_DEVICE = {
  key: deviceKey(OFFICE),
  name: 'Office',
  model: 'SE-100',
  features: givenKeysOf(office),
};
const FULL_DEVICE = {
  key: deviceKey(FULL),
  name: 'Living room',
  model: 'SE-200',
  features: givenKeysOf(full),
};
const devices = (language, gladys = fakeGladys) => [
  buildDevice(gladys, OFFICE_DEVICE, language),
  buildDevice(gladys, FULL_DEVICE, language),
];

const PAIRS = [
  [C.AIRQUALITY_SENSOR, T.AIRQUALITY_SENSOR.AQI, U.AQI],
  [C.PM25_SENSOR, T.SENSOR.DECIMAL, U.MICROGRAM_PER_CUBIC_METER],
  [C.PM10_SENSOR, T.SENSOR.DECIMAL, U.MICROGRAM_PER_CUBIC_METER],
  [C.CO2_SENSOR, T.SENSOR.INTEGER, U.PPM],
  [C.VOC_SENSOR, T.VOC_SENSOR.DECIMAL, U.PPB],
  [C.NO2_SENSOR, T.SENSOR.DECIMAL, U.MICROGRAM_PER_CUBIC_METER],
  [C.O3_SENSOR, T.SENSOR.DECIMAL, U.MICROGRAM_PER_CUBIC_METER],
  [C.TEMPERATURE_SENSOR, T.SENSOR.DECIMAL, U.CELSIUS],
  [C.TEMPERATURE_SENSOR, T.TEMPERATURE_SENSOR.PROBE, U.CELSIUS],
  [C.HUMIDITY_SENSOR, T.SENSOR.DECIMAL, U.PERCENT],
  [C.PRESSURE_SENSOR, T.SENSOR.DECIMAL, U.HECTO_PASCAL],
  [C.LIGHT_SENSOR, T.SENSOR.DECIMAL, U.LUX],
  [C.MOTION_SENSOR, T.SENSOR.BINARY, undefined],
  [C.TEXT, T.TEXT.TEXT, undefined],
];

test('devices are never polled by Gladys: the integration has its own timer', () => {
  for (const device of devices('en')) {
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      for (const feature of device.features) {
        assert.equal(typeof feature.min, 'number', feature.external_id);
        assert.equal(typeof feature.max, 'number', feature.external_id);
        assert.ok(feature.min <= feature.max);
        assert.equal(feature.read_only, true);
        assert.equal(feature.has_feedback, false);
      }
      assert.equal(
        new Set(device.features.map((f) => f.name)).size,
        device.features.length,
        'distinct names',
      );
    }
  }
});

test('category / type / unit pairs known to the Gladys front', () => {
  for (const feature of devices('en').flatMap((device) => device.features)) {
    assert.ok(
      PAIRS.some(
        ([c, ty, u]) => feature.category === c && feature.type === ty && feature.unit === u,
      ),
      `${feature.external_id}: ${feature.category}/${feature.type}/${feature.unit}`,
    );
  }
});

test('ids from a hash of the device id, never the id itself; features from what it measures', () => {
  const [officeDevice, living] = devices('fr');
  assert.equal(OFFICE_DEVICE.key, '94286bad7e49');
  assert.equal(officeDevice.external_id, 'ext:kaiterra:sensor:94286bad7e49');
  assert.doesNotMatch(JSON.stringify(devices('en')), /7e57c0de|5555555/);
  assert.equal(officeDevice.name, 'Kaiterra Office');
  assert.equal(officeDevice.model, 'Kaiterra SE-100');
  assert.deepEqual(
    officeDevice.features.map((f) => f.external_id.split(':').pop()),
    ['aqi', 'aqi_level', 'pm25', 'pm10', 'co2', 'tvoc', 'temperature', 'humidity'],
  );
  assert.deepEqual(
    living.features.map((f) => f.external_id.split(':').pop()),
    FEATURE_KEYS,
  );
  assert.equal(
    living.features.find((f) => f.external_id.endsWith(':tvoc')).name,
    'Composés organiques volatils (COVT)',
  );
  assert.equal(keyOfExternalId('ext:kaiterra:sensor:94286bad7e49:co2'), '94286bad7e49');
  assert.equal(keyOfExternalId('ext:kaiterra:sensor:94286bad7e49'), '94286bad7e49');
  assert.equal(keyOfExternalId('nothing'), null);
  assert.deepEqual(givenKeysOf(null), []);
});

test('states: values, the level as a text; what the device did not give is left untouched', () => {
  const byKey = (states) =>
    Object.fromEntries(
      states.map((s) => [s.device_feature_external_id.split(':').pop(), s.state ?? s.text]),
    );
  assert.deepEqual(byKey(buildStates(fakeGladys, OFFICE_DEVICE, office, { language: 'de' })), {
    aqi: 244,
    aqi_level: 'Sehr ungesund',
    pm25: 169,
    pm10: 125,
    co2: 1673,
    tvoc: 397,
    temperature: 26.25,
    humidity: 55.81,
  });
  const partial = { ...office, values: { co2: 700 } };
  assert.deepEqual(byKey(buildStates(fakeGladys, OFFICE_DEVICE, partial, { language: 'en' })), {
    aqi: 244,
    aqi_level: 'Very unhealthy',
    co2: 700,
  });
  assert.deepEqual(buildStates(fakeGladys, OFFICE_DEVICE, null), []);
  const off = { ...office, values: { co2: 90000 } };
  assert.equal(
    buildStates(fakeGladys, OFFICE_DEVICE, off).find((s) =>
      s.device_feature_external_id.endsWith(':co2'),
    ).state,
    40000,
  );
});

test('the discovery batch and the states pass the checks of the fake host API', async (t) => {
  const gladys = createFakeGladys({});
  t.after(() => gladys.fake.shutdown());
  await gladys.connect();
  for (const language of LANGUAGES) {
    await gladys.publishDiscoveredDevices(devices(language, gladys));
  }
  await gladys.fake.deviceCreated(gladys.fake.discoveredDevices[1]);
  await gladys.publishStates(buildStates(gladys, FULL_DEVICE, full, { language: 'en' }));
  const id = (key) => idsOf(gladys, FULL_DEVICE.key).feature(key);
  assert.equal(gladys.fake.lastState(id('aqi')), 29);
  assert.equal(gladys.fake.lastState(id('aqi_level')), 'Good');
  assert.equal(gladys.fake.lastState(id('motion')), 1);
  assert.equal(gladys.fake.lastState(id('pressure')), 1013.25);
});
