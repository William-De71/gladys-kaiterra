// -----------------------------------------------------------------------------
// The air quality index and the reference values.
//
// AQI: the US EPA Air Quality Index of particles, the one the Kaiterra apps
// show, computed from the value (never taken from the API): PM2.5 with the
// breakpoints revised in February 2024 (effective 6 May 2024), PM10 with the
// 2012 ones; the index is the higher of both. The EPA defines it on 24-hour
// means; here it is computed on the last reading, like an indoor monitor
// shows it. Six levels, from `good` to `hazardous`.
//
// Reference values (scene trigger `threshold_exceeded`, widget colors): the
// WHO 2021 air quality guidelines for PM2.5 (15 µg/m³, 24-hour mean), PM10
// (45), NO₂ (25), O₃ (100, 8-hour mean) and CO (4 mg/m³, about 3.5 ppm); for
// CO₂ and TVOC, which have no guideline, the values of the configuration
// (1,000 ppm and 500 ppb by default).
// -----------------------------------------------------------------------------

const LEVELS = [
  'good',
  'moderate',
  'unhealthy_sensitive',
  'unhealthy',
  'very_unhealthy',
  'hazardous',
];
const LEVEL_TOPS = [50, 100, 150, 200, 300, 500];

// [low concentration, high concentration, low index, high index]
const PM25_BREAKPOINTS = [
  [0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
];
const PM10_BREAKPOINTS = [
  [0, 54, 0, 50],
  [55, 154, 51, 100],
  [155, 254, 101, 150],
  [255, 354, 151, 200],
  [355, 424, 201, 300],
  [425, 604, 301, 500],
];

const DEFAULT_LIMITS = { co2: 1000, tvoc: 500 };
const WHO_LIMITS = { pm25: 15, pm10: 45, no2: 25, o3: 100, co: 3.5 };
const POLLUTANTS = ['co2', 'tvoc', 'pm25', 'pm10', 'no2', 'o3', 'co'];
const UNITS = {
  co2: 'ppm',
  tvoc: 'ppb',
  pm25: 'µg/m³',
  pm10: 'µg/m³',
  no2: 'µg/m³',
  o3: 'µg/m³',
  co: 'ppm',
};
// Back below this share of the limit, an exceeded value is back to normal.
const CLEAR_RATIO = 0.9;

/**
 * @description The sub-index of a concentration.
 * @param {number} value - The concentration.
 * @param {number[][]} breakpoints - The table.
 * @param {number} decimals - The precision the EPA truncates to.
 * @returns {number|null} The index, null without a value.
 */
function subIndex(value, breakpoints, decimals) {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  const factor = 10 ** decimals;
  const c = Math.floor(value * factor) / factor;
  const top = breakpoints.at(-1);
  if (c > top[1]) {
    // Beyond the table: the EPA extends the last segment, capped at 500 here.
    return Math.min(
      500,
      Math.round(((top[3] - top[2]) / (top[1] - top[0])) * (c - top[0]) + top[2]),
    );
  }
  const row =
    breakpoints.find(([low, high]) => c >= low && c <= high) ??
    // A value between two rows (35.45 truncated to 35.4 never falls there, but 54.5 for PM10 does).
    breakpoints.find(([low]) => c < low);
  const [low, high, iLow, iHigh] = row;
  const clamped = Math.max(c, low);
  return Math.round(((iHigh - iLow) / (high - low)) * (clamped - low) + iLow);
}

/**
 * @description The AQI of a reading: the higher of PM2.5 and PM10.
 * @param {object} values - `{ pm25, pm10 }` in µg/m³.
 * @returns {number|null} The AQI (0-500), null without particles.
 */
function aqiOf(values = {}) {
  const indexes = [
    subIndex(values.pm25, PM25_BREAKPOINTS, 1),
    subIndex(values.pm10, PM10_BREAKPOINTS, 0),
  ].filter((index) => index !== null);
  return indexes.length ? Math.max(...indexes) : null;
}

/**
 * @description The level of an AQI.
 * @param {number|null} aqi - The AQI.
 * @returns {string|null} The level key.
 */
function levelOf(aqi) {
  if (!Number.isFinite(aqi)) {
    return null;
  }
  const index = LEVEL_TOPS.findIndex((top) => aqi <= top);
  return LEVELS[index === -1 ? LEVELS.length - 1 : index];
}

/**
 * @description The rank of a level, to compare them.
 * @param {string|null} level - The level key.
 * @returns {number} 0 for good … 5 for hazardous, -1 for none.
 */
const rankOf = (level) => LEVELS.indexOf(level);

/**
 * @description The limits in use.
 * @param {object} [custom] - `{ co2, tvoc }` from the configuration.
 * @returns {object} pollutant -> limit.
 */
const limitsOf = (custom = {}) => ({
  ...WHO_LIMITS,
  co2: custom.co2 ?? DEFAULT_LIMITS.co2,
  tvoc: custom.tvoc ?? DEFAULT_LIMITS.tvoc,
});

/**
 * @description A value in percent of its limit.
 * @param {number} value - The value.
 * @param {number} limit - The limit.
 * @returns {number} Whole percent.
 */
const percentOf = (value, limit) => Math.round((value / limit) * 100);

export {
  LEVELS,
  LEVEL_TOPS,
  PM25_BREAKPOINTS,
  PM10_BREAKPOINTS,
  DEFAULT_LIMITS,
  WHO_LIMITS,
  POLLUTANTS,
  UNITS,
  CLEAR_RATIO,
  subIndex,
  aqiOf,
  levelOf,
  rankOf,
  limitsOf,
  percentOf,
};
