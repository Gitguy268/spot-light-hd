import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, save, recordBest, unlock, DEFAULTS } from './store.js';

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('settings round-trip and keep defaults for new keys', () => {
  const s = mem(), d = load(s);
  d.settings.room = 'cabin'; d.stats.distance = 12.5;
  assert.ok(save(d, s));
  const e = load(s);
  assert.equal(e.settings.room, 'cabin');
  assert.equal(e.stats.distance, 12.5);
  assert.equal(e.settings.volume, DEFAULTS.settings.volume);
});

test('broken storage falls back to defaults', () => {
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(load(bad).settings.quality, 'auto');
  assert.equal(save(load(bad), bad), false);
});

test('best scores: higher wins, or lower for times', () => {
  const d = load(mem());
  assert.ok(recordBest(d, 'lure', 100)); assert.ok(!recordBest(d, 'lure', 90)); assert.ok(recordBest(d, 'lure', 120));
  assert.ok(recordBest(d, 'zoomies', 40, true)); assert.ok(recordBest(d, 'zoomies', 33, true)); assert.ok(!recordBest(d, 'zoomies', 50, true));
});

test('achievements unlock once', () => {
  const d = load(mem());
  assert.ok(unlock(d, 'first_catch'));
  assert.equal(unlock(d, 'first_catch'), null);
  assert.equal(unlock(d, 'nope'), null);
});
