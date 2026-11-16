// The visible side of a workshop build, shared by the workshop and the genset (set frame: radiator −x, operator +z):
// - turbos: four stock-size turbos under the stock air cleaners, or for "besar"/"jumbo" two big turbos (one per bank)
//   on top with cone pod filters, the stock air cleaners removed
// - air-to-air intercooler: a core with two electric fans mounted in front of the radiator, and neat charge pipes:
//   two hot runs from the compressors and one cool run back into the aftercooler housing, all square to the engine
// - straight-through exhaust pipes, and the engine paint
// Placed beside <Genset /> inside the group passed as `root`.
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { TURBOS, type Build } from '../sim/dyno';
import { BLOCK } from './Genset';
import { Box, Cyl, M } from './parts';

const STOCK_TEAL = M.teal.color.clone();
const STOCK_BLOCK = BLOCK.color.clone();
type V3 = [number, number, number];

/** A pipe through corner points with tight rounded bends (straight runs, neat 90° turns). */
function Pipe({ pts, r, m, bend = 0.16 }: { pts: V3[]; r: number; m: THREE.Material; bend?: number }) {
  const geo = useMemo(() => {
    const v = pts.map((p) => new THREE.Vector3(...p));
    const path = new THREE.CurvePath<THREE.Vector3>();
    let from = v[0];
    for (let i = 1; i < v.length - 1; i++) {
      const c = v[i];
      const inDir = c.clone().sub(v[i - 1]).normalize();
      const outDir = v[i + 1].clone().sub(c).normalize();
      const k = Math.min(bend, c.distanceTo(v[i - 1]) / 2, c.distanceTo(v[i + 1]) / 2);
      const a = c.clone().addScaledVector(inDir, -k);
      const b = c.clone().addScaledVector(outDir, k);
      if (from.distanceTo(a) > 1e-4) path.add(new THREE.LineCurve3(from, a));
      path.add(new THREE.QuadraticBezierCurve3(a, c, b));
      from = b;
    }
    path.add(new THREE.LineCurve3(from, v[v.length - 1]));
    return new THREE.TubeGeometry(path, Math.max(24, v.length * 16), r, 14, false);
  }, [pts, r, bend]);
  return <mesh geometry={geo} material={m} castShadow />;
}

/** Hose clamp ring on a pipe. */
const Clamp = ({ at, axis }: { at: V3; axis: 'x' | 'y' | 'z' }) => <Cyl r={0.088} l={0.05} axis={axis} m={M.steel} position={at} />;

/** One big turbo per bank: turbine (hot) inboard, compressor (silver) outboard with its cone filter. */
function BigTurbo({ side }: { side: 1 | -1 }) {
  return (
    <group position={[0.74, 2.32, side * 0.55]}>
      <mesh material={M.hot} castShadow>
        <torusGeometry args={[0.2, 0.11, 14, 28]} />
      </mesh>
      <Cyl r={0.14} l={0.2} axis="z" m={M.hot} />
      <Cyl r={0.1} l={0.16} axis="z" m={M.steel} position={[0, 0, side * 0.17]} />
      <group position={[0, 0, side * 0.3]}>
        <mesh material={M.silver} castShadow>
          <torusGeometry args={[0.21, 0.1, 14, 28]} />
        </mesh>
        <Cyl r={0.15} l={0.16} axis="z" m={M.silver} />
        {/* pod filter on the compressor inlet, pointing outboard */}
        <Cyl r={0.13} l={0.12} axis="z" m={M.steel} position={[0, 0, side * 0.12]} />
        <Cyl r={0.17} r2={0.12} l={0.3} axis="z" m={M.red} position={[0, 0, side * 0.33]} />
        <Cyl r={0.12} l={0.02} axis="z" m={M.black} position={[0, 0, side * 0.49]} />
      </group>
    </group>
  );
}

