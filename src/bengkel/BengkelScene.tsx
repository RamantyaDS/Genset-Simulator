// The engine test cell: the 4016 on its stand with the dynamometer on the flywheel, the exhaust extraction hood, and the
// effects of what the build does: soot or steam from the outlet, a glowing turbo, and the end of an over-revved engine.
import { CameraControls, Environment, Lightformer, Text } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useEffect, useLayoutEffect, useMemo, useRef, type ElementRef } from 'react';
import * as THREE from 'three';
import { Genset } from '../scene/Genset';
import { ModParts, STRAIGHT_TOP } from '../scene/ModParts';
import { Box, Cyl, M } from '../scene/parts';
import { GensetCtx, type GensetSource } from '../scene/source';
import { create as createGenset } from '../sim/genset';
import { LIMITS, TURBOS } from '../sim/dyno';
import { arcSound, playPlantEvent, soundSource, thunder, updateSound } from '../sound';
import { MAX_DPR } from '../scene/Adaptive';
import { advanceEngine, engine, input, onEngineEvent, useBengkel } from './store';

export const bcam = { current: null as ElementRef<typeof CameraControls> | null };
export type BView = 'mesin' | 'turbo' | 'dyno' | 'sel' | 'belakang';
const VIEWS: Record<BView, [number[], number[]]> = {
  mesin: [[5.5, 3.6, 7.5], [0.2, 1.5, 0]],
  turbo: [[2.4, 3.6, 3.2], [0.74, 2.3, 0]],
  dyno: [[4.8, 2.0, 3.6], [2.2, 1.1, 0]],
  sel: [[9, 6.5, 10], [0, 1.5, 0]],
  belakang: [[-6.6, 3.6, 3.8], [-1.6, 2.0, 0]],
};
export const goB = (v: BView) => {
  const [p, t] = VIEWS[v];
  bcam.current?.setLookAt(p[0], p[1], p[2], t[0], t[1], t[2], true);
};

const ASSEMBLED = () => ({ explode: 0 as const, xray: false });
const STACK: [number, number, number] = [0.74, 2.62, 0];
const HOT_WHITE = new THREE.Color('#ffe2b0');

/** Adapter: the detailed model reads a genset-shaped state; here it follows the dyno engine. */
function EngineModel() {
  const src = useMemo<GensetSource>(() => ({ s: createGenset(), shaft: { angle: 0 }, plant: false, bare: true, view: ASSEMBLED }), []);
  const g = useRef<THREE.Group>(null);
  const hole = useRef<THREE.Group>(null);
  useFrame(() => {
    const e = engine;
    const s = src.s;
    s.rpm = e.rpm;
    s.firing = e.running && !e.wrecked;
    s.starter = false;
    s.genKw = e.power * 0.88;
    s.exhaust = e.egt;
    s.coolant = e.coolant;
    hole.current!.visible = e.wrecked;
    // past ~780 °C the turbine housing goes from red to yellow-white
    if (e.egt > 780) M.hot.emissive.lerp(HOT_WHITE, Math.min(1, (e.egt - 780) / 200));
  });
  return (
    <GensetCtx.Provider value={src}>
      <group ref={g}>
        <Genset />
        <ModParts root={g} build={() => engine.build} boost={() => (engine.running ? engine.boost : 0)} />
        {/* the hole a rod leaves in the block */}
        <group ref={hole} visible={false} position={[-0.9, 1.15, 0.57]}>
          <mesh>
            <circleGeometry args={[0.18, 12]} />
            <meshBasicMaterial color="#050505" />
          </mesh>
        </group>
      </group>
    </GensetCtx.Provider>
  );
}

