// -----------------------------------------------------------------------------
// The Kaiterra integration: every handler, registered on a Gladys client.
//
// Brings the indoor air quality measured by Kaiterra devices (Sensedge,
// Sensedge Mini, Laser Egg…) into Gladys, through the official Kaiterra API
// (a key per user, created at app.kaiterra.com):
//   - devices (device.js): one per configured device id, with the AQI of the
//     particles, its level, PM2.5, PM10, CO₂, TVOC, temperature, humidity and
//     whatever else the device measures;
//   - scene triggers (events.js): air quality changed, reference value
//     exceeded and back to normal, device offline or back, sensor module worn;
//   - scene action: read the air of a device;
//   - dashboard widgets (widgets.js): air quality now, 24-hour history.
//
// One POST /batch a minute reads the last reading of every device (a device
// uploads one a minute); the metadata (name, model, sensor modules) every 6
// hours and the hourly averages of the last 24 hours every 30 minutes ride in
// batches of their own. The integration reads on its own timer, never on a
// Gladys poll. Transport: cloud only.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK and a fake Kaiterra API (test/helpers/fake-api.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readLanguage, INTERNAL_KEYS, AUTO_LANGUAGE } from './config.js';
import { createKaiterraClient, KaiterraError } from './kaiterra-api.js';
import { parseLatest, parseHistory, parseMetadata } from './params.js';
import { aqiOf, levelOf, limitsOf } from './aqi.js';
import { createStore, DEFAULT_PATH } from './store.js';
import {
  deviceKey,
  idsOf,
  keyOfExternalId,
  givenKeysOf,
  buildDevice,
  buildStates,
} from './device.js';
import {
  TRIGGERS,
  AIR_QUALITY_OUTPUTS,
  OFFLINE_MS,
  detectLevelChange,
  detectThresholds,
  detectConnection,
  detectWornModules,
  changedData,
  thresholdData,
  connectionData,
  moduleData,
  pick,
} from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  MEASURES,
  messageContent,
  buildAirQualityWidget,
  buildHistoryWidget,
} from './widgets.js';
import { defaultTimeZone, formatTime, isoSeconds, MINUTE_MS, HOUR_MS, DAY_MS } from './time.js';
import { t, all, levelText, decimal, LANGUAGES } from './i18n.js';

