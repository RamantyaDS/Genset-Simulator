// A lighter version of the genset model for the plant hall: the same silhouette and colours (black radiator with fan,
// teal V16 with its rows of heads, four air filters, grey alternator, white set panel) in far fewer meshes, so five
// of them stay smooth. Same local frame as the detailed set: radiator −x, alternator +x.
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { Box, Cyl, M } from '../scene/parts';
import { plant } from './store';

const HOT = M.cast.clone();

export function GensetLite({ index }: { index: number }) {
  const shake = useRef<THREE.Group>(null);
  const fan = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  const hot = useRef(HOT.clone()).current;
  useFrame(({ clock }, dt) => {
    const u = plant.units[index];
    const t = clock.elapsedTime;
    const a = u.phase === 'crank' ? 0.006 : u.rpm > 0 ? 0.0015 + (u.kw / 1800) * 0.001 + (u.rpm > 150 && u.rpm < 700 ? 0.004 : 0) : 0;
    shake.current!.position.y = Math.sin(t * 97 + index) * a;
    shake.current!.position.z = Math.sin(t * 71 + index * 2) * a * 0.7;
    fan.current!.rotation.x += Math.min((u.rpm * 0.75 * Math.PI * 2) / 60, 9) * dt;
    // panel lamp: green on the bus, amber running off the bus, red with an alarm
    lamp.current!.color.set(u.alarm ? '#ff3b30' : u.breaker ? '#39d353' : u.rpm > 0 ? '#ffb020' : '#2a2d30');
    lamp.current!.emissive.copy(lamp.current!.color);
    lamp.current!.emissiveIntensity = u.alarm || u.rpm > 0 ? 2.5 : 0;
    const x = Math.max(0, Math.min(1, (u.exhaust - 480) / 240));
    hot.emissive.set('#e8360c');
    hot.emissiveIntensity = x > 0 ? 0.35 + x * 2.4 : 0;
  });
  return (
    <group>
      {/* base frame */}
      {[-1, 1].map((s) => (
        <Box key={s} s={[5.9, 0.32, 0.14]} m={M.base} position={[0, 0.16, s * 1.03]} />
      ))}
      <Box s={[5.6, 0.04, 1.9]} m={M.cast} position={[0, 0.06, 0]} />
      <group ref={shake}>
        {/* radiator with fan */}
        <Box s={[0.5, 2.2, 2.2]} m={M.black} position={[-2.6, 1.43, 0]} />
        <group ref={fan} position={[-2.2, 1.45, 0]}>
          {Array.from({ length: 6 }, (_, i) => (
            <group key={i} rotation={[(i / 6) * Math.PI * 2, 0, 0]}>
              <Box s={[0.03, 0.75, 0.24]} m={M.black} position={[0, 0.5, 0]} rotation={[0, 0.5, 0]} />
            </group>
          ))}
        </group>
        {/* engine: sump, block, two banks of heads, filters, turbos */}
        <Box s={[2.5, 0.5, 0.95]} r={0.03} m={M.teal} position={[-0.56, 0.68, 0]} />
        <Box s={[2.62, 0.55, 1.1]} r={0.03} m={M.teal} position={[-0.56, 1.17, 0]} />
        {[-1, 1].map((s) => (
          <group key={s} position={[0, 1.42, s * 0.2]} rotation={[s * (Math.PI / 6), 0, 0]}>
            <Box s={[2.55, 0.5, 0.5]} m={M.teal} position={[-0.56, 0.2, 0]} />
            {Array.from({ length: 8 }, (_, i) => (
              <Box key={i} s={[0.25, 0.3, 0.42]} r={0.03} m={M.teal} position={[-1.62 + i * 0.3, 0.6, 0]} />
            ))}
            <Cyl r={0.085} l={2.5} axis="x" m={M.silver} position={[-0.5, 0.52, s * 0.38]} />
          </group>
        ))}
        {[-0.12, 0.3, 1.18, 1.6].map((x) => (
          <Cyl key={x} r={0.2} l={0.62} axis="z" m={M.black} position={[x, 2.5, 0]} />
        ))}
        {[0.55, 0.92].map((x) =>
          [-1, 1].map((s) => (
            <mesh key={`${x}${s}`} material={hot} position={[x, 2.12, s * 0.42]}>
              <torusGeometry args={[0.12, 0.07, 8, 16]} />
            </mesh>
          )),
        )}
        <Cyl r={0.74} r2={0.62} l={0.24} axis="x" m={M.teal} position={[0.86, 1.05, 0]} />
        {/* alternator and terminal box */}
        <Cyl r={0.72} l={1.05} axis="x" seg={28} m={M.alt} position={[1.68, 1.05, 0]} />
        <Cyl r={0.6} r2={0.3} l={0.22} axis="x" seg={28} m={M.alt} position={[2.41, 1.05, 0]} />
        <Box s={[0.9, 0.52, 1.0]} r={0.02} m={M.alt} position={[1.62, 1.95, 0]} />
        <Cyl r={0.17} l={0.4} m={M.steel} position={[0.74, 2.45, 0]} />
      </group>
      {/* set control panel with status lamp */}
      <Box s={[0.1, 1.5, 0.1]} m={M.steel} position={[2.72, 1.07, 0.44]} />
      <Box s={[0.62, 0.74, 0.3]} r={0.015} m={M.white} position={[2.72, 1.8, 0.62]} />
      <mesh position={[2.72, 2.12, 0.78]}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial ref={lamp} color="#2a2d30" />
      </mesh>
    </group>
  );
}
