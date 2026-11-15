// Spot-light HD: renderer, post-processing, cameras, input, the loop and the UI.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createDog, SPOT } from './dog.js';
import { ROOMS, weather, worldOf } from './rooms.js';
import { setTextureSize } from './textures.js';
import { createLaser } from './laser.js';
import { createAudio } from './audio.js';
import { createGame, MODES, PACE } from './game.js';
import { load, save, unlock, ACHIEVEMENTS } from './store.js';
import { newSpot, stepSpot, boxWorld } from './brain.js';
import { RetroShader, GradeShader } from './shaders.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const DPR = Math.min(window.devicePixelRatio || 1, 2);

export const QUALITY = {
  low: { pr: 1, fur: 6, shadowSize: 1024, shadowRadius: 3, aa: 0, gtao: false, bloom: false, grass: 0, tex: 512, fireShadow: false, lampShadow: false },
  medium: { pr: Math.min(DPR, 1.5), fur: 10, shadowSize: 2048, shadowRadius: 4, aa: 4, gtao: false, bloom: true, grass: 30000, tex: 1024, fireShadow: false, lampShadow: false },
  high: { pr: DPR, fur: 16, shadowSize: 2048, shadowRadius: 5, aa: 4, gtao: true, bloom: true, grass: 70000, tex: 1024, fireShadow: false, lampShadow: true },
  ultra: { pr: Math.min(window.devicePixelRatio || 1, 2.5), fur: 24, shadowSize: 4096, shadowRadius: 6, aa: 8, gtao: true, bloom: true, grass: 140000, tex: 1024, fireShadow: true, lampShadow: true },
};
const LEVELS = ['low', 'medium', 'high', 'ultra'];
const CAMERAS = ['room', 'follow', 'low', 'top'];
const TIMES = ['day', 'evening', 'night'];
const STATE_TEXT = { chase: 'chasing the dot', crouch: 'wiggling his bum…', pounce: 'pounce!', land: 'landing', pin: 'sure it is under his paws', search: 'sniffing for it',
  rear: 'paws up on the wall', bark: 'barking at it', sit: 'sitting, unimpressed', rest: 'off to his bed', sleep: 'fast asleep', pickup: 'picking it up' };

const data = load();
const S = data.settings;
let autoLevel = 'high', autoChecked = 0;
const level = () => (S.quality === 'auto' ? autoLevel : S.quality);

// ---------------------------------------------------------------- renderer
const canvas = $('#c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
} catch {
  $('#loading').innerHTML = '<div id="nogl"><h2>Spot needs WebGL</h2><p>This browser has WebGL turned off or unsupported. Try another browser, or play <a href="classic/index.html" style="color:#fff">Classic Spot-light</a>, which also has a 2D view.</p></div>';
  throw new Error('WebGL unavailable');
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 600);
const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const audio = createAudio();
const laser = createLaser(scene);
laser.setColor(S.laser); laser.steady = S.steady;

let room, world, dog, game, composer, P = {}, controls = null, envTex = null;
let paused = false, photo = false, screen = 'title';
const dot = { x: 0, y: 0, z: 0, on: true };

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 1100); }
function achieve(id) {
  const a = unlock(data, id); if (!a) return;
  $('#achTitle').textContent = a[1]; $('#achText').textContent = a[2];
  const el = $('#achieve'); el.classList.add('on'); clearTimeout(achieve.t); achieve.t = setTimeout(() => el.classList.remove('on'), 3200);
  audio.chime(); save(data);
}

// ---------------------------------------------------------------- building the world
function onStep(i, pos, speed) { if (audio.ready && world) audio.paw(world.surface(pos.x, pos.z), speed); }

function buildWorld() {
  const q = QUALITY[level()];
  if (room) { scene.remove(room.group); room.dispose(); }
  if (dog) scene.remove(dog.group);
  if (game) game.dispose();
  setTextureSize(q.tex);
  room = ROOMS[S.room].build(q);
  scene.add(room.group);
  world = worldOf(room);
  applyTime();
  weather(room, S.weather);
  dog = createDog(SPOT, q.fur, onStep);
  scene.add(dog.group);
  const keep = game?.spot;
  game = createGame({ scene, world, room, audio, data, onEvent });
  if (keep) game.spot.energy = keep.energy;
  renderer.setPixelRatio(q.pr);
  buildComposer(q);
  resize();
  dot.x = 0; dot.z = 0.5;
}

