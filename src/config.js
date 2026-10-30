// -----------------------------------------------------------------------------
// Configuration of the Kaiterra integration.
//
// Fields of the config_schema:
//   - `api_key`     the Kaiterra API key of the user (a `secret`: never sent
//                   back to the UI, never logged);
//   - `devices`     the Unique Device IDs (UDIDs) of the devices, separated by
//                   commas, spaces or new lines, with or without dashes (the
//                   Kaiterra app and the Sensedge settings show them); up to 20;
//   - `co2_limit`   the CO₂ reference value of the scene trigger, ppm;
//   - `tvoc_limit`  the TVOC reference value, ppb;
//   - `language`    language of the texts Gladys does not ask for in a
//                   language (device names, scene texts): `auto` follows the
//                   language of the last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language`    language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';
import { DEFAULT_LIMITS } from './aqi.js';

const MAX_DEVICES = 20;
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };
const LIMIT_RANGES = { co2: [400, 5000], tvoc: [50, 10000] };

const readString = (raw) =>
  typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';

/**
 * @description Read the device ids typed by hand.
 * @param {unknown} raw - "46048117-86a7-488e-9c58-708f3470ee11, 4604811786a7…".
 * @returns {{ udids: string[], invalid: string[] }} The ids, lowercase with
 * dashes, without duplicates (the first 20); the pieces that are not ids
 * (cut to 12 characters: enough to recognize a typo, not a whole id).
 * @example
 * readUdids('4604811786A7488E9C58708F3470EE11');
 * // -> { udids: ['46048117-86a7-488e-9c58-708f3470ee11'], invalid: [] }
 */
function readUdids(raw) {
  const udids = [];
  const invalid = [];
  for (const piece of readString(raw).split(/[\s,;]+/)) {
    if (!piece) {
      continue;
    }
    const hex = piece.toLowerCase().replace(/-/g, '');
    if (!/^[0-9a-f]{32}$/.test(hex)) {
      invalid.push(piece.slice(0, 12));
      continue;
    }
    const udid = [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
    if (!udids.includes(udid)) {
      udids.push(udid);
    }
  }
  return {
    udids: udids.slice(0, MAX_DEVICES),
    invalid,
    extra: Math.max(0, udids.length - MAX_DEVICES),
  };
}

/**
 * @description Read a reference value, within its range.
 * @param {unknown} raw - The value.
 * @param {string} key - `co2` or `tvoc`.
 * @returns {number} The value, the default one when absent or out of range.
 */
function readLimit(raw, key) {
  const value = typeof raw === 'number' ? raw : Number.parseFloat(readString(raw));
  const [min, max] = LIMIT_RANGES[key];
  return Number.isFinite(value) && value >= min && value <= max
    ? Math.round(value)
    : DEFAULT_LIMITS[key];
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ apiKey, udids, invalid, extra, limits: { co2, tvoc }, language }`.
 * @example
 * normalizeConfig({ api_key: 'k', devices: '00000000-0031-0101-0000-00007e57c0de' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const { udids, invalid, extra } = readUdids(config.devices);
  return {
    apiKey: readString(config.api_key),
    udids,
    invalid,
    extra,
    limits: { co2: readLimit(config.co2_limit, 'co2'), tvoc: readLimit(config.tvoc_limit, 'tvoc') },
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  MAX_DEVICES,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  LIMIT_RANGES,
  readUdids,
  readLimit,
  normalizeConfig,
  readLanguage,
};
