// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a fake
// Kaiterra API answering after the examples of its documentation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS, PAUSE_MS } from '../src/app.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import { deviceKey } from '../src/device.js';
import {
  fakeKaiterra,
  storePath,
  silent,
  rebase,
  fixture,
  clone,
  NOW,
  TZ,
  KEY,
  OFFICE,
  EGG,
  FULL,
  FORBIDDEN,
} from './helpers/fake-api.js';

const CONFIG = { api_key: KEY, devices: `${OFFICE}, ${EGG}`, language: 'en' };
const PREFIX = 'ext:test-integration:sensor';
const OFFICE_ID = `${PREFIX}:${deviceKey(OFFICE)}`;
const EGG_ID = `${PREFIX}:${deviceKey(EGG)}`;
const FULL_ID = `${PREFIX}:${deviceKey(FULL)}`;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * @description The integration, connected to a fake Gladys and a fake API.
 * @param {object} [options] - `{ config, api, path, now, logger }`.
 * @returns {Promise<object>} `{ gladys, app, api, clock, path }`.
 */
async function startApp({
  config = CONFIG,
  api = fakeKaiterra(),
  path = storePath(),
  now = NOW,
  logger = silent,
} = {}) {
  const clock = { now };
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    fetch: api,
    storePath: path,
    now: () => clock.now,
    timeZone: TZ,
    timers: false,
    logger,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, api, clock, path };
}

/**
 * @description Let the device send a new reading, one minute old.
 * @param {Function} api - The fake API.
 * @param {string} udid - The device.
 * @param {number} now - Now (ms).
 * @param {object} [values] - param -> value to change.
 */
function upload(api, udid, now, values = {}) {
  const top = clone(api.devices[udid].top);
  for (const series of top.data) {
    if (values[series.param] !== undefined) {
      series.points[0].value = values[series.param];
    }
  }
  api.devices[udid].top = rebase(top, now - MINUTE);
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const sizes = (api) => api.calls.map((call) => call.urls.length);

test('startup: metadata, readings and history in three batches; one device each, named', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.deepEqual(
    api.calls.map((call) =>
      call.urls.map((url) => url.replace(/^\/devices\/[0-9a-f-]+/, '').replace(/\?.*/, '')),
    ),
    [
      ['', ''],
      ['/top', '/top'],
      ['/history', '/history'],
    ],
  );
  assert.equal(api.calls[2].history.time_zone, TZ);
  assert.equal(api.calls[2].history.group_by, '1h');
  assert.equal(api.calls[2].history.end, '2026-10-30T17:20:00Z');
  assert.equal(api.calls[2].history.begin, '2026-10-29T17:20:00Z');
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => [device.external_id, device.name, device.model]),
    [
      [OFFICE_ID, 'Kaiterra Office', 'Kaiterra SE-100'],
      [EGG_ID, 'Kaiterra Bedroom', 'Kaiterra LE-101'],
    ],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.en,
    'Connected to Kaiterra: Office AQI 244 (Very unhealthy), Bedroom AQI 266 (Very unhealthy).',
  );
  assert.deepEqual(gladys.fake.sceneEvents, [], 'the first readings are a baseline');
});

test('created devices get every value; the next rounds only read the last readings', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await created(gladys, OFFICE_ID);
  const state = (key) => gladys.fake.lastState(`${OFFICE_ID}:${key}`);
  assert.equal(state('aqi'), 244);
  assert.equal(state('aqi_level'), 'Very unhealthy');
  assert.equal(state('co2'), 1673);
  assert.equal(state('tvoc'), 397);
  assert.equal(state('temperature'), 26.25);
  api.calls.length = 0;
  clock.now += MINUTE;
  upload(api, OFFICE, clock.now, { rco2: 1500 });
  await app.readDevices();
  assert.deepEqual(sizes(api), [2], 'one batch: metadata and history are not due');
  assert.equal(state('co2'), 1500);
  clock.now += 30 * MINUTE;
  upload(api, OFFICE, clock.now);
  upload(api, EGG, clock.now);
  api.calls.length = 0;
  await app.readDevices();
  assert.deepEqual(sizes(api), [2, 2], 'the history every 30 minutes');
  clock.now += 6 * HOUR;
  api.calls.length = 0;
  await app.readDevices();
  assert.deepEqual(sizes(api), [2, 2, 2], 'the metadata every 6 hours');
});

