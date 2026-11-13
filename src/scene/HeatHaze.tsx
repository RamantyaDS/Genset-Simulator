// Heat shimmer: a screen-space post effect that wobbles the image inside soft columns of hot air, one rising from the
// exhaust outlet and one blowing out of the radiator. Strength follows exhaust and coolant temperature.
import { useFrame, useThree } from '@react-three/fiber';
import { Effect } from 'postprocessing';
import { forwardRef, useMemo } from 'react';
import * as THREE from 'three';
import { sim } from '../store';

const frag = /* glsl */ `
  uniform vec2 a0; uniform vec2 b0; uniform float w0; uniform float s0;
  uniform vec2 a1; uniform vec2 b1; uniform float w1; uniform float s1;
  uniform float time; uniform float aspect;

  float column(vec2 p, vec2 a, vec2 b, float w, out float h) {
    vec2 pa = p - a, ba = b - a;
    h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    vec2 d = (pa - ba * h) * vec2(aspect, 1.0);
    // widens as the air rises, fades out toward the top
    float r = w * (0.6 + 0.8 * h);
    return (1.0 - smoothstep(0.0, r, length(d))) * (1.0 - h) * smoothstep(0.0, 0.08, h);
  }

  vec2 wobble(vec2 p, float t) {
    float n1 = sin(p.y * 140.0 - t * 7.0 + sin(p.x * 90.0 + t * 2.3) * 2.0);
    float n2 = sin(p.x * 120.0 + t * 5.0 + sin(p.y * 70.0 - t * 1.7) * 2.0);
    return vec2(n1 * n2, n1 * 0.6);
  }

  void mainUv(inout vec2 uv) {
    float h;
    float m = column(uv, a0, b0, w0, h) * s0;
    m += column(uv, a1, b1, w1, h) * s1;
    if (m > 0.0) uv += wobble(uv, time) * m * 0.0035;
  }
`;

class HeatHazeEffect extends Effect {
  constructor() {
    const u = (v: unknown) => new THREE.Uniform(v);
    super('HeatHaze', frag, {
      uniforms: new Map<string, THREE.Uniform>([
        ['a0', u(new THREE.Vector2())],
        ['b0', u(new THREE.Vector2())],
        ['w0', u(0)],
        ['s0', u(0)],
        ['a1', u(new THREE.Vector2())],
        ['b1', u(new THREE.Vector2())],
        ['w1', u(0)],
        ['s1', u(0)],
        ['time', u(0)],
        ['aspect', u(1)],
      ]),
    });
  }
}

type V3 = [number, number, number];
export interface HazeSources {
  exhaust: { from: V3; to: V3; width: number };
  radiator: { from: V3; to: V3; width: number };
}

export const HeatHaze = forwardRef<HeatHazeEffect, { sources: HazeSources }>(function HeatHaze({ sources }, ref) {
  const effect = useMemo(() => new HeatHazeEffect(), []);
  const camera = useThree((s) => s.camera);
  const v = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock, size }) => {
    const U = effect.uniforms;
    const toUv = (p: V3, out: THREE.Vector2) => {
      v.set(...p).project(camera);
      out.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
      return v.z < 1;
    };
    // Projected width of a column: project a point offset sideways by `width` metres.
    const widthAt = (p: V3, w: number) => {
      right.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(w);
      const a = v.set(...p).project(camera).clone();
      const b = v.set(p[0] + right.x, p[1] + right.y, p[2] + right.z).project(camera);
      return Math.abs(b.x - a.x) * 0.5 * (size.width / size.height);
    };
    const ex = sources.exhaust;
    const rd = sources.radiator;
    const okEx = toUv(ex.from, U.get('a0')!.value) && toUv(ex.to, U.get('b0')!.value);
    const okRd = toUv(rd.from, U.get('a1')!.value) && toUv(rd.to, U.get('b1')!.value);
    U.get('w0')!.value = widthAt(ex.from, ex.width);
    U.get('w1')!.value = widthAt(rd.from, rd.width);
    const exHot = sim.firing ? Math.max(0, Math.min(1, (sim.exhaust - 120) / 380)) : Math.max(0, (sim.exhaust - 80) / 600);
    const fan = Math.min(1, sim.rpm / 1500);
    const rdHot = fan * Math.max(0, Math.min(1, (sim.coolant - 55) / 35));
    U.get('s0')!.value = okEx ? exHot : 0;
    U.get('s1')!.value = okRd ? rdHot * 0.6 : 0;
    U.get('time')!.value = clock.elapsedTime;
    U.get('aspect')!.value = size.width / size.height;
  });

  return <primitive ref={ref} object={effect} dispose={null} />;
});
