// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The two widgets for a Sensedge called "Office", on 2026-10-30 at 18:20 in
// Paris: the readings follow the examples of the Kaiterra API documentation
// kept in test/fixtures (every parameter code of top_sensedge_full.json, the
// CO₂ of a meeting room at the end of the day, a little more particles) and
// go through the real parser (src/params.js), AQI (src/aqi.js) and widget
// builders (src/widgets.js); the history is the 24 hourly averages of the
// test helper.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildAirQualityWidget, buildHistoryWidget } = await load('src/widgets.js');
const { parseLatest, parseHistory, parseMetadata } = await load('src/params.js');
const { aqiOf, levelOf, limitsOf } = await load('src/aqi.js');
const { LANGUAGES } = await load('src/i18n.js');
const { rebase, fixture, hourlyHistory, NOW, TZ } = await load('test/helpers/fake-api.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

const top = fixture('top_sensedge_full.json');
// Illustration: the end of a working day in a closed office.
const values = { rco2: 1120, rpm25c: 14.2, rpm10c: 21, tvoc: 310, rtemp: 73.4, rhumid: 47 };
for (const series of top.data) {
  if (values[series.param] !== undefined) {
    series.points[0].value = values[series.param];
  }
}
const parsed = parseLatest(rebase(top));
const aqi = aqiOf(parsed.values);
const reading = { ...parsed, aqi, level: levelOf(aqi) };
const history = { at: NOW, series: parseHistory(hourlyHistory(NOW)) };
const meta = parseMetadata(fixture('metadata_sensedge.json'));
const device = { name: meta.name, online: true, modules: meta.modules };
const limits = limitsOf();

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    air_quality: buildAirQualityWidget({ device, reading, limits, language, timeZone: TZ }),
    history: buildHistoryWidget({
      device,
      reading,
      history,
      measure: 'co2',
      limits,
      language,
      timeZone: TZ,
    }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
