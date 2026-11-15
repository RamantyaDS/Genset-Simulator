// Set dressing for the open-type set: an optional genset room around it (cut away at the front so the set stays in
// view), and the small things that make it read as a real machine: name plates, warning labels, an oil stain.
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { normalPowered } from '../sim/genset';
import { sim, useUI } from '../store';
import { Box, Cyl, M } from './parts';

const ROOM = { x0: -8.6, x1: 6.9, z0: -3.6, z1: 4.6, h: 5 };
export const ROOM_STACK: [number, number, number] = [0.74, 6.1, 0];

function Louver({ w, h }: { w: number; h: number }) {
  const n = Math.floor(h / 0.12);
  return (
    <group>
      <Box s={[0.12, h + 0.12, w + 0.12]} m={M.cast} />
      {Array.from({ length: n }, (_, i) => (
        <Box key={i} s={[0.14, 0.03, w]} m={M.steel} position={[0, -h / 2 + 0.06 + i * 0.12, 0]} rotation={[0, 0, 0.6]} />
      ))}
    </group>
  );
}

function Fluorescent({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, ROOM.h - 0.5, z]}>
      <Box s={[1.3, 0.06, 0.18]} m={M.white} />
      <mesh position={[0, -0.04, 0]}>
        <boxGeometry args={[1.2, 0.03, 0.08]} />
        <meshStandardMaterial color="#ffffff" emissive="#f4f8ff" emissiveIntensity={2} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** A genset room: walls with the radiator discharge louver and attenuator, intake louvers, epoxy floor, lights,
 *  cable tray, and the exhaust riser with its silencer going up through the roof line. */