/** Water-brake dynamometer on the flywheel: cardan shaft, absorber with water lines, torque arm and load cell. */
function Dyno() {
  const shaft = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    shaft.current!.rotation.x += Math.min((engine.rpm * Math.PI * 2) / 60, 12) * dt;
    arm.current!.rotation.x = -Math.min(0.08, engine.torque / 300000);
  });
  return (
    <group position={[2.9, 0, 0]}>
      <Box s={[1.8, 0.5, 1.6]} m={M.cast} position={[0.2, 0.25, 0]} />
      <group ref={shaft} position={[-0.85, 1.05, 0]}>
        <Cyl r={0.09} l={1.1} axis="x" m={M.steel} />
        {[-0.55, 0.55].map((x) => (
          <Cyl key={x} r={0.2} l={0.08} axis="x" m={M.black} position={[x, 0, 0]} />
        ))}
      </group>
      <group ref={arm}>
        <Cyl r={0.75} l={1.0} axis="x" seg={32} m={M.blue} position={[0.25, 1.05, 0]} />
        <Cyl r={0.8} l={0.08} axis="x" seg={32} m={M.steel} position={[-0.27, 1.05, 0]} />
        <Cyl r={0.8} l={0.08} axis="x" seg={32} m={M.steel} position={[0.77, 1.05, 0]} />
        <Box s={[0.12, 0.12, 1.1]} m={M.steel} position={[0.25, 1.05, 1.15]} />
      </group>
      <Box s={[0.15, 0.6, 0.15]} m={M.yellow} position={[0.25, 0.75, 1.65]} />
      {[-0.4, 0.4].map((z) => (
        <Cyl key={z} r={0.07} l={1.2} m={M.blue} position={[0.6, 0.6, z]} />
      ))}
      <Text position={[0.25, 1.95, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.14} color="#e9eef2">
        DINAMOMETER REM AIR 4 MW
      </Text>
    </group>
  );
}

