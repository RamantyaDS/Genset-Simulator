// Portable resistive load bank: wheeled cabinet whose heating grids glow and whose fan blows the heat out the top.
// Rolled up next to the set for load tests, so it only appears while switched in.
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sim } from '../store';
import { Box, Cyl, M } from './parts';
import { Flow } from './Site';

export function LoadBank({ at, panelAt }: { at: [number, number, number]; panelAt: [number, number, number] }) {
  const group = useRef<THREE.Group>(null);
  const fan = useRef<THREE.Group>(null);
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a1a12', emissive: '#ff5a1a', emissiveIntensity: 0, roughness: 0.6 }), []);
  const heat = useRef(0);
  useFrame((_, dt) => {
    const g = group.current!;
    g.visible = sim.loadBankOn || heat.current > 0.02;
    const kw = sim.loadBankOn ? sim.genKw - (sim.gcb ? sim.demandKw : 0) : 0;
    heat.current += (kw / 2000 - heat.current) * Math.min(1, dt * 0.8);
    glow.emissiveIntensity = heat.current * 4;
    fan.current!.rotation.y += dt * (sim.loadBankOn ? 14 : 3 * heat.current);
  });
  const cable: [number, number, number][] = [
    [panelAt[0], 0.4, panelAt[2] + 0.3],
    [panelAt[0], 0.05, panelAt[2] + 1],
    [at[0], 0.05, at[2] - 1],
    [at[0], 0.5, at[2] - 0.62],
  ];
  return (
    <group ref={group} visible={false}>
      <group position={at}>
        <Box s={[2.4, 0.12, 1.3]} m={M.cast} position={[0, 0.42, 0]} />
        {[-0.8, 0.8].map((x) =>
          [-0.6, 0.6].map((z) => (
            <group key={`${x}${z}`} position={[x, 0.24, z]}>
              <Cyl r={0.22} l={0.14} axis="z" m={M.rubber} />
              <Cyl r={0.1} l={0.15} axis="z" m={M.steel} />
            </group>
          )),
        )}
        <Box s={[0.9, 0.06, 0.06]} m={M.cast} position={[-1.6, 0.42, 0]} />
        <Box s={[2.2, 1.6, 1.2]} r={0.03} m={M.base} position={[0, 1.28, 0]} />
        {/* resistor grids behind side louvres */}
        {[-1, 1].map((s) => (
          <group key={s} position={[0, 1.2, s * 0.605]}>
            {Array.from({ length: 6 }, (_, i) => (
              <mesh key={i} material={glow} position={[0, -0.45 + i * 0.18, 0]}>
                <boxGeometry args={[1.8, 0.08, 0.02]} />
              </mesh>
            ))}
          </group>
        ))}
        {/* top discharge fan */}
        <Cyl r={0.48} l={0.12} m={M.black} position={[0, 2.12, 0]} open />
        <group ref={fan} position={[0, 2.1, 0]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Box key={i} s={[0.42, 0.015, 0.12]} m={M.steel} position={[Math.cos((i / 5) * Math.PI * 2) * 0.22, 0, Math.sin((i / 5) * Math.PI * 2) * 0.22]} rotation={[0.4, -(i / 5) * Math.PI * 2, 0]} />
          ))}
        </group>
        <Text position={[0, 1.95, 0.61]} fontSize={0.13} color="#1b2228">
          LOAD BANK 2000 kW
        </Text>
      </group>
      <Flow pts={cable} color="#ffc23a" on={() => sim.loadBankOn && sim.genKw > 0} speed={1.5} />
    </group>
  );
}
