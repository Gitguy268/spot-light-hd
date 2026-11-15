// Spot's brain: what he wants and how he moves. Plain maths with no three.js import, so Node can
// test it. Room coordinates in metres: x across, z in depth, y up. Heading h: forward is
// (sin h, cos h), the same convention as the dog model.
//
// States: chase -> crouch (butt wiggle) -> pounce -> land -> pin (sniffs the paw he caught it under)
//         search (dot off or out of sight), rear (dot low on a wall), bark (dot out of reach),
//         sit (bored of a dot that doesn't move), rest -> sleep (tired), pickup (fetch).

export const REACH = 0.5;     // body centre to front paws
export const PAW_R = 0.3;     // how close the paws must land to the dot to count as a catch
export const FLOOR_Y = 0.12;  // a dot higher than this is not on the floor
const CROUCH_T = 0.42, POUNCE_T = 0.4, LAND_T = 0.32, PIN_T = 1.2;
const VMAX = 4.6;             // m/s, a lab at full tilt in a living room
const ACCEL = 9;              // m/s^2

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
const headingTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

// Grip per floor: on wood he skids round corners, on a rug or grass he turns on the spot.
export const GRIP = { wood: 3.2, tile: 2.6, rug: 11, grass: 9, snow: 5, stone: 6 };

export function newSpot(x = -1.6, z = 0.6) {
  return {
    x, z, vx: 0, vz: 0, h: 0, speed: 0, state: 'chase', t: 0,
    energy: 100, happy: 60, still: 0, lastDot: null, lastSeen: null,
    fx: 0, fz: 0, tx: 0, tz: 0, caught: false, barkT: 0, skidT: 0, seed: 1,
    // pose for the dog model
    pose: 'stand', look: null, headDown: 0, sniff: false, pant: 0, wag: 0.5, alert: 0,
    crouch: 0, hop: 0, air: 0, rear: 0, carrying: null,
    // stats
    distance: 0, pounces: 0, catches: 0,
  };
}

const go = (s, state) => { s.state = state; s.t = 0; };
const rnd = s => (s.seed = (s.seed * 16807) % 2147483647) / 2147483647;