/** Exhaust plume: black soot when rich, white steam with a blown gasket, blue oil smoke from a dead turbo. */
function Plume() {
  const N = 900;
  const { geo, mat, parts } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    for (const [k, n] of [['position', 3], ['size', 1], ['alpha', 1], ['color', 3]] as const) geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(N * n), n));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { scale: { value: 800 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; uniform float scale; varying float vA; varying vec3 vC;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = min(size*scale/-mv.z, 220.0); gl_Position = projectionMatrix*mv; vA=alpha; vC=color; }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.05,d)*vA; if(a<0.004) discard; gl_FragColor=vec4(vC,a); }`,
    });
    const parts = Array.from({ length: N }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), age: 9, life: 1, c: new THREE.Color(), a: 0.3 }));
    return { geo, mat, parts };
  }, []);
  const acc = useRef(0);
  const next = useRef(0);
  useFrame(({ camera, size }, raw) => {
    const dt = Math.min(raw, 0.05);
    mat.uniforms.scale.value = (size.height / 2) * (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5];
    const e = engine;
    if (e.running || e.steam > 0) {
      const dense = 0.15 + 1.6 * e.smoke + e.steam;
      acc.current += dt * (10 + 30 * (e.rpm / 1500) + 50 * dense);
      while (acc.current > 1) {
        acc.current--;
        const q = parts[next.current];
        next.current = (next.current + 1) % N;
        // stock outlet, or the tops of the two straight-through pipes
        if (e.build.straight) q.p.set(STACK[0] + (Math.random() - 0.5) * 0.1, STRAIGHT_TOP, (Math.random() < 0.5 ? 0.3 : -0.3) + (Math.random() - 0.5) * 0.1);
        else q.p.set(STACK[0] + (Math.random() - 0.5) * 0.2, STACK[1] + 0.3, (Math.random() - 0.5) * 0.3);
        q.v.set((Math.random() - 0.5) * 0.5, 3 + 5 * (e.rpm / 2000), (Math.random() - 0.5) * 0.5);
        q.age = 0;
        q.life = 2.2 + Math.random();
        if (e.steam > 0.5 && Math.random() < 0.6) q.c.set('#f2f4f6');
        else if (e.dmg.turbo >= 1 && Math.random() < 0.5) q.c.set('#7d8ea6');
        else q.c.setScalar(Math.max(0.05, 0.55 - 0.5 * e.smoke));
        q.a = Math.min(0.85, 0.08 + 0.75 * Math.max(e.smoke, e.steam * 0.8));
      }
    }
    const pos = geo.attributes.position.array as Float32Array;
    const sz = geo.attributes.size.array as Float32Array;
    const al = geo.attributes.alpha.array as Float32Array;
    const co = geo.attributes.color.array as Float32Array;
    parts.forEach((q, i) => {
      if (q.age < q.life) {
        q.age += dt;
        q.v.multiplyScalar(1 - dt * 0.8);
        q.v.y += dt * 0.4;
        // the extraction hood pulls it up and away
        if (q.p.y > 4.2) q.v.x += dt * 3;
        q.p.addScaledVector(q.v, dt);
      }
      const t = Math.min(1, q.age / q.life);
      pos.set([q.p.x, q.p.y, q.p.z], i * 3);
      sz[i] = 0.4 + t * 3;
      al[i] = t >= 1 ? 0 : (1 - t) * q.a;
      co.set([q.c.r, q.c.g, q.c.b], i * 3);
    });
    for (const k of ['position', 'size', 'alpha', 'color']) geo.attributes[k].needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

/** When a rod lets go: the rod and a piston burst out of the block side, oil sprays, a flash and a bang. */
function RodFailure() {
  const g = useRef<THREE.Group>(null);
  const rod = useRef<THREE.Group>(null);
  const flash = useRef<THREE.PointLight>(null);
  const t0 = useRef(-1);
  const N = 200;
  const { geo, oil } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    return { geo, oil: Array.from({ length: N }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3() })) };
  }, []);
  useEffect(
    () =>
      onEngineEvent((e) => {
        if (e !== 'rod') return;
        t0.current = performance.now() / 1000;
        oil.forEach((o) => {
          o.p.set(-0.9, 1.15, 0.6);
          o.v.set((Math.random() - 0.5) * 3, Math.random() * 3, 2 + Math.random() * 4);
        });
        arcSound();
        thunder(0);
        playPlantEvent('badSync');
      }),
    [oil],
  );
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const show = engine.wrecked;
    g.current!.visible = show;
    if (!show) {
      t0.current = -1;
      return;
    }
    const t = t0.current < 0 ? 5 : performance.now() / 1000 - t0.current;
    // the rod flies out, tumbles and lands on the floor
    const r = rod.current!;
    const fly = Math.min(t, 0.9);
    r.position.set(-0.9 + fly * 0.3, Math.max(0.1, 1.15 + fly * 3 - 6 * fly * fly), 0.6 + fly * 2.6);
    r.rotation.set(fly * 9, fly * 5, fly * 3);
    flash.current!.intensity = t < 0.25 ? 400 * (1 - t / 0.25) : 0;
    const a = geo.attributes.position.array as Float32Array;
    oil.forEach((o, k) => {
      if (t < 3 && o.p.y > 0.02) {
        o.v.y -= 9.8 * dt;
        o.p.addScaledVector(o.v, dt);
        if (o.p.y < 0.02) o.p.y = 0.02;
      }
      a.set([o.p.x, o.p.y, o.p.z], k * 3);
    });
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <group ref={g} visible={false}>
      <group ref={rod}>
        <Box s={[0.06, 0.6, 0.05]} m={M.steel} />
        <Cyl r={0.08} l={0.15} m={M.silver} position={[0, 0.35, 0]} />
      </group>
      <points geometry={geo} frustumCulled={false}>
        <pointsMaterial color="#1a1206" size={0.05} sizeAttenuation transparent opacity={0.9} />
      </points>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.6, 0.012, 1.6]}>
        <circleGeometry args={[1.1, 32]} />
        <meshStandardMaterial color="#120d06" transparent opacity={0.7} roughness={0.1} depthWrite={false} />
      </mesh>
      <pointLight ref={flash} position={[-0.9, 1.3, 1.2]} intensity={0} distance={12} color="#ffcf8a" />
    </group>
  );
}

/** Concrete test cell with a control window, extraction hood and lights. */
function Cell() {
  const warn = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const e = engine;
    const bad = e.egt > LIMITS.egtWarn || e.rpm > LIMITS.valveFloat || e.coolant > LIMITS.coolantWarn || e.wrecked;
    warn.current!.emissiveIntensity = bad && Math.floor(clock.elapsedTime * 3) % 2 ? 3 : 0;
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[16, 12]} />
        <meshStandardMaterial color="#6b6f72" roughness={0.85} />
      </mesh>
      <Box s={[16, 6, 0.3]} m={M.greyLight} position={[0, 3, -5]} />
      <Box s={[0.3, 6, 10]} m={M.greyLight} position={[-8, 3, 0]} />
      <Box s={[0.3, 6, 10]} m={M.greyLight} position={[8, 3, 0]} />
      {/* control room window in the back wall */}
      <mesh position={[3.5, 3.2, -4.84]}>
        <planeGeometry args={[4, 1.6]} />
        <meshStandardMaterial color="#9fc6dc" metalness={0.9} roughness={0.05} emissive="#20384a" emissiveIntensity={0.6} />
      </mesh>
      <Text position={[3.5, 4.3, -4.83]} fontSize={0.22} color="#2b3036">
        RUANG OPERATOR DYNO
      </Text>
      {/* extraction hood over the outlet */}
      <Cyl r={1.1} r2={0.35} l={0.8} m={M.steel} position={[STACK[0], 4.6, 0]} open />
      <Cyl r={0.35} l={1.2} m={M.steel} position={[STACK[0], 5.6, 0]} />
      <mesh position={[-6.5, 4.8, -4.8]}>
        <sphereGeometry args={[0.15, 16, 12]} />
        <meshStandardMaterial ref={warn} color="#ff3b30" emissive="#ff3b30" emissiveIntensity={0} />
      </mesh>
      {[-4, 0, 4].map((x) => (
        <group key={x} position={[x, 5.8, 0]}>
          <Box s={[1.4, 0.06, 0.2]} m={M.white} />
          <pointLight position={[0, -0.3, 0]} intensity={18} distance={12} color="#f4f6ff" />
        </group>
      ))}
      <Text position={[-7.83, 3.6, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.45} color="#2b3036">
        BENGKEL & DYNO
      </Text>
    </group>
  );
}

function Driver() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    soundSource.override = () => {
      const e = engine;
      return {
        rpm: e.rpm,
        firing: e.running && !e.wrecked,
        starter: false,
        coolant: 80,
        lf: Math.min(1.3, e.power / 2050),
        count: 1,
        alarm: e.egt > LIMITS.egtWarn || e.rpm > LIMITS.valveFloat,
        boost: e.boost,
        turboSize: TURBOS[e.build.turbo].scale,
        straight: e.build.straight,
        knock: Math.max(0, Math.min(1, e.build.timing / 6)) * Math.min(1, e.power / 1500),
      };
    };
    const off = onEngineEvent((ev) => {
      if (ev === 'start') playPlantEvent('start');
      if (ev === 'gasket' || ev === 'turboDead') playPlantEvent('trip');
    });
    const id = setInterval(() => useBengkel.getState().bump(), 120);
    return () => {
      soundSource.override = null;
      off();
      clearInterval(id);
    };
  }, []);
  // keyboard throttle: hold W, ↑ or Space
  useEffect(() => {
    const keys = ['w', 'W', 'ArrowUp', ' '];
    const down = (e: KeyboardEvent) => {
      if (keys.includes(e.key) && !(e.target instanceof HTMLInputElement)) {
        input.held = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keys.includes(e.key) && (input.held = false);
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
    };
  }, []);
  useFrame((_, dt) => {
    advanceEngine(dt);
    updateSound(camera.position.distanceTo(new THREE.Vector3(0, 1.5, 0)), false);
  });
  return null;
}

function Intro() {
  useEffect(() => {
    bcam.current?.setLookAt(12, 7, 12, 0, 1.5, 0, false);
    const id = setTimeout(() => goB('mesin'), 150);
    return () => clearTimeout(id);
  }, []);
  return null;
}

export function BengkelScene() {
  return (
    <Canvas shadows dpr={[1, MAX_DPR]} camera={{ position: [12, 7, 12], fov: 40, near: 0.1, far: 120 }}>
      <color attach="background" args={['#1a1f24']} />
      <hemisphereLight args={['#c9d6e6', '#3a352e', 0.6]} />
      <directionalLight position={[6, 12, 8]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
      <Environment resolution={256} environmentIntensity={0.5}>
        <Lightformer form="rect" intensity={2} position={[0, 8, -6]} scale={[14, 5, 1]} color="#dfe8f5" />
        <Lightformer form="circle" intensity={3} position={[6, 9, 6]} scale={3} />
      </Environment>
      <Cell />
      <EngineModel />
      <Dyno />
      <Plume />
      <RodFailure />
      <CameraControls ref={(c) => (bcam.current = c)} makeDefault minDistance={1.5} maxDistance={20} maxPolarAngle={Math.PI * 0.49} smoothTime={0.6} />
      <Intro />
      <Driver />
      <EffectComposer>
        <Bloom mipmapBlur luminanceThreshold={1} intensity={0.9} />
      </EffectComposer>
    </Canvas>
  );
}
