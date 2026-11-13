// Procedural model of the open-type 2250 kVA set: base frame, radiator, Perkins 4016 V16, Stamford P7 alternator and control panel.
// Overall size follows the datasheet (5.9 × 2.2 × 2.55 m). Radiator end is −x, alternator end +x, operator side +z.
import { useFrame } from '@react-three/fiber';
import { useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { sim, useUI } from '../store';
import { BoltRing, Box, Cyl, M, Pipe, useCanvasTexture } from './parts';
import { ControlPanel } from './ControlPanel';

const CRANK_Y = 1.05;

/** Slides its children to `offset` when exploded view is on. */
function Movable({ offset, children, name }: { offset: [number, number, number]; children: ReactNode; name?: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const on = useUI.getState().explode;
    const g = ref.current!;
    const k = Math.min(1, dt * 3);
    g.position.x += ((on ? offset[0] : 0) - g.position.x) * k;
    g.position.y += ((on ? offset[1] : 0) - g.position.y) * k;
    g.position.z += ((on ? offset[2] : 0) - g.position.z) * k;
  });
  return (
    <group ref={ref} name={name} userData={{ part: name }}>
      {children}
    </group>
  );
}

// ---------- base frame ----------

function BaseFrame() {
  const holes = [-2.2, -0.9, 0.9, 2.2];
  return (
    <group>
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
      {/* starter batteries */}
      {[0, 1].map((i) => (
        <group key={i} position={[-1.05 + i * 0.55, 0.32, 0.78]}>
          <Box s={[0.5, 0.24, 0.22]} r={0.01} m={M.black} position={[0, 0.12, 0]} />
          <Cyl r={0.022} l={0.04} m={M.red} position={[-0.17, 0.26, 0]} />
          <Cyl r={0.022} l={0.04} m={M.rubber} position={[0.17, 0.26, 0]} />
        </group>
      ))}
      <Box s={[1.15, 0.03, 0.3]} m={M.steel} position={[-0.78, 0.33, 0.78]} />
    </group>
  );
}

// ---------- radiator & fan ----------

function Fan() {
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
  const coreMat = useRef(new THREE.MeshStandardMaterial({ map: core, metalness: 0.4, roughness: 0.65 })).current;
  return (
    <group>
      {/* frame */}
      <Box s={[0.5, 2.2, 0.1]} m={M.black} position={[-2.6, 1.43, 1.05]} />
      <Box s={[0.5, 2.2, 0.1]} m={M.black} position={[-2.6, 1.43, -1.05]} />
      <Box s={[0.5, 0.12, 2.2]} m={M.black} position={[-2.6, 0.38, 0]} />
      <Box s={[0.5, 0.2, 2.2]} m={M.black} position={[-2.6, 2.44, 0]} />
      {/* core faces */}
      <mesh material={coreMat} position={[-2.85, 1.42, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[2.0, 1.95]} />
      </mesh>
      <Box s={[0.36, 1.95, 2.0]} m={M.black} position={[-2.66, 1.42, 0]} />
      {/* filler cap & expansion tank */}
      <Cyl r={0.06} l={0.06} m={M.steel} position={[-2.6, 2.57, 0.7]} />
      <Box s={[0.3, 0.25, 0.5]} r={0.03} m={M.black} position={[-2.4, 2.62, -0.6]} />
      {/* fan shroud and guard */}
      <Box s={[0.18, 2.0, 2.0]} m={M.black} position={[-2.33, 1.42, 0]} visible={false} />
      <mesh material={M.black} position={[-2.3, 1.45, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.99, 0.99, 0.3, 48, 1, true]} />
      </mesh>
      <mesh material={M.black} position={[-2.42, 1.45, 0]} rotation={[0, Math.PI / 2, 0]}>
        <ringGeometry args={[0.99, 1.0, 48]} />
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
      <Fan />
      {/* side stays to base */}
      {[-1, 1].map((s) => (
        <Box key={s} s={[0.6, 0.06, 0.06]} m={M.black} position={[-2.2, 2.2, s * 1.0]} rotation={[0, 0, -0.5]} />
      ))}
    </group>
  );
}

// ---------- engine ----------

const CYL_X = Array.from({ length: 8 }, (_, i) => -1.62 + i * 0.3);

function Bank({ side }: { side: 1 | -1 }) {
  return (
    <group position={[0, 1.42, side * 0.2]} rotation={[side * (Math.PI / 6), 0, 0]}>
      {/* cylinder block bank */}
      <Box s={[2.55, 0.5, 0.5]} m={M.teal} position={[-0.56, 0.2, 0]} />
      {CYL_X.map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {/* individual head + rocker cover, as on the 4000 series */}
          <Box s={[0.27, 0.2, 0.46]} r={0.02} m={M.teal} position={[0, 0.54, 0]} />
          <Box s={[0.23, 0.12, 0.38]} r={0.035} m={M.teal} position={[0, 0.7, 0]} />
          <Cyl r={0.018} l={0.06} m={M.steel} position={[0, 0.78, 0]} />
          {/* fuel injector line */}
          <Cyl r={0.008} l={0.2} m={M.steel} position={[0, 0.66, -side * 0.21]} rotation={[0, 0, 0]} />
          {/* exhaust stub to manifold */}
          <Cyl r={0.045} l={0.14} axis="z" m={M.cast} position={[0, 0.52, side * 0.27]} />
        </group>
      ))}
      {/* insulated exhaust manifold running to the turbos at the flywheel end */}
      <Cyl r={0.085} l={2.5} axis="x" m={M.silver} position={[-0.5, 0.52, side * 0.38]} />
      {CYL_X.map((x) => (
        <Cyl key={x} r={0.09} l={0.025} axis="x" m={M.steel} position={[x + 0.15, 0.52, side * 0.38]} />
      ))}
      {/* charge air manifold inside the vee */}
      <Cyl r={0.07} l={2.45} axis="x" m={M.tealDark} position={[-0.52, 0.35, -side * 0.3]} />
    </group>
  );
}

