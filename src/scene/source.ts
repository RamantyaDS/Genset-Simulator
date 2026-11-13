// Which simulation drives a detailed genset model. The single-set page uses the global `sim` and the global view
// settings; the plant hall gives each of its five sets its own state, shaft angle and engine-block material, and only
// the selected set follows the exploded / X-ray view.
import { createContext, useContext } from 'react';
import type * as THREE from 'three';
import type { State } from '../sim/genset';
import { sim, useUI } from '../store';

export interface GensetSource {
  s: State;
  shaft: { angle: number };
  plant: boolean;
  view: () => { explode: 0 | 1 | 2; xray: boolean };
  /** Plant hall: a click on a set that is not selected selects it (returns true) instead of inspecting the part. */
  pick?: () => boolean;
  /** Engine block material to turn to glass, when the set has its own copy. */
  block?: THREE.MeshStandardMaterial;
}

export const GensetCtx = createContext<GensetSource>({ s: sim, shaft: { angle: 0 }, plant: false, view: () => useUI.getState() });
export const useGenset = () => useContext(GensetCtx);
