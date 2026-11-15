// Settings, best scores, lifetime stats and achievements, kept in localStorage.
// Every read and write is guarded: in a private window or with storage blocked the game still
// works, it just forgets on reload.
const KEY = 'spot-light-hd:v1';

export const DEFAULTS = {
  settings: { quality: 'auto', room: 'living', time: 'evening', weather: 'clear', camera: 'room', volume: 0.7, muted: false,
    retro: false, reducedMotion: false, fps: false, pace: 'adult', laser: 'red', steady: 0.5 },
  best: {},
  stats: { distance: 0, pounces: 0, catches: 0, games: 0, seconds: 0, barks: 0, skids: 0, naps: 0, photos: 0, rooms: [] },
  achievements: {},
};

export const ACHIEVEMENTS = [
  ['first_catch', 'Got it!', 'Spot catches the dot for the first time.'],
  ['paws', 'Paws of fury', '50 catches in total.'],
  ['untouchable', 'Untouchable', 'Win Dodge without losing a life.'],
  ['housequake', 'Housequake', '200 points in one game of Lure.'],
  ['retriever', 'Good retriever', 'Bring all five balls back in Fetch.'],
  ['zoomies', 'Zoomies', 'Finish Zoomies in under 35 seconds.'],
  ['ninja', 'Ninja dot', '30 seconds hidden in Hide & seek.'],
  ['dreams', 'Sweet dreams', 'Spot falls asleep in his bed.'],
  ['marathon', 'Marathon lab', 'Spot runs 1 km in total.'],
  ['wall', 'Wall watcher', 'Spot barks at the wall 25 times.'],
  ['drift', 'Drift king', 'Spot skids on the floor 20 times.'],
  ['photo', 'Photographer', 'Save a photo in photo mode.'],
  ['travelled', 'Well travelled', 'Play in all three places.'],
  ['night', 'Night owl', 'Play a game at night.'],
];

const clone = (o) => JSON.parse(JSON.stringify(o));
const merge = (a, b) => { for (const k in b) if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else if (k in a || typeof a === 'object') a[k] = b[k]; return a; };

export function load(storage = globalThis.localStorage) {
  const data = clone(DEFAULTS);
  try { const raw = storage?.getItem(KEY); if (raw) merge(data, JSON.parse(raw)); } catch { /* storage unavailable: defaults */ }
  return data;
}
export function save(data, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
}

// Records a result; returns true when it beats the stored best. lower = true for times.
export function recordBest(data, key, value, lower = false) {
  const old = data.best[key];
  if (old === undefined || (lower ? value < old : value > old)) { data.best[key] = value; return true; }
  return false;
}

// Unlocks an achievement once; returns its [id, title, text] the first time, else null.
export function unlock(data, id) {
  if (data.achievements[id]) return null;
  const a = ACHIEVEMENTS.find(x => x[0] === id);
  if (!a) return null;
  data.achievements[id] = Date.now();
  return a;
}
