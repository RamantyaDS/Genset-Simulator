// Control room in the old power-station style: operators sit at a curved console whose sloping desktop carries the
// pushbuttons, lamps and switches (one segment per set, one for the bus and feeders), facing a wall-sized mimic board:
// the single-line diagram lit by state, big bus read-outs and a row of annunciator windows.
// Lamp colours follow the common switchgear convention: red = breaker closed (live), green = open.
import { Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Box, Cyl, M } from '../scene/parts';
import {
  available,
  busLive,
  closeBreaker,
  DAY_L,
  openBreaker,
  PRIME_KW,
  resetUnit,
  SERVICE_H,
  setFeeder,
  startUnit,
  stopUnit,
  TANK_L,
} from '../sim/plant';
import { ARC_CX, consoleSeg, SEGMENTS } from './camera';

const BOARD = { r: 10.6, span: 0.42, n: 6, h: 2.7, y: 1.1 };
import { plant } from './store';

const LABEL = '#1d2228';
const SEG_W = 1.45;
const DESK_H = 0.82;
const flash = () => Math.floor(performance.now() / 400) % 2 === 0;

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
function PushButton({ pos, color, label, onPress, lit, r = 0.032 }: { pos: [number, number]; color: string; label: string; onPress: () => void; lit?: () => boolean; r?: number }) {
  const cap = useRef<THREE.Group>(null);
  const until = useRef(0);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0 }), [color]);
  useFrame(({ clock }) => {
    cap.current!.position.z = clock.elapsedTime < until.current ? 0.006 : 0.02;
    mat.emissiveIntensity = lit?.() ? 1.6 : 0.05;
  });
  const cursor = useCursor();
  return (
    <group position={[pos[0], pos[1], 0]}>
      <Cyl r={r + 0.01} l={0.012} axis="z" m={M.steel} position={[0, 0, 0.006]} />
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
          <cylinderGeometry args={[r, r, 0.025, 20]} />
        </mesh>
      </group>
      <Text position={[0, -r - 0.02, 0.012]} fontSize={0.022} color={LABEL} anchorY="top">
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
    mat.emissiveIntensity = v ? 2.4 : 0;
  });
  return (
    <group position={[pos[0], pos[1], 0]}>
      <mesh material={mat} position={[0, 0, 0.01]}>
        <sphereGeometry args={[0.022, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <Text position={[0, -0.035, 0.012]} fontSize={0.019} color={LABEL} anchorY="top">
        {label}
      </Text>
    </group>
  );
}

/** Two-position selector switch: the handle turns 45° each way. */
function Selector({ pos, left, right, value, onToggle, label }: { pos: [number, number]; left: string; right: string; value: () => boolean; onToggle: () => void; label?: string }) {
  const handle = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const target = value() ? -Math.PI / 4 : Math.PI / 4;
    handle.current!.rotation.z += (target - handle.current!.rotation.z) * Math.min(1, dt * 12);
  });
  const cursor = useCursor();
  return (
    <group position={[pos[0], pos[1], 0]}>
      <Cyl r={0.04} l={0.012} axis="z" m={M.black} position={[0, 0, 0.006]} />
      <group
        ref={handle}
        position={[0, 0, 0.02]}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        {...cursor}
      >
        <Box s={[0.02, 0.075, 0.025]} m={M.black} />
        <Box s={[0.008, 0.035, 0.028]} m={M.white} position={[0, 0.02, 0.001]} />
      </group>
      <Text position={[-0.055, 0.045, 0.012]} fontSize={0.019} color={LABEL}>
        {left}
      </Text>
      <Text position={[0.055, 0.045, 0.012]} fontSize={0.019} color={LABEL}>
        {right}
      </Text>
      {label && (
        <Text position={[0, -0.06, 0.012]} fontSize={0.019} color={LABEL} anchorY="top">
          {label}
        </Text>
      )}
    </group>
  );
}

/** A small digital read-out on the console's upright back strip. */
function useReadout(text: () => string) {
  const m = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 48;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { c, t };
  }, []);
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.15) return;
    last.current = clock.elapsedTime;
    const g = m.c.getContext('2d')!;
    g.fillStyle = '#0b0f0c';
    g.fillRect(0, 0, 256, 48);
    g.fillStyle = '#ff8a2a';
    g.font = 'bold 26px monospace';
    g.textAlign = 'center';
    g.fillText(text(), 128, 33);
    m.t.needsUpdate = true;
  });
  return m.t;
}

