// The visible side of a workshop build, shared by the workshop and the genset: turbo size (four stock-size turbos, or
// one bigger turbo per bank), the free-standing air-to-air intercooler with its fans and charge pipes, straight-through
// exhaust pipes, and the engine paint. Placed beside <Genset /> inside the group passed as `root`.
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { TURBOS, type Build } from '../sim/dyno';
import { BLOCK } from './Genset';
import { Box, Cyl, M } from './parts';

const STOCK_TEAL = M.teal.color.clone();
const STOCK_BLOCK = BLOCK.color.clone();

/** A bent tube along points (a smooth pipe that can turn corners). */
function Tube({ pts, r, m }: { pts: [number, number, number][]; r: number; m: THREE.Material }) {
  const geo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal'), 48, r, 12, false), [pts, r]);
  return <mesh geometry={geo} material={m} castShadow />;
}

const IC_POS: [number, number, number] = [-0.5, 0, -2.45];
/** Air-to-air intercooler as a free-standing unit beside the engine: frame, core, two electric fans, and the charge
 *  pipes from the turbo compressors to the core and back to the inlet manifold. */
function Intercooler({ boost }: { boost: () => number }) {
  const fans = useRef<THREE.Group[]>([]);
  useFrame((_, dt) => {
    const b = boost();
    const w = b > 0.2 ? 14 + 12 * Math.min(1, b / 3) : 0;
    fans.current.forEach((f) => f && (f.rotation.z += w * dt));
  });
  const [x, , z] = IC_POS;
  const top = 2.15;
  return (
    <group>
      <group position={IC_POS}>
        {/* stand */}
        {[-0.85, 0.85].map((dx) => (
          <Box key={dx} s={[0.08, top, 0.08]} m={M.cast} position={[dx, top / 2, 0]} />
        ))}
        <Box s={[1.8, 0.08, 0.5]} m={M.cast} position={[0, 0.04, 0]} />
        {/* core with fins and end tanks */}
        <Box s={[1.6, 1.15, 0.14]} m={M.silver} position={[0, 1.45, 0]} />
        {Array.from({ length: 16 }, (_, i) => (
          <Box key={i} s={[1.56, 0.015, 0.16]} m={M.steel} position={[0, 0.92 + i * 0.07, 0]} />
        ))}
        {[-0.84, 0.84].map((dx) => (
          <Box key={dx} s={[0.1, 1.2, 0.22]} m={M.silver} position={[dx, 1.45, 0]} />
        ))}
        {/* two electric fans on the outer face */}
        {[-0.4, 0.4].map((dx, i) => (
          <group key={dx} position={[dx, 1.45, -0.16]}>
            <Cyl r={0.38} l={0.12} axis="z" m={M.black} open />
            <Cyl r={0.06} l={0.14} axis="z" m={M.black} />
            <group ref={(el) => el && (fans.current[i] = el)}>
              {Array.from({ length: 7 }, (_, k) => (
                <group key={k} rotation={[0, 0, (k / 7) * Math.PI * 2]}>
                  <Box s={[0.06, 0.3, 0.012]} m={M.black} position={[0, 0.2, 0]} rotation={[0.5, 0, 0]} />
                </group>
              ))}
            </group>
            {[0, Math.PI / 2].map((a) => (
              <Box key={a} s={[0.76, 0.02, 0.02]} m={M.steel} position={[0, 0, -0.07]} rotation={[0, 0, a]} />
            ))}
          </group>
        ))}
        <Text position={[0, 2.12, -0.09]} rotation={[0, Math.PI, 0]} fontSize={0.09} color="#e9eef2">
          INTERCOOLER UDARA KE UDARA
        </Text>
      </group>
      {/* hot side: both banks' compressors into the top of the core (the +z bank crosses over the engine) */}
      <Tube pts={[[0.74, 2.15, -0.68], [0.74, 2.55, -1.1], [0.4, 2.45, -2.2], [x + 0.6, top - 0.05, z]]} r={0.075} m={M.silver} />
      <Tube pts={[[0.74, 2.15, 0.68], [1.0, 2.75, 0.55], [1.0, 2.95, 0], [1.0, 2.85, -0.9], [0.55, 2.5, -2.0], [x + 0.2, top - 0.05, z]]} r={0.075} m={M.silver} />
      {/* cool side: from the bottom of the core back to the inlet manifold */}
      <Tube pts={[[x - 0.7, 0.9, z], [x - 0.9, 0.95, z + 1.0], [-1.2, 1.7, -0.95], [-0.9, 2.0, -0.45]]} r={0.085} m={M.silver} />
      {[[0.74, 2.55, -1.1], [-1.2, 1.7, -0.95]].map((p, i) => (
        <Cyl key={i} r={0.1} l={0.08} m={M.rubber} position={p as [number, number, number]} />
      ))}
    </group>
  );
}


export function ModParts({ root, build, boost, outside = true }: { root: RefObject<THREE.Group>; build: () => Build | null; boost: () => number; outside?: boolean }) {
  const turbos = useRef<{ o: THREE.Object3D; pos: THREE.Vector3 }[]>([]);
  const cooler = useRef<THREE.Group>(null);
  const pipes = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    // the four turbo assemblies are the children of the outer 'turbo' part; each scales about its own centre
    let outer: THREE.Object3D | null = null;
    root.current?.traverse((o) => {
      if (!outer && o.userData.part === 'turbo' && o.children.length >= 4) outer = o;
    });
    turbos.current = outer ? (outer as THREE.Object3D).children.map((o) => ({ o, pos: o.position.clone() })) : [];
  }, [root]);
  // the paint goes back to stock when the build is removed or the scene closes
  useEffect(
    () => () => {
      M.teal.color.copy(STOCK_TEAL);
      BLOCK.color.copy(STOCK_BLOCK);
    },
    [],
  );
  useFrame(() => {
    const b = build();
    if (b) M.teal.color.set(b.paint);
    else M.teal.color.copy(STOCK_TEAL);
    BLOCK.color.copy(M.teal.color);
    // stock/small: four turbos, two per bank; big/jumbo: one larger turbo per bank, centred where the pair was
    const size = b ? b.turbo : 'standar';
    const k = TURBOS[size].scale;
    const twin = size === 'besar' || size === 'jumbo';
    turbos.current.forEach(({ o, pos }, i) => {
      o.scale.setScalar(k);
      o.visible = !twin || i % 2 === 0;
      o.position.set(twin ? 0.74 : pos.x, pos.y + (twin ? 0.06 : 0), pos.z);
    });
    cooler.current!.visible = outside && !!b && b.intercooler === 'udara';
    pipes.current!.visible = outside && !!b && b.straight;
  });
  return (
    <>
      <group ref={cooler} visible={false}>
        <Intercooler boost={boost} />
      </group>
      {/* straight-through pipes off the turbines */}
      <group ref={pipes} visible={false}>
        {[-1, 1].map((s) => (
          <Cyl key={s} r={0.13} l={1.6} m={M.chrome} position={[0.74, 3.3, s * 0.3]} />
        ))}
      </group>
    </>
  );
}
