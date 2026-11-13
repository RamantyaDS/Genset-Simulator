// Five-unit diesel power plant (PLTD) for a palm oil complex: five 2250 kVA Perkins 4016 sets in parallel on a
// common 400 V bus (stepped up to 20 kV), each with a DSE8610-style synchronising / load-share controller, plus a
// master that starts and stops sets to follow the load (load demand). Pure logic; the scene and UI read it.
//
// Time: unit dynamics run in real seconds; the clock (load profile, fuel, energy) runs faster, `timeScale` simulated
// minutes per real second, so a whole day passes in minutes.
import { FUEL_CURVE } from './genset';

export const UNITS = 5;
export const PRIME_KW = 1800;
export const LIMIT_KW = 2000; // standby rating: short-term ceiling per set
export const NOMINAL_HZ = 50;
export const NOMINAL_V = 400;
export const SYNC = { hz: 0.2, volts: 0.04, deg: 15 }; // check-synchroniser window
export const TANK_L = 60000; // bulk storage
export const TRUCK_L = 16000;

export type UnitPhase = 'rest' | 'crank' | 'running' | 'cooling' | 'stopping';

export interface Unit {
  id: number;
  phase: UnitPhase;
  timer: number;
  rpm: number;
  hz: number; // own frequency when off the bus
  volts: number;
  setHz: number; // governor trim, Hz from nominal (operator raise/lower)
  setV: number; // AVR trim, fraction from nominal
  angle: number; // electrical angle relative to the bus (rad)
  breaker: boolean;
  kw: number;
  auto: boolean; // available to the load-demand master
  syncing: boolean; // auto-synchroniser engaged
  alarm: string | null;
  hours: number;
  coolant: number;
  exhaust: number;
  oil: number; // bar
  kwh: number;
  eStop: boolean;
  faultRadiator: boolean; // blocked radiator / slipping fan belt: coolant overheats
  faultOil: boolean; // oil leak: pressure falls
}

export interface Feeder {
  id: number;
  name: string;
  short: string;
  shedOrder: number; // 1 is shed first
  on: boolean;
  demand: number; // kW right now
  outageMin: number;
}

export interface Plant {
  units: Unit[];
  feeders: Feeder[];
  busHz: number;
  busV: number;
  dip: number; // transient frequency deviation (Hz), damped spring
  dipV: number;
  clock: number; // minutes since 00:00
  day: number;
  timeScale: number; // simulated minutes per real second
  fuel: number;
  truckEta: number; // real seconds until the tanker has emptied into the tank, −1 none
  master: boolean; // load-demand automatic control
  ufls: boolean; // automatic under-frequency load shedding
  underFor: number;
  collapseFor: number;
  autoFeederT: number;
  autoUp: number;
  autoDown: number;
  demandT: number;
  stats: { kwh: number; litres: number; outageMin: number; shed: number; badSync: number; trips: number };
  events: string[];
  message: string;
}

const FEEDERS: [string, string, number][] = [
  ['Pabrik kelapa sawit (PKS) 60 t/jam', 'PKS', 3],
  ['Pabrik inti sawit (kernel)', 'Kernel', 2],
  ['Perumahan, sekolah, masjid', 'Perumahan', 5],
  ['Kantor dan bengkel', 'Kantor', 1],
  ['Air bersih dan klinik', 'Air & klinik', 4],
];

/** Load profile of each feeder (kW) by hour of day. Estimates for a 60 t/h mill complex. */
export function profile(feeder: number, h: number): number {
  const between = (a: number, b: number) => (h >= a && h < b ? 1 : 0);
  const ramp = (x: number, a: number, b: number) => Math.max(0, Math.min(1, (x - a) / (b - a)));
  switch (feeder) {
    case 0: // mill processes from early morning to late evening, cleaning and standby overnight
      return 300 + 1050 * ramp(h, 5.5, 7) * (1 - ramp(h, 22, 23.5));
    case 1:
      return 880 + 40 * Math.sin(h);
    case 2: // homes: morning bump, evening peak
      return 330 + 380 * Math.exp(-((h - 6) ** 2) / 1.2) + 120 * between(7, 17) + 950 * Math.exp(-((h - 19.5) ** 2) / 3.5);
    case 3:
      return 80 + 420 * between(7, 17);
    default:
      return 230 + 150 * Math.exp(-((h - 6.5) ** 2) / 1.5) + 150 * Math.exp(-((h - 18.5) ** 2) / 2);
  }
}

