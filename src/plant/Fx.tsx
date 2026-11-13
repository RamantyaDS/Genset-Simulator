// Plant visual effects:
// - smoke: textured, rotating, growing puffs from the five stacks and steam from the mill boiler, carried by the wind,
//   lit warm from below near the hall lights; black puffs on starts and load steps (turbo lag), grey haze at overload
// - weather: rain streaks around the camera (not inside the hall), wind, lightning flashes and bolts
// - electrical: arc flash and sparks at a faulted 20 kV pole or at a set closed out of phase
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PANEL_POS } from '../scene/ControlPanel';
import { busLive, PRIME_KW } from '../sim/plant';
import { arcSound, setRain, thunder } from '../sound';
import { unitWorld } from './camera';
import { HALL, onPlantEvent, plant, UNIT_X } from './store';

export const STACK_Z = -3.26;
const STACK_TOP = HALL.h + 4.2;
const BOILER: [number, number, number] = [44, 34, 158];
const POLES = [30, 60, 90, 120, 150].map((z) => new THREE.Vector3(-4, 9, z));

/** Wind (m/s, blowing toward +x and a little +z): light on a clear night, strong in a storm. */
export const wind = () => (plant.weather === 'badai' ? 4.5 : plant.weather === 'hujan' ? 2.2 : 1.0);

// ---------- smoke ----------

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // a cluster of soft blobs reads as a billow rather than a disc
  for (let k = 0; k < 26; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 30;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r;
    const s = 18 + Math.random() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, s);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

interface Puff {
  p: THREE.Vector3;
  v: THREE.Vector3;
  age: number;
  life: number;
  dark: number; // 0 white steam … 1 black soot
  rot: number;
  spin: number;
  grow: number;
  warm: number; // lit from below by the hall lights
}