function Turbo({ position, side }: { position: [number, number, number]; side: 1 | -1 }) {
  return (
    <group position={position}>
      {/* turbine (hot) housing */}
      <mesh material={M.cast} rotation={[0, 0, 0]} castShadow>
        <torusGeometry args={[0.12, 0.07, 12, 24]} />
      </mesh>
      <Cyl r={0.09} l={0.14} axis="z" m={M.cast} />
      {/* compressor housing */}
      <group position={[0, 0, -side * 0.22]}>
        <mesh material={M.silver} castShadow>
          <torusGeometry args={[0.13, 0.065, 12, 24]} />
        </mesh>
        <Cyl r={0.1} l={0.12} axis="z" m={M.silver} />
      </group>
      <Cyl r={0.06} l={0.14} axis="z" m={M.steel} position={[0, 0, -side * 0.11]} />
    </group>
  );
}

function Engine() {
  return (
    <group>
      {/* sump */}
      <Box s={[2.5, 0.48, 0.95]} r={0.03} m={M.teal} position={[-0.56, 0.68, 0]} />
      {/* crankcase */}
      <Box s={[2.62, 0.55, 1.1]} r={0.03} m={M.teal} position={[-0.56, 1.17, 0]} />
      {/* engine feet onto anti-vibration mounts */}
      {[-1.5, 0.45].map((x) =>
        [-1, 1].map((s) => (
          <group key={`${x}${s}`}>
            <Box s={[0.22, 0.12, 0.32]} m={M.tealDark} position={[x, 0.98, s * 0.66]} />
            <Box s={[0.16, 0.52, 0.12]} m={M.tealDark} position={[x, 0.66, s * 0.78]} />
            <Cyl r={0.09} l={0.1} m={M.rubber} position={[x, 0.37, s * 0.78]} />
          </group>
        )),
      )}
      <Bank side={1} />
      <Bank side={-1} />

      {/* front gear case, damper, water pumps */}
      <Box s={[0.14, 1.05, 1.15]} r={0.03} m={M.teal} position={[-1.92, 1.25, 0]} />
      <Cyl r={0.27} l={0.12} axis="x" m={M.steel} position={[-2.05, CRANK_Y - 0.1, 0]} />
      <Cyl r={0.2} l={0.08} axis="x" m={M.cast} position={[-2.13, CRANK_Y - 0.1, 0]} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Cyl r={0.15} l={0.2} axis="x" m={M.teal} position={[-2.02, 1.5, s * 0.38]} />
          <Cyl r={0.1} l={0.08} axis="x" m={M.steel} position={[-2.14, 1.5, s * 0.38]} />
        </group>
      ))}
      {/* fan drive pulley and belts */}
      <Cyl r={0.2} l={0.14} axis="x" m={M.steel} position={[-2.08, 1.45, 0]} />
      {[-0.05, 0.05].map((dz) => (
        <group key={dz}>
          <Box s={[0.02, 0.56, 0.035]} m={M.rubber} position={[-2.1, 1.2, dz + 0.24]} rotation={[-0.12, 0, 0]} />
          <Box s={[0.02, 0.56, 0.035]} m={M.rubber} position={[-2.1, 1.2, dz - 0.24]} rotation={[0.12, 0, 0]} />
        </group>
      ))}
      {/* thermostat housing and coolant hoses to radiator */}
      <Box s={[0.3, 0.2, 0.6]} r={0.03} m={M.teal} position={[-1.85, 2.0, 0]} />
      <Pipe pts={[[-1.85, 2.08, 0.15], [-2.05, 2.18, 0.35], [-2.3, 2.3, 0.5]]} r={0.075} m={M.rubber} />
      <Pipe pts={[[-2.02, 1.5, -0.38], [-2.2, 0.75, -0.6], [-2.38, 0.6, -0.7]]} r={0.075} m={M.rubber} />

      {/* side equipment: fuel filters (+z) and oil filters / cooler (−z) */}
      {[0, 1, 2].map((i) => (
        <group key={i} position={[-0.9 + i * 0.16, 0.95, 0.66]}>
          <Cyl r={0.065} l={0.3} m={M.white} />
          <Cyl r={0.07} l={0.04} m={M.steel} position={[0, 0.17, 0]} />
        </group>
      ))}
      <Box s={[0.5, 0.18, 0.1]} m={M.tealDark} position={[-0.74, 1.15, 0.62]} />
      {[0, 1, 2, 3].map((i) => (
        <Cyl key={i} r={0.075} l={0.32} m={M.white} position={[-1.15 + i * 0.18, 0.95, -0.66]} />
      ))}
      <Cyl r={0.12} l={1.0} axis="x" m={M.tealDark} position={[-0.2, 1.05, -0.66]} />
      {/* ECM box */}
      <Box s={[0.36, 0.26, 0.08]} r={0.02} m={M.black} position={[0.2, 1.15, 0.64]} />

      {/* flywheel housing and starters */}
      <Cyl r={0.74} r2={0.62} l={0.24} axis="x" m={M.teal} position={[0.86, CRANK_Y, 0]} />
      {[-1, 1].map((s) => (
        <group key={s} position={[0.82, 0.62, s * 0.5]}>
          <Cyl r={0.11} l={0.42} axis="x" m={M.black} />
          <Cyl r={0.06} l={0.1} axis="y" m={M.black} position={[0.05, 0.13, 0]} />
        </group>
      ))}

      {/* turbos, exhaust collector, air cleaners */}
      <Turbo position={[0.55, 2.12, 0.42]} side={1} />
      <Turbo position={[0.92, 2.12, 0.42]} side={1} />
      <Turbo position={[0.55, 2.12, -0.42]} side={-1} />
      <Turbo position={[0.92, 2.12, -0.42]} side={-1} />
      {[-1, 1].map((s) => (
        <Pipe key={s} pts={[[0.6, 1.95, s * 0.75], [0.74, 2.05, s * 0.72], [0.74, 2.2, s * 0.55]]} r={0.08} m={M.silver} />
      ))}
      <Cyl r={0.16} l={1.0} axis="z" m={M.silver} position={[0.74, 2.3, 0]} />
      <Cyl r={0.17} l={0.18} m={M.steel} position={[0.74, 2.42, 0]} />
      {/* exhaust bellows and outlet flange */}
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} material={M.steel} position={[0.74, 2.42 + i * 0.025, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.165, 0.012, 6, 32]} />
        </mesh>
      ))}
      <Cyl r={0.24} l={0.03} m={M.steel} position={[0.74, 2.56, 0]} />
      <BoltRing r={0.2} n={10} m={M.cast} position={[0.74, 2.58, 0]} rotation={[0, 0, Math.PI / 2]} />

      {/* charge air coolers sit in the vee */}
      <Box s={[1.6, 0.26, 0.36]} r={0.03} m={M.tealDark} position={[-0.7, 1.92, 0]} />
    </group>
  );
}

