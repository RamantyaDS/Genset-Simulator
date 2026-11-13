// The power plant and the palm oil complex it feeds:
// - engine hall with five sets in a row, radiator louvres in the back wall, stacks and silencers through the roof,
//   a gantry crane, and a glass control room at the end
// - yard with step-up transformers, the 20 kV switchgear, bulk fuel tanks and the tanker when it is called
// - the complex: palm oil mill with its boiler stack and sterilisers, kernel plant, housing with school, mosque and
//   clinic, office/workshop, water tower; windows and street lights follow their feeder and the time of day
import { CameraControls, Line, Text } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FocusHighlight } from '../scene/FocusHighlight';
import { HeatHaze, type HazeSources } from '../scene/HeatHaze';
import { Box, Cyl, M } from '../scene/parts';
import { useUI } from '../store';
import { busLive, PRIME_KW } from '../sim/plant';
import { playPlantEvent, soundSource, updateSound } from '../sound';
import { ControlPanels } from './ControlPanels';
import { Arcs, Lightning, PlantSmoke, Rain } from './Fx';
import { GensetUnit, unitState } from './GensetUnit';
import { cams, goPlant, unitWorld } from './camera';
import { advancePlant, HALL, onPlantEvent, plant, usePlant, UNIT_X } from './store';

// Each set sits at z −4 turned so its radiator faces the back wall; its exhaust outlet ends up at z ≈ −3.3.
const STACK_Z = -3.26;



/** Shimmer above the selected set's stack outlet and behind its radiator. */
function UnitHaze() {
  const selected = usePlant((s) => s.selected);
  const haze: HazeSources = {
    exhaust: { from: [UNIT_X[selected], HALL.h + 4.2, STACK_Z], to: [UNIT_X[selected] + 0.9, HALL.h + 7.4, STACK_Z], width: 0.45 },
    radiator: { from: unitWorld(selected, [-2.9, 1.4, 0]), to: unitWorld(selected, [-4.1, 2.3, 0]), width: 0.95 },
  };
  return <HeatHaze sources={haze} source={() => unitState[selected]} />;
}

/** 0 at night, 1 at noon: drives the sun, sky and whether windows/street lights matter. */
// The scene stays at night so the hall, the windows and the street lights read clearly; the clock and the load
// profile still run through the whole day.
const daylight = () => 0;

function Driver() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    soundSource.override = () => {
      const on = plant.units.filter((u) => u.rpm > 100);
      const rpm = on.length ? on.reduce((a, u) => a + u.rpm, 0) / on.length : 0;
      return {
        rpm,
        firing: plant.units.some((u) => u.phase === 'running' || u.phase === 'cooling'),
        starter: plant.units.some((u) => u.phase === 'crank'),
        coolant: on.length ? on.reduce((a, u) => a + u.coolant, 0) / on.length : 40,
        lf: on.length ? on.reduce((a, u) => a + u.kw, 0) / on.length / PRIME_KW : 0,
        count: on.length,
        alarm: plant.units.some((u) => !!u.alarm),
      };
    };
    const off = onPlantEvent(playPlantEvent);
    const id = setInterval(() => usePlant.getState().bump(), 150);
    return () => {
      soundSource.override = null;
      off();
      clearInterval(id);
    };
  }, []);
  useFrame((_, dt) => {
    advancePlant(dt);
    updateSound(Math.max(4, camera.position.distanceTo(new THREE.Vector3(0, 2, 0)) * 0.35), false);
  });
  return null;
}

function DayNight() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const scene = useThree((s) => s.scene);
  const bg = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const d = daylight();
    // moonlight: a faint cool key light from high up
    sun.current!.position.set(-60, 90, 50);
    sun.current!.intensity = 0.35;
    hemi.current!.intensity = 0.2;
    bg.set('#0b1220').lerp(new THREE.Color('#bcd4e6'), d);
    (scene.fog as THREE.Fog).color.copy(bg);
    scene.background = bg;
  });
  return (
    <>
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-far={300}
        color="#9fb4e0"
      />
      <hemisphereLight ref={hemi} args={['#d6e6ff', '#3d4a2a', 0.8]} />
    </>
  );
}

