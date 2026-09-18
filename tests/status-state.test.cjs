const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const source = readFileSync(join(__dirname, '../lib/status-ui.js'), 'utf8');
const stateCode = source.split('// BEGIN STATUS STATE')[1].split('// END STATUS STATE')[0];
const api = new Function(stateCode + '\nreturn { statusFindTicker, statusTicker, statusBarText, statusCancelVisible, statusBannerAnnounce, statusSerialActive, cairnVisible };')();
const { statusFindTicker, statusTicker, statusBarText, statusCancelVisible, statusBannerAnnounce, statusSerialActive, cairnVisible } = api;

const base = { banner: null, find: null, route: null, notice: null, step: 'Step 3 of 5 · Requirements', draft: null, now: 100000 };

test('priority: error banner outranks find narration, route summary, notice and step context', () => {
  const model = {
    ...base,
    banner: { text: 'No qualifying routes' },
    find: { milestone: 'Asking the route server…', startedAt: 99000 },
    route: 'Route 2 · 14.3 km · provisional · all 5 mandatory places',
    notice: 'Routes is locked — Set your places, then use Find.'
  };
  assert.equal(statusBarText(model), 'No qualifying routes');
  assert.equal(statusBarText({ ...model, banner: null }), 'Asking the route server…');
  assert.equal(statusBarText({ ...model, banner: null, find: null }), model.route);
  assert.equal(statusBarText({ ...model, banner: null, find: null, route: null }), model.notice);
  assert.equal(statusBarText({ ...model, banner: null, find: null, route: null, notice: null }), base.step);
});

test('draft context composes with the step context tier', () => {
  assert.equal(statusBarText({ ...base, draft: '3 waypoints · unverified draft' }), 'Step 3 of 5 · Requirements · 3 waypoints · unverified draft');
  assert.equal(statusBarText({ ...base, draft: null }), base.step);
});

test('milestones stay in the live bar line while seconds tick only in the non-live ticker', () => {
  const model = { ...base, find: { milestone: 'Asking the route server…', detail: '', startedAt: 97000 } };
  assert.equal(statusBarText(model), 'Asking the route server…');
  assert.doesNotMatch(statusBarText(model), /\d+s/, 'elapsed seconds must never enter the aria-live bar line');
  assert.equal(statusTicker(model), 'Still walking the map… 3s · usually 10–40s, limit 4 min');
});

test('engine progress detail moves to the ticker, never the live line', () => {
  const model = { ...base, find: { milestone: 'Checking mapped paths…', detail: 'Searching leg 2 of 5', startedAt: 90000 } };
  assert.equal(statusBarText(model), 'Checking mapped paths…');
  assert.equal(statusTicker(model), 'Searching leg 2 of 5 · 10s');
  assert.equal(statusTicker(base), '', 'no search, no ticker');
});

test('waiting flavor attaches to Find only; every other tier passes through verbatim', () => {
  assert.match(statusFindTicker(47), /Still walking the map… 47s/);
  for (const tier of [
    { banner: { text: 'The route server connection failed three times. Your waypoints are unchanged; tap Find to retry.' } },
    { route: 'Route 2 · 14.3 km · provisional · all 5 mandatory places' },
    { notice: 'Routes is locked — Set your places, then use Find.' },
    { step: 'Step 1 of 5 · Adding Pins' }
  ]) {
    const model = { ...base, ...tier };
    const expected = tier.banner?.text || tier.route || tier.notice || tier.step;
    assert.equal(statusBarText(model), expected, 'tier text passes through unmodified');
    assert.doesNotMatch(statusBarText(model), /Still walking the map/, 'flavor never leaks outside Find');
  }
});

test('banner insertion announces assertively once; replacements stay quiet', () => {
  assert.equal(statusBannerAnnounce(null, 'first failure'), 'assertive');
  assert.equal(statusBannerAnnounce({ text: 'old failure' }, 'new failure'), 'none');
  assert.equal(statusBannerAnnounce({ text: 'old failure' }, null), 'none');
});

test('stale serials are ignored; sites without a serial pass through', () => {
  assert.equal(statusSerialActive(4, 4), true);
  assert.equal(statusSerialActive(4, 3), false);
  assert.equal(statusSerialActive(4, null), true);
  assert.equal(statusSerialActive(4, undefined), true);
});

test('cairn appears for find and success cameo only, and never while the error banner is visible', () => {
  assert.equal(cairnVisible(base), false, 'idle: no cairn');
  assert.equal(cairnVisible({ ...base, find: { milestone: 'x', startedAt: 0 } }), true, 'find busy: hopping cairn');
  assert.equal(cairnVisible({ ...base, celebrate: true }), true, 'success cameo');
  assert.equal(cairnVisible({ ...base, find: { milestone: 'x', startedAt: 0 }, banner: { text: 'fail' } }), false, 'banner beats find');
  assert.equal(cairnVisible({ ...base, celebrate: true, banner: { text: 'fail' } }), false, 'banner beats cameo');
});

test('cancel affordance is visible only while a search runs', () => {
  assert.equal(statusCancelVisible(base), false);
  assert.equal(statusCancelVisible({ ...base, find: { milestone: 'x', startedAt: 0 } }), true);
});
