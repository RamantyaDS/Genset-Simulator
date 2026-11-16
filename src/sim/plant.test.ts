import { beforeEach, describe, expect, it, vi } from 'vitest';

// The plant has random events (motor starts, ships, faults). A fixed-seed generator keeps every run of the tests the
// same while still exercising them.
beforeEach(() => {
  let seed = 12345;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  });
});
import { busLive, busLoadKw, closeBreaker, feederFault, SERVICE_RP, startService, create, DAY_L, startScenario, drainDayTank, loadKw, online, PRIME_KW, setEStop, setFeeder, startUnit, step, syncDiff, trim, type Plant } from './plant';

const run = (p: Plant, s: number, dt = 0.02) => {
  for (let t = 0; t < s; t += dt) step(p, dt);
};
const warm = (p: Plant, i: number) => {
  startUnit(p, i);
  run(p, 12);
};

describe('black start and synchronising', () => {
  it('closes the first set onto a dead bus and picks up feeders', () => {
    const p = create();
    p.clock = 10 * 60;
    warm(p, 0);
    closeBreaker(p, 0);
    expect(busLive(p)).toBe(true);
    setFeeder(p, 1, true);
    run(p, 5);
    expect(p.busHz).toBeCloseTo(50, 0);
    expect(loadKw(p)).toBeGreaterThan(800);
  });

  it('accepts a set only inside the synchronising window', () => {
    const p = create();
    warm(p, 0);
    closeBreaker(p, 0);
    warm(p, 1);
    // slip the incoming set slightly fast and wait for the pointer to come round to 12 o'clock
    trim(p, 1, 0.1, 0);
    let closed = false;
    for (let t = 0; t < 30 && !closed; t += 0.02) {
      step(p, 0.02);
      const d = syncDiff(p, p.units[1]);
      if (Math.abs(d.deg) < 5 && Math.abs(d.hz) < 0.2) {
        closeBreaker(p, 1);
        closed = p.units[1].breaker;
      }
    }
    expect(closed).toBe(true);
    expect(p.stats.badSync).toBe(0);
  });

  it('trips a set closed out of phase', () => {
    const p = create();
    warm(p, 0);
    closeBreaker(p, 0);
    warm(p, 1);
    p.units[1].angle = Math.PI / 2; // 90° out
    closeBreaker(p, 1);
    expect(p.units[1].breaker).toBe(false);
    expect(p.stats.badSync).toBe(1);
    expect(p.units[1].alarm).not.toBeNull();
  });
});

describe('load', () => {
  it('shares the load equally and sheds a feeder when one set has to carry everything', () => {
    const p = create();
    p.clock = 19.5 * 60; // evening peak
    p.timeScale = 0;
    for (const i of [0, 1, 2]) warm(p, i);
    closeBreaker(p, 0);
    for (const i of [1, 2]) {
      p.units[i].angle = 0;
      p.units[i].hz = p.busHz;
      p.units[i].volts = p.busV;
      closeBreaker(p, i);
    }
    for (let f = 0; f < 5; f++) setFeeder(p, f, true);
    run(p, 6);
    const kws = online(p).map((u) => u.kw);
    expect(Math.max(...kws) - Math.min(...kws)).toBeLessThan(1);
    // lose two sets: one 2000 kW set cannot hold ~4 MW, under-frequency shedding kicks in
    p.units[1].breaker = false;
    p.units[2].breaker = false;
    run(p, 6);
    expect(p.stats.shed).toBeGreaterThan(0);
  });

  it('the load-demand master runs the plant through a day without a blackout', () => {
    const p = create();
    p.master = true;
    p.timeScale = 6; // a day in four minutes
    run(p, 240, 0.05);
    expect(p.day).toBe(2);
    expect(p.stats.kwh).toBeGreaterThan(50000);
    expect(p.events.filter((e) => e === 'blackout').length).toBe(0);
    expect(p.stats.litres / p.stats.kwh).toBeLessThan(0.33);
  });
});

describe('faults on one set', () => {
  it('a blocked radiator, an oil leak and the E-stop each shut the set down, as on the single set', () => {
    const p = create();
    for (const i of [0, 1, 2]) warm(p, i);
    p.units[0].faultRadiator = true;
    p.units[1].faultOil = true;
    setEStop(p, 2, true);
    run(p, 120);
    expect(p.units[0].alarm).toBe('Suhu air pendingin tinggi');
    expect(p.units[1].alarm).toBe('Tekanan oli rendah');
    expect(p.units[2].alarm).toBe('Emergency stop');
    startUnit(p, 2);
    expect(p.units[2].phase).toBe('rest'); // latched until released
  });
});

