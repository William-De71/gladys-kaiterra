// -----------------------------------------------------------------------------
// Readings of the Kaiterra API -> values in the units of Gladys.
//
// The API returns one series per parameter (`param`, `units`, `source`,
// `span`, `points: [{ ts, value }]`). Parameter codes (API 2025-02-26):
//   rpm1c, rpm25c, rpm10c   PM1, PM2.5, PM10, µg/m³
//   rco2                    CO₂, ppm
//   tvoc (rtvoc before)     TVOC, ppb (rtvoc is deprecated, removed in October 2027)
//   rtemp, dew_point        temperature and dew point, C (or F)
//   rhumid                  relative humidity, %
//   atmospheric_pressure    Pa
//   ro3, no2                ozone, nitrogen dioxide, ppb
//   co                      carbon monoxide, ppm
//   light_clear             illuminance, lx
//   pir                     motion, 0 or 1
// Gladys stores NO₂ and O₃ in µg/m³ and the pressure in hPa: the values are
// converted (gases at 25 °C and 1 atm, molar volume 24.45 L). A value whose
// unit cannot be converted is left out, never guessed.
// -----------------------------------------------------------------------------

const MOLAR_VOLUME = 24.45;
const MOLAR_MASS = { no2: 46.0055, o3: 47.9982, co: 28.0101 };

// The value key of each parameter code; `tvoc` wins over `rtvoc`.
const PARAMS = {
  rpm1c: 'pm1',
  rpm25c: 'pm25',
  rpm10c: 'pm10',
  rco2: 'co2',
  tvoc: 'tvoc',
  rtvoc: 'tvoc',
  rtemp: 'temperature',
  dew_point: 'dew_point',
  rhumid: 'humidity',
  atmospheric_pressure: 'pressure',
  ro3: 'o3',
  no2: 'no2',
  co: 'co',
  light_clear: 'light',
  pir: 'motion',
};
const PREFERRED = { tvoc: 'tvoc' };
const VALUE_KEYS = [...new Set(Object.values(PARAMS))];

const normalizeUnit = (unit) =>
  String(unit ?? '')
    .trim()
    .toLowerCase()
    .replace('μ', 'µ')
    .replace(/^ug\/m3$/, 'µg/m³')
    .replace(/^mg\/m3$/, 'mg/m³')
    .replace(/^°/, '');

/**
 * @description Convert a value to the unit Gladys stores for its key.
 * @param {string} key - The value key.
 * @param {number} value - The value.
 * @param {string} unit - The unit the API gave.
 * @returns {number|null} The value, null when the unit is not convertible.
 */
function convert(key, value, unit) {
  const u = normalizeUnit(unit);
  switch (key) {
    case 'pm1':
    case 'pm25':
    case 'pm10':
      if (u === 'µg/m³' || u === '') return value;
      return u === 'mg/m³' ? value * 1000 : null;
    case 'co2':
      if (u === 'ppm' || u === '') return value;
      return u === 'ppb' ? value / 1000 : null;
    case 'tvoc':
      if (u === 'ppb' || u === '') return value;
      return u === 'ppm' ? value * 1000 : null;
    case 'temperature':
    case 'dew_point':
      if (u === 'c' || u === '') return value;
      return u === 'f' ? ((value - 32) * 5) / 9 : null;
    case 'humidity':
      return u === '%' || u === '' ? value : null;
    case 'pressure':
      if (u === 'pa' || u === '') return value / 100;
      if (u === 'hpa' || u === 'mbar') return value;
      return u === 'kpa' ? value * 10 : null;
    case 'no2':
    case 'o3': {
      const factor = MOLAR_MASS[key] / MOLAR_VOLUME;
      if (u === 'ppb' || u === '') return value * factor;
      if (u === 'ppm') return value * 1000 * factor;
      if (u === 'µg/m³') return value;
      return u === 'mg/m³' ? value * 1000 : null;
    }
    case 'co':
      if (u === 'ppm' || u === '') return value;
      if (u === 'ppb') return value / 1000;
      return u === 'mg/m³' ? value / (MOLAR_MASS.co / MOLAR_VOLUME) : null;
    case 'light':
      return u === 'lx' || u === '' ? value : null;
    case 'motion':
      return value > 0 ? 1 : 0;
    default:
      return null;
  }
}

/**
 * @description Round a converted value: 2 decimals at most, integers for CO₂ and TVOC.
 * @param {string} key - The value key.
 * @param {number} value - The value.
 * @returns {number} The rounded value.
 */
function round(key, value) {
  if (key === 'co2' || key === 'tvoc' || key === 'motion') {
    return Math.round(value);
  }
  return Math.round(value * 100) / 100;
}

