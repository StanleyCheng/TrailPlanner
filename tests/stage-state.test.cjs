const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const source = readFileSync(join(__dirname, '../lib/stage-ui.js'), 'utf8');
const modelCode = source.split('// BEGIN STAGE MODEL')[1].split('// END STAGE MODEL')[0];
const available = new Function(modelCode + '\nreturn stageAvailability;')();
const empty = { method: '', pointCount: 0, segmentCount: 0, hasImage: false, routingBusy: false, routingSearched: false, routeCount: 0 };

test('first visit offers only method selection; every input method unlocks its tools', () => {
  assert.deepEqual(available(empty), { method: true, input: false, requirements: false, routes: false, export: false });
  for (const method of ['map-pins', 'coordinates', 'text', 'gpx', 'map-image', 'image']) {
    assert.deepEqual(available({ ...empty, method }), { method: true, input: true, requirements: false, routes: false, export: false });
  }
});

test('waypoints unlock review and file tools without implying a planned route', () => {
  assert.deepEqual(available({ ...empty, method: 'coordinates', pointCount: 2 }), { method: true, input: true, requirements: true, routes: false, export: true });
  assert.equal(available({ ...empty, pointCount: 17 }).requirements, true, 'large drafts can still be reviewed and reduced');
  assert.equal(available({ ...empty, segmentCount: 1 }).export, true, 'source tracks remain exportable');
  assert.equal(available({ ...empty, hasImage: true }).export, true, 'uploaded images can still be discarded');
});

test('routing progress, failures and results remain accessible from the Routes tab', () => {
  for (const state of [{ routingBusy: true }, { routingSearched: true }, { routeCount: 3 }]) assert.equal(available({ ...empty, ...state }).routes, true);
  assert.equal(available({ ...empty, pointCount: 2 }).routes, false, 'editing a draft does not retain invalid route results');
});

const nav = new Function(modelCode + '\nreturn { stageAvailability, stageLockedReason, stageNavTarget, stageNextAction };')();
const order = ['method', 'input', 'requirements', 'routes', 'export'];

test('locked stages explain their unlock condition in plain language', () => {
  assert.equal(nav.stageLockedReason('input', empty), 'Choose how you want to add places first.');
  assert.equal(nav.stageLockedReason('requirements', empty), 'Add at least one place first.');
  assert.equal(nav.stageLockedReason('routes', empty), 'Set your places, then use Find.');
  assert.equal(nav.stageLockedReason('export', empty), 'Add at least one place or file first.');
  assert.equal(nav.stageLockedReason('method', empty), null, 'method selection is never locked');
  assert.equal(nav.stageLockedReason('requirements', { ...empty, pointCount: 3 }), null, 'unlocked stages have no reason');
});

test('the bar primary action follows the stage, and Find belongs to Requirements', () => {
  assert.equal(nav.stageNextAction('method'), 'continue');
  assert.equal(nav.stageNextAction('input'), 'review');
  assert.equal(nav.stageNextAction('requirements'), 'find');
  assert.equal(nav.stageNextAction('routes'), 'export');
  assert.equal(nav.stageNextAction('export'), null, 'export stage has no Next button');
});

test('back and forward navigation skip stages that are not yet available', () => {
  const available = nav.stageAvailability({ ...empty, method: 'map-pins', pointCount: 2 });
  assert.deepEqual(available, { method: true, input: true, requirements: true, routes: false, export: true });
  assert.equal(nav.stageNavTarget(order, available, 'requirements', -1), 'input');
  assert.equal(nav.stageNavTarget(order, available, 'input', -1), 'method');
  assert.equal(nav.stageNavTarget(order, available, 'method', -1), null, 'no Back target on the first stage');
  assert.equal(nav.stageNavTarget(order, available, 'input', 1), 'requirements');
  assert.equal(nav.stageNavTarget(order, available, 'requirements', 1), 'export', 'forward navigation skips locked Routes');
});
