// A fake Kaiterra API for the tests, served through the `fetch` option of the
// integration. Its answers follow the examples of the Kaiterra API
// documentation (https://dev.kaiterra.com, version 2025-02-26):
//   - top_sensedge.json, top_laseregg.json: the GET /devices/{id}/top and
//     POST /batch examples (a Sensedge and a Laser Egg, very polluted air);
//   - top_sensedge_full.json: a Sensedge with every parameter code of the
//     documentation (clean air, the temperature in °F);
//   - metadata_sensedge.json, metadata_old_sensedge.json: GET /devices/{id},
//     with the `modules` of the handshake and with the deprecated bay fields.
// Their instants are moved to one minute before NOW. Tests never touch the network.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 2026-10-30 18:20 in Paris (CET).
const NOW = Date.parse('2026-10-30T17:20:00Z');
const TZ = 'Europe/Paris';
const KEY = 'good-key';
// The test devices of the documentation, and devices the fake API knows.
const OFFICE = '00000000-0031-0101-0000-00007e57c0de';
const EGG = '00000000-0001-0101-0000-00007e57c0de';
const FULL = '11111111-2222-4333-8444-555555555555';
const FORBIDDEN = '99999999-9999-4999-8999-999999999999';
const UNKNOWN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description Move every instant of a reading so that the newest is `at`.
 * @param {object} answer - The answer.
 * @param {number} at - The instant of the newest point (ms).
 * @returns {object} A copy.
 */
function rebase(answer, at = NOW - 60000) {
  const copy = clone(answer);
  const newest = Math.max(
    ...copy.data.flatMap((series) => series.points.map((point) => Date.parse(point.ts))),
  );
  for (const series of copy.data) {
    for (const point of series.points) {
      point.ts = new Date(Date.parse(point.ts) - newest + at).toISOString();
    }
  }
  return copy;
}

/**
 * @description 24 hourly averages ending at `end`, after the shape of the
 * documentation (group_by=1h): CO₂ rising in the evening, PM2.5 low.
 * @param {number} end - The end of the last hour (ms).
 * @returns {object} The answer.
 */
function hourlyHistory(end = NOW) {
  const hours = Array.from({ length: 24 }, (_, index) => end - (23 - index) * 3600000);
  const series = (param, units, value) => ({
    param,
    units,
    span: 3600,
    points: hours.map((at, index) => ({
      ts: new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      value: value(index),
    })),
  });
  return {
    data: [
      series('rco2', 'ppm', (i) => 450 + i * 30),
      series('rpm25c', 'µg/m³', (i) => (i === 20 ? null : 4 + (i % 5))),
      series('rpm10c', 'µg/m³', (i) => 10 + (i % 7)),
      series('rtemp', 'C', (i) => 19 + i / 10),
    ],
  };
}

/**
 * @description A temporary path for the file kept in /data.
 * @returns {string} The path.
 */
const storePath = () => join(mkdtempSync(join(tmpdir(), 'kaiterra-')), 'kaiterra.json');

/**
 * @description The fake API: POST /v1/batch, sub-requests by device.
 * @returns {Function & { calls: object[], devices: object, status: number|null }} A `fetch`.
 */
function fakeKaiterra() {
  const devices = {
    [OFFICE]: {
      top: rebase(fixture('top_sensedge.json')),
      meta: fixture('metadata_sensedge.json'),
    },
    [EGG]: {
      top: rebase(fixture('top_laseregg.json')),
      meta: { id: EGG, name: 'Bedroom', model: 'LE-101' },
    },
    [FULL]: {
      top: rebase(fixture('top_sensedge_full.json')),
      meta: { ...fixture('metadata_sensedge.json'), id: FULL, name: 'Living room' },
    },
  };
  const calls = [];
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const error = (status, details) => ({
    code: status,
    body: JSON.stringify({ errors: [{ status: String(status), title: 'error', details }] }),
  });
  const answer = (relative) => {
    const match = /^\/devices\/([0-9a-f-]{36})(\/top|\/history)?(?:\?(.*))?$/.exec(relative);
    if (!match) {
      return error(404, 'not found');
    }
    const [, udid, suffix = '', query = ''] = match;
    if (udid === FORBIDDEN) {
      return error(403, `forbidden: ${udid}`);
    }
    const device = devices[udid];
    if (!device) {
      return error(404, 'device not found');
    }
    if (suffix === '/top') {
      return { code: 200, body: JSON.stringify(device.top) };
    }
    if (suffix === '/history') {
      const params = Object.fromEntries(new URLSearchParams(query));
      calls.at(-1).history = params;
      return { code: 200, body: JSON.stringify(hourlyHistory(Date.parse(params.end))) };
    }
    return { code: 200, body: JSON.stringify(device.meta) };
  };
  const fetch = async (url, init = {}) => {
    const target = new URL(url);
    const body = JSON.parse(init.body ?? '[]');
    calls.push({
      path: target.pathname,
      method: init.method,
      key: target.searchParams.get('key'),
      urls: body.map((request) => request.relative_url),
    });
    if (fetch.offline) {
      throw Object.assign(new TypeError(`fetch failed for ${url}`), {
        cause: { code: 'ENOTFOUND' },
      });
    }
    if (fetch.status) {
      return json({ errors: [{ status: String(fetch.status), details: 'refused' }] }, fetch.status);
    }
    if (target.searchParams.get('key') !== KEY) {
      return json(
        { errors: [{ status: '401', title: 'error', details: 'API key not found' }] },
        401,
      );
    }
    if (target.pathname !== '/v1/batch' || init.method !== 'POST') {
      return json({ error: 'Not Found' }, 404);
    }
    return json(body.map((request) => answer(request.relative_url)));
  };
  fetch.calls = calls;
  fetch.devices = devices;
  fetch.offline = false;
  fetch.status = null;
  return fetch;
}

export {
  NOW,
  TZ,
  KEY,
  OFFICE,
  EGG,
  FULL,
  FORBIDDEN,
  UNKNOWN,
  silent,
  storePath,
  fixture,
  clone,
  rebase,
  hourlyHistory,
  fakeKaiterra,
};
