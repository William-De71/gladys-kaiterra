// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/kaiterra.json (the
// only writable place of the container), by device key (the hash of its id,
// never the id itself):
//   - `devices`   the last reading, the metadata (name, model, modules) and
//                 when it was read, the hourly history of the last 24 hours,
//                 the features the device ever gave (they only grow: a
//                 feature never flaps);
//   - `seen`      what the scene triggers already know: the confirmed AQI
//                 level, the values over their reference, online or not, the
//                 worn sensor modules. A restart never fires twice.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/kaiterra.json';
const SEEN_KEYS = ['level', 'threshold', 'online', 'module'];
const EMPTY = () => ({
  devices: {},
  seen: Object.fromEntries(SEEN_KEYS.map((key) => [key, {}])),
});

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger }`.
 * @returns {object} `{ data, load, save }`.
 */
function createStore({ path = DEFAULT_PATH, logger } = {}) {
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file; an absent or broken file is an empty store.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const raw = JSON.parse(await readFile(path, 'utf8'));
        const part = (node) =>
          node && typeof node === 'object' && !Array.isArray(node) ? node : {};
        const value = part(raw);
        store.data.devices = { ...part(value.devices) };
        store.data.seen = Object.fromEntries(
          SEEN_KEYS.map((key) => [key, { ...part(part(value.seen)[key]) }]),
        );
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
      }
    },
    /**
     * @description Write the file (atomically: a temporary file, then a rename).
     * @returns {Promise<void>}
     */
    async save() {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, JSON.stringify(store.data));
        await rename(temporary, path);
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
  };
  return store;
}

export { DEFAULT_PATH, SEEN_KEYS, createStore };