/**
 * @description The instant of a point.
 * @param {object} point - `{ ts }`.
 * @returns {number|null} Milliseconds.
 */
function instantOf(point) {
  const at = Date.parse(point?.ts ?? '');
  return Number.isFinite(at) ? at : null;
}

/**
 * @description The series of an answer, by value key: the preferred parameter
 * code wins (`tvoc` over `rtvoc`), then the first one.
 * @param {object} answer - `{ data: [...] }`.
 * @returns {Map<string, object>} key -> series.
 */
function seriesByKey(answer) {
  const map = new Map();
  for (const series of Array.isArray(answer?.data) ? answer.data : []) {
    const key = PARAMS[series?.param];
    if (!key || !Array.isArray(series.points)) {
      continue;
    }
    const current = map.get(key);
    if (!current || (PREFERRED[key] === series.param && current.param !== series.param)) {
      map.set(key, series);
    }
  }
  return map;
}

/**
 * @description The last reading of a device (GET /devices/{id}/top).
 * @param {object} answer - The answer.
 * @returns {{ at: number|null, values: object }|null} The values in the units
 * of Gladys, and the instant of the newest of them; null without any value.
 */
function parseLatest(answer) {
  const values = {};
  let at = null;
  for (const [key, series] of seriesByKey(answer)) {
    const point = series.points.at(-1);
    const raw = Number(point?.value);
    if (point?.value === null || point?.value === undefined || !Number.isFinite(raw)) {
      continue;
    }
    const value = convert(key, raw, series.units);
    if (value === null || !Number.isFinite(value)) {
      continue;
    }
    values[key] = round(key, value);
    const instant = instantOf(point);
    if (instant !== null && (at === null || instant > at)) {
      at = instant;
    }
  }
  return Object.keys(values).length ? { at, values } : null;
}

/**
 * @description Hourly averages (GET /devices/{id}/history?group_by=1h).
 * @param {object} answer - The answer.
 * @returns {object} key -> `[{ at, value }]`, oldest first, in the units of Gladys.
 */
function parseHistory(answer) {
  const result = {};
  for (const [key, series] of seriesByKey(answer)) {
    const points = series.points
      .map((point) => {
        const at = instantOf(point);
        const raw = Number(point?.value);
        const value =
          at === null || point?.value === null || !Number.isFinite(raw)
            ? null
            : convert(key, raw, series.units);
        return value === null || !Number.isFinite(value) ? null : { at, value: round(key, value) };
      })
      .filter(Boolean)
      .sort((a, b) => a.at - b.at);
    if (points.length) {
      result[key] = points;
    }
  }
  return result;
}

/**
 * @description The metadata of a device (GET /devices/{id}).
 * @param {object} answer - The answer.
 * @returns {{ name: string, model: string, firmware: string, modules: object[] }}
 * `modules`: `[{ bay, serial, type, lifetime }]`, lifetime in % (0-100) or null.
 */
function parseMetadata(answer) {
  const text = (value, max = 60) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const handshake =
    answer?.handshake && typeof answer.handshake === 'object' ? answer.handshake : {};
  let modules = Array.isArray(handshake.modules)
    ? handshake.modules.map((module, index) => ({
        bay: Number.isFinite(Number(module?.bay)) ? Number(module.bay) : index,
        serial: text(module?.serial, 40),
        type: text(module?.type, 20),
        lifetime: Number.isFinite(Number(module?.lifetime_pct))
          ? Math.round(Number(module.lifetime_pct) * 10) / 10
          : null,
      }))
    : [];
  if (modules.length === 0) {
    // Older Sensedges only report the deprecated per-bay fields (a fraction of 1).
    modules = [
      ['sbay102', 0],
      ['sbay103', 1],
    ]
      .map(([bay, index]) => {
        const lifetime = Number(handshake[`${bay}.slifetime`]);
        const type = text(handshake[`${bay}.stype`], 20);
        return Number.isFinite(lifetime) || type
          ? {
              bay: index,
              serial: '',
              type,
              lifetime: Number.isFinite(lifetime) ? Math.round(lifetime * 1000) / 10 : null,
            }
          : null;
      })
      .filter(Boolean);
  }
  return {
    name: text(answer?.name),
    model: text(answer?.model, 20),
    firmware: text(answer?.firmware_version, 30),
    modules,
  };
}

export {
  PARAMS,
  VALUE_KEYS,
  MOLAR_VOLUME,
  normalizeUnit,
  convert,
  round,
  parseLatest,
  parseHistory,
  parseMetadata,
};