// ---------- engine hall ----------

/** Hall lighting from the station supply; when the bus is dead only the battery emergency fittings stay on and amber
 *  beacons turn at the ends of the hall. */
function HallLights({ h }: { h: number }) {
  const a = useRef<THREE.PointLight>(null);
  const b = useRef<THREE.PointLight>(null);
  const beacons = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const live = busLive(plant);
    for (const l of [a.current!, b.current!]) {
      l.intensity = live ? 60 : 9;
      l.color.set(live ? '#fff4e0' : '#ffcf8a');
    }
    const g = beacons.current!;
    g.visible = !live;
    // rotating-beacon look: each lamp sweeps on and off
    g.children.forEach((c, i) =>
      c.traverse((o) => {
        const k = Math.max(0, Math.sin(clock.elapsedTime * 7 + i * 2));
        if ((o as THREE.SpotLight).isSpotLight) (o as THREE.SpotLight).intensity = 90 * k;
        if ((o as THREE.Mesh).isMesh) ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + 2.5 * k;
      }),
    );
  });
  return (
    <>
      <pointLight ref={a} position={[-12, 7, 3]} intensity={60} distance={30} color="#fff4e0" />
      <pointLight ref={b} position={[12, 7, 3]} intensity={60} distance={30} color="#fff4e0" />
      <group ref={beacons} visible={false}>
        {[-25, 25].map((x) => (
          <group key={x} position={[x, h - 1.8, 8.4]}>
            <mesh>
              <cylinderGeometry args={[0.18, 0.2, 0.3, 16]} />
              <meshStandardMaterial color="#ffae00" emissive="#ff9a00" emissiveIntensity={2.5} transparent opacity={0.85} />
            </mesh>
            <spotLight position={[0, 0, 0]} target-position={[x + 6, h - 3, 8.4]} angle={0.35} penumbra={0.4} intensity={80} distance={25} color="#ff9a00" />
          </group>
        ))}
      </group>
    </>
  );
}

