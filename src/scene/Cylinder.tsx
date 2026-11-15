// Bullet-time cutaway of one cylinder, scaled up beside the site: liner cut open, piston and rod on the crank, intake
// and exhaust valves on their cam timing, the injector spray, the flame of combustion, and the air and exhaust gas
// moving through. One four-stroke cycle (720° of crank) takes several seconds.
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useUI } from '../store';
import { Box, Cyl, M } from './parts';

export const CYL_POS: [number, number, number] = [-30, 0, 18];
const R = 0.55; // bore radius
const CRANK_R = 0.65; // stroke 1.3 against a 1.1 bore, like the 4016's 190 × 160 mm
const ROD = 2.0;
const DECK = CRANK_R + ROD + 0.3 + 0.08; // liner top above the crank centre: small clearance at top dead centre
const BASE_Y = 1.0; // crank centre height

export interface Stroke {
  name: string;
  desc: string;
}
export const STROKES: Stroke[] = [
  { name: '1 · HISAP', desc: 'Katup hisap terbuka, piston turun. Udara bersih (dipadatkan turbo) masuk ke silinder. Tidak ada solar yang ikut, hanya udara.' },
  {
    name: '2 · KOMPRESI',
    desc: 'Kedua katup tertutup, piston naik memampatkan udara sekitar 13 kali. Udara jadi sangat panas, kira-kira 550–600 °C, jauh di atas titik nyala solar (±250 °C).',
  },
  {
    name: '3 · USAHA',
    desc: 'Sesaat sebelum piston di puncak, injektor menyemprotkan solar berbentuk kabut. Solar langsung terbakar sendiri karena udaranya panas, tanpa busi. Tekanan pembakaran mendorong piston turun dan memutar poros engkol.',
  },
  { name: '4 · BUANG', desc: 'Katup buang terbuka, piston naik mendorong gas sisa pembakaran keluar ke manifold, lalu ke turbo dan knalpot.' },
];

export const cyl = { angle: 0, stroke: 0 };

const lift = (deg: number, open: number, close: number) => {
  // cam lift: smooth hump between opening and closing angle (degrees of crank, 0–720)
  if (deg < open || deg > close) return 0;
  return Math.sin(((deg - open) / (close - open)) * Math.PI);
};

