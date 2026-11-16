// The workshop: the 4016 off its alternator, on an engine dynamometer, with modifications. Pure logic.
//
// The model is a mean-value engine, calibrated so the stock build makes about 2050 kWm at 1500 rpm (what a 1800 kWe
// prime genset needs), with an air-fuel ratio, boost, exhaust temperature and smoke that move the right way:
// - air per cycle follows displacement, boost and charge-air temperature; the turbo spools with exhaust energy and lag
// - fuel per cycle is what the throttle asks for, capped by the injectors and by the smoke limiter (minimum lambda)
// - power is fuel energy times an efficiency that suffers when rich and improves a little with timing advance
// - exhaust temperature rises as lambda falls; heat to the coolant against the radiator's capacity
// Damage accumulates past the limits: the turbo (exhaust temperature), the head gasket (peak cylinder pressure, coolant),
// the valve train (over-speed: valve float) and finally a connecting rod (gross over-speed): the engine is wrecked.

export type TurboSize = 'kecil' | 'standar' | 'besar' | 'jumbo';
export type Intercooler = 'tidak' | 'udara' | 'air';

export interface Build {
  name: string;
  bore: number; // mm
  stroke: number; // mm
  turbo: TurboSize;
  intercooler: Intercooler;
  injector: number; // injector flow, 1 = stock
  map: number; // ECU fuel map / smoke limiter aggressiveness, 1 = stock
  timing: number; // degrees of injection advance over stock
  straight: boolean; // straight-through exhaust
  bigRadiator: boolean;
  limiter: number; // rev limiter, rpm (0 = off)
  paint: string;
}

export const STOCK: Build = {
  name: 'Standar pabrik',
  bore: 160,
  stroke: 190,
  turbo: 'standar',
  intercooler: 'air',
  injector: 1,
  map: 1,
  timing: 0,
  straight: false,
  bigRadiator: false,
  limiter: 1800,
  paint: '#1f7f86',
};

export const TURBOS: Record<TurboSize, { label: string; boost: number; spool: number; lag: number; scale: number }> = {
  kecil: { label: 'Kecil (cepat, tenaga terbatas)', boost: 1.9, spool: 900, lag: 0.4, scale: 0.8 },
  standar: { label: 'Standar', boost: 2.6, spool: 1100, lag: 0.8, scale: 1 },
  besar: { label: 'Besar', boost: 3.4, spool: 1350, lag: 1.5, scale: 1.25 },
  jumbo: { label: 'Jumbo (lag besar)', boost: 4.3, spool: 1650, lag: 2.4, scale: 1.5 },
};

export const IC: Record<Intercooler, { label: string; eff: number }> = {
  tidak: { label: 'Tanpa intercooler', eff: 0 },
  udara: { label: 'Udara ke udara', eff: 0.7 },
  air: { label: 'Air ke udara (standar)', eff: 0.82 },
};

export const LIMITS = {
  egtWarn: 720, // °C before the turbine
  egtDamage: 760,
  pcpGasket: 210, // bar peak cylinder pressure a stock head gasket stands
  valveFloat: 2100, // rpm
  rodFail: 2400,
  coolantWarn: 100,
  coolantDamage: 112,
};

const STOCK_DISP = 16 * (Math.PI / 4) * 1.6 ** 2 * 1.9; // litres: 61.1
export const displacement = (b: Build) => 16 * (Math.PI / 4) * (b.bore / 100) ** 2 * (b.stroke / 100);
const P_REF = 2140; // gross kW at 1500 rpm, stock, full fuel (≈2050 kW at the flywheel after friction)
const ETA0 = 0.42;
const AMB = 30;

export interface Engine {
  build: Build;
  rpm: number;
  throttle: number; // 0..1 what the operator asks
  dynoMode: 'bebas' | 'pull';
  absorb: number; // free mode: dyno brake load 0..1
  boost: number; // bar gauge
  chargeT: number; // °C after the intercooler
  lambda: number;
  egt: number;
  pcp: number; // bar
  smoke: number; // opacity 0..1
  coolant: number;
  torque: number; // Nm at the flywheel
  power: number; // kW at the flywheel
  fuelLph: number;
  running: boolean;
  wrecked: boolean;
  steam: number; // white steam from a failed head gasket, 0..1
  dmg: { turbo: number; gasket: number; valves: number; rods: number }; // 0 fine … 1 failed
  pull: { active: boolean; from: number; to: number; points: { rpm: number; kw: number; nm: number; egt: number; lambda: number }[] };
  events: string[];
  message: string;
}

