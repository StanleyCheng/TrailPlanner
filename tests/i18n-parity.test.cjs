const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const source = readFileSync(join(root, 'lib', 'i18n-ui.js'), 'utf8');

function loadDict() {
  const start = source.indexOf('const i18nDict = ');
  assert.ok(start >= 0, 'i18nDict is declared');
  const open = source.indexOf('{', start);
  // The dictionary is a pure literal (flat string keys and values only), so it
  // ends at the first top-level closing brace followed by a semicolon.
  let depth = 0, end = -1;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i++;
      while (i < source.length && source[i] !== quote) { if (source[i] === '\\') i++; i++; }
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > open, 'i18nDict literal is balanced');
  return vm.runInNewContext('(' + source.slice(open, end + 1) + ')', {});
}

const dict = loadDict();
const enKeys = Object.keys(dict.en).sort();
const zhKeys = Object.keys(dict['zh-Hant']).sort();
const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

// Values whose Traditional Chinese form is intentionally identical to English
// (proper nouns / untranslatable tokens only).
const identicalAllowed = new Set([
  'planner.sacScale.template', // 'T{n} · {scale}' — the SAC T-grade is a standard designation
  'stage.inputNames.text', // 'TXT / CSV' — file format names
]);

test('English and Traditional Chinese dictionaries have identical key sets', () => {
  assert.deepEqual(zhKeys, enKeys);
  assert.ok(enKeys.length > 500, `dictionary covers the app (${enKeys.length} keys)`);
});

test('every Traditional Chinese value is present and translated', () => {
  for (const key of enKeys) {
    const zh = dict['zh-Hant'][key];
    assert.equal(typeof zh, 'string', `${key} has a zh-Hant string`);
    assert.ok(zh.trim().length > 0, `${key} zh-Hant is not empty`);
    if (!identicalAllowed.has(key)) assert.notEqual(zh, dict.en[key], `${key} zh-Hant differs from English`);
  }
});

test('placeholder name sets match between languages for every key', () => {
  for (const key of enKeys) {
    assert.deepEqual(placeholders(dict['zh-Hant'][key]), placeholders(dict.en[key]), `${key} placeholders match`);
  }
});

test('every data-i18n attribute in index.html names a dictionary key', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const keys = new Set(enKeys);
  const missing = [];
  for (const match of html.matchAll(/data-i18n(?:-aria|-title|-placeholder)?="([^"]+)"/g)) {
    if (!keys.has(match[1])) missing.push(match[1]);
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('t() lookup mechanism falls back to English and interpolates', () => {
  const context = { appLanguage: 'zh-Hant', i18nDict: dict };
  vm.runInNewContext(`function t(key, vars) {
    const value = i18nDict[appLanguage]?.[key] ?? i18nDict.en[key] ?? key;
    return vars ? value.replace(/\\{(\\w+)\\}/g, (match, name) => vars[name] ?? match) : value;
  }`, context);
  assert.equal(context.t('stage.next.find'), '尋找路線');
  assert.equal(context.t('planner.routes.toggle', { n: 2 }), '路線 2');
  assert.equal(context.t('nonexistent.key'), 'nonexistent.key');
  context.appLanguage = 'en';
  assert.equal(context.t('planner.routes.toggle', { n: 1 }), 'Route 1');
});
