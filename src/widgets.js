// -----------------------------------------------------------------------------
// Dashboard widgets of the Kaiterra integration.
//
//   - `air_quality`  the air now: the AQI in the color of its level, then
//                    CO₂, PM2.5, TVOC and the temperature (or what the device
//                    measures), colored against their reference values; the
//                    advice of the level, the humidity, an offline device or a
//                    worn sensor module; the hour of the reading;
//   - `history`      one measure (CO₂ by default) over the last 24 hours,
//                    hourly averages, with the value now, the average and the
//                    highest one.
// Both credit Kaiterra and show the hour of the data. A device is chosen
// among the devices; the first one by default.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, all, levelText, pollutantText, decimal } from './i18n.js';
import { aqiOf, CLEAR_RATIO } from './aqi.js';
import { WORN_PERCENT } from './events.js';
import { formatTime } from './time.js';

const WIDGETS = { AIR_QUALITY: 'air_quality', HISTORY: 'history' };
const WIDGET_ACTIONS = { REFRESH: 'refresh' };
const TTL_SECONDS = { content: 60, history: 900, message: 300 };
const COLORS = {
  good: WIDGET_COLORS.SUCCESS,
  moderate: WIDGET_COLORS.WARNING,
  unhealthy_sensitive: WIDGET_COLORS.WARNING,
  unhealthy: WIDGET_COLORS.DANGER,
  very_unhealthy: WIDGET_COLORS.DANGER,
  hazardous: WIDGET_COLORS.DANGER,
};
const UG = 'µg/m³';
// The tiles after the AQI, in order of interest: the first four the device gives.
const TILES = [
  { key: 'co2', label: () => 'CO₂', unit: 'ppm', digits: 0, limit: true },
  { key: 'pm25', label: (lang) => pollutantText('pm25', lang), unit: UG, limit: true },
  {
    key: 'tvoc',
    label: (lang) => pollutantText('tvoc', lang),
    unit: 'ppb',
    digits: 0,
    limit: true,
  },
  { key: 'temperature', label: (lang) => t('tileTemperature', lang), unit: '°C' },
  { key: 'humidity', label: (lang) => t('tileHumidity', lang), unit: '%', digits: 0 },
  { key: 'pm10', label: (lang) => pollutantText('pm10', lang), unit: UG, limit: true },
];
const MAX_TILES = 4;
const MEASURES = {
  aqi: { unit: 'AQI', digits: 0 },
  co2: { unit: 'ppm', digits: 0 },
  pm25: { unit: UG, digits: 1 },
  pm10: { unit: UG, digits: 1 },
  tvoc: { unit: 'ppb', digits: 0 },
  temperature: { unit: '°C', digits: 1 },
  humidity: { unit: '%', digits: 0 },
};
const DEFAULT_MEASURE = 'co2';

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description The color of a level.
 * @param {string|null} level - The level key.
 * @returns {string} A widget color.
 */
const colorOf = (level) => COLORS[level] ?? WIDGET_COLORS.NEUTRAL;

/**
 * @description The color of a value against its reference.
 * @param {number} value - The value.
 * @param {number|undefined} limit - The reference value.
 * @returns {string|undefined} A widget color, none without a reference.
 */
function limitColor(value, limit) {
  if (!Number.isFinite(limit) || !Number.isFinite(value)) {
    return undefined;
  }
  if (value <= limit * CLEAR_RATIO) {
    return WIDGET_COLORS.SUCCESS;
  }
  return value <= limit * 2 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.DANGER;
}

/**
 * @description The Refresh button.
 * @returns {object} The button.
 */
const refreshButton = () => ({
  type: 'button',
  label: all('buttonRefresh'),
  icon: 'refresh-cw',
  action: { key: WIDGET_ACTIONS.REFRESH },
});

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {object} [options] - `{ ttl, refresh }`.
 * @returns {object} The content.
 */
