// X-ray view: the five things moving through a running genset, drawn as flowing lines in genset coordinates.
import { loadFrac } from '../sim/genset';
import { Flow } from './Site';
import { useGenset } from './source';

type P = [number, number, number];

export const FLOW_COLORS = {
  fuel: '#ff9a2e',
  air: '#9be7ff',
  exhaust: '#ff5a4a',
  coolant: '#3f8cff',
  power: '#ffd23a',
};

export function Flows() {
  const { s: sim, view } = useGenset();
  const xray = () => view().xray;
  const running = () => xray() && sim.rpm > 100;
  const rpmSpeed = () => 0.4 + (sim.rpm / 1500) * 1.6;
  const loadSpeed = () => 0.4 + (sim.rpm / 1500) * (0.8 + loadFrac(sim) * 1.6);
  const fuel: P[] = [[-1.2, 0.5, 2.3], [-0.9, 0.55, 1.4], [-0.75, 0.95, 0.7], [-0.6, 1.35, 0.5], [-1.6, 2.0, 0.45], [0.5, 2.0, 0.45]];
  const fuelB: P[] = [[-0.6, 1.35, 0.5], [-0.6, 1.9, -0.2], [-1.6, 2.0, -0.45], [0.5, 2.0, -0.45]];
  const air = (s: 1 | -1): P[] => [[1.3, 2.36, s * 0.34], [0.85, 2.2, s * 0.38], [0.74, 2.12, s * 0.64], [0.2, 2.0, s * 0.15], [-0.7, 1.95, 0], [-1.5, 1.85, s * 0.2], [-1.6, 1.9, s * 0.35]];
  const exhaust = (s: 1 | -1): P[] => [[-1.7, 1.95, s * 0.62], [0.4, 1.95, s * 0.62], [0.74, 2.12, s * 0.42], [0.74, 2.3, s * 0.3], [0.74, 2.3, 0], [0.74, 2.7, 0]];
  const coolant: P[] = [[-2.1, 1.5, 0.38], [-1.5, 1.2, 0.6], [-0.3, 1.25, 0.62], [-1.2, 1.9, 0.1], [-1.85, 2.05, 0.15], [-2.3, 2.3, 0.5], [-2.6, 2.3, 0.3], [-2.6, 0.7, -0.3], [-2.38, 0.6, -0.7], [-2.1, 1.0, -0.5], [-2.1, 1.5, -0.38]];
  const power: P[] = [[1.68, 1.05, 0], [1.68, 1.6, 0.2], [1.62, 1.98, 0.44], [2.2, 1.95, 0.55], [2.7, 1.6, 0.6]];
  return (
    <group>
      <Flow pts={fuel} color={FLOW_COLORS.fuel} on={running} speed={loadSpeed} width={4} />
      <Flow pts={fuelB} color={FLOW_COLORS.fuel} on={running} speed={loadSpeed} width={4} />
      <Flow pts={air(1)} color={FLOW_COLORS.air} on={running} speed={loadSpeed} width={4} />
      <Flow pts={air(-1)} color={FLOW_COLORS.air} on={running} speed={loadSpeed} width={4} />
      <Flow pts={exhaust(1)} color={FLOW_COLORS.exhaust} on={running} speed={loadSpeed} width={4} />
      <Flow pts={exhaust(-1)} color={FLOW_COLORS.exhaust} on={running} speed={loadSpeed} width={4} />
      <Flow pts={coolant} color={FLOW_COLORS.coolant} on={running} speed={rpmSpeed} width={4} />
      <Flow pts={power} color={FLOW_COLORS.power} on={() => xray() && sim.volts > 300} speed={rpmSpeed} width={5} />
    </group>
  );
}
