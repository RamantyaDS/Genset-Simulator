// The surroundings that make the story readable: the building the genset backs up, the PLN pole, the ATS cabinet and the cables.
import { Line, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sim } from '../store';
import { Box, Cyl, M } from './parts';

export const ATS_POS: [number, number, number] = [7, 0, -4.5];
export const POLE_POS: [number, number, number] = [13, 0, -7];
const BUILDING = { x: -1, z: -24, w: 24, h: 13, d: 10 };

export const buildingPowered = () => (sim.mcb && sim.mainsOk) || (sim.gcb && sim.volts > 300);

function Building() {
  const cols = 16;
  const rows = 4;
  const { mesh, lit } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(0.9, 1.1);
    const mat = new THREE.MeshStandardMaterial({ color: '#0e1318', emissive: '#ffd59a', emissiveIntensity: 0, roughness: 0.2, metalness: 0.6 });
    const mesh = new THREE.InstancedMesh(geo, mat, cols * rows);
    const m = new THREE.Matrix4();
    const lit: boolean[] = [];
    let i = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        m.setPosition(BUILDING.x - BUILDING.w / 2 + 1.0 + c * ((BUILDING.w - 2) / (cols - 1)), 1.8 + r * 3, BUILDING.z + BUILDING.d / 2 + 0.01);
        mesh.setMatrixAt(i, m);
        lit.push((c * 7 + r * 3) % 5 !== 0);
        mesh.setColorAt(i, new THREE.Color(lit[i] ? '#ffffff' : '#000000'));
        i++;
      }
    return { mesh, lit };
  }, []);
  const level = useRef(1);
  useFrame((_, dt) => {
    const on = buildingPowered() ? 1 : 0;
    level.current += (on - level.current) * Math.min(1, dt * (on ? 6 : 25));
    (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = level.current * 0.85;
  });
  void lit;
  return (
    <group>
      <Box s={[BUILDING.w, BUILDING.h, BUILDING.d]} m={M.canopyDark} position={[BUILDING.x, BUILDING.h / 2, BUILDING.z]} />
      <Box s={[BUILDING.w + 0.4, 0.4, BUILDING.d + 0.4]} m={M.base} position={[BUILDING.x, BUILDING.h, BUILDING.z]} />
      {[1, 2, 3].map((r) => (
        <Box key={r} s={[BUILDING.w, 0.12, 0.1]} m={M.base} position={[BUILDING.x, r * 3 + 0.2, BUILDING.z + BUILDING.d / 2 + 0.05]} />
      ))}
      <primitive object={mesh} />
      <Text position={[BUILDING.x, BUILDING.h - 0.9, BUILDING.z + BUILDING.d / 2 + 0.05]} fontSize={0.7} color="#cfd6dc" anchorX="center">
        GEDUNG KANTOR
      </Text>
    </group>
  );
}

function Pole() {
  const [x, , z] = POLE_POS;
  return (
    <group position={[x, 0, z]}>
      <Cyl r={0.14} r2={0.1} l={10} m={M.base} position={[0, 5, 0]} />
      <Box s={[0.12, 0.12, 2.2]} m={M.base} position={[0, 9.3, 0]} />
      {[-0.9, 0, 0.9].map((dz) => (
        <Cyl key={dz} r={0.04} l={0.2} m={M.white} position={[0, 9.48, dz]} />
      ))}
      {/* pole-mounted transformer */}
      <Cyl r={0.45} l={1.2} m={M.base} position={[0.55, 7.2, 0]} />
      {[-0.2, 0, 0.2].map((dz) => (
        <Cyl key={dz} r={0.035} l={0.3} m={M.white} position={[0.55, 7.95, dz]} />
      ))}
      <Text position={[0.55, 6.4, 0.5]} fontSize={0.28} color="#e9eef2">
        PLN 20 kV
      </Text>
    </group>
  );
}

