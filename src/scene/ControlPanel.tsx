// Set-mounted control panel: white steel box on a post at the alternator end, with the live DSE7320 face behind its window.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { drawModule, H, W } from '../dse';
import { useUI } from '../store';
import { useGenset } from './source';
import { Box, Cyl, M } from './parts';

export const PANEL_POS: [number, number, number] = [2.72, 1.8, 0.62];

export function ControlPanel() {
  const src = useGenset();
  const sim = src.s;
  const { tex, ctx } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = W / 2;
    c.height = H / 2;
    const ctx = c.getContext('2d')!;
    ctx.scale(0.5, 0.5);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { tex, ctx };
  }, []);
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.1) return;
    last.current = clock.elapsedTime;
    drawModule(ctx, sim);
    tex.needsUpdate = true;
  });
  const [x, y, z] = PANEL_POS;
  return (
    <group>
      <Box s={[0.1, 1.5, 0.1]} m={M.steel} position={[x, 0.32 + 0.75, z - 0.18]} />
      <group
        position={[x, y, z]}
        onClick={(e) => {
          e.stopPropagation();
          if (src.pick?.()) return;
          useUI.getState().set({ panelOpen: true });
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <Box s={[0.62, 0.74, 0.3]} r={0.015} m={M.white} />
        {/* door frame and window */}
        <Box s={[0.56, 0.68, 0.01]} m={M.white} position={[0, 0, 0.152]} />
        <mesh position={[0, 0.08, 0.16]}>
          <planeGeometry args={[0.32, (0.32 * H) / W]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
        {/* emergency stop button */}
        <Cyl r={0.05} l={0.04} axis="z" m={M.yellow} position={[0, -0.22, 0.17]} />
        <Cyl r={0.032} l={0.05} axis="z" m={M.red} position={[0, -0.22, 0.2]} />
        <Cyl r={0.012} l={0.04} axis="z" m={M.steel} position={[0.24, -0.02, 0.17]} />
      </group>
    </group>
  );
}
