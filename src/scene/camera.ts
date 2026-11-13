import type { CameraControls } from '@react-three/drei';
import { createRef, type ElementRef } from 'react';
import type { PerspectiveCamera } from 'three';

export const controls = createRef<ElementRef<typeof CameraControls>>();

export interface View {
  pos: readonly number[];
  target: readonly number[];
}

export const PRESETS = {
  genset: { pos: [6.5, 4.2, 8.5], target: [0, 1.3, 0] },
  panel: { pos: [3.6, 2.1, 2.6], target: [2.72, 1.75, 0.62] },
  engine: { pos: [-0.6, 4.4, 3.6], target: [-0.5, 1.6, 0] },
  radiator: { pos: [-6, 2.6, 3.2], target: [-2.4, 1.4, 0] },
  site: { pos: [16, 10, 16], target: [2, 2, -6] },
  silent: { pos: [11, 6, 12], target: [0, 1.5, 0] },
} as const;

export type Preset = keyof typeof PRESETS;

// Screen space (px) covered by overlays, so the camera frames the subject in what stays visible.
let inset = { left: 0, right: 0, bottom: 0 };
export const setInset = (left: number, right: number, bottom: number) => (inset = { left, right, bottom });

export const goTo = (name: Preset, smooth = true) => goToView(PRESETS[name], smooth);

export function goToView({ pos, target }: View, smooth = true) {
  const c = controls.current;
  if (!c) return;
  const cam = c.camera as PerspectiveCamera;
  // Pull back on narrow screens so the subject still fits the width left visible by overlays.
  const visible = (innerWidth - inset.left - inset.right) / Math.max(1, innerHeight - inset.bottom);
  const k = Math.max(1, (innerWidth <= 900 ? 1.8 : 0.95) / visible);
  const p = pos.map((v, i) => target[i] + (v - target[i]) * k);
  c.setLookAt(p[0], p[1], p[2], target[0], target[1], target[2], smooth);
  const h = 2 * Math.hypot(...p.map((v, i) => v - target[i])) * Math.tan((cam.fov * Math.PI) / 360);
  c.setFocalOffset(((h * cam.aspect) / 2) * ((inset.right - inset.left) / innerWidth), (h / 2) * (inset.bottom / innerHeight), 0, smooth);
}
