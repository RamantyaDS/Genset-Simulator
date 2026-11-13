// Camera moves of the plant: whole-site presets, and the single set's presets around any one set in the hall.
import type { CameraControls } from '@react-three/drei';
import type { ElementRef } from 'react';
import { PRESETS } from '../scene/camera';
import { useUI } from '../store';
import { HALL, usePlant, UNIT_X, type PlantCam } from './store';

export const cams = { current: null as ElementRef<typeof CameraControls> | null };

const VIEWS: Record<PlantCam, [number[], number[]]> = {
  hall: [[16, 24, 34], [0, 2, 0]],
  inside: [[-25, 3.2, 6.5], [6, 2, -1]],
  control: [[27.9, 2.7, 0], [36, 1.4, 0]],
  site: [[-60, 45, 70], [0, 0, 10]],
  complex: [[95, 105, 300], [50, 0, 175]],
};
export const goPlant = (c: PlantCam) => {
  const [p, t] = VIEWS[c];
  cams.current?.setLookAt(p[0], p[1], p[2], t[0], t[1], t[2], true);
};

/** Set-local point (radiator −x, operator side +z) to hall coordinates: sets stand at z −4 turned −90° about y. */
export const unitWorld = (i: number, [lx, ly, lz]: readonly number[]): [number, number, number] => [UNIT_X[i] - lz, ly, -4 + lx];

export type UnitView = 'genset' | 'panel' | 'engine' | 'radiator' | 'exploded';
const UNIT_VIEWS: Record<UnitView, { pos: readonly number[]; target: readonly number[] }> = {
  ...PRESETS,
  radiator: { pos: [-4.4, 2.6, 2.6], target: [-2.4, 1.4, 0] }, // pulled in front of the back wall
};
export const goUnit = (i: number, v: UnitView = 'genset') => {
  const { pos, target } = UNIT_VIEWS[v];
  let p = unitWorld(i, pos);
  let t = unitWorld(i, target);
  // The end sets stand 7 m from the side walls: look from the other side rather than from outside the hall.
  if (p[0] < HALL.x0 + 1.5 || p[0] > HALL.x1 - 1.5) {
    const flip = (q: readonly number[]) => [q[0], q[1], -q[2]];
    p = unitWorld(i, flip(pos));
    t = unitWorld(i, flip(target));
  }
  cams.current?.setLookAt(p[0], p[1], p[2], t[0], t[1], t[2], true);
};

/** Walk up to one set: everything the single-set page offers then applies to it. */
export function inspectUnit(i: number) {
  usePlant.getState().set({ selected: i, inspect: true });
  useUI.getState().set({ explode: 0, xray: false, focus: null, panelOpen: false });
  goUnit(i);
}

export function leaveInspect() {
  usePlant.getState().set({ inspect: false });
  useUI.getState().set({ explode: 0, xray: false, focus: null, panelOpen: false });
  goPlant('inside');
}

// ---------- control room console and seats ----------

/** Control room origin in the plant, and the console arc in room coordinates (board on the +x wall). */
const ROOM_X = 32;
const ARC = { cx: -6.4, r: 8.6, span: 0.5 };
export const SEGMENTS = 6;

/** Position and heading of console segment k (0–4 the sets, 5 the bus), room coordinates. */
export function consoleSeg(k: number) {
  const a = -ARC.span + (k * 2 * ARC.span) / (SEGMENTS - 1);
  const x = ARC.cx + ARC.r * Math.cos(a);
  const z = ARC.r * Math.sin(a);
  return { x, z, rot: Math.atan2(-Math.cos(a), -Math.sin(a)) };
}

/** Sit in the chair at segment k: eye height of a seated operator, looking over the desk to the mimic board. */
export function goSeat(k: number) {
  const { x, z, rot } = consoleSeg(k);
  const fx = -Math.sin(rot); // facing direction (toward the board)
  const fz = -Math.cos(rot);
  const eye = [ROOM_X + x - fx * 1.25, 1.3, z - fz * 1.25];
  const look = [ROOM_X + 4.3, 1.45, z * 0.5]; // over the desk to the part of the mimic board in front of this seat
  cams.current?.setLookAt(eye[0], eye[1], eye[2], look[0], look[1], look[2], true);
}
