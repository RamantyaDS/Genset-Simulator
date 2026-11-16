// Procedural model of the open-type 2250 kVA set: base frame, radiator, Perkins 4016 V16, Stamford P7 alternator and control panel.
// Overall size follows the datasheet (5.9 × 2.2 × 2.55 m). Radiator end is −x, alternator end +x, operator side +z.
// Every component is a clickable <Part> that slides away in the two exploded-view levels; the block turns to glass in
// level 2 and X-ray so the moving crankshaft, pistons and alternator rotor show.
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useUI } from '../store';
import { useGenset } from './source';
import { ControlPanel } from './ControlPanel';
import { BoltRing, Box, Cyl, M, Pipe, useCanvasTexture } from './parts';

type V3 = [number, number, number];
const CRANK_Y = 1.05;
const Z: V3 = [0, 0, 0];

/** The object the user clicked last, for the highlight box. */
export const focused: { obj: THREE.Object3D | null } = { obj: null };

/** A named component: clickable, and moved by `o1` (assemblies apart) and additionally `o2` (every part apart). */
function Part({ id, o1 = Z, o2 = Z, children, position }: { id: string; o1?: V3; o2?: V3; children: ReactNode; position?: V3 }) {
  const src = useGenset();
  const ref = useRef<THREE.Group>(null);
  const base = useMemo(() => new THREE.Vector3(...(position ?? Z)), [position]);
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const lv = src.view().explode;
    target.copy(base);
    if (lv >= 1) target.set(target.x + o1[0], target.y + o1[1], target.z + o1[2]);
    if (lv >= 2) target.set(target.x + o2[0], target.y + o2[1], target.z + o2[2]);
    ref.current!.position.lerp(target, Math.min(1, dt * 3));
  });
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (src.pick?.()) return;
    focused.obj = ref.current;
    useUI.getState().set(id === 'panel' ? { focus: id, panelOpen: true } : { focus: id });
  };
  return (
    <group
      ref={ref}
      position={position}
      userData={{ part: id }}
      onClick={click}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      {children}
    </group>
  );
}

