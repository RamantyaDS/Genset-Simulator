// Sky, weather and the cinematic camera of the single-set scene.
// - Sky: night (the default look) or day.
// - Weather: rain streaks, wet glossy ground, and in a thunderstorm lightning flashes; a strike on the PLN pole trips
//   the mains, which comes back by itself after a while unless the user turns that off.
// - Director: when cinematic mode is on, the camera follows the AMF sequence shot by shot.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { setMains } from '../sim/genset';
import { setRain, thunder } from '../sound';
import { onSimEvent, sim, useUI } from '../store';
import { goTo, goToView } from './camera';
import { POLE_POS } from './sitePos';

// ---------- sky ----------

const NIGHT = { bg: '#1b2532', hemi: 0.5, sun: 1.6, sunColor: '#ffe2c0', env: 0.55 };
const DAY = { bg: '#9db9d3', hemi: 1.1, sun: 3.2, sunColor: '#fff6e6', env: 1.0 };

/** Background, fog and the main lights follow day or night, darkened under rain clouds. */
export function SkyLight({ hemi, sun }: { hemi: React.RefObject<THREE.HemisphereLight>; sun: React.RefObject<THREE.DirectionalLight> }) {
  const scene = useThree((s) => s.scene);
  const col = useMemo(() => new THREE.Color(), []);
  const dayBg = useMemo(() => new THREE.Color(DAY.bg), []);
  const daySun = useMemo(() => new THREE.Color(DAY.sunColor), []);
  const k = useRef(0);
  useFrame((_, dt) => {
    const { sky, weather } = useUI.getState();
    k.current += ((sky === 'siang' ? 1 : 0) - k.current) * Math.min(1, dt * 1.5);
    const cloud = weather === 'cerah' ? 1 : weather === 'hujan' ? 0.7 : 0.5;
    const t = k.current;
    col.set(NIGHT.bg).lerp(dayBg, t).multiplyScalar(weather === 'cerah' ? 1 : 0.75 + 0.25 * (1 - t));
    scene.background = col;
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(col);
    if (hemi.current) hemi.current.intensity = (NIGHT.hemi + (DAY.hemi - NIGHT.hemi) * t) * (0.6 + 0.4 * cloud);
    if (sun.current) {
      sun.current.intensity = (NIGHT.sun + (DAY.sun - NIGHT.sun) * t) * cloud;
      sun.current.color.set(NIGHT.sunColor).lerp(daySun, t);
    }
  });
  return null;
}

// ---------- weather ----------

const wind = () => (useUI.getState().weather === 'badai' ? 3.5 : 1.2);

function Rain() {
  const N = 4000;
  const { camera } = useThree();
  const { geo, drops } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    const drops = Array.from({ length: N }, () => new THREE.Vector3((Math.random() - 0.5) * 50, Math.random() * 30, (Math.random() - 0.5) * 50));
    return { geo, drops };
  }, []);
  const lines = useRef<THREE.LineSegments>(null);
  const mat = useRef<THREE.LineBasicMaterial>(null);
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const w = useUI.getState().weather;
    lines.current!.visible = w !== 'cerah';
    if (w === 'cerah') return;
    const active = w === 'badai' ? N : N * 0.55;
    const c = camera.position;
    const pos = geo.attributes.position.array as Float32Array;
    const wd = wind();
    for (let i = 0; i < N; i++) {
      const d = drops[i];
      d.y -= dt * 20;
      d.x += dt * wd * 0.8;
      if (d.y < 0) d.y += 30;
      if (d.x > 25) d.x -= 50;
      const o = i * 6;
      if (i > active) {
        pos[o + 1] = pos[o + 4] = -999;
        continue;
      }
      const x = c.x + d.x;
      const y = Math.max(0, c.y - 12) + d.y;
      const z = c.z + d.z;
      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 2] = z;
      pos[o + 3] = x - wd * 0.05;
      pos[o + 4] = y + 0.6;
      pos[o + 5] = z;
    }
    geo.attributes.position.needsUpdate = true;
    mat.current!.opacity = w === 'badai' ? 0.4 : 0.28;
  });
  useEffect(() => {
    const id = setInterval(() => {
      const w = useUI.getState().weather;
      setRain(w === 'cerah' ? 0 : w === 'hujan' ? 0.5 : 1);
    }, 500);
    return () => {
      clearInterval(id);
      setRain(0);
    };
  }, []);
  return (
    <lineSegments ref={lines} geometry={geo} frustumCulled={false}>
      <lineBasicMaterial ref={mat} color="#a9bfd6" transparent opacity={0.3} depthWrite={false} />
    </lineSegments>
  );
}

