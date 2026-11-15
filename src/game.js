// Game modes, the props they use (cup, sock, balls, checkpoint rings, the treat) and scoring.
// main.js owns the renderer and the loop; this file decides what counts and when a game ends.
import * as THREE from 'three';
import { stepSpot, newSpot } from './brain.js';

export const MODES = {
  dodge: { label: 'Dodge', blurb: '60 seconds, 3 lives. Keep the dot out of his paws.', time: 60 },
  endless: { label: 'Endless', blurb: 'No clock. Count his catches and your longest dodge.', time: 0 },
  lure: { label: 'Lure', blurb: 'Steer him into the cup, the sock and the ball. 90 seconds.', time: 90 },
  fetch: { label: 'Fetch', blurb: 'Point at a ball, then lead him to his bed. Five balls.', time: 150 },
  zoomies: { label: 'Zoomies', blurb: 'Lead him through eight rings as fast as you can.', time: 0 },
  hide: { label: 'Hide & seek', blurb: 'Keep the dot where he can\'t see it. 90 seconds.', time: 90 },
  relax: { label: 'Relax', blurb: 'No score. Play until he is tired and naps by the fire.', time: 0 },
};
export const PACE = { puppy: 0.8, adult: 1, zoomy: 1.2 };

const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);

function makeProp(kind) {
  const g = new THREE.Group();
  if (kind === 'cup') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.1, 24, 1, true), phys({ color: 0xf3efe6, roughness: 0.15, clearcoat: 1, side: THREE.DoubleSide }));
    body.position.y = 0.05;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.038, 24), body.material); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.002;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 16, Math.PI * 1.2), body.material); handle.position.set(0.048, 0.055, 0); handle.rotation.z = -Math.PI * 0.6;
    const tea = new THREE.Mesh(new THREE.CircleGeometry(0.042, 24), std({ color: 0x5a2e14, roughness: 0.1 })); tea.rotation.x = -Math.PI / 2; tea.position.y = 0.085;
    g.add(body, bottom, handle, tea);
  } else if (kind === 'sock') {
    const m = std({ color: 0xd8d4cc, roughness: 1 });
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.14, 4, 10), m); leg.rotation.z = Math.PI / 2; leg.position.y = 0.025; leg.scale.y = 1;
    const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.07, 4, 10), m); foot.position.set(0.1, 0.025, 0.05); foot.rotation.x = Math.PI / 2;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 12), std({ color: 0xc81d1d, roughness: 1 })); stripe.rotation.z = Math.PI / 2; stripe.position.set(-0.08, 0.025, 0);
    g.add(leg, foot, stripe);
  } else if (kind === 'ball') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.034, 24, 16), std({ color: 0xcde04a, roughness: 0.9 }));
    m.position.y = 0.034;
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.002, 6, 40), std({ color: 0xf4f4ee, roughness: 1 })); seam.position.y = 0.034; seam.rotation.set(1.2, 0.4, 0);
    g.add(m, seam);
  } else if (kind === 'treat') {
    const m = std({ color: 0xb98a52, roughness: 0.8 });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 10), m); bar.rotation.z = Math.PI / 2; bar.position.y = 0.014;
    g.add(bar);
    for (const s of [-1, 1]) for (const t of [-1, 1]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), m); k.position.set(s * 0.042, 0.014, t * 0.01); g.add(k); }
  } else if (kind === 'ring') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 10, 48), std({ color: 0x40d0ff, emissive: 0x40d0ff, emissiveIntensity: 2.5, transparent: true, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    g.add(ring);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.laser = false; } });
  return g;
}