export function create(): Plant {
  return {
    units: Array.from({ length: UNITS }, (_, i) => ({
      id: i,
      phase: 'rest' as UnitPhase,
      timer: 0,
      rpm: 0,
      hz: 0,
      volts: 0,
      setHz: 0,
      setV: 0,
      angle: Math.random() * Math.PI * 2,
      breaker: false,
      kw: 0,
      auto: true,
      syncing: false,
      alarm: null,
      hours: 6200 + i * 430,
      coolant: 45,
      exhaust: 30,
      oil: 0,
      kwh: 0,
      eStop: false,
      faultRadiator: false,
      faultOil: false,
    })),
    feeders: FEEDERS.map(([name, short, shedOrder], id) => ({ id, name, short, shedOrder, on: false, demand: 0, outageMin: 0 })),
    busHz: 0,
    busV: 0,
    dip: 0,
    dipV: 0,
    clock: 5 * 60,
    day: 1,
    timeScale: 1,
    fuel: TANK_L * 0.55,
    truckEta: -1,
    master: false,
    ufls: true,
    underFor: 0,
    collapseFor: 0,
    autoFeederT: 0,
    autoUp: 0,
    autoDown: 0,
    demandT: 0,
    stats: { kwh: 0, litres: 0, outageMin: 0, shed: 0, badSync: 0, trips: 0 },
    events: [],
    message: '',
  };
}

// ---------- derived ----------