function AtsCabinet() {
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const led2 = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    led.current!.emissiveIntensity = sim.mcb && sim.mainsOk ? 3 : 0;
    led2.current!.emissiveIntensity = sim.gcb ? 3 : 0;
  });
  return (
    <group position={ATS_POS}>
      <Box s={[1.6, 2.1, 0.7]} r={0.02} m={M.base} position={[0, 1.05, 0]} />
      <Box s={[1.5, 0.1, 0.72]} m={M.cast} position={[0, 0.05, 0]} />
      <mesh position={[-0.3, 1.6, 0.36]}>
        <circleGeometry args={[0.05, 16]} />
        <meshStandardMaterial ref={led} color="#2ad16b" emissive="#2ad16b" />
      </mesh>
      <mesh position={[0.3, 1.6, 0.36]}>
        <circleGeometry args={[0.05, 16]} />
        <meshStandardMaterial ref={led2} color="#ffb020" emissive="#ffb020" />
      </mesh>
      <Text position={[0, 1.85, 0.36]} fontSize={0.16} color="#1b2228">
        ATS
      </Text>
      <Text position={[-0.3, 1.45, 0.36]} fontSize={0.07} color="#1b2228">
        PLN
      </Text>
      <Text position={[0.3, 1.45, 0.36]} fontSize={0.07} color="#1b2228">
        GENSET
      </Text>
    </group>
  );
}

/** Animated dashed line that shows energy moving; `on()` decides whether it flows. */
export function Flow({ pts, color, on, speed = 1, width = 3 }: { pts: [number, number, number][]; color: string; on: () => boolean; speed?: number | (() => number); width?: number }) {
  const ref = useRef<any>(null);
  useFrame((_, dt) => {
    const l = ref.current;
    if (!l) return;
    const active = on();
    const v = typeof speed === 'function' ? speed() : speed;
    l.material.dashOffset -= dt * v * (active ? 1 : 0);
    l.material.opacity += ((active ? 1 : 0) - l.material.opacity) * Math.min(1, dt * 5);
    l.visible = l.material.opacity > 0.02;
  });
  return (
    <Line
      ref={ref}
      points={pts}
      color={color}
      lineWidth={width}
      dashed
      dashSize={0.35}
      gapSize={0.25}
      transparent
      opacity={0}
      toneMapped={false}
      depthTest={false}
      renderOrder={10}
    />
  );
}

export function Site({ panelAt }: { panelAt: [number, number, number] }) {
  const [ax, , az] = ATS_POS;
  const [px, , pz] = POLE_POS;
  const genCable: [number, number, number][] = [panelAt, [panelAt[0], 0.05, panelAt[2]], [ax, 0.05, panelAt[2]], [ax, 0.05, az + 0.4], [ax, 0.6, az + 0.35]];
  const plnCable: [number, number, number][] = [[px, 9.4, pz], [px - 2, 8.6, pz + 0.5], [ax + 0.5, 2.6, az], [ax + 0.4, 2.1, az]];
  const bldCable: [number, number, number][] = [[ax - 0.4, 2.1, az], [ax - 1, 3.5, az - 4], [ax - 2, 4, BUILDING.z + BUILDING.d / 2]];
  return (
    <group>
      {/* ground: asphalt yard, concrete pad, cable trench cover */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#2a2d30" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[16, 7]} />
        <meshStandardMaterial color="#6d7175" roughness={0.9} />
      </mesh>
      <Box s={[ax - panelAt[0] + 0.4, 0.04, 0.4]} m={M.cast} position={[(ax + panelAt[0]) / 2, 0.02, panelAt[2]]} />
      <Box s={[0.4, 0.04, Math.abs(az - panelAt[2])]} m={M.cast} position={[ax, 0.02, (az + panelAt[2]) / 2]} />
      <Building />
      <Pole />
      <AtsCabinet />
      {/* static cables */}
      <Line points={plnCable} color="#111" lineWidth={2} />
      <Line points={bldCable} color="#111" lineWidth={2} />
      {/* energy flow */}
      <Flow pts={plnCable} color="#5fd4ff" on={() => sim.mainsOk && sim.mcb} speed={1.5} />
      <Flow pts={genCable} color="#ffc23a" on={() => sim.gcb && sim.volts > 300} speed={1.5} />
      <Flow pts={bldCable} color="#ffe9a8" on={buildingPowered} speed={1.5} />
    </group>
  );
}
