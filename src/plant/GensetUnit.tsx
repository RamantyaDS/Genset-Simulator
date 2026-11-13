// The detailed single-set model, driven by one plant unit. Each set gets its own genset-shaped state (so the shaker,
// fan, turbos and the DSE face on its panel follow that unit), its own shaft angle, and its own copy of the hot-metal
// material so one set glowing does not light up the other four.
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BLOCK, Genset } from '../scene/Genset';
import { Flows } from '../scene/Flows';
import { M } from '../scene/parts';
import { GensetCtx, type GensetSource } from '../scene/source';
import { useUI } from '../store';
import { create as createGenset, TANK_L as DAY_TANK, type AlarmId } from '../sim/genset';
import { available, busLive, TANK_L } from '../sim/plant';
import { inspectUnit } from './camera';
import { plant, usePlant } from './store';

const ASSEMBLED = { explode: 0 as const, xray: false };
// Plant trip reasons shown as the matching DSE alarm on the set's own module.
const ALARM_ID: Record<string, AlarmId> = {
  'Emergency stop': 'estop',
  'Suhu air pendingin tinggi': 'highTemp',
  'Tekanan oli rendah': 'lowOil',
  'kW overload': 'overloadTrip',
  'Solar habis': 'fuelEmpty',
};

/** Each set's genset-shaped state, for the DSE panel and the heat shimmer outside this component. */
export const unitState = Array.from({ length: plant.units.length }, () => createGenset());

const DULL = new THREE.Color('#5a0800');
const BRIGHT = new THREE.Color('#e8360c');

export function GensetUnit({ index }: { index: number }) {
  const group = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  const hot = useMemo(() => M.hot.clone(), []);
  const src = useMemo<GensetSource>(
    () => ({
      s: unitState[index],
      shaft: { angle: 0 },
      plant: true,
      block: BLOCK.clone(),
      // Only the selected set comes apart or goes see-through; a click on another set selects it first.
      view: () => (usePlant.getState().selected === index ? useUI.getState() : ASSEMBLED),
      pick: () => {
        const ui = usePlant.getState();
        if (ui.selected === index && ui.inspect) return false;
        inspectUnit(index);
        return true;
      },
    }),
    [index],
  );

  useLayoutEffect(() => {
    group.current!.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.material === M.hot) m.material = hot;
      else if (m.material === BLOCK) m.material = src.block!;
    });
  }, [hot, src]);

  useFrame((_, dt) => {
    const u = plant.units[index];
    const s = src.s;
    s.mode = u.auto ? 'auto' : 'manual';
    s.phase = u.phase;
    s.rpm = u.rpm;
    s.starter = u.phase === 'crank';
    s.firing = s.fuelOn = u.rpm > 300 && u.phase !== 'stopping';
    s.volts = u.volts;
    s.genKw = s.demandKw = u.kw;
    s.kwh = u.kwh;
    s.eStop = u.eStop;
    s.faultRadiator = u.faultRadiator;
    s.faultOil = u.faultOil;
    s.coolant = u.coolant;
    s.exhaust = u.exhaust;
    s.hours = u.hours;
    s.gcb = u.breaker;
    s.mcb = false;
    // The module's "mains" is the plant bus here.
    s.mainsOk = busLive(plant);
    s.mainsFailedFor = 99;
    s.mainsBackFor = 0;
    // Safety delay and warm-up as the module counts them, so the status line reads like a real set coming on line.
    s.sinceStart = u.phase === 'running' ? s.sinceStart + dt : 0;
    s.warm = available(u) ? s.warm + dt : 0;
    if (u.breaker) s.sinceStart = s.warm = 999;
    s.fuel = (plant.fuel / TANK_L) * DAY_TANK;
    s.oil = u.oil;
    s.events.length = 0;
    const id = u.alarm ? ALARM_ID[u.alarm] : undefined;
    s.alarms = id ? [id] : [];

    const x = Math.max(0, Math.min(1, (u.exhaust - 480) / 240));
    hot.emissive.copy(DULL).lerp(BRIGHT, x);
    hot.emissiveIntensity = x > 0 ? 0.35 + Math.pow(x, 1.6) * 2.4 : 0;

    // beacon on the panel: green on the bus, amber running off the bus, red with an alarm
    lamp.current!.color.set(u.alarm ? '#ff3b30' : u.breaker ? '#39d353' : u.rpm > 0 ? '#ffb020' : '#2a2d30');
    lamp.current!.emissive.copy(lamp.current!.color);
    lamp.current!.emissiveIntensity = u.alarm || u.rpm > 0 ? 2.5 : 0;
  });

  return (
    <GensetCtx.Provider value={src}>
      <group ref={group}>
        <Genset />
        <Flows />
        <mesh position={[2.72, 2.24, 0.62]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial ref={lamp} color="#2a2d30" />
        </mesh>
      </group>
    </GensetCtx.Provider>
  );
}
