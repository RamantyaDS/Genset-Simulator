// Simulation of a 2250 kVA prime genset (Perkins 4016-61TRG3 + Stamford P734H) run by a DSE7320 auto mains failure controller.
// Pure logic, no rendering: the scene, sound and panel read this state every frame.

export const RATING = {
  primeKva: 2250,
  primeKw: 1800,
  standbyKva: 2500,
  standbyKw: 2000,
  baseKw: 1440,
  volts: 400, // line to line
  pf: 0.8,
  rpm: 1500,
  hz: 50,
};

// Fuel use in L/h against fraction of prime power, from the Perkins 4016-61TRG3 datasheet (25/50/75%, base load,
// prime, standby). No-load at rated speed is not published; 40 L/h is an estimate.
import type { Build } from './dyno';

export const FUEL_CURVE: [number, number][] = [
  [0, 40],
  [0.25, 126],
  [0.5, 234],
  [0.75, 344],
  [0.8, 371],
  [1, 470],
  [1.1, 529],
];

// Controller timers in seconds: DSE7320 MKII factory defaults (manual 057-253 / config suite 057-243).
export const TIMERS = {
  mainsTransient: 2,
  startDelay: 5,
  crank: 10,
  crankRest: 10,
  attempts: 3,
  safety: 10,
  warmup: 1,
  transfer: 0.7,
  returnDelay: 30,
  cooling: 60,
  overloadTrip: 5,
};

export const TANK_L = 2000; // day tank; the open set has no base tank, so this is an assumption
export const BULK_L = 10000; // underground bulk tank feeding the day tank (assumption)
export const PUMP_LPH = 1500; // transfer pump
export const UPS = { kw: 60, kwh: 30 }; // building UPS: server room, emergency lighting, lift controls, CCTV (assumption)

/** One line of the outage timeline: seconds after the mains failed, and what happened. */
export interface Step {
  t: number;
  label: string;
}

export type Mode = 'stop' | 'manual' | 'test' | 'auto';
export type Phase =
  | 'rest'
  | 'startDelay'
  | 'crank'
  | 'crankRest'
  | 'running'
  | 'cooling'
  | 'stopping';

export type AlarmId =
  | 'failStart'
  | 'lowFuel'
  | 'fuelEmpty'
  | 'overload'
  | 'overloadTrip'
  | 'estop'
  | 'highTempWarn'
  | 'highTemp'
  | 'lowOilWarn'
  | 'lowOil'
  | 'batteryLow'
  | 'fuelWater'
  | 'fuelWaterStop';
export const ALARMS: Record<AlarmId, { text: string; kind: 'warning' | 'trip' | 'shutdown' }> = {
  failStart: { text: 'Fail to start', kind: 'shutdown' },
  lowFuel: { text: 'Low fuel level', kind: 'warning' },
  fuelEmpty: { text: 'Fuel level shutdown', kind: 'shutdown' },
  overload: { text: 'kW overload', kind: 'warning' },
  overloadTrip: { text: 'kW overload trip', kind: 'trip' },
  estop: { text: 'Emergency stop', kind: 'shutdown' },
  highTempWarn: { text: 'Coolant Temp High', kind: 'warning' },
  highTemp: { text: 'Coolant Temp High', kind: 'shutdown' },
  lowOilWarn: { text: 'Oil Pressure Low', kind: 'warning' },
  lowOil: { text: 'Oil Pressure Low', kind: 'shutdown' },
  batteryLow: { text: 'Battery Under Voltage', kind: 'warning' },
  fuelWater: { text: 'Water In Fuel', kind: 'warning' },
  fuelWaterStop: { text: 'Fuel Starvation', kind: 'shutdown' },
};

// DSE7320 factory protection levels (config suite 057-243).
export const PROTECT = { tempWarn: 90, tempShut: 96, oilWarn: 1.24, oilShut: 1.03 };

export type SimEvent = 'beep' | 'gcbClose' | 'gcbOpen' | 'mcbClose' | 'mcbOpen' | 'starterOn' | 'starterOff' | 'fire' | 'alarm' | 'mainsFail' | 'mainsReturn';

