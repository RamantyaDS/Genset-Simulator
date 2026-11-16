// The surroundings that make the story readable: the building the genset backs up, the PLN pole, the ATS cabinet and the cables.
import { Line, Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { criticalPowered, normalPowered } from '../sim/genset';
import { arcSound } from '../sound';
import { onSimEvent, sim, useUI } from '../store';
import { goTo } from './camera';
import { Box, Cyl, M } from './parts';
import { useWetGround } from './Weather';

import { ATS_POS, POLE_POS } from './sitePos';
export { ATS_POS, POLE_POS };
const BUILDING = { x: -1, z: -24, w: 24, h: 13, d: 10 };

export const buildingPowered = () => normalPowered(sim);

// Windows: the stairwell column (emergency lighting) and the server room on the second floor are on the UPS; the
// rest is ordinary load. Ordinary floors go dark at once and come back one floor after another.
const COLS = 16;
const ROWS = 4;
const isCritical = (r: number, c: number) => c === 0 || (r === 1 && c >= 10 && c <= 12);

function windowMesh(cells: [number, number][], color: string) {
  const geo = new THREE.PlaneGeometry(0.9, 1.1);
  const mat = new THREE.MeshStandardMaterial({ color: '#0e1318', emissive: color, emissiveIntensity: 0, roughness: 0.2, metalness: 0.6 });
  const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
  const m = new THREE.Matrix4();
  cells.forEach(([r, c], i) => {
    m.setPosition(BUILDING.x - BUILDING.w / 2 + 1.0 + c * ((BUILDING.w - 2) / (COLS - 1)), 1.8 + r * 3, BUILDING.z + BUILDING.d / 2 + 0.01);
    mesh.setMatrixAt(i, m);
    // a few offices left dark even when powered
    mesh.setColorAt(i, new THREE.Color(c === 0 || (c * 7 + r * 3) % 5 !== 0 ? '#ffffff' : '#000000'));
  });
  return mesh;
}

function Building() {
  const { floors, crit, server } = useMemo(() => {
    const floors = Array.from({ length: ROWS }, (_, r) =>
      windowMesh(
        Array.from({ length: COLS }, (_, c) => [r, c] as [number, number]).filter(([rr, c]) => !isCritical(rr, c)),
        '#ffd59a',
      ),
    );
    const stair = Array.from({ length: ROWS }, (_, r) => [r, 0] as [number, number]);
    return { floors, crit: windowMesh(stair, '#e8fff0'), server: windowMesh([10, 11, 12].map((c) => [1, c] as [number, number]), '#7fc4ff') };
  }, []);
  const level = useRef(new Array(ROWS).fill(1));
  const since = useRef(0);
  useFrame((_, dt) => {
    const on = normalPowered(sim);
    since.current = on ? since.current + dt : 0;
    floors.forEach((f, r) => {
      // floors come back one by one (contactors per floor), and drop out together
      const want = on && since.current > r * 0.45 ? 1 : 0;
      level.current[r] += (want - level.current[r]) * Math.min(1, dt * (want ? 6 : 25));
      (f.material as THREE.MeshStandardMaterial).emissiveIntensity = level.current[r] * 0.85;
    });
    const c = criticalPowered(sim);
    (crit.material as THREE.MeshStandardMaterial).emissiveIntensity = c ? (on ? 0.85 : 0.6) : 0;
    (server.material as THREE.MeshStandardMaterial).emissiveIntensity = c ? 1.3 : 0;
  });
  return (
    <group>
      <Box s={[BUILDING.w, BUILDING.h, BUILDING.d]} m={M.canopyDark} position={[BUILDING.x, BUILDING.h / 2, BUILDING.z]} />
      <Box s={[BUILDING.w + 0.4, 0.4, BUILDING.d + 0.4]} m={M.base} position={[BUILDING.x, BUILDING.h, BUILDING.z]} />
      {[1, 2, 3].map((r) => (
        <Box key={r} s={[BUILDING.w, 0.12, 0.1]} m={M.base} position={[BUILDING.x, r * 3 + 0.2, BUILDING.z + BUILDING.d / 2 + 0.05]} />
      ))}
      {floors.map((f, r) => (
        <primitive key={r} object={f} />
      ))}
      <primitive object={crit} />
      <primitive object={server} />
      <Text position={[BUILDING.x, BUILDING.h - 0.9, BUILDING.z + BUILDING.d / 2 + 0.05]} fontSize={0.7} color="#cfd6dc" anchorX="center">
        GEDUNG KANTOR
      </Text>
      <Text position={[BUILDING.x - 1.4, 7.6, BUILDING.z + BUILDING.d / 2 + 0.05]} fontSize={0.32} color="#7fc4ff" anchorX="center">
        RUANG SERVER (UPS)
      </Text>
    </group>
  );
}

/** More of the site's load: each building comes on as the building-load slider passes its threshold. */
export const LOADS = [
  { name: 'PABRIK', kw: 800, from: 600, pos: [-34, 0, -14] as const, size: [18, 9, 14] as const, color: '#7f8f9a' },
  { name: 'GUDANG & COLD STORAGE', kw: 500, from: 1400, pos: [26, 0, -21] as const, size: [14, 7, 12] as const, color: '#8a8070' },
  { name: 'RUMAH SAKIT', kw: 500, from: 1900, pos: [-34, 0, 16] as const, size: [16, 11, 10] as const, color: '#d9dcd6' },
];

function ExtraBuilding({ i }: { i: number }) {
  const L = LOADS[i];
  const [w, h, d] = L.size;
  const cols = Math.floor(w / 1.6);
  const rows = Math.floor((h - 1) / 2.6);
  const mesh = useMemo(() => {
    const geo = new THREE.PlaneGeometry(0.9, 1.0);
    const mat = new THREE.MeshStandardMaterial({ color: '#0e1318', emissive: i === 2 ? '#eaf6ff' : '#ffd59a', emissiveIntensity: 0, roughness: 0.2, metalness: 0.6 });
    const m = new THREE.InstancedMesh(geo, mat, cols * rows);
    const mx = new THREE.Matrix4();
    let k = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        mx.setPosition(L.pos[0] - w / 2 + 0.9 + c * ((w - 1.8) / Math.max(1, cols - 1)), 1.6 + r * 2.6, L.pos[2] + d / 2 + 0.01);
        m.setMatrixAt(k++, mx);
      }
    return m;
  }, [L, cols, rows, w, d, i]);
  const level = useRef(0);
  useFrame((_, dt) => {
    const on = normalPowered(sim) && sim.demandKw > L.from ? 1 : 0;
    level.current += (on - level.current) * Math.min(1, dt * (on ? 4 : 25));
    (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = level.current * 0.85;
  });
  return (
    <group>
      <Box s={[w, h, d]} m={M.canopyDark} position={[L.pos[0], h / 2, L.pos[2]]} />
      <Box s={[w + 0.3, 0.3, d + 0.3]} m={M.base} position={[L.pos[0], h, L.pos[2]]} />
      <primitive object={mesh} />
      <Text position={[L.pos[0], h - 0.6, L.pos[2] + d / 2 + 0.05]} fontSize={0.6} color="#cfd6dc" anchorX="center">
        {`${L.name} · ±${L.kw} kW`}
      </Text>
    </group>
  );
}

/** Building UPS beside the ATS: inverter cabinet with a status display and a battery cabinet. */
function UpsCabinet() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { c, t };
  }, []);
  const last = useRef(0);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const chg = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const cc = !sim.chargerOk ? (Math.floor(clock.elapsedTime * 2) % 2 ? '#ff3b30' : '#400') : sim.mainsOk ? '#39d353' : '#3a3d40';
    chg.current!.color.set(cc);
    chg.current!.emissive.set(cc);
    const col = !sim.upsOn ? '#3a3d40' : sim.upsCharge === 0 ? '#ff3b30' : sim.upsOnBattery ? (Math.floor(clock.elapsedTime * 2.5) % 2 ? '#ffb020' : '#553300') : '#39d353';
    led.current!.color.set(col);
    led.current!.emissive.set(col);
    if (clock.elapsedTime - last.current < 0.25) return;
    last.current = clock.elapsedTime;
    const g = tex.c.getContext('2d')!;
    g.fillStyle = '#0b1610';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = sim.upsOnBattery ? '#ffb020' : '#7fe08a';
    g.font = 'bold 26px monospace';
    g.textAlign = 'center';
    g.fillText(!sim.upsOn ? 'UPS OFF' : sim.upsOnBattery ? `BATERAI ${Math.round(sim.upsCharge * 100)}%` : `ONLINE ${Math.round(sim.upsCharge * 100)}%`, 128, 42);
    tex.t.needsUpdate = true;
  });
  return (
    <group position={[ATS_POS[0] + 2.1, 0, ATS_POS[2]]}>
      <Box s={[0.8, 1.9, 0.7]} r={0.02} m={M.white} position={[0, 0.95, 0]} />
      <Box s={[1.1, 1.6, 0.7]} r={0.02} m={M.canopyDark} position={[1.0, 0.8, 0]} />
      <mesh position={[0, 1.45, 0.36]}>
        <planeGeometry args={[0.6, 0.15]} />
        <meshBasicMaterial map={tex.t} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.2, 0.36]}>
        <circleGeometry args={[0.04, 16]} />
        <meshStandardMaterial ref={led} color="#39d353" emissive="#39d353" emissiveIntensity={2.5} />
      </mesh>
      <Text position={[0, 1.7, 0.36]} fontSize={0.1} color="#1b2228">
        UPS 80 kVA
      </Text>
      <Text position={[1.0, 1.4, 0.36]} fontSize={0.08} color="#cfd6dc">
        BATERAI 30 kWh
      </Text>
      {/* genset starter-battery charger, fed from the mains */}
      <Box s={[0.45, 0.55, 0.2]} r={0.01} m={M.white} position={[1.0, 1.88, 0.1]} />
      <mesh position={[1.0, 2.01, 0.205]}>
        <circleGeometry args={[0.03, 16]} />
        <meshStandardMaterial ref={chg} color="#39d353" emissive="#39d353" emissiveIntensity={2.5} />
      </mesh>
      <Text position={[1.0, 1.85, 0.205]} fontSize={0.045} color="#1b2228">
        {`CHARGER AKI
24 V`}
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