function Hall() {
  const { x0, x1, z0, z1, h } = HALL;
  const louvre = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#5e646a';
    g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) {
      g.fillStyle = '#25292d';
      g.fillRect(0, y, 64, 4);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 4);
    return new THREE.MeshStandardMaterial({ map: t, metalness: 0.4, roughness: 0.6 });
  }, []);
  const wall = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.9 }), []);
  const roof = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9fb0bd', metalness: 0.3, roughness: 0.5, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }), []);
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#a8c4d4', metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }), []);
  const L = x1 - x0;
  const W = z1 - z0;
  return (
    <group>
      {/* floor with painted walkways and cable trench covers */}
      <Box s={[L, 0.2, W]} m={M.base} position={[0, -0.1, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 5.6]}>
        <planeGeometry args={[L - 2, 1.4]} />
        <meshStandardMaterial color="#d8b11e" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 4.2]}>
        <planeGeometry args={[L - 2, 0.5]} />
        <meshStandardMaterial color="#5a5f63" roughness={0.9} />
      </mesh>
      {/* back wall: louvres behind each radiator */}
      <Box s={[L, h, 0.3]} m={wall} position={[0, h / 2, z0]} />
      {UNIT_X.map((x) => (
        <mesh key={x} material={louvre} position={[x, 2.2, z0 + 0.16]}>
          <planeGeometry args={[3, 3.4]} />
        </mesh>
      ))}
      {/* end walls, low front wall with glazing above */}
      <Box s={[0.3, h, W]} m={wall} position={[x0, h / 2, 0]} />
      <Box s={[L, 1.2, 0.3]} m={wall} position={[0, 0.6, z1]} />
      <mesh material={glass} position={[0, 1.2 + (h - 1.2) / 2, z1]}>
        <planeGeometry args={[L, h - 1.2]} />
      </mesh>
      {/* steel columns and roof trusses, translucent roof sheets */}
      {Array.from({ length: 7 }, (_, i) => x0 + (i * L) / 6).map((x) =>
        [z0, z1].map((z) => <Box key={`${x}${z}`} s={[0.35, h, 0.35]} m={M.blue} position={[x, h / 2, z]} />),
      )}
      {Array.from({ length: 7 }, (_, i) => x0 + (i * L) / 6).map((x) => (
        <group key={x}>
          <Box s={[0.25, 0.35, W]} m={M.blue} position={[x, h, 0]} />
          <Box s={[0.18, 1.2, 0.18]} m={M.blue} position={[x, h + 0.6, 0]} />
        </group>
      ))}
      <mesh material={roof} position={[0, h + 0.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[L, W]} />
      </mesh>
      {/* gantry crane over the row of sets */}
      {[-1.2, 1.2].map((z) => (
        <Box key={z} s={[L - 1, 0.4, 0.3]} m={M.yellow} position={[0, h - 1.2, z]} />
      ))}
      <Box s={[1.2, 0.6, 2.8]} m={M.yellow} position={[-8, h - 1.6, 0]} />
      <Cyl r={0.02} l={3} m={M.steel} position={[-8, h - 3.3, 0]} />
      {/* ceiling lights (on day and night) */}
      {Array.from({ length: 6 }, (_, i) => -22.5 + i * 9).map((x) => (
        <Box key={x} s={[1.6, 0.08, 0.4]} m={M.white} position={[x, h - 0.3, 3]} />
      ))}
      <HallLights h={h} />
      <Text position={[0, h - 1.2, z1 + 0.2]} fontSize={0.9} color="#1d3a5c">
        PLTD KAWASAN SAWIT · 5 × 2250 kVA
      </Text>
    </group>
  );
}

/** Stacks through the roof with silencers; exhaust smoke from each running set. */
/** Exhaust stacks: riser through the roof, horizontal silencer, outlet. The smoke itself is in Fx. */
function Stacks() {
  return (
    <group>
      {UNIT_X.map((x) => (
        <group key={x} position={[x, 0, STACK_Z]}>
          <Cyl r={0.2} l={HALL.h - 2.4} m={M.silver} position={[0, 2.6 + (HALL.h - 2.4) / 2, 0]} />
          <Cyl r={0.55} l={3.2} axis="z" m={M.silver} position={[0, HALL.h + 1.6, -0.6]} />
          <Cyl r={0.2} l={2.6} m={M.silver} position={[0, HALL.h + 2.9, 0]} />
          <Cyl r={0.24} l={0.12} m={M.cast} position={[0, HALL.h + 4.15, 0]} />
        </group>
      ))}
    </group>
  );
}