export function createEngine(build: Build = STOCK): Engine {
  return {
    build: { ...build },
    rpm: 0,
    throttle: 0,
    dynoMode: 'bebas',
    absorb: 0.15,
    boost: 0,
    chargeT: AMB,
    lambda: 9,
    egt: AMB,
    pcp: 0,
    smoke: 0,
    coolant: 70,
    torque: 0,
    power: 0,
    fuelLph: 0,
    running: false,
    wrecked: false,
    steam: 0,
    dmg: { turbo: 0, gasket: 0, valves: 0, rods: 0 },
    pull: { active: false, from: 900, to: 1800, points: [] },
    events: [],
    message: '',
  };
}

/** Peak values of the build at an rpm, full fuel, steady state: used for the quick spec readout and genset fitting. */
export function steady(b: Build, rpm: number) {
  const e = createEngine(b);
  e.running = true;
  e.rpm = rpm;
  e.throttle = 1;
  e.boost = targetBoost(e, 1);
  const r = cycle(e, 1);
  return r;
}

const spoolFrac = (e: Engine) => {
  const t = TURBOS[e.build.turbo];
  return Math.max(0, Math.min(1, (e.rpm - 600) / (t.spool - 600))) ** 1.5;
};
function targetBoost(e: Engine, fuelFrac: number) {
  const t = TURBOS[e.build.turbo];
  const health = 1 - 0.85 * e.dmg.turbo;
  return t.boost * spoolFrac(e) * (0.25 + 0.75 * Math.min(1.2, fuelFrac)) * health * (e.build.straight ? 1.04 : 1);
}

/** One engine cycle's worth of the mean-value model at the present rpm, boost and throttle. */
function cycle(e: Engine, demand: number) {
  const b = e.build;
  const disp = displacement(b) / STOCK_DISP;
  // charge air: compressor outlet heats with pressure ratio, the intercooler takes most of it back out
  const pr = 1 + e.boost;
  const compOut = AMB + 70 * (pr - 1) ** 0.85;
  const chargeT = compOut - (compOut - AMB) * IC[b.intercooler].eff;
  const density = (pr / 3.6) * ((58 + 273) / (chargeT + 273)); // 1 at stock boost and charge temperature
  const ve = 1 - 0.12 * ((e.rpm - 1400) / 1000) ** 2 + (b.straight ? 0.03 : 0);
  const air = disp * density * ve; // 1 = stock at 1500 rpm full boost
  // fuel: throttle × injectors × map, but never richer than the smoke limiter allows
  const lambdaMin = 1.6 / b.map ** 1.6;
  const fuel = Math.min(demand * b.injector * b.map * disp, (air * 1.6) / lambdaMin);
  const lambda = fuel > 0.001 ? (1.6 * air) / fuel : 9;
  // efficiency: rich mixtures burn incompletely; advance helps a little; worn turbo/valves hurt
  const rich = lambda < 1.3 ? (lambda / 1.3) ** 0.8 : 1;
  const eta = ETA0 * rich * (1 + 0.012 * b.timing - 0.0015 * b.timing ** 2) * (1 - 0.25 * e.dmg.valves) * (e.steam > 0.5 ? 0.85 : 1);
  const power = P_REF * (e.rpm / 1500) * fuel * (eta / ETA0) - friction(e.rpm);
  const egt = 120 + 440 * (1.6 / Math.max(0.6, lambda)) * Math.min(1, fuel * 1.6 + 0.2) + (chargeT - 50) * 1.1 - 14 * b.timing - (b.straight ? 25 : 0);
  const pcp = 60 + 100 * (pr / 3.6) * Math.min(1.4, fuel / Math.max(0.3, disp)) * (1 + 0.035 * b.timing) * (b.stroke / 190) ** 0.5;
  const smoke = Math.max(0, Math.min(1, (1.5 - lambda) / 0.45));
  const fuelLph = (P_REF / ETA0 / 42.8 / 0.84) * 3.6 * (e.rpm / 1500) * fuel; // L/h from fuel energy (42.8 MJ/kg, 0.84 kg/L)
  return { air, fuel, lambda, power, egt: Math.max(AMB, egt), pcp, smoke, chargeT, fuelLph };
}

