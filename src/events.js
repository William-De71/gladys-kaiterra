// -----------------------------------------------------------------------------
// Scene triggers and scene action outputs.
//
// Triggers (one event per transition, never a periodic snapshot):
//   - `air_quality_changed`   the AQI level changes (Good -> Moderate…), with
//                             its direction;
//   - `threshold_exceeded`    CO₂, TVOC, PM2.5, PM10, NO₂, O₃ or CO goes over
//                             its reference value (aqi.js);
//   - `threshold_cleared`     … and back below 90 % of it;
//   - `connection_changed`    the device stops sending readings (15 minutes
//                             without a new one) or starts again;
//   - `sensor_module_worn`    a sensor module of a Sensedge has less than 10 %
//                             of its useful life left (armed again once a
//                             module above 50 % is back in that bay).
// A device reads every minute and values hover around a boundary: a level or
// a threshold state must hold for 5 minutes before it counts. The first
// reading of a device is a baseline. `seen` lives in /data: a restart never
// fires twice. A scene action or a widget never fires an event.
// -----------------------------------------------------------------------------

import { rankOf, POLLUTANTS, UNITS, CLEAR_RATIO, percentOf } from './aqi.js';
import { levelText, pollutantText } from './i18n.js';
import { formatTime, minutesBetween, MINUTE_MS } from './time.js';

const TRIGGERS = {
  AIR_QUALITY_CHANGED: 'air_quality_changed',
  THRESHOLD_EXCEEDED: 'threshold_exceeded',
  THRESHOLD_CLEARED: 'threshold_cleared',
  CONNECTION_CHANGED: 'connection_changed',
  SENSOR_MODULE_WORN: 'sensor_module_worn',
};
const STABLE_MS = 5 * MINUTE_MS;
const OFFLINE_MS = 15 * MINUTE_MS;
const WORN_PERCENT = 10;
const RENEWED_PERCENT = 50;
const AIR_QUALITY_OUTPUTS = [
  'name',
  'aqi',
  'level',
  'level_name',
  'pm1',
  'pm25',
  'pm10',
  'co2',
  'tvoc',
  'temperature',
  'humidity',
  'pressure',
  'no2',
  'o3',
  'co',
  'measured_at',
  'connection',
  'summary',
];

/**
 * @description A state that only counts once it held for STABLE_MS.
 * @param {object|undefined} seen - `{ value, pending, since }`, undefined at first.
 * @param {*} candidate - The state now.
 * @param {number} now - Now (ms).
 * @returns {{ next: object, changed: boolean, previous: * }} What to remember,
 * whether the confirmed state changed, and the one before.
 */
function settle(seen, candidate, now) {
  if (!seen || seen.value === undefined) {
    return { next: { value: candidate }, changed: false };
  }
  if (candidate === seen.value) {
    return { next: { value: seen.value }, changed: false };
  }
  if (seen.pending === candidate && now - seen.since >= STABLE_MS) {
    return { next: { value: candidate }, changed: true, previous: seen.value };
  }
  if (seen.pending === candidate) {
    return { next: seen, changed: false };
  }
  return { next: { value: seen.value, pending: candidate, since: now }, changed: false };
}

/**
 * @description Whether the AQI level changed (held 5 minutes).
 * @param {object|undefined} seen - What was remembered.
 * @param {string|null} level - The level now.
 * @param {number} now - Now (ms).
 * @returns {{ next: object, change: { previous: string, direction: string }|null }}
 */
function detectLevelChange(seen, level, now) {
  if (!level) {
    return { next: seen ?? {}, change: null };
  }
  const settled = settle(seen, level, now);
  if (!settled.changed || !settled.previous) {
    return { next: settled.next, change: null };
  }
  return {
    next: settled.next,
    change: {
      previous: settled.previous,
      direction: rankOf(level) > rankOf(settled.previous) ? 'worse' : 'better',
    },
  };
}

/**
 * @description The over / normal state of a value against its reference: over
 * above it, normal below 90 % of it, unchanged in between.
 * @param {string|undefined} current - `over`, `normal`, undefined.
 * @param {number} value - The value.
 * @param {number} limit - The reference value.
 * @returns {string} `over` or `normal`.
 */
function zoneOf(current, value, limit) {
  if (value > limit) {
    return 'over';
  }
  if (value < limit * CLEAR_RATIO) {
    return 'normal';
  }
  return current ?? 'normal';
}

/**
 * @description The values that went over their reference, or back below it.
 * @param {object} seen - pollutant -> `{ value, pending, since }`.
 * @param {object} values - The values of the reading.
 * @param {object} limits - pollutant -> reference value.
 * @param {number} now - Now (ms).
 * @returns {{ next: object, exceeded: string[], cleared: string[] }}
 */
