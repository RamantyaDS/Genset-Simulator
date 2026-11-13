// Synthesized genset sound, driven by the simulation every frame. No samples: a V16 four-stroke fires 8 times per
// crank revolution, so at 1500 rpm the combustion note is 200 Hz; while cranking at ~150 rpm the pulses are 20 Hz and heard one by one.
import { loadFrac, type SimEvent } from './sim/genset';
import { sim } from './store';
import { ui } from './dse';

let ctx: AudioContext | null = null;
let master: GainNode;
let muffle: BiquadFilterNode;
let n: ReturnType<typeof build> | null = null;
let enabled = true;

function noiseBuffer(c: AudioContext) {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function build(c: AudioContext) {
  const noise = noiseBuffer(c);
  const src = () => {
    const s = c.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.start();
    return s;
  };
  const engine = c.createGain();
  engine.gain.value = 0;
  engine.connect(muffle);

  // Combustion: sawtooth at firing frequency through a load-dependent lowpass.
  const fire = c.createOscillator();
  fire.type = 'sawtooth';
  const fireLp = c.createBiquadFilter();
  fireLp.type = 'lowpass';
  fireLp.Q.value = 2;
  const fireG = c.createGain();
  fire.connect(fireLp).connect(fireG).connect(engine);
  fire.start();

  // Half-order rumble and first-order shake.
  const sub = c.createOscillator();
  sub.type = 'triangle';
  const subG = c.createGain();
  sub.connect(subG).connect(engine);
  sub.start();

  // Mechanical clatter: band-passed noise chopped at the firing rate so each power stroke is audible at low speed.
  const clat = src();
  const clatBp = c.createBiquadFilter();
  clatBp.type = 'bandpass';
  clatBp.frequency.value = 1400;
  clatBp.Q.value = 0.7;
  const chop = c.createGain();
  const chopOsc = c.createOscillator();
  chopOsc.type = 'square';
  const chopDepth = c.createGain();
  chopDepth.gain.value = 0.5;
  chopOsc.connect(chopDepth).connect(chop.gain);
  chop.gain.value = 0.5;
  chopOsc.start();
  const clatG = c.createGain();
  clat.connect(clatBp).connect(chop).connect(clatG).connect(engine);

  // Exhaust thump: low-passed noise also chopped at the firing rate.
  const thump = src();
  const thumpLp = c.createBiquadFilter();
  thumpLp.type = 'lowpass';
  thumpLp.frequency.value = 180;
  const thumpChop = c.createGain();
  chopDepth.connect(thumpChop.gain);
  thumpChop.gain.value = 0.5;
  const thumpG = c.createGain();
  thump.connect(thumpLp).connect(thumpChop).connect(thumpG).connect(engine);

  // Turbo whine climbs with load; radiator fan whoosh grows with speed.
  const turbo = c.createOscillator();
  turbo.type = 'sine';
  const turboG = c.createGain();
  turbo.connect(turboG).connect(engine);
  turbo.start();
  const fan = src();
  const fanLp = c.createBiquadFilter();
  fanLp.type = 'lowpass';
  fanLp.frequency.value = 700;
  const fanG = c.createGain();
  fan.connect(fanLp).connect(fanG).connect(engine);

  // Starter motor: geared whine plus brushes, loaded down on every compression stroke.
  const st = c.createOscillator();
  st.type = 'sawtooth';
  st.frequency.value = 340;
  const stBp = c.createBiquadFilter();
  stBp.type = 'bandpass';
  stBp.frequency.value = 900;
  stBp.Q.value = 1.2;
  const stNoise = src();
  const stNoiseBp = c.createBiquadFilter();
  stNoiseBp.type = 'bandpass';
  stNoiseBp.frequency.value = 3000;
  const stG = c.createGain();
  stG.gain.value = 0;
  st.connect(stBp).connect(stG);
  stNoise.connect(stNoiseBp).connect(stG);
  stG.connect(muffle);
  st.start();

  // Controller buzzer.
  const buzz = c.createOscillator();
  buzz.type = 'square';
  buzz.frequency.value = 2400;
  const buzzG = c.createGain();
  buzzG.gain.value = 0;
  buzz.connect(buzzG).connect(master);
  buzz.start();

  return { engine, fire, fireLp, fireG, sub, subG, chopOsc, clatG, thumpG, turbo, turboG, fanG, st, stG, buzzG };
}

/** Must be called from a user gesture (browsers block audio until then). */
export function initSound() {
  if (ctx) return ctx.resume();
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = enabled ? 0.8 : 0;
  muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 16000;
  const comp = ctx.createDynamicsCompressor();
  muffle.connect(master);
  master.connect(comp).connect(ctx.destination);
  n = build(ctx);
}

export function setSound(on: boolean) {
  enabled = on;
  if (ctx) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05);
}