export interface State {
  mode: Mode;
  phase: Phase;
  timer: number; // seconds left in the current timed step
  attempt: number;
  mainsOk: boolean;
  mainsFailedFor: number;
  mainsBackFor: number;
  gcb: boolean; // generator breaker closed
  mcb: boolean; // mains breaker closed
  starter: boolean;
  fuelOn: boolean; // fuel solenoid / ECM run signal
  firing: boolean;
  rpm: number;
  volts: number; // line to line
  dipF: number; // transient speed deviation (fraction), damped spring
  dipFv: number;
  dipV: number; // transient voltage deviation (fraction)
  demandKw: number; // what the building wants
  genKw: number;
  coolant: number; // °C
  exhaust: number; // °C at the turbine inlet
  oil: number; // bar
  battery: number; // V
  fuel: number; // litres
  hours: number;
  kwh: number;
  sinceStart: number; // seconds since crank disconnect, for the safety-on delay
  warm: number; // seconds the generator has been available
  overloadFor: number;
  alarms: AlarmId[];
  eStop: boolean;
  transferIn: number; // seconds until the generator breaker closes after a manual transfer, -1 when idle
  loadBankOn: boolean; // portable resistive load bank, used to test the set without touching the building supply
  loadBankKw: number;
  faultRadiator: boolean; // blocked radiator / slipping fan belt: coolant overheats
  faultOil: boolean; // oil leak: pressure falls
  events: SimEvent[];
  t: number; // simulated seconds since start
  bulk: number; // litres in the bulk tank
  pumpAuto: boolean; // transfer pump on its level switch
  pumping: boolean;
  truckIn: number; // seconds until the tanker has finished filling the bulk tank, −1 none
  upsOn: boolean; // building UPS installed and switched on
  upsCharge: number; // 0..1
  upsOnBattery: boolean;
  outage: Outage;
  batHealth: number; // 1 a good battery … 0.3 worn out
  batSoc: number; // state of charge 0..1
  chargerOk: boolean; // mains battery charger working
  crankV: number; // lowest voltage seen during the last crank
  heaterOn: boolean; // jacket water heater keeps a standby engine warm
  waterIngress: boolean; // water getting into the fuel (bad delivery, condensation)
  water: number; // water in the separator bowl, 1 = full
  exercise: number; // seconds left of a scheduled off-load exercise run, 0 none
  runs: RunLog[];
  iso: IsoTest;
  backIn: number; // seconds until the mains breaker closes on the return transfer, −1 none
  mod: EngineMod | null; // a workshop build fitted to the set
}

/** What a workshop build changes on the set (from the dyno model at 1500 rpm). */
export interface EngineMod {
  name: string;
  build: Build; // the parts, for the 3D model
  kwe: number; // electrical output the engine can drive through the alternator
  bsfc: number; // fuel use relative to stock
  egt: number; // exhaust temperature change, °C
  smoke: number; // 0..1 visible smoke at full load
}

/** ISO 8528-5 style load-acceptance test run with the load bank, with a recorder. */
export interface IsoTest {
  active: boolean;
  plan: number[]; // load steps as fractions of prime power
  step: number; // index of the current step
  t: number; // seconds into the test
  stepStart: number;
  rec: { t: number; hz: number; v: number; kw: number }[];
  results: IsoResult[];
}

export interface IsoResult {
  fromKw: number;
  toKw: number;
  fDip: number; // % below 50 Hz
  fRec: number; // s to get back within ±1 %
  vDip: number; // % below 400 V
  vRec: number; // s to get back within ±3 %
  cls: 'G3' | 'G2' | 'G1' | '-';
}

/** Typical ISO 8528-5 limits for a load increase: transient dip and recovery time, frequency and voltage. */
export const ISO_LIMITS = {
  G3: { f: 7, tf: 3, v: 15, tv: 4 },
  G2: { f: 10, tf: 5, v: 20, tv: 6 },
  G1: { f: 15, tf: 10, v: 25, tv: 10 },
} as const;
export const ISO_STEP_S = 15;

/** One line of the engine logbook. */
export interface RunLog {
  start: number;
  end: number; // −1 while running
  why: string;
  kwh: number;
  litres: number;
  maxCoolant: number;
  minOil: number; // lowest oil pressure once at speed
  crankV: number;
  crankSec: number;
  alarms: string[];
}

/** Stopwatch of the last mains failure: what happened when, and how long each kind of load was dark. */
export interface Outage {
  active: boolean;
  start: number;
  steps: Step[];
  normalDark: number; // seconds the ordinary building load had no supply
  critDark: number; // seconds the UPS-backed critical load had no supply
  normalBack: number; // seconds after the failure the ordinary load came back, −1 not yet
  blink: number; // seconds dark during the transfer back to the mains (open transition)
  confirmed: boolean;
}

export function create(): State {
  return {
    mode: 'auto',
    phase: 'rest',
    timer: 0,
    attempt: 0,
    mainsOk: true,
    mainsFailedFor: 0,
    mainsBackFor: 0,
    gcb: false,
    mcb: true,
    starter: false,
    fuelOn: false,
    firing: false,
    rpm: 0,
    volts: 0,
    dipF: 0,
    dipFv: 0,
    dipV: 0,
    demandKw: 1200,
    genKw: 0,
    coolant: 45, // jacket water heater keeps a standby engine warm
    exhaust: 30,
    oil: 0,
    battery: 25.6,
    fuel: TANK_L * 0.9,
    hours: 1287.4,
    kwh: 0,
    sinceStart: 0,
    warm: 0,
    overloadFor: 0,
    alarms: [],
    eStop: false,
    transferIn: -1,
    loadBankOn: false,
    loadBankKw: 900,
    faultRadiator: false,
    faultOil: false,
    events: [],
    t: 0,
    bulk: BULK_L * 0.7,
    pumpAuto: true,
    pumping: false,
    truckIn: -1,
    upsOn: true,
    upsCharge: 1,
    upsOnBattery: false,
    outage: { active: false, start: 0, steps: [], normalDark: 0, critDark: 0, normalBack: -1, confirmed: false, blink: 0 },
    batHealth: 1,
    batSoc: 1,
    chargerOk: true,
    crankV: 0,
    heaterOn: true,
    waterIngress: false,
    water: 0.05,
    exercise: 0,
    runs: [],
    iso: { active: false, plan: [], step: 0, t: 0, stepStart: 0, rec: [], results: [] },
    backIn: -1,
    mod: null,
  };
}

