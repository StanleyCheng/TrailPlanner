const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const source = readFileSync(join(__dirname, '../lib/loupe-ui.js'), 'utf8');
const stateCode = source.split('// BEGIN LOUPE STATE')[1].split('// END LOUPE STATE')[0];
const loupe = new Function(stateCode + '\nreturn { loupeGestureInitial, loupeGestureReduce, LOUPE_ARM_MS, LOUPE_SLOP_PX };')();
const { loupeGestureInitial, loupeGestureReduce } = loupe;

const down = (over = {}) => ({ type: 'down', x: 100, y: 200, pointerId: 1, pointerType: 'touch', adding: true, onMarker: false, ...over });

test('quick tap never arms and never suppresses the release click', () => {
  let g = loupeGestureInitial();
  let r = loupeGestureReduce(g, down());
  assert.equal(r.gesture.phase, 'pending');
  assert.deepEqual(r.effects, []);
  r = loupeGestureReduce(r.gesture, { type: 'up', pointerId: 1 });
  assert.equal(r.gesture.phase, 'idle');
  assert.deepEqual(r.effects, [], 'release before the arm delay leaves click-to-place untouched');
});

test('holding past the arm delay places a pin, disables map handlers and shows the loupe', () => {
  let g = loupeGestureReduce(loupeGestureInitial(), down()).gesture;
  const r = loupeGestureReduce(g, { type: 'timer', pointerId: 1 });
  assert.equal(r.gesture.phase, 'armed');
  assert.deepEqual(r.effects, ['place-pin', 'disable-handlers', 'show-loupe']);
});

test('moving past the slop before the arm delay means panning, never arming', () => {
  let g = loupeGestureReduce(loupeGestureInitial(), down()).gesture;
  let r = loupeGestureReduce(g, { type: 'move', x: 100 + loupe.LOUPE_SLOP_PX + 5, y: 200, pointerId: 1 });
  assert.equal(r.gesture.phase, 'panning');
  assert.deepEqual(r.effects, []);
  r = loupeGestureReduce(r.gesture, { type: 'timer', pointerId: 1 });
  assert.equal(r.gesture.phase, 'panning', 'the arm timer must not fire once panning');
  assert.deepEqual(r.effects, []);
  r = loupeGestureReduce(r.gesture, { type: 'up', pointerId: 1 });
  assert.equal(r.gesture.phase, 'idle');
  assert.deepEqual(r.effects, []);
});

test('small jitter within the slop still arms', () => {
  let g = loupeGestureReduce(loupeGestureInitial(), down()).gesture;
  let r = loupeGestureReduce(g, { type: 'move', x: 100 + loupe.LOUPE_SLOP_PX - 4, y: 200, pointerId: 1 });
  assert.equal(r.gesture.phase, 'pending');
  r = loupeGestureReduce(r.gesture, { type: 'timer', pointerId: 1 });
  assert.equal(r.gesture.phase, 'armed');
});

test('release after arming commits the pin, restores handlers and suppresses the release click', () => {
  let g = loupeGestureReduce(loupeGestureInitial(), down()).gesture;
  g = loupeGestureReduce(g, { type: 'timer', pointerId: 1 }).gesture;
  let r = loupeGestureReduce(g, { type: 'move', x: 140, y: 240, pointerId: 1 });
  assert.deepEqual(r.effects, ['move-pin', 'update-loupe']);
  r = loupeGestureReduce(r.gesture, { type: 'up', pointerId: 1 });
  assert.equal(r.gesture.phase, 'idle');
  assert.deepEqual(r.effects, ['commit-pin', 'restore-handlers', 'suppress-click', 'hide-loupe']);
});

test('pointercancel after arming commits and restores without click suppression', () => {
  let g = loupeGestureReduce(loupeGestureInitial(), down()).gesture;
  g = loupeGestureReduce(g, { type: 'timer', pointerId: 1 }).gesture;
  const r = loupeGestureReduce(g, { type: 'cancel', pointerId: 1 });
  assert.equal(r.gesture.phase, 'idle');
  assert.deepEqual(r.effects, ['commit-pin', 'restore-handlers', 'hide-loupe']);
});

