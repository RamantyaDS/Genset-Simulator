import { describe, expect, it } from 'vitest';
import { TIMERS, create, genAvailable, hz, pressManual, pressStart, pressStop, pressTransfer, setEStop, setMains, statusText, step, type State } from './genset';

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
