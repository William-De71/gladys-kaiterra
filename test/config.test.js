import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConfig, readUdids, readLimit, readLanguage, MAX_DEVICES } from '../src/config.js';

test('device ids: with or without dashes, any case, any separator, no duplicate', () => {
  assert.deepEqual(
    readUdids(
      '00000000-0031-0101-0000-00007E57C0DE,\n0000000000010101000000007e57c0de ; 00000000-0031-0101-0000-00007e57c0de',
    ),
    {
      udids: ['00000000-0031-0101-0000-00007e57c0de', '00000000-0001-0101-0000-00007e57c0de'],
      invalid: [],
      extra: 0,
    },
  );
});

test('pieces that are not ids are reported, cut to 12 characters', () => {
  const { udids, invalid } = readUdids(
    'Office 00000000-0031-0101-0000-00007e57c0de 4604811786a7488e9c58708f3470ee1',
  );
  assert.equal(udids.length, 1);
  assert.deepEqual(invalid, ['Office', '4604811786a7']);
  assert.deepEqual(readUdids(undefined), { udids: [], invalid: [], extra: 0 });
});

test('20 devices at most', () => {
  const many = Array.from(
    { length: MAX_DEVICES + 2 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  ).join(',');
  const { udids, extra } = readUdids(many);
  assert.equal(udids.length, MAX_DEVICES);
  assert.equal(extra, 2);
});

test('reference values within their range, the default otherwise', () => {
  assert.equal(readLimit(800, 'co2'), 800);
  assert.equal(readLimit('1200', 'co2'), 1200);
  assert.equal(readLimit(100, 'co2'), 1000);
  assert.equal(readLimit('', 'tvoc'), 500);
  assert.equal(readLimit(20000, 'tvoc'), 500);
});

test('the whole configuration, and the stored language', () => {
  assert.deepEqual(normalizeConfig({ api_key: ' k ', co2_limit: 900, language: 'de' }), {
    apiKey: 'k',
    udids: [],
    invalid: [],
    extra: 0,
    limits: { co2: 900, tvoc: 500 },
    language: 'de',
  });
  assert.equal(normalizeConfig(null).language, 'auto');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'auto');
  assert.equal(readLanguage({ last_language: 'fr' }, 'en'), 'fr');
  assert.equal(readLanguage({ last_language: 'french' }, 'en'), 'en');
});