/** Per-frame update. `distance` is camera-to-genset in metres; `enclosed` when the silent canopy is closed. */
export function updateSound(distance: number, enclosed: boolean) {
  if (!ctx || !n) return;
  const t = ctx.currentTime;
  const r = sim.rpm;
  const lf = sim.firing ? Math.min(1.15, loadFrac(sim)) : 0;
  const fFire = Math.max(1, (r / 60) * 8);
  const k = (v: AudioParam, x: number, tc = 0.03) => v.setTargetAtTime(x, t, tc);

  const near = Math.min(1, 7 / Math.max(3, distance));
  k(muffle.frequency, enclosed ? 700 : 16000, 0.2);
  const level = near * (enclosed ? 0.45 : 1);

  const spin = Math.min(1, r / 1500);
  const firing = sim.firing ? 1 : 0;
  k(n.engine.gain, level);
  k(n.fire.frequency, fFire);
  k(n.fireLp.frequency, 160 + 500 * spin + 900 * lf);
  k(n.fireG.gain, firing * (0.05 + 0.05 * spin + 0.08 * lf));
  k(n.sub.frequency, fFire / 2);
  k(n.subG.gain, (r > 20 ? 0.04 : 0) + firing * (0.1 + 0.08 * lf));
  k(n.chopOsc.frequency, fFire);
  k(n.clatG.gain, r > 20 ? 0.03 + 0.08 * spin * (sim.firing ? 1 : 0.4) : 0);
  k(n.thumpG.gain, r > 20 ? (sim.firing ? 0.35 + 0.35 * lf : 0.12) : 0);
  k(n.turbo.frequency, 1500 + 4200 * spin * (0.35 + 0.65 * Math.min(1, lf)));
  k(n.turboG.gain, firing * spin * (0.003 + 0.012 * lf), 0.4);
  k(n.fanG.gain, 0.12 * spin * spin);

  const cranking = sim.starter ? 1 : 0;
  k(n.st.frequency, 280 + r * 0.6);
  k(n.stG.gain, cranking * 0.05, 0.02);

  const buzzing = ui.buzzer && sim.alarms.length > 0;
  n.buzzG.gain.setTargetAtTime(buzzing && Math.floor(t * 2) % 2 === 0 ? 0.03 : 0, t, 0.005);
}

function oneShot(kind: 'beep' | 'clunk' | 'engage') {
  if (!ctx) return;
  const c = ctx;
  const t = c.currentTime;
  if (kind === 'beep') {
    const o = c.createOscillator();
    o.frequency.value = 2900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.08);
    return;
  }
  // Breaker or starter pinion: a short metallic burst on top of a low thud.
  const b = c.createBufferSource();
  b.buffer = noiseBuffer(c);
  const lp = c.createBiquadFilter();
  lp.type = 'bandpass';
  lp.frequency.value = kind === 'clunk' ? 1800 : 2600;
  const g = c.createGain();
  g.gain.setValueAtTime(kind === 'clunk' ? 0.5 : 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'clunk' ? 0.12 : 0.08));
  b.connect(lp).connect(g).connect(master);
  b.start(t);
  b.stop(t + 0.2);
  const o = c.createOscillator();
  o.frequency.setValueAtTime(kind === 'clunk' ? 110 : 160, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  const og = c.createGain();
  og.gain.setValueAtTime(0.5, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + 0.2);
}

export function playEvent(e: SimEvent) {
  if (e === 'beep') oneShot('beep');
  else if (e === 'gcbClose' || e === 'gcbOpen' || e === 'mcbClose' || e === 'mcbOpen') oneShot('clunk');
  else if (e === 'starterOn') oneShot('engage');
}