// world: { collide(s, r), surface(x, z), sees(ax, az, bx, by, bz), clampWalk(p), bed: {x, z, r} }
// dot:   { x, y, z, on }
// opts:  { pace (difficulty, 1 = normal), relax, noPounce, pickups: [{id, x, z}], dropZone: {x, z, r} }
// Returns a list of events: catch, miss, pounce, bark, skid, pickup, drop, sleep, wake.
export function stepSpot(s, dot, world, dt, opts = {}) {
  const ev = [];
  const pace = opts.pace ?? 1;
  s.t += dt;

  // What he knows about the dot
  const moved = s.lastDot ? dist(dot.x, dot.z, s.lastDot.x, s.lastDot.z) + Math.abs(dot.y - s.lastDot.y) : 1;
  s.still = dot.on && moved < 0.004 ? s.still + dt : 0;
  s.lastDot = { x: dot.x, y: dot.y, z: dot.z };
  const sees = dot.on && world.sees(s.x, s.z, dot.x, dot.y, dot.z);
  if (sees) s.lastSeen = { x: dot.x, y: dot.y, z: dot.z, t: 0 };
  else if (s.lastSeen) s.lastSeen.t += dt;
  const onFloor = dot.y < FLOOR_Y;
  const goal = world.clampWalk({ x: dot.x, z: dot.z });
  const d = dist(s.x, s.z, goal.x, goal.z);
  const facing = Math.abs(angDiff(s.h, headingTo(s.x, s.z, goal.x, goal.z)));

  // Defaults, overridden per state
  let want = null, wantSpeed = 0, turnRate = 8, look = sees ? s.lastSeen : null;
  s.crouch = 0; s.sniff = false; s.headDown = 0; s.rear = 0; s.alert = Math.max(0, s.alert - dt);
  if (s.state !== 'pounce') { s.hop = 0; s.air = Math.max(0, s.air - dt * 6); }
  if (!['sit', 'rest', 'sleep'].includes(s.state)) s.pose = 'stand';
  const energyK = 0.55 + 0.45 * (s.energy / 100);
  const vmax = VMAX * pace * energyK;

  const towards = (x, z, speed) => { want = headingTo(s.x, s.z, x, z); wantSpeed = speed; };

  // Tired: go and lie down (in relax mode, or when he has nothing left)
  if ((opts.relax && s.energy < 25 || s.energy < 6) && !['rest', 'sleep', 'pounce', 'land'].includes(s.state)) go(s, 'rest');

  switch (s.state) {
    case 'chase': {
      if (!sees) { go(s, s.lastSeen ? 'search' : 'sit'); break; }
      // Fetch: the dot on a toy means "get that"
      const toy = !s.carrying && opts.pickups?.find(p => dist(p.x, p.z, dot.x, dot.z) < 0.35);
      if (toy) {
        towards(toy.x, toy.z, vmax * clamp((dist(s.x, s.z, toy.x, toy.z) - 0.1) / 0.8, 0.25, 1));
        if (dist(s.x, s.z, toy.x, toy.z) < 0.42) { s.tx = toy.x; s.tz = toy.z; s.toy = toy.id; go(s, 'pickup'); }
        break;
      }
      if (!onFloor) {
        if (dot.y < 1.5 && d < 0.85) { go(s, 'rear'); break; }
        if (d < 1.4) { go(s, 'bark'); break; }
      }
      if (s.still > 3.2 && d > 1.6 && onFloor) { go(s, 'sit'); break; }
      towards(goal.x, goal.z, vmax * clamp((d - 0.3) / 1.1, 0, 1) * (facing < 0.6 ? 1 : 0.5));
      turnRate = 9 - 4 * clamp(s.speed / VMAX, 0, 1); // a fast dog turns wide
      if (onFloor && !s.carrying && !opts.noPounce && d < 1.45 && d > 0.25 && facing < 0.35 && s.energy > 10) go(s, 'crouch');
      break;
    }
    case 'crouch': {
      s.crouch = 1; s.alert = 1;
      want = headingTo(s.x, s.z, goal.x, goal.z); turnRate = 5;
      if (!sees || !onFloor) { go(s, 'chase'); break; }
      if (s.t > CROUCH_T / pace) {
        const lunge = clamp(d - REACH, 0, 1.6);
        s.fx = s.x; s.fz = s.z;
        s.tx = s.x + Math.sin(s.h) * lunge; s.tz = s.z + Math.cos(s.h) * lunge;
        s.pounces++;
        go(s, 'pounce'); ev.push('pounce');
      }
      break;
    }
    case 'pounce': {
      const p = Math.min(1, s.t / POUNCE_T), e = 1 - (1 - p) * (1 - p);
      const px = s.fx + (s.tx - s.fx) * e, pz = s.fz + (s.tz - s.fz) * e;
      s.distance += dist(s.x, s.z, px, pz);
      s.x = px; s.z = pz; s.vx = s.vz = 0;
      s.hop = 0.3 * Math.sin(Math.PI * p); s.air = Math.sin(Math.PI * Math.min(1, p * 1.15));
      world.collide(s, 0.3);
      if (p >= 1) {
        s.hop = 0;
        const pawX = s.x + Math.sin(s.h) * REACH, pawZ = s.z + Math.cos(s.h) * REACH;
        s.caught = dot.on && onFloor && dist(pawX, pawZ, dot.x, dot.z) < PAW_R;
        if (s.caught) { s.catches++; s.happy = clamp(s.happy + 14, 0, 100); ev.push('catch'); }
        else { s.happy = clamp(s.happy - 3, 0, 100); ev.push('miss'); }
        s.energy = clamp(s.energy - 1.5, 0, 100);
        go(s, 'land');
      }
      break;
    }
    case 'land':
      if (s.t > LAND_T) go(s, s.caught ? 'pin' : 'chase');
      break;
    case 'pin': // sniffs where his paws landed, sure the dot is under them
      s.headDown = 1; s.sniff = true; s.wag = Math.min(1, s.wag + dt);
      look = { x: s.x + Math.sin(s.h) * REACH, y: 0, z: s.z + Math.cos(s.h) * REACH };
      if (s.t > PIN_T) go(s, 'chase');
      break;
    case 'search': {
      if (sees) { go(s, 'chase'); break; }
      s.sniff = true; s.headDown = 0.6;
      const L = s.lastSeen;
      if (L && dist(s.x, s.z, L.x, L.z) > 0.5) towards(L.x, L.z, 1.4 * pace);
      else look = { x: s.x + Math.sin(s.h + Math.sin(s.t * 2) * 1.4) * 2, y: 0.5, z: s.z + Math.cos(s.h + Math.sin(s.t * 2) * 1.4) * 2 };
      if (s.t > 6) go(s, 'sit');
      break;
    }
    case 'rear': // front paws on the wall, nose at the dot
      s.rear = 1; s.alert = 1;
      want = headingTo(s.x, s.z, goal.x, goal.z); turnRate = 4;
      if (d > 0.35) wantSpeed = 0.8;
      s.barkT -= dt;
      if (s.barkT <= 0) { ev.push('bark'); s.barkT = 0.9 + rnd(s) * 0.8; }
      if (!sees || onFloor || dot.y > 1.6 || d > 1.2) go(s, 'chase');
      break;
    case 'bark':
      s.alert = 1;
      want = headingTo(s.x, s.z, goal.x, goal.z); turnRate = 5;
      s.barkT -= dt;
      if (s.barkT <= 0) { ev.push('bark'); s.barkT = 1.1 + rnd(s); }
      if (!sees || onFloor || d > 1.8) go(s, 'chase');
      break;
    case 'sit':
      s.pose = 'sit';
      if (sees && s.still === 0 && s.t > 0.5) go(s, 'chase');
      else if (!sees && s.t > 3) look = null;
      break;
    case 'pickup':
      s.headDown = 1; want = headingTo(s.x, s.z, s.tx, s.tz); turnRate = 6;
      if (s.t > 0.45) { s.carrying = s.toy; ev.push('pickup'); go(s, 'chase'); }
      break;
    case 'rest': { // walk to the bed, turn around, lie down
      const bed = world.bed;
      if (bed && dist(s.x, s.z, bed.x, bed.z) > bed.r * 0.6) { s.pose = 'stand'; towards(bed.x, bed.z, 1.3); look = { x: bed.x, y: 0, z: bed.z }; }
      else {
        s.pose = 'lie'; look = null;
        if (s.t > 2.5) { go(s, 'sleep'); ev.push('sleep'); }
      }
      if (!opts.relax && s.energy > 30 && sees && s.still === 0) go(s, 'chase');
      break;
    }
    case 'sleep':
      s.pose = 'sleep'; look = null;
      s.energy = clamp(s.energy + 7 * dt, 0, 100);
      if (s.energy > 75 && sees && s.still === 0 && dist(s.x, s.z, dot.x, dot.z) < 2.5) { go(s, 'chase'); ev.push('wake'); }
      break;
  }

  // Drop a carried toy in the drop zone (fetch)
  if (s.carrying && opts.dropZone && dist(s.x, s.z, opts.dropZone.x, opts.dropZone.z) < opts.dropZone.r) {
    ev.push('drop'); s.dropped = s.carrying; s.carrying = null; s.happy = clamp(s.happy + 8, 0, 100);
  }

  // Steering with grip: the velocity chases the wanted velocity, slowly on a slippery floor
  if (s.state !== 'pounce') {
    if (want !== null) s.h += clamp(angDiff(s.h, want), -turnRate * dt, turnRate * dt);
    // drive: the speed he is trying to run at. The velocity follows it fast along his heading and
    // slowly sideways, so on wood a sharp turn at speed turns into a skid.
    s.drive = clamp((s.drive ?? 0) + clamp(wantSpeed - (s.drive ?? 0), -ACCEL * 1.6 * dt, ACCEL * dt), 0, VMAX * 1.2);
    const fx = Math.sin(s.h), fz = Math.cos(s.h);
    const along = s.vx * fx + s.vz * fz, sx = s.vx - along * fx, sz = s.vz - along * fz;
    const grip = GRIP[world.surface(s.x, s.z)] ?? 6;
    const newAlong = along + (s.drive - along) * (1 - Math.exp(-14 * dt));
    const side = Math.exp(-grip * dt);
    s.vx = fx * newAlong + sx * side; s.vz = fz * newAlong + sz * side;
    const slip = Math.hypot(sx, sz);
    s.skidT -= dt;
    if (slip > 1.1 && s.skidT <= 0) { ev.push('skid'); s.skidT = 0.6; }
    s.x += s.vx * dt; s.z += s.vz * dt;
    world.collide(s, 0.3);
    if (s.state === 'pin' || s.state === 'land') s.drive = 0;
  }
  s.speed = s.state === 'pounce' ? dist(s.fx, s.fz, s.tx, s.tz) / POUNCE_T : Math.hypot(s.vx, s.vz);
  if (s.state !== 'pounce') s.distance += s.speed * dt;

  // Body: energy, panting, wagging
  const effort = clamp(s.speed / VMAX, 0, 1);
  if (s.state !== 'sleep') s.energy = clamp(s.energy - effort * 0.75 * dt + (s.speed < 0.3 ? 2.2 * dt : 0), 0, 100);
  const pantWant = clamp(effort * 0.9 + (1 - s.energy / 100) * 0.6, 0, 1) * (s.state === 'sleep' ? 0 : 1);
  s.pant += (pantWant - s.pant) * Math.min(1, dt * (pantWant > s.pant ? 0.8 : 0.25));
  s.happy = clamp(s.happy - dt * 0.15, 0, 100);
  if (s.state !== 'pin') s.wag += ((0.25 + 0.75 * s.happy / 100) - s.wag) * Math.min(1, dt * 2);
  s.look = look;
  return ev;
}

// The view the dog model needs
export function poseOf(s) {
  return {
    pos: { x: s.x, z: s.z }, heading: s.h, speed: s.speed, pose: s.pose, look: s.look, headDown: s.headDown,
    sniff: s.sniff, pant: s.pant, wag: s.wag, alert: s.alert, crouch: s.crouch, hop: s.hop, air: s.air,
    rear: s.rear, carrying: s.carrying,
  };
}

// An empty rectangular room, for tests and as the fallback world
export function boxWorld(hw = 3.5, hd = 2.5, surface = 'wood') {
  return {
    collide(s, r) { s.x = clamp(s.x, -hw + r, hw - r); s.z = clamp(s.z, -hd + r, hd - r); },
    surface: () => surface,
    sees: () => true,
    clampWalk: p => ({ x: clamp(p.x, -hw + 0.3, hw - 0.3), z: clamp(p.z, -hd + 0.3, hd - 0.3) }),
    bed: { x: hw - 0.6, z: hd - 0.6, r: 0.5 },
  };
}