const CAC_X = -3.02;
/** Air-to-air charge cooler in front of the radiator with two electric pusher fans. */
function ChargeCooler({ fans }: { fans: RefObject<THREE.Group[]> }) {
  return (
    <group>
      <Box s={[0.14, 1.85, 1.95]} m={M.silver} position={[CAC_X, 1.45, 0]} />
      {Array.from({ length: 22 }, (_, i) => (
        <Box key={i} s={[0.15, 0.012, 1.9]} m={M.steel} position={[CAC_X, 0.6 + i * 0.081, 0]} />
      ))}
      {/* top and bottom tanks */}
      <Box s={[0.22, 0.14, 2.0]} r={0.02} m={M.silver} position={[CAC_X, 2.44, 0]} />
      <Box s={[0.22, 0.14, 2.0]} r={0.02} m={M.silver} position={[CAC_X, 0.46, 0]} />
      {/* brackets to the radiator frame */}
      {[-0.95, 0.95].map((z) => (
        <Box key={z} s={[0.22, 0.08, 0.06]} m={M.cast} position={[CAC_X + 0.12, 2.2, z]} />
      ))}
      {[-0.48, 0.48].map((z, i) => (
        <group key={z} position={[CAC_X - 0.14, 1.45, z]}>
          <Cyl r={0.42} l={0.1} axis="x" m={M.black} open />
          <Cyl r={0.07} l={0.14} axis="x" m={M.black} />
          <group ref={(el) => el && fans.current && (fans.current[i] = el)}>
            {Array.from({ length: 7 }, (_, k) => (
              <group key={k} rotation={[(k / 7) * Math.PI * 2, 0, 0]}>
                <Box s={[0.012, 0.32, 0.07]} m={M.black} position={[0, 0.22, 0]} rotation={[0, 0.5, 0]} />
              </group>
            ))}
          </group>
          {[0, Math.PI / 2].map((a) => (
            <Box key={a} s={[0.02, 0.84, 0.02]} m={M.steel} position={[-0.06, 0, 0]} rotation={[a, 0, 0]} />
          ))}
        </group>
      ))}
      <Text position={[CAC_X - 0.2, 2.44, 0]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.07} color="#1b2228">
        INTERCOOLER · 2 KIPAS LISTRIK
      </Text>
    </group>
  );
}

const RUN_Y = 2.95; // hot runs, above the air cleaners
const COOL_Y = 3.15; // the cool run, one level up
/** Charge pipes: compressor outlets → up → along the engine → down into the cooler's top tank; cool air back out of
 *  the top tank (U-flow core) → along the centreline → down into the aftercooler housing on the vee. */
function ChargePipes({ twin }: { twin: boolean }) {
  const pipes = [1, -1].map((s) => {
    const start: V3 = twin ? [0.98, 2.32, s * 0.85] : [0.74, 2.15, s * 0.7];
    const pts: V3[] = [start, [start[0], RUN_Y, start[2]], [start[0], RUN_Y, s * 0.55], [CAC_X, RUN_Y, s * 0.55], [CAC_X, 2.52, s * 0.55]];
    return { key: s, pts };
  });
  const cool: V3[] = [[CAC_X, 2.52, 0], [CAC_X, COOL_Y, 0], [-0.7, COOL_Y, 0], [-0.7, 2.16, 0]];
  return (
    <group>
      {pipes.map(({ key, pts }) => (
        <Pipe key={`${key}${twin}`} pts={pts} r={0.075} m={M.silver} />
      ))}
      <Pipe pts={cool} r={0.085} m={M.silver} />
      {pipes.map(({ key, pts }) => (
        <Clamp key={key} at={[pts[3][0] + 0.25, RUN_Y, pts[3][2]]} axis="x" />
      ))}
      <Clamp at={[-0.7, 2.4, 0]} axis="y" />
      <Clamp at={[CAC_X + 0.3, COOL_Y, 0]} axis="x" />
    </group>
  );
}