const friction = (rpm: number) => 70 * (rpm / 1500) ** 2 + 15 * (rpm / 1500);
const INERTIA = 140; // kg·m², engine, flywheel and the dyno rotor

export function startEngine(e: Engine) {
  if (e.wrecked) return say(e, 'Mesin rusak berat. Rakit ulang dulu.');
  e.running = true;
  if (e.rpm < 300) e.rpm = 700;
  e.events.push('start');
}
export function stopEngine(e: Engine) {
  e.running = false;
  e.throttle = 0;
  e.pull.active = false;
}

/** Full-throttle sweep: the dyno holds the speed and walks it up while the torque is logged. */
export function startPull(e: Engine) {
  if (!e.running || e.wrecked) return say(e, 'Nyalakan mesin dulu.');
  const top = e.build.limiter || 2300;
  e.pull = { active: true, from: 900, to: Math.min(top, 2300), points: [] };
  e.dynoMode = 'pull';
  e.rpm = 900;
  say(e, `Dyno pull: gas penuh, dyno menahan putaran dan menaikkannya perlahan dari 900 sampai ${e.pull.to} rpm.`);
}

export function repair(e: Engine) {
  e.dmg = { turbo: 0, gasket: 0, valves: 0, rods: 0 };
  e.wrecked = false;
  e.steam = 0;
  e.coolant = 70;
  e.rpm = 0;
  e.running = false;
  say(e, 'Mesin sudah dibongkar dan dirakit ulang dengan suku cadang baru.');
}

const say = (e: Engine, m: string) => {
  e.message = m;
};