/** Start the load-acceptance test: the set must be running, off the building, ready to take load. */
export function startIsoTest(s: State, direct: boolean) {
  if (!genAvailable(s) || s.gcb || s.iso.active) return false;
  s.iso = { active: true, plan: direct ? [0, 1] : [0, 0.25, 0.5, 0.75, 1], step: 0, t: 0, stepStart: 0, rec: [], results: [] };
  s.loadBankOn = true;
  s.loadBankKw = 0;
  return true;
}

export function stopIsoTest(s: State) {
  s.iso.active = false;
  s.loadBankOn = false;
}

function judge(fDip: number, fRec: number, vDip: number, vRec: number): IsoResult['cls'] {
  for (const c of ['G3', 'G2', 'G1'] as const) {
    const l = ISO_LIMITS[c];
    if (fDip <= l.f && fRec <= l.tf && vDip <= l.v && vRec <= l.tv) return c;
  }
  return '-';
}

/** Evaluate the recording since the last step change. */
function evalStep(s: State, fromKw: number, toKw: number) {
  const r = s.iso.rec.filter((x) => x.t >= s.iso.stepStart);
  if (!r.length) return;
  const fMin = Math.min(...r.map((x) => x.hz));
  const vMin = Math.min(...r.map((x) => x.v));
  const lastOut = (ok: (x: (typeof r)[number]) => boolean) => {
    let t = s.iso.stepStart;
    for (const x of r) if (!ok(x)) t = x.t;
    return t - s.iso.stepStart;
  };
  const fDip = Math.max(0, ((RATING.hz - fMin) / RATING.hz) * 100);
  const vDip = Math.max(0, ((RATING.volts - vMin) / RATING.volts) * 100);
  const fRec = lastOut((x) => Math.abs(x.hz - RATING.hz) <= RATING.hz * 0.01);
  const vRec = lastOut((x) => Math.abs(x.v - RATING.volts) <= RATING.volts * 0.03);
  s.iso.results.push({ fromKw, toKw, fDip, fRec, vDip, vRec, cls: judge(fDip, fRec, vDip, vRec) });
}

export const EXERCISE_S = 15 * 60;

/** Weekly exercise: start off-load for 15 minutes in Auto with the mains healthy, then stop by itself. */
export function startExercise(s: State) {
  if (s.mode !== 'auto' || !s.mainsOk || s.phase !== 'rest' || shutdownActive(s)) return false;
  s.exercise = EXERCISE_S;
  beginStart(s, 0);
  return true;
}

export function drainSeparator(s: State) {
  s.water = 0;
  clear(s, 'fuelWater');
}

/** Battery terminal voltage at rest (24 V system), from charge and health. */
export const restVolts = (s: State) => 23.2 + 2.6 * s.batSoc * (0.55 + 0.45 * s.batHealth);
/** Under the starter's load a worn or flat battery sags hard. */
export const crankVolts = (s: State) => restVolts(s) - 4.2 - 7 * (1 - s.batHealth) - 4 * (1 - s.batSoc);

/** The building's ordinary load has supply: through the mains breaker, or through the generator breaker. */
export const normalPowered = (s: State) => (s.mcb && s.mainsOk) || (s.gcb && s.volts > 300);
/** The critical load: ordinary supply, or the UPS battery. */
export const criticalPowered = (s: State) => normalPowered(s) || (s.upsOn && s.upsCharge > 0);

// ---------- derived readings ----------

export const hz = (s: State) => s.rpm / 30; // 4-pole alternator: f = rpm × 4 / 120
export const loadFrac = (s: State) => s.genKw / RATING.primeKw;
export const genKva = (s: State) => s.genKw / RATING.pf;
export const amps = (s: State) => (s.volts > 1 ? (genKva(s) * 1000) / (Math.sqrt(3) * s.volts) : 0);
export const fuelRate = (s: State) => {
  if (!s.firing) return 0;
  const x = Math.min(1.1, loadFrac(s));
  const k = s.mod ? s.mod.bsfc : 1;
  for (let i = 1; i < FUEL_CURVE.length; i++) {
    const [x0, y0] = FUEL_CURVE[i - 1];
    const [x1, y1] = FUEL_CURVE[i];
    if (x <= x1) return k * (y0 + ((y1 - y0) * (x - x0)) / (x1 - x0));
  }
  return k * FUEL_CURVE[FUEL_CURVE.length - 1][1];
};
export const genAvailable = (s: State) =>
  s.firing && s.sinceStart > 2 && Math.abs(hz(s) - 50) < 2.5 && Math.abs(s.volts - 400) < 40;
export const shutdownActive = (s: State) => s.alarms.some((a) => ALARMS[a].kind === 'shutdown');
export const runningLoaded = (s: State) => s.gcb && s.genKw > 0;