/** Height of the straight-through pipes' outlets (set frame), where their smoke comes out. */
export const STRAIGHT_TOP = 4.1;

export function ModParts({
  root,
  build,
  boost,
  outside = true,
  straightOk = outside,
}: {
  root: RefObject<THREE.Group>;
  build: () => Build | null;
  boost: () => number;
  outside?: boolean;
  straightOk?: boolean;
}) {
  const turbos = useRef<THREE.Object3D[]>([]);
  const cleaners = useRef<THREE.Object3D | null>(null);
  const big = useRef<THREE.Group>(null);
  const cooler = useRef<THREE.Group>(null);
  const pipesQuad = useRef<THREE.Group>(null);
  const pipesTwin = useRef<THREE.Group>(null);
  const straight = useRef<THREE.Group>(null);
  const fans = useRef<THREE.Group[]>([]);
  // Find the stock turbos and air cleaners in the model. Done on the first frame, not in a layout effect: the parent
  // group's ref is attached only after this child's effects run, so it would still be empty there.
  const found = useRef(false);
  const discover = () => {
    if (found.current || !root.current) return;
    let outer: THREE.Object3D | null = null;
    let air: THREE.Object3D | null = null;
    root.current.traverse((o) => {
      if (!outer && o.userData.part === 'turbo' && o.children.length >= 4) outer = o;
      if (!air && o.userData.part === 'aircleaner') air = o;
    });
    if (!outer || !air) return;
    turbos.current = (outer as THREE.Object3D).children;
    cleaners.current = air;
    found.current = true;
  };
  // the paint goes back to stock when the scene closes
  useEffect(
    () => () => {
      M.teal.color.copy(STOCK_TEAL);
      BLOCK.color.copy(STOCK_BLOCK);
    },
    [],
  );
  useFrame((_, dt) => {
    discover();
    const b = build();
    if (b) M.teal.color.set(b.paint);
    else M.teal.color.copy(STOCK_TEAL);
    BLOCK.color.copy(M.teal.color);
    const size = b ? b.turbo : 'standar';
    const twin = size === 'besar' || size === 'jumbo';
    // stock / small: the four stock turbos (slightly smaller for "kecil"); big: two big turbos, stock cleaners off
    turbos.current.forEach((o) => {
      o.visible = !twin;
      o.scale.setScalar(size === 'kecil' ? 0.85 : 1);
    });
    if (cleaners.current) cleaners.current.visible = !twin;
    big.current!.visible = twin;
    big.current!.scale.setScalar(size === 'jumbo' ? 1.2 : 1);
    big.current!.position.set(0.74 * (1 - big.current!.scale.x), 2.32 * (1 - big.current!.scale.x), 0);
    const ic = outside && !!b && b.intercooler === 'udara';
    cooler.current!.visible = ic;
    pipesQuad.current!.visible = ic && !twin;
    pipesTwin.current!.visible = ic && twin;
    straight.current!.visible = straightOk && !!b && b.straight;
    const w = boost() > 0.2 ? 14 + 12 * Math.min(1, boost() / 3) : 0;
    fans.current.forEach((f) => f && (f.rotation.x += w * dt));
    void TURBOS;
  });
  return (
    <>
      <group ref={big} visible={false}>
        <BigTurbo side={1} />
        <BigTurbo side={-1} />
      </group>
      <group ref={cooler} visible={false}>
        <ChargeCooler fans={fans} />
      </group>
      <group ref={pipesQuad} visible={false}>
        <ChargePipes twin={false} />
      </group>
      <group ref={pipesTwin} visible={false}>
        <ChargePipes twin />
      </group>
      {/* straight-through pipes off the turbines */}
      <group ref={straight} visible={false}>
        {[-1, 1].map((s) => (
          <Cyl key={s} r={0.13} l={1.6} m={M.chrome} position={[0.74, 3.3, s * 0.3]} />
        ))}
      </group>
    </>
  );
}
