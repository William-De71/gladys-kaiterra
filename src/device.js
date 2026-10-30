// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen.
//
// "Kaiterra <name>": one per configured device (Sensedge, Sensedge Mini,
// Laser Egg…), offered once it answered. Read-only features (category /
// type pairs of the SDK constants, with an icon and a label in the front),
// each one offered once the device gave the value it needs — they never go
// away afterwards (a feature that flaps would ask the user to update the
// device):
//   - `aqi`             airquality-sensor / aqi, 0-500: the US AQI of the
//                       particles (aqi.js);
//   - `aqi_level`       text: "Moderate", in the language of the integration;
//   - `pm25`, `pm10`    pm25-sensor / pm10-sensor, decimal, µg/m³;
//   - `co2`             co2-sensor / integer, ppm;
//   - `tvoc`            voc-sensor / decimal, ppb;
//   - `temperature`, `humidity`, `pressure`   decimal, °C, %, hPa;
//   - `no2`, `o3`       no2-sensor / o3-sensor, decimal, µg/m³ (converted);
//   - `light`           light-sensor / decimal, lx;
//   - `motion`          motion-sensor / binary;
//   - `dew_point`       temperature-sensor / probe, °C (kept out of the
//                       average temperature of the room).
// PM1 has no category in Gladys (pm25-sensor would mislabel it), CO is a
// binary detector there: both stay in the scene action.
//
// External ids: the first 12 hexadecimal digits of the SHA-256 of the device
// id — stable, and the id itself (a secret for the API) never shows in
// Gladys. `should_poll` stays false: the integration reads on its own timer.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { t, levelText } from './i18n.js';

const DEVICE_TYPE = 'sensor';
const TEXT_MAX = 250;

const sensor = (category, type, unit, min, max) => ({
  category,
  type,
  unit,
  min,
  max,
  read_only: true,
  has_feedback: false,
  keep_history: true,
});
const concentration = (category, max) =>
  sensor(category, TYPES.SENSOR.DECIMAL, UNITS.MICROGRAM_PER_CUBIC_METER, 0, max);
const textShape = {
  category: CATEGORIES.TEXT,
  type: TYPES.TEXT.TEXT,
  min: 0,
  max: 0,
  read_only: true,
  has_feedback: false,
  keep_history: false,
};
const value = (key) => (reading) => reading.values?.[key] ?? null;
const hasParticles = (reading) =>
  Number.isFinite(reading?.values?.pm25) || Number.isFinite(reading?.values?.pm10);

// `given`: whether a reading gives the feature.
const FEATURES = [
  {
    key: 'aqi',
    name: 'featureAqi',
    shape: sensor(CATEGORIES.AIRQUALITY_SENSOR, TYPES.AIRQUALITY_SENSOR.AQI, UNITS.AQI, 0, 500),
    given: hasParticles,
    state: (reading) => reading.aqi ?? null,
  },
  { key: 'aqi_level', name: 'featureAqiLevel', shape: textShape, given: hasParticles, text: true },
  {
    key: 'pm25',
    name: 'featurePm25',
    shape: concentration(CATEGORIES.PM25_SENSOR, 1000),
    state: value('pm25'),
  },
  {
    key: 'pm10',
    name: 'featurePm10',
    shape: concentration(CATEGORIES.PM10_SENSOR, 2000),
    state: value('pm10'),
  },
  {
    key: 'co2',
    name: 'featureCo2',
    shape: sensor(CATEGORIES.CO2_SENSOR, TYPES.SENSOR.INTEGER, UNITS.PPM, 0, 40000),
    state: value('co2'),
  },
  {
    key: 'tvoc',
    name: 'featureTvoc',
    shape: sensor(CATEGORIES.VOC_SENSOR, TYPES.VOC_SENSOR.DECIMAL, UNITS.PPB, 0, 100000),
    state: value('tvoc'),
  },
  {
    key: 'temperature',
    name: 'featureTemperature',
    shape: sensor(CATEGORIES.TEMPERATURE_SENSOR, TYPES.SENSOR.DECIMAL, UNITS.CELSIUS, -40, 85),
    state: value('temperature'),
  },
  {
    key: 'humidity',
    name: 'featureHumidity',
    shape: sensor(CATEGORIES.HUMIDITY_SENSOR, TYPES.SENSOR.DECIMAL, UNITS.PERCENT, 0, 100),
    state: value('humidity'),
  },
  {
    key: 'pressure',
    name: 'featurePressure',
    shape: sensor(CATEGORIES.PRESSURE_SENSOR, TYPES.SENSOR.DECIMAL, UNITS.HECTO_PASCAL, 300, 1100),
    state: value('pressure'),
  },
  {
    key: 'no2',
    name: 'featureNo2',
    shape: concentration(CATEGORIES.NO2_SENSOR, 2000),
    state: value('no2'),
  },
  {
    key: 'o3',
    name: 'featureO3',
    shape: concentration(CATEGORIES.O3_SENSOR, 2000),
    state: value('o3'),
  },
  {
    key: 'light',
    name: 'featureLight',
    shape: sensor(CATEGORIES.LIGHT_SENSOR, TYPES.SENSOR.DECIMAL, UNITS.LUX, 0, 200000),
    state: value('light'),
  },
  {
    key: 'motion',
    name: 'featureMotion',
    shape: { ...sensor(CATEGORIES.MOTION_SENSOR, TYPES.SENSOR.BINARY, undefined, 0, 1) },
    state: value('motion'),
  },
  {
    key: 'dew_point',
    name: 'featureDewPoint',
    shape: sensor(
      CATEGORIES.TEMPERATURE_SENSOR,
      TYPES.TEMPERATURE_SENSOR.PROBE,
      UNITS.CELSIUS,
      -60,
      60,
    ),
    state: value('dew_point'),
  },
];
for (const feature of FEATURES) {
  if (feature.shape.unit === undefined) {
    delete feature.shape.unit;
  }
  feature.given ??= (reading) => Number.isFinite(reading?.values?.[feature.key]);
}
const FEATURE_KEYS = FEATURES.map((feature) => feature.key);