/** One contactor: body, a moving contact carrier (pulled in when closed) and a red/green position flag. */
function Contactor({ x, label, closed }: { x: number; label: string; closed: () => boolean }) {
  const carrier = useRef<THREE.Group>(null);
  const flag = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((_, dt) => {
    const on = closed();
    const g = carrier.current!;
    // snaps in fast (coil pulls), drops out a bit slower (spring)
    g.position.z += ((on ? 0.0 : 0.06) - g.position.z) * Math.min(1, dt * (on ? 40 : 25));
    flag.current!.color.set(on ? '#d23a2c' : '#2fb36b');
    flag.current!.emissive.set(on ? '#d23a2c' : '#2fb36b');
  });
  return (
    <group position={[x, 1.15, -0.05]}>
      <Box s={[0.42, 0.55, 0.22]} r={0.01} m={M.greyLight} />
      <group ref={carrier} position={[0, 0, 0.06]}>
        <Box s={[0.36, 0.12, 0.08]} m={M.black} position={[0, 0.08, 0.13]} />
        <mesh position={[0, 0.08, 0.175]}>
          <boxGeometry args={[0.08, 0.05, 0.01]} />
          <meshStandardMaterial ref={flag} color="#2fb36b" emissive="#2fb36b" emissiveIntensity={1.2} />
        </mesh>
      </group>
      {/* three poles of copper above and below */}
      {[-0.12, 0, 0.12].map((dx) => (
        <group key={dx}>
          <Box s={[0.03, 0.35, 0.02]} m={M.copper} position={[dx, 0.45, 0]} />
          <Box s={[0.03, 0.35, 0.02]} m={M.copper} position={[dx, -0.45, 0]} />
        </group>
      ))}
      <Text position={[0, -0.18, 0.12]} fontSize={0.045} color="#1b2228">
        {label}
      </Text>
    </group>
  );
}