function applyTime() {
  room.setTime(S.time);
  if (room.outdoor) {
    scene.background = null;
    const tmp = new THREE.Scene(); tmp.add(room.sky);
    envTex?.dispose(); envTex = pmrem.fromScene(tmp).texture;
    room.group.add(room.sky);
    scene.environment = envTex;
    scene.environmentIntensity = S.time === 'night' ? 0.04 : S.time === 'evening' ? 0.12 : 0.28;
  } else {
    scene.background = room.background;
    scene.environment = roomEnv;
    scene.environmentIntensity = S.time === 'night' ? 0.05 : S.time === 'evening' ? 0.14 : 0.35;
  }
}

function buildComposer(q) {
  composer?.dispose();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.aa });
  composer = new EffectComposer(renderer, rt);
  P = {};
  composer.addPass(new RenderPass(scene, camera));
  if (q.gtao) { P.gtao = new GTAOPass(scene, camera, size.x, size.y); P.gtao.updateGtaoMaterial({ radius: 0.4, distanceExponent: 1.5, thickness: 1.2, scale: 1.1 }); P.gtao.blendIntensity = 0.85; composer.addPass(P.gtao);
    // GTAO hides points and lines from its normal pass but not sprites or see-through glows; hide those too
    const gtao = P.gtao, orig = gtao._overrideVisibility.bind(gtao);
    gtao._overrideVisibility = () => { orig(); scene.traverse(o => { if ((o.isSprite || o.userData.noAO) && o.visible) { o.visible = false; gtao._visibilityCache.push(o); } }); };
  }
  P.bokeh = new BokehPass(scene, camera, { focus: 3, aperture: 0.004, maxblur: 0.012 }); P.bokeh.enabled = false; composer.addPass(P.bokeh);
  if (q.bloom) { P.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.45, 1.6); composer.addPass(P.bloom); }
  composer.addPass(new OutputPass());
  P.grade = new ShaderPass(GradeShader); composer.addPass(P.grade);
  P.retro = new ShaderPass(RetroShader); P.retro.enabled = S.retro; composer.addPass(P.retro);
  if (!q.aa) { P.fxaa = new FXAAPass(); composer.addPass(P.fxaa); }
}

function resize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer?.setSize(w, h);
  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (P.retro) P.retro.uniforms.resolution.value.set(db.x, db.y);
  if (P.grade) P.grade.uniforms.resolution.value.set(db.x, db.y);
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- game events
function onEvent(type, arg) {
  if (type === 'toast') toast(arg);
  else if (type === 'achieve') achieve(arg);
  else if (type === 'carry') { dog.mouth.add(arg.mesh); arg.mesh.position.set(0, -0.03, 0); arg.mesh.rotation.set(0, 0, 0); audio.ui(); }
  else if (type === 'drop') { scene.add(arg.mesh); }
  else if (type === 'finish') { laser.on = false; $('#hud').hidden = true; toast(arg === 'lost' ? 'Spot got it!' : 'Treat time!'); }
  else if (type === 'over') showOver();
}

function showOver() {
  const r = game.result();
  $('#overTitle').textContent = r.title; $('#overText').textContent = r.text;
  $('#overBest').textContent = r.best ? (r.isBest ? `New best: ${r.best}` : `Best here: ${r.best}`) : '';
  show('#over', true); $('#again').focus();
  document.body.classList.remove('playing');
  save(data);
}

// ---------------------------------------------------------------- input: mouse, touch, keys, gamepad
const pointer = { x: 0, y: 0, active: false };
const keys = new Set();
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const floorPlaneY = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
canvas.addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true; });
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
  if (e.button === 2) toggleLaser();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (e.target.matches?.('input, select')) return;
  audio.unlock();
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) { keys.add(k); pointer.active = false; if (k.startsWith('arrow')) e.preventDefault(); }
  if (screen !== 'play') return;
  if (k === ' ') { e.preventDefault(); toggleLaser(); }
  if (k === 'escape') { if (photo) setPhoto(false); else pause(!paused); }
  if (k === 'c') cycleCamera();
  if (k === 'b') { S.retro = !S.retro; P.retro.enabled = S.retro; syncSettings(); save(data); }
  if (k === 't') { S.time = TIMES[(TIMES.indexOf(S.time) + 1) % 3]; applyTime(); toast(S.time); syncTitle(); save(data); }
  if (k === 'p') setPhoto(!photo);
  if (k === 'm') toggleSound();
  if (k === 'f') { S.fps = !S.fps; $('#fps').hidden = !S.fps; syncSettings(); }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play' && !paused && !photo && game.phase === 'play') pause(true); });

