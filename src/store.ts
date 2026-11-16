import { create as createStore } from 'zustand';
import { create, step, type SimEvent, type State } from './sim/genset';

// The simulation state is mutated in place every tick; `tick` bumps so React panels re-render at a modest rate.
export const sim: State = create();

export type View = 'open' | 'silent';

interface UI {
  tick: number;
  view: View;
  xray: boolean;
  explode: 0 | 1 | 2; // 0 assembled, 1 main assemblies apart, 2 every part apart
  speed: number;
  panelOpen: boolean;
  focus: string | null; // part the info card describes
  tour: number | null; // open chapter of the guided tour
  mode: 'single' | 'plant' | 'bengkel'; // one genset, the five-unit power plant, or the engine workshop
  sky: 'malam' | 'siang';
  weather: 'cerah' | 'hujan' | 'badai';
  cinematic: boolean; // camera follows the AMF sequence
  logOpen: boolean; // engine logbook dialog
  isoOpen: boolean; // ISO 8528 recorder
  scopeOpen: boolean; // three-phase oscilloscope
  atsOpen: boolean; // ATS cabinet door open
  thermal: boolean; // thermal camera view
  cylinder: boolean; // bullet-time cylinder cutaway
  cylSpeed: number; // seconds per four-stroke cycle
  room: boolean; // open set inside a genset room
  hideUi: boolean; // overlays hidden
  hq: boolean; // ambient occlusion and other costly effects
  plnAutoReturn: boolean; // after a lightning strike the mains comes back by itself
  bump: () => void;
  set: (p: Partial<Omit<UI, 'bump' | 'set'>>) => void;
}

export const useUI = createStore<UI>((setState) => ({
  tick: 0,
  view: 'open',
  xray: false,
  explode: 0,
  speed: 1,
  panelOpen: true,
  focus: null,
  tour: null,
  mode: (['plant', 'bengkel'].includes(new URLSearchParams(location.search).get('mode') ?? '') ? new URLSearchParams(location.search).get('mode') : 'single') as 'single' | 'plant' | 'bengkel',
  sky: 'malam',
  weather: 'cerah',
  cinematic: false,
  logOpen: false,
  isoOpen: false,
  scopeOpen: false,
  atsOpen: false,
  thermal: false,
  cylinder: false,
  cylSpeed: 8,
  room: false,
  hideUi: false,
  hq: innerWidth > 900,
  plnAutoReturn: true,
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