test('mouse and pen presses arm like touch; inactive adding mode and marker presses stay inert', () => {
  for (const pointerType of ['mouse', 'pen']) {
    const r = loupeGestureReduce(loupeGestureInitial(), down({ pointerType }));
    assert.equal(r.gesture.phase, 'pending', `${pointerType} press-and-hold should arm`);
    assert.deepEqual(r.effects, []);
  }
  for (const event of [down({ adding: false }), down({ onMarker: true })]) {
    const r = loupeGestureReduce(loupeGestureInitial(), event);
    assert.equal(r.gesture.phase, 'idle');
    assert.deepEqual(r.effects, []);
  }
});

test('only the primary mouse button can arm hold-to-place', () => {
  for (const button of [1, 2]) {
    const r = loupeGestureReduce(loupeGestureInitial(), down({ pointerType: 'mouse', button }));
    assert.equal(r.gesture.phase, 'idle', `mouse button ${button} must not place pins`);
    assert.deepEqual(r.effects, []);
  }
  assert.equal(loupeGestureReduce(loupeGestureInitial(), down({ pointerType: 'mouse', button: 0 })).gesture.phase, 'pending');
});

test('mouse press-and-hold places a pin, shows the loupe and suppresses the release click', () => {
  let g = loupeGestureReduce(loupeGestureInitial(), down({ pointerType: 'mouse', button: 0 })).gesture;
  assert.equal(g.phase, 'pending');
  let r = loupeGestureReduce(g, { type: 'timer', pointerId: 1 });
  assert.equal(r.gesture.phase, 'armed');
  assert.deepEqual(r.effects, ['place-pin', 'disable-handlers', 'show-loupe']);
  r = loupeGestureReduce(r.gesture, { type: 'move', x: 140, y: 240, pointerId: 1 });
  assert.deepEqual(r.effects, ['move-pin', 'update-loupe']);
  r = loupeGestureReduce(r.gesture, { type: 'up', pointerId: 1 });
  assert.equal(r.gesture.phase, 'idle');
  assert.deepEqual(r.effects, ['commit-pin', 'restore-handlers', 'suppress-click', 'hide-loupe']);
});

test('events from a different pointer never disturb the tracked gesture', () => {
  let g = loupeGestureReduce(loupeGestureInitial(), down()).gesture;
  let r = loupeGestureReduce(g, { type: 'move', x: 500, y: 500, pointerId: 2 });
  assert.equal(r.gesture.phase, 'pending');
  r = loupeGestureReduce(g, { type: 'up', pointerId: 2 });
  assert.equal(r.gesture.phase, 'pending');
});

test('a second finger while armed commits and restores so pinch zoom can take over', () => {
  let g = loupeGestureReduce(loupeGestureInitial(), down()).gesture;
  g = loupeGestureReduce(g, { type: 'timer', pointerId: 1 }).gesture;
  const r = loupeGestureReduce(g, down({ pointerId: 2 }));
  assert.equal(r.gesture.phase, 'idle');
  assert.deepEqual(r.effects, ['commit-pin', 'restore-handlers', 'hide-loupe']);
});

test('touch-dragging an existing pin shows the loupe for the drag duration only', () => {
  let r = loupeGestureReduce(loupeGestureInitial(), { type: 'dragstart', pointerType: 'touch' });
  assert.equal(r.gesture.phase, 'pin-drag');
  assert.deepEqual(r.effects, ['show-loupe']);
  r = loupeGestureReduce(r.gesture, { type: 'drag' });
  assert.deepEqual(r.effects, ['update-loupe']);
  r = loupeGestureReduce(r.gesture, { type: 'dragend' });
  assert.equal(r.gesture.phase, 'idle');
  assert.deepEqual(r.effects, ['hide-loupe']);
});

test('mouse drags of existing pins show the loupe for the drag duration only', () => {
  let r = loupeGestureReduce(loupeGestureInitial(), { type: 'dragstart', pointerType: 'mouse' });
  assert.equal(r.gesture.phase, 'pin-drag');
  assert.deepEqual(r.effects, ['show-loupe']);
  r = loupeGestureReduce(r.gesture, { type: 'dragend' });
  assert.equal(r.gesture.phase, 'idle');
  assert.deepEqual(r.effects, ['hide-loupe']);
});
