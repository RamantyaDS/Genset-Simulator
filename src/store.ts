import { create as createStore } from 'zustand';
import { create, step, type SimEvent, type State } from './sim/genset';

// The simulation state is mutated in place every tick; `tick` bumps so React panels re-render at a modest rate.
export const sim: State = create();

export type View = 'open' | 'silent';

interface UI {
  tick: number;
  view: View;
  xray: boolean;
  explode: boolean;
  speed: number;
  panelOpen: boolean;
  focus: string | null; // part the info card describes
  bump: () => void;
  set: (p: Partial<Omit<UI, 'bump' | 'set'>>) => void;
}

export const useUI = createStore<UI>((setState) => ({
  tick: 0,
  view: 'open',
  xray: false,
  explode: false,
  speed: 1,
  panelOpen: true,
  focus: null,
  bump: () => setState((s) => ({ tick: s.tick + 1 })),
  set: (p) => setState(p),
}));

/** Runs the simulation; called from the render loop with real elapsed seconds. */
export function advance(dt: number) {
  const k = useUI.getState().speed;
  const total = Math.min(dt, 0.1) * k;
  const n = Math.ceil(total / 0.02);
  for (let i = 0; i < n; i++) step(sim, total / n);
  if (sim.events.length) {
    const evs = sim.events.splice(0);
    for (const e of evs) for (const f of listeners) f(e);
  }
}

const listeners = new Set<(e: SimEvent) => void>();
/** Subscribe to controller events (breaker clicks, starter, alarms). Returns an unsubscribe function. */
export function onSimEvent(f: (e: SimEvent) => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}
