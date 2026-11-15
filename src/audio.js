// All sound is synthesised with Web Audio at run time: no sound files. Paws on wood, rug, grass
// and stone, panting, barks, the collar tag, claws skidding, the fire, rain and birds.
export function createAudio() {
  let ctx = null, master = null, noise = null, volume = 0.7, muted = false;
  let pantGain, pantFilter, pantLfo, fireGain, rainGain, birdsOn = false, fireLevel = 0;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : volume; master.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noise = buf;
    // Panting: looping noise through a mouth-like band-pass, gated by a breathing LFO
    const p = loopNoise(); pantFilter = ctx.createBiquadFilter(); pantFilter.type = 'bandpass'; pantFilter.frequency.value = 1300; pantFilter.Q.value = 0.9;
    pantGain = ctx.createGain(); pantGain.gain.value = 0;
    const gate = ctx.createGain(); gate.gain.value = 0;
    pantLfo = ctx.createOscillator(); pantLfo.frequency.value = 3; const lfoAmp = ctx.createGain(); lfoAmp.gain.value = 0.5;
    const dc = ctx.createConstantSource(); dc.offset.value = 0.5;
    pantLfo.connect(lfoAmp).connect(gate.gain); dc.connect(gate.gain); pantLfo.start(); dc.start();
    p.connect(pantFilter).connect(gate).connect(pantGain).connect(master);
    // Fire: crackle impulses are scheduled in tick(); this is the low roar under them
    const f = loopNoise(); const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 320;
    fireGain = ctx.createGain(); fireGain.gain.value = 0; f.connect(fl).connect(fireGain).connect(master);
    // Rain
    const r = loopNoise(); const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 900;
    rainGain = ctx.createGain(); rainGain.gain.value = 0; r.connect(rf).connect(rainGain).connect(master);
    return true;
  }
  function loopNoise() { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(0, Math.random() * 1.5); return s; }

  // A short burst of filtered noise
  function burst({ type = 'bandpass', freq = 2000, q = 1, dur = 0.05, gain = 0.3, at = 0, sweep = null }) {
    if (!ctx) return;
    const t = ctx.currentTime + at, s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  function tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.1, gain = 0.2, at = 0, attack = 0.004 }) {
    if (!ctx) return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
    return o;
  }

  const PAW = {
    wood: () => { burst({ freq: 2600, q: 3, dur: 0.025, gain: 0.16 }); burst({ type: 'lowpass', freq: 400, dur: 0.05, gain: 0.12 }); }, // claws + pad
    tile: () => { burst({ freq: 3400, q: 4, dur: 0.02, gain: 0.18 }); },
    rug: () => burst({ type: 'lowpass', freq: 500, dur: 0.06, gain: 0.1 }),
    grass: () => burst({ freq: 3200, q: 0.7, dur: 0.07, gain: 0.07 }),
    stone: () => { burst({ freq: 3000, q: 2, dur: 0.02, gain: 0.14 }); burst({ type: 'lowpass', freq: 300, dur: 0.04, gain: 0.1 }); },
    snow: () => burst({ type: 'lowpass', freq: 900, dur: 0.09, gain: 0.08 }),
  };

  let crackleT = 0, birdT = 2;
  return {
    unlock: ensure,
    get ready() { return !!ctx; },
    setVolume(v) { volume = v; if (master) master.gain.value = muted ? 0 : v; },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : volume; },
    get muted() { return muted; },
    paw(surface, speed) { if (!ctx) return; (PAW[surface] || PAW.wood)(); if (speed > 3 && Math.random() < 0.25) this.jingle(0.04); },
    jingle(gain = 0.05) { for (let i = 0; i < 2; i++) tone({ f0: 3100 + Math.random() * 2400, dur: 0.18, gain, at: i * 0.03 }); },
    bark() {
      if (!ctx) return;
      const f = 260 + Math.random() * 60, t = ctx.currentTime;
      for (const [fq, q, g] of [[600, 4, 0.5], [1300, 6, 0.35], [2600, 8, 0.15]]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 1.2, t); o.frequency.exponentialRampToValueAtTime(f * 0.75, t + 0.16);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = q;
        const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g * 0.5, t + 0.012); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(bp).connect(gn).connect(master); o.start(t); o.stop(t + 0.22);
      }
      burst({ freq: 1500, q: 0.8, dur: 0.12, gain: 0.12 });
    },
    skid() { burst({ freq: 2200, q: 5, dur: 0.38, gain: 0.12, sweep: 900 }); burst({ freq: 3400, q: 9, dur: 0.3, gain: 0.06, at: 0.04, sweep: 1800 }); },
    pounce() { burst({ type: 'lowpass', freq: 700, dur: 0.12, gain: 0.12 }); },
    land(surface) { burst({ type: 'lowpass', freq: surface === 'rug' ? 250 : 380, dur: 0.12, gain: 0.25 }); PAW[surface]?.(); },
    catch() { tone({ f0: 660, dur: 0.12, gain: 0.08 }); tone({ f0: 990, dur: 0.2, gain: 0.07, at: 0.08 }); },
    miss() { tone({ f0: 300, f1: 220, dur: 0.18, gain: 0.05 }); },
    click() { tone({ type: 'square', f0: 1800, dur: 0.012, gain: 0.04 }); },
    ui() { tone({ f0: 880, dur: 0.05, gain: 0.04 }); },
    knock(kind) {
      if (kind === 'cup') { tone({ f0: 1900, dur: 0.25, gain: 0.08 }); tone({ f0: 2700, dur: 0.18, gain: 0.05, at: 0.05 }); burst({ type: 'lowpass', freq: 600, dur: 0.08, gain: 0.15 }); }
      else if (kind === 'ball') { tone({ f0: 180, f1: 120, dur: 0.1, gain: 0.15 }); }
      else burst({ type: 'lowpass', freq: 800, dur: 0.1, gain: 0.08 });
    },
    crunch() { for (let i = 0; i < 4; i++) burst({ freq: 2500 + Math.random() * 1500, q: 1, dur: 0.04, gain: 0.12, at: i * 0.11 }); },
    chime() { [523, 659, 784, 1047].forEach((f, i) => tone({ f0: f, dur: 0.35, gain: 0.06, at: i * 0.09 })); },
    // continuous sounds, set every frame
    tick(dt, { pant = 0, fire = 0, rain = 0, birds = false, sleeping = false }) {
      if (!ctx) return;
      const now = ctx.currentTime;
      pantGain.gain.setTargetAtTime(sleeping ? 0.02 : pant * 0.16, now, 0.2);
      pantLfo.frequency.setTargetAtTime(sleeping ? 0.3 : 2 + pant * 4, now, 0.3);
      pantFilter.frequency.setTargetAtTime(sleeping ? 500 : 1300, now, 0.3);
      fireLevel = fire; fireGain.gain.setTargetAtTime(fire * 0.05, now, 0.3);
      rainGain.gain.setTargetAtTime(rain * 0.12, now, 0.5);
      crackleT -= dt;
      if (fire > 0.05 && crackleT <= 0) { burst({ type: 'highpass', freq: 2500 + Math.random() * 3000, dur: 0.01 + Math.random() * 0.02, gain: fire * (0.05 + Math.random() * 0.12) }); crackleT = Math.random() * 0.25; }
      birdsOn = birds; birdT -= dt;
      if (birdsOn && birdT <= 0) { const f = 2600 + Math.random() * 1600; for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tone({ f0: f, f1: f * (1.2 + Math.random() * 0.3), dur: 0.08, gain: 0.02, at: i * 0.11 }); birdT = 2 + Math.random() * 5; }
    },
  };
}
