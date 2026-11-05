// Widget contents: valid for the core (validateWidgetContent), within the
// budget of a card (8 components, 6 tiles, 2 texts, 1 status), in 4 languages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildAirQualityWidget,
  buildHistoryWidget,
  messageContent,
  measurePoints,
  limitColor,
  MEASURES,
} from '../src/widgets.js';
import { parseLatest, parseHistory } from '../src/params.js';
import { aqiOf, levelOf, limitsOf } from '../src/aqi.js';
import { LANGUAGES } from '../src/i18n.js';
import { fixture, rebase, hourlyHistory, NOW, TZ } from './helpers/fake-api.js';

const readingOf = (name) => {
  const parsed = parseLatest(rebase(fixture(name)));
  const aqi = aqiOf(parsed.values);
  return { ...parsed, aqi, level: levelOf(aqi) };
};
const office = readingOf('top_sensedge.json');
const full = readingOf('top_sensedge_full.json');
const history = { at: NOW, series: parseHistory(hourlyHistory(NOW)) };
const limits = limitsOf();

/**
 * @description Check a content against the core rules and the card budget.
 * @param {object} content - The content.
 * @param {string} label - What it is.
 */
function check(content, label) {
  // validateWidgetContent returns the list of what the core would drop.
  const problems = validateWidgetContent(content);
  assert.deepEqual(problems, [], `${label}: ${JSON.stringify(problems)}`);
  const count = (type) => content.components.filter((c) => c.type === type).length;
  assert.ok(content.components.length <= 8, `${label}: ${content.components.length} components`);
  assert.ok(count('value') + count('gauge') <= 6, label);
  assert.ok(count('text') <= 2, label);
  assert.ok(count('status') <= 1, label);
  assert.ok(count('chart') + count('card-list') + count('image') <= 1, label);
}

test('air quality: every language, polluted, clean, offline, worn module, without particles', () => {
  const worn = [{ bay: 0, type: 'KM-102', lifetime: 8.1 }];
  for (const language of LANGUAGES) {
    for (const [label, device, reading] of [
      ['office', { name: 'Office' }, office],
      ['full', { name: 'Living room', online: false, modules: worn }, full],
      [
        'no particles',
        { name: 'Kitchen' },
        { ...full, aqi: null, level: null, values: { co2: 900, temperature: 21, humidity: 40 } },
      ],
      ['none', { name: 'Office' }, null],
    ]) {
      check(
        buildAirQualityWidget({ device, reading, limits, language, timeZone: TZ }),
        `${label}.${language}`,
      );
    }
  }
});

test('air quality: the AQI first, then CO₂, PM2.5, TVOC, temperature, colored against references', () => {
  const content = buildAirQualityWidget({
    device: { name: 'Office' },
    reading: office,
    limits,
    language: 'en',
    timeZone: TZ,
  });
  const [caption, aqi, ...rest] = content.components;
  assert.equal(caption.text, 'Office · at 6:19 PM · Kaiterra');
  assert.deepEqual(aqi, {
    type: 'value',
    value: 244,
    label: 'AQI · Very unhealthy',
    icon: 'wind',
    color: 'danger',
  });
  assert.deepEqual(
    rest.filter((c) => c.type === 'value').map((c) => [c.label, c.value, c.color]),
    [
      ['CO₂', '1,673', 'warning'],
      ['PM2.5', '169', 'danger'],
      ['TVOC', '397', 'success'],
      ['Temperature', '26.3', undefined],
    ],
  );
  const body = rest.find((c) => c.type === 'text').text;
  assert.match(body, /^Very unhealthy\. /);
  assert.match(body, /Above its reference: PM2\.5, PM10, CO₂\./);
  assert.match(body, /Humidity 56 %/);
  assert.equal(content.components.at(-1).action.key, 'refresh');
});

test('air quality: an offline device and a worn module say so', () => {
  const content = buildAirQualityWidget({
    device: {
      name: 'Living room',
      online: false,
      modules: [{ bay: 0, type: 'KM-102', lifetime: 8.1 }],
    },
    reading: full,
    limits,
    language: 'fr',
    timeZone: TZ,
  });
  const body = content.components.find((c) => c.variant === 'body').text;
  assert.match(body, /^Aucune nouvelle mesure depuis 18:19/);
  assert.match(body, /Module de capteur KM-102 : 8 % de durée de vie restante\./);
});

test('history: every measure in every language; the AQI from the hourly particles', () => {
  for (const language of LANGUAGES) {
    for (const measure of [...Object.keys(MEASURES), undefined, 'nonsense']) {
      check(
        buildHistoryWidget({
          device: { name: 'Office' },
          reading: full,
          history,
          measure,
          limits,
          language,
          timeZone: TZ,
        }),
        `${measure}.${language}`,
      );
    }
    check(
      buildHistoryWidget({ device: { name: 'Office' }, reading: null, history: null, language }),
      `empty.${language}`,
    );
  }
  const aqi = measurePoints(history.series, 'aqi');
  assert.equal(aqi.length, 24, 'PM10 fills the hour without PM2.5');
  assert.equal(aqi[0].value, aqiOf({ pm25: 4, pm10: 10 }));
});

test('history: CO₂ by default, now, average and the highest hour', () => {
  const content = buildHistoryWidget({
    device: { name: 'Office' },
    reading: full,
    history,
    limits,
    language: 'en',
    timeZone: TZ,
  });
  const chart = content.components.find((c) => c.type === 'chart');
  assert.equal(chart.unit, 'ppm');
  assert.equal(chart.series[0].name, 'CO₂, hourly');
  assert.equal(chart.series[0].points.length, 24);
  const status = content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['Now', '612 ppm'],
      ['Average in 24 h', '795 ppm'],
      ['Highest in 24 h', '1,140 ppm · 6:20 PM'],
    ],
  );
  assert.equal(status.items[0].color, 'success');
});

test('messages and colors', () => {
  check(messageContent('x'.repeat(400), { refresh: true }), 'message');
  assert.equal(limitColor(850, 1000), 'success');
  assert.equal(limitColor(1500, 1000), 'warning');
  assert.equal(limitColor(2500, 1000), 'danger');
  assert.equal(limitColor(10, undefined), undefined);
});