/** Hoses and cables that would hang loose in an exploded view are hidden while it is apart. */
function Assembled({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const { view } = useGenset();
  useFrame(() => (ref.current!.visible = view().explode === 0));
  return <group ref={ref}>{children}</group>;
}

// Engine block material turns to glass in detailed exploded view and X-ray.
export const BLOCK = M.teal.clone();
BLOCK.transparent = true;
function GhostBlock() {
  const { view, block = BLOCK } = useGenset();
  useFrame(() => {
    const { explode, xray } = view();
    const target = explode === 2 || xray ? 0.16 : 1;
    block.opacity += (target - block.opacity) * 0.12;
    block.depthWrite = block.opacity > 0.9;
  });
  return null;
}

// Bare cast iron glows once hot enough to see in the dark: dull red from ~480 °C, orange-red toward 700 °C.
const DULL = new THREE.Color('#5a0800');
const BRIGHT = new THREE.Color('#e8360c');
function HotMetal() {
  const { s: sim, plant } = useGenset();
  useFrame(() => {
    if (plant) return; // the plant hall gives each set its own copy of M.hot
    const x = Math.max(0, Math.min(1, (sim.exhaust - 480) / 240));
    M.hot.emissive.copy(DULL).lerp(BRIGHT, x);
    M.hot.emissiveIntensity = x > 0 ? 0.35 + Math.pow(x, 1.6) * 2.4 : 0;
  });
  return null;
}

// Shaft angle for crank, pistons, rotor (one per set, from the source). Shown in slow motion: 1500 rpm is 157 rad/s,
// far past what a frame can show.
function ShaftClock() {
  const { s: sim, shaft } = useGenset();
  useFrame((_, dt) => {
    shaft.angle += (sim.rpm / 1500) * 5.5 * Math.min(dt, 0.05);
  });
  return null;
}

// ---------- base frame ----------

function BaseFrame() {
  const holes = [-2.2, -0.9, 0.9, 2.2];
  return (
    <group>
      <Part id="base">
        {[-1, 1].map((s) => (
          <group key={s}>
            <Box s={[5.9, 0.32, 0.14]} m={M.base} position={[0, 0.16, s * 1.03]} />
            {holes.map((x) => (
              <Box key={x} s={[0.34, 0.12, 0.02]} m={M.black} position={[x, 0.15, s * 1.105]} />
            ))}
          </group>
        ))}
        {[-2.88, -1.6, -0.1, 1.2, 2.88].map((x) => (
          <Box key={x} s={[0.14, 0.28, 1.95]} m={M.base} position={[x, 0.14, 0]} />
        ))}
        <Box s={[5.6, 0.02, 1.9]} m={M.cast} position={[0, 0.06, 0]} />
        {[-2.75, 2.75].map((x) =>
          [-1, 1].map((s) => (
            <mesh key={`${x}${s}`} material={M.yellow} position={[x, 0.36, s * 1.03]}>
              <torusGeometry args={[0.06, 0.018, 8, 16]} />
            </mesh>
          )),
        )}
      </Part>
      <Part id="battery" o2={[0, 0.5, 0.9]}>
        {[0, 1].map((i) => (
          <group key={i} position={[-1.05 + i * 0.55, 0.32, 0.78]}>
            <Box s={[0.5, 0.24, 0.22]} r={0.01} m={M.black} position={[0, 0.12, 0]} />
            <Cyl r={0.022} l={0.04} m={M.red} position={[-0.17, 0.26, 0]} />
            <Cyl r={0.022} l={0.04} m={M.rubber} position={[0.17, 0.26, 0]} />
          </group>
        ))}
        <Box s={[1.15, 0.03, 0.3]} m={M.steel} position={[-0.78, 0.33, 0.78]} />
        <Box s={[0.3, 0.35, 0.16]} r={0.01} m={M.white} position={[0.0, 0.5, 0.92]} />
        <Box s={[0.1, 0.05, 0.01]} m={M.black} position={[0.0, 0.58, 1.0]} />
      </Part>
    </group>
  );
}

// ---------- radiator & fan ----------

function FanBlades() {
  const { s: sim } = useGenset();
  const blades = useRef<THREE.Group>(null);
  const blur = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    // Belt-driven fan turns ~0.75× crank speed. Shown slowed down past a point so it reads as spinning, not strobing.
    const w = (sim.rpm * 0.75 * Math.PI * 2) / 60;
    blades.current!.rotation.x += Math.min(w, 9) * dt;
    (blur.current!.material as THREE.MeshBasicMaterial).opacity = Math.min(0.55, sim.rpm / 1500) * 0.6;
  });
  return (
    <group position={[-2.16, 1.45, 0]}>
      <group ref={blades}>
        <Cyl r={0.16} l={0.18} axis="x" m={M.black} />
        {Array.from({ length: 8 }, (_, i) => (
          <group key={i} rotation={[(i / 8) * Math.PI * 2, 0, 0]}>
            <Box s={[0.03, 0.78, 0.26]} m={M.black} position={[0, 0.52, 0]} rotation={[0, 0.5, 0]} />
          </group>
        ))}
      </group>
      <mesh ref={blur} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.93, 48]} />
        <meshBasicMaterial color="#202224" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Radiator() {
  const core = useCanvasTexture(
    256,
    256,
    (g) => {
      g.fillStyle = '#16181a';
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#2b2e31';
      g.lineWidth = 2;
      for (let x = 0; x < 256; x += 6) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, 256);
        g.stroke();
      }
      g.strokeStyle = '#0c0d0e';
      for (let y = 0; y < 256; y += 32) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(256, y);
        g.stroke();
      }
    },
    [6, 6],
  );
  const coreMat = useMemo(() => new THREE.MeshStandardMaterial({ map: core, metalness: 0.4, roughness: 0.65 }), [core]);
  return (
    <group>
      {/* frame, two cores (jacket water above, charge air below) and top tank */}
      <Box s={[0.5, 2.2, 0.1]} m={M.black} position={[-2.6, 1.43, 1.05]} />
      <Box s={[0.5, 2.2, 0.1]} m={M.black} position={[-2.6, 1.43, -1.05]} />
      <Box s={[0.5, 0.12, 2.2]} m={M.black} position={[-2.6, 0.38, 0]} />
      <Box s={[0.5, 0.2, 2.2]} m={M.black} position={[-2.6, 2.44, 0]} />
      <mesh material={coreMat} position={[-2.85, 1.42, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[2.0, 1.95]} />
      </mesh>
      <Box s={[0.36, 1.95, 2.0]} m={M.black} position={[-2.66, 1.42, 0]} />
      <Box s={[0.38, 0.04, 2.0]} m={M.steel} position={[-2.66, 0.95, 0]} />
      {/* breaker / charger box on the operator side of the radiator frame */}
      <Box s={[0.42, 0.55, 0.18]} r={0.01} m={M.white} position={[-2.6, 1.6, 1.19]} />
      <Box s={[0.18, 0.1, 0.01]} m={M.black} position={[-2.6, 1.72, 1.285]} />
      <Cyl r={0.06} l={0.06} m={M.steel} position={[-2.6, 2.57, 0.7]} />
      <Box s={[0.3, 0.25, 0.5]} r={0.03} m={M.black} position={[-2.4, 2.62, -0.6]} />
      {[-1, 1].map((s) => (
        <Box key={s} s={[0.6, 0.06, 0.06]} m={M.black} position={[-2.2, 2.2, s * 1.0]} rotation={[0, 0, -0.5]} />
      ))}
      <Part id="fan" o2={[0.75, 0, 0]}>
        <mesh material={M.black} position={[-2.3, 1.45, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.99, 0.99, 0.3, 48, 1, true]} />
        </mesh>
        {[0.35, 0.65, 0.95].map((r) => (
          <mesh key={r} material={M.steel} position={[-2.05, 1.45, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[r, 0.008, 6, 48]} />
          </mesh>
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <group key={i} position={[-2.05, 1.45, 0]} rotation={[(i / 8) * Math.PI * 2, 0, 0]}>
            <Cyl r={0.007} l={0.95} m={M.steel} position={[0, 0.48, 0]} seg={5} />
          </group>
        ))}
        <FanBlades />
      </Part>
    </group>
  );
}

// ---------- engine ----------

const CYL_X = Array.from({ length: 8 }, (_, i) => -1.62 + i * 0.3);
const THROW = [0, 180, 90, 270, 270, 90, 180, 0].map((d) => (d * Math.PI) / 180);
const R_CRANK = 0.095; // half of the 190 mm stroke
const ROD = 0.6; // visual rod length (fits the simplified block)
const CRANK_LOCAL = -0.42; // crank centre measured along the bank axis from the bank origin

/** Pistons and rods of one bank, driven by the shared shaft angle; crowns glow on the power stroke. */
function Pistons({ side }: { side: 1 | -1 }) {
  const { s: sim, shaft } = useGenset();
  const pistons = useRef<(THREE.Group | null)[]>([]);
  const rods = useRef<(THREE.Mesh | null)[]>([]);
  const crowns = useMemo(
    () => CYL_X.map(() => new THREE.MeshStandardMaterial({ color: '#b9bec2', metalness: 0.8, roughness: 0.3, emissive: '#ff6a1a', emissiveIntensity: 0 })),
    [],
  );
  const phi = side * (Math.PI / 6);
  useFrame(() => {
    CYL_X.forEach((_, i) => {
      const beta = shaft.angle + THROW[i];
      const a = beta - phi;
      const pinY = CRANK_LOCAL + R_CRANK * Math.cos(a);
      const pinZ = R_CRANK * Math.sin(a);
      const pY = CRANK_LOCAL + R_CRANK * Math.cos(a) + Math.sqrt(ROD * ROD - (R_CRANK * Math.sin(a)) ** 2);
      const p = pistons.current[i];
      if (p) p.position.y = pY;
      const r = rods.current[i];
      if (r) {
        r.position.set(r.position.x, (pinY + pY) / 2, pinZ / 2);
        r.rotation.x = Math.atan2(-pinZ, pY - pinY);
      }
      // Four-stroke: each cylinder fires every other revolution, just after top dead centre.
      const offset = (i + (side > 0 ? 0 : 1)) % 2 ? 2 * Math.PI : 0;
      const ph = (((a + offset) % (4 * Math.PI)) + 4 * Math.PI) % (4 * Math.PI);
      const burn = sim.firing && ph < 1.2 ? (1 - ph / 1.2) * (0.6 + Math.min(1, sim.genKw / 1800)) : 0;
      crowns[i].emissiveIntensity = burn * 3;
    });
  });
  return (
    <group>
      {CYL_X.map((x, i) => (
        <group key={x}>
          {/* cylinder liner */}
          <mesh position={[x, 0.18, 0]}>
            <cylinderGeometry args={[0.085, 0.085, 0.5, 20, 1, true]} />
            <meshStandardMaterial color="#9aa1a6" metalness={0.7} roughness={0.35} transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <group ref={(g) => (pistons.current[i] = g)} position={[x + side * 0.03, 0, 0]}>
            <mesh material={crowns[i]} position={[0, 0.055, 0]}>
              <cylinderGeometry args={[0.078, 0.078, 0.11, 20]} />
            </mesh>
            {[0.02, 0.05, 0.08].map((y) => (
              <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.079, 0.003, 4, 20]} />
                <meshStandardMaterial color="#555" />
              </mesh>
            ))}
          </group>
          <mesh ref={(m) => (rods.current[i] = m)} material={M.steel} position={[x + side * 0.03, 0, 0]}>
            <boxGeometry args={[0.035, ROD, 0.05]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Crankshaft() {
  const { shaft } = useGenset();
  const ref = useRef<THREE.Group>(null);
  useFrame(() => (ref.current!.rotation.x = shaft.angle));
  return (
    <group ref={ref} position={[0, CRANK_Y, 0]}>
      <Cyl r={0.055} l={2.75} axis="x" m={M.steel} position={[-0.55, 0, 0]} />
      {CYL_X.map((x, i) => {
        const t = THROW[i];
        const y = R_CRANK * Math.cos(t);
        const z = R_CRANK * Math.sin(t);
        return (
          <group key={x}>
            <Cyl r={0.045} l={0.15} axis="x" m={M.steel} position={[x, y, z]} />
            {[-0.09, 0.09].map((dx) => (
              <group key={dx} position={[x + dx, 0, 0]} rotation={[t, 0, 0]}>
                <Box s={[0.035, 0.26, 0.12]} m={M.cast} position={[0, 0.03, 0]} />
                {/* counterweight opposite the pin */}
                <Box s={[0.035, 0.12, 0.22]} m={M.cast} position={[0, -0.12, 0]} />
              </group>
            ))}
          </group>
        );
      })}
      <Cyl r={0.5} l={0.12} axis="x" m={M.cast} position={[0.82, 0, 0]} />
    </group>
  );
}

function Bank({ side }: { side: 1 | -1 }) {
  return (
    <group position={[0, 1.42, side * 0.2]} rotation={[side * (Math.PI / 6), 0, 0]}>
      <Part id="block">
        <Box s={[2.55, 0.5, 0.5]} m={BLOCK} position={[-0.56, 0.2, 0]} />
      </Part>
      <Internals>
        <Part id="piston">
          <Pistons side={side} />
        </Part>
      </Internals>
      {CYL_X.map((x) => (
        <Part key={x} id="head" o2={[0, 0.35, 0]} position={[x, 0, 0]}>
          <Box s={[0.27, 0.2, 0.46]} r={0.02} m={M.teal} position={[0, 0.54, 0]} />
          <Cyl r={0.008} l={0.2} m={M.steel} position={[0, 0.66, -side * 0.21]} />
          <Cyl r={0.045} l={0.14} axis="z" m={M.hot} position={[0, 0.52, side * 0.27]} />
          {/* valve springs and injector under the cover */}
          {[-0.06, 0.06].map((dx) => (
            <Cyl key={dx} r={0.02} l={0.08} m={M.steel} position={[dx, 0.67, 0.08]} />
          ))}
          <Cyl r={0.015} l={0.12} m={M.copper} position={[0, 0.68, -0.05]} />
          <Part id="rocker" o2={[0, 0.35, 0]}>
            <Box s={[0.23, 0.12, 0.38]} r={0.035} m={M.teal} position={[0, 0.7, 0]} />
            <Cyl r={0.018} l={0.06} m={M.steel} position={[0, 0.78, 0]} />
          </Part>
        </Part>
      ))}
      <Part id="exhaust" o2={[0, 0.15, side * 0.5]}>
        <Cyl r={0.085} l={2.5} axis="x" m={M.silver} position={[-0.5, 0.52, side * 0.38]} />
        {CYL_X.map((x) => (
          <Cyl key={x} r={0.09} l={0.025} axis="x" m={M.steel} position={[x + 0.15, 0.52, side * 0.38]} />
        ))}
      </Part>
      <Part id="intake" o2={[0, 1.15, 0]}>
        <Cyl r={0.07} l={2.45} axis="x" m={M.tealDark} position={[-0.52, 0.35, -side * 0.3]} />
      </Part>
    </group>
  );
}

/** Internals are shown when the block is glass. */
function Internals({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const { view } = useGenset();
  useFrame(() => {
    const { explode, xray } = view();
    ref.current!.visible = explode === 2 || xray;
  });
  return <group ref={ref}>{children}</group>;
}

function TurboWheel({ side }: { side: 1 | -1 }) {
  const { s: sim } = useGenset();
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => (ref.current!.rotation.z += (sim.rpm / 1500) * (8 + 10 * Math.min(1, sim.genKw / 1800)) * dt * side));
  return (
    <group ref={ref}>
      {Array.from({ length: 10 }, (_, i) => (
        <Box key={i} s={[0.012, 0.09, 0.05]} m={M.steel} position={[Math.cos((i / 10) * Math.PI * 2) * 0.05, Math.sin((i / 10) * Math.PI * 2) * 0.05, 0]} rotation={[0, 0.4, (i / 10) * Math.PI * 2]} />
      ))}
    </group>
  );
}

function Turbo({ position, side }: { position: V3; side: 1 | -1 }) {
  return (
    <group position={position}>
      <mesh material={M.hot} castShadow>
        <torusGeometry args={[0.12, 0.07, 12, 24]} />
      </mesh>
      <Cyl r={0.09} l={0.14} axis="z" m={M.hot} />
      <Cyl r={0.06} l={0.14} axis="z" m={M.steel} position={[0, 0, -side * 0.11]} />
      {/* compressor wheel shows once its housing is lifted off */}
      <group position={[0, 0, -side * 0.22]}>
        <TurboWheel side={side} />
      </group>
      <Part id="turbo" o2={[0, 0, -side * 0.35]}>
        <group position={[0, 0, -side * 0.22]}>
          <mesh material={M.silver} castShadow>
            <torusGeometry args={[0.13, 0.065, 12, 24]} />
          </mesh>
          <Cyl r={0.1} l={0.12} axis="z" m={M.silver} />
        </group>
      </Part>
    </group>
  );
}

function Engine() {
  return (
    <group>
      <GhostBlock />
      <ShaftClock />
      <HotMetal />
      <Part id="sump" o2={[0, -0.2, 1.75]}>
        <Box s={[2.5, 0.48, 0.95]} r={0.03} m={BLOCK} position={[-0.56, 0.68, 0]} />
      </Part>
      <Part id="block">
        <Box s={[2.62, 0.55, 1.1]} r={0.03} m={BLOCK} position={[-0.56, 1.17, 0]} />
        {[-1.5, 0.45].map((x) =>
          [-1, 1].map((s) => (
            <group key={`${x}${s}`}>
              <Box s={[0.22, 0.12, 0.32]} m={M.tealDark} position={[x, 0.98, s * 0.66]} />
              <Box s={[0.16, 0.52, 0.12]} m={M.tealDark} position={[x, 0.66, s * 0.78]} />
              <Cyl r={0.09} l={0.1} m={M.rubber} position={[x, 0.37, s * 0.78]} />
            </group>
          )),
        )}
        <Box s={[0.18, 0.1, 0.01]} m={M.steel} position={[-0.2, 1.3, 0.556]} />
        {[-1.75, -0.3].map((x) => (
          <mesh key={x} material={M.yellow} position={[x, 2.25, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.07, 0.02, 8, 16]} />
          </mesh>
        ))}
        <Cyl r={0.05} l={0.12} m={M.yellow} position={[-1.3, 1.5, 0.58]} />
        <Cyl r={0.012} l={0.4} m={M.yellow} position={[-0.95, 1.55, 0.6]} rotation={[0.2, 0, 0]} />
      </Part>
      <Internals>
        <Part id="crank">
          <Crankshaft />
        </Part>
      </Internals>
      <Bank side={1} />
      <Bank side={-1} />

      {/* front end */}
      <Part id="front" o2={[-0.55, 0, 0]}>
        <Box s={[0.14, 1.05, 1.15]} r={0.03} m={M.teal} position={[-1.92, 1.25, 0]} />
        <Cyl r={0.27} l={0.12} axis="x" m={M.steel} position={[-2.05, CRANK_Y - 0.1, 0]} />
        <Cyl r={0.2} l={0.08} axis="x" m={M.cast} position={[-2.13, CRANK_Y - 0.1, 0]} />
        <Cyl r={0.2} l={0.14} axis="x" m={M.steel} position={[-2.08, 1.45, 0]} />
        <Part id="waterpump" o2={[-0.3, 0.15, 0]}>
          {[-1, 1].map((s) => (
            <group key={s}>
              <Cyl r={0.15} l={0.2} axis="x" m={M.teal} position={[-2.02, 1.5, s * 0.38]} />
              <Cyl r={0.1} l={0.08} axis="x" m={M.steel} position={[-2.14, 1.5, s * 0.38]} />
            </group>
          ))}
        </Part>
        <Part id="belt" o2={[-0.35, -0.1, 0]}>
          {[-0.05, 0.05].map((dz) => (
            <group key={dz}>
              <Box s={[0.02, 0.56, 0.035]} m={M.rubber} position={[-2.1, 1.2, dz + 0.24]} rotation={[-0.12, 0, 0]} />
              <Box s={[0.02, 0.56, 0.035]} m={M.rubber} position={[-2.1, 1.2, dz - 0.24]} rotation={[0.12, 0, 0]} />
            </group>
          ))}
          <Box s={[0.05, 0.9, 0.7]} r={0.02} m={M.yellow} position={[-2.18, 1.2, 0]} />
        </Part>
      </Part>
      <Part id="thermostat" o2={[-0.3, 0.55, 0]}>
        <Box s={[0.3, 0.2, 0.6]} r={0.03} m={M.teal} position={[-1.85, 2.0, 0]} />
      </Part>
      <Assembled>
        {/* two big arching pipes from the front of the engine into the top of the radiator */}
        {[-1, 1].map((s) => (
          <Pipe key={s} pts={[[-1.85, 2.1, s * 0.2], [-1.95, 2.42, s * 0.3], [-2.12, 2.6, s * 0.36], [-2.36, 2.56, s * 0.38], [-2.42, 2.46, s * 0.38]]} r={0.085} m={M.black} />
        ))}
        <Pipe pts={[[-2.02, 1.38, -0.38], [-1.98, 0.85, -0.5], [-2.12, 0.46, -0.55], [-2.4, 0.44, -0.6]]} r={0.075} m={M.rubber} />
        {[-1, 1].map((s) => (
          <Pipe key={s} pts={[[-1.4, 1.95, s * 0.22], [-1.6, 1.9, s * 0.8], [-2.0, 1.4, s * 1.0], [-2.38, 1.0, s * 0.98]]} r={0.055} m={M.rubber} />
        ))}
        <Pipe pts={[[-1.6, 2.06, 0.2], [-0.8, 2.08, 0.21], [0.15, 2.06, 0.2], [0.4, 1.95, 0.3]]} r={0.025} m={M.rubber} />
        <Pipe pts={[[-1.6, 2.06, -0.2], [-0.8, 2.08, -0.21], [0.15, 2.06, -0.2], [0.3, 1.5, -0.62]]} r={0.025} m={M.rubber} />
      </Assembled>

      {/* side equipment */}
      <Part id="fuelfilter" o2={[0, 0, 0.65]}>
        {[0, 1, 2].map((i) => (
          <group key={i} position={[-0.9 + i * 0.16, 0.95, 0.66]}>
            <Cyl r={0.065} l={0.3} m={M.white} />
            <Cyl r={0.07} l={0.04} m={M.steel} position={[0, 0.17, 0]} />
          </group>
        ))}
        <Box s={[0.5, 0.18, 0.1]} m={M.tealDark} position={[-0.74, 1.15, 0.62]} />
      </Part>
      <Part id="oilfilter" o2={[0, 0, -0.65]}>
        {[0, 1, 2, 3].map((i) => (
          <Cyl key={i} r={0.075} l={0.32} m={M.white} position={[-1.15 + i * 0.18, 0.95, -0.66]} />
        ))}
        <Cyl r={0.12} l={1.0} axis="x" m={M.tealDark} position={[-0.2, 1.05, -0.66]} />
      </Part>
      <Part id="ecm" o2={[0, 0.25, 0.7]}>
        <Box s={[0.36, 0.26, 0.08]} r={0.02} m={M.black} position={[0.2, 1.15, 0.64]} />
      </Part>

      <Part id="flywheel" o2={[0.55, 0, 0]}>
        <Cyl r={0.74} r2={0.62} l={0.24} axis="x" m={M.teal} position={[0.86, CRANK_Y, 0]} />
      </Part>
      {[-1, 1].map((s) => (
        <Part key={s} id="starter" o2={[0.5, -0.15, s * 0.7]}>
          <group position={[0.82, 0.62, s * 0.5]}>
            <Cyl r={0.11} l={0.42} axis="x" m={M.black} />
            <Cyl r={0.06} l={0.1} axis="y" m={M.black} position={[0.05, 0.13, 0]} />
            <Cyl r={0.04} l={0.08} axis="x" m={M.steel} position={[0.25, 0, 0]} />
          </group>
        </Part>
      ))}

      {/* turbos and exhaust outlet */}
      <Part id="turbo" o2={[0.45, 1.15, 0]}>
        <Turbo position={[0.55, 2.12, 0.42]} side={1} />
        <Turbo position={[0.92, 2.12, 0.42]} side={1} />
        <Turbo position={[0.55, 2.12, -0.42]} side={-1} />
        <Turbo position={[0.92, 2.12, -0.42]} side={-1} />
      </Part>
      <Part id="exhaust" o2={[0.45, 1.9, 0]}>
        {[-1, 1].map((s) => (
          <Pipe key={s} pts={[[0.6, 1.95, s * 0.75], [0.74, 2.05, s * 0.72], [0.74, 2.2, s * 0.55]]} r={0.08} m={M.silver} />
        ))}
        <Cyl r={0.16} l={1.0} axis="z" m={M.silver} position={[0.74, 2.3, 0]} />
        <Cyl r={0.17} l={0.18} m={M.steel} position={[0.74, 2.42, 0]} />
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} material={M.steel} position={[0.74, 2.42 + i * 0.025, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.165, 0.012, 6, 32]} />
          </mesh>
        ))}
        <Cyl r={0.2} l={0.03} m={M.steel} position={[0.74, 2.56, 0]} />
        <BoltRing r={0.17} n={10} m={M.cast} position={[0.74, 2.58, 0]} rotation={[0, 0, Math.PI / 2]} />
      </Part>
      <Part id="aftercooler" o2={[0, 1.55, 0]}>
        {/* sits above the two intake manifolds in the vee */}
        <Box s={[1.6, 0.2, 0.3]} r={0.03} m={M.tealDark} position={[-0.7, 2.05, 0]} />
        {[-1.3, -0.1].map((x) => (
          <Cyl key={x} r={0.035} l={0.34} axis="z" m={M.steel} position={[x, 2.05, 0]} />
        ))}
      </Part>
    </group>
  );
}

// Two pairs with a gap between them for the exhaust outlet (x 0.74).
const FILTER_X = [-0.12, 0.3, 1.18, 1.6];
const FILTER_Y = 2.5;

function AirCleaners() {
  // Four dry filters lying across the engine above the flywheel end, one per turbo, on a black cradle.
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box s={[2.0, 0.06, 0.06]} m={M.black} position={[0.74, FILTER_Y - 0.22, s * 0.28]} />
          {[-0.25, 1.73].map((x) => (
            <Box key={x} s={[0.06, 0.5, 0.06]} m={M.black} position={[x, FILTER_Y - 0.45, s * 0.28]} />
          ))}
        </group>
      ))}
      {FILTER_X.map((x) => (
        <group key={x} position={[x, FILTER_Y, 0]}>
          <Cyl r={0.2} l={0.62} axis="z" m={M.black} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <Cyl r={0.205} l={0.035} axis="z" m={M.steel} position={[0, 0, s * 0.31]} />
              <Cyl r={0.06} l={0.04} axis="z" m={M.steel} position={[0, 0, s * 0.34]} />
            </group>
          ))}
          {/* restriction indicator */}
          <Cyl r={0.02} l={0.06} m={M.red} position={[0, 0.22, 0.2]} />
        </group>
      ))}
      <Assembled>
        {FILTER_X.map((x, i) => {
          // each filter feeds the compressor inlet of one turbo (inlets face the middle of the vee)
          const tx = i < 2 ? 0.55 : 0.92;
          const tz = i % 2 ? -0.12 : 0.12;
          return <Pipe key={x} pts={[[x, FILTER_Y - 0.2, tz * 0.5], [(x + tx) / 2, FILTER_Y - 0.3, tz], [tx, 2.14, tz]]} r={0.06} m={M.rubber} />;
        })}
      </Assembled>
    </group>
  );
}

