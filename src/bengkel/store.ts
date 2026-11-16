import { create as createStore } from 'zustand';
import { createEngine, stepEngine, STOCK, type Build, type Engine } from '../sim/dyno';

export const engine: Engine = createEngine(STOCK);

export interface SavedBuild {
  id: string;
  build: Build;
  curve: { rpm: number; kw: number; nm: number }[];
  peakKw: number;
  peakNm: number;
}

export interface Records {
  power: number; // highest peak power from a pull with no damage
  efficient: number; // lowest fuel per kW at 1500 rpm (L/kWh) from a pull
  lowTorque: number; // most torque at 1000 rpm
}

interface BengkelUI {
  tick: number;
  hideUi: boolean;
  saved: SavedBuild[];
  compare: string[];
  records: Records;
  bump: () => void;
  set: (p: Partial<Omit<BengkelUI, 'bump' | 'set'>>) => void;
}

const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
export const persist = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode: builds just won't survive a reload */
  }
};

export const useBengkel = createStore<BengkelUI>((set) => ({
  tick: 0,
  hideUi: false,
  saved: load<SavedBuild[]>('genset-builds', []),
  compare: [],
  records: load<Records>('genset-records', { power: 0, efficient: 0, lowTorque: 0 }),
  bump: () => set((s) => ({ tick: s.tick + 1 })),
  set: (p) => set(p),
}));

/** Throttle input: the slider sets a base, holding W / ↑ / the GAS button floors it. */
export const input = { base: 0, held: false };

const listeners = new Set<(e: string) => void>();
export const onEngineEvent = (f: (e: string) => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

export function advanceEngine(dt: number) {
  const total = Math.min(dt, 0.1);
  const n = Math.max(1, Math.ceil(total / 0.02));
  const want = input.held ? 1 : input.base;
  // the throttle pedal moves fast but not instantly
  engine.throttle += (want - engine.throttle) * Math.min(1, total * 8);
  for (let i = 0; i < n; i++) stepEngine(engine, total / n);
  if (engine.events.length) for (const e of engine.events.splice(0)) for (const f of listeners) f(e);
}