/** The two status lines the controller shows: state and, when a timer runs, its name and countdown. */
export function statusText(s: State): [string, string] {
  const clock = (x: number) => {
    const v = Math.max(0, Math.ceil(x));
    return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
  };
  if (s.alarms.some((a) => ALARMS[a].kind !== 'warning')) return ['Generator Locked Out', ''];
  switch (s.phase) {
    case 'startDelay':
      return ['Start Delay', clock(s.timer)];
    case 'crank':
      return [`Cranking ${s.attempt}/${TIMERS.attempts}`, clock(s.timer)];
    case 'crankRest':
      return ['Crank Rest', clock(s.timer)];
    case 'cooling':
      return ['Cooling', clock(s.timer)];
    case 'stopping':
      return ['Stopping', ''];
    case 'running':
      if (s.sinceStart < TIMERS.safety) return ['Safety Delay', clock(TIMERS.safety - s.sinceStart)];
      if (!genAvailable(s)) return ['Waiting For Generator', ''];
      if (s.gcb) return ['Generator On Load', ''];
      if (s.exercise > 0) return ['Scheduled Run', clock(s.exercise)];
      if (s.mode === 'auto' && s.mainsOk && s.mainsBackFor > 0) return ['Return Delay', clock(TIMERS.returnDelay - s.mainsBackFor)];
      if (s.warm < TIMERS.warmup) return ['Warming', clock(TIMERS.warmup - s.warm)];
      return ['Generator Available', ''];
    default:
      if (s.mode === 'stop') return ['Generator at Rest', 'Stop Mode'];
      if (!s.mainsOk) return ['Mains Failed', s.mode === 'auto' ? clock(TIMERS.mainsTransient - s.mainsFailedFor) : 'Manual Mode'];
      return ['Generator at Rest', s.mode === 'auto' ? 'Auto Mode' : s.mode === 'test' ? 'Test Mode' : 'Manual Mode'];
  }
}

// ---------- operator actions ----------

const STEP_LABEL: Partial<Record<SimEvent, string>> = {
  starterOn: 'Starter menyala',
  fire: 'Mesin mulai hidup (pembakaran)',
  starterOff: 'Starter lepas',
  mcbOpen: 'Breaker PLN dibuka',
  gcbClose: 'Breaker genset masuk: gedung menyala lagi',
  mainsReturn: 'PLN kembali, tunggu return delay 30 dtk',
  gcbOpen: 'Breaker genset dibuka',
  mcbClose: 'Breaker PLN masuk: gedung kembali ke PLN (open transition)',
};
const note = (s: State, label: string) => {
  if (s.outage.active) s.outage.steps.push({ t: s.t - s.outage.start, label });
};
const emit = (s: State, e: SimEvent) => {
  s.events.push(e);
  const label = STEP_LABEL[e];
  if (label) note(s, e === 'starterOn' ? `${label} (percobaan ${s.attempt})` : label);
};
const raise = (s: State, a: AlarmId) => {
  if (s.alarms.includes(a)) return;
  s.alarms.push(a);
  emit(s, 'alarm');
};
const clear = (s: State, a: AlarmId) => (s.alarms = s.alarms.filter((x) => x !== a));

function setGcb(s: State, on: boolean) {
  if (s.gcb === on) return;
  s.gcb = on;
  emit(s, on ? 'gcbClose' : 'gcbOpen');
}
function setMcb(s: State, on: boolean) {
  if (s.mcb === on) return;
  s.mcb = on;
  emit(s, on ? 'mcbClose' : 'mcbOpen');
}

function beginStart(s: State, delay: number) {
  if (shutdownActive(s) || s.firing) return;
  s.attempt = 0;
  if (delay > 0) {
    s.phase = 'startDelay';
    s.timer = delay;
  } else beginCrank(s);
}

function beginCrank(s: State) {
  s.attempt++;
  s.sinceStart = 0; // the safety-on delay restarts with every start
  s.phase = 'crank';
  s.timer = TIMERS.crank;
  s.fuelOn = true;
  s.starter = true;
  emit(s, 'starterOn');
}

function stopEngine(s: State) {
  s.fuelOn = false;
  if (s.starter) {
    s.starter = false;
    emit(s, 'starterOff');
  }
  setGcb(s, false);
  s.phase = s.rpm > 1 ? 'stopping' : 'rest';
  s.timer = 0;
}

export function pressStop(s: State) {
  emit(s, 'beep');
  // Second press with the engine at rest resets latched alarms.
  if (s.mode === 'stop' && s.rpm < 1)
    s.alarms = s.alarms.filter((a) => (a === 'estop' && s.eStop) || (a === 'fuelEmpty' && s.fuel <= 0) || (a === 'highTemp' && s.coolant >= PROTECT.tempShut) || (a === 'fuelWaterStop' && s.water >= 1.3));
  s.mode = 'stop';
  stopEngine(s);
  if (s.mainsOk) setMcb(s, true);
}

export function pressManual(s: State) {
  emit(s, 'beep');
  s.mode = 'manual';
  if (s.phase === 'startDelay' || s.phase === 'cooling') s.phase = s.firing ? 'running' : 'rest';
}

