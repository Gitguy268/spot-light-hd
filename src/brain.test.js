import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSpot, stepSpot, boxWorld, REACH, angDiff } from './brain.js';

const run = (s, dot, world, secs, opts) => { const ev = []; for (let t = 0; t < secs; t += 1 / 60) ev.push(...stepSpot(s, dot, world, 1 / 60, opts)); return ev; };

test('Spot runs towards the dot', () => {
  const s = newSpot(-2, 0), w = boxWorld();
  s.h = Math.PI / 2; // facing +x
  run(s, { x: 2, y: 0, z: 0, on: true }, w, 0.4);
  assert.ok(s.x > -2 + 0.2, `moved to ${s.x}`);
});

test('a still dot within reach gets pounced on and caught', () => {
  const s = newSpot(-1, 0), w = boxWorld();
  s.h = Math.PI / 2;
  const ev = run(s, { x: 0.2, y: 0, z: 0, on: true }, w, 2.5);
  assert.ok(ev.includes('pounce'), 'pounced');
  assert.ok(ev.includes('catch'), `caught (events: ${[...new Set(ev)]})`);
});

test('a dot that jumps away during the pounce is a miss', () => {
  const s = newSpot(-1, 0), w = boxWorld();
  s.h = Math.PI / 2;
  const dot = { x: 0.2, y: 0, z: 0, on: true };
  const ev = [];
  for (let t = 0; t < 2.5; t += 1 / 60) {
    if (s.state === 'pounce') { dot.x = -2.5; dot.z = 2; }
    ev.push(...stepSpot(s, dot, w, 1 / 60));
    if (ev.includes('miss') || ev.includes('catch')) break;
  }
  assert.ok(ev.includes('miss'), `missed (events: ${[...new Set(ev)]})`);
});

test('a dot high on the wall makes him bark or rear, never catch', () => {
  const s = newSpot(2.6, 0), w = boxWorld();
  s.h = Math.PI / 2;
  const ev = run(s, { x: 3.5, y: 1.0, z: 0, on: true }, w, 4);
  assert.ok(!ev.includes('catch'));
  assert.ok(ev.includes('bark'));
});

test('turning the laser off sends him searching', () => {
  const s = newSpot(0, 0), w = boxWorld();
  run(s, { x: 1, y: 0, z: 1, on: true }, w, 0.3);
  run(s, { x: 1, y: 0, z: 1, on: false }, w, 0.2);
  assert.equal(s.state, 'search');
});

test('he stays inside the room and gets tired', () => {
  const s = newSpot(0, 0), w = boxWorld(3.5, 2.5);
  const dot = { x: 0, y: 0, z: 0, on: true };
  for (let t = 0; t < 40; t += 1 / 60) { dot.x = 3 * Math.cos(t * 1.7); dot.z = 2 * Math.sin(t * 2.3); stepSpot(s, dot, w, 1 / 60, { noPounce: true }); }
  assert.ok(Math.abs(s.x) <= 3.5 && Math.abs(s.z) <= 2.5);
  assert.ok(s.energy < 100 && s.distance > 20, `energy ${s.energy}, distance ${s.distance}`);
});

test('fetch: dot on a toy -> pickup, drop zone -> drop', () => {
  const s = newSpot(0, 0), w = boxWorld();
  const toy = { id: 'ball', x: 1.2, z: 0 };
  const opts = { pickups: [toy], dropZone: { x: -2.5, z: 0, r: 0.5 } };
  let ev = run(s, { x: 1.2, y: 0, z: 0, on: true }, w, 3, opts);
  assert.ok(ev.includes('pickup'), 'picked up');
  assert.equal(s.carrying, 'ball');
  opts.pickups = [];
  ev = [];
  for (let t = 0; t < 4; t += 1 / 60) ev.push(...stepSpot(s, { x: -2.6, y: 0, z: 0.1 * Math.sin(t * 5), on: true }, w, 1 / 60, opts));
  assert.ok(ev.includes('drop'), 'dropped');
});

test('angDiff wraps', () => {
  assert.ok(Math.abs(angDiff(3, -3) - (2 * Math.PI - 6)) < 1e-9);
  assert.ok(REACH > 0);
});