function detectThresholds(seen = {}, values = {}, limits = {}, now = 0) {
  const next = { ...seen };
  const exceeded = [];
  const cleared = [];
  for (const pollutant of POLLUTANTS) {
    const value = values[pollutant];
    if (!Number.isFinite(value) || !Number.isFinite(limits[pollutant])) {
      continue;
    }
    const entry = seen[pollutant];
    const zone = zoneOf(entry?.value, value, limits[pollutant]);
    const settled = settle(entry, zone, now);
    next[pollutant] = settled.next;
    if (settled.changed) {
      (zone === 'over' ? exceeded : cleared).push(pollutant);
    }
  }
  return { next, exceeded, cleared };
}

/**
 * @description Whether a device stopped or started sending readings.
 * @param {boolean|undefined} seen - Online at the last check, undefined at first.
 * @param {number|null} measuredAt - The instant of its last reading.
 * @param {number} now - Now (ms).
 * @returns {{ online: boolean, changed: boolean }}
 */
function detectConnection(seen, measuredAt, now) {
  const online = Number.isFinite(measuredAt) && now - measuredAt <= OFFLINE_MS;
  return { online, changed: seen !== undefined && seen !== online };
}

/**
 * @description The sensor modules that wore out.
 * @param {string[]|undefined} seen - The bays already announced (undefined at first).
 * @param {object[]} modules - `[{ bay, type, lifetime }]` (params.js).
 * @returns {{ next: string[], worn: object[] }}
 */
function detectWornModules(seen, modules = []) {
  const known = new Set(seen ?? []);
  const worn = [];
  for (const module of modules) {
    if (!Number.isFinite(module.lifetime)) {
      continue;
    }
    const bay = String(module.bay);
    if (module.lifetime < WORN_PERCENT && !known.has(bay)) {
      known.add(bay);
      if (seen !== undefined) {
        worn.push(module);
      }
    } else if (module.lifetime >= RENEWED_PERCENT) {
      known.delete(bay);
    }
  }
  return { next: [...known].sort(), worn };
}

/**
 * @description The data of an `air_quality_changed` event.
 * @param {object} device - `{ deviceId, name }`.
 * @param {object} reading - The reading.
 * @param {object} change - `{ direction, previous }`.
 * @param {string} language - The language of the texts.
 * @returns {object} The flat payload.
 */
function changedData(device, reading, change, language) {
  return {
    device: device.deviceId,
    name: device.name,
    aqi: reading.aqi,
    level: reading.level,
    level_name: levelText(reading.level, language),
    previous_level: change.previous,
    direction: change.direction,
    pm25: reading.values.pm25 ?? null,
    pm10: reading.values.pm10 ?? null,
  };
}

/**
 * @description The data of a `threshold_exceeded` / `threshold_cleared` event.
 * @param {object} device - `{ deviceId, name }`.
 * @param {object} reading - The reading.
 * @param {string} pollutant - The pollutant key.
 * @param {number} limit - Its reference value.
 * @param {string} language - The language of the texts.
 * @returns {object} The flat payload.
 */
function thresholdData(device, reading, pollutant, limit, language) {
  const value = reading.values[pollutant];
  return {
    device: device.deviceId,
    name: device.name,
    pollutant,
    pollutant_name: pollutantText(pollutant, language),
    value,
    unit: UNITS[pollutant],
    limit,
    percent: percentOf(value, limit),
  };
}

/**
 * @description The data of a `connection_changed` event.
 * @param {object} device - `{ deviceId, name }`.
 * @param {boolean} online - Online now.
 * @param {number|null} measuredAt - The instant of its last reading.
 * @param {object} options - `{ language, timeZone, now }`.
 * @returns {object} The flat payload.
 */
function connectionData(device, online, measuredAt, { language, timeZone, now }) {
  return {
    device: device.deviceId,
    name: device.name,
    state: online ? 'online' : 'offline',
    last_seen: formatTime(measuredAt, { language, timeZone }),
    minutes: Number.isFinite(measuredAt) ? minutesBetween(measuredAt, now) : null,
  };
}

/**
 * @description The data of a `sensor_module_worn` event.
 * @param {object} device - `{ deviceId, name }`.
 * @param {object} module - `{ bay, type, lifetime }`.
 * @returns {object} The flat payload.
 */
function moduleData(device, module) {
  return {
    device: device.deviceId,
    name: device.name,
    module: module.type || null,
    bay: module.bay,
    lifetime: module.lifetime,
  };
}

/**
 * @description Keep only the declared keys of a scene action result.
 * @param {object} outputs - The values.
 * @param {string[]} keys - The declared outputs.
 * @returns {object} The result.
 */
const pick = (outputs, keys) => Object.fromEntries(keys.map((key) => [key, outputs[key] ?? null]));

export {
  TRIGGERS,
  STABLE_MS,
  OFFLINE_MS,
  WORN_PERCENT,
  RENEWED_PERCENT,
  AIR_QUALITY_OUTPUTS,
  settle,
  detectLevelChange,
  zoneOf,
  detectThresholds,
  detectConnection,
  detectWornModules,
  changedData,
  thresholdData,
  connectionData,
  moduleData,
  pick,
};