function AirCleaners() {
  return (
    <group>
      <Box s={[0.9, 0.06, 1.5]} m={M.black} position={[1.5, 2.06, 0]} />
      {[-0.6, -0.2, 0.2, 0.6].map((z, i) => (
        <group key={z}>
          <Cyl r={0.17} l={0.7} axis="x" m={M.black} position={[1.6, 2.27, z]} />
          <Cyl r={0.18} l={0.04} axis="x" m={M.steel} position={[1.96, 2.27, z]} />
          <Pipe
            pts={[
              [1.25, 2.27, z],
              [1.1, 2.24, z * 0.9],
              [i < 2 ? 0.92 - (i % 2) * 0.37 : 0.92 - (i % 2) * 0.37, 2.12, z < 0 ? -0.64 : 0.64],
            ]}
            r={0.07}
            m={M.rubber}
          />
        </group>
      ))}
    </group>
  );
}

// ---------- alternator ----------

function Alternator() {
  const grille = useCanvasTexture(256, 256, (g) => {
    g.fillStyle = '#2a2e32';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#0a0b0c';
    for (let y = 8; y < 248; y += 10) g.fillRect(20, y, 216, 5);
  });
  const grilleMat = useRef(new THREE.MeshStandardMaterial({ map: grille, metalness: 0.4, roughness: 0.6 })).current;
  return (
    <group>
      {/* drive-end adaptor with air outlet louvres */}
      <Cyl r={0.8} l={0.16} axis="x" m={M.alt} position={[1.07, CRANK_Y, 0]} />
      {[-1, 1].map((s) => (
        <mesh key={s} material={grilleMat} position={[1.07, CRANK_Y, s * 0.805]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
          <planeGeometry args={[0.14, 0.9]} />
        </mesh>
      ))}
      {/* main frame */}
      <Cyl r={0.72} l={1.05} axis="x" seg={40} m={M.alt} position={[1.68, CRANK_Y, 0]} />
      {[1.25, 1.68, 2.1].map((x) => (
        <Cyl key={x} r={0.735} l={0.05} axis="x" seg={40} m={M.alt} position={[x, CRANK_Y, 0]} />
      ))}
      {/* feet and support webs */}
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
      {/* terminal box with AVR */}
      <Box s={[0.78, 0.55, 0.85]} r={0.02} m={M.alt} position={[1.62, 1.98, 0]} />
      <Box s={[0.7, 0.04, 0.78]} m={M.black} position={[1.62, 2.27, 0]} />
      {[0, 1, 2, 3].map((i) => (
        <Cyl key={i} r={0.03} l={0.03} axis="z" m={M.rubber} position={[1.38 + i * 0.12, 1.85, 0.44]} />
      ))}
      {/* non-drive end bracket with exciter / PMG cover */}
      <Cyl r={0.66} l={0.12} axis="x" seg={40} m={M.alt} position={[2.24, CRANK_Y, 0]} />
      <mesh material={grilleMat} position={[2.305, CRANK_Y, 0]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.5, 40]} />
      </mesh>
      <Cyl r={0.3} l={0.16} axis="x" m={M.alt} position={[2.38, CRANK_Y, 0]} />
      <BoltRing r={0.6} n={16} m={M.steel} position={[2.305, CRANK_Y, 0]} />
      {/* output cables to the breaker */}
      <Pipe pts={[[1.9, 2.0, 0.42], [2.2, 1.95, 0.55], [2.55, 1.5, 0.6]]} r={0.04} m={M.rubber} />
      <Pipe pts={[[1.95, 1.9, 0.42], [2.25, 1.85, 0.5], [2.6, 1.4, 0.55]]} r={0.04} m={M.rubber} />
    </group>
  );
}