export function CylinderCutaway() {
  const g = useRef<THREE.Group>(null);
  const piston = useRef<THREE.Group>(null);
  const rod = useRef<THREE.Mesh>(null);
  const pin = useRef<THREE.Group>(null);
  const inV = useRef<THREE.Group>(null);
  const exV = useRef<THREE.Group>(null);
  const gas = useRef<THREE.Mesh>(null);
  const flame = useRef<THREE.PointLight>(null);
  const label = useRef<any>(null);
  const gasMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7fc4ff', transparent: true, opacity: 0.25, emissive: '#000', depthWrite: false }), []);
  const spray = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3));
    return geo;
  }, []);
  const flow = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(300 * 3), 3));
    return geo;
  }, []);
  const flowMat = useRef<THREE.PointsMaterial>(null);
  const seeds = useMemo(() => Array.from({ length: 400 }, () => [Math.random(), Math.random(), Math.random()]), []);

  useFrame((_, dt) => {
    const ui = useUI.getState();
    g.current!.visible = ui.cylinder;
    if (!ui.cylinder) return;
    cyl.angle = (cyl.angle + (dt * 720) / ui.cylSpeed) % 720;
    const deg = cyl.angle;
    cyl.stroke = Math.floor(deg / 180);
    const a = (deg * Math.PI) / 180;
    // piston: crank pin on a circle, rod to the gudgeon pin
    const px = CRANK_R * Math.sin(a);
    const py = CRANK_R * Math.cos(a);
    const pistonY = py + Math.sqrt(ROD * ROD - px * px);
    piston.current!.position.y = BASE_Y + pistonY;
    pin.current!.rotation.z = -a;
    const rodMid = new THREE.Vector3(px / 2, BASE_Y + (py + pistonY) / 2, 0);
    rod.current!.position.copy(rodMid);
    rod.current!.rotation.z = Math.atan2(px, pistonY - py);
    // valves: intake 350–590°, exhaust 130–370° (slight overlap around TDC)
    const li = lift(deg < 300 ? deg + 720 : deg, 700, 950) || lift(deg, -20, 230);
    const le = lift(deg, 490, 740) || lift(deg + 720, 490, 740);
    inV.current!.position.y = -0.18 * li;
    exV.current!.position.y = -0.18 * le;
    // gas column between head and piston crown
    const crown = BASE_Y + pistonY + 0.32;
    const top = BASE_Y + DECK;
    const h = Math.max(0.02, top - crown);
    gas.current!.scale.y = h;
    gas.current!.position.y = crown + h / 2;
    let col = '#7fc4ff';
    let em = 0;
    let op = 0.22;
    if (cyl.stroke === 1) {
      const t = (deg - 180) / 180;
      col = new THREE.Color('#7fc4ff').lerp(new THREE.Color('#ff8a3a'), t).getStyle();
      op = 0.22 + 0.2 * t;
      em = 0.6 * t;
    } else if (cyl.stroke === 2) {
      const t = (deg - 360) / 180;
      col = new THREE.Color('#ffd27a').lerp(new THREE.Color('#6b6560'), t).getStyle();
      em = 3 * (1 - t) ** 2;
      op = 0.5 - 0.2 * t;
    } else if (cyl.stroke === 3) col = '#6b6560';
    gasMat.color.set(col);
    gasMat.emissive.set(col);
    gasMat.emissiveIntensity = em;
    gasMat.opacity = op;
    flame.current!.intensity = cyl.stroke === 2 ? 60 * Math.max(0, 1 - (deg - 360) / 90) : 0;
    // injector spray from 345° to 380°
    const sp = spray.attributes.position.array as Float32Array;
    const injecting = deg > 345 && deg < 385;
    seeds.forEach(([r1, r2, r3], k) => {
      if (!injecting) {
        sp[k * 3 + 1] = -99;
        return;
      }
      const t = ((deg - 345) / 40 + r1) % 1;
      const ang = r2 * Math.PI * 2;
      const spread = 0.12 + 0.5 * t;
      sp[k * 3] = Math.cos(ang) * spread * r3;
      sp[k * 3 + 1] = top - 0.06 - t * 0.35;
      sp[k * 3 + 2] = Math.sin(ang) * spread * r3;
    });
    spray.attributes.position.needsUpdate = true;
    // intake air in, exhaust gas out
    const fl = flow.attributes.position.array as Float32Array;
    const intake = cyl.stroke === 0;
    const exhaust = cyl.stroke === 3;
    flowMat.current!.color.set(intake ? '#7fc4ff' : '#9a948e');
    for (let k = 0; k < 300; k++) {
      const [r1, r2] = seeds[k];
      if (!intake && !exhaust) {
        fl[k * 3 + 1] = -99;
        continue;
      }
      const t = (r1 + (deg / 180) * 1.5) % 1;
      const side = intake ? -1 : 1;
      // along the port into (or out of) the chamber
      const x = intake ? side * (1.6 - t * 1.4) : side * (0.2 + t * 1.4);
      fl[k * 3] = x;
      fl[k * 3 + 1] = top + 0.25 + Math.abs(x) * 0.25 + (r2 - 0.5) * 0.15;
      fl[k * 3 + 2] = (r2 - 0.5) * 0.25;
    }
    flow.attributes.position.needsUpdate = true;
    if (label.current) label.current.text = STROKES[cyl.stroke].name;
  });

  return (
    <group ref={g} position={CYL_POS} visible={false}>
      <Box s={[3.6, 0.3, 2.4]} m={M.cast} position={[0, 0.15, 0]} />
      {/* liner cut in half so the inside shows */}
      <mesh position={[0, BASE_Y + DECK - 1.15, 0]}>
        <cylinderGeometry args={[R + 0.08, R + 0.08, 2.3, 40, 1, true, Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color="#8a9096" metalness={0.6} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* cylinder head with the two ports */}
      <Box s={[1.5, 0.4, 0.2]} m={M.teal} position={[0, BASE_Y + DECK + 0.2, -0.5]} />
      <Box s={[1.5, 0.08, 1.2]} m={M.teal} position={[0, BASE_Y + DECK + 0.04, -0.1]} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Cyl r={0.13} l={1.3} axis="x" m={M.teal} position={[s * 0.95, BASE_Y + DECK + 0.45, 0]} rotation={[0, 0, s * 0.25]} />
          <Text position={[s * 1.25, BASE_Y + DECK + 0.85, 0]} fontSize={0.12} color="#e9eef2">
            {s < 0 ? 'UDARA MASUK' : 'GAS BUANG'}
          </Text>
        </group>
      ))}
      {/* valves */}
      <group ref={inV} position={[-0.25, BASE_Y + DECK, 0]}>
        <Cyl r={0.025} l={0.6} m={M.steel} position={[0, 0.3, 0]} />
        <Cyl r={0.16} r2={0.05} l={0.06} m={M.steel} />
      </group>
      <group ref={exV} position={[0.25, BASE_Y + DECK, 0]}>
        <Cyl r={0.025} l={0.6} m={M.steel} position={[0, 0.3, 0]} />
        <Cyl r={0.16} r2={0.05} l={0.06} m={M.hot} />
      </group>
      {/* injector */}
      <Cyl r={0.05} l={0.5} m={M.black} position={[0, BASE_Y + DECK + 0.25, 0]} />
      <points geometry={spray} frustumCulled={false}>
        <pointsMaterial color="#ffe08a" size={0.03} sizeAttenuation transparent opacity={0.8} />
      </points>
      <points geometry={flow} frustumCulled={false}>
        <pointsMaterial ref={flowMat} color="#7fc4ff" size={0.05} sizeAttenuation transparent opacity={0.85} />
      </points>
      {/* gas in the chamber and the flame light */}
      <mesh ref={gas} material={gasMat}>
        <cylinderGeometry args={[R - 0.01, R - 0.01, 1, 32]} />
      </mesh>
      <pointLight ref={flame} position={[0, BASE_Y + DECK - 0.3, 0.3]} intensity={0} distance={5} color="#ff8a2a" />
      {/* piston with rings */}
      <group ref={piston}>
        <Cyl r={R - 0.02} l={0.6} seg={32} m={M.silver} position={[0, 0.0, 0]} />
        {[0.2, 0.12, 0.04].map((y) => (
          <Cyl key={y} r={R - 0.015} l={0.025} seg={32} m={M.black} position={[0, y, 0]} />
        ))}
      </group>
      <mesh ref={rod}>
        <boxGeometry args={[0.12, ROD, 0.1]} />
        <meshStandardMaterial color="#9aa0a6" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* crank: web and pin turning */}
      <group ref={pin} position={[0, BASE_Y, 0.1]}>
        <Cyl r={0.82} l={0.12} axis="z" m={M.cast} />
        <Cyl r={0.1} l={0.3} axis="z" m={M.steel} position={[0, CRANK_R, 0.1]} />
      </group>
      <Cyl r={0.12} l={0.8} axis="z" m={M.steel} position={[0, BASE_Y, 0]} />
      <Text ref={label} position={[0, BASE_Y + DECK + 1.3, 0]} fontSize={0.32} color="#ffd23a" outlineWidth={0.01} outlineColor="#000">
        {STROKES[0].name}
      </Text>
    </group>
  );
}