/** Sparks and a flash at a contactor when it makes or breaks under load (only seen with the door open). */
function ContactArcs() {
  const N = 120;
  const { geo, sparks } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    return { geo, sparks: Array.from({ length: N }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), life: 0 })) };
  }, []);
  const light = useRef<THREE.PointLight>(null);
  const until = useRef(0);
  useEffect(
    () =>
      onSimEvent((e) => {
        if (!useUI.getState().atsOpen) return;
        const x = e === 'mcbOpen' || e === 'mcbClose' ? 0.35 : e === 'gcbOpen' || e === 'gcbClose' ? -0.35 : null;
        if (x === null) return;
        const at = new THREE.Vector3(x, 1.25, 0.15);
        light.current!.position.copy(at);
        until.current = performance.now() + 140;
        let n = 0;
        for (const sp of sparks) {
          if (sp.life > 0 || n > 40) continue;
          sp.p.copy(at);
          sp.v.set((Math.random() - 0.5) * 2.5, Math.random() * 2, Math.random() * 2);
          sp.life = 0.3 + Math.random() * 0.4;
          n++;
        }
        arcSound();
      }),
    [sparks],
  );
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const left = until.current - performance.now();
    light.current!.intensity = left > 0 ? 6 * (left / 140) : 0;
    const a = geo.attributes.position.array as Float32Array;
    sparks.forEach((sp, k) => {
      if (sp.life > 0) {
        sp.life -= dt;
        sp.v.y -= 9.8 * dt;
        sp.p.addScaledVector(sp.v, dt);
      } else sp.p.y = -99;
      a.set([sp.p.x, sp.p.y, sp.p.z], k * 3);
    });
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <>
      <points geometry={geo} frustumCulled={false}>
        <pointsMaterial color={new THREE.Color('#ffd27a').multiplyScalar(3)} size={0.025} sizeAttenuation toneMapped={false} />
      </points>
      <pointLight ref={light} intensity={0} distance={3} color="#cfe0ff" />
    </>
  );
}

