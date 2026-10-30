// -----------------------------------------------------------------------------
// HTTP client of the Kaiterra API v1 (https://api.kaiterra.com/v1, reference:
// https://dev.kaiterra.com, version 2025-02-26).
//
//   GET  /devices/{id}           name, model, firmware, sensor modules
//   GET  /devices/{id}/top       the last reading uploaded by the device
//   GET  /devices/{id}/history   readings of a period (`group_by`: averages)
//   POST /batch                  up to 100 of the requests above in one round trip
// The integration only uses /batch: one request reads every device.
//
// The key goes in the `key` URL parameter: that is the only way the API takes
// it (HTTPS only). A URL therefore never reaches a log nor an error message.
// Device ids (UDIDs) are treated as secrets too (the API documentation asks
// not to publish them): errors name a device by its position, never its id.
//
// Errors: 401 for a missing or refused key ("API key not found"); 403 for a
// device of an organization the key does not belong to; 404 for a device not
// registered yet; 400 for a malformed request. A batch answers 200 as soon as
// it was processed, each sub-request carrying its own `code` and `body` (a
// JSON string). The API documents no rate limit: a 429 is handled anyway.
// -----------------------------------------------------------------------------

const BASE_URL = 'https://api.kaiterra.com/v1';
const TIMEOUT_MS = 20000;
const BATCH_MAX = 100;
const UDID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * @description An error of the Kaiterra API, with a kind the messages can tell apart.
 */
