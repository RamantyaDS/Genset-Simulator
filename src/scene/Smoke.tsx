// Exhaust plume: a dark puff when the engine fires or takes a big load step, then a light haze that grows with load.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sim, onSimEvent } from '../store';
import { loadFrac } from '../sim/genset';

const N = 260;

const vert = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute float shade;
  varying float vAlpha;
  varying float vShade;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (420.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
    vAlpha = alpha;
    vShade = shade;
  }
`;
const frag = /* glsl */ `
  varying float vAlpha;
  varying float vShade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vec3(vShade), a);
  }
`;

export function Smoke({ at }: { at: [number, number, number] }) {
  const { geo, mat, parts } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(N), 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(N), 1));
    geo.setAttribute('shade', new THREE.BufferAttribute(new Float32Array(N), 1));
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false });
    const parts = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), age: 1, life: 1, dark: 0, size: 0 }));
    return { geo, mat, parts };
  }, []);
  const next = useRef(0);
  const acc = useRef(0);
  const soot = useRef(0); // extra darkness that fades after a puff

  const spawn = (dark: number, speed: number) => {
    const q = parts[next.current];
    next.current = (next.current + 1) % N;
    q.p.set(at[0] + (Math.random() - 0.5) * 0.1, at[1], at[2] + (Math.random() - 0.5) * 0.1);
    q.v.set((Math.random() - 0.5) * 0.3, speed * (0.8 + Math.random() * 0.4), (Math.random() - 0.5) * 0.3);
    q.age = 0;
    q.life = 2.5 + Math.random() * 2;
    q.dark = dark;
    q.size = 0.25 + Math.random() * 0.15;
  };

  useEffect(
    () =>
      onSimEvent((e) => {
        if (e === 'fire') soot.current = 1;
        if (e === 'gcbClose') soot.current = Math.max(soot.current, Math.min(1, loadFrac(sim) * 0.9 + 0.2));
      }),
    [],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const lf = loadFrac(sim);
    soot.current = Math.max(0, soot.current - dt * 0.35);
    if (sim.firing) {
      const rate = 6 + 22 * lf + 30 * soot.current;
      acc.current += rate * dt;
      const speed = 1.5 + 2.5 * (sim.rpm / 1500) + 2 * lf;
      while (acc.current > 1) {
        acc.current -= 1;
        spawn(Math.min(1, 0.15 + 0.25 * lf + 0.85 * soot.current), speed);
      }
    }
    const pos = geo.attributes.position.array as Float32Array;
    const size = geo.attributes.size.array as Float32Array;
    const alpha = geo.attributes.alpha.array as Float32Array;
    const shade = geo.attributes.shade.array as Float32Array;
    parts.forEach((q, i) => {
      if (q.age < q.life) {
        q.age += dt;
        q.v.y *= 1 - dt * 0.6;
        q.v.x += dt * 0.35; // light breeze
        q.p.addScaledVector(q.v, dt);
      }
      const t = Math.min(1, q.age / q.life);
      pos[i * 3] = q.p.x;
      pos[i * 3 + 1] = q.p.y;
      pos[i * 3 + 2] = q.p.z;
      size[i] = q.size * (1 + t * 6);
      alpha[i] = t >= 1 ? 0 : (1 - t) * (0.12 + 0.5 * q.dark) * Math.min(1, q.age * 6);
      shade[i] = 0.55 - 0.45 * q.dark + t * 0.15;
    });
    geo.attributes.position.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
    geo.attributes.shade.needsUpdate = true;
  });

  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
}