// ---------- alternator ----------

function Rotor() {
  const { shaft } = useGenset();
  const ref = useRef<THREE.Group>(null);
  useFrame(() => (ref.current!.rotation.x = shaft.angle));
  return (
    <group ref={ref} position={[0, CRANK_Y, 0]}>
      <Cyl r={0.08} l={1.55} axis="x" m={M.steel} position={[1.72, 0, 0]} />
      <Cyl r={0.3} l={0.85} axis="x" m={M.cast} position={[1.68, 0, 0]} />
      {/* four salient poles with copper field windings */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[(i * Math.PI) / 2, 0, 0]}>
          <Box s={[0.85, 0.2, 0.24]} m={M.cast} position={[1.68, 0.38, 0]} />
          <Box s={[0.82, 0.14, 0.32]} m={M.copper} position={[1.68, 0.36, 0]} />
          <Box s={[0.88, 0.05, 0.4]} m={M.cast} position={[1.68, 0.5, 0]} />
        </group>
      ))}
      {/* drive-end cooling fan */}
      {Array.from({ length: 12 }, (_, i) => (
        <group key={i} rotation={[(i / 12) * Math.PI * 2, 0, 0]}>
          <Box s={[0.08, 0.3, 0.02]} m={M.steel} position={[1.15, 0.42, 0]} />
        </group>
      ))}
      {/* exciter rotor and rotating diodes at the non-drive end */}
      <Cyl r={0.2} l={0.12} axis="x" m={M.copper} position={[2.3, 0, 0]} />
    </group>
  );
}

