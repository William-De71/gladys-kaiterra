// The HTTP client: one POST /batch, the key in the URL but never in an error,
// the device ids never in a message, the errors of the batch and of each
// sub-request told apart.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createKaiterraClient,
  relativeUrl,
  kindOf,
  detailOf,
  KaiterraError,
  BATCH_MAX,
} from '../src/kaiterra-api.js';
import { fakeKaiterra, KEY, OFFICE, EGG, FORBIDDEN, UNKNOWN } from './helpers/fake-api.js';

const client = (api, key = KEY) => createKaiterraClient({ getApiKey: () => key, fetch: api });

test('one POST /batch reads the last reading of every device, in order', async () => {
  const api = fakeKaiterra();
  const results = await client(api).latest([OFFICE, EGG, UNKNOWN, FORBIDDEN]);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].path, '/v1/batch');
  assert.equal(api.calls[0].method, 'POST');
  assert.equal(api.calls[0].key, KEY);
  assert.deepEqual(api.calls[0].urls, [
    `/devices/${OFFICE}/top`,
    `/devices/${EGG}/top`,
    `/devices/${UNKNOWN}/top`,
    `/devices/${FORBIDDEN}/top`,
  ]);
  assert.equal(results[0].data.data.length, 6);
  assert.equal(results[1].data.data[0].param, 'rhumid');
  assert.equal(results[2].error.kind, 'not_found');
  assert.equal(results[3].error.kind, 'forbidden');
  assert.doesNotMatch(results[3].error.message, /9999/, 'no device id in a message');
});

test('metadata and hourly history ride in batches too', async () => {
  const api = fakeKaiterra();
  const [meta] = await client(api).metadata([OFFICE]);
  assert.equal(meta.data.name, 'Office');
  assert.deepEqual(api.calls[0].urls, [`/devices/${OFFICE}`]);
  await client(api).history([OFFICE], {
    begin: '2026-10-29T17:20:00Z',
    end: '2026-10-30T17:20:00Z',
    timeZone: 'Europe/Paris',
  });
  assert.equal(
    api.calls[1].urls[0],
    `/devices/${OFFICE}/history?begin=2026-10-29T17%3A20%3A00Z&end=2026-10-30T17%3A20%3A00Z&group_by=1h&time_zone=Europe%2FParis`,
  );
});

test('more than 100 devices: several batches', async () => {
  const api = fakeKaiterra();
  const ids = Array.from(
    { length: BATCH_MAX + 3 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  );
  const results = await client(api).latest(ids);
  assert.equal(results.length, BATCH_MAX + 3);
  assert.deepEqual(
    api.calls.map((call) => call.urls.length),
    [BATCH_MAX, 3],
  );
});

test('a refused key, a missing key, a network failure: errors without the key nor the URL', async () => {
  const api = fakeKaiterra();
  await assert.rejects(client(api, 'wrong').latest([OFFICE]), (err) => {
    assert.equal(err.kind, 'auth');
    assert.equal(err.message, 'HTTP 401: API key not found');
    return true;
  });
  await assert.rejects(client(api, '').latest([OFFICE]), { kind: 'auth' });
  api.offline = true;
  await assert.rejects(client(api, 'secret-key').latest([OFFICE]), (err) => {
    assert.equal(err.kind, 'unreachable');
    assert.equal(err.message, 'ENOTFOUND');
    assert.doesNotMatch(err.message, /secret-key|kaiterra\.com/);
    return true;
  });
  api.offline = false;
  api.status = 429;
  await assert.rejects(client(api).latest([OFFICE]), { kind: 'rate_limit' });
  api.status = 503;
  await assert.rejects(client(api).latest([OFFICE]), { kind: 'failed' });
});

test('an unexpected batch answer is an error, not a crash', async () => {
  const api = async () => new Response('[{"code":200}]', { status: 200 });
  const results = await client(api).latest([OFFICE]);
  assert.equal(results[0].error.kind, 'failed');
  const short = async () => new Response('[]', { status: 200 });
  await assert.rejects(client(short).latest([OFFICE]), { kind: 'failed' });
  const html = async () => new Response('<html>', { status: 200 });
  await assert.rejects(client(html).latest([OFFICE]), { kind: 'failed' });
});

test('device ids are checked before they reach a URL', () => {
  assert.equal(relativeUrl(OFFICE, '/top'), `/devices/${OFFICE}/top`);
  assert.throws(() => relativeUrl('../batch'), KaiterraError);
  assert.throws(() => relativeUrl(OFFICE.toUpperCase()), KaiterraError);
});

test('kinds and details of the errors', () => {
  assert.deepEqual([401, 403, 404, 429, 400, 500].map(kindOf), [
    'auth',
    'forbidden',
    'not_found',
    'rate_limit',
    'invalid',
    'failed',
  ]);
  assert.equal(
    detailOf('{"errors":[{"details":"no auth credentials were specified"}]}'),
    'no auth credentials were specified',
  );
  assert.equal(detailOf('{"error":"Not Found"}'), 'Not Found');
  assert.equal(detailOf('oops'), '');
});
