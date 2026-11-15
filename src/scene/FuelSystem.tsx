// Fuel system around the single set (world coordinates, open-type set at the origin: radiator −x, operator side +z):
// a 2000 L day tank with a sight glass and the feed line to the engine, the underground bulk tank (manhole, vent,
// fill point) with its transfer pump and trench pipe, and the tanker that comes when fuel is ordered.
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BULK_L, TANK_L } from '../sim/genset';
import { sim } from '../store';
import { Box, Cyl, M } from './parts';
import { Flow } from './Site';

const DAY: [number, number, number] = [-1.6, 0, 3.1];
const BULK: [number, number, number] = [-7.5, 0, 5.5];
const W = 1.6;
const D = 1.0;
const H = 1.35;
const LEGS = 0.35;

function Gauge({ at, level, h }: { at: [number, number, number]; level: () => number; h: number }) {
  const bar = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9a531', emissive: '#7a5410', emissiveIntensity: 0.5, roughness: 0.3 }), []);
  useFrame(() => {
    const f = Math.max(0.001, level());
    bar.current!.scale.y = f;
    bar.current!.position.y = at[1] - h / 2 + (f * h) / 2;
    mat.color.set(f < 0.1 ? '#e0533c' : '#d9a531');
  });
  return (
    <group>
      <Box s={[0.1, h + 0.06, 0.02]} m={M.black} position={[at[0], at[1], at[2] - 0.012]} />
      <mesh ref={bar} material={mat} position={at}>
        <boxGeometry args={[0.06, h, 0.01]} />
      </mesh>
    </group>
  );
}

/** Fuel/water separator on the feed line: a clear bowl where water settles under the fuel. */
function Separator() {
  const water = useRef<THREE.Mesh>(null);
  const fuel = useRef<THREE.Mesh>(null);
  const BOWL = 0.22;
  useFrame(() => {
    const w = Math.min(1, sim.water) * BOWL;
    water.current!.scale.y = Math.max(0.001, w / BOWL);
    water.current!.position.y = 0.1 + w / 2;
    fuel.current!.scale.y = Math.max(0.001, (BOWL - w) / BOWL);
    fuel.current!.position.y = 0.1 + w + (BOWL - w) / 2;
  });
  return (
    <group position={[-1.15, 0.22, 2.75]}>
      <Box s={[0.22, 0.04, 0.22]} m={M.cast} position={[0, 0.02, 0]} />
      <Cyl r={0.09} l={0.14} m={M.steel} position={[0, BOWL + 0.17, 0]} />
      <mesh position={[0, 0.1 + BOWL / 2, 0]}>
        <cylinderGeometry args={[0.075, 0.075, BOWL, 20, 1, true]} />
        <meshStandardMaterial color="#d8e8f0" transparent opacity={0.25} roughness={0.05} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={fuel}>
        <cylinderGeometry args={[0.07, 0.07, BOWL, 20]} />
        <meshStandardMaterial color="#d9a531" transparent opacity={0.75} roughness={0.2} />
      </mesh>
      <mesh ref={water}>
        <cylinderGeometry args={[0.07, 0.07, BOWL, 20]} />
        <meshStandardMaterial color="#6fa8c8" transparent opacity={0.85} roughness={0.1} />
      </mesh>
      <Cyl r={0.015} l={0.06} m={M.red} position={[0, 0.07, 0]} />
      <Text position={[0, 0.52, 0]} fontSize={0.05} color="#e9eef2">
        SEPARATOR AIR
      </Text>
    </group>
  );
}

function Tanker() {
  const g = useRef<THREE.Group>(null);
  useFrame(() => (g.current!.visible = sim.truckIn >= 0));
  return (
    <group ref={g} visible={false} position={[BULK[0] - 7.2, 0, BULK[2] + 1.6]}>
      <Box s={[2.4, 2.2, 2.3]} m={M.white} position={[3.6, 1.5, 0]} />
      <Box s={[2.3, 0.9, 2.3]} m={M.black} position={[3.6, 2.2, 0]} />
      <Cyl r={1.1} l={6} axis="x" m={M.silver} position={[-0.6, 1.9, 0]} />
      <Box s={[7.5, 0.3, 2]} m={M.cast} position={[0.4, 0.75, 0]} />
      {[-2.6, -1.2, 3.6].map((x) => [-1, 1].map((sz) => <Cyl key={`${x}${sz}`} r={0.5} l={0.35} axis="z" m={M.rubber} position={[x, 0.5, sz * 1]} />))}
      <Text position={[-0.6, 2.2, 1.12]} fontSize={0.35} color="#c3141c">
        SOLAR
      </Text>
    </group>
  );
}