export function createGame({ scene, world, room, audio, data, onEvent }) {
  const G = {
    mode: null, running: false, phase: 'idle', t: 0, lives: 3, score: 0, catches: 0, streak: 0, bestStreak: 0,
    hidden: 0, delivered: 0, ring: 0, rings: [], props: [], treat: null, spot: newSpot(room.spawn.x, room.spawn.z), opts: {},
  };
  const group = new THREE.Group(); scene.add(group);

  // a free spot on the floor, away from furniture and from Spot
  function freeSpot(minFromSpot = 1.2) {
    for (let i = 0; i < 60; i++) {
      const p = { x: (Math.random() * 2 - 1) * (room.hw - 0.6), z: (Math.random() * 2 - 1) * (room.hd - 0.6) };
      const q = world.clampWalk(p);
      if (Math.hypot(q.x - p.x, q.z - p.z) > 0.01) continue;
      if (Math.hypot(p.x - G.spot.x, p.z - G.spot.z) < minFromSpot) continue;
      if (room.bed && Math.hypot(p.x - room.bed.x, p.z - room.bed.z) < 0.8) continue;
      return p;
    }
    return { x: 0, z: 0 };
  }
  function addProp(kind, at = freeSpot()) {
    const mesh = makeProp(kind); mesh.position.set(at.x, 0, at.z); mesh.rotation.y = Math.random() * 6.28; group.add(mesh);
    const p = { id: kind + G.props.length, kind, mesh, x: at.x, z: at.z, vx: 0, vz: 0, down: false, t: 0, spin: 0 };
    G.props.push(p);
    return p;
  }
  function clear() { G.props.forEach(p => group.remove(p.mesh)); G.props = []; G.rings.forEach(r => group.remove(r)); G.rings = []; if (G.treat) group.remove(G.treat.mesh); G.treat = null; }

  G.start = (mode, settings) => {
    if (!MODES[mode]) return;
    clear();
    const keep = G.spot;
    Object.assign(G, { mode, running: true, phase: 'play', t: 0, lives: 3, score: 0, catches: 0, streak: 0, bestStreak: 0, hidden: 0, delivered: 0, ring: 0 });
    G.spot = newSpot(room.spawn.x, room.spawn.z);
    G.spot.energy = Math.max(60, keep?.energy ?? 100);
    G.opts = { pace: PACE[settings.pace] ?? 1, relax: mode === 'relax', noPounce: mode === 'zoomies' || mode === 'fetch' };
    if (mode === 'lure') ['cup', 'sock', 'ball', 'cup'].forEach(k => addProp(k));
    if (mode === 'fetch') for (let i = 0; i < 2; i++) addProp('ball');
    if (mode === 'zoomies') for (let i = 0; i < 8; i++) { const r = makeProp('ring'); const p = freeSpot(0); r.position.set(p.x, 0, p.z); r.visible = i === 0; group.add(r); G.rings.push(r); }
    data.stats.games++;
    if (!data.stats.rooms.includes(room.name)) data.stats.rooms.push(room.name);
    if (data.stats.rooms.length >= 3) onEvent('achieve', 'travelled');
    if (settings.time === 'night') onEvent('achieve', 'night');
  };
  G.stop = () => { clear(); G.running = false; G.phase = 'idle'; G.mode = null; };

  // End of a game: Spot always gets a treat, because a laser game with no win frustrates a dog.
  function finish(why) {
    G.phase = 'treat'; G.endWhy = why; G.treatT = 0;
    const s = G.spot, p = world.clampWalk({ x: s.x + Math.sin(s.h) * 1.1, z: s.z + Math.cos(s.h) * 1.1 });
    G.treat = { id: 'treat', x: p.x, z: p.z, mesh: makeProp('treat') }; G.treat.mesh.position.set(p.x, 0, p.z); group.add(G.treat.mesh);
    onEvent('finish', why);
  }

  G.update = (dt, dot) => {
    const s = G.spot;
    let opts = G.opts, target = dot;
    if (G.phase === 'treat') {
      G.treatT += dt;
      target = { x: G.treat.x, y: 0, z: G.treat.z, on: true };
      opts = { ...G.opts, noPounce: true, pickups: [G.treat] };
    } else if (G.mode === 'fetch') {
      opts = { ...G.opts, pickups: G.props.filter(p => !p.carried && !p.home), dropZone: room.bed && { ...room.bed, r: room.bed.r + 0.1 } };
    }
    const ev = G.running || G.phase === 'treat' ? stepSpot(s, target, world, dt, opts) : stepSpot(s, { ...dot, on: false }, world, dt, { relax: true });
    if (!G.running && G.phase !== 'treat') return ev;

    for (const e of ev) {
      if (e === 'catch') {
        G.catches++; data.stats.catches++;
        onEvent('achieve', 'first_catch'); if (data.stats.catches >= 50) onEvent('achieve', 'paws');
        if (G.mode === 'dodge') { G.lives--; onEvent('toast', G.lives > 0 ? `Spot got it! ${G.lives} ${G.lives === 1 ? 'life' : 'lives'} left` : 'Spot got it!'); }
        else if (G.mode === 'endless') { G.streak = 0; onEvent('toast', 'Spot got it!'); }
        else if (G.mode === 'hide') { G.hidden = Math.max(0, G.hidden - 5); onEvent('toast', 'Found it! −5 s'); }
      }
      if (e === 'bark') { data.stats.barks++; if (data.stats.barks >= 25) onEvent('achieve', 'wall'); }
      if (e === 'skid') { data.stats.skids++; if (data.stats.skids >= 20) onEvent('achieve', 'drift'); }
      if (e === 'sleep') { data.stats.naps++; onEvent('achieve', 'dreams'); }
      if (e === 'pounce') data.stats.pounces++;
      if (e === 'pickup') {
        if (G.phase === 'treat') { group.remove(G.treat.mesh); s.carrying = null; audio.crunch(); s.happy = 100; G.phase = 'over'; G.running = false; onEvent('over', G.endWhy); return ev; }
        const p = G.props.find(q => q.id === s.carrying); if (p) { p.carried = true; onEvent('carry', p); }
      }
      if (e === 'drop' && G.mode === 'fetch') {
        const p = G.props.find(q => q.id === s.dropped);
        if (p) {
          p.carried = false; p.home = true; G.delivered++; G.score = G.delivered; onEvent('drop', p); onEvent('toast', `Good boy! ${G.delivered} of 5`); audio.chime();
          const bed = room.bed; p.x = bed.x + (Math.random() - 0.5) * 0.3; p.z = bed.z + (Math.random() - 0.5) * 0.3; p.mesh.position.set(p.x, 0.04, p.z);
          if (G.delivered >= 5) { onEvent('achieve', 'retriever'); finish('fetched'); }
          else if (G.props.filter(q => !q.home).length < 2) addProp('ball');
        }
      }
    }
    if (G.phase !== 'play') { if (G.phase === 'treat' && G.treatT > 6) { G.phase = 'over'; G.running = false; onEvent('over', G.endWhy); } return ev; }

    G.t += dt;
    data.stats.seconds += dt;
    const M = MODES[G.mode];

    if (G.mode === 'endless' || G.mode === 'dodge') {
      if (s.state !== 'pin') { G.streak += dt; G.bestStreak = Math.max(G.bestStreak, G.streak); }
      if (G.mode === 'dodge' && G.lives <= 0) return finish('lost'), ev;
    }
    if (G.mode === 'hide' && dot.on && !world.sees(s.x, s.z, dot.x, dot.y, dot.z)) { G.hidden += dt; G.score = Math.floor(G.hidden); if (G.hidden >= 30) onEvent('achieve', 'ninja'); }
    if (G.mode === 'lure') stepProps(dt);
    if (G.mode === 'fetch') G.props.forEach(p => { if (p.carried) { p.x = s.x; p.z = s.z; } });
    if (G.mode === 'zoomies') {
      const r = G.rings[G.ring];
      if (r) {
        r.rotation.y += dt;
        r.children[0].material.emissiveIntensity = 2 + Math.sin(G.t * 8);
        if (Math.hypot(s.x - r.position.x, s.z - r.position.z) < 0.45) {
          r.visible = false; G.ring++; audio.chime();
          if (G.rings[G.ring]) G.rings[G.ring].visible = true;
          else { if (G.t < 35) onEvent('achieve', 'zoomies'); return finish('rings'), ev; }
        }
      }
    }
    if (M.time && G.t >= M.time) {
      if (G.mode === 'dodge' && G.lives === 3) onEvent('achieve', 'untouchable');
      if (G.mode === 'lure' && G.score >= 200) onEvent('achieve', 'housequake');
      finish('time');
    }
    return ev;
  };

  // Lure: Spot runs into things and knocks them flying
  function stepProps(dt) {
    const s = G.spot;
    for (const p of G.props) {
      p.t += dt;
      if (p.down) {
        p.x += p.vx * dt; p.z += p.vz * dt;
        const fr = p.kind === 'ball' ? 0.8 : 4;
        p.vx *= Math.exp(-fr * dt); p.vz *= Math.exp(-fr * dt);
        const q = { x: p.x, z: p.z, vx: p.vx, vz: p.vz }; world.collide(q, 0.05); if (q.x !== p.x) p.vx *= -0.6; if (q.z !== p.z) p.vz *= -0.6; p.x = q.x; p.z = q.z;
        p.mesh.position.set(p.x, 0, p.z);
        if (p.kind === 'cup') p.mesh.rotation.z = Math.min(Math.PI / 2, p.mesh.rotation.z + dt * 9);
        if (p.kind === 'ball') { p.spin += Math.hypot(p.vx, p.vz) * dt / 0.034; p.mesh.children.forEach(c => { c.rotation.x = p.spin; }); }
        if (p.t > 3.5) { // tidied up and put somewhere else
          const at = freeSpot(); Object.assign(p, { x: at.x, z: at.z, vx: 0, vz: 0, down: false, t: 0 });
          p.mesh.position.set(at.x, 0, at.z); p.mesh.rotation.set(0, Math.random() * 6.28, 0);
        }
        continue;
      }
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < 0.42 && (s.speed > 0.8 || s.state === 'pounce')) {
        const k = Math.max(1.5, s.speed) * (p.kind === 'ball' ? 1.4 : 0.6);
        p.vx = (p.x - s.x) / Math.max(d, 0.01) * k + s.vx * 0.3; p.vz = (p.z - s.z) / Math.max(d, 0.01) * k + s.vz * 0.3;
        p.down = true; p.t = 0;
        const pts = { cup: 30, sock: 10, ball: 20 }[p.kind];
        G.score += pts; audio.knock(p.kind); onEvent('toast', `+${pts} ${p.kind}`);
      }
    }
  }

  G.hud = () => {
    const M = MODES[G.mode] || {}, left = M.time ? Math.max(0, M.time - G.t) : 0;
    const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
    switch (G.mode) {
      case 'dodge': return [`${'♥'.repeat(Math.max(0, G.lives))}${'♡'.repeat(3 - Math.max(0, G.lives))}`, `${clock(left)} left · dodge ${G.streak.toFixed(0)} s`];
      case 'endless': return [`${G.catches} ${G.catches === 1 ? 'catch' : 'catches'}`, `dodge ${G.streak.toFixed(0)} s · best ${G.bestStreak.toFixed(0)} s`];
      case 'lure': return [`${G.score} points`, `${clock(left)} left`];
      case 'fetch': return [`${G.delivered} of 5 balls`, `${clock(left)} left${G.spot.carrying ? ' · now lead him to his bed' : ''}`];
      case 'zoomies': return [`ring ${Math.min(G.ring + 1, 8)} of 8`, `${G.t.toFixed(1)} s`];
      case 'hide': return [`${Math.floor(G.hidden)} s hidden`, `${clock(left)} left`];
      default: return ['', ''];
    }
  };

  // The result card text and the stored best
  G.result = () => {
    const m = G.mode, n = (k) => k;
    const lines = {
      dodge: G.endWhy === 'time' ? ['You kept it away', `60 seconds with ${G.lives} ${G.lives === 1 ? 'life' : 'lives'} left.`] : ['Spot got it', `Three catches in ${Math.floor(G.t)} seconds.`],
      endless: ['Game over', `${G.catches} catches, longest dodge ${G.bestStreak.toFixed(0)} s.`],
      lure: ['Time\'s up', `${G.score} points.`],
      fetch: G.delivered >= 5 ? ['All five balls home', `In ${G.t.toFixed(1)} seconds.`] : ['Time\'s up', `${G.delivered} of 5 balls brought back.`],
      zoomies: ['Zoomies!', `Eight rings in ${G.t.toFixed(1)} seconds.`],
      hide: ['Time\'s up', `The dot stayed hidden for ${Math.floor(G.hidden)} seconds.`],
    }[m] || ['', ''];
    let best = null, isBest = false;
    if (m === 'zoomies' && G.endWhy === 'rings') { isBest = rb(`zoomies:${room.name}`, +G.t.toFixed(1), true); best = `${data.best[`zoomies:${room.name}`]} s`; }
    else if (m === 'fetch' && G.delivered >= 5) { isBest = rb(`fetch:${room.name}`, +G.t.toFixed(1), true); best = `${data.best[`fetch:${room.name}`]} s`; }
    else if (m === 'lure') { isBest = rb(`lure:${room.name}`, G.score); best = `${data.best[`lure:${room.name}`]} points`; }
    else if (m === 'hide') { isBest = rb(`hide:${room.name}`, Math.floor(G.hidden)); best = `${data.best[`hide:${room.name}`]} s`; }
    else if (m === 'endless') { isBest = rb(`endless:${room.name}`, +G.bestStreak.toFixed(0)); best = `${data.best[`endless:${room.name}`]} s dodge`; }
    else if (m === 'dodge' && G.endWhy === 'time') { isBest = rb(`dodge:${room.name}`, G.lives); best = `${data.best[`dodge:${room.name}`]} lives left`; }
    void n;
    return { title: lines[0], text: lines[1] + ' He got a treat for playing so well.', best, isBest };
  };
  function rb(key, v, lower) { const old = data.best[key]; if (old === undefined || (lower ? v < old : v > old)) { data.best[key] = v; return true; } return false; }

  G.dispose = () => { clear(); scene.remove(group); };
  return G;
}