test('a level change fires air_quality_changed once it held 5 minutes; a restart fires nothing', async (t) => {
  const { gladys, app, api, clock, path } = await startApp();
  t.after(() => gladys.fake.shutdown());
  for (let minute = 1; minute <= 6; minute += 1) {
    clock.now = NOW + minute * MINUTE;
    upload(api, OFFICE, clock.now, { rpm25c: 20, rpm10c: 30 });
    upload(api, EGG, clock.now);
    await app.readDevices();
    if (minute < 6) {
      assert.equal(eventsOf(gladys, TRIGGERS.AIR_QUALITY_CHANGED).length, 0, `minute ${minute}`);
    }
  }
  const [event] = eventsOf(gladys, TRIGGERS.AIR_QUALITY_CHANGED);
  assert.deepEqual(event.data, {
    device: OFFICE_ID,
    name: 'Office',
    aqi: 71,
    level: 'moderate',
    level_name: 'Moderate',
    previous_level: 'very_unhealthy',
    direction: 'better',
    pm25: 20,
    pm10: 30,
  });
  gladys.fake.shutdown();
  const again = await startApp({ api, path, now: clock.now + MINUTE });
  t.after(() => again.gladys.fake.shutdown());
  assert.deepEqual(eventsOf(again.gladys, TRIGGERS.AIR_QUALITY_CHANGED), []);
});

test('CO₂ over its reference, then back below 90 % of it', async (t) => {
  const { gladys, app, api, clock } = await startApp({
    config: { ...CONFIG, devices: FULL, co2_limit: 800 },
  });
  t.after(() => gladys.fake.shutdown());
  const step = async (co2, minutes) => {
    for (let i = 0; i < minutes; i += 1) {
      clock.now += MINUTE;
      upload(api, FULL, clock.now, { rco2: co2 });
      await app.readDevices();
    }
  };
  await step(950, 6);
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.THRESHOLD_EXCEEDED).map((e) => e.data),
    [
      {
        device: FULL_ID,
        name: 'Living room',
        pollutant: 'co2',
        pollutant_name: 'CO₂',
        value: 950,
        unit: 'ppm',
        limit: 800,
        percent: 119,
      },
    ],
  );
  await step(750, 6);
  assert.equal(eventsOf(gladys, TRIGGERS.THRESHOLD_CLEARED).length, 0, '750 > 720: not yet');
  await step(700, 6);
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.THRESHOLD_CLEARED).map((e) => [e.data.pollutant, e.data.value]),
    [['co2', 700]],
  );
});

test('a device that stops uploading goes offline after 15 minutes, then comes back', async (t) => {
  const { gladys, app, api, clock } = await startApp({ config: { ...CONFIG, language: 'fr' } });
  t.after(() => gladys.fake.shutdown());
  clock.now += 10 * MINUTE;
  upload(api, EGG, clock.now);
  await app.readDevices();
  assert.equal(eventsOf(gladys, TRIGGERS.CONNECTION_CHANGED).length, 0);
  clock.now += 10 * MINUTE;
  upload(api, EGG, clock.now);
  await app.readDevices();
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.CONNECTION_CHANGED).map((e) => e.data),
    [{ device: OFFICE_ID, name: 'Office', state: 'offline', last_seen: '18:19', minutes: 21 }],
  );
  assert.match(gladys.fake.connectionStatus.message.fr, /Office hors ligne, Bedroom AQI 266/);
  const widget = await gladys.fake.widgetGet(WIDGETS.AIR_QUALITY, {
    settings: { device: OFFICE_ID },
    language: 'fr',
  });
  assert.match(
    widget.data.content.components.find((c) => c.variant === 'body').text,
    /^Aucune nouvelle mesure depuis 18:19/,
  );
  clock.now += MINUTE;
  upload(api, OFFICE, clock.now);
  await app.readDevices();
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.CONNECTION_CHANGED).map((e) => e.data.state),
    ['offline', 'online'],
  );
});

test('a worn sensor module fires once, when the metadata say so', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  api.devices[OFFICE].meta.handshake.modules[1].lifetime_pct = 7.5;
  clock.now += 7 * HOUR;
  upload(api, OFFICE, clock.now);
  upload(api, EGG, clock.now);
  await app.readDevices();
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.SENSOR_MODULE_WORN).map((e) => e.data),
    [{ device: OFFICE_ID, name: 'Office', module: 'KM-100', bay: 1, lifetime: 7.5 }],
  );
  clock.now += 7 * HOUR;
  upload(api, OFFICE, clock.now);
  await app.readDevices();
  assert.equal(eventsOf(gladys, TRIGGERS.SENSOR_MODULE_WORN).length, 1);
});