function messageContent(message, { ttl = TTL_SECONDS.message, refresh = false } = {}) {
  const components = [{ type: 'text', variant: 'body', text: clip(message, 300) }];
  if (refresh) {
    components.push(refreshButton());
  }
  return { ttl_seconds: ttl, components };
}

/**
 * @description The caption of a widget: device, hour, source.
 * @param {string} name - The device name.
 * @param {number|null} at - The instant of the data.
 * @param {object} options - `{ language, timeZone }`.
 * @returns {object} The text component.
 */
function caption(name, at, { language, timeZone }) {
  // The source and the hour always show: a long device name gives way.
  const time = formatTime(at, { language, timeZone });
  const tail = `${time ? ` · ${t('measuredAt', language, { time })}` : ''} · Kaiterra`;
  return {
    type: 'text',
    variant: 'caption',
    text: `${clip(name, 80 - tail.length)}${tail}`,
  };
}

/**
 * @description The "air_quality" widget.
 * @param {object} options - Options.
 * @param {object} options.device - `{ name, online, modules }`.
 * @param {object|null} options.reading - `{ at, values, aqi, level }`.
 * @param {object} options.limits - pollutant -> reference value.
 * @param {string} options.language - The user language.
 * @param {string} [options.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildAirQualityWidget({ device, reading, limits = {}, language, timeZone }) {
  if (!reading) {
    return {
      ttl_seconds: TTL_SECONDS.message,
      components: [
        { type: 'text', variant: 'heading', text: clip(device.name, 40) },
        { type: 'text', variant: 'body', text: clip(t('noReading', language), 300) },
        refreshButton(),
      ],
    };
  }
  const components = [caption(device.name, reading.at, { language, timeZone })];
  if (Number.isFinite(reading.aqi)) {
    components.push({
      type: 'value',
      value: reading.aqi,
      label: clip(t('tileAqi', language, { level: levelText(reading.level, language, true) }), 24),
      icon: 'wind',
      color: colorOf(reading.level),
    });
  }
  const tiles = TILES.filter((tile) => Number.isFinite(reading.values[tile.key])).slice(
    0,
    MAX_TILES + (Number.isFinite(reading.aqi) ? 0 : 1),
  );
  for (const tile of tiles) {
    const value = reading.values[tile.key];
    const component = {
      type: 'value',
      value: decimal(value, language, tile.digits ?? 1),
      unit: tile.unit,
      label: clip(tile.label(language), 24),
    };
    const color = tile.limit ? limitColor(value, limits[tile.key]) : undefined;
    if (color) {
      component.color = color;
    }
    components.push(component);
  }
  const over = Object.entries(limits)
    .filter(([key, limit]) => Number.isFinite(reading.values[key]) && reading.values[key] > limit)
    .map(([key]) => pollutantText(key, language));
  const shown = new Set(tiles.map((tile) => tile.key));
  const worn = (device.modules ?? []).filter(
    (module) => Number.isFinite(module.lifetime) && module.lifetime < WORN_PERCENT,
  );
  const lines = [
    device.online === false
      ? t('offlineText', language, { time: formatTime(reading.at, { language, timeZone }) })
      : '',
    reading.level
      ? `${levelText(reading.level, language)}. ${t(`advice_${reading.level}`, language)}`
      : '',
    over.length ? t('overText', language, { list: over.join(', ') }) : '',
    !shown.has('humidity') && Number.isFinite(reading.values.humidity)
      ? t('humidityText', language, { value: Math.round(reading.values.humidity) })
      : '',
    ...worn.map((module) =>
      t('moduleText', language, {
        module: module.type || `#${module.bay + 1}`,
        lifetime: decimal(module.lifetime, language, 0),
      }),
    ),
  ].filter(Boolean);
  if (lines.length) {
    components.push({ type: 'text', variant: 'body', text: clip(lines.join('\n'), 300) });
  }
  components.push(refreshButton());
  return { ttl_seconds: TTL_SECONDS.content, components };
}

/**
 * @description The hourly points of a measure; the AQI comes from the particles.
 * @param {object} series - key -> `[{ at, value }]` (params.js parseHistory).
 * @param {string} measure - The measure key.
 * @returns {Array<{ at: number, value: number }>} The points, oldest first.
 */
