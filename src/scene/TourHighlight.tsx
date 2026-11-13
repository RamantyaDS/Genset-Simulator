// Pulsing glow box around the part the open tour chapter talks about (genset coordinates).
import { Edges } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { CHAPTERS } from '../tour';
import { useUI } from '../store';

export const BOXES: Record<string, { c: [number, number, number]; s: [number, number, number] }> = {
  all: { c: [0, 1.32, 0], s: [6.2, 2.75, 2.45] },
  engine: { c: [-0.56, 1.45, 0], s: [3.0, 1.95, 1.75] },
  air: { c: [1.15, 2.2, 0], s: [1.75, 0.6, 1.75] },
  radiator: { c: [-2.4, 1.45, 0], s: [0.95, 2.35, 2.35] },
  alternator: { c: [1.72, 1.2, 0], s: [1.6, 1.85, 1.75] },
  panel: { c: [2.72, 1.8, 0.62], s: [0.8, 0.95, 0.5] },
  fuel: { c: [-0.75, 0.97, 0.68], s: [0.65, 0.5, 0.28] },
};
const GLOW = new THREE.Color('#ffd23a').multiplyScalar(3);

export function TourHighlight() {
  const tour = useUI((s) => s.tour);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current) mat.current.opacity = 0.06 + 0.05 * Math.sin(clock.elapsedTime * 4);
  });
  const part = tour === null ? undefined : CHAPTERS[tour].part;
  if (!part) return null;
  const b = BOXES[part];
  return (
    <mesh key={part} position={b.c}>
      <boxGeometry args={b.s} />
      <meshBasicMaterial ref={mat} color="#ffd23a" transparent opacity={0.08} depthWrite={false} />
      <Edges color={GLOW} toneMapped={false} />
    </mesh>
  );
}
