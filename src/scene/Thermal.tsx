// Thermal camera (FLIR-style): every surface is drawn in an "ironbow" palette by its temperature. Genset parts get their
// temperature from the simulation by part name; everything else sits at ambient. Text, lines and particles are hidden
// while it is on, as a real thermal imager would not show them.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { loadFrac } from '../sim/genset';
import { sim, useUI } from '../store';

export const T_MIN = 22;
export const T_MAX = 500;

/** Surface temperature of a genset part, °C. */
export function partTemp(part: string | undefined): number {
  const amb = useUI.getState().sky === 'siang' ? 33 : 26;
  const run = sim.rpm > 100;
  const lf = Math.min(1.2, loadFrac(sim));
  switch (part) {
    case 'turbo':
    case 'exhaust':
      return Math.max(amb, sim.exhaust * 0.92);
    case 'head':
    case 'rocker':
      return sim.coolant + (run ? 12 + 20 * lf : 0);
    case 'block':
    case 'thermostat':
    case 'waterpump':
    case 'front':
      return sim.coolant + (run ? 4 : 0);
    case 'sump':
    case 'oilfilter':
      return amb + (sim.coolant - amb) * 0.9 + (run ? 6 : 0);
    case 'radiator':
      return amb + (sim.coolant - amb) * (run ? 0.85 : 0.6);
    case 'aftercooler':
    case 'intake':
      return run ? amb + 25 + 20 * lf : amb + (sim.coolant - amb) * 0.3;
    case 'rotor':
    case 'stator':
    case 'exciter':
    case 'terminal':
      return amb + (run ? 20 + 60 * lf : 4);
    case 'starter':
      return amb + (sim.starter ? 30 : 5);
    case 'flywheel':
    case 'crank':
    case 'piston':
      return sim.coolant + (run ? 25 : 0);
    case 'fuelfilter':
      return amb + (run ? 15 : 2);
    default:
      return amb;
  }
}

const vert = /* glsl */ `
  varying vec3 vN;
  #include <common>
  #include <skinning_pars_vertex>
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    #ifdef USE_INSTANCING
      mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    #endif
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */ `
  uniform float heat; uniform float tMin; uniform float tMax; varying vec3 vN;
  vec3 ironbow(float t) {
    vec3 c0 = vec3(0.01, 0.0, 0.05), c1 = vec3(0.26, 0.0, 0.45), c2 = vec3(0.85, 0.05, 0.25);
    vec3 c3 = vec3(1.0, 0.5, 0.0), c4 = vec3(1.0, 0.92, 0.35), c5 = vec3(1.0, 1.0, 1.0);
    if (t < 0.2) return mix(c0, c1, t / 0.2);
    if (t < 0.45) return mix(c1, c2, (t - 0.2) / 0.25);
    if (t < 0.7) return mix(c2, c3, (t - 0.45) / 0.25);
    if (t < 0.9) return mix(c3, c4, (t - 0.7) / 0.2);
    return mix(c4, c5, (t - 0.9) / 0.1);
  }
  void main() {
    // square-root scale: ambient stays dark, warm engine parts read red-orange, exhaust parts yellow to white
    float t = sqrt(clamp((heat - tMin) / (tMax - tMin), 0.0, 1.0));
    float shade = 0.78 + 0.22 * max(dot(normalize(vN), normalize(vec3(0.3, 0.6, 0.75))), 0.0);
    gl_FragColor = vec4(ironbow(t) * shade, 1.0);
  }`;

const hiddenTypes = (o: THREE.Object3D) =>
  (o as THREE.Points).isPoints || (o as THREE.Line).isLine || ((o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined)?.type === 'InstancedBufferGeometry';

/** While on: override every material with the thermal shader, fed per object with its temperature. */
export function ThermalView() {
  const { scene } = useThree();
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { heat: { value: 30 }, tMin: { value: T_MIN }, tMax: { value: T_MAX } } }), []);
  const installed = useRef<Map<THREE.Object3D, { cb: THREE.Object3D['onBeforeRender']; vis: boolean }>>(new Map());
  const last = useRef(-1);
  const bg = useMemo(() => new THREE.Color('#05030a'), []);
  const uninstall = () => {
    for (const [o, v] of installed.current) {
      o.onBeforeRender = v.cb;
      o.visible = v.vis;
    }
    installed.current.clear();
    scene.overrideMaterial = null;
  };
  useEffect(() => uninstall, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ clock }) => {
    const on = useUI.getState().thermal;
    if (!on) {
      if (installed.current.size) uninstall();
      return;
    }
    scene.overrideMaterial = mat;
    scene.background = bg;
    if (clock.elapsedTime - last.current < 1) return; // pick up new objects about once a second
    last.current = clock.elapsedTime;
    scene.traverse((o) => {
      if (installed.current.has(o) || o === scene) return;
      if (hiddenTypes(o)) {
        installed.current.set(o, { cb: o.onBeforeRender, vis: o.visible });
        o.visible = false;
        return;
      }
      if (!(o as THREE.Mesh).isMesh) return;
      let p: THREE.Object3D | null = o;
      let part: string | undefined;
      while (p && !part) {
        part = p.userData.part;
        p = p.parent;
      }
      const name = part;
      installed.current.set(o, { cb: o.onBeforeRender, vis: o.visible });
      o.onBeforeRender = () => {
        mat.uniforms.heat.value = partTemp(name);
        mat.uniformsNeedUpdate = true;
      };
    });
  });
  return null;
}