const ACTIONS = { READ_NOW: 'read_now', DIAGNOSTIC: 'diagnostic' };
const SCENE_ACTIONS = { GET_AIR_QUALITY: 'get_air_quality' };
const TICK_MS = MINUTE_MS;
const METADATA_EVERY_MS = 6 * HOUR_MS;
const HISTORY_EVERY_MS = 30 * MINUTE_MS;
// After a 429, wait this long, doubled at each new one, up to the maximum.
const PAUSE_MS = 5 * MINUTE_MS;
const PAUSE_MAX_MS = 30 * MINUTE_MS;
// The Refresh button and the scene action reuse a reading younger than these.
const REFRESH_MIN_AGE_MS = 30 * 1000;
const FRESH_MS = 2 * MINUTE_MS;
const DIAGNOSTIC_CHUNK = 3000;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - HTTP transport of the Kaiterra API (tests).
 * @param {string} [options.baseUrl] - The API root (tests).
 * @param {string} [options.storePath] - The file kept in /data.
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {string} [options.timeZone] - IANA timezone of the texts (TZ by default).
 * @param {boolean} [options.timers] - Arm the reading timer (false in tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    fetch: fetchFn,
    baseUrl,
    storePath = DEFAULT_PATH,
    now = () => Date.now(),
    timeZone = defaultTimeZone(),
    timers = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  let language = 'en';
  let createdDevices = new Set();
  // The configured devices: `{ udid, key, position, deviceId, name }`.
  let devices = [];
  let authError = null;
  // An error of the whole batch (network, server): `{ kind, message }`.
  let roundError = null;
  let pause = { until: 0, ms: 0 };
  let requests = 0;
  let lastStatus = null;
  let lastDiscovery = null;
  let timer = null;
  let reading = null;
  let stopped = false;

  const store = createStore({ path: storePath, logger });

  const api = createKaiterraClient({
    getApiKey: () => config.apiKey,
    onRequest: () => {
      requests += 1;
    },
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description What is kept of a device.
   * @param {object} device - The device.
   * @returns {object} `{ reading, readAt, error, meta, metaAt, history, historyAt, features }`.
   */
  function stateOf(device) {
    store.data.devices[device.key] ??= {};
    return store.data.devices[device.key];
  }

  /**
   * @description Whether Kaiterra asked to slow down (a 429).
   * @returns {boolean} True while paused.
   */
  const paused = () => now() < pause.until;

  /**
   * @description Whether a device sent a reading lately.
   * @param {object} device - The device.
   * @returns {boolean|null} Online or not, null before any reading.
   */
  function onlineOf(device) {
    const at = stateOf(device).reading?.at;
    return Number.isFinite(at) ? now() - at <= OFFLINE_MS : null;
  }

  /**
   * @description The message of an error, for a user.
   * @param {object} err - `{ kind, message }`.
   * @param {string} lang - The language.
   * @param {object} [device] - The device concerned.
   * @returns {string} The message.
   */
  function errorText(err, lang, device) {
    const key = {
      auth: 'errAuth',
      forbidden: 'errForbidden',
      not_found: 'errNotFound',
      no_data: 'errNoData',
      rate_limit: 'errRateLimit',
      unreachable: 'errUnreachable',
      no_key: 'errNoKey',
    }[err?.kind];
    return t(key ?? 'errFailed', lang, {
      position: device?.position ?? '',
      detail: String(err?.message ?? '').slice(0, 120),
    });
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const clipped = Object.fromEntries(
      Object.entries(message).map(([lang, text]) => [lang, text.trim().slice(0, 200)]),
    );
    const signature = JSON.stringify([connected, clipped]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, clipped);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description The line of a device in a status: "Office AQI 12 (Good)".
   * @param {object} device - The device.
   * @param {string} lang - The language.
   * @returns {string} The line.
   */
  function deviceLine(device, lang) {
    if (onlineOf(device) === false) {
      return t('deviceOffline', lang, { name: device.name });
    }
    const last = stateOf(device).reading;
    return Number.isFinite(last?.aqi)
      ? t('deviceLine', lang, {
          name: device.name,
          aqi: last.aqi,
          level: levelText(last.level, lang, true),
        })
      : device.name;
  }

  /**
   * @description The problems of the configuration itself: ids that are not ones.
   * @param {string} lang - The language.
   * @returns {string} The text, '' when none.
   */
  function configProblems(lang) {
    return [
      config.invalid.length ? t('errInvalidIds', lang, { list: config.invalid.join(', ') }) : '',
      config.extra ? t('errTooMany', lang, { count: config.extra }) : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  /**
   * @description Work out the connection status from the last readings.
   * @returns {Promise<void>}
   */
  async function refreshStatus() {
    if (!config.apiKey) {
      await reportStatus(false, all('errNoKey'));
      return;
    }
    if (authError) {
      await reportStatus(false, all('errAuth'));
      return;
    }
    if (paused()) {
      await reportStatus(true, all('statusPaused'));
      return;
    }
    if (roundError) {
      await reportStatus(
        false,
        Object.fromEntries(LANGUAGES.map((lang) => [lang, errorText(roundError, lang)])),
      );
      return;
    }
    if (devices.length === 0) {
      await reportStatus(
        true,
        Object.fromEntries(
          LANGUAGES.map((lang) => [
            lang,
            [configProblems(lang), t('statusNoDevice', lang)].filter(Boolean).join(' '),
          ]),
        ),
      );
      return;
    }
    const failing = devices.filter((device) => stateOf(device).error);
    if (failing.length > 0 || config.invalid.length > 0) {
      const ok = devices.length - failing.length;
      await reportStatus(
        ok > 0,
        all('statusSomeFailing', (lang) => ({
          ok,
          total: devices.length + config.invalid.length,
          detail: failing.length
            ? errorText(stateOf(failing[0]).error, lang, failing[0])
            : configProblems(lang),
        })),
      );
      return;
    }
    await reportStatus(
      true,
      all('statusConnected', (lang) => ({
        devices: devices.map((device) => deviceLine(device, lang)).join(', '),
      })),
    );
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const list = await gladys.getDevices();
      createdDevices = new Set(list.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Ask the open widgets to pull their content again.
   * @param {string[]} [keys] - The widgets, all by default.
   */
  function refreshWidgets(keys = Object.values(WIDGETS)) {
    for (const key of keys) {
      Promise.resolve(gladys.requestWidgetRefresh(key)).catch(() => {});
    }
  }

  /**
   * @description Publish scene events, one by one.
   * @param {Array<{ key: string, data: object }>} events - The events.
   * @returns {Promise<void>}
   */
  async function publishEvents(events) {
    for (const { key, data } of events) {
      logger.info(
        `Kaiterra ${data.name}: ${key} (${data.level ?? data.pollutant ?? data.state ?? data.module})`,
      );
      try {
        await gladys.publishSceneEvent(key, data);
      } catch (err) {
        logger.warn(`Unable to fire ${key}: ${err.message}`);
      }
    }
  }

  // --- Devices -----------------------------------------------------------------------

  /**
   * @description The configured devices, with the names their metadata gave.
   */
  function resolveDevices() {
    devices = config.udids.map((udid, index) => {
      const key = deviceKey(udid);
      const device = { udid, key, position: index + 1, deviceId: idsOf(gladys, key).device };
      device.name = nameOf(device);
      return device;
    });
  }

  /**
   * @description The name of a device: the one given in the Kaiterra app, its
   * model, or its position in the configuration.
   * @param {object} device - The device.
   * @returns {string} The name.
   */
  function nameOf(device) {
    const meta = stateOf(device).meta;
    return meta?.name || meta?.model || `#${device.position}`;
  }

  /**
   * @description Offer a device per configured device that answered, when they changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const lang = textLanguage();
    const list = devices
      .filter((device) => (stateOf(device).features ?? []).length > 0)
      .map((device) =>
        buildDevice(
          gladys,
          {
            key: device.key,
            name: device.name,
            model: stateOf(device).meta?.model,
            features: stateOf(device).features,
          },
          lang,
        ),
      );
    const signature = JSON.stringify(list);
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(list);
      lastDiscovery = signature;
    }
    return list.length;
  }

  /**
   * @description Publish the states of a device, when it exists in Gladys.
   * @param {object} device - The device.
   * @returns {Promise<void>}
   */
  async function publishStates(device) {
    if (!createdDevices.has(device.deviceId)) {
      return;
    }
    const states = buildStates(
      gladys,
      { key: device.key, features: stateOf(device).features },
      stateOf(device).reading ?? null,
      { language: textLanguage() },
    );
    if (states.length) {
      await gladys
        .publishChangedStates(states)
        .catch((err) =>
          logger.warn(`Unable to publish the states of ${device.name}: ${err.message}`),
        );
    }
  }

  // --- Reading -----------------------------------------------------------------------

  /**
   * @description Handle an error of a whole batch.
   * @param {Error} err - The error.
   * @throws {KaiterraError} Always, normalized.
   */
  function batchFailed(err) {
    const error =
      err instanceof KaiterraError ? err : new KaiterraError('failed', String(err?.message));
    logger.warn(`Kaiterra (${error.kind}): ${error.message}`);
    if (error.kind === 'auth') {
      authError = { kind: error.kind, message: error.message };
    } else if (error.kind === 'rate_limit') {
      pause.ms = Math.min(PAUSE_MAX_MS, pause.ms ? pause.ms * 2 : PAUSE_MS);
      pause.until = now() + pause.ms;
    } else {
      roundError = { kind: error.kind, message: error.message };
    }
    throw error;
  }

  /**
   * @description The metadata of the devices that need it (every 6 hours).
   * @param {boolean} force - Read every device.
   * @returns {Promise<void>}
   */
  async function readMetadata(force) {
    const due = devices.filter(
      (device) =>
        force || !stateOf(device).metaAt || now() - stateOf(device).metaAt > METADATA_EVERY_MS,
    );
    if (due.length === 0) {
      return;
    }
    const results = await api.metadata(due.map((device) => device.udid)).catch(batchFailed);
    results.forEach((result, index) => {
      const device = due[index];
      const state = stateOf(device);
      state.metaAt = now();
      if (result.data) {
        state.meta = parseMetadata(result.data);
        device.name = nameOf(device);
      } else {
        // The name is a comfort: the reading tells whether the device is usable.
        logger.warn(`Kaiterra device ${device.position} metadata: ${result.error.message}`);
      }
    });
  }

  /**
   * @description The hourly averages of the last 24 hours (every 30 minutes).
   * @param {boolean} force - Read every device.
   * @returns {Promise<void>}
   */
  async function readHistory(force) {
    const due = devices.filter(
      (device) =>
        !stateOf(device).error &&
        (force ||
          !stateOf(device).historyAt ||
          now() - stateOf(device).historyAt > HISTORY_EVERY_MS),
    );
    if (due.length === 0) {
      return;
    }
    const end = now();
    let results;
    try {
      results = await api.history(
        due.map((device) => device.udid),
        { begin: isoSeconds(end - DAY_MS), end: isoSeconds(end), timeZone: timeZone || 'UTC' },
      );
    } catch (err) {
      // The chart is a comfort: the readings went through, the status stays as it is.
      logger.warn(`Kaiterra history (${err.kind ?? 'failed'}): ${err.message}`);
      return;
    }
    results.forEach((result, index) => {
      const state = stateOf(due[index]);
      state.historyAt = now();
      if (result.data) {
        state.history = { at: now(), series: parseHistory(result.data) };
      } else {
        logger.warn(`Kaiterra device ${due[index].position} history: ${result.error.message}`);
      }
    });
  }

  /**
   * @description The last reading of every device, in one batch.
   * @returns {Promise<object[]>} The devices that answered with a reading.
   */
  async function readLatest() {
    const results = await api.latest(devices.map((device) => device.udid)).catch(batchFailed);
    const answered = [];
    results.forEach((result, index) => {
      const device = devices[index];
      const state = stateOf(device);
      state.readAt = now();
      const parsed = result.data ? parseLatest(result.data) : null;
      if (!parsed) {
        const error = result.error ?? new KaiterraError('no_data', 'No reading');
        state.error = { kind: error.kind, message: error.message };
        logger.warn(`Kaiterra device ${device.position} (${error.kind}): ${error.message}`);
        return;
      }
      const aqi = aqiOf(parsed.values);
      state.reading = { ...parsed, aqi, level: levelOf(aqi) };
      state.error = null;
      state.features = [...new Set([...(state.features ?? []), ...givenKeysOf(state.reading)])];
      answered.push(device);
    });
    return answered;
  }

  /**
   * @description What follows the reading of a device: events, states.
   * @param {object} device - The device.
   * @param {boolean} quiet - Publish the states only: the transitions are left
   * to the next round of the timer (a scene action never fires an event).
   * @returns {Promise<void>}
   */
  async function digest(device, quiet) {
    const state = stateOf(device);
    const last = state.reading;
    const seen = store.data.seen;
    const lang = textLanguage();
    const events = [];
    const live = !quiet && gladys.connected !== false;
    if (last && live) {
      const level = detectLevelChange(seen.level[device.key], last.level, now());
      seen.level[device.key] = level.next;
      if (level.change) {
        events.push({
          key: TRIGGERS.AIR_QUALITY_CHANGED,
          data: changedData(device, last, level.change, lang),
        });
      }
      const limits = limitsOf(config.limits);
      const thresholds = detectThresholds(seen.threshold[device.key], last.values, limits, now());
      seen.threshold[device.key] = thresholds.next;
      for (const [key, list] of [
        [TRIGGERS.THRESHOLD_EXCEEDED, thresholds.exceeded],
        [TRIGGERS.THRESHOLD_CLEARED, thresholds.cleared],
      ]) {
        events.push(
          ...list.map((pollutant) => ({
            key,
            data: thresholdData(device, last, pollutant, limits[pollutant], lang),
          })),
        );
      }
    }
    if (state.meta && live) {
      const modules = detectWornModules(seen.module[device.key], state.meta.modules);
      seen.module[device.key] = modules.next;
      events.push(
        ...modules.worn.map((module) => ({
          key: TRIGGERS.SENSOR_MODULE_WORN,
          data: moduleData(device, module),
        })),
      );
    }
    await publishEvents(events);
    await publishStates(device);
  }

  /**
   * @description Whether each device sends readings: an event when it stops or starts again.
   * @returns {Promise<void>}
   */
  async function checkConnections() {
    const events = [];
    for (const device of devices) {
      const at = stateOf(device).reading?.at;
      if (!Number.isFinite(at)) {
        continue;
      }
      const seen = store.data.seen.online;
      const connection = detectConnection(seen[device.key], at, now());
      seen[device.key] = connection.online;
      if (connection.changed && gladys.connected !== false) {
        events.push({
          key: TRIGGERS.CONNECTION_CHANGED,
          data: connectionData(device, connection.online, at, {
            language: textLanguage(),
            timeZone,
            now: now(),
          }),
        });
      }
    }
    await publishEvents(events);
  }

  /**
   * @description Read every device (one round at a time).
   * @param {object} [options] - `{ user, force, quiet }`: asked by the user
   * (Read now, a button, a scene action) reads even while a key was refused;
   * `force` reads the metadata and the history again too; `quiet` (a scene
   * action) fires no event.
   * @returns {Promise<void>}
   */
  function readDevices({ user = false, force = false, quiet = false } = {}) {
    if (!reading) {
      reading = (async () => {
        if (!config.apiKey || (authError && !user) || devices.length === 0 || paused()) {
          await refreshStatus();
          return;
        }
        let answered = [];
        try {
          await readMetadata(force);
          answered = await readLatest();
          authError = null;
          roundError = null;
          pause.ms = 0;
          await readHistory(force);
        } catch {
          // batchFailed logged it and set the status.
        }
        for (const device of answered) {
          await digest(device, quiet);
        }
        if (!quiet) {
          await checkConnections();
        }
        await store.save();
        if (answered.length) {
          await publishDiscoveredDevices().catch((err) =>
            logger.warn(`Unable to offer the devices: ${err.message}`),
          );
          refreshWidgets();
        }
        await refreshStatus();
      })().finally(() => {
        reading = null;
      });
    }
    return reading;
  }

  /**
   * @description (Re)arm the reading timer.
   */
  function schedule() {
    clearInterval(timer);
    if (!timers || stopped) {
      return;
    }
    timer = setInterval(() => {
      readDevices().catch((err) => logger.error('Readings', err));
    }, TICK_MS);
    timer.unref?.();
  }

  /**
   * @description Resolve the devices, read them, offer them.
   * @returns {Promise<void>}
   */
  async function applyConfig() {
    authError = null;
    roundError = null;
    resolveDevices();
    logger.info(
      `${devices.length} device(s) configured` +
        (config.invalid.length ? `; ${config.invalid.length} piece(s) are not device ids` : ''),
    );
    await publishDiscoveredDevices().catch((err) =>
      logger.warn(`Unable to offer the devices: ${err.message}`),
    );
    await readDevices();
    for (const device of devices) {
      await publishStates(device);
    }
    await refreshStatus();
    schedule();
  }

  /**
   * @description The device a widget or a scene action targets.
   * @param {unknown} externalId - The `source: "devices"` value.
   * @returns {object|null} The device, the first one by default.
   */
  function target(externalId) {
    const key = keyOfExternalId(externalId);
    return devices.find((device) => device.key === key) ?? devices[0] ?? null;
  }

  // --- Dashboard widgets -------------------------------------------------------------

  /**
   * @description The common start of a widget: configured, a device.
   * @param {object} settings - The widget settings.
   * @param {string} lang - The language.
   * @returns {{ device?: object, content?: object }} The device, or the content to show.
   */
  function widgetDevice(settings, lang) {
    if (!config.apiKey) {
      return { content: messageContent(t('errNoKey', lang)) };
    }
    if (authError) {
      return { content: messageContent(t('errAuth', lang)) };
    }
    const device = target(settings.device);
    if (!device) {
      return { content: messageContent(t('noDeviceWidget', lang)) };
    }
    const state = stateOf(device);
    if (state.error && !state.reading) {
      return {
        content: messageContent(errorText(state.error, lang, device), { refresh: true }),
      };
    }
    return { device };
  }

  gladys.onWidgetGet(WIDGETS.AIR_QUALITY, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const { device, content } = widgetDevice(settings, lang);
    if (content) {
      return content;
    }
    const state = stateOf(device);
    return buildAirQualityWidget({
      device: { name: device.name, online: onlineOf(device), modules: state.meta?.modules },
      reading: state.reading ?? null,
      limits: limitsOf(config.limits),
      language: lang,
      timeZone,
    });
  });

  gladys.onWidgetGet(WIDGETS.HISTORY, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const { device, content } = widgetDevice(settings, lang);
    if (content) {
      return content;
    }
    const state = stateOf(device);
    return buildHistoryWidget({
      device: { name: device.name },
      reading: state.reading ?? null,
      history: state.history ?? null,
      measure: MEASURES[settings.measure] ? settings.measure : undefined,
      limits: limitsOf(config.limits),
      language: lang,
      timeZone,
    });
  });

  gladys.onWidgetAction(WIDGETS.AIR_QUALITY, async (actionKey, params, { settings } = {}) => {
    if (actionKey !== WIDGET_ACTIONS.REFRESH) {
      throw new Error(`Unknown action ${actionKey}`);
    }
    const device = target(settings?.device);
    if (!device) {
      return all('noDeviceWidget');
    }
    const state = stateOf(device);
    if (state.readAt && !state.error && now() - state.readAt < REFRESH_MIN_AGE_MS) {
      return all('refreshCached');
    }
    if (paused()) {
      return all('errRateLimit');
    }
    await readDevices({ user: true });
    if (authError) {
      return all('errAuth');
    }
    if (roundError || stateOf(device).error) {
      const err = roundError ?? stateOf(device).error;
      return Object.fromEntries(
        LANGUAGES.map((lang) => [lang, errorText(err, lang, device).slice(0, 200)]),
      );
    }
    const last = stateOf(device).reading;
    return all('refreshDone', (lang) => ({
      value: Number.isFinite(last?.aqi)
        ? `AQI ${last.aqi}`
        : Number.isFinite(last?.values?.co2)
          ? `CO₂ ${decimal(last.values.co2, lang, 0)} ppm`
          : '–',
    }));
  });

  // --- Scene action ------------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_AIR_QUALITY, async (fields = {}) => {
    if (!config.apiKey) {
      throw new Error('The Kaiterra API key is not configured');
    }
    const device = target(fields.device);
    if (!device) {
      throw new Error('No Kaiterra device is configured');
    }
    if (!stateOf(device).readAt || now() - stateOf(device).readAt > FRESH_MS) {
      await readDevices({ user: true, quiet: true });
    }
    const last = stateOf(device).reading;
    if (!last) {
      throw new Error(
        `Kaiterra could not be read: ${stateOf(device).error?.message ?? roundError?.message ?? 'no reading yet'}`,
      );
    }
    const lang = textLanguage();
    const online = onlineOf(device);
    const time = formatTime(last.at, { language: lang, timeZone });
    const v = last.values;
    const summary = [
      Number.isFinite(last.aqi)
        ? t('summaryNow', lang, {
            name: device.name,
            level: levelText(last.level, lang).toLocaleLowerCase(lang),
            aqi: last.aqi,
          })
        : t('summaryNoAqi', lang, { name: device.name }),
      Number.isFinite(v.co2) ? t('summaryCo2', lang, { value: decimal(v.co2, lang, 0) }) : '',
      Number.isFinite(v.tvoc) ? t('summaryTvoc', lang, { value: decimal(v.tvoc, lang, 0) }) : '',
      Number.isFinite(v.temperature)
        ? t('summaryTemperature', lang, { temperature: decimal(v.temperature, lang) })
        : '',
      online === false ? t('summaryOffline', lang, { time }) : '',
    ]
      .filter(Boolean)
      .join(' ');
    return pick(
      {
        name: device.name,
        aqi: last.aqi,
        level: last.level,
        level_name: levelText(last.level, lang),
        ...v,
        measured_at: Number.isFinite(last.at) ? new Date(last.at).toISOString() : null,
        connection: online === false ? 'offline' : 'online',
        summary,
      },
      AIR_QUALITY_OUTPUTS,
    );
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.READ_NOW, async () => {
    if (!config.apiKey) {
      return all('errNoKey');
    }
    authError = null;
    if (devices.length === 0) {
      return Object.fromEntries(
        LANGUAGES.map((lang) => [
          lang,
          [configProblems(lang), t('statusNoDevice', lang)].filter(Boolean).join(' '),
        ]),
      );
    }
    await readDevices({ user: true, force: true });
    if (authError) {
      return all('errAuth');
    }
    if (paused()) {
      return all('statusPaused');
    }
    if (roundError) {
      return Object.fromEntries(LANGUAGES.map((lang) => [lang, errorText(roundError, lang)]));
    }
    return Object.fromEntries(
      LANGUAGES.map((lang) => {
        const lines = devices.map((device) => {
          const state = stateOf(device);
          return state.error ? errorText(state.error, lang, device) : deviceLine(device, lang);
        });
        const problems = configProblems(lang);
        return [
          lang,
          `${t('readDone', lang, { devices: lines.join(' · ') })}${problems ? ` ${problems}` : ''}`.slice(
            0,
            1000,
          ),
        ];
      }),
    );
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    const report = {
      version: VERSION,
      timeZone: timeZone ?? null,
      apiKey: config.apiKey ? 'set' : 'missing',
      language: config.language,
      limits: config.limits,
      invalidIds: config.invalid.length,
      extraIds: config.extra,
      requests,
      paused: paused() ? new Date(pause.until).toISOString() : null,
      authError: authError?.message ?? null,
      roundError: roundError ? `${roundError.kind}: ${roundError.message}` : null,
      // Devices by position and key: never their ids (secrets for the API).
      devices: devices.map((device) => {
        const state = stateOf(device);
        return {
          position: device.position,
          key: device.key,
          name: device.name,
          model: state.meta?.model ?? null,
          firmware: state.meta?.firmware ?? null,
          modules: state.meta?.modules?.map((m) => `${m.type || '?'}:${m.lifetime ?? '?'}%`) ?? [],
          created: createdDevices.has(device.deviceId),
          measuredAt: Number.isFinite(state.reading?.at)
            ? new Date(state.reading.at).toISOString()
            : null,
          aqi: state.reading?.aqi ?? null,
          values: state.reading ? Object.keys(state.reading.values) : null,
          historyHours: state.history
            ? Math.max(0, ...Object.values(state.history.series).map((points) => points.length))
            : null,
          features: state.features ?? [],
          readAt: state.readAt ? new Date(state.readAt).toISOString() : null,
          error: state.error ? `${state.error.kind}: ${state.error.message}` : null,
        };
      }),
    };
    const json = JSON.stringify(report);
    const count = Math.max(1, Math.ceil(json.length / DIAGNOSTIC_CHUNK));
    for (let chunk = 0; chunk < count; chunk += 1) {
      logger.info(
        `Kaiterra diagnostic ${chunk + 1}/${count}: ${json.slice(chunk * DIAGNOSTIC_CHUNK, (chunk + 1) * DIAGNOSTIC_CHUNK)}`,
      );
    }
    return all('diagnosticDone', { count });
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    resolveDevices();
    await readDevices({ user: true, force: true });
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    for (const device of devices) {
      await publishStates(device);
    }
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const previousKey = config.apiKey;
    await loadConfig(rawConfig);
    logger.info('Configuration updated');
    lastStatus = null;
    lastDiscovery = null;
    if (config.apiKey !== previousKey) {
      // A new key: read everything again, and lift a pause.
      pause = { until: 0, ms: 0 };
      for (const state of Object.values(store.data.devices)) {
        state.metaAt = 0;
        state.historyAt = 0;
      }
    }
    await applyConfig();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each (re)connection resynchronizes; the promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      await loadConfig();
      await store.load();
      await refreshCreatedDevices();
      lastStatus = null;
      lastDiscovery = null;
      await applyConfig();
    })().catch((err) => logger.error('Startup', err));
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearInterval(timer);
    await store.save();
  });

  return {
    store,
    api,
    readDevices,
    applyConfig,
    getDevices: () => devices,
    whenReady: () => startup,
  };
}

export {
  createApp,
  ACTIONS,
  SCENE_ACTIONS,
  TICK_MS,
  METADATA_EVERY_MS,
  HISTORY_EVERY_MS,
  PAUSE_MS,
  PAUSE_MAX_MS,
  REFRESH_MIN_AGE_MS,
  FRESH_MS,
};