export function PlantSmoke() {
  const N = 1400;
  const { geo, mat, parts } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    for (const [k, n] of [['position', 3], ['size', 1], ['alpha', 1], ['shade', 1], ['rot', 1], ['warm', 1]] as const)
      geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(N * n), n));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { scale: { value: 800 }, map: { value: puffTexture() }, flash: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute float alpha; attribute float shade; attribute float rot; attribute float warm;
        uniform float scale; varying float vA; varying float vS; varying float vR; varying float vW;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*scale/-mv.z; gl_Position = projectionMatrix*mv;
          vA=alpha; vS=shade; vR=rot; vW=warm; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform float flash; varying float vA; varying float vS; varying float vR; varying float vW;
        void main(){
          vec2 c = gl_PointCoord - 0.5; float s = sin(vR), k = cos(vR);
          vec2 uv = vec2(k*c.x - s*c.y, s*c.x + k*c.y) + 0.5;
          float a = texture2D(map, uv).r * vA * smoothstep(0.5, 0.3, length(c));
          if (a < 0.003) discard;
          // night: moonlit grey-blue, warmed from below near the hall lights, white for a lightning flash
          vec3 base = vec3(vS) * vec3(0.55, 0.6, 0.72);
          vec3 col = mix(base, vec3(vS) * vec3(1.0, 0.78, 0.55), vW);
          col = mix(col, vec3(0.92, 0.95, 1.0), flash);
          gl_FragColor = vec4(col, a);
        }`,
    });
    const parts: Puff[] = Array.from({ length: N }, () => ({
      p: new THREE.Vector3(0, -99, 0),
      v: new THREE.Vector3(),
      age: 9,
      life: 1,
      dark: 0,
      rot: 0,
      spin: 0,
      grow: 1,
      warm: 0,
    }));
    return { geo, mat, parts };
  }, []);
  const acc = useRef(new Array(6).fill(0));
  const next = useRef(0);
  const soot = useRef(new Array(5).fill(0));
  const lastKw = useRef(new Array(5).fill(0));
  useEffect(
    () =>
      onPlantEvent((e) => {
        if (e === 'start') plant.units.forEach((u, i) => u.phase === 'crank' && (soot.current[i] = 1));
        if (e === 'lightning') flashUntil.t = performance.now() + 160;
      }),
    [],
  );
  const emit = (x: number, y: number, z: number, vy: number, dark: number, life: number, grow: number, warm: number) => {
    const q = parts[next.current];
    next.current = (next.current + 1) % N;
    q.p.set(x + (Math.random() - 0.5) * 0.25, y, z + (Math.random() - 0.5) * 0.25);
    q.v.set((Math.random() - 0.5) * 0.5, vy, (Math.random() - 0.5) * 0.5);
    q.age = 0;
    q.life = life * (0.8 + Math.random() * 0.4);
    q.dark = dark;
    q.rot = Math.random() * Math.PI * 2;
    q.spin = (Math.random() - 0.5) * 0.8;
    q.grow = grow;
    q.warm = warm;
  };
  useFrame(({ camera, size }, raw) => {
    const dt = Math.min(raw, 0.05);
    mat.uniforms.scale.value = (size.height / 2) * (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5];
    mat.uniforms.flash.value = performance.now() < flashUntil.t ? 0.6 : 0;
    plant.units.forEach((u, i) => {
      const lf = u.kw / PRIME_KW;
      const dKw = u.kw - lastKw.current[i];
      lastKw.current[i] = u.kw;
      if (dKw > 50) soot.current[i] = Math.min(1, soot.current[i] + dKw / 1100);
      soot.current[i] = Math.max(0, soot.current[i] - dt * 0.3);
      if (u.rpm < 200) return;
      // Diesel exhaust: a puff stream whose density follows load; black on starts and load steps; grey at overload.
      acc.current[i] += dt * (8 + 16 * lf + 40 * soot.current[i]);
      while (acc.current[i] > 1) {
        acc.current[i]--;
        const dark = Math.min(1, 0.12 + 0.22 * lf + 0.35 * Math.max(0, lf - 1) * 4 + soot.current[i]);
        emit(UNIT_X[i], STACK_TOP, STACK_Z, 3.5 + 4 * lf, dark, 4 + 2 * (1 - soot.current[i]), 1 + soot.current[i], 1);
      }
    });
    // Mill boiler: dense white steam/smoke while the mill is processing.
    const mill = busLive(plant) && plant.feeders[0].on && plant.feeders[0].demand > 600;
    if (mill) {
      acc.current[5] += dt * 14;
      while (acc.current[5] > 1) {
        acc.current[5]--;
        emit(BOILER[0], BOILER[1], BOILER[2], 4, 0.05, 7, 3.2, 0);
      }
    }
    const w = wind();
    const pos = geo.attributes.position.array as Float32Array;
    const sz = geo.attributes.size.array as Float32Array;
    const al = geo.attributes.alpha.array as Float32Array;
    const sh = geo.attributes.shade.array as Float32Array;
    const ro = geo.attributes.rot.array as Float32Array;
    const wa = geo.attributes.warm.array as Float32Array;
    parts.forEach((q, i) => {
      if (q.age < q.life) {
        q.age += dt;
        q.v.multiplyScalar(1 - dt * 0.9); // jet slows
        q.v.y += dt * 0.6; // buoyancy of hot gas
        q.v.x += (w - q.v.x) * dt * 0.5; // carried off by the wind
        q.v.z += (w * 0.3 - q.v.z) * dt * 0.3;
        q.p.addScaledVector(q.v, dt);
        q.rot += q.spin * dt;
      }
      const t = Math.min(1, q.age / q.life);
      pos[i * 3] = q.p.x;
      pos[i * 3 + 1] = q.p.y;
      pos[i * 3 + 2] = q.p.z;
      sz[i] = (0.7 + t * 6.5) * q.grow;
      // fades in fast, then thins out as it spreads; rain knocks it down a little
      const fade = Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
      al[i] = t >= 1 ? 0 : fade * (0.18 + 0.55 * q.dark) * (plant.weather === 'cerah' ? 1 : 0.8);
      sh[i] = 0.85 - 0.75 * q.dark + 0.2 * t;
      ro[i] = q.rot;
      wa[i] = q.warm * Math.max(0, 1 - t * 3) * 0.7;
    });
    for (const k of ['position', 'size', 'alpha', 'shade', 'rot', 'warm']) geo.attributes[k].needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

// ---------- weather ----------

const flashUntil = { t: 0 };

/** Rain streaks in a box that follows the camera; drops inside the hall or control room are hidden. */
export function Rain() {
  const N = 5000;
  const { camera } = useThree();
  const { geo, drops } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    const drops = Array.from({ length: N }, () => new THREE.Vector3((Math.random() - 0.5) * 60, Math.random() * 40, (Math.random() - 0.5) * 60));
    return { geo, drops };
  }, []);
  const lines = useRef<THREE.LineSegments>(null);
  const mat = useRef<THREE.LineBasicMaterial>(null);
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const on = plant.weather !== 'cerah';
    lines.current!.visible = on;
    if (!on) return;
    const heavy = plant.weather === 'badai';
    const active = heavy ? N : N * 0.55;
    const w = wind();
    const c = camera.position;
    const pos = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const d = drops[i];
      d.y -= dt * 22;
      d.x += dt * w * 0.8;
      if (d.y < 0) d.y += 40;
      if (d.x > 30) d.x -= 60;
      const x = c.x + d.x;
      const y = Math.max(0, c.y - 15) + d.y;
      const z = c.z + d.z;
      const inside = (x > HALL.x0 && x < 36.6 && z > HALL.z0 && z < HALL.z1 && y < HALL.h + 1) || i > active;
      const o = i * 6;
      if (inside) {
        pos[o + 1] = pos[o + 4] = -999;
        continue;
      }
      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 2] = z;
      pos[o + 3] = x - w * 0.05;
      pos[o + 4] = y + 0.7;
      pos[o + 5] = z;
    }
    geo.attributes.position.needsUpdate = true;
    mat.current!.opacity = heavy ? 0.42 : 0.3;
  });
  useEffect(() => {
    const id = setInterval(() => setRain(plant.weather === 'cerah' ? 0 : plant.weather === 'hujan' ? 0.5 : 1), 500);
    return () => {
      clearInterval(id);
      setRain(0);
    };
  }, []);
  return (
    <lineSegments ref={lines} geometry={geo} frustumCulled={false}>
      <lineBasicMaterial ref={mat} color="#a9bfd6" transparent opacity={0.35} depthWrite={false} />
    </lineSegments>
  );
}

/** Lightning: a jagged bolt and a sky-wide flash; when a strike faults a feeder it lands on that line. */
export function Lightning() {
  const bolt = useRef<THREE.Line>(null);
  const light = useRef<THREE.DirectionalLight>(null);
  const until = useRef(0);
  const target = useRef(new THREE.Vector3());
  const geo = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3)), []);
  const line = useMemo(
    () => new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color('#e8f0ff').multiplyScalar(4), toneMapped: false })),
    [geo],
  );
  const build = (to: THREE.Vector3) => {
    const a = geo.attributes.position.array as Float32Array;
    const top = new THREE.Vector3(to.x + (Math.random() - 0.5) * 40, 140, to.z + (Math.random() - 0.5) * 40);
    for (let k = 0; k < 24; k++) {
      const t = k / 23;
      const p = top.clone().lerp(to, t);
      if (k > 0 && k < 23) p.add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
      a.set([p.x, p.y, p.z], k * 3);
    }
    geo.attributes.position.needsUpdate = true;
  };
  useEffect(
    () =>
      onPlantEvent((e) => {
        if (e === 'lightning') {
          target.current.set((Math.random() - 0.5) * 300, 0, 60 + Math.random() * 200);
          build(target.current);
          until.current = performance.now() + 260;
          thunder(0.4 + Math.random() * 2.2);
        } else if (e.startsWith('fault:') && performance.now() < until.current) {
          // the same strike hit a feeder: redraw it onto that line
          build(POLES[+e.slice(6) % POLES.length]);
          thunder(0.15);
        }
      }),
    [],
  );
  useFrame(() => {
    const left = until.current - performance.now();
    const on = left > 0;
    bolt.current!.visible = on && (left > 180 || left < 90);
    light.current!.intensity = on ? (left > 180 || left < 90 ? 6 : 1.5) : 0;
  });
  return (
    <>
      <primitive object={line} ref={bolt} visible={false} />
      <directionalLight ref={light} position={[0, 200, 120]} intensity={0} color="#dfe8ff" />
    </>
  );
}

// ---------- electrical arcs ----------

/** Sparks and a blue-white flash where a fault or a bad synchronisation happens. */
export function Arcs() {
  const N = 300;
  const { geo, sparks } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const sparks = Array.from({ length: N }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), life: 0 }));
    return { geo, sparks };
  }, []);
  const light = useRef<THREE.PointLight>(null);
  const until = useRef(0);
  const next = useRef(0);
  const burst = (at: THREE.Vector3, n: number) => {
    light.current!.position.copy(at);
    until.current = performance.now() + 220;
    for (let k = 0; k < n; k++) {
      const s = sparks[next.current];
      next.current = (next.current + 1) % N;
      s.p.copy(at);
      s.v.set((Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9);
      s.life = 0.5 + Math.random() * 0.6;
    }
    arcSound();
  };
  useEffect(
    () =>
      onPlantEvent((e) => {
        if (e.startsWith('fault:')) burst(POLES[+e.slice(6) % POLES.length], 80);
        if (e.startsWith('arc:')) {
          const i = +e.slice(4);
          burst(new THREE.Vector3(...unitWorld(i, PANEL_POS)), 120);
        }
      }),
    [],
  );
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const left = until.current - performance.now();
    light.current!.intensity = left > 0 ? 300 * (left / 220) * (0.6 + Math.random() * 0.4) : 0;
    const a = geo.attributes.position.array as Float32Array;
    sparks.forEach((s, k) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 9.8 * dt;
        s.p.addScaledVector(s.v, dt);
        if (s.p.y < 0.05) {
          s.p.y = 0.05;
          s.v.multiplyScalar(0.3);
        }
      } else s.p.y = -99;
      a.set([s.p.x, s.p.y, s.p.z], k * 3);
    });
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <>
      <points geometry={geo} frustumCulled={false}>
        <pointsMaterial color={new THREE.Color('#ffd27a').multiplyScalar(3)} size={0.12} sizeAttenuation toneMapped={false} />
      </points>
      <pointLight ref={light} intensity={0} distance={40} color="#cfe0ff" />
    </>
  );
}