// ---------- assembly ----------

/** Engine shake: idle hum while running, a jolt when it fires and a wobble through resonance on run-down. */
function Shaker({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const r = sim.rpm;
    let a = 0;
    if (sim.starter) a = 0.004;
    else if (r > 0) a = 0.0012 + (r > 150 && r < 700 ? 0.004 : 0) + (sim.genKw / 1800) * 0.0008;
    const g = ref.current!;
    g.position.y = Math.sin(t * 97) * a;
    g.position.z = Math.sin(t * 71 + 1) * a * 0.7;
    g.rotation.x = Math.sin(t * 53) * a * 0.15;
  });
  return <group ref={ref}>{children}</group>;
}

export function Genset() {
  return (
    <group>
      <BaseFrame />
      <Shaker>
        <Movable offset={[-1.3, 0, 0]} name="radiator">
          <Radiator />
        </Movable>
        <Movable offset={[0, 0, 0]} name="engine">
          <Engine />
        </Movable>
        <Movable offset={[0.4, 1.1, 0]} name="aircleaner">
          <AirCleaners />
        </Movable>
        <Movable offset={[1.4, 0, 0]} name="alternator">
          <Alternator />
        </Movable>
      </Shaker>
      <Movable offset={[0.9, 0.3, 1.2]} name="panel">
        <ControlPanel />
      </Movable>
    </group>
  );
}
