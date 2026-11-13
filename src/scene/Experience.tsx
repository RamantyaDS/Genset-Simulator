import { CameraControls, Environment, Lightformer } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useEffect } from 'react';
import { showAlarms } from '../dse';
import { playEvent, updateSound } from '../sound';
import { advance, onSimEvent, sim, useUI } from '../store';
import { controls, goTo } from './camera';
import { Canopy, CANOPY, SILENT_STACK } from './Canopy';
import { PANEL_POS } from './ControlPanel';
import { Flows } from './Flows';
import { FocusHighlight } from './FocusHighlight';
import { Genset } from './Genset';
import { LoadBank } from './LoadBank';
import { Site } from './Site';
import { Smoke } from './Smoke';
import { TourHighlight } from './TourHighlight';

const SILENT_SHIFT = -1.5; // where the set sits inside the container

/** Runs the simulation, the sound and the UI refresh from the render loop. */
function Driver() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const off = onSimEvent((e) => {
      playEvent(e);
      if (e === 'alarm') showAlarms(sim);
    });
    return off;
  }, []);
  useFrame((_, dt) => {
    advance(dt);
    const { view, xray } = useUI.getState();
    updateSound(camera.position.length(), view === 'silent' && !xray);
  });
  useEffect(() => {
    const id = setInterval(() => useUI.getState().bump(), 150);
    return () => clearInterval(id);
  }, []);
  return null;
}

function Intro() {
  useEffect(() => {
    controls.current?.setLookAt(18, 10, 20, 0, 1, 0, false);
    const id = setTimeout(() => goTo('genset'), 200);
    return () => clearTimeout(id);
  }, []);
  return null;
}

export function Experience() {
  const view = useUI((s) => s.view);
  const silent = view === 'silent';
  const shift: [number, number, number] = silent ? [SILENT_SHIFT, CANOPY.base, 0] : [0, 0, 0];
  const panelWorld: [number, number, number] = [PANEL_POS[0] + shift[0], PANEL_POS[1] + shift[1], PANEL_POS[2]];
  return (
    <Canvas shadows dpr={[1, 2]} onPointerMissed={() => useUI.getState().set({ focus: null })} camera={{ position: [18, 10, 20], fov: 40, near: 0.1, far: 200 }}>
      <color attach="background" args={['#1b2532']} />
      <fog attach="fog" args={['#1b2532', 30, 90]} />
      <hemisphereLight args={['#9fb6d6', '#2a2620', 0.5]} />
      <directionalLight
        position={[12, 16, 10]}
        intensity={1.6}
        color="#ffe2c0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0004}
      />
      <spotLight position={[-6, 9, 7]} angle={0.5} penumbra={0.7} intensity={180} color="#fff4e0" />
      <Environment resolution={256} environmentIntensity={0.55}>
        <Lightformer form="rect" intensity={2} position={[0, 8, -10]} scale={[20, 6, 1]} color="#b9cdf0" />
        <Lightformer form="rect" intensity={1.4} position={[-10, 4, 4]} rotation-y={Math.PI / 2} scale={[10, 4, 1]} color="#ffd9a8" />
        <Lightformer form="circle" intensity={3} position={[6, 9, 6]} scale={3} />
      </Environment>

      <Site panelAt={panelWorld} />
      <group position={shift}>
        <Genset />
        <Flows />
        <TourHighlight />
      </group>
      {silent && <Canopy />}
      <LoadBank at={[panelWorld[0] + (silent ? 4.2 : 2.6), 0, 2.6]} panelAt={silent ? [panelWorld[0], 0.3, 1.3] : panelWorld} />
      <FocusHighlight />
      <Smoke key={view} at={silent ? SILENT_STACK : [0.74, 2.62, 0]} />

      <CameraControls ref={controls} makeDefault minDistance={1.5} maxDistance={45} maxPolarAngle={Math.PI * 0.48} smoothTime={0.7} />
      <Intro />
      <Driver />
      <EffectComposer>
        <Bloom mipmapBlur luminanceThreshold={1} intensity={0.8} />
      </EffectComposer>
    </Canvas>
  );
}
