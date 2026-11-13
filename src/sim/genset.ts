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
  | 'lowOil';
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
  };
}

// ---------- derived readings ----------

export const hz = (s: State) => s.rpm / 30; // 4-pole alternator: f = rpm × 4 / 120
export const loadFrac = (s: State) => s.genKw / RATING.primeKw;
export const genKva = (s: State) => s.genKw / RATING.pf;
export const amps = (s: State) => (s.volts > 1 ? (genKva(s) * 1000) / (Math.sqrt(3) * s.volts) : 0);
export const fuelRate = (s: State) => {
  if (!s.firing) return 0;
  const x = Math.min(1.1, loadFrac(s));
  for (let i = 1; i < FUEL_CURVE.length; i++) {
    const [x0, y0] = FUEL_CURVE[i - 1];
    const [x1, y1] = FUEL_CURVE[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return FUEL_CURVE[FUEL_CURVE.length - 1][1];
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

const emit = (s: State, e: SimEvent) => s.events.push(e);
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
    s.alarms = s.alarms.filter((a) => (a === 'estop' && s.eStop) || (a === 'fuelEmpty' && s.fuel <= 0) || (a === 'highTemp' && s.coolant >= PROTECT.tempShut));
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
  emit(s, ok ? 'mainsReturn' : 'mainsFail');
}

/** Runtime left on the tank at the present burn rate, in hours (Infinity when not burning). */
export const hoursLeft = (s: State) => (fuelRate(s) > 0 ? s.fuel / fuelRate(s) : Infinity);

export function refuel(s: State) {
  s.fuel = TANK_L;
  clear(s, 'lowFuel');
}

// ---------- time step ----------

export function step(s: State, dt: number) {
  const prevKw = s.genKw;

  // Mains supervision.
  if (s.mainsOk) {
    s.mainsFailedFor = 0;
    s.mainsBackFor += dt;
  } else {
    s.mainsBackFor = 0;
    s.mainsFailedFor += dt;
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
      if (s.mainsOk && s.mainsBackFor >= TIMERS.returnDelay) {
        if (s.gcb) setGcb(s, false);
        setMcb(s, true);
        s.phase = 'cooling';
        s.timer = TIMERS.cooling;
      }
    }
    if (s.phase === 'running' && s.mainsOk && s.mainsBackFor >= TIMERS.returnDelay && !s.gcb && !genAvailable(s) && s.sinceStart > TIMERS.safety) {
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
  if (!s.firing && s.fuelOn && hasFuel && s.starter && s.rpm > 100 && s.phase === 'crank' && TIMERS.crank - s.timer > 2.2) {
    s.firing = true;
    emit(s, 'fire');
  }
  let target: number;
  let tau: number;
  if (s.firing) {
    target = RATING.rpm;
    tau = s.rpm < 1200 ? 1.6 : 0.5;
  } else if (s.starter) {
    target = 150;
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
  if (s.loadBankOn && !genAvailable(s) && s.sinceStart > TIMERS.safety + 5) s.loadBankOn = false;
  s.genKw = s.firing ? (s.gcb ? s.demandKw : 0) + (s.loadBankOn && genAvailable(s) ? s.loadBankKw : 0) : 0;
  const stepFrac = (s.genKw - prevKw) / RATING.primeKw;
  if (Math.abs(stepFrac) > 0.001) {
    // Governor and AVR react to a load step: speed and voltage sag, then recover (ISO 8528 G2-like).
    s.dipFv -= stepFrac * 0.32;
    s.dipV -= stepFrac * 0.16;
  }
  const w = 2.6;
  const z = 0.55;
  s.dipFv += (-w * w * s.dipF - 2 * z * w * s.dipFv) * dt;
  s.dipF += s.dipFv * dt;
  s.dipV += -s.dipV * Math.min(1, dt / 0.45);
  if (s.firing && s.rpm > 1350) s.rpm = RATING.rpm * (1 + s.dipF);

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
  const coolTarget = s.firing ? (s.faultRadiator ? 112 : 79 + 10 * lf) : 45;
  const coolTau = s.firing ? (s.coolant < 75 && !s.faultRadiator ? 240 : 90) : 900;
  s.coolant += (coolTarget - s.coolant) * Math.min(1, dt / coolTau);
  // Exhaust gas before the turbines: ~150 °C idling, roughly 550–600 °C at prime power, higher in overload.
  // The turbine housings follow it with the lag of a heavy iron casting.
  const exTarget = s.firing ? 150 + 420 * lf + 260 * Math.max(0, lf - 1) : 30;
  s.exhaust += (exTarget - s.exhaust) * Math.min(1, dt / (exTarget > s.exhaust ? 20 : 70));
  const oilNorm = s.rpm > 600 ? 4.6 - 0.02 * (s.coolant - 75) : s.rpm > 50 ? 0.4 + 0.004 * s.rpm : 0;
  const oilTarget = s.faultOil && s.rpm > 50 ? oilNorm * 0.18 : oilNorm;
  s.oil += (oilTarget - s.oil) * Math.min(1, dt / (s.faultOil ? 6 : 0.8));
  const batTarget = s.starter ? 19.6 : s.firing && s.rpm > 900 ? 27.6 : 25.6;
  s.battery += (batTarget - s.battery) * Math.min(1, dt / (s.starter ? 0.15 : 2));

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