/**
 * @description The key of a device: the first 12 hexadecimal digits of the
 * SHA-256 of its id (lowercase, with dashes).
 * @param {string} udid - The device id.
 * @returns {string} "3f9c0a…".
 */
const deviceKey = (udid) => createHash('sha256').update(udid).digest('hex').slice(0, 12);

/**
 * @description The external ids of a device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} key - The device key.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys, key) => gladys.externalIds(DEVICE_TYPE, key);

/**
 * @description The device key of a device (or feature) external id.
 * @param {unknown} externalId - The id.
 * @returns {string|null} The key.
 * @example
 * keyOfExternalId('ext:kaiterra:sensor:3f9c0a1b2c3d:co2'); // -> '3f9c0a1b2c3d'
 */
function keyOfExternalId(externalId) {
  const match = /:sensor:([0-9a-f]{12})(?::[a-z_0-9]+)?$/.exec(String(externalId ?? ''));
  return match ? match[1] : null;
}

/**
 * @description The features a reading gives.
 * @param {object|null} reading - The reading.
 * @returns {string[]} The feature keys.
 */
const givenKeysOf = (reading) =>
  reading ? FEATURES.filter((feature) => feature.given(reading)).map((feature) => feature.key) : [];

/**
 * @description Build the device of a Kaiterra device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} device - `{ key, name, model, features }`: `features` the
 * feature keys the device ever gave.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildDevice(gladys, device, language = 'en') {
  const ids = idsOf(gladys, device.key);
  const given = new Set(device.features ?? []);
  return {
    name: t('deviceName', language, { name: device.name }),
    external_id: ids.device,
    model: device.model ? `Kaiterra ${device.model}` : 'Kaiterra',
    should_poll: false,
    params: [],
    features: FEATURES.filter((feature) => given.has(feature.key)).map((feature) => ({
      name: t(feature.name, language),
      external_id: ids.feature(feature.key),
      ...feature.shape,
    })),
  };
}

/**
 * @description The states of a device. A value the device did not give this
 * time is left untouched (a 0 would claim clean air).
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} device - `{ key, features }`.
 * @param {object|null} reading - `{ values, aqi, level }`.
 * @param {object} [options] - `{ language }`.
 * @returns {object[]} `{ device_feature_external_id, state | text }`.
 */
function buildStates(gladys, device, reading, { language = 'en' } = {}) {
  if (!reading) {
    return [];
  }
  const ids = idsOf(gladys, device.key);
  const given = new Set(device.features ?? []);
  const states = [];
  for (const feature of FEATURES) {
    if (!given.has(feature.key)) {
      continue;
    }
    const id = ids.feature(feature.key);
    if (feature.text) {
      const text = levelText(reading.level, language);
      if (text) {
        states.push({ device_feature_external_id: id, text: text.slice(0, TEXT_MAX) });
      }
      continue;
    }
    const state = feature.state(reading);
    if (Number.isFinite(state)) {
      states.push({
        device_feature_external_id: id,
        state: Math.min(Math.max(state, feature.shape.min), feature.shape.max),
      });
    }
  }
  return states;
}

export {
  DEVICE_TYPE,
  FEATURES,
  FEATURE_KEYS,
  deviceKey,
  idsOf,
  keyOfExternalId,
  givenKeysOf,
  buildDevice,
  buildStates,
};