function ControlRoom() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    return { c, t: new THREE.CanvasTexture(c) };
  }, []);
  const last = useRef(0);
  const light = useRef<THREE.PointLight>(null);
  const screen = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    // Room lighting from the station supply; on the UPS only the emergency fittings stay on.
    const ups = plant.ups[0];
    const powered = busLive(plant) || ups.charge > 0;
    light.current!.intensity = busLive(plant) ? 20 : powered ? 7 : 0;
    light.current!.color.set(busLive(plant) ? '#eef4ff' : '#ffd9a0');
    screen.current!.color.set(powered ? '#ffffff' : '#050505');
    if (clock.elapsedTime - last.current < 0.3) return;
    last.current = clock.elapsedTime;
    // SCADA wall screen: single line diagram with live states
    const g = tex.c.getContext('2d')!;
    g.fillStyle = '#0b1622';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = busLive(plant) ? '#39d353' : '#555';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(30, 120);
    g.lineTo(482, 120);
    g.stroke();
    plant.units.forEach((u, i) => {
      const x = 60 + i * 95;
      g.strokeStyle = u.breaker ? '#39d353' : '#555';
      g.beginPath();
      g.moveTo(x, 120);
      g.lineTo(x, 190);
      g.stroke();
      g.fillStyle = u.alarm ? '#ff3b30' : u.rpm > 0 ? '#ffb020' : '#333';
      g.beginPath();
      g.arc(x, 205, 16, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e6eef4';
      g.font = '14px sans-serif';
      g.fillText(`G${i + 1} ${Math.round(u.kw)} kW`, x - 32, 240);
    });
    plant.feeders.forEach((f, i) => {
      const x = 60 + i * 95;
      g.strokeStyle = f.on && busLive(plant) ? '#ffd23a' : '#555';
      g.beginPath();
      g.moveTo(x, 120);
      g.lineTo(x, 50);
      g.stroke();
      g.fillStyle = '#e6eef4';
      g.fillText(f.short, x - 25, 40);
    });
    g.fillStyle = '#7fd34a';
    g.font = 'bold 18px sans-serif';
    g.fillText(`${plant.busHz.toFixed(2)} Hz  ${Math.round(plant.busV)} V`, 330, 110);
    tex.t.needsUpdate = true;
  });
  return (
    <group position={[32, 0, 0]}>
      <Box s={[9, 0.2, 12]} m={M.base} position={[0, -0.1, 0]} />
      <Box s={[9, 4, 0.2]} m={M.white} position={[0, 2, -6]} />
      <Box s={[9, 4, 0.2]} m={M.white} position={[0, 2, 6]} />
      <Box s={[0.2, 4, 12]} m={M.white} position={[4.5, 2, 0]} />
      <Box s={[9.4, 0.25, 12.4]} m={M.white} position={[0, 4.1, 0]} />
      <mesh position={[-4.5, 2.3, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[12, 3.2]} />
        <meshStandardMaterial color="#a8c4d4" metalness={0.9} roughness={0.05} transparent opacity={0.2} depthWrite={false} />
      </mesh>
      {/* switchboard: five set panels and the bus/feeder panel, all clickable */}
      <ControlPanels />
      {/* SCADA wall screen on the back wall, kept alive by the UPS when the bus is down */}
      <mesh position={[-0.6, 2.75, -5.88]}>
        <planeGeometry args={[4.4, 2.2]} />
        <meshBasicMaterial ref={screen} map={tex.t} toneMapped={false} />
      </mesh>
      {/* operator desk facing the SCADA screen, out of the way of the switchboard */}
      <Box s={[3, 0.8, 1.2]} m={M.alt} position={[-0.6, 0.4, -4.2]} />
      <Box s={[0.6, 0.4, 0.05]} m={M.black} position={[-1.2, 1.05, -4.5]} />
      <Box s={[0.6, 0.4, 0.05]} m={M.black} position={[0, 1.05, -4.5]} />
      <pointLight ref={light} position={[0, 3.5, 0]} intensity={20} distance={12} color="#eef4ff" />
      <Text position={[0, 4.5, 6.25]} fontSize={0.45} color="#1d3a5c">
        RUANG KONTROL
      </Text>
    </group>
  );
}

// ---------- yard ----------

