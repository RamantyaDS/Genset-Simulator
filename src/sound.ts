// Genset sound, driven by the simulation every frame. The engine itself is the AudioWorklet in engineWorklet.ts
// (cylinder-by-cylinder combustion and the starter); here it gets exhaust EQ, turbo whine, fan rush, a little outdoor
// reverb, and distance / canopy muffling. Controller beeps, breaker clunks and the alarm buzzer are one-shots.
import { ENGINE_WORKLET } from './engineWorklet';
import { loadFrac, type SimEvent } from './sim/genset';
import { sim } from './store';
import { ui } from './dse';

let ctx: AudioContext | null = null;
let master: GainNode;
let muffle: BiquadFilterNode;
let enabled = true;
let n: ReturnType<typeof build> | null = null;
let engine: AudioWorkletNode | null = null;

function noiseBuffer(c: AudioContext, seconds = 2) {
  const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Short decaying-noise impulse: the slap of a yard and nearby walls. */
function impulse(c: AudioContext) {
  const len = Math.floor(c.sampleRate * 1.4);
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
  }
  return b;
}

function build(c: AudioContext) {
  // Engine bus: exhaust tone shaping, then distance/canopy muffling, plus a reverb send.
  const bus = c.createGain();
  bus.gain.value = 0;
  const lowShelf = c.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 110;
  lowShelf.gain.value = 8;
  const body = c.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 180;
  body.Q.value = 0.9;
  body.gain.value = 3;
  const top = c.createBiquadFilter();
  top.type = 'lowpass';
  top.frequency.value = 6500;
  // Keep the sub-bass out of the mud range small speakers can't play anyway.
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 38;
  bus.connect(hp).connect(lowShelf).connect(body).connect(top).connect(muffle);
  const verb = c.createConvolver();
  verb.buffer = impulse(c);
  const wet = c.createGain();
  wet.gain.value = 0.22;
  top.connect(verb).connect(wet).connect(master);

  // Turbo whine climbs with load; radiator fan rush grows with speed.
  const turbo = c.createOscillator();
  turbo.type = 'sine';
  const turbo2 = c.createOscillator();
  turbo2.type = 'sine';
  const turboG = c.createGain();
  turboG.gain.value = 0;
  turbo.connect(turboG);
  turbo2.connect(turboG);
  turboG.connect(bus);
  turbo.start();
  turbo2.start();
  const fan = c.createBufferSource();
  fan.buffer = noiseBuffer(c);
  fan.loop = true;
  const fanLp = c.createBiquadFilter();
  fanLp.type = 'lowpass';
  fanLp.frequency.value = 600;
  const fanG = c.createGain();
  fanG.gain.value = 0;
  fan.connect(fanLp).connect(fanG).connect(bus);
  fan.start();

  // Controller buzzer.
  const buzz = c.createOscillator();
  buzz.type = 'square';
  buzz.frequency.value = 2400;
  const buzzG = c.createGain();
  buzzG.gain.value = 0;
  buzz.connect(buzzG).connect(master);
  buzz.start();

  return { bus, turbo, turbo2, turboG, fanG, buzzG };
}