class KaiterraError extends Error {
  /**
   * @param {string} kind - `auth`, `forbidden`, `not_found`, `rate_limit`,
   * `unreachable`, `invalid`, `failed`.
   * @param {string} message - The message (never the key nor a device id).
   * @param {number} [status] - The HTTP status.
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'KaiterraError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description The kind of an HTTP status.
 * @param {number} status - The status.
 * @returns {string} The kind.
 */
function kindOf(status) {
  if (status === 401) {
    return 'auth';
  }
  if (status === 403) {
    return 'forbidden';
  }
  if (status === 404) {
    return 'not_found';
  }
  if (status === 429) {
    return 'rate_limit';
  }
  if (status >= 400 && status < 500) {
    return 'invalid';
  }
  return 'failed';
}

/**
 * @description The detail of an error answer: `{"errors":[{"details":"…"}]}`.
 * @param {string} body - The body.
 * @returns {string} The detail, '' when none.
 */
function detailOf(body) {
  try {
    const parsed = JSON.parse(body);
    const first = Array.isArray(parsed?.errors) ? parsed.errors[0] : parsed;
    return String(first?.details ?? first?.title ?? first?.error ?? first?.message ?? '');
  } catch {
    return '';
  }
}

/**
 * @description An error of a status, with the detail the API gave.
 * @param {number} status - The status.
 * @param {string} body - The body.
 * @returns {KaiterraError} The error.
 */
function errorOf(status, body) {
  const detail = detailOf(body).replace(
    /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi,
    '…',
  );
  return new KaiterraError(
    kindOf(status),
    `HTTP ${status}${detail ? `: ${detail.slice(0, 120)}` : ''}`,
    status,
  );
}

/**
 * @description The relative URL of a sub-request.
 * @param {string} udid - The device id (lowercase, with dashes).
 * @param {string} [suffix] - `''`, `'/top'` or `'/history'`.
 * @param {object} [query] - The parameters.
 * @returns {string} "/devices/<udid>/top".
 */
function relativeUrl(udid, suffix = '', query = {}) {
  if (!UDID_PATTERN.test(udid)) {
    throw new KaiterraError('invalid', 'Invalid device id');
  }
  const search = new URLSearchParams(query).toString();
  return `/devices/${udid}${suffix}${search ? `?${search}` : ''}`;
}

/**
 * @description The Kaiterra client.
 * @param {object} options - Options.
 * @param {Function} options.getApiKey - `() => string`.
 * @param {Function} [options.onRequest] - `() => void`, before each request.
 * @param {Function} [options.fetch] - The fetch implementation (tests).
 * @param {string} [options.baseUrl] - The API root.
 * @returns {object} The client.
 */
function createKaiterraClient({
  getApiKey,
  onRequest = () => {},
  fetch: fetchFn = globalThis.fetch,
  baseUrl = BASE_URL,
}) {
  /**
   * @description Run up to 100 sub-requests in one POST /batch.
   * @param {Array<{ relative_url: string }>} requests - The GET sub-requests.
   * @returns {Promise<Array<{ code: number, data?: object, error?: KaiterraError }>>}
   * One result per sub-request, in the same order.
   * @throws {KaiterraError} When the batch itself failed (key, network…).
   */
  async function batchOnce(requests) {
    const key = getApiKey();
    if (!key) {
      throw new KaiterraError('auth', 'No API key');
    }
    const url = new URL(`${baseUrl.replace(/\/$/, '')}/batch`);
    url.searchParams.set('include_headers', 'false');
    url.searchParams.set('key', key);
    onRequest();
    let response;
    try {
      response = await fetchFn(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(requests.map((request) => ({ method: 'GET', ...request }))),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // The cause, never the URL (it holds the key).
      throw new KaiterraError(
        'unreachable',
        String(err?.cause?.code ?? err?.name ?? 'fetch failed'),
      );
    }
    const body = await response.text();
    if (!response.ok) {
      throw errorOf(response.status, body);
    }
    let answers;
    try {
      answers = JSON.parse(body);
    } catch {
      throw new KaiterraError('failed', 'Unreadable answer', response.status);
    }
    if (!Array.isArray(answers) || answers.length !== requests.length) {
      throw new KaiterraError('failed', 'Unexpected answer', response.status);
    }
    return answers.map((answer) => {
      const code = Number(answer?.code);
      const text =
        typeof answer?.body === 'string' ? answer.body : JSON.stringify(answer?.body ?? null);
      if (code < 200 || code >= 300) {
        return { code, error: errorOf(code, text) };
      }
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        // Below: an unreadable body is an error of this sub-request only.
      }
      return data && typeof data === 'object'
        ? { code, data }
        : { code, error: new KaiterraError('failed', 'Unreadable answer', code) };
    });
  }

  /**
   * @description Run any number of sub-requests, 100 per batch.
   * @param {Array<{ relative_url: string }>} requests - The sub-requests.
   * @returns {Promise<object[]>} One result per sub-request.
   */
  async function batch(requests) {
    const results = [];
    for (let start = 0; start < requests.length; start += BATCH_MAX) {
      results.push(...(await batchOnce(requests.slice(start, start + BATCH_MAX))));
    }
    return results;
  }

  return {
    batch,
    /**
     * @description The last reading of each device.
     * @param {string[]} udids - The device ids.
     * @returns {Promise<object[]>} `{ code, data | error }` per device.
     */
    latest: (udids) => batch(udids.map((udid) => ({ relative_url: relativeUrl(udid, '/top') }))),
    /**
     * @description The metadata of each device.
     * @param {string[]} udids - The device ids.
     * @returns {Promise<object[]>} `{ code, data | error }` per device.
     */
    metadata: (udids) => batch(udids.map((udid) => ({ relative_url: relativeUrl(udid) }))),
    /**
     * @description The hourly averages of each device over a period.
     * @param {string[]} udids - The device ids.
     * @param {object} options - `{ begin, end, timeZone }`: ISO instants in UTC
     * and the IANA zone of the hour boundaries.
     * @returns {Promise<object[]>} `{ code, data | error }` per device.
     */
    history: (udids, { begin, end, timeZone = 'UTC' }) =>
      batch(
        udids.map((udid) => ({
          relative_url: relativeUrl(udid, '/history', {
            begin,
            end,
            group_by: '1h',
            time_zone: timeZone,
          }),
        })),
      ),
  };
}

export {
  BASE_URL,
  BATCH_MAX,
  UDID_PATTERN,
  KaiterraError,
  kindOf,
  detailOf,
  errorOf,
  relativeUrl,
  createKaiterraClient,
};