function Yard() {
  const truck = useRef<THREE.Group>(null);
  useFrame(() => {
    truck.current!.visible = plant.truckEta >= 0;
  });
  return (
    <group>
      {/* step-up transformers 0.4/20 kV with fins and bushings */}
      {[-6, 6].map((x) => (
        <group key={x} position={[x, 0, 17]}>
          <Box s={[3, 0.3, 2.4]} m={M.base} position={[0, 0.15, 0]} />
          <Box s={[2.4, 2.6, 1.8]} m={M.greyLight} position={[0, 1.6, 0]} />
          {Array.from({ length: 8 }, (_, i) => (
            <Box key={i} s={[0.05, 2.2, 0.5]} m={M.greyLight} position={[-1.05 + i * 0.3, 1.5, 1.1]} />
          ))}
          {[-0.6, 0, 0.6].map((dx) => (
            <Cyl key={dx} r={0.08} l={0.7} m={M.white} position={[dx, 3.2, -0.3]} />
          ))}
        </group>
      ))}
      <Text position={[0, 4.4, 17]} fontSize={0.6} color="#2b2b2b">
        TRAFO STEP-UP 0,4 / 20 kV
      </Text>
      {/* 20 kV switchgear house */}
      <group position={[20, 0, 17]}>
        <Box s={[8, 3.6, 4]} m={M.white} position={[0, 1.8, 0]} />
        <Box s={[8.4, 0.3, 4.4]} m={M.greyLight} position={[0, 3.75, 0]} />
        <Text position={[0, 2.6, 2.05]} fontSize={0.45} color="#2b2b2b">
          KUBIKEL 20 kV
        </Text>
      </group>
      {/* bulk fuel tanks with bund wall, day tank, unloading point */}
      {[-6, 8].map((z) => (
        <group key={z} position={[-42, 0, z]}>
          <Cyl r={4.5} l={8} seg={32} m={M.white} position={[0, 4, 0]} />
          <Cyl r={4.6} l={0.3} seg={32} m={M.greyLight} position={[0, 8.1, 0]} />
          <Text position={[0, 5, 4.55]} fontSize={0.6} color="#c3141c">
            SOLAR
          </Text>
        </group>
      ))}
      <Box s={[14, 0.8, 26]} m={M.base} position={[-42, 0.4, 1]} visible={false} />
      <Cyl r={1} l={3} axis="x" m={M.white} position={[-31, 1.6, -6]} />
      <group ref={truck} position={[-33, 0, 16]} visible={false}>
        <Box s={[2.4, 2.4, 2.2]} r={0.1} m={M.red} position={[0, 1.5, 3.2]} />
        <Cyl r={1.1} l={6} axis="z" m={M.chrome} position={[0, 1.9, -1]} />
        {[-2.8, -0.8, 1.2, 3.2].map((z) => [-1, 1].map((s) => <Cyl key={`${z}${s}`} r={0.5} l={0.3} axis="x" m={M.rubber} position={[s * 1.05, 0.5, z]} />))}
      </group>
    </group>
  );
}

// ---------- the complex ----------

function useLitMaterial(feeder: number, nightOnly: boolean, color = '#ffd59a') {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color: '#141a20', emissive: color, emissiveIntensity: 0, roughness: 0.3 }), [color]);
  useFrame(() => {
    const live = busLive(plant) && plant.feeders[feeder].on;
    const want = live ? (nightOnly ? 1.4 * (1 - daylight()) + 0.15 : 1.1) : 0;
    m.emissiveIntensity += (want - m.emissiveIntensity) * 0.2;
  });
  return m;
}

