import { create as createStore } from 'zustand';
import { create, step, type Plant } from '../sim/plant';

export const plant: Plant = create();

export type PlantCam = 'hall' | 'inside' | 'control' | 'site' | 'complex';

interface PlantUI {
  tick: number;
  selected: number;
  inspect: boolean; // close-up of the selected set with the single-set tools
  hideUi: boolean; // overlays hidden (seated in the control room, or by the user)
  cam: PlantCam;
  toast: string;
  toastUntil: number;
  bump: () => void;
  set: (p: Partial<Omit<PlantUI, 'bump' | 'set'>>) => void;
}

export const usePlant = createStore<PlantUI>((set) => ({
  tick: 0,
  selected: 0,
  inspect: false,
  hideUi: false,
  cam: 'hall',
  toast: '',
  toastUntil: 0,
  bump: () => set((s) => ({ tick: s.tick + 1 })),
  set: (p) => set(p),
}));

const listeners = new Set<(e: string) => void>();
export const onPlantEvent = (f: (e: string) => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

export function advancePlant(dt: number) {
  const total = Math.min(dt, 0.1);
  const n = Math.max(1, Math.ceil(total / 0.02));
  for (let i = 0; i < n; i++) step(plant, total / n);
  if (plant.events.length) for (const e of plant.events.splice(0)) for (const f of listeners) f(e);
  if (plant.message) {
    usePlant.getState().set({ toast: plant.message, toastUntil: performance.now() + 7000 });
    plant.message = '';
  }
}

/** Hall layout: five sets in a row along x, radiators to the back wall (−z). */
export const UNIT_X = [-20, -10, 0, 10, 20];
export const HALL = { x0: -27, x1: 27, z0: -9, z1: 9, h: 9 };