describe('testing one set like the single set', () => {
  it('a load bank loads a set off the bus, and overload above 110% trips it', () => {
    const p = create();
    warm(p, 0);
    const u = p.units[0];
    u.loadBank = true;
    u.loadBankKw = 1800;
    run(p, 6);
    expect(u.kw).toBe(1800);
    expect(u.hz).toBeGreaterThan(49.5);
    u.loadBankKw = 2100;
    run(p, 8);
    expect(u.alarm).toBe('kW overload');
  });

  it('base load holds one set at its setting while the others share the rest', () => {
    const p = create();
    for (const i of [0, 1, 2]) warm(p, i);
    closeBreaker(p, 0);
    for (const i of [1, 2]) {
      p.units[i].angle = 0;
      p.units[i].hz = p.busHz;
      p.units[i].volts = p.busV;
      closeBreaker(p, i);
    }
    for (let f = 0; f < 3; f++) setFeeder(p, f, true);
    p.units[0].baseKw = PRIME_KW;
    run(p, 3);
    const load = busLoadKw(p); // includes any random motor start surge
    expect(p.units[0].kw).toBeCloseTo(Math.min(PRIME_KW, load), 0);
    expect(p.units[1].kw).toBeCloseTo((load - p.units[0].kw) / 2, 0);
  });

  it('each engine burns from its own day tank, refilled by the transfer pump; an empty one stops the set', () => {
    const p = create();
    p.timeScale = 20;
    warm(p, 0);
    p.units[0].loadBank = true;
    p.units[0].loadBankKw = 1500;
    const bulk = p.fuel;
    run(p, 30);
    expect(p.units[0].dayTank).toBeGreaterThan(DAY_L * 0.5);
    expect(p.fuel).toBeLessThan(bulk);
    p.units[0].pumpAuto = false;
    drainDayTank(p, 0);
    run(p, 1);
    expect(p.units[0].alarm).toBe('Solar habis');
  });
});

describe('scenarios', () => {
  it('overhaul locks G3; peak crop runs the mill at 90 t/h through the night', () => {
    const p = create();
    startScenario(p, 'overhaul');
    startUnit(p, 2);
    expect(p.units[2].phase).toBe('rest');
    expect(p.goal?.id).toBe('overhaul');
    startScenario(p, 'panen');
    expect(p.units[2].locked).toBe(false);
    expect(p.tph).toBe(90);
    expect(p.pksAllDay).toBe(true);
  });
});

describe('the heavier complex', () => {
  it('peaks near 6 MW, and the master keeps up even on the 20x clock, motor starts and all', () => {
    for (let k = 0; k < 3; k++) {
      const p = create();
      p.master = true;
      p.timeScale = 20;
      let peak = 0;
      for (let t = 0; t < 72; t += 0.02) {
        step(p, 0.02);
        peak = Math.max(peak, loadKw(p));
      }
      expect(peak).toBeGreaterThan(5800);
      expect(p.stats.trips).toBe(0);
      expect(p.stats.shed).toBe(0);
    }
  });
});

describe('operations: UPS, faults, service, costs', () => {
  const live = () => {
    const p = create();
    warm(p, 0);
    closeBreaker(p, 0);
    run(p, 0.5);
    return p;
  };

  it('a UPS carries its load with no break when the bus goes, then recharges', () => {
    const p = live();
    expect(p.ups[0].onBattery).toBe(false);
    p.units[0].breaker = false; // lose the bus
    run(p, 3);
    expect(p.ups[0].onBattery).toBe(true);
    expect(p.ups[0].charge).toBeLessThan(1);
  });

  it('a transient fault recloses; a permanent one locks out until the crew is done', () => {
    const p = live();
    setFeeder(p, 3, true);
    feederFault(p, 3, false, '');
    expect(p.feeders[3].on).toBe(false);
    run(p, 2);
    expect(p.feeders[3].on).toBe(true);
    feederFault(p, 3, true, '');
    run(p, 8);
    expect(p.feeders[3].lockout).toBe(true);
    setFeeder(p, 3, true);
    expect(p.feeders[3].on).toBe(false);
    p.timeScale = 20;
    run(p, 12);
    expect(p.feeders[3].lockout).toBe(false);
  });

  it('a service takes the set out for about four hours and resets its counter; costs add up', () => {
    const p = create();
    p.timeScale = 20;
    startService(p, 4);
    expect(p.units[4].locked).toBe(true);
    startUnit(p, 4);
    expect(p.units[4].phase).toBe('rest');
    run(p, 13);
    expect(p.units[4].locked).toBe(false);
    expect(p.units[4].sinceService).toBe(0);
    expect(p.costRp).toBe(SERVICE_RP);
  });
});
