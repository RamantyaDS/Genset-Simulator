// Glowing box around the part the user clicked, following it as it moves in the exploded view.
import { Edges } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useUI } from '../store';
import { focused } from './Genset';

const GLOW = new THREE.Color('#5fe3ff').multiplyScalar(3);

export function FocusHighlight() {
  const ref = useRef<THREE.Mesh>(null);
  const box = useMemo(() => new THREE.Box3(), []);
  const size = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const m = ref.current!;
    const obj = focused.obj;
    m.visible = !!useUI.getState().focus && !!obj;
    if (!m.visible || !obj) return;
    box.setFromObject(obj);
    box.getCenter(m.position);
    box.getSize(size);
    m.scale.set(size.x + 0.06, size.y + 0.06, size.z + 0.06);
  });
  return (
    <mesh ref={ref} visible={false} raycast={() => null}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#5fe3ff" transparent opacity={0.07} depthWrite={false} />
      <Edges color={GLOW} toneMapped={false} />
    </mesh>
  );
}
