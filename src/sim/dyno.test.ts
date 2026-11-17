import { describe, expect, it } from 'vitest';
import { createEngine, gensetFit, startEngine, startPull, steady, stepEngine, STOCK, type Build } from './dyno';

const FULL: Build = { ...STOCK, name: 'Full modif', bore: 164, stroke: 200, turbo: 'besar', intercooler: 'udara', injector: 1.35, map: 1.15, timing: 2, straight: true, bigRadiator: true };
const run = (e: ReturnType<typeof createEngine>, s: number, dt = 0.02) => {
  for (let t = 0; t < s; t += dt) stepEngine(e, dt);
};

describe('engine on the dyno', () => {
  it('stock makes about 2050 kW at 1500 rpm with sane exhaust temperature and no smoke', () => {
    const r = steady(STOCK, 1500);
    expect(r.power).toBeGreaterThan(1950);
    expect(r.power).toBeLessThan(2150);
    expect(r.egt).toBeGreaterThan(480);
    expect(r.egt).toBeLessThan(640);
    expect(r.smoke).toBeLessThan(0.05);
  });

  it('a full build makes much more power, runs hotter; dropping the intercooler costs power and heats the exhaust', () => {
    const full = steady(FULL, 1500);
    expect(full.power).toBeGreaterThan(2600);
    expect(full.egt).toBeGreaterThan(steady(STOCK, 1500).egt);
    const noIc = steady({ ...FULL, intercooler: 'tidak' }, 1500);
    expect(noIc.power).toBeLessThan(full.power);
    expect(noIc.egt).toBeGreaterThan(full.egt);
  });

  it('a jumbo turbo is weak low down and strong up top; too much fuel smokes', () => {
    const j = { ...STOCK, turbo: 'jumbo' as const, injector: 1.5, map: 1.1 };
    expect(steady(j, 1000).power).toBeLessThan(steady({ ...j, turbo: 'standar' }, 1000).power);
    expect(steady(j, 1800).power).toBeGreaterThan(steady({ ...j, turbo: 'standar' }, 1800).power);
    expect(steady({ ...STOCK, injector: 1.5, map: 1.4 }, 1500).smoke).toBeGreaterThan(0.3);
  });

  it('a dyno pull logs a curve; with no rev limiter, flooring it free wrecks the engine', () => {
    const e = createEngine();
    startEngine(e);
    run(e, 3);
    startPull(e);
    run(e, 12);
    expect(e.pull.active).toBe(false);
    expect(e.pull.points.length).toBeGreaterThan(20);
    const w = createEngine({ ...STOCK, limiter: 0 });
    startEngine(w);
    w.absorb = 0;
    w.throttle = 1;
    run(w, 20);
    expect(w.wrecked).toBe(true);
  });

  it('fitted to the genset, a bigger build has more than the alternator can use', () => {
    expect(gensetFit(STOCK).kwe).toBeGreaterThan(1850);
    expect(gensetFit(FULL).kwe).toBeGreaterThan(2250);
  });
});

describe('full custom', () => {
  it('forged internals stand cylinder pressure that blows a stock head gasket', () => {
    const hot: Build = { ...STOCK, turbo: 'custom', boost: 4.8, injector: 2, bore: 190, stroke: 230 };
    const a = createEngine(hot);
    const b = createEngine({ ...hot, forged: true });
    for (const e of [a, b]) {
      startEngine(e);
      run(e, 2);
      startPull(e);
      run(e, 14);
    }
    expect(a.dmg.gasket).toBeGreaterThan(b.dmg.gasket);
  });
});
