// Day tank beside each set (set-local frame: radiator −x, operator side +z): a 2000 L steel tank in a drip tray, with a
// sight-glass level gauge, the feed line to the engine, and the transfer line dropping from the overhead header that
// brings fuel from the bulk tanks. The feed line flows while the engine burns, the transfer line while the pump runs.
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Box, Cyl, M } from '../scene/parts';
import { Flow } from '../scene/Site';
import { DAY_L } from '../sim/plant';
import { plant } from './store';

const AT: [number, number, number] = [-1.4, 0, 3.0];
const W = 1.6; // along x
const D = 1.0; // along z
const H = 1.35;
const BASE = 0.35; // legs

export function DayTank({ index }: { index: number }) {
  const level = useRef<THREE.Mesh>(null);
  const fuelMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9a531', emissive: '#7a5410', emissiveIntensity: 0.4, roughness: 0.3 }), []);
  useFrame(() => {
    const u = plant.units[index];
    const f = Math.max(0.001, u.dayTank / DAY_L);
    const m = level.current!;
    m.scale.y = f;
    m.position.y = BASE + 0.1 + (f * (H - 0.2)) / 2;
    fuelMat.color.set(f < 0.1 ? '#e0533c' : '#d9a531');
  });
  const u = () => plant.units[index];
  const [x, , z] = AT;
  const feed: [number, number, number][] = [
    [x + W / 2 - 0.1, BASE + 0.12, z - D / 2],
    [x + W / 2 - 0.1, 0.08, z - D / 2 - 0.2],
    [-1.2, 0.08, 2.3],
    [-1.2, 0.5, 2.3],
  ];
  const transfer: [number, number, number][] = [
    [x - 0.5, 5.2, z],
    [x - 0.5, BASE + H + 0.2, z],
    [x - 0.5, BASE + H, z],
  ];
  return (
    <group>
      {/* drip tray (bund) */}
      <Box s={[W + 0.4, 0.22, D + 0.4]} m={M.cast} position={[x, 0.11, z]} />
      {/* legs and tank shell */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => <Box key={`${sx}${sz}`} s={[0.08, BASE, 0.08]} m={M.steel} position={[x + sx * (W / 2 - 0.1), 0.22 + BASE / 2 - 0.11, z + sz * (D / 2 - 0.1)]} />),
      )}
      <Box s={[W, H, D]} r={0.04} m={M.base} position={[x, BASE + H / 2, z]} />
      {/* sight glass on the operator face, with the fuel column */}
      <Box s={[0.1, H - 0.1, 0.02]} m={M.black} position={[x + W / 2 - 0.25, BASE + H / 2, z + D / 2 + 0.01]} />
      <mesh ref={level} material={fuelMat} position={[x + W / 2 - 0.25, BASE + H / 2, z + D / 2 + 0.025]}>
        <boxGeometry args={[0.06, H - 0.2, 0.01]} />
      </mesh>
      {/* filler, vent and the transfer line from the overhead header */}
      <Cyl r={0.07} l={0.15} m={M.steel} position={[x + 0.4, BASE + H + 0.07, z]} />
      <Cyl r={0.03} l={0.6} m={M.steel} position={[x - 0.2, BASE + H + 0.3, z - 0.3]} />
      <Cyl r={0.035} l={5.2 - BASE - H} m={M.steel} position={[x - 0.5, (5.2 + BASE + H) / 2, z]} />
      <Cyl r={0.035} l={6} axis="x" m={M.steel} position={[x - 0.5, 5.2, z]} />
      <Text position={[x - 0.1, BASE + H * 0.62, z + D / 2 + 0.01]} fontSize={0.12} color="#1b2228">
        {`DAY TANK G${index + 1}\n2000 L SOLAR`}
      </Text>
      <Flow pts={feed} color="#ff9a2e" on={() => u().rpm > 300 && u().dayTank > 0} speed={1} width={4} />
      <Flow pts={transfer} color="#ff9a2e" on={() => u().pumping} speed={2} width={5} />
    </group>
  );
}