export function pressTest(s: State) {
  emit(s, 'beep');
  s.mode = 'test';
  if (s.phase === 'startDelay' || s.phase === 'cooling') s.phase = s.firing ? 'running' : 'rest';
}

export function pressAuto(s: State) {
  emit(s, 'beep');
  s.mode = 'auto';
}

export function pressStart(s: State) {
  emit(s, 'beep');
  if (s.mode !== 'manual' && s.mode !== 'test') return;
  if (s.phase === 'rest') beginStart(s, 0);
}

/** Manual mode transfer button: moves the load between mains and generator. */
export function pressTransfer(s: State, toGen: boolean) {
  emit(s, 'beep');
  if (s.mode !== 'manual') return;
  if (toGen) {
    if (!genAvailable(s)) return;
    setMcb(s, false);
    s.transferIn = TIMERS.transfer;
  } else {
    s.transferIn = -1;
    setGcb(s, false);
    if (s.mainsOk) setMcb(s, true);
  }
}

export function setEStop(s: State, on: boolean) {
  s.eStop = on;
  if (on) {
    raise(s, 'estop');
    stopEngine(s);
    if (s.mainsOk) setMcb(s, true);
  }
}

export function setMains(s: State, ok: boolean) {
  if (s.mainsOk === ok) return;
  s.mainsOk = ok;
  s.mainsFailedFor = 0;
  s.mainsBackFor = 0;
  if (!ok) {
    s.outage = { active: true, start: s.t, steps: [], normalDark: 0, critDark: 0, normalBack: -1, confirmed: false, blink: 0 };
    note(s, 'PLN padam: gedung gelap');
    if (s.upsOn && s.upsCharge > 0) note(s, 'UPS mengambil alih beban kritis tanpa jeda');
  }
  emit(s, ok ? 'mainsReturn' : 'mainsFail');
}

/** Call the fuel tanker: it fills the bulk tank after about 20 seconds. */
export function callTanker(s: State) {
  if (s.truckIn < 0) s.truckIn = 20;
}

/** Drain both tanks (fault drill: theft or a leak). */
export function drainFuel(s: State) {
  s.fuel = 0;
  s.bulk = 0;
}

/** Runtime left on the tank at the present burn rate, in hours (Infinity when not burning). */
export const hoursLeft = (s: State) => (fuelRate(s) > 0 ? s.fuel / fuelRate(s) : Infinity);

export function refuel(s: State) {
  s.fuel = TANK_L;
  s.bulk = BULK_L;
  clear(s, 'lowFuel');
}

// ---------- time step ----------