function Building({ pos, size, color, win, rows = 2 }: { pos: [number, number, number]; size: [number, number, number]; color: string; win: THREE.Material; rows?: number }) {
  const [w, h, d] = size;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }), [color]);
  const cols = Math.max(2, Math.floor(w / 3));
  return (
    <group position={pos}>
      <Box s={size} m={mat} position={[0, h / 2, 0]} />
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (
          <mesh key={`${r}${c}`} material={win} position={[-w / 2 + (c + 0.5) * (w / cols), (h / (rows + 1)) * (r + 1), d / 2 + 0.02]}>
            <planeGeometry args={[Math.min(1.4, (w / cols) * 0.5), 0.9]} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Complex() {
  const pks = useLitMaterial(0, false);
  const kernel = useLitMaterial(1, false);
  const homes = useLitMaterial(2, true);
  const office = useLitMaterial(3, false, '#e8f1ff');
  const clinic = useLitMaterial(4, true, '#e8f1ff');
  const street = useLitMaterial(2, true, '#ffcf7a');
  const houses = useMemo(() => {
    const out: [number, number][] = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) out.push([-80 + c * 9, 160 + r * 14]);
    return out;
  }, []);
  return (
    <group>
      {/* palm oil mill: processing hall, sterilisers, boiler house and stack, FFB loading ramp */}
      <Building pos={[15, 0, 165]} size={[40, 14, 22]} color="#7f97a8" win={pks} rows={3} />
      <Box s={[42, 0.6, 24]} m={M.greyLight} position={[15, 14.3, 165]} />
      {[0, 1, 2].map((i) => (
        <Cyl key={i} r={1.4} l={24} axis="x" seg={20} m={M.steel} position={[15, 1.6, 150 - i * 3.4]} />
      ))}
      <Box s={[10, 10, 10]} m={M.greyLight} position={[42, 5, 162]} />
      <Cyl r={1.2} r2={0.9} l={34} m={M.white} position={[44, 17, 158]} />
      <Box s={[14, 3, 8]} m={M.greyLight} position={[-12, 1.5, 175]} rotation={[0.08, 0, 0]} />
      <Text position={[15, 16, 176.5]} fontSize={2} color="#ffffff">
        PABRIK KELAPA SAWIT
      </Text>
      {/* kernel crushing plant */}
      <Building pos={[62, 0, 168]} size={[20, 10, 16]} color="#8e9a7a" win={kernel} />
      <Text position={[62, 11, 176.5]} fontSize={1.2} color="#ffffff">
        KERNEL CRUSHING PLANT
      </Text>
      <Refinery />
      <Bulking />
      {/* housing, school, mosque, clinic */}
      {houses.map(([x, z]) => (
        <group key={`${x}${z}`}>
          <Building pos={[x, 0, z]} size={[6, 3, 5]} color="#e3d7c3" win={homes} rows={1} />
          <mesh position={[x, 3.9, z]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[4.6, 1.8, 4]} />
            <meshStandardMaterial color="#9b3b2c" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <Building pos={[-20, 0, 160]} size={[18, 6, 8]} color="#f0e6c8" win={homes} />
      <Text position={[-20, 7, 164.2]} fontSize={1} color="#3a3a3a">
        SEKOLAH
      </Text>
      <group position={[-22, 0, 200]}>
        <Box s={[10, 5, 10]} m={M.white} position={[0, 2.5, 0]} />
        <mesh position={[0, 6.5, 0]}>
          <sphereGeometry args={[3.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#2f8a5a" metalness={0.3} roughness={0.4} />
        </mesh>
        <Cyl r={0.5} l={14} m={M.white} position={[6, 7, 6]} />
      </group>
      <Building pos={[-40, 0, 228]} size={[14, 5, 8]} color="#f4f4f4" win={clinic} />
      <Text position={[-40, 6, 232.2]} fontSize={1} color="#c3141c">
        KLINIK
      </Text>
      {/* offices and workshop near the plant road; water tower */}
      <Building pos={[45, 0, 60]} size={[20, 7, 10]} color="#cfd8de" win={office} />
      <Text position={[45, 8, 65.2]} fontSize={1.1} color="#2b2b2b">
        KANTOR & BENGKEL
      </Text>
      <group position={[-55, 0, 120]}>
        {[-1, 1].map((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} s={[0.3, 14, 0.3]} m={M.steel} position={[sx * 2, 7, sz * 2]} />))}
        <Cyl r={3} l={4} m={M.blue} position={[0, 16, 0]} />
        <mesh material={clinic} position={[0, 16, 3.05]}>
          <planeGeometry args={[2, 0.5]} />
        </mesh>
      </group>
      {/* street lights along the main road */}
      {Array.from({ length: 12 }, (_, i) => 30 + i * 18).map((z) => (
        <group key={z} position={[-6, 0, z]}>
          <Cyl r={0.08} l={6} m={M.cast} position={[0, 3, 0]} />
          <mesh material={street} position={[0.5, 6, 0]}>
            <boxGeometry args={[1, 0.15, 0.3]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Cooking-oil refinery: process building with its tall bleaching/deodorising columns, a packing hall and a stack. */
function Refinery() {
  const win = useLitMaterial(5, false);
  return (
    <group position={[88, 0, 122]}>
      <Building pos={[0, 0, 0]} size={[26, 12, 16]} color="#a7b3bd" win={win} rows={3} />
      {[-8, -3, 2].map((x, i) => (
        <group key={x}>
          <Cyl r={1.6} l={22 + i * 3} m={M.steel} position={[x, (22 + i * 3) / 2, -11]} />
          <Cyl r={1.7} l={0.4} m={M.cast} position={[x, 22 + i * 3, -11]} />
        </group>
      ))}
      {/* pipe rack between columns and building */}
      <Box s={[20, 0.4, 0.4]} m={M.steel} position={[-2, 9, -8.5]} />
      <Box s={[20, 0.4, 0.4]} m={M.steel} position={[-2, 10, -8.5]} />
      <Cyl r={0.8} l={26} m={M.white} position={[11, 13, -6]} />
      <Building pos={[0, 0, 15]} size={[22, 7, 12]} color="#c9cfd4" win={win} rows={1} />
      <Text position={[0, 13.5, 8.1]} fontSize={1.4} color="#ffffff">
        REFINERY MINYAK GORENG
      </Text>
    </group>
  );
}

/** Bulking station by the river: CPO storage tanks with heating, a control room, the jetty, and a tanker when one is
 *  loading (from `shipMin`). */
function Bulking() {
  const win = useLitMaterial(6, false);
  const ship = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ship.current!;
    g.visible = plant.shipMin > 0;
    g.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.12;
  });
  return (
    <group>
      {/* river */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[178, 0.03, 190]}>
        <planeGeometry args={[44, 200]} />
        <meshStandardMaterial color="#1f4d63" roughness={0.25} metalness={0.2} />
      </mesh>
      {[0, 1].map((r) =>
        [0, 1].map((c) => (
          <group key={`${r}${c}`} position={[118 + c * 18, 0, 180 + r * 18]}>
            <Cyl r={7} l={13} seg={32} m={M.white} position={[0, 6.5, 0]} />
            <Cyl r={7.1} r2={1} l={1.6} seg={32} m={M.greyLight} position={[0, 13.8, 0]} />
          </group>
        )),
      )}
      <Building pos={[112, 0, 158]} size={[10, 4, 7]} color="#d6d0c4" win={win} rows={1} />
      <Text position={[127, 16, 171]} fontSize={1.3} color="#ffffff">
        BULKING STATION CPO
      </Text>
      {/* jetty and pipe to it */}
      <Box s={[14, 0.8, 6]} m={M.cast} position={[158, 1, 190]} />
      <Box s={[20, 0.5, 0.5]} m={M.steel} position={[149, 1.8, 189]} />
      <Cyl r={0.3} l={6} m={M.steel} position={[164, 4, 190]} />
      <group ref={ship} visible={false}>
        <group position={[172, 0, 190]}>
          <Box s={[10, 4, 52]} m={M.red} position={[0, 1.2, 0]} />
          <Box s={[10.2, 1.2, 52.2]} m={M.black} position={[0, -0.4, 0]} />
          <Box s={[8, 6, 7]} m={M.white} position={[0, 6, -20]} />
          <Cyl r={0.7} l={4} m={M.black} position={[0, 11, -21]} />
          {[-10, 0, 10].map((z) => (
            <Box key={z} s={[6, 0.6, 6]} m={M.greyLight} position={[0, 3.5, z]} />
          ))}
        </group>
      </group>
    </group>
  );
}

/** Grass and laterite roads; in rain they darken and turn glossy so the lights reflect in them. */
function Grounds() {
  const grass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4f6f34', roughness: 1 }), []);
  const road = useMemo(() => new THREE.MeshStandardMaterial({ color: '#a36a45', roughness: 1 }), []);
  const wet = useRef(0);
  useFrame((_, dt) => {
    wet.current += ((plant.weather === 'cerah' ? 0 : 1) - wet.current) * Math.min(1, dt * 0.2);
    const w = wet.current;
    grass.roughness = 1 - 0.45 * w;
    grass.color.set('#4f6f34').multiplyScalar(1 - 0.35 * w);
    road.roughness = 1 - 0.75 * w;
    road.metalness = 0.15 * w;
    road.color.set('#a36a45').multiplyScalar(1 - 0.45 * w);
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 100]} receiveShadow material={grass}>
        <planeGeometry args={[400, 400]} />
      </mesh>
      {/* laterite roads: plant yard, main road north to the complex */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0, 14]} material={road}>
        <planeGeometry args={[110, 14]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-10, 0.01, 120]} material={road}>
        <planeGeometry args={[8, 220]} />
      </mesh>
      {/* palm rows on the horizon */}
      {Array.from({ length: 40 }, (_, i) => (
        <group key={i} position={[-150 + (i % 20) * 16, 0, i < 20 ? -40 : 280]}>
          <Cyl r={0.4} l={6} m={M.cast} position={[0, 3, 0]} />
          <mesh position={[0, 6.5, 0]}>
            <sphereGeometry args={[3, 8, 6]} />
            <meshStandardMaterial color="#3d6b2a" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** 20 kV line from the switchgear to the complex, with energy flowing when the bus is live. */
function Line20kV() {
  const pts = useMemo(() => {
    const out: [number, number, number][] = [[20, 4, 19]];
    for (let z = 30; z <= 150; z += 30) out.push([-4, 9, z]);
    out.push([10, 9, 150]);
    return out;
  }, []);
  const flow = useRef<any>(null);
  useFrame((_, dt) => {
    const l = flow.current;
    if (!l) return;
    l.material.dashOffset -= dt * 4;
    l.visible = busLive(plant);
  });
  return (
    <group>
      {pts.slice(1, -1).map(([x, , z]) => (
        <group key={z} position={[x, 0, z]}>
          <Cyl r={0.15} r2={0.1} l={10} m={M.base} position={[0, 5, 0]} />
          <Box s={[2, 0.12, 0.12]} m={M.base} position={[0, 9, 0]} />
        </group>
      ))}
      <Line points={pts} color="#222" lineWidth={1.5} />
      <Line ref={flow} points={pts} color="#ffd23a" lineWidth={3} dashed dashSize={2} gapSize={2} toneMapped={false} />
    </group>
  );
}

function Intro() {
  useEffect(() => {
    const id = setTimeout(() => goPlant('hall'), 100);
    return () => clearTimeout(id);
  }, []);
  return null;
}

export function PlantScene() {
  return (
    <Canvas shadows dpr={[1, 1.75]} onPointerMissed={() => useUI.getState().set({ focus: null })} camera={{ position: [40, 40, 70], fov: 45, near: 0.5, far: 900 }}>
      <fog attach="fog" args={['#bcd4e6', 120, 420]} />
      <DayNight />
      <Grounds />
      <Hall />
      {UNIT_X.map((x, i) => (
        <group key={x} position={[x, 0, -4]} rotation={[0, -Math.PI / 2, 0]}>
          <GensetUnit index={i} />
          <Text position={[0, 3.6, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.7} color="#1d3a5c">
            {`G${i + 1}`}
          </Text>
        </group>
      ))}
      <FocusHighlight />
      <PlantSmoke />
      <Rain />
      <Lightning />
      <Arcs />
      <Stacks />
      <ControlRoom />
      <Yard />
      <Line20kV />
      <Complex />
      <CameraControls ref={(c) => (cams.current = c)} makeDefault minDistance={3} maxDistance={260} maxPolarAngle={Math.PI * 0.48} smoothTime={0.7} />
      <Intro />
      <Driver />
      <EffectComposer>
        <UnitHaze />
        <Bloom mipmapBlur luminanceThreshold={1} intensity={0.9} />
      </EffectComposer>
    </Canvas>
  );
}
