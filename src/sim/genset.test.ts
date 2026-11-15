import { describe, expect, it } from 'vitest';
import { BULK_L, TANK_L, TIMERS, callTanker, create, drainFuel, fuelRate, genAvailable, hz, pressAuto, pressManual, pressStart, pressStop, pressTest, pressTransfer, setEStop, setMains, statusText, step, type State } from './genset';

const run = (s: State, seconds: number, dt = 0.05) => {
  for (let t = 0; t < seconds; t += dt) step(s, dt);
};

describe('auto mains failure', () => {
  it('starts, takes the load, hands it back and cools down', () => {
    const s = create();
    expect(statusText(s)[1]).toBe('Auto Mode');
    setMains(s, false);
    run(s, TIMERS.mainsTransient + 1);
    expect(s.mcb).toBe(false);
    expect(s.phase).toBe('startDelay');
    run(s, TIMERS.startDelay);
    expect(s.phase).toBe('crank');
    expect(s.starter).toBe(true);
    run(s, 25);
    expect(s.firing).toBe(true);
    expect(genAvailable(s)).toBe(true);
    expect(s.gcb).toBe(true);
    expect(s.genKw).toBe(1200);
    expect(statusText(s)[0]).toBe('Generator On Load');

    setMains(s, true);
    run(s, TIMERS.returnDelay - 2);
    expect(s.gcb).toBe(true);
    run(s, 4);
    expect(s.gcb).toBe(false);
    expect(s.mcb).toBe(true);
    expect(s.phase).toBe('cooling');
    run(s, TIMERS.cooling + 20);
    expect(s.firing).toBe(false);
    expect(s.rpm).toBe(0);
    expect(s.phase).toBe('rest');
  });

  it('keeps speed near 50 Hz and recovers after a load step', () => {
    const s = create();
    s.demandKw = 0;
    setMains(s, false);
    run(s, 40);
    expect(hz(s)).toBeCloseTo(50, 1);
    s.demandKw = 1350;
    run(s, 0.6);
    expect(hz(s)).toBeLessThan(49.5);
    run(s, 6);
    expect(Math.abs(hz(s) - 50)).toBeLessThan(0.1);
  });

  it('gives up after three crank attempts without fuel', () => {
    const s = create();
    s.fuel = 0;
    s.bulk = 0; // nothing for the transfer pump either
    setMains(s, false);
    run(s, 2 + TIMERS.startDelay + 3 * TIMERS.crank + 2 * TIMERS.crankRest + 2);
    expect(s.alarms).toContain('failStart');
    expect(s.attempt).toBe(3);
    expect(s.starter).toBe(false);
  });

  it('trips the breaker on sustained overload', () => {
    const s = create();
    setMains(s, false);
    run(s, 30);
    expect(s.gcb).toBe(true);
    s.demandKw = 2100;
    run(s, TIMERS.overloadTrip + 1);
    expect(s.alarms).toContain('overloadTrip');
    expect(s.gcb).toBe(false);
  });
});

describe('manual mode', () => {
  it('starts on the start button and transfers only when asked', () => {
    const s = create();
    pressManual(s);
    pressStart(s);
    expect(s.phase).toBe('crank');
    run(s, 20);
    expect(genAvailable(s)).toBe(true);
    expect(s.gcb).toBe(false);
    pressTransfer(s, true);
    run(s, 2);
    expect(s.gcb).toBe(true);
    expect(s.mcb).toBe(false);
    pressStop(s);
    expect(s.gcb).toBe(false);
    expect(s.mcb).toBe(true);
    run(s, 20);
    expect(s.rpm).toBe(0);
  });

  it('emergency stop shuts down and blocks starting', () => {
    const s = create();
    pressManual(s);
    pressStart(s);
    run(s, 20);
    setEStop(s, true);
    run(s, 20);
    expect(s.rpm).toBe(0);
    pressStart(s);
    expect(s.phase).toBe('rest');
  });
});