export function step(s: State, dt: number) {
  const prevKw = s.genKw;
  s.t += dt;

  // Mains supervision.
  if (s.mainsOk) {
    s.mainsFailedFor = 0;
    s.mainsBackFor += dt;
  } else {
    s.mainsBackFor = 0;
    s.mainsFailedFor += dt;
  }
  if (s.outage.active && !s.outage.confirmed && s.mainsFailedFor >= TIMERS.mainsTransient && !s.mainsOk) {
    s.outage.confirmed = true;
    note(s, `PLN padam terkonfirmasi (${TIMERS.mainsTransient} dtk), start delay ${TIMERS.startDelay} dtk`);
  }
  // A dead mains breaker can't stay closed onto a dead bus in auto.
  if (!s.mainsOk && s.mcb && s.mainsFailedFor >= TIMERS.mainsTransient && s.mode !== 'stop') setMcb(s, false);

  // AUTO mode decisions.
  if (s.mode === 'auto' && !shutdownActive(s)) {
    const mainsFailed = !s.mainsOk && s.mainsFailedFor >= TIMERS.mainsTransient;
    if (mainsFailed && s.phase === 'rest') beginStart(s, TIMERS.startDelay);
    if (mainsFailed && s.phase === 'cooling') s.phase = 'running';
    if (!mainsFailed && s.mainsOk && s.phase === 'startDelay') s.phase = 'rest';
    if (s.phase === 'running' && genAvailable(s)) {
      if (!s.mainsOk && !s.gcb && s.warm >= TIMERS.warmup && !s.alarms.includes('overloadTrip')) {
        setMcb(s, false);
        setGcb(s, true);
      }
      if (s.mainsOk && s.mainsBackFor >= TIMERS.returnDelay && s.exercise <= 0) {
        // Open transition: the generator breaker opens first, the mains breaker closes after the transfer time, so the
        // building blinks for a moment. (No-break return needs a closed-transition ATS or a controller that synchronises.)
        if (s.gcb) {
          setGcb(s, false);
          s.backIn = TIMERS.transfer;
        } else setMcb(s, true);
        s.phase = 'cooling';
        s.timer = TIMERS.cooling;
      }
    }
    if (s.phase === 'running' && s.exercise <= 0 && s.mainsOk && s.mainsBackFor >= TIMERS.returnDelay && !s.gcb && !genAvailable(s) && s.sinceStart > TIMERS.safety) {
      s.phase = 'cooling';
      s.timer = TIMERS.cooling;
    }
  }
  // MANUAL mode: a mains failure while running transfers the load, as the real module does. TEST mode always loads the set.
  const wantLoad = (s.mode === 'manual' && !s.mainsOk) || s.mode === 'test';
  if (wantLoad && s.phase === 'running' && genAvailable(s) && s.warm >= TIMERS.warmup && !s.gcb && !s.alarms.includes('overloadTrip')) {
    setMcb(s, false);
    setGcb(s, true);
  }
  if (s.backIn >= 0) {
    s.backIn -= dt;
    if (s.backIn < 0 && s.mainsOk) setMcb(s, true);
  }
  if (s.transferIn >= 0) {
    s.transferIn -= dt;
    if (s.transferIn < 0 && genAvailable(s)) setGcb(s, true);
  }

  // Timed steps.
  if (s.phase === 'startDelay') {
    s.timer -= dt;
    if (s.timer <= 0) beginCrank(s);
  } else if (s.phase === 'crank') {
    s.timer -= dt;
    if (s.firing && s.rpm > 600) {
      // Crank disconnect: the engine runs on its own.
      s.starter = false;
      emit(s, 'starterOff');
      s.phase = 'running';
      s.sinceStart = 0;
      s.warm = 0;
    } else if (s.timer <= 0) {
      s.starter = false;
      s.fuelOn = false;
      emit(s, 'starterOff');
      if (s.attempt >= TIMERS.attempts) {
        raise(s, 'failStart');
        s.phase = 'rest';
      } else {
        s.phase = 'crankRest';
        s.timer = TIMERS.crankRest;
      }
    }
  } else if (s.phase === 'crankRest') {
    s.timer -= dt;
    if (s.timer <= 0) beginCrank(s);
  } else if (s.phase === 'cooling') {
    s.timer -= dt;
    if (s.timer <= 0) stopEngine(s);
  }

  // Engine.
  const hasFuel = s.fuel > 0;
  if (s.firing && (!s.fuelOn || !hasFuel)) s.firing = false;
  const cold = s.coolant < 35;
  if (!s.firing && s.fuelOn && hasFuel && s.water < 1.3 && s.starter && s.rpm > (cold ? 120 : 100) && s.phase === 'crank' && TIMERS.crank - s.timer > (cold ? 3.6 : 2.2)) {
    s.firing = true;
    emit(s, 'fire');
  }
  let target: number;
  let tau: number;
  if (s.firing) {
    target = RATING.rpm;
    tau = s.rpm < 1200 ? 1.6 : 0.5;
  } else if (s.starter) {
    // cranking speed follows the battery: a sagging battery turns the engine too slowly to fire
    target = 150 * Math.max(0, Math.min(1.1, (crankVolts(s) - 12) / 7.6));
    tau = 0.35;
  } else {
    target = 0;
    tau = s.rpm > 300 ? 2.2 : 1;
  }
  let next = s.rpm + (target - s.rpm) * Math.min(1, dt / tau);
  if (s.firing && next - s.rpm > 260 * dt) next = s.rpm + 260 * dt; // fuel limiting while running up
  s.rpm = next < 0.5 && target === 0 ? 0 : next;
  if (s.firing && s.phase !== 'crank') s.sinceStart += dt; // counts from crank disconnect
  if (s.phase === 'stopping' && s.rpm === 0) s.phase = 'rest';

  // Load: the building through the generator breaker, plus the load bank when it is switched in.
  // During the ISO test the bank stays connected through the dip (that is what is being measured).
  const bankIn = s.loadBankOn && (genAvailable(s) || (s.iso.active && s.firing));
  if (s.loadBankOn && !bankIn && s.sinceStart > TIMERS.safety + 5) s.loadBankOn = false;
  s.genKw = s.firing ? (s.gcb ? s.demandKw : 0) + (bankIn ? s.loadBankKw : 0) : 0;
  const stepFrac = (s.genKw - prevKw) / RATING.primeKw;
  if (Math.abs(stepFrac) > 0.001) {
    // Governor and AVR react to a load step: speed and voltage sag, then recover (ISO 8528 G2-like).
    // Big load steps hit harder than in proportion: the turbochargers need time to spool up (turbo lag), so a large
    // turbocharged engine takes load best in steps.
    const lag = stepFrac > 0 ? 1 + 1.6 * Math.max(0, stepFrac - 0.3) : 1;
    s.dipFv -= stepFrac * 0.32 * lag;
    s.dipV -= stepFrac * 0.16 * (stepFrac > 0 ? 1 + 0.5 * Math.max(0, stepFrac - 0.3) : 1);
  }
  const w = 2.6;
  const z = 0.55;
  s.dipFv += (-w * w * s.dipF - 2 * z * w * s.dipFv) * dt;
  s.dipF += s.dipFv * dt;
  s.dipV += -s.dipV * Math.min(1, dt / 0.45);
  if (s.firing && s.rpm > 1350) s.rpm = RATING.rpm * (1 + s.dipF);
  // A fitted build that cannot drive the load: the governor runs out of fuel and the speed (frequency) sags.
  if (s.mod && s.firing && s.genKw > s.mod.kwe && s.rpm > 1000) s.rpm *= 1 - Math.min(0.2, ((s.genKw - s.mod.kwe) / s.mod.kwe) * 0.8);

  // ISO 8528 load-acceptance test: steps the load bank, records frequency and voltage, judges each step.
  const iso = s.iso;
  if (iso.active) {
    iso.t += dt;
    iso.rec.push({ t: iso.t, hz: hz(s), v: s.volts, kw: s.genKw });
    if (!genAvailable(s) && iso.t > 1 && s.genKw === 0 && !s.firing) stopIsoTest(s);
    else if (iso.t - iso.stepStart >= ISO_STEP_S || (iso.step === 0 && iso.t >= 3)) {
      const from = iso.plan[iso.step] * RATING.primeKw;
      if (iso.step > 0) evalStep(s, iso.plan[iso.step - 1] * RATING.primeKw, from);
      iso.step++;
      if (iso.step >= iso.plan.length) stopIsoTest(s);
      else {
        iso.stepStart = iso.t;
        s.loadBankKw = iso.plan[iso.step] * RATING.primeKw;
      }
    }
  }

  // Building UPS and the outage stopwatch.
  const normal = normalPowered(s);
  if (!normal && s.upsOn && s.upsCharge > 0) {
    s.upsOnBattery = true;
    s.upsCharge = Math.max(0, s.upsCharge - ((UPS.kw / UPS.kwh) * dt) / 3600);
    if (s.upsCharge === 0) note(s, 'Baterai UPS habis: beban kritis padam');
  } else {
    s.upsOnBattery = false;
    if (normal && s.upsCharge < 1) s.upsCharge = Math.min(1, s.upsCharge + dt / (4 * 3600)); // ~4 h recharge
  }
  const o = s.outage;
  if (o.active) {
    if (!normal) o.normalDark += dt;
    if (!normal && o.normalBack >= 0 && s.mainsOk) o.blink += dt;
    if (!criticalPowered(s)) o.critDark += dt;
    if (normal && o.normalBack < 0) o.normalBack = s.t - o.start;
    if (s.mainsOk && s.mcb && s.phase !== 'running' && o.normalBack >= 0) o.active = false;
  }

  // Excitation: the AVR builds voltage once the alternator is near speed.
  const vTarget = s.rpm > 1100 ? RATING.volts * Math.min(1, s.rpm / RATING.rpm) * (1 + s.dipV) : s.rpm > 300 ? 12 : 0;
  s.volts += (vTarget - s.volts) * Math.min(1, dt / 0.6);
  if (s.volts < 0.5) s.volts = 0;
  if (genAvailable(s)) s.warm += dt;
  else s.warm = 0;

  // Gauges.
  const lf = loadFrac(s);
  // Coolant: a jacket-water heater keeps a standby set at ~45 °C; running, the thermostat holds 80–90 °C depending on load.
  // A blocked radiator lets it climb past the alarm levels.
  const coolTarget = s.firing ? (s.faultRadiator ? 112 : 79 + 10 * lf) : s.heaterOn && (s.mainsOk || normalPowered(s)) ? 45 : 28;
  const coolTau = s.firing ? (s.coolant < 75 && !s.faultRadiator ? 240 : 90) : 900;
  s.coolant += (coolTarget - s.coolant) * Math.min(1, dt / coolTau);
  // Exhaust gas before the turbines: ~150 °C idling, roughly 550–600 °C at prime power, higher in overload.
  // The turbine housings follow it with the lag of a heavy iron casting.
  const exTarget = s.firing ? 150 + 420 * lf + 260 * Math.max(0, lf - 1) + (s.mod ? s.mod.egt * Math.min(1, lf) : 0) : 30;
  s.exhaust += (exTarget - s.exhaust) * Math.min(1, dt / (exTarget > s.exhaust ? 20 : 70));
  const oilNorm = s.rpm > 600 ? 4.6 - 0.02 * (s.coolant - 75) : s.rpm > 50 ? 0.4 + 0.004 * s.rpm : 0;
  const oilTarget = s.faultOil && s.rpm > 50 ? oilNorm * 0.18 : oilNorm;
  s.oil += (oilTarget - s.oil) * Math.min(1, dt / (s.faultOil ? 6 : 0.8));
  // Battery: the charger (mains) or the engine's alternator keeps it topped up; without either it slowly drains.
  if (s.starter) s.batSoc = Math.max(0, s.batSoc - dt / 900);
  else if ((s.chargerOk && s.mainsOk) || (s.firing && s.rpm > 900)) s.batSoc = Math.min(1, s.batSoc + dt / 600);
  else s.batSoc = Math.max(0, s.batSoc - dt / 2400);
  const batTarget = s.starter ? crankVolts(s) : s.firing && s.rpm > 900 ? 27.6 : s.chargerOk && s.mainsOk ? Math.max(restVolts(s), 26.8 * (0.6 + 0.4 * s.batHealth)) : restVolts(s);
  s.battery += (batTarget - s.battery) * Math.min(1, dt / (s.starter ? 0.15 : 2));
  if (s.starter) s.crankV = Math.min(s.crankV || 99, s.battery);
  if (!s.starter && !s.firing && s.battery < 24) raise(s, 'batteryLow');
  else if (s.battery > 24.6) clear(s, 'batteryLow');

  // Water in fuel: collects in the separator bowl; once it overflows the engine stumbles, then starves.
  if (s.waterIngress && s.firing) s.water = Math.min(1.35, s.water + dt / 240);
  if (s.water > 0.6) raise(s, 'fuelWater');
  if (s.firing && s.water > 1 && Math.random() < dt * 4) s.dipFv -= 0.025 + 0.03 * Math.random();
  if (s.firing && s.water >= 1.3) {
    raise(s, 'fuelWaterStop');
    stopEngine(s);
  }

  // Scheduled exercise: off-load run, then a normal stop with cool-down.
  if (s.exercise > 0 && (s.phase === 'running' || s.phase === 'crank' || s.phase === 'crankRest')) {
    if (s.phase === 'running') s.exercise -= dt;
    if (s.exercise <= 0 || !s.mainsOk) {
      s.exercise = 0;
      if (s.mainsOk && s.phase === 'running' && !s.gcb) {
        s.phase = 'cooling';
        s.timer = TIMERS.cooling;
      }
    }
  } else if (s.phase === 'rest') s.exercise = 0;

  // Logbook: one entry per run, from first fire to stop.
  const log = s.runs[s.runs.length - 1];
  if (s.firing && (!log || log.end >= 0)) {
    s.runs.push({
      start: s.t,
      end: -1,
      why: s.exercise > 0 ? 'Uji mingguan (tanpa beban)' : !s.mainsOk ? 'PLN padam' : s.mode === 'test' ? 'Tes beban' : 'Manual',
      kwh: 0,
      litres: 0,
      maxCoolant: s.coolant,
      minOil: 99,
      crankV: s.crankV,
      crankSec: TIMERS.crank - s.timer + (s.attempt - 1) * TIMERS.crank,
      alarms: [],
    });
    s.crankV = 0;
  } else if (log && log.end < 0) {
    log.kwh += (s.genKw * dt) / 3600;
    log.litres += (fuelRate(s) * dt) / 3600;
    log.maxCoolant = Math.max(log.maxCoolant, s.coolant);
    if (s.rpm > 1400 && s.sinceStart > TIMERS.safety) log.minOil = Math.min(log.minOil, s.oil);
    for (const a of s.alarms) if (!log.alarms.includes(ALARMS[a].text)) log.alarms.push(ALARMS[a].text);
    if (s.rpm === 0) log.end = s.t;
  }

  // Transfer pump: level switch on the day tank, fuel from the bulk tank; the tanker refills the bulk tank.
  if (s.pumpAuto && s.fuel < TANK_L * 0.6 && s.bulk > 0) s.pumping = true;
  if (!s.pumpAuto || s.fuel >= TANK_L * 0.95 || s.bulk <= 0) s.pumping = false;
  if (s.pumping) {
    const move = Math.min((PUMP_LPH * dt) / 3600, s.bulk, TANK_L - s.fuel);
    s.fuel += move;
    s.bulk -= move;
    if (s.fuel > TANK_L * 0.1) clear(s, 'lowFuel');
  }
  if (s.truckIn >= 0) {
    s.truckIn -= dt;
    if (s.truckIn < 0) s.bulk = BULK_L;
  }

  // Fuel and counters.
  if (s.firing) {
    s.fuel = Math.max(0, s.fuel - (fuelRate(s) * dt) / 3600);
    s.hours += dt / 3600;
    s.kwh += (s.genKw * dt) / 3600;
  }
  if (s.fuel < TANK_L * 0.1) raise(s, 'lowFuel');
  if (s.fuel <= 0 && s.firing) {
    raise(s, 'fuelEmpty');
    stopEngine(s);
  }

  // Overload protection.
  if (s.genKw > RATING.primeKw) raise(s, 'overload');
  else clear(s, 'overload');
  if (s.genKw > RATING.primeKw * 1.1) {
    s.overloadFor += dt;
    if (s.overloadFor >= TIMERS.overloadTrip) {
      raise(s, 'overloadTrip');
      setGcb(s, false);
      s.phase = 'cooling';
      s.timer = TIMERS.cooling;
    }
  } else s.overloadFor = 0;
  if (s.alarms.includes('overloadTrip') && s.rpm === 0) clear(s, 'overloadTrip');

  // Engine protections, armed once the safety-on delay has passed.
  if (s.firing && (s.phase === 'running' || s.phase === 'cooling') && s.sinceStart >= TIMERS.safety) {
    if (s.coolant >= PROTECT.tempShut) raise(s, 'highTemp');
    else if (s.coolant >= PROTECT.tempWarn) raise(s, 'highTempWarn');
    if (s.oil <= PROTECT.oilShut) raise(s, 'lowOil');
    else if (s.oil <= PROTECT.oilWarn) raise(s, 'lowOilWarn');
  }
  if (s.coolant < PROTECT.tempWarn - 2) clear(s, 'highTempWarn');
  if (s.oil > PROTECT.oilWarn + 0.14 || s.rpm === 0) clear(s, 'lowOilWarn');

  // A shutdown alarm stops the engine at once.
  if (shutdownActive(s) && (s.firing || s.starter)) stopEngine(s);
}