/** The arc light and sparks only exist while the door is open (an always-present light costs every material). */
function AtsArcs() {
  const open = useUI((st) => st.atsOpen);
  return open ? <ContactArcs /> : null;
}

/** ATS cabinet: click to open the door. Inside: the mains contactor K1, the generator contactor K2 and the
 *  mechanical interlock that stops both closing at once. */
function AtsCabinet() {
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const led2 = useRef<THREE.MeshStandardMaterial>(null);
  const door = useRef<THREE.Group>(null);
  const lever = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    led.current!.emissiveIntensity = sim.mcb && sim.mainsOk ? 3 : 0;
    led2.current!.emissiveIntensity = sim.gcb ? 3 : 0;
    const want = useUI.getState().atsOpen ? -1.9 : 0;
    door.current!.rotation.y += (want - door.current!.rotation.y) * Math.min(1, dt * 4);
    lever.current!.rotation.z += ((sim.mcb ? 0.35 : sim.gcb ? -0.35 : 0) - lever.current!.rotation.z) * Math.min(1, dt * 20);
  });
  const toggle = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const open = !useUI.getState().atsOpen;
    useUI.getState().set({ atsOpen: open });
    if (open) goTo('atsOpen');
  };
  const cursor = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => (document.body.style.cursor = ''),
  };
  return (
    <group position={ATS_POS}>
      {/* carcass: back, sides, top and plinth, open at the front */}
      <Box s={[1.6, 2.1, 0.04]} m={M.base} position={[0, 1.05, -0.33]} />
      <Box s={[0.04, 2.1, 0.7]} m={M.base} position={[-0.78, 1.05, 0]} />
      <Box s={[0.04, 2.1, 0.7]} m={M.base} position={[0.78, 1.05, 0]} />
      <Box s={[1.6, 0.04, 0.7]} m={M.base} position={[0, 2.08, 0]} />
      <Box s={[1.5, 0.1, 0.72]} m={M.cast} position={[0, 0.05, 0]} />
      <Box s={[1.4, 1.9, 0.02]} m={M.greyLight} position={[0, 1.05, -0.3]} />
      {/* interior */}
      <Contactor x={0.35} label="K1 · PLN" closed={() => sim.mcb} />
      <Contactor x={-0.35} label="K2 · GENSET" closed={() => sim.gcb} />
      <mesh ref={lever} position={[0, 1.5, 0.08]}>
        <boxGeometry args={[0.55, 0.03, 0.03]} />
        <meshStandardMaterial color="#d6b030" metalness={0.6} roughness={0.4} />
      </mesh>
      <Text position={[0, 1.58, 0.1]} fontSize={0.04} color="#1b2228">
        INTERLOCK MEKANIK
      </Text>
      {[-0.12, 0, 0.12].map((dx) => (
        <Box key={dx} s={[0.9, 0.03, 0.02]} m={M.yellow} position={[0, 0.45 + dx, -0.12]} />
      ))}
      <Text position={[0, 0.25, 0]} fontSize={0.045} color="#1b2228">
        BUSBAR KE GEDUNG
      </Text>
      <AtsArcs />
      {/* door, hinged on the left; carries the lamps */}
      <group ref={door} position={[-0.78, 0, 0.35]}>
        <group position={[0.78, 0, 0]} onClick={toggle} {...cursor}>
          <Box s={[1.56, 2.06, 0.04]} r={0.01} m={M.base} position={[0, 1.05, 0]} />
          <mesh position={[-0.3, 1.6, 0.025]}>
            <circleGeometry args={[0.05, 16]} />
            <meshStandardMaterial ref={led} color="#2ad16b" emissive="#2ad16b" />
          </mesh>
          <mesh position={[0.3, 1.6, 0.025]}>
            <circleGeometry args={[0.05, 16]} />
            <meshStandardMaterial ref={led2} color="#ffb020" emissive="#ffb020" />
          </mesh>
          <Text position={[0, 1.85, 0.025]} fontSize={0.16} color="#1b2228">
            ATS
          </Text>
          <Text position={[-0.3, 1.45, 0.025]} fontSize={0.07} color="#1b2228">
            PLN
          </Text>
          <Text position={[0.3, 1.45, 0.025]} fontSize={0.07} color="#1b2228">
            GENSET
          </Text>
          <Text position={[0, 1.1, 0.025]} fontSize={0.055} color="#1b2228">
            KLIK UNTUK BUKA
          </Text>
          <Box s={[0.04, 0.25, 0.05]} m={M.black} position={[0.68, 1.05, 0.04]} />
        </group>
      </group>
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
  const asphalt = useWetGround('#2a2d30');
  const pad = useWetGround('#6d7175');
  const [ax, , az] = ATS_POS;
  const [px, , pz] = POLE_POS;
  const genCable: [number, number, number][] = [panelAt, [panelAt[0], 0.05, panelAt[2]], [ax, 0.05, panelAt[2]], [ax, 0.05, az + 0.4], [ax, 0.6, az + 0.35]];
  const plnCable: [number, number, number][] = [[px, 9.4, pz], [px - 2, 8.6, pz + 0.5], [ax + 0.5, 2.6, az], [ax + 0.4, 2.1, az]];
  const bldCable: [number, number, number][] = [[ax - 0.4, 2.1, az], [ax - 1, 3.5, az - 4], [ax - 2, 4, BUILDING.z + BUILDING.d / 2]];
  return (
    <group>
      {/* ground: asphalt yard, concrete pad, cable trench cover */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={asphalt}>
        <planeGeometry args={[120, 120]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow material={pad}>
        <planeGeometry args={[16, 7]} />
      </mesh>
      <Box s={[ax - panelAt[0] + 0.4, 0.04, 0.4]} m={M.cast} position={[(ax + panelAt[0]) / 2, 0.02, panelAt[2]]} />
      <Box s={[0.4, 0.04, Math.abs(az - panelAt[2])]} m={M.cast} position={[ax, 0.02, (az + panelAt[2]) / 2]} />
      <Building />
      {LOADS.map((_, i) => (
        <ExtraBuilding key={i} i={i} />
      ))}
      {LOADS.map((L, i) => {
        const pts: [number, number, number][] = [
          [ax - 0.4, 0.05, az + 0.4],
          [ax - 0.4, 0.05, L.pos[2] + L.size[2] / 2 + 1],
          [L.pos[0], 0.05, L.pos[2] + L.size[2] / 2 + 1],
          [L.pos[0], 1.2, L.pos[2] + L.size[2] / 2 + 0.1],
        ];
        return (
          <group key={i}>
            <Line points={pts} color="#111" lineWidth={1.5} />
            <Flow pts={pts} color="#ffe9a8" on={() => buildingPowered() && sim.demandKw > L.from} speed={1.5} />
          </group>
        );
      })}
      <Pole />
      <AtsCabinet />
      <UpsCabinet />
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
