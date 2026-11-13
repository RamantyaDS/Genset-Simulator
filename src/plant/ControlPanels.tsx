// Control room switchboard: one desk-height panel per set plus a bus/feeder panel, all operable by clicking in 3D.
// Panel-local frame: face toward +z, x across, y up; the row is turned to face into the room.
// Lamp colours follow the common switchgear convention here: red = breaker closed (live), green = open.
import { Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Box, Cyl, M } from '../scene/parts';
import { available, busLive, closeBreaker, openBreaker, PRIME_KW, resetUnit, setFeeder, startUnit, stopUnit } from '../sim/plant';
import { plant } from './store';

const LABEL = '#20262c';
const W = 1.5;
const H = 2.2;

function useCursor() {
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => (document.body.style.cursor = ''),
  };
}

/** Illuminated pushbutton: sinks when pressed, lit when `lit()` says so. */
function PushButton({ pos, color, label, onPress, lit, r = 0.055 }: { pos: [number, number]; color: string; label: string; onPress: () => void; lit?: () => boolean; r?: number }) {
  const cap = useRef<THREE.Group>(null);
  const until = useRef(0);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0 }), [color]);
  useFrame(({ clock }) => {
    cap.current!.position.z = clock.elapsedTime < until.current ? 0.01 : 0.035;
    mat.emissiveIntensity = lit?.() ? 1.6 : 0.05;
  });
  const cursor = useCursor();
  return (
    <group position={[pos[0], pos[1], 0]}>
      <Cyl r={r + 0.015} l={0.02} axis="z" m={M.steel} position={[0, 0, 0.01]} />
      <group
        ref={cap}
        onClick={(e) => {
          e.stopPropagation();
          until.current = performance.now() / 1000 + 0.15;
          onPress();
        }}
        {...cursor}
      >
        <mesh material={mat} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[r, r, 0.04, 20]} />
        </mesh>
      </group>
      <Text position={[0, -r - 0.045, 0.02]} fontSize={0.035} color={LABEL} anchorY="top">
        {label}
      </Text>
    </group>
  );
}

function Lamp({ pos, color, label, on }: { pos: [number, number]; color: string; label: string; on: () => boolean }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#333', emissive: color, emissiveIntensity: 0, roughness: 0.3 }), [color]);
  useFrame(() => {
    const v = on();
    mat.color.set(v ? color : '#3a3d40');
    mat.emissiveIntensity = v ? 2.2 : 0;
  });
  return (
    <group position={[pos[0], pos[1], 0]}>
      <mesh material={mat} position={[0, 0, 0.02]}>
        <sphereGeometry args={[0.035, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <Text position={[0, -0.06, 0.02]} fontSize={0.03} color={LABEL} anchorY="top">
        {label}
      </Text>
    </group>
  );
}

/** Two-position selector switch: the handle turns 45° each way. */
function Selector({ pos, left, right, value, onToggle }: { pos: [number, number]; left: string; right: string; value: () => boolean; onToggle: () => void }) {
  const handle = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const target = value() ? -Math.PI / 4 : Math.PI / 4;
    handle.current!.rotation.z += (target - handle.current!.rotation.z) * Math.min(1, dt * 12);
  });
  const cursor = useCursor();
  return (
    <group position={[pos[0], pos[1], 0]}>
      <Cyl r={0.06} l={0.02} axis="z" m={M.black} position={[0, 0, 0.01]} />
      <group
        ref={handle}
        position={[0, 0, 0.03]}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        {...cursor}
      >
        <Box s={[0.03, 0.11, 0.035]} m={M.black} />
        <Box s={[0.012, 0.05, 0.04]} m={M.white} position={[0, 0.03, 0.002]} />
      </group>
      <Text position={[-0.08, 0.07, 0.02]} fontSize={0.03} color={LABEL}>
        {left}
      </Text>
      <Text position={[0.08, 0.07, 0.02]} fontSize={0.03} color={LABEL}>
        {right}
      </Text>
    </group>
  );
}

/** Analog meter face drawn on a canvas: needle over a scale, with a value read-out. */
function drawMeter(g: CanvasRenderingContext2D, x: number, label: string, v: number, min: number, max: number, unit: string, red?: number) {
  const cx = x + 62;
  const cy = 92;
  g.fillStyle = '#f2efe6';
  g.fillRect(x + 4, 4, 116, 104);
  g.strokeStyle = '#222';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, 64, Math.PI * 1.15, Math.PI * 1.85);
  g.stroke();
  if (red !== undefined) {
    g.strokeStyle = '#c3141c';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(cx, cy, 60, Math.PI * (1.15 + 0.7 * ((red - min) / (max - min))), Math.PI * 1.85);
    g.stroke();
  }
  g.strokeStyle = '#222';
  g.lineWidth = 1.5;
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI * (1.15 + 0.07 * k);
    const l = k % 5 ? 6 : 11;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 64, cy + Math.sin(a) * 64);
    g.lineTo(cx + Math.cos(a) * (64 - l), cy + Math.sin(a) * (64 - l));
    g.stroke();
  }
  const f = Math.max(0, Math.min(1.04, (v - min) / (max - min)));
  const a = Math.PI * (1.15 + 0.7 * f);
  g.strokeStyle = '#111';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(a) * 58, cy + Math.sin(a) * 58);
  g.stroke();
  g.fillStyle = '#111';
  g.font = 'bold 13px sans-serif';
  g.textAlign = 'center';
  g.fillText(label, cx, 56);
  g.font = '12px monospace';
  g.fillText(`${v.toFixed(unit === 'Hz' ? 1 : 0)} ${unit}`, cx, 76);
}