test('a refused key: no reading until the configuration changes; Read now tries again', async (t) => {
  const { gladys, app, api, clock } = await startApp({ config: { ...CONFIG, api_key: 'wrong' } });
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /^Kaiterra refused the API key/);
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  api.calls.length = 0;
  clock.now += MINUTE;
  await app.readDevices();
  assert.equal(api.calls.length, 0);
  const read = await gladys.fake.action(ACTIONS.READ_NOW);
  assert.match(read.data.message.en, /^Kaiterra refused the API key/);
  assert.equal(api.calls.length, 1);
  await gladys.fake.configUpdated({ ...CONFIG });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.discoveredDevices.length, 2);
});

test('a 429 pauses 5 minutes, then 10; a network failure is reported and recovers', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  api.status = 429;
  clock.now += MINUTE;
  await app.readDevices();
  assert.match(gladys.fake.connectionStatus.message.en, /asks to slow down/);
  api.calls.length = 0;
  clock.now += PAUSE_MS - 1;
  await app.readDevices();
  assert.equal(api.calls.length, 0);
  clock.now += 1;
  await app.readDevices();
  assert.equal(api.calls.length, 1);
  clock.now += PAUSE_MS;
  await app.readDevices();
  assert.equal(api.calls.length, 1, 'the second pause lasts 10 minutes');
  api.status = null;
  api.offline = true;
  clock.now += 2 * PAUSE_MS;
  await app.readDevices();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /cannot be reached \(ENOTFOUND\)/);
  api.offline = false;
  clock.now += MINUTE;
  upload(api, OFFICE, clock.now);
  upload(api, EGG, clock.now);
  await app.readDevices();
  assert.match(gladys.fake.connectionStatus.message.en, /^Connected to Kaiterra/);
});

test('devices that cannot be read and pieces that are not ids are reported, never named by id', async (t) => {
  const { gladys } = await startApp({
    config: {
      ...CONFIG,
      devices: `${OFFICE} ${FORBIDDEN} 12345678-1234-4234-8234-123456789abc oops`,
    },
  });
  t.after(() => gladys.fake.shutdown());
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.external_id),
    [OFFICE_ID],
  );
  const { message } = gladys.fake.connectionStatus;
  assert.equal(
    message.en,
    '1 of 4 devices read. Device 2: it belongs to an organization this key is not part of.',
  );
  const read = await gladys.fake.action(ACTIONS.READ_NOW);
  assert.equal(
    read.data.message.en,
    'Read: Office AQI 244 (Very unhealthy) · Device 2: it belongs to an organization this key is not part of. · Device 3: Kaiterra does not know this id (check it in the Kaiterra app). Not a device id: oops. An id has 32 hexadecimal digits, with or without dashes.',
  );
  assert.doesNotMatch(JSON.stringify([message, read.data.message]), /9999|123456789abc/);
});

test('no key, no device: the status says what to do', async (t) => {
  const a = await startApp({ config: { devices: OFFICE } });
  t.after(() => a.gladys.fake.shutdown());
  assert.equal(
    a.gladys.fake.connectionStatus.message.en,
    'Enter your Kaiterra API key in the configuration.',
  );
  assert.equal(a.api.calls.length, 0);
  const b = await startApp({ config: { api_key: KEY } });
  t.after(() => b.gladys.fake.shutdown());
  assert.match(b.gladys.fake.connectionStatus.message.en, /^Key accepted\. Add the ids/);
  const widget = await b.gladys.fake.widgetGet(WIDGETS.AIR_QUALITY, {});
  assert.match(widget.data.content.components[0].text, /^No Kaiterra device/);
});

test('widgets: valid contents for the first device by default, or the chosen one and measure', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  for (const [key, settings] of [
    [WIDGETS.AIR_QUALITY, {}],
    [WIDGETS.AIR_QUALITY, { device: EGG_ID }],
    [WIDGETS.HISTORY, {}],
    [WIDGETS.HISTORY, { device: EGG_ID, measure: 'aqi' }],
  ]) {
    for (const language of ['en', 'fr', 'de', 'es']) {
      const answer = await gladys.fake.widgetGet(key, { settings, language });
      const { content } = answer.data;
      assert.deepEqual(validateWidgetContent(content), [], key);
    }
  }
  const egg = await gladys.fake.widgetGet(WIDGETS.AIR_QUALITY, { settings: { device: EGG_ID } });
  assert.match(egg.data.content.components[0].text, /^Bedroom · at 6:19 PM · Kaiterra$/);
  const history = await gladys.fake.widgetGet(WIDGETS.HISTORY, {});
  const chart = history.data.content.components.find((c) => c.type === 'chart');
  assert.equal(chart.unit, 'ppm');
  assert.equal(chart.series[0].points.length, 24);
});