/** One console segment: cabinet, sloping desktop (controls laid out on it, +y up the slope), upright read-out strip. */
function Segment({ title, readout, children }: { title: string; readout: () => string; children: React.ReactNode }) {
  const tex = useReadout(readout);
  return (
    <group>
      <Box s={[SEG_W, DESK_H - 0.06, 0.62]} m={M.greyLight} position={[0, (DESK_H - 0.06) / 2, -0.05]} />
      <Box s={[SEG_W, 0.06, 0.12]} m={M.cast} position={[0, DESK_H - 0.03, 0.3]} />
      {/* sloping desktop, 30° from horizontal */}
      <group position={[0, DESK_H + 0.13, -0.05]} rotation={[-Math.PI / 3, 0, 0]}>
        <Box s={[SEG_W, 0.6, 0.04]} m={M.greyLight} position={[0, 0, -0.02]} />
        <Box s={[SEG_W - 0.06, 0.56, 0.005]} m={M.white} position={[0, 0, 0.002]} />
        <Text position={[0, 0.25, 0.006]} fontSize={0.035} color="#1d3a5c" fontWeight={700}>
          {title}
        </Text>
        <group position={[0, 0, 0.005]}>{children}</group>
      </group>
      {/* upright strip with a digital read-out */}
      <Box s={[SEG_W, 0.22, 0.05]} m={M.greyLight} position={[0, DESK_H + 0.36, -0.33]} />
      <mesh position={[0, DESK_H + 0.36, -0.303]}>
        <planeGeometry args={[0.9, 0.17]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

function SetSegment({ i }: { i: number }) {
  const u = () => plant.units[i];
  return (
    <Segment title={`GENSET G${i + 1}`} readout={() => `${String(Math.round(u().kw)).padStart(4)} kW ${u().rpm > 0 ? u().hz.toFixed(1) : ' 0.0'} Hz`}>
      <Lamp pos={[-0.45, 0.16]} color="#ffb020" label="JALAN" on={() => u().rpm > 0} />
      <Lamp pos={[-0.15, 0.16]} color="#39d353" label="SIAP" on={() => available(u())} />
      <Lamp pos={[0.15, 0.16]} color="#ff3b30" label="CB MASUK" on={() => u().breaker} />
      <Lamp pos={[0.45, 0.16]} color="#ffb020" label="ALARM" on={() => !!u().alarm && flash()} />
      <PushButton pos={[-0.5, 0.0]} color="#2fb36b" label="START" onPress={() => startUnit(plant, i)} lit={() => u().phase === 'crank'} />
      <PushButton pos={[-0.3, 0.0]} color="#d23a2c" label="STOP" onPress={() => stopUnit(plant, i)} lit={() => u().phase === 'cooling' || u().phase === 'stopping'} />
      <PushButton pos={[0.05, 0.0]} color="#d23a2c" label="CB TUTUP" onPress={() => closeBreaker(plant, i)} lit={() => u().breaker} />
      <PushButton pos={[0.27, 0.0]} color="#2fb36b" label="CB BUKA" onPress={() => openBreaker(plant, i)} lit={() => !u().breaker && u().rpm > 0} />
      <Selector pos={[-0.4, -0.17]} left="MAN" right="AUTO" value={() => u().auto} onToggle={() => (u().auto = !u().auto)} />
      <PushButton pos={[0.5, 0.0]} color="#2f6fd0" label="RESET" r={0.026} onPress={() => resetUnit(plant, i)} />
      <Text position={[0.2, -0.17, 0.006]} fontSize={0.02} color={LABEL} maxWidth={0.6} textAlign="center">
        {'TAHAN SINKRON: CB TUTUP SAAT\nJARUM SINKROSKOP DI JAM 12'}
      </Text>
    </Segment>
  );
}

function BusSegment() {
  return (
    <Segment title="BUS & PENYULANG" readout={() => (busLive(plant) ? `${plant.busHz.toFixed(2)} Hz ${Math.round(plant.busV)} V` : '  BUS  PADAM  ')}>
      <Selector pos={[-0.4, 0.13]} left="MAN" right="AUTO" label="LOAD DEMAND" value={() => plant.master} onToggle={() => (plant.master = !plant.master)} />
      <Selector pos={[0.4, 0.13]} left="OFF" right="ON" label="UFLS" value={() => plant.ufls} onToggle={() => (plant.ufls = !plant.ufls)} />
      {plant.feeders.map((f, k) => (
        <PushButton
          key={f.id}
          pos={[-0.54 + k * 0.18, -0.1]}
          color="#d23a2c"
          r={0.026}
          label={f.short.toUpperCase().slice(0, 9)}
          onPress={() => setFeeder(plant, k, !plant.feeders[k].on)}
          lit={() => plant.feeders[k].on && busLive(plant)}
        />
      ))}
    </Segment>
  );
}

// ---------- mimic board ----------

const MW = 2048;
const MH = 640;

function drawMimic(g: CanvasRenderingContext2D) {
  const live = busLive(plant);
  const on = '#ff4a3a';
  const dead = '#3d5a3d';
  g.fillStyle = '#c9cec4';
  g.fillRect(0, 0, MW, MH);
  g.fillStyle = '#1d3a5c';
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'left';
  g.fillText('PLTD KAWASAN SAWIT · DIAGRAM SATU GARIS 400 V / 20 kV', 40, 50);
  // bus bar
  const busY = 300;
  g.strokeStyle = live ? on : dead;
  g.lineWidth = 14;
  g.beginPath();
  g.moveTo(60, busY);
  g.lineTo(1450, busY);
  g.stroke();
  const breaker = (x: number, y: number, closed: boolean) => {
    g.fillStyle = closed ? on : '#c9cec4';
    g.strokeStyle = closed ? on : '#2fa04a';
    g.lineWidth = 5;
    g.fillRect(x - 18, y - 18, 36, 36);
    g.strokeRect(x - 18, y - 18, 36, 36);
  };
  // sets below the bus
  plant.units.forEach((u, i) => {
    const x = 160 + i * 270;
    g.strokeStyle = u.breaker ? on : dead;
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(x, busY);
    g.lineTo(x, 470);
    g.stroke();
    breaker(x, 380, u.breaker);
    g.beginPath();
    g.arc(x, 510, 40, 0, Math.PI * 2);
    g.fillStyle = u.alarm ? (flash() ? '#ff3b30' : '#7a1a14') : u.rpm > 0 ? '#ffb020' : '#8a8f86';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#1d2228';
    g.stroke();
    g.fillStyle = '#1d2228';
    g.font = 'bold 30px sans-serif';
    g.textAlign = 'center';
    g.fillText(`G${i + 1}`, x, 521);
    g.font = '24px monospace';
    g.fillText(`${Math.round(u.kw)} kW`, x, 590);
    // load bar
    g.fillStyle = '#9aa196';
    g.fillRect(x + 50, 470, 16, 80);
    g.fillStyle = u.kw > PRIME_KW ? '#ff3b30' : '#ffb020';
    const f = Math.min(1.15, u.kw / PRIME_KW);
    g.fillRect(x + 50, 550 - 80 * (f / 1.15), 16, 80 * (f / 1.15));
  });
  // feeders above the bus
  plant.feeders.forEach((fd, k) => {
    const x = 120 + k * 196;
    const lit = fd.on && live;
    g.strokeStyle = lit ? on : dead;
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(x, busY);
    g.lineTo(x, 110);
    g.stroke();
    breaker(x, 220, fd.on);
    g.fillStyle = '#1d2228';
    g.font = 'bold 22px sans-serif';
    g.textAlign = 'center';
    g.fillText(fd.short.toUpperCase(), x, 100);
    g.font = '20px monospace';
    g.fillText(`${Math.round(fd.demand)} kW`, x + 0, 160);
    if (fd.lockout || fd.reclose >= 0) {
      g.fillStyle = flash() ? '#ffb020' : '#c9cec4';
      g.fillRect(x - 60, 248, 120, 26);
      g.fillStyle = '#1d2228';
      g.font = 'bold 18px sans-serif';
      g.fillText(fd.lockout ? 'LOCKOUT' : 'RECLOSE', x, 268);
    }
  });
  // big read-outs
  const box = (x: number, y: number, label: string, v: string, color = '#ff8a2a') => {
    g.fillStyle = '#0b0f0c';
    g.fillRect(x, y, 260, 92);
    g.fillStyle = '#8a8f86';
    g.font = '18px sans-serif';
    g.textAlign = 'left';
    g.fillText(label, x + 10, y + 22);
    g.fillStyle = color;
    g.font = 'bold 46px monospace';
    g.textAlign = 'right';
    g.fillText(v, x + 250, y + 78);
  };
  const m = Math.floor(plant.clock);
  box(1500, 80, 'FREKUENSI BUS', live ? plant.busHz.toFixed(2) : '--.--', live && Math.abs(plant.busHz - 50) > 0.5 ? '#ff3b30' : '#ff8a2a');
  box(1780, 80, 'TEGANGAN V', live ? String(Math.round(plant.busV)) : '---');
  box(1500, 185, 'BEBAN MW', live ? (online(plant) / 1000).toFixed(2) : '0.00');
  box(1780, 185, 'JAM', `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, '#7fd34a');
  // annunciators
  const tiles: [string, boolean][] = [
    ['BUS PADAM', !live],
    ['FREK RENDAH', live && plant.busHz < 49],
    ['OVERLOAD', plant.units.some((u) => u.kw > PRIME_KW)],
    ['GENSET TRIP', plant.units.some((u) => !!u.alarm && u.alarm !== 'Servis' && u.alarm !== 'Overhaul')],
    ['UPS BATERAI', plant.ups.some((u) => u.onBattery)],
    ['LOCKOUT', plant.feeders.some((f) => f.lockout)],
    ['SOLAR RENDAH', plant.fuel < TANK_L * 0.2 || plant.units.some((u) => u.dayTank < DAY_L * 0.15)],
    ['SERVIS JATUH TEMPO', plant.units.some((u) => u.sinceService > SERVICE_H)],
    ['BADAI', plant.weather === 'badai'],
  ];
  tiles.forEach(([t, a], k) => {
    const x = 1500 + (k % 3) * 180;
    const y = 300 + Math.floor(k / 3) * 95;
    g.fillStyle = a ? (flash() ? '#ffcf3a' : '#e0a33c') : '#4a4e46';
    g.fillRect(x, y, 170, 85);
    g.strokeStyle = '#1d2228';
    g.lineWidth = 3;
    g.strokeRect(x, y, 170, 85);
    g.fillStyle = a ? '#1d2228' : '#8a8f86';
    g.font = 'bold 20px sans-serif';
    g.textAlign = 'center';
    const words = t.split(' ');
    words.forEach((w, j) => g.fillText(w, x + 85, y + 45 + (j - (words.length - 1) / 2) * 24));
  });
}

const online = (p: typeof plant) => p.units.reduce((a, u) => a + (u.breaker ? u.kw : 0), 0);

function MimicBoard() {
  const m = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = MW;
    c.height = MH;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return { c, t };
  }, []);
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.2) return;
    last.current = clock.elapsedTime;
    drawMimic(m.c.getContext('2d')!);
    m.t.needsUpdate = true;
  });
  // The board follows the same arc as the console, in six flat sections, each showing its slice of the drawing.
  const sections = useMemo(
    () =>
      Array.from({ length: BOARD.n }, (_, j) => {
        const a0 = -BOARD.span + (j * 2 * BOARD.span) / BOARD.n;
        const a1 = a0 + (2 * BOARD.span) / BOARD.n;
        const a = (a0 + a1) / 2;
        const w = 2 * BOARD.r * Math.sin((a1 - a0) / 2);
        const geo = new THREE.PlaneGeometry(w, BOARD.h);
        const uv = geo.attributes.uv as THREE.BufferAttribute;
        for (let k = 0; k < uv.count; k++) uv.setX(k, (j + uv.getX(k)) / BOARD.n);
        return { geo, w, x: ARC_CX + BOARD.r * Math.cos(a), z: BOARD.r * Math.sin(a), rot: Math.atan2(-Math.cos(a), -Math.sin(a)) };
      }),
    [],
  );
  return (
    <group>
      {sections.map((q, j) => (
        <group key={j} position={[q.x, BOARD.y + BOARD.h / 2, q.z]} rotation={[0, q.rot, 0]}>
          <Box s={[q.w + 0.02, BOARD.h + 0.2, 0.08]} m={M.greyLight} position={[0, 0, -0.045]} />
          <mesh geometry={q.geo} position={[0, 0, 0.002]}>
            <meshBasicMaterial map={m.t} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** The station UPS: rectifier/inverter cabinet with a status display, and two battery racks. */
function UpsRoom() {
  const ups = plant.ups[0];
  const tex = useReadout(() => (ups.charge === 0 ? 'BATERAI HABIS' : ups.onBattery ? `BATERAI ${Math.round(ups.charge * 100)}%` : `ONLINE  ${Math.round(ups.charge * 100)}%`));
  const leds = useRef<THREE.Group>(null);
  useFrame(() => {
    leds.current!.children.forEach((c, k) => {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      const lit = k / leds.current!.children.length < ups.charge;
      const col = ups.onBattery ? (flash() ? '#ffb020' : '#553300') : '#39d353';
      m.color.set(lit ? col : '#2a2d30');
      m.emissive.set(lit ? col : '#000000');
      m.emissiveIntensity = lit ? 2 : 0;
    });
  });
  return (
    <group position={[-1.6, 0, 5.45]} rotation={[0, Math.PI, 0]}>
      <Box s={[0.8, 1.9, 0.75]} r={0.02} m={M.white} position={[0, 0.95, 0]} />
      <Box s={[0.7, 0.04, 0.01]} m={M.blue} position={[0, 1.78, 0.38]} />
      <mesh position={[0, 1.45, 0.38]}>
        <planeGeometry args={[0.5, 0.1]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <group ref={leds}>
        {Array.from({ length: 5 }, (_, k) => (
          <mesh key={k} position={[-0.16 + k * 0.08, 1.3, 0.38]}>
            <boxGeometry args={[0.05, 0.03, 0.01]} />
            <meshStandardMaterial color="#2a2d30" />
          </mesh>
        ))}
      </group>
      <Text position={[0, 1.62, 0.381]} fontSize={0.055} color="#1d3a5c" fontWeight={700}>
        UPS 40 kVA
      </Text>
      {[-1.05, -1.95].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {/* open battery rack: four shelves of 12 V blocks */}
          {[0.25, 0.65, 1.05, 1.45].map((y) => (
            <group key={y}>
              <Box s={[0.8, 0.03, 0.5]} m={M.steel} position={[0, y - 0.02, 0]} />
              {Array.from({ length: 4 }, (_, j) => (
                <Box key={j} s={[0.17, 0.22, 0.17]} m={M.black} position={[-0.29 + j * 0.193, y + 0.11, 0]} />
              ))}
            </group>
          ))}
          {[-0.39, 0.39].map((sx) => (
            <Box key={sx} s={[0.03, 1.7, 0.5]} m={M.steel} position={[sx, 0.85, 0]} />
          ))}
        </group>
      ))}
      <Text position={[-1.5, 1.85, 0.28]} fontSize={0.06} color="#1d3a5c">
        BATERAI UPS 36 kWh
      </Text>
    </group>
  );
}

function Chair({ x, z, a }: { x: number; z: number; a: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, a, 0]}>
      <Cyl r={0.04} l={0.45} m={M.steel} position={[0, 0.23, 0]} />
      <Box s={[0.5, 0.08, 0.5]} m={M.black} position={[0, 0.48, 0]} />
      <Box s={[0.5, 0.55, 0.06]} m={M.black} position={[0, 0.8, 0.24]} />
    </group>
  );
}

/** Curved console in front of the mimic board (room frame: board on the +x wall, operators toward −x). */
export function ControlPanels() {
  return (
    <group>
      <MimicBoard />
      <UpsRoom />
      {Array.from({ length: SEGMENTS }, (_, k) => {
        const { x, z, rot } = consoleSeg(k);
        return (
          <group key={k} position={[x, 0, z]} rotation={[0, rot, 0]}>
            {k < 5 ? <SetSegment i={k} /> : <BusSegment />}
            <Chair x={0} z={0.75} a={0} />
          </group>
        );
      })}
    </group>
  );
}