let padPrev = [];
function pollPad(dt) {
  const pad = navigator.getGamepads?.().find(Boolean);
  if (!pad) return [0, 0];
  const b = pad.buttons.map(x => x.pressed), edge = (i) => b[i] && !padPrev[i];
  if (edge(0) || edge(7)) { audio.unlock(); if (screen === 'play') toggleLaser(); }
  if (edge(9) && screen === 'play') pause(!paused);
  if (edge(3) && screen === 'play') cycleCamera();
  padPrev = b;
  const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
  return [dz(pad.axes[0] || 0), dz(pad.axes[1] || 0)];
}

function laserTargets() { return room.group.children; }
function hitAt(sx, sy) {
  ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(laserTargets(), true);
  for (const h of hits) {
    if (h.object.userData.laser === false || !h.object.visible || h.object.isSprite || h.object.isPoints || h.object.isLine) continue;
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    if (n.dot(ray.ray.direction) > 0) n.negate();
    return { point: h.point, normal: n };
  }
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(floorPlaneY, p) ? { point: p, normal: new THREE.Vector3(0, 1, 0) } : null;
}
// Keyboard and gamepad move the dot over the floor; a ray from above finds what it lands on.
const down = new THREE.Raycaster();
down.camera = camera;
function hitBelow(x, z) {
  down.set(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
  for (const h of down.intersectObjects(laserTargets(), true)) {
    if (h.object.userData.laser === false || !h.object.visible || h.object.isSprite || h.object.isPoints || h.object.isLine) continue;
    return { point: h.point, normal: new THREE.Vector3(0, 1, 0) };
  }
  return { point: new THREE.Vector3(x, 0, z), normal: new THREE.Vector3(0, 1, 0) };
}

function steerDot(dt) {
  const [gx, gy] = pollPad(dt);
  const kx = (keys.has('arrowright') || keys.has('d')) - (keys.has('arrowleft') || keys.has('a'));
  const kz = (keys.has('arrowdown') || keys.has('s')) - (keys.has('arrowup') || keys.has('w'));
  const mx = kx + gx, mz = kz + gy;
  let hit = null;
  if (mx || mz) {
    pointer.active = false;
    // move relative to the camera's view of the floor
    const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize(); const r = new THREE.Vector3(-f.z, 0, f.x);
    dot.x = clamp(dot.x + (r.x * mx - f.x * mz) * 3 * dt, -room.hw + 0.05, room.hw - 0.05);
    dot.z = clamp(dot.z + (r.z * mx - f.z * mz) * 3 * dt, -room.hd + 0.05, room.hd - 0.05);
    hit = hitBelow(dot.x, dot.z);
  } else if (pointer.active) hit = hitAt(pointer.x, pointer.y);
  else hit = hitBelow(dot.x, dot.z);
  if (hit) { dot.x = hit.point.x; dot.y = Math.max(0, hit.point.y); dot.z = hit.point.z; }
  return hit;
}

function toggleLaser() {
  laser.on = !laser.on; audio.click();
  $('#tbLaser').textContent = laser.on ? 'Laser off' : 'Laser on';
}

// ---------------------------------------------------------------- cameras
const camPos = new THREE.Vector3(0, 5, 7), camAt = new THREE.Vector3();
let camT = 0;
function cycleCamera() { S.camera = CAMERAS[(CAMERAS.indexOf(S.camera) + 1) % CAMERAS.length]; $('#tbCam').textContent = `Camera: ${S.camera}`; syncSettings(); save(data); }
function updateCamera(dt) {
  camT += dt;
  if (photo && controls) { controls.update(); return; }
  const s = game.spot, R = room, wantPos = new THREE.Vector3(), wantAt = new THREE.Vector3();
  const motion = S.reducedMotion ? 0 : 1;
  if (screen === 'title') {
    const a = camT * 0.06 * motion + 0.6, rr = Math.max(R.hw, R.hd) + 2.5;
    wantPos.set(Math.sin(a) * rr * 0.9, 2.6, Math.cos(a) * rr * 0.75 + 1); wantAt.set(s.x * 0.5, 0.4, s.z * 0.5);
  } else if (S.camera === 'room') {
    const c = R.cams.room;
    wantPos.set(c.pos[0] + Math.sin(camT * 0.15) * 0.3 * motion + s.x * 0.15, c.pos[1], c.pos[2]); wantAt.set(c.at[0] + s.x * 0.2, c.at[1], c.at[2] + s.z * 0.1);
  } else if (S.camera === 'follow') {
    const back = 2.4;
    wantPos.set(s.x - Math.sin(s.h) * back + 0.4, 1.5, s.z - Math.cos(s.h) * back);
    wantPos.x = clamp(wantPos.x, -R.hw + 0.3, R.hw - 0.3); wantPos.z = clamp(wantPos.z, -R.hd + 0.3, R.hd + 2.5);
    wantAt.set((s.x + dot.x) / 2, 0.3, (s.z + dot.z) / 2);
  } else if (S.camera === 'low') {
    wantPos.set(clamp(s.x * 0.5 + 1.2, -R.hw + 0.4, R.hw - 0.4), 0.42, R.hd + 0.3);
    const hp = dog.headPosition(); wantAt.set(hp.x, hp.y * 0.8, hp.z);
  } else { // top
    wantPos.set(0, Math.max(R.hw, R.hd) * 2.6, 0.01); wantAt.set(0, 0, 0);
  }
  const k = screen === 'title' ? 1.5 : S.camera === 'follow' ? 3 : 4;
  camPos.set(damp(camPos.x, wantPos.x, k, dt), damp(camPos.y, wantPos.y, k, dt), damp(camPos.z, wantPos.z, k, dt));
  camAt.set(damp(camAt.x, wantAt.x, k * 1.5, dt), damp(camAt.y, wantAt.y, k * 1.5, dt), damp(camAt.z, wantAt.z, k * 1.5, dt));
  camera.position.copy(camPos); camera.lookAt(camAt);
  camera.fov = S.camera === 'top' && screen !== 'title' ? 35 : S.camera === 'low' ? 50 : 42; camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- photo mode
function setPhoto(on) {
  if (on === photo) return;
  photo = on;
  document.body.classList.toggle('photo', on);
  show('#photoBar', on);
  if (on) {
    controls = new OrbitControls(camera, canvas);
    controls.target.copy(dog.headPosition()); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 0.4; controls.maxDistance = 12;
    P.bokeh.enabled = true; updateBokeh();
  } else {
    controls?.dispose(); controls = null; P.bokeh.enabled = false;
    renderer.toneMappingExposure = room.exposure ?? 1;
  }
}
function updateBokeh() {
  if (!P.bokeh?.enabled) return;
  const a = +$('#pAperture').value;
  P.bokeh.uniforms.focus.value = camera.position.distanceTo(dog.headPosition());
  P.bokeh.uniforms.aperture.value = a * 0.012;
  P.bokeh.uniforms.maxblur.value = a * 0.02;
}
function savePhoto() {
  composer.render();
  canvas.toBlob((b) => {
    if (!b) return toast('Could not save the photo');
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `spot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    data.stats.photos++; achieve('photo'); toast('Photo saved'); save(data);
  }, 'image/png');
}

// ---------------------------------------------------------------- screens
function show(id, on) { $(id).classList.toggle('hidden', !on); }
function startGame(mode) {
  audio.unlock();
  game.start(mode, S);
  screen = 'play'; paused = false; laser.on = true; $('#tbLaser').textContent = 'Laser off';
  document.body.classList.remove('title'); document.body.classList.add('playing');
  show('#title', false); show('#over', false); show('#pause', false);
  $('#hud').hidden = mode === 'relax'; $('#spotPanel').hidden = false; $('#toolbar').hidden = false;
  autoChecked = 0; frameTimes.length = 0;
  canvas.focus();
}
function toTitle() {
  game.stop(); screen = 'title'; paused = false; setPhoto(false);
  show('#pause', false); show('#over', false); show('#title', true);
  $('#hud').hidden = true; $('#spotPanel').hidden = true; $('#toolbar').hidden = true;
  document.body.classList.add('title'); document.body.classList.remove('playing');
  syncTitle(); save(data);
}
function pause(on) {
  if (screen !== 'play' || game.phase !== 'play') return;
  paused = on; show('#pause', on);
  if (on) {
    const g = game;
    $('#pauseText').textContent = g.mode === 'endless' ? `${g.catches} ${g.catches === 1 ? 'catch' : 'catches'} so far. Best dodge ${g.bestStreak.toFixed(0)} s.` : 'Spot is waiting for the dot to come back.';
    $('#resume').focus();
  } else canvas.focus();
}
function toggleSound() { S.muted = !S.muted; audio.setMuted(S.muted); $('#tbSound').textContent = S.muted ? 'Sound off' : 'Sound on'; save(data); }

// title: mode cards, room and time pickers
function bestLabel(mode) {
  const b = data.best[`${mode}:${S.room}`];
  if (b === undefined) return '';
  return { lure: `${b} points`, zoomies: `${b} s`, fetch: `${b} s`, hide: `${b} s hidden`, endless: `${b} s dodge`, dodge: `${b} lives left` }[mode] || '';
}
function syncTitle() {
  $('#modes').innerHTML = Object.entries(MODES).map(([k, m], i) => `<li><button class="mode" data-mode="${k}"><span class="tag">${i + 1}</span><span><b>${m.label}</b><small>${m.blurb}</small>${bestLabel(k) ? `<span class="best">Best here: ${bestLabel(k)}</span>` : ''}</span></button></li>`).join('');
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => startGame(b.dataset.mode)));
  seg('#roomSeg', Object.entries(ROOMS).map(([k, r]) => [k, r.label]), S.room, (v) => { S.room = v; buildWorld(); syncTitle(); save(data); });
  seg('#timeSeg', TIMES.map(t => [t, t[0].toUpperCase() + t.slice(1)]), S.time, (v) => { S.time = v; applyTime(); syncTitle(); save(data); });
}
function seg(sel, items, value, onPick) {
  const el = $(sel);
  el.innerHTML = items.map(([v, l]) => `<button data-v="${v}" aria-pressed="${String(v) === String(value)}">${l}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { audio.unlock(); audio.ui(); onPick(b.dataset.v); }));
}
function syncSettings() {
  $('#sQuality').value = S.quality;
  seg('#camSeg', CAMERAS.map(c => [c, c[0].toUpperCase() + c.slice(1)]), S.camera, (v) => { S.camera = v; $('#tbCam').textContent = `Camera: ${v}`; syncSettings(); save(data); });
  seg('#weatherSeg', [['clear', 'Clear'], ['rain', 'Rain'], ['snow', 'Snow']], S.weather, (v) => { S.weather = v; weather(room, v); syncSettings(); save(data); });
  seg('#paceSeg', Object.keys(PACE).map(p => [p, p[0].toUpperCase() + p.slice(1)]), S.pace, (v) => { S.pace = v; if (game.opts) game.opts.pace = PACE[v]; syncSettings(); save(data); });
  seg('#laserSeg', [['red', 'Red'], ['green', 'Green'], ['violet', 'Violet']], S.laser, (v) => { S.laser = v; laser.setColor(v); syncSettings(); save(data); });
  seg('#retroSeg', [['0', 'Off'], ['1', 'On']], S.retro ? '1' : '0', (v) => { S.retro = v === '1'; if (P.retro) P.retro.enabled = S.retro; syncSettings(); save(data); });
  seg('#motionSeg', [['0', 'Off'], ['1', 'On']], S.reducedMotion ? '1' : '0', (v) => { S.reducedMotion = v === '1'; syncSettings(); save(data); });
  seg('#fpsSeg', [['0', 'Hide'], ['1', 'Show']], S.fps ? '1' : '0', (v) => { S.fps = v === '1'; $('#fps').hidden = !S.fps; syncSettings(); save(data); });
  $('#sSteady').value = S.steady; $('#sVolume').value = S.volume;
}
$('#sQuality').addEventListener('change', (e) => { S.quality = e.target.value; save(data); buildWorld(); });
$('#sSteady').addEventListener('input', (e) => { S.steady = +e.target.value; laser.steady = S.steady; save(data); });
$('#sVolume').addEventListener('input', (e) => { S.volume = +e.target.value; audio.setVolume(S.volume); save(data); });
function openStats() {
  const st = data.stats, km = st.distance >= 1000 ? `${(st.distance / 1000).toFixed(2)} km` : `${Math.round(st.distance)} m`;
  $('#statsGrid').innerHTML = [[km, 'run'], [st.pounces, 'pounces'], [st.catches, 'catches'], [st.games, 'games'], [`${Math.round(st.seconds / 60)} min`, 'played'], [st.naps, 'naps']]
    .map(([v, l]) => `<div><b>${v}</b><small>${l}</small></div>`).join('');
  $('#achGrid').innerHTML = ACHIEVEMENTS.map(([id, t, d]) => `<div class="${data.achievements[id] ? 'got' : ''}"><b>${t}</b>${d}</div>`).join('');
  show('#statsDlg', true);
}
$('#openSettings').addEventListener('click', () => { syncSettings(); show('#settings', true); });
$('#openStats').addEventListener('click', openStats);
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('.dialog').classList.add('hidden')));
document.querySelectorAll('[data-act="title"]').forEach(b => b.addEventListener('click', toTitle));
$('#resume').addEventListener('click', () => pause(false));
$('#restart').addEventListener('click', () => { const m = game.mode; show('#pause', false); startGame(m); });
$('#again').addEventListener('click', () => startGame(game.mode || 'dodge'));
$('#tbPause').addEventListener('click', () => pause(true));
$('#tbLaser').addEventListener('click', toggleLaser);
$('#tbCam').addEventListener('click', cycleCamera);
$('#tbPhoto').addEventListener('click', () => setPhoto(true));
$('#tbSound').addEventListener('click', toggleSound);
$('#pSave').addEventListener('click', savePhoto);
$('#pBack').addEventListener('click', () => setPhoto(false));
$('#pAperture').addEventListener('input', updateBokeh);
$('#pExposure').addEventListener('input', (e) => { renderer.toneMappingExposure = (room.exposure ?? 1) * 2 ** +e.target.value; });
seg('#filterSeg', [['0', 'Natural'], ['1', 'Warm'], ['2', 'Mono'], ['3', 'Film'], ['4', 'Cool']], '0', (v) => { P.grade.uniforms.mode.value = +v; document.querySelectorAll('#filterSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); });

// ---------------------------------------------------------------- loop
const frameTimes = [];
let last = performance.now(), fpsShown = 0, uiT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(0.05, raw);
  const t = now / 1000;

  const live = !paused && !photo;
  let hit = null;
  if (screen === 'play' && !photo) hit = steerDot(dt);
  dot.on = laser.on && screen === 'play' && game.phase === 'play';
  if (live) {
    const ev = game.update(dt, dot);
    for (const e of ev) {
      if (e === 'bark') dog.bark(), audio.bark();
      else if (e === 'skid') audio.skid();
      else if (e === 'pounce') audio.pounce();
      else if (e === 'catch') audio.catch(), audio.land(world.surface(game.spot.x, game.spot.z));
      else if (e === 'miss') audio.land(world.surface(game.spot.x, game.spot.z));
    }
    dog.update(dt, poseFrom(game.spot));
    room.update(dt, t);
  }
  const dim = room.outdoor ? (S.time === 'night' ? 0.8 : 0) : { day: 0.2, evening: 0.55, night: 0.9 }[S.time];
  const origin = camera.position.clone().add(new THREE.Vector3(0.35, -0.45, 0).applyQuaternion(camera.quaternion));
  laser.update(dt, t, hit, origin, dim);
  laser.on = laser.on && (screen === 'play');
  if (screen !== 'play') laser.on = false;

  updateCamera(dt);
  if (!photo) renderer.toneMappingExposure = room.exposure ?? 1;
  else updateBokeh();
  P.grade.uniforms.time.value = t;

  const s = game.spot;
  audio.tick(dt, { pant: s.pant, fire: room.fire ? clamp(1.6 - camera.position.distanceTo(room.fire.position) / 4, 0.1, 1) : 0, rain: room.outdoor && S.weather === 'rain' ? 1 : 0,
    birds: room.outdoor && S.time === 'day' && S.weather === 'clear', sleeping: s.state === 'sleep' });

  composer.render(dt);

  // HUD, a few times a second
  uiT += raw;
  if (uiT > 0.12) {
    uiT = 0;
    if (screen === 'play') {
      const [a, b] = game.hud(); $('#hudMain').textContent = a; $('#hudSub').textContent = b;
      $('#spotState').textContent = s.carrying ? 'carrying it proudly' : STATE_TEXT[s.state] || '';
      $('#energyBar').style.width = `${s.energy.toFixed(0)}%`; $('#happyBar').style.width = `${s.happy.toFixed(0)}%`;
      if (data.stats.distance + s.distance >= 1000) achieve('marathon');
    }
  }
  if (screen === 'play' && live) { data.stats.distance += Math.max(0, s.distance - (s._counted || 0)); s._counted = s.distance; }

  // frame rate and the Auto quality preset
  frameTimes.push(raw); if (frameTimes.length > 120) frameTimes.shift();
  fpsShown += raw;
  if (fpsShown > 0.5) { fpsShown = 0; const avg = frameTimes.reduce((x, y) => x + y, 0) / frameTimes.length; window.__fps = 1 / avg; if (S.fps) $('#fps').textContent = `${(1 / avg).toFixed(0)} fps · ${level()}`; }
  if (S.quality === 'auto' && screen === 'play' && live && frameTimes.length === 120 && autoChecked < 2) {
    autoChecked += raw;
    const avg = frameTimes.reduce((x, y) => x + y, 0) / frameTimes.length;
    if (autoChecked > 1.5 && 1 / avg < 40 && autoLevel !== 'low') {
      autoLevel = LEVELS[LEVELS.indexOf(autoLevel) - 1]; frameTimes.length = 0; autoChecked = 0;
      toast(`Quality: ${autoLevel}`); buildWorld(); game.start(game.mode, S);
    }
  }
}
function poseFrom(s) {
  return { pos: { x: s.x, z: s.z }, heading: s.h, speed: s.speed, pose: s.pose, look: s.look, headDown: s.headDown, sniff: s.sniff, pant: s.pant, wag: s.wag,
    alert: s.alert, crouch: s.crouch, hop: s.hop, air: s.air, rear: s.rear, carrying: s.carrying };
}

// ---------------------------------------------------------------- self-checks (console.assert, like the classic game)
function selfCheck() {
  const w = boxWorld(), a = newSpot(-1, 0); a.h = Math.PI / 2;
  const ev = []; for (let i = 0; i < 150; i++) ev.push(...stepSpot(a, { x: 0.2, y: 0, z: 0, on: true }, w, 1 / 60));
  console.assert(ev.includes('catch'), 'a still dot within reach should be caught');
  console.assert(room.colliders.length > 0 && room.bed, 'the room has furniture and a bed');
  const q = world.clampWalk({ x: 99, z: 99 }); console.assert(Math.abs(q.x) < room.hw && Math.abs(q.z) < room.hd, 'clampWalk keeps targets inside the room');
  const h = hitBelow(0, 0.5); console.assert(h && h.point.y < 0.05, 'the floor is under the middle of the room');
}

// ---------------------------------------------------------------- start
async function boot() {
  const lines = ["Brushing Spot's coat…", 'Laying the floorboards…', 'Lighting the fire…', 'Hiding the treats…'];
  let li = 0; const it = setInterval(() => { $('#loadText').textContent = lines[++li % lines.length]; }, 700);
  await new Promise(r => setTimeout(r, 30));
  audio.setVolume(S.volume); audio.setMuted(S.muted); $('#tbSound').textContent = S.muted ? 'Sound off' : 'Sound on';
  $('#tbCam').textContent = `Camera: ${S.camera}`; $('#fps').hidden = !S.fps;
  buildWorld();
  syncTitle(); syncSettings();
  scene.updateMatrixWorld(true);
  selfCheck();
  renderer.compile(scene, camera);
  clearInterval(it);
  $('#loading').classList.add('done');
  requestAnimationFrame(frame);
  if (location.protocol.startsWith('http') && 'serviceWorker' in navigator && !import.meta.env?.DEV) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// read-only hook for the Playwright smoke test
window.__spot = () => {
  const s = game.spot;
  return { screen, mode: game.mode, phase: game.phase, state: s.state, x: s.x, z: s.z, energy: s.energy, room: S.room, quality: level(), camera: S.camera,
    dot: { ...dot }, score: game.score, catches: game.catches, paused, photo, fps: window.__fps || 0 };
};
window.__spotHD = { startGame, toTitle, setRoom: (r) => { S.room = r; buildWorld(); syncTitle(); }, setQuality: (q) => { S.quality = q; buildWorld(); }, setCamera: (c) => { S.camera = c; }, setTime: (t) => { S.time = t; applyTime(); }, setPhoto, pause, endNow: () => { game.t = 1e6; }, setRetro: (on) => { S.retro = on; P.retro.enabled = on; } };

boot();