export function stepEngine(e: Engine, dt: number) {
  const b = e.build;
  if (e.wrecked || !e.running) {
    e.rpm = Math.max(0, e.rpm - dt * (e.rpm > 300 ? 500 : 200));
    e.boost = Math.max(0, e.boost - dt * 2);
    e.power = e.torque = e.fuelLph = 0;
    e.smoke = Math.max(0, e.smoke - dt);
    e.egt += (AMB - e.egt) * Math.min(1, dt / 30);
    e.lambda = 9;
    return;
  }
  // fuel demand: the throttle, an idle governor at the bottom, the rev limiter at the top, full fuel in a pull
  let demand = e.throttle;
  if (e.dynoMode === 'pull' && e.pull.active) demand = 1;
  const idle = 700;
  if (e.rpm < idle) demand = Math.max(demand, Math.min(1, (idle - e.rpm) / 150) * 0.35);
  if (b.limiter && e.rpm > b.limiter) demand *= Math.max(0, 1 - (e.rpm - b.limiter) / 40);
  // valve float misses cycles
  if (e.rpm > LIMITS.valveFloat && Math.random() < dt * 8) demand *= 0.3;

  e.boost += (targetBoost(e, demand) - e.boost) * Math.min(1, dt / TURBOS[b.turbo].lag);
  const r = cycle(e, demand);
  e.lambda = r.lambda;
  e.chargeT = r.chargeT;
  e.egt += (r.egt - e.egt) * Math.min(1, dt / 1.5);
  e.pcp = r.pcp;
  e.smoke += (Math.max(r.smoke, e.steam * 0.6) - e.smoke) * Math.min(1, dt * 4);
  e.fuelLph = r.fuelLph;

  const w = (e.rpm * 2 * Math.PI) / 60;
  const engineTq = w > 1 ? (Math.max(-friction(e.rpm), r.power) * 1000) / w : 0;
  let dynoTq = 0;
  if (e.dynoMode === 'pull' && e.pull.active) {
    // the dyno controller holds the sweep speed: whatever torque the engine makes is absorbed and logged
    const want = e.pull.from + (e.pull.points.length ? 0 : 0);
    void want;
    e.rpm = Math.min(e.pull.to, e.rpm + dt * 120);
    dynoTq = engineTq;
    const last = e.pull.points[e.pull.points.length - 1];
    if (!last || e.rpm - last.rpm >= 25) e.pull.points.push({ rpm: e.rpm, kw: Math.max(0, r.power), nm: Math.max(0, engineTq), egt: e.egt, lambda: e.lambda });
    if (e.rpm >= e.pull.to - 1) {
      e.pull.active = false;
      e.dynoMode = 'bebas';
      e.throttle = 0;
      const peak = e.pull.points.reduce((a, p) => (p.kw > a.kw ? p : a), e.pull.points[0]);
      const tq = e.pull.points.reduce((a, p) => (p.nm > a.nm ? p : a), e.pull.points[0]);
      say(e, `Hasil dyno: tenaga puncak ${Math.round(peak.kw)} kW di ${Math.round(peak.rpm)} rpm, torsi puncak ${Math.round(tq.nm).toLocaleString('id')} Nm di ${Math.round(tq.rpm)} rpm.`);
      e.events.push('pullDone');
    }
  } else {
    // free running: the dyno brake applies a set load that grows with speed (like a water brake)
    dynoTq = e.absorb * 14000 * (e.rpm / 1500) ** 2;
    const net = engineTq - dynoTq;
    e.rpm = Math.max(0, e.rpm + ((net / INERTIA) * dt * 60) / (2 * Math.PI));
    if (e.rpm < 250) {
      e.running = false;
      say(e, 'Mesin mati: beban dyno terlalu berat untuk putaran ini.');
    }
  }
  e.torque = Math.max(0, e.dynoMode === 'pull' ? engineTq : engineTq);
  e.power = Math.max(0, r.power);

  // cooling: about a quarter of the fuel energy goes to the jacket water
  const heat = 0.25 * (P_REF / ETA0) * (e.rpm / 1500) * r.fuel + (b.intercooler === 'air' ? 0.05 * (r.chargeT - AMB) * 10 : 0);
  const cap = (b.bigRadiator ? 2300 : 1450) * Math.min(1, 0.3 + e.rpm / 1500);
  e.coolant += ((heat - cap) / 600) * dt * 0.6 + (e.coolant < 82 ? (82 - e.coolant) * dt * 0.02 * Math.min(1, heat / 400) : 0);
  if (heat < cap && e.coolant > 85) e.coolant -= dt * 0.8;
  if (e.steam > 0.5) e.coolant += dt * 0.6; // coolant blowing out through the gasket
  e.coolant = Math.max(AMB, e.coolant);

  // damage
  const d = e.dmg;
  if (e.egt > LIMITS.egtDamage) d.turbo = Math.min(1, d.turbo + dt * 0.02 * ((e.egt - LIMITS.egtDamage) / 60) ** 1.5);
  if (e.pcp > LIMITS.pcpGasket) d.gasket = Math.min(1, d.gasket + dt * 0.05 * ((e.pcp - LIMITS.pcpGasket) / 15));
  if (e.coolant > LIMITS.coolantDamage) d.gasket = Math.min(1, d.gasket + dt * 0.03);
  if (e.rpm > LIMITS.valveFloat) d.valves = Math.min(1, d.valves + dt * 0.08 * ((e.rpm - LIMITS.valveFloat) / 150));
  if (e.rpm > LIMITS.rodFail - 120 * d.valves) d.rods = Math.min(1, d.rods + dt * 0.9);
  if (d.turbo >= 1 && !e.events.includes('turboDead')) {
    e.events.push('turboDead');
    say(e, 'Turbo rusak: sudu turbin meleleh karena gas buang terlalu panas. Boost hilang, asap biru keluar (oli bocor ke turbo).');
  }
  if (d.gasket >= 1 && e.steam < 1) {
    e.steam = 1;
    e.events.push('gasket');
    say(e, 'Paking kepala silinder jebol! Air pendingin masuk ruang bakar dan keluar sebagai uap putih dari knalpot.');
  }
  if (d.rods >= 1 && !e.wrecked) {
    e.wrecked = true;
    e.running = false;
    e.pull.active = false;
    e.events.push('rod');
    say(e, `MESIN JEBOL di ${Math.round(e.rpm)} rpm: setang piston putus dan menembus blok mesin. Tanpa pembatas putaran, inilah akibatnya.`);
  }
}

/** What fitting this build to the genset would change: flywheel power at 1500 rpm, fuel use, exhaust temperature, smoke. */
export function gensetFit(b: Build) {
  const mod = steady(b, 1500);
  const ref = steady(STOCK, 1500);
  return {
    kw: Math.max(0, mod.power),
    kwe: Math.max(0, mod.power) * 0.94, // through the alternator
    bsfc: (mod.fuelLph / Math.max(1, mod.power)) / (ref.fuelLph / ref.power),
    egt: mod.egt - ref.egt,
    smoke: mod.smoke,
  };
}