export function FuelSystem() {
  const [dx, , dz] = DAY;
  const [bx, , bz] = BULK;
  const feed: [number, number, number][] = [
    [dx + W / 2 - 0.1, LEGS + 0.1, dz - D / 2],
    [dx + W / 2 - 0.1, 0.06, dz - D / 2 - 0.2],
    [-1.2, 0.06, 2.3],
    [-1.2, 0.5, 2.3],
  ];
  const transfer: [number, number, number][] = [
    [bx + 0.9, 0.5, bz],
    [bx + 0.9, 0.04, bz - 0.4],
    [dx - 0.5, 0.04, dz + 0.9],
    [dx - 0.5, LEGS + H + 0.1, dz + 0.9],
    [dx - 0.5, LEGS + H + 0.1, dz],
  ];
  const hose: [number, number, number][] = [
    [bx - 7.8, 1.0, bz + 2.7],
    [bx - 3.5, 0.06, bz + 2.4],
    [bx - 0.6, 0.06, bz + 1.4],
    [bx - 0.6, 0.3, bz + 0.9],
  ];
  return (
    <group>
      {/* day tank in its drip tray */}
      <Box s={[W + 0.4, 0.22, D + 0.4]} m={M.cast} position={[dx, 0.11, dz]} />
      {[-1, 1].map((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} s={[0.08, LEGS, 0.08]} m={M.steel} position={[dx + sx * (W / 2 - 0.1), LEGS / 2 + 0.11, dz + sz * (D / 2 - 0.1)]} />))}
      <Box s={[W, H, D]} r={0.04} m={M.base} position={[dx, LEGS + H / 2, dz]} />
      <Gauge at={[dx + W / 2 - 0.25, LEGS + H / 2, dz + D / 2 + 0.025]} h={H - 0.2} level={() => sim.fuel / TANK_L} />
      <Cyl r={0.07} l={0.15} m={M.steel} position={[dx + 0.4, LEGS + H + 0.07, dz]} />
      <Cyl r={0.03} l={0.6} m={M.steel} position={[dx - 0.2, LEGS + H + 0.3, dz - 0.3]} />
      <Text position={[dx - 0.1, LEGS + H * 0.62, dz + D / 2 + 0.01]} fontSize={0.11} color="#1b2228">
        {'TANGKI HARIAN\n2000 L SOLAR'}
      </Text>
      {/* underground bulk tank: manhole, vent pipe, fill point, transfer pump */}
      <Box s={[4.4, 0.06, 2.6]} m={M.cast} position={[bx, 0.03, bz]} />
      <Cyl r={0.45} l={0.08} m={M.steel} position={[bx, 0.1, bz]} />
      <Cyl r={0.05} l={3.5} m={M.steel} position={[bx - 1.8, 1.75, bz - 1]} />
      <Cyl r={0.09} l={0.2} m={M.steel} position={[bx - 1.8, 3.55, bz - 1]} />
      <Box s={[0.5, 0.6, 0.4]} m={M.yellow} position={[bx - 0.6, 0.3, bz + 0.9]} />
      <group position={[bx + 0.9, 0, bz]}>
        <Box s={[0.6, 0.35, 0.4]} m={M.blue} position={[0, 0.25, 0]} />
        <Cyl r={0.13} l={0.4} axis="x" m={M.blue} position={[0, 0.45, 0]} />
      </group>
      <Gauge at={[bx - 0.6, 0.95, bz + 1.12]} h={0.5} level={() => sim.bulk / BULK_L} />
      <Text position={[bx, 0.12, bz + 1.4]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.22} color="#e9eef2">
        TANGKI TIMBUN 10.000 L (BAWAH TANAH)
      </Text>
      <Tanker />
      <Separator />
      <Flow pts={feed} color="#ff9a2e" on={() => sim.firing && sim.fuel > 0} speed={1} width={4} />
      <Flow pts={transfer} color="#ff9a2e" on={() => sim.pumping} speed={2} width={4} />
      <Flow pts={hose} color="#ff9a2e" on={() => sim.truckIn >= 0} speed={2.5} width={5} />
    </group>
  );
}