function Alternator() {
  const grille = useCanvasTexture(256, 256, (g) => {
    g.fillStyle = '#2a2e32';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#0a0b0c';
    for (let y = 8; y < 248; y += 10) g.fillRect(20, y, 216, 5);
  });
  const grilleMat = useMemo(() => new THREE.MeshStandardMaterial({ map: grille, metalness: 0.4, roughness: 0.6 }), [grille]);
  return (
    <group>
      <Part id="rotor">
        <Rotor />
      </Part>
      <Part id="stator" o2={[1.4, 0, 0]}>
        <Cyl r={0.8} l={0.16} axis="x" m={M.alt} position={[1.07, CRANK_Y, 0]} open />
        {[-1, 1].map((s) => (
          <mesh key={s} material={grilleMat} position={[1.07, CRANK_Y, s * 0.805]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
            <planeGeometry args={[0.14, 0.9]} />
          </mesh>
        ))}
        {/* hollow frame so the rotor can slide out of it */}
        <mesh material={M.alt} position={[1.68, CRANK_Y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.72, 0.72, 1.05, 40, 1, true]} />
        </mesh>
        <mesh position={[1.68, CRANK_Y, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.6, 0.6, 1.0, 40, 1, true]} />
          <meshStandardMaterial color="#3a3f44" metalness={0.5} roughness={0.5} side={THREE.BackSide} />
        </mesh>
        {/* stator winding end turns */}
        {[1.2, 2.16].map((x) => (
          <mesh key={x} material={M.copper} position={[x, CRANK_Y, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.58, 0.06, 10, 40]} />
          </mesh>
        ))}
        {[1.25, 1.68, 2.1].map((x) => (
          <mesh key={x} material={M.alt} position={[x, CRANK_Y, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.73, 0.03, 8, 40]} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <group key={s}>
            <Box s={[1.15, 0.08, 0.3]} m={M.alt} position={[1.68, 0.4, s * 0.55]} />
            {[1.3, 1.68, 2.06].map((x) => (
              <Box key={x} s={[0.05, 0.45, 0.3]} m={M.alt} position={[x, 0.62, s * 0.55]} />
            ))}
            <Cyl r={0.08} l={0.08} m={M.rubber} position={[1.35, 0.34, s * 0.55]} />
            <Cyl r={0.08} l={0.08} m={M.rubber} position={[2.0, 0.34, s * 0.55]} />
          </group>
        ))}
        <Part id="terminal" o2={[0, 0.6, 0]}>
          <Box s={[0.9, 0.52, 1.0]} r={0.02} m={M.alt} position={[1.62, 1.95, 0]} />
          <Box s={[0.82, 0.04, 0.92]} m={M.black} position={[1.62, 2.21, 0]} />
          {/* cable gland plate and louvre on the side */}
          <Box s={[0.5, 0.2, 0.02]} m={M.black} position={[1.62, 1.85, 0.505]} />
          {[0, 1, 2, 3].map((i) => (
            <Cyl key={i} r={0.03} l={0.03} axis="z" m={M.rubber} position={[1.44 + i * 0.12, 1.85, 0.52]} />
          ))}
        </Part>
        <Part id="exciter" o2={[0.6, 0, 0]}>
          <Cyl r={0.66} l={0.12} axis="x" seg={40} m={M.alt} position={[2.24, CRANK_Y, 0]} />
          {/* air inlet louvres around the cone */}
          {[-1, 1].map((s) => (
            <mesh key={s} material={grilleMat} position={[2.3, CRANK_Y + 0.62 * 0, s * 0.665]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
              <planeGeometry args={[0.1, 0.6]} />
            </mesh>
          ))}
          <Cyl r={0.6} r2={0.3} l={0.22} axis="x" m={M.alt} position={[2.41, CRANK_Y, 0]} />
          <Cyl r={0.3} r2={0.22} l={0.18} axis="x" m={M.alt} position={[2.6, CRANK_Y, 0]} />
          <BoltRing r={0.62} n={16} m={M.steel} position={[2.3, CRANK_Y, 0]} />
        </Part>
      </Part>
      <Assembled>
        <Pipe pts={[[1.9, 2.0, 0.42], [2.2, 1.95, 0.55], [2.55, 1.5, 0.6]]} r={0.04} m={M.rubber} />
        <Pipe pts={[[1.95, 1.9, 0.42], [2.25, 1.85, 0.5], [2.6, 1.4, 0.55]]} r={0.04} m={M.rubber} />
      </Assembled>
    </group>
  );
}

// ---------- assembly ----------

/** Engine rocking on its rubber mounts: firing pulses, a shudder while cranking, a wobble through resonance on run-down. */
function Shaker({ children }: { children: ReactNode }) {
  const { s: sim } = useGenset();
  const ref = useRef<THREE.Group>(null);
  const torque = useRef(0);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const r = sim.rpm;
    const lf = Math.min(1.2, sim.genKw / 1800);
    // Reaction torque from load rolls the engine slightly on its mounts.
    torque.current += (lf * 0.004 - torque.current) * Math.min(1, dt * 2);
    let a = 0;
    if (sim.starter) a = 0.005 * (0.6 + 0.4 * Math.abs(Math.sin(t * 9)));
    else if (r > 0) a = 0.0012 + (r > 150 && r < 700 ? 0.006 : 0) + lf * 0.0008;
    const g = ref.current!;
    g.position.y = Math.sin(t * 97) * a;
    g.position.z = Math.sin(t * 71 + 1) * a * 0.7;
    g.rotation.x = Math.sin(t * 53) * a * 0.15 + (r > 600 ? torque.current : 0);
  });
  return <group ref={ref}>{children}</group>;
}

export function Genset() {
  const { bare } = useGenset();
  return (
    <group>
      <BaseFrame />
      <Shaker>
        <Part id="radiator" o1={[-1.45, 0, 0]}>
          <Radiator />
        </Part>
        <Engine />
        <Part id="aircleaner" o1={[0.4, 1.2, 0]} o2={[0.7, 0.6, 0]}>
          <AirCleaners />
        </Part>
        {!bare && (
          <group>
            <AlternatorMount />
          </group>
        )}
      </Shaker>
      {!bare && (
        <Part id="panel" o1={[0.9, 0.4, -1.9]} o2={[1.0, 0, -0.5]}>
          <ControlPanel />
        </Part>
      )}
    </group>
  );
}

/** Level 1 moves the whole alternator away from the engine. */
function AlternatorMount() {
  const ref = useRef<THREE.Group>(null);
  const { view } = useGenset();
  useFrame((_, dt) => {
    const lv = view().explode;
    ref.current!.position.x += ((lv >= 1 ? 1.6 : 0) - ref.current!.position.x) * Math.min(1, dt * 3);
  });
  return (
    <group ref={ref}>
      <Alternator />
    </group>
  );
}