export const online = (p: Plant) => p.units.filter((u) => u.breaker);
export const busLive = (p: Plant) => online(p).length > 0;
export const loadKw = (p: Plant) => (busLive(p) ? p.feeders.reduce((a, f) => a + (f.on ? f.demand : 0), 0) : 0);
export const demandKw = (p: Plant) => p.feeders.reduce((a, f) => a + f.demand, 0);
export const capacityKw = (p: Plant) => online(p).length * PRIME_KW;
export const available = (u: Unit) => u.phase === 'running' && u.rpm > 1450 && u.volts > 360;
export const hourOf = (p: Plant) => p.clock / 60;
export const fuelRateL = (p: Plant) =>
  p.units.reduce((a, u) => {
    if (u.phase !== 'running' && u.phase !== 'cooling') return a;
    const x = Math.min(1.1, u.kw / PRIME_KW);
    for (let i = 1; i < FUEL_CURVE.length; i++) {
      const [x0, y0] = FUEL_CURVE[i - 1];
      const [x1, y1] = FUEL_CURVE[i];
      if (x <= x1) return a + y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return a + FUEL_CURVE[FUEL_CURVE.length - 1][1];
  }, 0);
/** Synchronising differences of an incoming set against the live bus. */
export function syncDiff(p: Plant, u: Unit) {
  const deg = ((((u.angle * 180) / Math.PI) % 360) + 540) % 360 - 180;
  return { hz: u.hz - p.busHz, volts: (u.volts - p.busV) / NOMINAL_V, deg };
}

// ---------- operator actions ----------

const say = (p: Plant, m: string) => (p.message = m);

export function startUnit(p: Plant, i: number) {
  const u = p.units[i];
  if (u.eStop) return say(p, `Emergency stop genset ${i + 1} masih ditekan. Lepas dulu.`);
  if (u.alarm) return say(p, `Genset ${i + 1} masih ada alarm (${u.alarm}). Reset dulu.`);
  if (p.fuel <= 0) return say(p, 'Solar habis. Panggil truk tangki.');
  if (u.phase !== 'rest') return;
  u.phase = 'crank';
  u.timer = 2.5;
  u.setHz = 0;
  u.setV = 0;
  p.events.push('start');
}

export function stopUnit(p: Plant, i: number) {
  const u = p.units[i];
  if (u.phase === 'rest' || u.phase === 'stopping') return;
  if (u.breaker) openBreaker(p, i);
  u.syncing = false;
  u.phase = 'cooling';
  u.timer = 15;
}

export function resetUnit(p: Plant, i: number) {
  const u = p.units[i];
  if (u.rpm < 1 && !u.eStop) u.alarm = null;
}

/** Mushroom button on the set: cuts fuel at once, whatever the set is doing; latched until released and reset. */
export function setEStop(p: Plant, i: number, on: boolean) {
  const u = p.units[i];
  u.eStop = on;
  if (!on) return;
  if (u.phase === 'running') tripUnit(p, i, 'Emergency stop');
  else if (u.phase !== 'rest') {
    u.phase = 'stopping';
    u.alarm = 'Emergency stop';
    u.syncing = false;
  } else u.alarm = 'Emergency stop';
}

export function trim(p: Plant, i: number, dHz: number, dV: number) {
  const u = p.units[i];
  u.setHz = Math.max(-2, Math.min(2, u.setHz + dHz));
  u.setV = Math.max(-0.1, Math.min(0.1, u.setV + dV));
}

export function openBreaker(p: Plant, i: number) {
  const u = p.units[i];
  if (!u.breaker) return;
  const before = online(p).length;
  u.breaker = false;
  u.kw = 0;
  p.events.push('breaker');
  if (before === 1) blackout(p, false);
  else bump(p, 0); // remaining sets pick the load up: handled by the step response in `step`
}

/** Close the generator breaker. On a dead bus it simply closes; on a live bus the check-synchroniser decides. */
export function closeBreaker(p: Plant, i: number) {
  const u = p.units[i];
  if (u.breaker || !available(u)) return say(p, `Genset ${i + 1} belum siap: tunggu putaran dan tegangan stabil.`);
  if (!busLive(p)) {
    u.breaker = true;
    u.angle = 0;
    p.busHz = u.hz;
    p.busV = u.volts;
    p.events.push('breaker');
    return say(p, `Genset ${i + 1} menyalakan bus yang mati (dead bus). Sekarang sambungkan penyulang satu per satu.`);
  }
  const d = syncDiff(p, u);
  const ok = Math.abs(d.hz) <= SYNC.hz && Math.abs(d.volts) <= SYNC.volts && Math.abs(d.deg) <= SYNC.deg;
  if (ok) {
    u.breaker = true;
    u.angle = 0;
    u.syncing = false;
    p.events.push('breaker');
    return say(p, `Genset ${i + 1} tersinkron dan masuk ke bus. Beban dibagi rata.`);
  }
  // Out-of-phase closing: a violent torque kick, the breaker trips on reverse power / overcurrent.
  p.stats.badSync++;
  p.events.push('badSync');
  const severe = Math.abs(d.deg) > 60;
  u.alarm = severe ? 'Sinkronisasi gagal (sudut besar)' : 'Sinkronisasi gagal';
  bump(p, severe ? -1.2 : -0.5);
  u.syncing = false;
  stopUnit(p, i);
  u.phase = 'stopping';
  say(
    p,
    `DUAR! Breaker genset ${i + 1} ditutup saat belum sinkron (selisih ${d.deg.toFixed(0)}°, ${d.hz.toFixed(2)} Hz). Poros dan kopling menerima hentakan, proteksi menjatuhkan genset. Tutup hanya saat jarum di jam 12 dan bergerak pelan.`,
  );
}

export function setSync(p: Plant, i: number, on: boolean) {
  const u = p.units[i];
  if (on && (!available(u) || u.breaker)) return;
  u.syncing = on;
}

export function setFeeder(p: Plant, i: number, on: boolean) {
  const f = p.feeders[i];
  if (on && !busLive(p)) return say(p, 'Bus masih mati. Nyalakan genset dan tutup breakernya dulu.');
  if (f.on === on) return;
  f.on = on;
  p.events.push('feeder');
  if (on) bump(p, -(f.demand / Math.max(1, capacityKw(p))) * 2.2);
}

export function callTruck(p: Plant) {
  if (p.truckEta >= 0) return;
  p.truckEta = 25;
  say(p, 'Truk tangki 16.000 L dipanggil. Pengisian mulai sebentar lagi.');
}

export function tripUnit(p: Plant, i: number, why = 'Gangguan mesin') {
  const u = p.units[i];
  if (u.phase !== 'running') return;
  const was = u.breaker;
  u.alarm = why;
  p.stats.trips++;
  p.events.push('trip');
  if (u.breaker) openBreaker(p, i);
  u.phase = 'stopping';
  u.syncing = false;
  if (was && busLive(p)) bump(p, -(u.kw || PRIME_KW * 0.7) / Math.max(1, capacityKw(p)) * 2);
}

function bump(p: Plant, hzKick: number) {
  p.dip += hzKick;
}

function blackout(p: Plant, all = true) {
  for (const f of p.feeders) f.on = false;
  if (all) for (const u of p.units) if (u.breaker) u.breaker = false;
  p.busHz = 0;
  p.busV = 0;
  p.dip = 0;
  p.events.push('blackout');
  say(p, 'PADAM TOTAL (blackout). Mulai lagi dari black start: satu genset ke bus mati, lalu sinkronkan yang lain.');
}

function shedOne(p: Plant, reason: string) {
  const f = p.feeders.filter((x) => x.on).sort((a, b) => a.shedOrder - b.shedOrder)[0];
  if (!f) return;
  f.on = false;
  p.stats.shed++;
  p.events.push('shed');
  say(p, `${reason} Penyulang "${f.name}" dilepas otomatis supaya kawasan tidak padam total.`);
}

// ---------- step ----------

export function step(p: Plant, dt: number) {
  const simMin = dt * p.timeScale;
  p.clock += simMin;
  if (p.clock >= 1440) {
    p.clock -= 1440;
    p.day++;
  }
  const h = hourOf(p);
  // Feeder demand with a little flicker.
  p.feeders.forEach((f, i) => (f.demand = profile(i, h) * (1 + 0.015 * Math.sin(p.clock * 3.1 + i * 7))));

  // Units: start, run-up, free running frequency/voltage, cool-down.
  for (const u of p.units) {
    if (u.phase === 'crank') {
      u.timer -= dt;
      u.rpm = Math.min(180, u.rpm + 300 * dt);
      if (u.timer <= 0) {
        u.phase = 'running';
        u.rpm = 650;
      }
    }
    const running = u.phase === 'running' || u.phase === 'cooling';
    if (running && !u.breaker) {
      const target = (NOMINAL_HZ + u.setHz) * 30;
      u.rpm += Math.sign(target - u.rpm) * Math.min(Math.abs(target - u.rpm), dt * 260);
      u.hz = u.rpm / 30;
      const vT = u.rpm > 1100 ? NOMINAL_V * (1 + u.setV) * Math.min(1, u.rpm / 1500) : 12;
      u.volts += (vT - u.volts) * Math.min(1, dt / 0.6);
    }
    if (u.phase === 'cooling') {
      u.timer -= dt;
      if (u.timer <= 0) u.phase = 'stopping';
    }
    if (u.phase === 'stopping') {
      u.rpm = Math.max(0, u.rpm - dt * (u.rpm > 300 ? 260 : 120));
      u.hz = u.rpm / 30;
      u.volts = Math.max(0, u.volts - dt * 400);
      if (u.rpm === 0) u.phase = 'rest';
    }
    if (u.phase === 'rest') {
      u.rpm = 0;
      u.hz = 0;
      u.volts = 0;
    }
    // Auto-synchroniser: a small positive slip, voltage matched, closes in the window.
    if (u.syncing && busLive(p) && available(u) && !u.breaker) {
      const wantHz = p.busHz + 0.08 - NOMINAL_HZ;
      u.setHz += Math.sign(wantHz - u.setHz) * Math.min(Math.abs(wantHz - u.setHz), dt * 0.5);
      const wantV = p.busV / NOMINAL_V - 1;
      u.setV += Math.sign(wantV - u.setV) * Math.min(Math.abs(wantV - u.setV), dt * 0.05);
      const d = syncDiff(p, u);
      if (Math.abs(d.deg) < 5 && Math.abs(d.hz) < 0.15 && Math.abs(d.volts) < 0.02) closeBreaker(p, u.id);
    }
    if (!busLive(p) && u.syncing) u.syncing = false;
  }

  // Bus: isochronous load sharing holds 50 Hz while the sets can carry the load; beyond that it sags.
  const on = online(p);
  const load = loadKw(p);
  if (on.length) {
    const limit = on.length * LIMIT_KW;
    const share = load / on.length;
    for (const u of on) u.kw = share;
    const sag = load > limit ? (6 * (load - limit)) / limit : 0;
    // damped recovery of load-step dips
    const w = 2.4;
    const z = 0.6;
    p.dipV = (p.dipV ?? 0) + (-w * w * p.dip - 2 * z * w * p.dipV) * dt;
    p.dip += p.dipV * dt;
    const avgSet = on.reduce((a, u) => a + u.setHz, 0) / on.length;
    p.busHz = NOMINAL_HZ + avgSet * 0.2 + p.dip - sag;
    const avgV = on.reduce((a, u) => a + u.setV, 0) / on.length;
    p.busV = NOMINAL_V * (1 + avgV) * (1 - Math.max(0, -p.dip) * 0.01);
    for (const u of on) {
      u.hz = p.busHz;
      u.rpm = p.busHz * 30;
      u.volts = p.busV;
      u.angle = 0;
    }
    // Incoming sets drift in phase against the bus at their slip frequency.
    for (const u of p.units) if (!u.breaker && u.rpm > 0) u.angle += 2 * Math.PI * (u.hz - p.busHz) * dt;

    // Protection: under-frequency load shedding, then collapse.
    if (p.busHz < 48.5) p.underFor += dt;
    else p.underFor = 0;
    if (p.ufls && p.underFor > 0.8) {
      shedOne(p, `Frekuensi turun ke ${p.busHz.toFixed(1)} Hz.`);
      p.underFor = 0;
      p.dip += 0.3;
    }
    if (p.busHz < 47) p.collapseFor += dt;
    else p.collapseFor = 0;
    if (p.collapseFor > 2.5) {
      for (const u of on) {
        u.alarm = 'Under frequency';
        u.breaker = false;
        u.phase = 'stopping';
      }
      p.stats.trips += on.length;
      blackout(p);
    }
    // Sustained overload trips one set after a while (its electrical protection).
    if (share > LIMIT_KW * 1.05 && on.length) {
      p.demandT += dt;
      if (p.demandT > 8) {
        p.demandT = 0;
        tripUnit(p, on[on.length - 1].id, 'kW overload');
      }
    } else p.demandT = 0;
  } else {
    p.busHz = 0;
    p.busV = 0;
  }

  // Load-demand master: start the next set early, drop one when the load falls; restore feeders.
  if (p.master) master(p, dt);

  // Unit temperatures for the visuals and gauges.
  for (const u of p.units) {
    const lf = u.kw / PRIME_KW;
    const runningU = u.phase === 'running' || u.phase === 'cooling';
    u.coolant += ((runningU ? 79 + 10 * lf : 45) - u.coolant) * Math.min(1, dt / (runningU ? 60 : 600));
    u.exhaust += ((runningU ? 150 + 420 * lf : 30) - u.exhaust) * Math.min(1, dt / 20);
    if (runningU) u.hours += simMin / 60;
    if (u.faultRadiator && runningU) u.coolant += (118 - u.coolant) * Math.min(1, dt / 25);
    // Oil pressure as on the single set: ~4.6 bar warm at speed, lower while cranking; a leak drops it to a fifth.
    const oilNorm = u.rpm > 600 ? 4.6 - 0.02 * (u.coolant - 75) : u.rpm > 50 ? 0.4 + 0.004 * u.rpm : 0;
    const oilT = u.faultOil && u.rpm > 50 ? oilNorm * 0.18 : oilNorm;
    u.oil += (oilT - u.oil) * Math.min(1, dt / (u.faultOil ? 6 : 0.8));
    u.kwh += u.kw * (simMin / 60);
    if (u.phase === 'running' && u.rpm > 1200) {
      // DSE factory shutdown levels, as on the single set
      if (u.coolant > 96) tripUnit(p, u.id, 'Suhu air pendingin tinggi');
      else if (u.oil < 1.03) tripUnit(p, u.id, 'Tekanan oli rendah');
    }
  }

  // Fuel and energy on the fast clock.
  const hrs = simMin / 60;
  const litres = fuelRateL(p) * hrs;
  p.fuel = Math.max(0, p.fuel - litres);
  p.stats.litres += litres;
  p.stats.kwh += load * hrs;
  if (p.fuel <= 0) for (const u of p.units) if (u.phase === 'running') tripUnit(p, u.id, 'Solar habis');
  if (p.truckEta >= 0) {
    p.truckEta -= dt;
    if (p.truckEta < 0) {
      p.fuel = Math.min(TANK_L, p.fuel + TRUCK_L);
      p.events.push('truck');
      say(p, 'Truk tangki selesai mengisi 16.000 L.');
    }
  }
  // Customers without power.
  for (const f of p.feeders) if (!(f.on && busLive(p))) f.outageMin += simMin;
  p.stats.outageMin += p.feeders.filter((f) => !(f.on && busLive(p))).length * simMin;
}

function master(p: Plant, dt: number) {
  const on = online(p);
  const demand = demandKw(p);
  // Black start when the bus is dead.
  if (!on.length) {
    const ready = p.units.find((u) => u.auto && available(u));
    if (ready) closeBreaker(p, ready.id);
    else if (!p.units.some((u) => u.phase === 'crank' || (u.phase === 'running' && u.auto))) {
      const pick = p.units.filter((u) => u.auto && !u.alarm && u.phase === 'rest').sort((a, b) => a.hours - b.hours)[0];
      if (pick) startUnit(p, pick.id);
    }
    return;
  }
  const cap = on.length * PRIME_KW;
  // Start another set when the coming load would exceed ~80% of what is online.
  p.autoUp = demand > 0.8 * cap ? p.autoUp + dt : 0;
  if (p.autoUp > 1.5) {
    p.autoUp = 0;
    const incoming = p.units.find((u) => u.auto && !u.breaker && (u.phase === 'crank' || u.phase === 'running'));
    if (!incoming) {
      const pick = p.units.filter((u) => u.auto && !u.alarm && u.phase === 'rest').sort((a, b) => a.hours - b.hours)[0];
      if (pick) startUnit(p, pick.id);
    }
  }
  for (const u of p.units) if (u.auto && !u.breaker && available(u) && !u.syncing) setSync(p, u.id, true);
  // Drop a set when the rest could carry the load at under ~65%.
  p.autoDown = on.length > 1 && demand < 0.65 * (on.length - 1) * PRIME_KW ? p.autoDown + dt : 0;
  if (p.autoDown > 6) {
    p.autoDown = 0;
    const drop = on.filter((u) => u.auto).sort((a, b) => b.hours - a.hours)[0];
    if (drop) stopUnit(p, drop.id);
  }
  // Reconnect shed or open feeders, most important first, one at a time while there is headroom.
  p.autoFeederT -= dt;
  if (p.autoFeederT <= 0) {
    const next = p.feeders.filter((f) => !f.on).sort((a, b) => b.shedOrder - a.shedOrder)[0];
    if (next && loadKw(p) + next.demand < 0.95 * on.length * PRIME_KW) {
      setFeeder(p, next.id, true);
      p.autoFeederT = 3;
    }
  }
}