/** Lightning: random flashes in a storm; some strike the PLN pole and trip the mains. */
function Lightning() {
  const light = useRef<THREE.DirectionalLight>(null);
  const until = useRef(0);
  const returnAt = useRef(-1);
  const geo = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3)), []);
  const line = useMemo(
    () => new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color('#e8f0ff').multiplyScalar(4), toneMapped: false })),
    [geo],
  );
  const strike = (to: THREE.Vector3, near: boolean) => {
    const a = geo.attributes.position.array as Float32Array;
    const top = new THREE.Vector3(to.x + (Math.random() - 0.5) * 20, 80, to.z + (Math.random() - 0.5) * 20);
    for (let k = 0; k < 24; k++) {
      const p = top.clone().lerp(to, k / 23);
      if (k > 0 && k < 23) p.add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4));
      a.set([p.x, p.y, p.z], k * 3);
    }
    geo.attributes.position.needsUpdate = true;
    until.current = performance.now() + 260;
    thunder(near ? 0.1 : 0.6 + Math.random() * 2);
  };
  useFrame((_, dt) => {
    const ui = useUI.getState();
    if (ui.weather === 'badai' && Math.random() < dt / 7) {
      const hitPole = sim.mainsOk && Math.random() < 0.35;
      if (hitPole) {
        strike(new THREE.Vector3(POLE_POS[0], 9.5, POLE_POS[2]), true);
        setMains(sim, false);
        returnAt.current = ui.plnAutoReturn ? sim.t + 90 : -1;
      } else strike(new THREE.Vector3((Math.random() - 0.5) * 120, 0, -30 - Math.random() * 60), false);
    }
    if (returnAt.current >= 0 && sim.t > returnAt.current) {
      returnAt.current = -1;
      if (!sim.mainsOk) setMains(sim, true);
    }
    const left = until.current - performance.now();
    const on = left > 0 && (left > 180 || left < 90);
    line.visible = on;
    light.current!.intensity = left > 0 ? (on ? 5 : 1.2) : 0;
  });
  return (
    <>
      <primitive object={line} visible={false} />
      <directionalLight ref={light} position={[0, 60, 30]} intensity={0} color="#dfe8ff" />
    </>
  );
}

export function Weather() {
  const storm = useUI((s) => s.weather === 'badai');
  return (
    <>
      <Rain />
      {storm && <Lightning />}
    </>
  );
}

/** Ground material that darkens and turns glossy in rain, so lights reflect in it. */
export function useWetGround(color: string) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }), [color]);
  const wet = useRef(0);
  useFrame((_, dt) => {
    wet.current += ((useUI.getState().weather === 'cerah' ? 0 : 1) - wet.current) * Math.min(1, dt * 0.25);
    const w = wet.current;
    mat.roughness = 0.95 - 0.7 * w;
    mat.metalness = 0.2 * w;
    mat.color.set(color).multiplyScalar(1 - 0.35 * w);
  });
  return mat;
}

// ---------- cinematic director ----------

type Shot = { pos: number[]; target: number[] };
const SHOTS: Record<string, Shot> = {
  pole: { pos: [5, 6, 3], target: [POLE_POS[0], 7.5, POLE_POS[2]] },
  building: { pos: [8, 5, 6], target: [-1, 5, -19] },
  ats: { pos: [10.5, 2.2, -0.5], target: [7.6, 1.2, -4.5] },
  starter: { pos: [-0.2, 1.4, 2.9], target: [-0.9, 0.8, 0.5] },
  exhaust: { pos: [4.5, 3.8, 5], target: [0.74, 3.6, 0] },
  wide: { pos: [14, 9, 14], target: [-1, 3, -10] },
};

/** Cinematic mode: on each step of the AMF sequence the camera cuts to the part that matters. */
export function Director() {
  const back = useRef<number | null>(null);
  useEffect(() => {
    const shot = (name: string, holdThenReturn = 0) => {
      const { cinematic, tour, explode } = useUI.getState();
      if (!cinematic || tour !== null || explode) return;
      goToView(SHOTS[name]);
      if (back.current) clearTimeout(back.current);
      back.current = holdThenReturn ? window.setTimeout(() => goTo('genset'), holdThenReturn) : null;
    };
    const off = onSimEvent((e) => {
      if (e === 'mainsFail') {
        shot('pole');
        window.setTimeout(() => shot('building'), 1800);
      } else if (e === 'mcbOpen' && !sim.mainsOk) shot('ats');
      else if (e === 'starterOn') shot('starter');
      else if (e === 'fire') window.setTimeout(() => shot('exhaust'), 600);
      else if (e === 'gcbClose') shot('wide', 6000);
      else if (e === 'mainsReturn') shot('pole', 4000);
    });
    return () => {
      off();
      if (back.current) clearTimeout(back.current);
    };
  }, []);
  return null;
}