function measurePoints(series = {}, measure) {
  if (measure !== 'aqi') {
    return series[measure] ?? [];
  }
  const byHour = new Map();
  for (const key of ['pm25', 'pm10']) {
    for (const point of series[key] ?? []) {
      byHour.set(point.at, { ...byHour.get(point.at), [key]: point.value });
    }
  }
  return [...byHour.entries()]
    .map(([at, values]) => ({ at, value: aqiOf(values) }))
    .filter((point) => Number.isFinite(point.value))
    .sort((a, b) => a.at - b.at);
}

/**
 * @description The value of a measure in the last reading.
 * @param {object|null} reading - The reading.
 * @param {string} measure - The measure key.
 * @returns {number|null} The value.
 */
const nowValue = (reading, measure) =>
  (measure === 'aqi' ? reading?.aqi : reading?.values?.[measure]) ?? null;

/**
 * @description The "history" widget.
 * @param {object} options - Options.
 * @param {object} options.device - `{ name }`.
 * @param {object|null} options.reading - The last reading.
 * @param {object|null} options.history - `{ at, series }`.
 * @param {string} [options.measure] - The measure key.
 * @param {object} options.limits - pollutant -> reference value.
 * @param {string} options.language - The user language.
 * @param {string} [options.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildHistoryWidget({
  device,
  reading,
  history,
  measure,
  limits = {},
  language,
  timeZone,
}) {
  const key = MEASURES[measure] ? measure : DEFAULT_MEASURE;
  const { unit, digits } = MEASURES[key];
  const points = measurePoints(history?.series, key);
  const label = t(`measure_${key}`, language);
  if (points.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS.message,
      components: [
        { type: 'text', variant: 'heading', text: clip(`${device.name} · ${label}`, 40) },
        { type: 'text', variant: 'body', text: clip(t('noHistory', language), 300) },
      ],
    };
  }
  const values = points.map((point) => point.value);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const highest = points.reduce((best, point) => (point.value > best.value ? point : best));
  const current = nowValue(reading, key);
  const format = (value) => `${decimal(value, language, digits)} ${unit}`;
  const rows = [];
  if (Number.isFinite(current)) {
    rows.push({
      label: t('rowNow', language),
      value: clip(format(current), 40),
      ...(key === 'aqi'
        ? { color: colorOf(reading.level) }
        : limitColor(current, limits[key])
          ? { color: limitColor(current, limits[key]) }
          : {}),
    });
  }
  rows.push({ label: t('rowAverage', language), value: clip(format(average), 40) });
  rows.push({
    label: t('rowMax', language),
    value: clip(`${format(highest.value)} · ${formatTime(highest.at, { language, timeZone })}`, 40),
  });
  return {
    ttl_seconds: TTL_SECONDS.history,
    components: [
      caption(`${device.name} · ${label}`, reading?.at ?? history?.at ?? null, {
        language,
        timeZone,
      }),
      {
        type: 'chart',
        chart_type: 'line',
        unit,
        series: [
          {
            name: clip(t('seriesHourly', language, { measure: label }), 24),
            points: points.map((point) => ({
              t: new Date(point.at).toISOString(),
              v: Math.round(point.value * 10 ** digits) / 10 ** digits,
            })),
          },
        ],
      },
      { type: 'status', items: rows },
    ],
  };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  TTL_SECONDS,
  COLORS,
  TILES,
  MEASURES,
  DEFAULT_MEASURE,
  clip,
  colorOf,
  limitColor,
  messageContent,
  measurePoints,
  buildAirQualityWidget,
  buildHistoryWidget,
};