export function GensetRoom() {
  const g = useRef<THREE.Group>(null);
  const lights = useRef<THREE.Group>(null);
  useFrame(() => {
    const { room, view } = useUI.getState();
    g.current!.visible = room && view === 'open';
    const lit = normalPowered(sim) || sim.upsOnBattery;
    lights.current!.children.forEach((c) => {
      if ((c as THREE.PointLight).isPointLight) (c as THREE.PointLight).intensity = normalPowered(sim) ? 14 : lit ? 3 : 0;
    });
  });
  const { x0, x1, z0, z1, h } = ROOM;
  const W = x1 - x0;
  const D = z1 - z0;
  return (
    <group ref={g} visible={false}>
      {/* epoxy floor and walls */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(x0 + x1) / 2, 0.015, (z0 + z1) / 2]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#3d6b4f" roughness={0.35} metalness={0.05} />
      </mesh>
      <Box s={[W, h, 0.25]} m={M.greyLight} position={[(x0 + x1) / 2, h / 2, z0]} />
      {/* radiator end wall, with the discharge opening */}
      <Box s={[0.25, h, (D - 2.6) / 2]} m={M.greyLight} position={[x0, h / 2, z0 + (D - 2.6) / 4]} />
      <Box s={[0.25, h, (D - 2.6) / 2]} m={M.greyLight} position={[x0, h / 2, z1 - (D - 2.6) / 4]} />
      <Box s={[0.25, h - 2.9, 2.6]} m={M.greyLight} position={[x0, 2.9 + (h - 2.9) / 2, (z0 + z1) / 2]} />
      <Box s={[0.25, 0.1, 2.6]} m={M.greyLight} position={[x0, 0.05, (z0 + z1) / 2]} />
      <group position={[x0, 1.5, (z0 + z1) / 2]}>
        <Louver w={2.5} h={2.7} />
      </group>
      {/* attenuator splitters outside the discharge */}
      <Box s={[1.4, 2.9, 2.8]} m={M.canopyDark} position={[x0 - 0.85, 1.45, (z0 + z1) / 2]} />
      {/* duct from the radiator face to the louver */}
      <Box s={[-2.85 - x0, 0.06, 2.4]} m={M.canopyDark} position={[(x0 - 2.85) / 2, 2.62, 0]} />
      {/* intake end wall with two louvers */}
      <Box s={[0.25, h, D]} m={M.greyLight} position={[x1, h / 2, (z0 + z1) / 2]} />
      {[-1.6, 1.2].map((z) => (
        <group key={z} position={[x1 - 0.06, 2.6, z]}>
          <Louver w={1.8} h={1.8} />
        </group>
      ))}
      <Text position={[x1 - 0.14, 3.9, -0.2]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.22} color="#2b3036">
        UDARA MASUK
      </Text>
      <Text position={[x0 + 0.14, 3.2, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.22} color="#2b3036">
        UDARA PANAS KELUAR
      </Text>
      {/* exhaust riser, silencer under the roof line, rain cap */}
      <Cyl r={0.2} l={ROOM_STACK[1] - 2.62} m={M.silver} position={[0.74, (ROOM_STACK[1] + 2.62) / 2, 0]} />
      <Cyl r={0.5} l={2.6} axis="x" m={M.silver} position={[0.74, 4.4, -1.2]} />
      <Box s={[0.4, 1.0, 0.4]} m={M.silver} position={[0.74, 4.4, -0.55]} />
      <Cyl r={0.32} r2={0.22} l={0.2} m={M.cast} position={[0.74, ROOM_STACK[1] + 0.1, 0]} />
      {/* roof beams, cable tray, lights */}
      {[-6, -2, 2, 6].map((x) => (
        <Box key={x} s={[0.25, 0.35, D]} m={M.cast} position={[Math.min(x, x1 - 0.5), h - 0.18, (z0 + z1) / 2]} />
      ))}
      <Box s={[W - 1, 0.08, 0.5]} m={M.steel} position={[(x0 + x1) / 2, h - 0.9, z0 + 0.6]} />
      <group ref={lights}>
        {[-5, -1, 3].map((x) => (
          <Fluorescent key={x} x={x} z={0.8} />
        ))}
        <pointLight position={[-3, h - 0.8, 0.8]} intensity={14} distance={12} color="#f2f6ff" />
        <pointLight position={[3, h - 0.8, 0.8]} intensity={14} distance={12} color="#f2f6ff" />
      </group>
      <Text position={[(x0 + x1) / 2, h - 0.5, z0 + 0.14]} fontSize={0.35} color="#2b3036">
        RUANG GENSET
      </Text>
    </group>
  );
}

function Plate({ pos, rot, w, h, bg, color, text, size }: { pos: [number, number, number]; rot: [number, number, number]; w: number; h: number; bg: string; color: string; text: string; size: number }) {
  return (
    <group position={pos} rotation={rot}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={bg} metalness={0.4} roughness={0.5} />
      </mesh>
      <Text position={[0, 0, 0.002]} fontSize={size} color={color} maxWidth={w * 0.92} textAlign="center" lineHeight={1.15}>
        {text}
      </Text>
    </group>
  );
}

/** Name plates, warning labels and an oil stain, in the set's own frame (radiator −x, operator side +z). */
export function Details() {
  return (
    <group>
      <Plate pos={[2.43, 1.05, 0.0]} rot={[0, Math.PI / 2, 0]} w={0.42} h={0.26} bg="#c9ccd0" color="#1b2228" size={0.026} text={'STAMFORD P734H\n2250 kVA · 1800 kW\n400 V · 50 Hz · 0,8 pf\nIP23 · Kelas H'} />
      <Plate pos={[-0.3, 1.0, 0.563]} rot={[0, 0, 0]} w={0.36} h={0.16} bg="#c9ccd0" color="#1b2228" size={0.022} text={'PERKINS 4016-61TRG3\n1500 rpm · 61,1 L · V16'} />
      <Plate pos={[-2.34, 2.3, 1.12]} rot={[0, 0, 0]} w={0.32} h={0.22} bg="#ffcc00" color="#111" size={0.028} text={'⚠ AWAS\nKIPAS BERPUTAR'} />
      <Plate pos={[1.62, 1.95, 0.505]} rot={[0, 0, 0]} w={0.3} h={0.2} bg="#ffcc00" color="#111" size={0.026} text={'⚠ BAHAYA\nTEGANGAN TINGGI'} />
      <Plate pos={[0.74, 2.0, 0.66]} rot={[0, 0, 0]} w={0.28} h={0.16} bg="#ffcc00" color="#111" size={0.024} text={'⚠ PERMUKAAN\nPANAS'} />
      {/* a drip stain under the sump, as on any set that has run a few hundred hours */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.6, 0.013, 0.2]}>
        <circleGeometry args={[0.55, 32]} />
        <meshStandardMaterial color="#0b0c0d" transparent opacity={0.45} roughness={0.15} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.3, 0.013, 0.6]}>
        <circleGeometry args={[0.22, 24]} />
        <meshStandardMaterial color="#0b0c0d" transparent opacity={0.35} roughness={0.15} depthWrite={false} />
      </mesh>
    </group>
  );
}