test('the Refresh button reads again past 30 seconds only', async (t) => {
  const { gladys, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  api.calls.length = 0;
  const cached = await gladys.fake.widgetAction(
    WIDGETS.AIR_QUALITY,
    WIDGET_ACTIONS.REFRESH,
    {},
    { settings: {} },
  );
  assert.match(cached.data.message.en, /^Already up to date/);
  assert.equal(api.calls.length, 0);
  clock.now += MINUTE;
  upload(api, OFFICE, clock.now, { rpm25c: 30 });
  const read = await gladys.fake.widgetAction(
    WIDGETS.AIR_QUALITY,
    WIDGET_ACTIONS.REFRESH,
    {},
    { settings: { device: OFFICE_ID } },
  );
  assert.equal(read.data.message.en, 'Read again: AQI 90.');
  assert.equal(api.calls.length, 1);
});

test('the scene action reads the air of a device and gives a sentence, without firing an event', async (t) => {
  const { gladys, app, api, clock } = await startApp({
    config: { ...CONFIG, devices: FULL, language: 'fr' },
  });
  t.after(() => gladys.fake.shutdown());
  const answer = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_AIR_QUALITY, { device: FULL_ID });
  assert.deepEqual(answer.data.outputs, {
    name: 'Living room',
    aqi: 29,
    level: 'good',
    level_name: 'Bonne',
    pm1: 3,
    pm25: 5.2,
    pm10: 8,
    co2: 612,
    tvoc: 180,
    temperature: 22,
    humidity: 44.3,
    pressure: 1013.25,
    no2: 18.82,
    o3: 39.26,
    co: 0.4,
    measured_at: '2026-10-30T17:19:00.000Z',
    connection: 'online',
    summary: 'Air de Living room : bonne (AQI 29). CO₂ 612 ppm. COVT 180 ppb. 22 °C.',
  });
  assert.equal(api.calls.length, 3, 'a reading of less than 2 minutes is reused');
  clock.now += 30 * MINUTE;
  const stale = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_AIR_QUALITY, {});
  assert.equal(stale.data.outputs.connection, 'offline');
  assert.match(
    stale.data.outputs.summary,
    /Dernière mesure à 18:19 : l’appareil semble hors ligne\.$/,
  );
  assert.deepEqual(gladys.fake.sceneEvents, []);
  // The transition is not lost: the next round of the timer fires it.
  await app.readDevices();
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.CONNECTION_CHANGED).map((e) => e.data.state),
    ['offline'],
  );
});

test('the diagnostic writes neither the key nor the device ids', async (t) => {
  const lines = [];
  const logger = { ...silent, info: (line) => lines.push(String(line)) };
  const { gladys } = await startApp({ logger });
  t.after(() => gladys.fake.shutdown());
  const answer = await gladys.fake.action(ACTIONS.DIAGNOSTIC);
  assert.match(answer.data.message.en, /^Diagnostic written to the logs/);
  const report = lines.filter((line) => line.startsWith('Kaiterra diagnostic')).join('');
  assert.match(report, /"apiKey":"set"/);
  assert.match(report, /"modules":\["KM-103:30%","KM-100:29.9%"\]/);
  assert.doesNotMatch(report, new RegExp(`${KEY}|7e57c0de`));
});

test('the language of the dashboard names the devices when the configuration says auto', async (t) => {
  const { gladys } = await startApp({ config: { ...CONFIG, language: 'auto' } });
  t.after(() => gladys.fake.shutdown());
  await gladys.fake.widgetGet(WIDGETS.AIR_QUALITY, { language: 'de' });
  assert.equal(gladys.fake.config.last_language, 'de');
  await gladys.fake.scanRequest();
  const office = gladys.fake.discoveredDevices.find((d) => d.external_id === OFFICE_ID);
  assert.equal(office.features[0].name, 'Luftqualitätsindex (AQI)');
});

test('the stored readings survive a restart', async (t) => {
  const { gladys, path, api } = await startApp();
  gladys.fake.shutdown();
  const store = JSON.parse(await (await import('node:fs/promises')).readFile(path, 'utf8'));
  assert.deepEqual(Object.keys(store.devices).sort(), [deviceKey(OFFICE), deviceKey(EGG)].sort());
  assert.doesNotMatch(JSON.stringify(store), /7e57c0de/);
  api.calls.length = 0;
  const again = await startApp({ api, path });
  t.after(() => again.gladys.fake.shutdown());
  assert.deepEqual(sizes(api), [2], 'metadata and history still fresh');
  assert.equal(fixture('metadata_sensedge.json').name, 'Office');
});
