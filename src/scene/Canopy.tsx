// Silent type: the set lives in a 40 ft high-cube container canopy (12.19 × 2.44 × 2.9 m), teal with a dark radiator end,
// roof silencer and ladder, after the Traknus product photo.
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useUI } from '../store';
import { Box, Cyl, M, Pipe, useCanvasTexture } from './parts';

export const CANOPY = { L: 12.19, W: 2.44, H: 2.9, base: 0.25 };
const L = CANOPY.L;
const W = CANOPY.W;
const H = CANOPY.H;

export function Canopy() {
  const ref = useRef<THREE.Group>(null);
  const louvre = useCanvasTexture(
    128,
    128,
    (g) => {
      g.fillStyle = '#3d4247';
      g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 16) {
        g.fillStyle = '#1b1e21';
        g.fillRect(0, y, 128, 7);
        g.fillStyle = '#5a6066';
        g.fillRect(0, y + 7, 128, 2);
      }
    },
    [4, 10],
  );
  const louvreMat = useRef(new THREE.MeshStandardMaterial({ map: louvre, metalness: 0.4, roughness: 0.6 })).current;
  const wall = useRef(M.canopy.clone()).current;
  const dark = useRef(M.canopyDark.clone()).current;
  const door = useRef(new THREE.MeshStandardMaterial({ color: '#1b9a9c', metalness: 0.3, roughness: 0.4 })).current;

  useFrame(() => {
    // X-ray turns the shell into glass so the machine inside shows.
    const ghost = useUI.getState().xray;
    for (const m of [wall, dark, louvreMat, door]) {
      m.transparent = true;
      m.opacity += ((ghost ? 0.12 : 1) - m.opacity) * 0.15;
      m.depthWrite = m.opacity > 0.9;
    }
  });

  const radEnd = 2.1; // length of the dark radiator section
  const tealLen = L - radEnd;
  const tealX = -L / 2 + radEnd + tealLen / 2;
  const doors = [-2.6, -0.9, 0.8, 3.6];

  return (
    <group ref={ref}>
      {/* skid */}
      <Box s={[L, CANOPY.base, W]} m={M.black} position={[0, CANOPY.base / 2, 0]} />
      {/* teal body */}
      <group position={[0, CANOPY.base, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={s} material={wall} position={[tealX, H / 2, (s * W) / 2]} castShadow receiveShadow>
            <boxGeometry args={[tealLen, H, 0.04]} />
          </mesh>
        ))}
        <mesh material={wall} position={[tealX, H, 0]} castShadow>
          <boxGeometry args={[tealLen, 0.05, W]} />
        </mesh>
        <mesh material={wall} position={[L / 2, H / 2, 0]} castShadow>
          <boxGeometry args={[0.04, H, W]} />
        </mesh>
        {/* doors on both long sides */}
        {[-1, 1].map((s) =>
          doors.map((x) => (
            <group key={`${s}${x}`} position={[x, 1.2, s * (W / 2 + 0.012)]}>
              <mesh material={door}>
                <boxGeometry args={[1.25, 2.05, 0.015]} />
              </mesh>
              <Box s={[0.04, 0.14, 0.03]} m={M.steel} position={[0.5, 0, s * 0.02]} />
              <Box s={[0.05, 0.05, 0.03]} m={M.steel} position={[-0.55, 0.85, s * 0.02]} />
              <Box s={[0.05, 0.05, 0.03]} m={M.steel} position={[-0.55, -0.85, s * 0.02]} />
            </group>
          )),
        )}
        {/* control panel viewing window */}
        <mesh position={[0.8 + 0.25, 1.55, W / 2 + 0.022]}>
          <planeGeometry args={[0.32, 0.26]} />
          <meshStandardMaterial color="#0b1418" metalness={0.9} roughness={0.1} />
        </mesh>
        {/* ladder */}
        {[-0.2, 0.2].map((dx) => (
          <Box key={dx} s={[0.04, H, 0.04]} m={dark} position={[-1.75 + dx, H / 2, W / 2 + 0.06]} />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <Box key={i} s={[0.4, 0.03, 0.03]} m={dark} position={[-1.75, 0.3 + i * 0.34, W / 2 + 0.06]} />
        ))}
        {/* dark radiator / air outlet end with louvres */}
        <group position={[-L / 2 + radEnd / 2, H / 2, 0]}>
          {[-1, 1].map((s) => (
            <mesh key={s} material={louvreMat} position={[0, 0, (s * W) / 2]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
              <planeGeometry args={[radEnd, H]} />
            </mesh>
          ))}
          <mesh material={louvreMat} position={[-radEnd / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[W, H]} />
          </mesh>
          <mesh material={dark} position={[0, H / 2, 0]}>
            <boxGeometry args={[radEnd, 0.05, W]} />
          </mesh>
        </group>
        {/* roof silencer */}
        <group position={[-0.8, H + 0.45, 0]}>
          <Cyl r={0.42} l={4.4} axis="x" seg={32} m={M.silver} />
          <Cyl r={0.44} l={0.04} axis="x" seg={32} m={M.steel} position={[-2.2, 0, 0]} />
          <Cyl r={0.44} l={0.04} axis="x" seg={32} m={M.steel} position={[2.2, 0, 0]} />
          {[-1.6, 1.6].map((x) => (
            <Box key={x} s={[0.12, 0.42, 0.7]} m={dark} position={[x, -0.3, 0]} />
          ))}
          <Pipe pts={[[2.2, 0, 0], [2.65, 0, 0], [2.85, 0.15, 0], [2.9, 0.5, 0]]} r={0.2} m={M.silver} />
        </group>
      </group>
    </group>
  );
}

/** Where exhaust leaves the silencer stack in silent mode (canopy coordinates). */
export const SILENT_STACK: [number, number, number] = [-0.8 + 2.9, CANOPY.base + H + 0.45 + 0.55, 0];
