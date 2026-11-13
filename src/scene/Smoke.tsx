// Exhaust plume, following how a big diesel actually smokes:
// - cranking: a thin white vapour of fuel that has not lit yet
// - catching: a thick black puff that lasts a second or two
// - cold running: blue-white haze until the coolant is warm
// - load steps: black soot while the turbos catch up (turbo lag), more for bigger steps
// - steady running: almost clear, light grey at heavy load, dark grey when overloaded
// The gas leaves the stack fast, slows, billows and drifts downwind as it cools.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { loadFrac } from '../sim/genset';
import { onSimEvent, sim } from '../store';

const N = 900;

const vert = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute float rot;
  attribute vec3 tint;
  uniform float scale;
  varying float vAlpha;
  varying float vRot;
  varying vec3 vTint;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vAlpha = alpha;
    vRot = rot;
    vTint = tint;
  }
`;
const frag = /* glsl */ `
  uniform sampler2D map;
  varying float vAlpha;
  varying float vRot;
  varying vec3 vTint;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
    vec4 t = texture2D(map, q);
    float a = t.a * vAlpha * smoothstep(0.5, 0.25, length(p));
    if (a < 0.004) discard;
    // light from above: upper side of each puff a bit brighter
    vec3 col = vTint * (0.85 + 0.3 * (0.5 - p.y)) * (0.75 + 0.25 * t.r);
    gl_FragColor = vec4(col * 0.8, a);
  }
`;

/** Cloudy puff texture: overlapping soft blobs. */
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 26; i++) {
    const x = 64 + (Math.random() - 0.5) * 60;
    const y = 64 + (Math.random() - 0.5) * 60;
    const r = 14 + Math.random() * 26;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const v = 200 + Math.floor(Math.random() * 55);
    grad.addColorStop(0, `rgba(${v},${v},${v},0.32)`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

const SOOT = new THREE.Color('#141414');
const HAZE = new THREE.Color('#8f9396');
const WHITE = new THREE.Color('#e4ebf2');

export function Smoke({ at }: { at: [number, number, number] }) {
  const { geo, mat, parts } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(N), 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(N), 1));
    geo.setAttribute('rot', new THREE.BufferAttribute(new Float32Array(N), 1));
    geo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { map: { value: puffTexture() }, scale: { value: 1000 } }, transparent: true, depthWrite: false });
    const parts = Array.from({ length: N }, () => ({
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      age: 1,
      life: 1,
      size: 0,
      grow: 1,
      rot: 0,
      spin: 0,
      a: 0,
      col: new THREE.Color(),
    }));
    return { geo, mat, parts };
  }, []);
  const next = useRef(0);
  const acc = useRef(0);
  const soot = useRef(0);
  const lastKw = useRef(0);

  useEffect(
    () =>
      onSimEvent((e) => {
        if (e === 'fire') soot.current = 1;
      }),
    [],
  );

  const spawn = (col: THREE.Color, alpha: number, speed: number, size: number) => {
    const q = parts[next.current];
    next.current = (next.current + 1) % N;
    const r = 0.12;
    q.p.set(at[0] + (Math.random() - 0.5) * r, at[1], at[2] + (Math.random() - 0.5) * r);
    q.v.set((Math.random() - 0.5) * 0.5, speed * (0.85 + Math.random() * 0.3), (Math.random() - 0.5) * 0.5);
    q.age = 0;
    q.life = 3.5 + Math.random() * 2.5;
    q.size = size * (0.8 + Math.random() * 0.4);
    q.grow = 5 + Math.random() * 5;
    q.rot = Math.random() * Math.PI * 2;
    q.spin = (Math.random() - 0.5) * 0.8;
    q.a = alpha;
    q.col.copy(col);
  };

  useFrame(({ camera, size: view }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    // World-size sprites: pixels = metres × focal length in pixels ÷ distance.
    mat.uniforms.scale.value = (view.height / 2) * (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5];
    const lf = loadFrac(sim);
    const spin = Math.min(1, sim.rpm / 1500);

    // Turbo lag: any rise in load gives a soot burst proportional to the step.
    const dKw = sim.genKw - lastKw.current;
    lastKw.current = sim.genKw;
    if (dKw > 0) soot.current = Math.min(1, soot.current + (dKw / 1800) * 1.8);
    soot.current = Math.max(0, soot.current - dt * 0.3);

    const cold = sim.firing ? Math.max(0, Math.min(1, (65 - sim.coolant) / 25)) * (1 - 0.6 * Math.min(1, lf)) : 0;
    const vapour = !sim.firing && sim.starter && sim.fuelOn && sim.rpm > 100 ? 1 : 0;
    const overload = Math.max(0, lf - 1) * 5;

    let rate = 0;
    if (sim.firing) rate = 18 + 45 * Math.min(1.2, lf) + 70 * soot.current + 25 * cold;
    else if (vapour) rate = 10;
    acc.current += rate * dt;
    const speed = sim.firing ? 3.5 + 4 * spin + 3.5 * Math.min(1, lf) : 1.2;
    while (acc.current > 1) {
      acc.current -= 1;
      const col = new THREE.Color();
      let a: number;
      if (vapour) {
        col.copy(WHITE);
        a = 0.09;
      } else {
        // Mix the three kinds of smoke by how much of each is present right now.
        const s = Math.min(1, soot.current + overload * 0.6);
        col.copy(HAZE).lerp(WHITE, cold).lerp(SOOT, s);
        a = 0.04 + 0.07 * Math.min(1, lf) + 0.65 * s + 0.22 * cold;
      }
      spawn(col, a, speed, 0.42 + 0.15 * Math.min(1, lf));
    }

    const pos = geo.attributes.position.array as Float32Array;
    const size = geo.attributes.size.array as Float32Array;
    const alpha = geo.attributes.alpha.array as Float32Array;
    const rot = geo.attributes.rot.array as Float32Array;
    const tint = geo.attributes.tint.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const q = parts[i];
      if (q.age < q.life) {
        q.age += dt;
        // drag slows the jet, buoyancy keeps it rising, wind carries it off
        q.v.multiplyScalar(1 - Math.min(0.9, dt * 2.2));
        q.v.y += dt * 0.6;
        q.v.x += dt * 0.55;
        q.v.z += dt * 0.12;
        q.p.addScaledVector(q.v, dt);
        q.rot += q.spin * dt;
      }
      const t = Math.min(1, q.age / q.life);
      pos[i * 3] = q.p.x;
      pos[i * 3 + 1] = q.p.y;
      pos[i * 3 + 2] = q.p.z;
      size[i] = q.size * (1 + t * q.grow);
      alpha[i] = t >= 1 ? 0 : q.a * Math.pow(1 - t, 1.4) * Math.min(1, q.age * 8);
      rot[i] = q.rot;
      tint[i * 3] = q.col.r + t * 0.12;
      tint[i * 3 + 1] = q.col.g + t * 0.12;
      tint[i * 3 + 2] = q.col.b + t * 0.12;
    }
    for (const k of ['position', 'size', 'alpha', 'rot', 'tint']) geo.attributes[k].needsUpdate = true;
  });

  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
}
