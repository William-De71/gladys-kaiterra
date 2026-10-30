# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for Kaiterra indoor air quality
monitors (Sensedge, Sensedge Mini, Laser Egg): a Node.js service (Node 22+,
ESM, no build step) that runs in its own sandboxed Docker container and talks
to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the official Kaiterra API v1
(`https://api.kaiterra.com/v1`, an API key per user, created at
app.kaiterra.com): `POST /batch` carrying `GET /devices/{id}/top` (the last
reading, every minute), `GET /devices/{id}` (name, model, sensor modules,
every 6 hours) and `GET /devices/{id}/history?group_by=1h` (the last 24 hours,
every 30 minutes), for up to 20 device ids (UDIDs) given by the user — the API
cannot list them. Read only. Transport: cloud only. Reference:
https://dev.kaiterra.com (version 2025-02-26); no rate limit is documented.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
UPDATE_BASELINE=1 node --test test/structure.test.js   # ONLY with a documented migration
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the reading timer
src/kaiterra-api.js     HTTP client: POST /batch, the key in the `key` parameter, error kinds
src/params.js           parameter codes -> values in the units of Gladys, history, metadata
src/aqi.js              US EPA AQI of the particles, six levels, reference values
src/events.js           scene trigger transitions (held 5 minutes), payloads, action outputs
src/device.js           the devices (hashed ids), their features (they only grow) and states
src/widgets.js          air quality and 24-hour history dashboard widgets
src/store.js            /data/kaiterra.json: readings, metadata, history, features, `seen`
src/time.js             RFC 3339 instants, formats in the timezone of Gladys
src/config.js           configuration (key, device ids, CO₂ / TVOC references, language)
src/i18n.js             runtime texts, en / fr / de / es, levels and advice
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/fixtures/          answers built after the examples of the API documentation
test/helpers/fake-api.js            the fake Kaiterra API behind the `fetch` option
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`sensor:<first 12 hex digits of the SHA-256 of the
UDID>`: never the UDID, a name nor a position), the feature keys, feature
  `category` / `type` / `unit` / `min` / `max` / `step`, the level keys
  (`good` … `hazardous`), the pollutant keys, the keys of `config_schema`,
  `actions`, the widgets and their settings, scene triggers (fields, options,
  variables) and scene actions (fields, outputs). `test/structure.test.js`
  compares them to `test/fixtures/discovery.baseline.json`: never update the
  baseline to make a test pass without a documented migration.
- **Category / type pairs.** The AQI is `airquality-sensor` / `aqi`, unit AQI,
  0-500; PM2.5, PM10, NO₂, O₃ their own categories, `decimal`, µg/m³ (NO₂ and
  O₃ converted from ppb at 25 °C); CO₂ `co2-sensor` / `integer`, ppm; TVOC
  `voc-sensor` / `decimal`, ppb; temperature, humidity, pressure (hPa) decimal;
  illuminance `light-sensor` / `decimal`, lx; motion `motion-sensor` /
  `binary`; dew point `temperature-sensor` / `probe`; the level `text` /
  `text`. PM1 has no category in Gladys and CO is a binary detector there:
  never features. A value the device did not give is not published (a 0 would
  claim clean air); a unit that cannot be converted is left out, never guessed.
- **Features never flap.** A device is offered once it answered; its features
  are the ones it ever gave, kept in /data, never removed.
- **The AQI comes from the value** (aqi.js, EPA breakpoints of 2024 for
  PM2.5), never from the API.
- **One batch a minute.** The last readings of every device in one `POST
/batch`; metadata every 6 hours, history every 30 minutes, each in its own
  batch. A 429 pauses 5 minutes, doubled up to 30; a refused key stops until
  the configuration changes; a failed history never touches the status.
- **`should_poll` stays false**: the integration has its own timer.
- **Secrets and privacy.** The key travels in the `key` URL parameter (the only
  way the API takes it): a URL never reaches a log nor an error message. The
  device ids are secrets for the API too: messages name a device by its
  position, /data and the diagnostic by its hashed key.
- **Events once, after 5 minutes.** `seen` (in /data) keeps the confirmed
  level, the zones of the references (over above, normal below 90 %), online
  or not, the worn modules. A state counts once it held 5 minutes. The first
  reading is a baseline. A scene action reads quietly and never fires an
  event: the next round of the timer does; a widget never fires one either.
- **Credit.** "Kaiterra" and the hour of the data stay visible in the widgets;
  "Data provided by Kaiterra" in the README, the docs and NOTICE.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. German uses "du", Spanish "usted",
  like the Gladys interface. Device names from the Kaiterra app stay as they are.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. Transport: `["cloud"]`. No permission.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (the fake API of
  `test/helpers/fake-api.js`).