/** Must be called from a user gesture (browsers block audio until then). */
export async function initSound() {
  if (ctx) return ctx.resume();
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = enabled ? 0.9 : 0;
  muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 16000;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  muffle.connect(master);
  master.connect(comp).connect(ctx.destination);
  n = build(ctx);
  const url = URL.createObjectURL(new Blob([ENGINE_WORKLET], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  engine = new AudioWorkletNode(ctx, 'diesel-engine', { outputChannelCount: [1] });
  engine.connect(n.bus);
}

export function setSound(on: boolean) {
  enabled = on;
  if (ctx) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05);
}

/** What the engine sound follows. The single-genset mode uses `sim`; the power plant mode installs its own. */
export interface SoundSource {
  rpm: number;
  firing: boolean;
  starter: boolean;
  coolant: number;
  lf: number;
  count: number; // engines running (louder with more)
  alarm: boolean;
}
export const soundSource: { override: null | (() => SoundSource) } = { override: null };
const fromSim = (): SoundSource => ({
  rpm: sim.rpm,
  firing: sim.firing,
  starter: sim.starter,
  coolant: sim.coolant,
  lf: sim.firing ? Math.min(1.25, loadFrac(sim)) : 0,
  count: sim.firing ? 1 : 0,
  alarm: ui.buzzer && sim.alarms.length > 0,
});

/** Per-frame update. `distance` is camera-to-genset in metres; `enclosed` when the silent canopy is closed. */
export function updateSound(distance: number, enclosed: boolean) {
  if (!ctx || !n) return;
  const src = soundSource.override ? soundSource.override() : fromSim();
  const t = ctx.currentTime;
  const r = src.rpm;
  const lf = src.lf;
  const k = (v: AudioParam, x: number, tc = 0.03) => v.setTargetAtTime(x, t, tc);

  // Closer is louder; the canopy's insulation takes most of the highs and some level.
  const near = Math.min(1, 8 / Math.max(3, distance));
  k(muffle.frequency, enclosed ? 650 : 16000, 0.2);
  k(n.bus.gain, near * (enclosed ? 0.5 : 1) * (1 + 0.22 * Math.max(0, src.count - 1)), 0.1);

  if (engine) {
    const p = engine.parameters;
    k(p.get('rpm')!, r, 0.02);
    k(p.get('load')!, lf, 0.25);
    p.get('firing')!.setValueAtTime(src.firing ? 1 : 0, t);
    p.get('starter')!.setValueAtTime(src.starter ? 1 : 0, t);
    k(p.get('cold')!, Math.max(0, Math.min(1, (70 - src.coolant) / 30)), 1);
  }

  const spin = Math.min(1, r / 1500);
  const boost = spin * (0.3 + 0.7 * Math.min(1, lf));
  k(n.turbo.frequency, 1800 + 5200 * boost, 0.6);
  k(n.turbo2.frequency, 2700 + 7400 * boost, 0.6);
  k(n.turboG.gain, (src.firing ? 1 : 0) * spin * (0.002 + 0.01 * lf), 0.5);
  k(n.fanG.gain, 0.22 * spin * spin, 0.3);

  const buzzing = src.alarm;
  n.buzzG.gain.setTargetAtTime(buzzing && Math.floor(t * 2) % 2 === 0 ? 0.03 : 0, t, 0.005);
}

function oneShot(kind: 'beep' | 'clunk' | 'engage' | 'release') {
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
  // Breaker, starter pinion engaging or flying out: a metallic burst on top of a low thud.
  const b = c.createBufferSource();
  b.buffer = noiseBuffer(c, 0.3);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = kind === 'clunk' ? 1700 : kind === 'engage' ? 2600 : 3400;
  const g = c.createGain();
  const peak = kind === 'clunk' ? 0.6 : 0.35;
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'clunk' ? 0.14 : 0.07));
  b.connect(bp).connect(g).connect(master);
  b.start(t);
  b.stop(t + 0.25);
  const o = c.createOscillator();
  o.frequency.setValueAtTime(kind === 'clunk' ? 110 : 170, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  const og = c.createGain();
  og.gain.setValueAtTime(kind === 'release' ? 0.15 : 0.55, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + 0.2);
}

/** Power plant events: breakers, an out-of-phase closing, trips, starts. */
export function playPlantEvent(e: string) {
  if (e === 'breaker' || e === 'feeder' || e === 'shed') oneShot('clunk');
  else if (e === 'start') oneShot('engage');
  else if (e === 'trip') oneShot('clunk');
  else if (e === 'badSync') {
    // the bang of closing out of phase: breaker slam plus a heavy thump through the floor
    oneShot('clunk');
    if (ctx) {
      const c = ctx;
      const t0 = c.currentTime;
      const o = c.createOscillator();
      o.frequency.setValueAtTime(70, t0);
      o.frequency.exponentialRampToValueAtTime(25, t0 + 0.6);
      const g = c.createGain();
      g.gain.setValueAtTime(1.2, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + 0.75);
    }
    setTimeout(() => oneShot('clunk'), 120);
  }
}

export function playEvent(e: SimEvent) {
  if (e === 'beep') oneShot('beep');
  else if (e === 'gcbClose' || e === 'gcbOpen' || e === 'mcbClose' || e === 'mcbOpen') oneShot('clunk');
  else if (e === 'starterOn') oneShot('engage');
  else if (e === 'starterOff') oneShot('release');
}