describe('testing without a mains failure', () => {
  it('runs off load in manual while the building stays on PLN', () => {
    const s = create();
    pressManual(s);
    pressStart(s);
    run(s, 25);
    expect(genAvailable(s)).toBe(true);
    expect(s.mcb).toBe(true);
    expect(s.gcb).toBe(false);
    expect(s.genKw).toBe(0);
  });

  it('feeds a load bank without touching the building supply', () => {
    const s = create();
    pressManual(s);
    pressStart(s);
    run(s, 25);
    s.loadBankOn = true;
    s.loadBankKw = 900;
    run(s, 1);
    expect(s.genKw).toBe(900);
    expect(s.mcb).toBe(true);
    expect(fuelRate(s)).toBeCloseTo(234, 0);
  });

  it('test mode takes the building load, and auto hands it back', () => {
    const s = create();
    pressTest(s);
    pressStart(s);
    run(s, 25);
    expect(s.gcb).toBe(true);
    expect(s.mcb).toBe(false);
    pressAuto(s);
    run(s, TIMERS.returnDelay + 2);
    expect(s.mcb).toBe(true);
    expect(s.gcb).toBe(false);
    expect(s.phase).toBe('cooling');
  });
});

describe('engine protections', () => {
  it('shuts down on low oil pressure after the safety delay', () => {
    const s = create();
    pressManual(s);
    pressStart(s);
    run(s, 25);
    s.faultOil = true;
    run(s, 30);
    expect(s.alarms).toContain('lowOil');
    expect(s.firing).toBe(false);
  });

  it('warns then shuts down on high coolant temperature', () => {
    const s = create();
    pressTest(s);
    pressStart(s);
    run(s, 25);
    s.faultRadiator = true;
    let warned = false;
    for (let t = 0; t < 600 && s.firing; t += 0.1) {
      step(s, 0.1);
      if (s.alarms.includes('highTempWarn')) warned = true;
    }
    expect(warned).toBe(true);
    expect(s.alarms).toContain('highTemp');
    expect(s.coolant).toBeGreaterThanOrEqual(96);
  });
});

describe('restarting', () => {
  it('starts again after an overload trip and cool-down', () => {
    const s = create();
    pressTest(s);
    pressStart(s);
    run(s, 25);
    s.demandKw = 2100;
    run(s, TIMERS.overloadTrip + TIMERS.cooling + 20);
    expect(s.rpm).toBe(0);
    s.demandKw = 1200;
    pressManual(s);
    pressStart(s);
    run(s, 25);
    expect(s.alarms).not.toContain('lowOil');
    expect(genAvailable(s)).toBe(true);
  });

  it('starts again after a normal stop', () => {
    const s = create();
    pressManual(s);
    pressStart(s);
    run(s, 25);
    pressStop(s);
    run(s, 20);
    pressManual(s);
    pressStart(s);
    run(s, 25);
    expect(s.alarms).toEqual([]);
    expect(genAvailable(s)).toBe(true);
  });
});

describe('building UPS, outage stopwatch and fuel transfer', () => {
  const runFor = (s: ReturnType<typeof create>, sec: number) => {
    for (let t = 0; t < sec; t += 0.02) step(s, 0.02);
  };

  it('times the dark gap of a mains failure; the UPS keeps the critical load lit', () => {
    const s = create();
    setMains(s, false);
    runFor(s, 40);
    const o = s.outage;
    expect(o.normalBack).toBeGreaterThan(8);
    expect(o.normalBack).toBeLessThan(25);
    expect(o.normalDark).toBeCloseTo(o.normalBack, 0);
    expect(o.critDark).toBe(0);
    expect(o.steps.map((x) => x.label).join('|')).toContain('Breaker genset masuk');

    const n = create();
    n.upsOn = false;
    setMains(n, false);
    runFor(n, 40);
    expect(n.outage.critDark).toBeCloseTo(n.outage.normalDark, 1);
  });

  it('the transfer pump tops up the day tank from the bulk tank; the tanker refills the bulk', () => {
    const s = create();
    s.fuel = TANK_L * 0.5;
    const bulk = s.bulk;
    runFor(s, 60);
    expect(s.fuel).toBeGreaterThan(TANK_L * 0.5);
    expect(s.bulk).toBeLessThan(bulk);
    drainFuel(s);
    callTanker(s);
    runFor(s, 25);
    expect(s.bulk).toBeGreaterThan(BULK_L * 0.99); // the pump is already drawing from it
  });
});