function useMeters(draw: (g: CanvasRenderingContext2D) => void) {
  const m = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 112;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { c, t };
  }, []);
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.12) return;
    last.current = clock.elapsedTime;
    const g = m.c.getContext('2d')!;
    g.fillStyle = '#1b1f23';
    g.fillRect(0, 0, 256, 112);
    draw(g);
    m.t.needsUpdate = true;
  });
  return m.t;
}

function Cabinet({ title, children, meters }: { title: string; children: React.ReactNode; meters: THREE.Texture }) {
  return (
    <group>
      <Box s={[W, H, 0.5]} r={0.02} m={M.greyLight} position={[0, H / 2, -0.25]} />
      <Box s={[W - 0.1, H - 0.1, 0.01]} m={M.white} position={[0, H / 2, 0.005]} />
      <Box s={[W + 0.04, 0.1, 0.55]} m={M.cast} position={[0, 0.05, -0.25]} />
      <Text position={[0, H - 0.14, 0.02]} fontSize={0.08} color="#1d3a5c" fontWeight={700}>
        {title}
      </Text>
      <mesh position={[0, H - 0.47, 0.012]}>
        <planeGeometry args={[1.2, 0.525]} />
        <meshBasicMaterial map={meters} toneMapped={false} />
      </mesh>
      <group position={[0, 0, 0.012]}>{children}</group>
    </group>
  );
}

function SetPanel({ i }: { i: number }) {
  const u = () => plant.units[i];
  const meters = useMeters((g) => {
    const x = u();
    drawMeter(g, 0, 'kW', x.kw, 0, 2200, 'kW', PRIME_KW);
    drawMeter(g, 128, 'Hz', x.rpm > 0 ? x.hz : 0, 45, 55, 'Hz');
  });
  const flash = () => Math.floor(performance.now() / 400) % 2 === 0;
  return (
    <Cabinet title={`GENSET G${i + 1}`} meters={meters}>
      <Lamp pos={[-0.45, 1.2]} color="#ffb020" label="JALAN" on={() => u().rpm > 0} />
      <Lamp pos={[-0.15, 1.2]} color="#39d353" label="SIAP" on={() => available(u())} />
      <Lamp pos={[0.15, 1.2]} color="#ff3b30" label="CB MASUK" on={() => u().breaker} />
      <Lamp pos={[0.45, 1.2]} color="#ffb020" label="ALARM" on={() => !!u().alarm && flash()} />
      <PushButton pos={[-0.3, 0.88]} color="#2fb36b" label="START" onPress={() => startUnit(plant, i)} lit={() => u().phase === 'crank'} />
      <PushButton pos={[0.3, 0.88]} color="#d23a2c" label="STOP" onPress={() => stopUnit(plant, i)} lit={() => u().phase === 'cooling' || u().phase === 'stopping'} />
      <PushButton pos={[-0.3, 0.55]} color="#d23a2c" label="CB TUTUP" onPress={() => closeBreaker(plant, i)} lit={() => u().breaker} />
      <PushButton pos={[0.3, 0.55]} color="#2fb36b" label="CB BUKA" onPress={() => openBreaker(plant, i)} lit={() => !u().breaker && u().rpm > 0} />
      <Selector pos={[-0.3, 0.24]} left="MAN" right="AUTO" value={() => u().auto} onToggle={() => (u().auto = !u().auto)} />
      <PushButton pos={[0.3, 0.24]} color="#2f6fd0" label="RESET" r={0.045} onPress={() => resetUnit(plant, i)} />
    </Cabinet>
  );
}

function BusPanel() {
  const meters = useMeters((g) => {
    drawMeter(g, 0, 'BUS Hz', plant.busHz, 45, 55, 'Hz');
    drawMeter(g, 128, 'BUS V', plant.busV, 0, 500, 'V');
  });
  return (
    <Cabinet title="BUS & PENYULANG" meters={meters}>
      <Selector pos={[-0.35, 1.2]} left="MAN" right="AUTO" value={() => plant.master} onToggle={() => (plant.master = !plant.master)} />
      <Text position={[-0.35, 1.08, 0.02]} fontSize={0.03} color={LABEL}>
        LOAD DEMAND
      </Text>
      <Selector pos={[0.35, 1.2]} left="OFF" right="ON" value={() => plant.ufls} onToggle={() => (plant.ufls = !plant.ufls)} />
      <Text position={[0.35, 1.08, 0.02]} fontSize={0.03} color={LABEL}>
        UFLS 48,5 Hz
      </Text>
      {plant.feeders.map((f, k) => {
        const x = -0.54 + (k % 4) * 0.36;
        const y = k < 4 ? 0.78 : 0.42;
        return (
          <group key={f.id}>
            <PushButton
              pos={[x, y]}
              color="#d23a2c"
              r={0.045}
              label={f.short.toUpperCase()}
              onPress={() => setFeeder(plant, k, !plant.feeders[k].on)}
              lit={() => plant.feeders[k].on && busLive(plant)}
            />
          </group>
        );
      })}
      <Text position={[0, 0.17, 0.02]} fontSize={0.028} color={LABEL} maxWidth={1.3} textAlign="center">
        TEKAN TOMBOL PENYULANG UNTUK SAMBUNG / LEPAS. MERAH MENYALA = BREAKER MASUK
      </Text>
    </Cabinet>
  );
}

/** The switchboard row, standing against the room's +x wall and facing into the room. */
export function ControlPanels() {
  return (
    <group position={[3.95, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      {Array.from({ length: 5 }, (_, i) => (
        <group key={i} position={[(i - 2.5) * (W + 0.05) - 0.05, 0, 0]}>
          <SetPanel i={i} />
        </group>
      ))}
      <group position={[2.5 * (W + 0.05) + 0.05, 0, 0]}>
        <BusPanel />
      </group>
    </group>
  );
}
