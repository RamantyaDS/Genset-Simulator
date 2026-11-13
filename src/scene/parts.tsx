// Small building blocks and shared materials for the procedural genset model. Units are metres.
import { RoundedBox } from '@react-three/drei';
import type { ThreeElements } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';

export const M = {
  teal: new THREE.MeshStandardMaterial({ color: '#1aa8a4', metalness: 0.25, roughness: 0.42 }),
  tealDark: new THREE.MeshStandardMaterial({ color: '#12807d', metalness: 0.25, roughness: 0.5 }),
  base: new THREE.MeshStandardMaterial({ color: '#9ca2a6', metalness: 0.3, roughness: 0.6 }),
  alt: new THREE.MeshStandardMaterial({ color: '#41474d', metalness: 0.35, roughness: 0.5 }),
  black: new THREE.MeshStandardMaterial({ color: '#18191b', metalness: 0.2, roughness: 0.7 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#0d0d0e', metalness: 0, roughness: 0.9 }),
  silver: new THREE.MeshStandardMaterial({ color: '#c7cacc', metalness: 0.75, roughness: 0.35 }),
  steel: new THREE.MeshStandardMaterial({ color: '#8b9095', metalness: 0.85, roughness: 0.3 }),
  cast: new THREE.MeshStandardMaterial({ color: '#4a4744', metalness: 0.6, roughness: 0.6 }),
  // turbine housings and exhaust stubs: glow when hot (driven by HotMetal in Genset.tsx)
  hot: new THREE.MeshStandardMaterial({ color: '#4a4744', metalness: 0.6, roughness: 0.6, emissive: '#000000' }),
  white: new THREE.MeshStandardMaterial({ color: '#eceeee', metalness: 0.1, roughness: 0.45 }),
  red: new THREE.MeshStandardMaterial({ color: '#c3232b', metalness: 0.2, roughness: 0.45 }),
  yellow: new THREE.MeshStandardMaterial({ color: '#e8b923', metalness: 0.2, roughness: 0.5 }),
  copper: new THREE.MeshStandardMaterial({ color: '#b87333', metalness: 0.9, roughness: 0.35 }),
  canopy: new THREE.MeshStandardMaterial({ color: '#21aeb0', metalness: 0.3, roughness: 0.45 }),
  canopyDark: new THREE.MeshStandardMaterial({ color: '#4a5056', metalness: 0.3, roughness: 0.55 }),
  blue: new THREE.MeshStandardMaterial({ color: '#2f5f8f', metalness: 0.4, roughness: 0.5 }),
  greyLight: new THREE.MeshStandardMaterial({ color: '#b8bdc1', metalness: 0.35, roughness: 0.55 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#d7dadc', metalness: 1, roughness: 0.15 }),
};

type V3 = [number, number, number];
type MeshProps = Omit<ThreeElements['mesh'], 'args'>;

export function Box({ s, r = 0, m, ...p }: MeshProps & { s: V3; r?: number; m: THREE.Material }) {
  if (r > 0)
    return <RoundedBox args={s} radius={r} smoothness={2} material={m} castShadow receiveShadow {...(p as object)} />;
  return (
    <mesh material={m} castShadow receiveShadow {...p}>
      <boxGeometry args={s} />
    </mesh>
  );
}

const ROT = { x: [0, 0, Math.PI / 2] as V3, y: [0, 0, 0] as V3, z: [Math.PI / 2, 0, 0] as V3 };

/** Cylinder along an axis. `r2` makes a cone. */
export function Cyl({
  r,
  r2,
  l,
  axis = 'y',
  seg = 24,
  m,
  open = false,
  ...p
}: MeshProps & { r: number; r2?: number; l: number; axis?: 'x' | 'y' | 'z'; seg?: number; m: THREE.Material; open?: boolean }) {
  return (
    <mesh material={m} rotation={ROT[axis]} castShadow receiveShadow {...p}>
      <cylinderGeometry args={[r2 ?? r, r, l, seg, 1, open]} />
    </mesh>
  );
}

/** A pipe or hose following points. */
export function Pipe({ pts, r, m, seg = 48 }: { pts: V3[]; r: number; m: THREE.Material; seg?: number }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.2);
    return new THREE.TubeGeometry(curve, seg, r, 12, false);
  }, [pts, r, seg]);
  return <mesh geometry={geo} material={m} castShadow receiveShadow />;
}

/** Ring of bolts on a flange face (axis x). */
export function BoltRing({ r, n, m, ...p }: ThreeElements['group'] & { r: number; n: number; m: THREE.Material }) {
  return (
    <group {...p}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return <Cyl key={i} r={0.012} l={0.03} axis="x" seg={6} m={m} position={[0, Math.cos(a) * r, Math.sin(a) * r]} />;
      })}
    </group>
  );
}

/** Canvas texture helper: draws once with the given painter. */
export function useCanvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(...repeat);
    }
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
