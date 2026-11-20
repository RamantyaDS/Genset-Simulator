// Detailed on-road trucks built from code: a cab-over day cab (raked windscreen, door glass, grille, bumper lamps,
// steps, mirrors, roof lamps), a C-channel ladder chassis with axles, leaf springs, tandem bogie, tanks and exhaust,
// 11R22.5 wheels (single and dual) and bodies (flatbed, fuel tanker, tractor-unit fifth wheel). Every part is merged
// into one mesh per material, so a whole truck is a dozen draws. The same file lives in each simulator that has a
// truck. Axes: x across (+x is the left/passenger side, the trucks are right-hand drive), y up, z forward; the origin
// is on the ground under the front axle.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V3 = [number, number, number];

const std = (color: string, metalness: number, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });

/** Shared truck materials. Lamps that change (headlights, brake lights) are passed in by the caller. */
export const TM = {
  chassis: std('#161718', 0.45, 0.55),
  plastic: std('#232527', 0.1, 0.7),
  plasticDS: std('#1e2022', 0.1, 0.75, { side: THREE.DoubleSide }),
  bumper: std('#3a3d40', 0.45, 0.45),
  grille: std('#0f1012', 0.5, 0.45),
  chrome: std('#e8ebed', 0.75, 0.22),
  steel: std('#a2a8ad', 0.7, 0.35),
  alu: std('#c9ced2', 0.7, 0.3),
  rubber: std('#1b1b1c', 0, 0.93),
  rim: std('#d8dadb', 0.55, 0.33),
  hole: new THREE.MeshBasicMaterial({ color: '#070707' }),
  glass: std('#ffffff', 0.45, 0.1, { map: skyGradient(), envMapIntensity: 1.5 }),
  mirror: std('#b9c4cc', 0.7, 0.12),
  seal: std('#0b0b0c', 0, 0.85),
  checker: std('#868b90', 0.65, 0.42),
  amber: std('#ffae1a', 0, 0.3, { emissive: '#ff8a00', emissiveIntensity: 0.35 }),
  reverse: std('#f4f4f2', 0, 0.2, { emissive: '#ffffff', emissiveIntensity: 0.05 }),
  head: std('#fbfbf6', 0.2, 0.08, { emissive: '#fff3d6', emissiveIntensity: 0.25 }),
  tail: std('#6a0b0b', 0.1, 0.25, { emissive: '#ff1a0a', emissiveIntensity: 0.25 }),
  wood: std('#6e4b2c', 0, 0.85),
  wood2: std('#5a3d23', 0, 0.88),
  yellow: std('#f2c21c', 0.3, 0.45),
  red: std('#b51a1a', 0.2, 0.5),
  blue: std('#1f4e8c', 0.2, 0.5),
};

/** A soft sky-over-ground reflection painted on the glass, so it reads as glass even where the environment is dim. */
function skyGradient() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#8fa6b8');
  gr.addColorStop(0.45, '#4c6273');
  gr.addColorStop(0.55, '#26333d');
  gr.addColorStop(1, '#1a232b');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const paints = new Map<string, THREE.MeshStandardMaterial>();
/** Glossy truck paint in a colour (cached). */
export function paint(color: string) {
  let m = paints.get(color);
  if (!m) paints.set(color, (m = std(color, 0.35, 0.3)));
  return m;
}

const texCache = new Map<string, THREE.MeshStandardMaterial>();
/** A material with a canvas texture painted once (cached by key). */
function decal(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, extra: THREE.MeshStandardMaterialParameters = {}) {
  let m = texCache.get(key);
  if (!m) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    m = std('#ffffff', 0.2, 0.4, { map: t, ...extra });
    texCache.set(key, m);
  }
  return m;
}

/** Collects parts, then merges them into one geometry per material. */
export class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private mtx = new THREE.Matrix4();
  add(mat: THREE.Material, geo: THREE.BufferGeometry, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(this.mtx.compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s)));
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
    geo.dispose();
  }
  box(mat: THREE.Material, s: V3, p: V3, r?: V3, round = 0) {
    this.add(mat, round > 0 ? new RoundedBoxGeometry(s[0], s[1], s[2], 2, round) : new THREE.BoxGeometry(...s), p, r);
  }
  /** Cylinder along an axis; r2 is the radius at the +axis end (a cone). */
  cyl(mat: THREE.Material, r: number, l: number, p: V3, axis: 'x' | 'y' | 'z' = 'y', seg = 16, r2?: number) {
    const rot: V3 = axis === 'x' ? [0, 0, -Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    this.add(mat, new THREE.CylinderGeometry(r2 ?? r, r, l, seg), p, rot);
  }
  /** A tube through points. */
  tube(mat: THREE.Material, pts: V3[], r: number, seg = 24) {
    const c = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
    this.add(mat, new THREE.TubeGeometry(c, seg, r, 8, false));
  }
  meshes() {
    return [...this.parts].map(([mat, geos]) => ({ mat, geo: mergeGeometries(geos)! }));
  }
}

/** Renders what a builder puts in a Kit. `deps` rebuilds it. */
export function KitMesh({ build, deps = [], shadows = true }: { build: (k: Kit) => void; deps?: unknown[]; shadows?: boolean }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const parts = useMemo(() => {
    const k = new Kit();
    build(k);
    return k.meshes();
  }, deps);
  useEffect(() => () => parts.forEach((p) => p.geo.dispose()), [parts]);
  return (
    <>
      {parts.map(({ mat, geo }, i) => (
        <mesh key={i} geometry={geo} material={mat} castShadow={shadows} receiveShadow />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- wheels

export const TYRE = { R: 0.53, W: 0.28, rimR: 0.29 };

function lathe(profile: [number, number][], seg: number) {
  const g = new THREE.LatheGeometry(
    profile.map(([r, a]) => new THREE.Vector2(r, a)),
    seg,
  );
  g.rotateZ(-Math.PI / 2); // lathe axis y → x; the profile's axial +a ends up at +x
  return g;
}

const wheelCache = new Map<string, { mat: THREE.Material; geo: THREE.BufferGeometry }[]>();

/** One road wheel (or a dual pair) with the outer face toward +x (side 1) or −x (side −1); hub at the origin. */
function wheelParts(dual: boolean, side: 1 | -1, spec = TYRE) {
  const key = `${dual}${side}${spec.R}`;
  const hit = wheelCache.get(key);
  if (hit) return hit;
  const { R, W, rimR } = spec;
  const w = W / 2;
  const dip = 0.013;
  // radial carcass: bead → sidewall → shoulder → crown with four ribs → and back
  const crown: [number, number][] = [];
  const grooves = [-0.5, 0, 0.5];
  crown.push([R - 0.02, -w * 0.9], [R, -w * 0.78]);
  for (const gz of grooves) crown.push([R, (gz - 0.07) * w], [R - dip, (gz - 0.04) * w], [R - dip, (gz + 0.04) * w], [R, (gz + 0.07) * w]);
  crown.push([R, w * 0.78], [R - 0.02, w * 0.9]);
  const tyreProfile: [number, number][] = [
    [rimR + 0.012, -w * 0.72],
    [rimR + 0.04, -w * 0.88],
    [rimR + (R - rimR) * 0.4, -w * 1.0],
    [R - 0.07, -w * 0.99],
    ...crown,
    [R - 0.07, w * 0.99],
    [rimR + (R - rimR) * 0.4, w * 1.0],
    [rimR + 0.04, w * 0.88],
    [rimR + 0.012, w * 0.72],
  ];
  // steel disc wheel: flange, well, dished disc with hand holes, hub
  const rimProfile: [number, number][] = [
    [rimR + 0.03, w * 0.8],
    [rimR + 0.005, w * 0.74],
    [rimR - 0.012, w * 0.5],
    [rimR - 0.03, w * 0.36],
    [rimR * 0.86, w * 0.3],
    [rimR * 0.62, w * 0.42],
    [rimR * 0.44, w * 0.46],
    [rimR * 0.36, w * 0.6],
    [0.001, w * 0.62],
  ];
  const k = new Kit();
  const ofs = dual ? [0.155, -0.155] : [0];
  for (const o of ofs) k.add(TM.rubber, lathe(tyreProfile, 48), [o, 0, 0]);
  const o = ofs[0];
  k.add(TM.rim, lathe(rimProfile, 40), [o, 0, 0]);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    k.cyl(TM.chrome, 0.022, 0.05, [o + w * 0.62 + 0.02, Math.cos(a) * rimR * 0.4, Math.sin(a) * rimR * 0.4], 'x', 6);
  }
  k.cyl(TM.chrome, 0.075, 0.07, [o + w * 0.62 + 0.04, 0, 0], 'x', 16, 0.05);
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * Math.PI * 2;
    const hole = new THREE.CircleGeometry(0.04, 14);
    k.add(TM.hole, hole, [o + w * 0.37 + 0.008, Math.cos(a) * rimR * 0.71, Math.sin(a) * rimR * 0.71], [0, Math.PI / 2, 0]);
  }
  let parts = k.meshes();
  if (side < 0) for (const p of parts) p.geo.rotateY(Math.PI);
  parts = parts.map((p) => ({ mat: p.mat, geo: p.geo }));
  wheelCache.set(key, parts);
  return parts;
}

/** A wheel to put under a spinning/steering group (hub at the origin, axle along x). */
export function TruckWheel({ dual = false, side = 1, rim }: { dual?: boolean; side?: 1 | -1; rim?: THREE.Material }) {
  const parts = wheelParts(dual, side);
  return (
    <>
      {parts.map(({ mat, geo }, i) => (
        <mesh key={i} geometry={geo} material={mat === TM.rim && rim ? rim : mat} castShadow={mat === TM.rubber} receiveShadow />
      ))}
    </>
  );
}

/** Static wheels baked into a kit (parked or sliding trucks whose wheels need not turn). */
export function kitWheel(k: Kit, p: V3, dual: boolean, side: 1 | -1) {
  for (const { mat, geo } of wheelParts(dual, side)) k.add(mat, geo.clone(), p);
}

// ---------------------------------------------------------------- cab

export interface Livery {
  cab: string;
  stripe: string;
  text: string;
  textColor: string;
}
export const TRAKNUS: Livery = { cab: '#f1f2f0', stripe: '#e05a1a', text: 'TRAKNUS', textColor: '#1d3a5c' };

const CAB_W = 2.45;
const CAB_X = CAB_W / 2;

/** Side-view polygon (z, y) → flat shape on a side of the cab. side 1 faces +x. */
function sideShape(pts: [number, number][], side: 1 | -1) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(side > 0 ? -z : z, y)));
  const g = new THREE.ShapeGeometry(s);
  g.rotateY((side * Math.PI) / 2);
  return g;
}

/** Day cab over the front axle: front face at z ≈ 1.18, back at −0.95, roof 3.16 m. */
export function buildCab(k: Kit, lv: Livery, lamps: { head?: THREE.Material } = {}) {
  const head = lamps.head ?? TM.head;
  const body = paint(lv.cab);
  // shell: side profile extruded across the width with rounded edges
  const b = 0.1;
  const prof: [number, number][] = [
    [-0.85, 1.22],
    [1.06, 1.22],
    [1.08, 1.62],
    [1.04, 2.22],
    [0.84, 2.94],
    [0.7, 3.06],
    [-0.85, 3.06],
  ];
  const shell = new THREE.ExtrudeGeometry(new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y))), {
    depth: CAB_W - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 4,
    curveSegments: 4,
  });
  shell.rotateY(-Math.PI / 2);
  shell.translate(CAB_X - b, 0, 0);
  k.add(body, shell);

  // windscreen: black seal, glass, wipers, sun visor
  const nz = 0.963;
  const ny = 0.27;
  const tilt = -Math.atan2(ny, nz);
  const mid: V3 = [0, 2.61, 1.038];
  const at = (d: number, u = 0): V3 => [0, mid[1] + ny * d + 0.963 * u, mid[2] + nz * d - 0.27 * u];
  k.add(TM.seal, new THREE.PlaneGeometry(2.26, 0.86), at(0.003), [tilt, 0, 0]);
  k.add(TM.glass, new THREE.PlaneGeometry(2.14, 0.74), at(0.008), [tilt, 0, 0]);
  for (const x of [-0.5, 0.45]) {
    const p = at(0.025, -0.32);
    k.box(TM.plastic, [0.78, 0.022, 0.02], [x, p[1], p[2]], [tilt, 0, 0.1]);
  }
  k.box(paint(lv.cab), [2.3, 0.05, 0.3], [0, 3.1, 0.86], [0.22, 0, 0], 0.02);

  // grille with chrome slats and a badge, lower vent
  const gt = -0.067;
  k.box(TM.grille, [1.7, 0.56, 0.04], [0, 1.86, 1.175], [gt, 0, 0], 0.015);
  for (let i = 0; i < 4; i++) {
    const y = 1.66 + i * 0.13;
    k.box(TM.chrome, [1.76, 0.032, 0.03], [0, y, 1.2 - (y - 1.82) * 0.067], [gt, 0, 0]);
  }
  k.box(paint(lv.stripe), [0.44, 0.1, 0.03], [0, 2.08, 1.205], [gt, 0, 0], 0.01);
  for (const y of [1.4, 1.48]) k.box(TM.grille, [1.2, 0.04, 0.03], [0, y, 1.19]);

  // bumper with headlamp clusters, indicators, fog lamps, plate and spoiler
  k.box(TM.bumper, [2.5, 0.5, 0.32], [0, 0.88, 1.12], undefined, 0.05);
  k.box(TM.seal, [2.3, 0.08, 0.28], [0, 0.6, 1.1]);
  for (const s of [1, -1]) {
    k.box(TM.seal, [0.58, 0.2, 0.02], [s * 0.8, 0.99, 1.283]);
    k.box(head, [0.34, 0.14, 0.02], [s * 0.88, 0.99, 1.29], undefined, 0.006);
    k.box(TM.amber, [0.12, 0.14, 0.02], [s * 0.6, 0.99, 1.29], undefined, 0.006);
    k.cyl(TM.seal, 0.085, 0.02, [s * 0.86, 0.73, 1.283], 'z', 16);
    k.cyl(head, 0.065, 0.02, [s * 0.86, 0.73, 1.29], 'z', 16);
  }
  k.add(plate('B 9417 TN'), new THREE.PlaneGeometry(0.52, 0.13), [0, 0.76, 1.285]);
  k.cyl(TM.steel, 0.035, 0.12, [0.3, 0.62, 1.25], 'z', 8);

  for (const s of [1, -1] as const) {
    const x = s * (CAB_X + 0.004);
    // door seams, handle, livery decal
    k.box(TM.seal, [0.006, 1.7, 0.012], [x, 2.12, -0.3]);
    k.box(TM.seal, [0.006, 0.95, 0.012], [x, 1.66, 1.0]);
    k.box(TM.seal, [0.006, 0.012, 1.3], [x, 1.28, 0.35]);
    k.box(TM.plastic, [0.03, 0.05, 0.22], [s * (CAB_X + 0.015), 2.02, -0.14], undefined, 0.01);
    k.add(doorDecal(lv), new THREE.PlaneGeometry(1.15, 0.58), [x + s * 0.001, 1.62, 0.36], [0, (s * Math.PI) / 2, 0]);
    // door glass and the rear quarter glass, with their seals
    const dw: [number, number][] = [
      [-0.2, 2.17],
      [0.98, 2.17],
      [0.72, 2.95],
      [-0.2, 2.95],
    ];
    const grow = (pts: [number, number][], d: number) =>
      pts.map(([z, y], i) => [z + (i === 0 || i === 3 ? -d : d), y + (i < 2 ? -d : d)] as [number, number]);
    k.add(TM.seal, sideShape(grow(dw, 0.04), s), [x, 0, 0]);
    k.add(TM.glass, sideShape(dw, s), [x + s * 0.003, 0, 0]);
    const qw: [number, number][] = [
      [-0.76, 2.27],
      [-0.42, 2.27],
      [-0.42, 2.94],
      [-0.76, 2.94],
    ];
    k.add(TM.seal, sideShape(grow(qw, 0.035), s), [x, 0, 0]);
    k.add(TM.glass, sideShape(qw, s), [x + s * 0.003, 0, 0]);
    // grab handles beside the door
    k.cyl(TM.chrome, 0.018, 1.0, [s * (CAB_X + 0.06), 2.2, -0.43]);
    for (const y of [1.72, 2.68]) k.cyl(TM.chrome, 0.015, 0.06, [s * (CAB_X + 0.03), y, -0.43], 'x', 6);
    // mirrors on tubular arms: main and wide-angle, glass toward the back
    k.cyl(TM.plastic, 0.02, 0.32, [s * (CAB_X + 0.15), 2.82, 0.82], 'x', 8);
    k.cyl(TM.plastic, 0.02, 0.32, [s * (CAB_X + 0.15), 2.02, 0.82], 'x', 8);
    k.cyl(TM.plastic, 0.02, 0.84, [s * (CAB_X + 0.3), 2.42, 0.86], 'y', 8);
    k.box(TM.plastic, [0.08, 0.46, 0.22], [s * (CAB_X + 0.34), 2.6, 0.88], undefined, 0.03);
    k.box(TM.mirror, [0.065, 0.42, 0.01], [s * (CAB_X + 0.34), 2.6, 0.765]);
    k.box(TM.plastic, [0.08, 0.24, 0.2], [s * (CAB_X + 0.34), 2.18, 0.88], undefined, 0.03);
    k.box(TM.mirror, [0.065, 0.2, 0.01], [s * (CAB_X + 0.34), 2.18, 0.775]);
    // entry steps behind the bumper, ahead of the front wheel
    k.box(TM.seal, [0.02, 0.62, 0.32], [s * 0.96, 0.72, 0.76]);
    for (const y of [0.48, 0.88]) k.box(TM.checker, [0.3, 0.035, 0.3], [s * 1.1, y, 0.76]);
    // front mudguard around the back of the wheel, and its flap
    const guard = new THREE.CylinderGeometry(0.64, 0.64, 0.38, 20, 1, true, 2.74, 2.27);
    k.add(TM.plasticDS, guard, [s * 1.03, 0.52, 0], [0, 0, -Math.PI / 2]);
    k.box(TM.seal, [0.38, 0.42, 0.015], [s * 1.03, 0.38, -0.66]);
    // cab side marker lamp
    k.box(TM.amber, [0.02, 0.05, 0.12], [s * (CAB_X + 0.01), 1.3, 0.85]);
  }
  // kerb-view mirror on the passenger (left) corner, roof marker lamps, air horns, hatch, aerial
  k.cyl(TM.plastic, 0.015, 0.3, [0.95, 3.2, 0.82], 'z', 6);
  k.box(TM.plastic, [0.24, 0.16, 0.06], [0.95, 3.14, 1.0], [0.4, 0, 0], 0.02);
  for (let i = 0; i < 5; i++) k.box(TM.amber, [0.1, 0.04, 0.06], [-0.6 + i * 0.3, 3.19, 0.58]);
  for (const [x, l] of [
    [-0.45, 0.38],
    [-0.62, 0.5],
  ])
    k.cyl(TM.chrome, 0.04, l, [x, 3.25, -0.05], 'z', 12, 0.085);
  k.box(TM.plastic, [0.72, 0.05, 0.72], [0.1, 3.19, -0.25], undefined, 0.02);
  k.cyl(TM.seal, 0.008, 0.7, [0.9, 3.5, -0.7], 'y', 4);
  // cab back: small rear window
  k.box(TM.glass, [1.0, 0.42, 0.01], [0, 2.62, -0.957]);
}

function plate(text: string) {
  return decal(`plate${text}`, 256, 64, (g) => {
    g.fillStyle = '#f2c21c';
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = '#111';
    g.lineWidth = 4;
    g.strokeRect(3, 3, 250, 58);
    g.fillStyle = '#111';
    g.font = 'bold 40px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
  });
}

function doorDecal(lv: Livery) {
  return decal(`door${lv.cab}${lv.text}`, 512, 256, (g) => {
    g.fillStyle = lv.cab;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = lv.stripe;
    g.fillRect(0, 168, 512, 22);
    g.fillRect(0, 198, 512, 8);
    g.fillStyle = lv.textColor;
    g.font = 'bold 74px sans-serif';
    g.textAlign = 'center';
    g.fillText(lv.text, 256, 120);
  }, { metalness: 0.35, roughness: 0.3 });
}

// ---------------------------------------------------------------- chassis

export interface ChassisOpts {
  /** Rear end of the frame rails (negative z). */
  end: number;
  /** Rear axle positions (one or two). */
  rear: number[];
  /** Fuel tank (left side) and battery box (right side) z. */
  fuelZ?: number;
  batteryZ?: number;
  /** Side under-run guards between the axles. */
  sideGuard?: boolean;
}

/** Frame rails, axles and suspension, driveline, tanks, exhaust stack and air intake. */
export function buildChassis(k: Kit, o: ChassisOpts) {
  const start = 1.0;
  const len = start - o.end;
  const mz = (start + o.end) / 2;
  for (const s of [1, -1]) {
    // C-channel rails, flanges turned inward
    k.box(TM.chassis, [0.012, 0.28, len], [s * 0.47, 0.95, mz]);
    k.box(TM.chassis, [0.075, 0.012, len], [s * 0.44, 1.084, mz]);
    k.box(TM.chassis, [0.075, 0.012, len], [s * 0.44, 0.816, mz]);
  }
  for (let z = start - 0.25; z > o.end + 0.1; z -= 1.15) k.box(TM.chassis, [0.88, 0.16, 0.07], [0, 0.95, z]);
  k.box(TM.chassis, [0.94, 0.26, 0.08], [0, 0.95, o.end + 0.04]);
  // engine, gearbox and propeller shaft
  k.box(TM.chassis, [0.78, 0.55, 1.15], [0, 0.88, -0.2], undefined, 0.06);
  k.box(TM.plastic, [0.5, 0.18, 0.7], [0, 0.55, -0.15]);
  k.box(TM.chassis, [0.46, 0.4, 0.8], [0, 0.86, -1.15], undefined, 0.05);
  const r0 = o.rear[0];
  k.cyl(TM.steel, 0.055, -1.55 - (r0 + 0.3), [0, 0.64, (-1.55 + r0 + 0.3) / 2], 'z', 10);
  if (o.rear.length > 1) k.cyl(TM.steel, 0.05, o.rear[0] - o.rear[1] - 0.6, [0, 0.6, (o.rear[0] + o.rear[1]) / 2], 'z', 10);

  // front axle: I-beam, hubs, leaf springs with hangers, shocks, steering drag link
  k.box(TM.chassis, [1.7, 0.13, 0.11], [0, 0.48, 0]);
  for (const s of [1, -1]) {
    k.cyl(TM.chassis, 0.13, 0.14, [s * 0.86, 0.52, 0], 'x', 16);
    for (let i = 0; i < 5; i++) k.box(TM.chassis, [0.08, 0.026, 1.45 - i * 0.24], [s * 0.47, 0.57 + i * 0.028, 0]);
    for (const z of [0.72, -0.72]) k.box(TM.chassis, [0.05, 0.18, 0.06], [s * 0.47, 0.72, z]);
    k.cyl(TM.steel, 0.035, 0.42, [s * 0.6, 0.72, 0.22], 'y', 8);
  }
  k.cyl(TM.chassis, 0.025, 0.75, [-0.72, 0.62, 0.35], 'z', 6);

  // rear axles: housings with banjo diff and pinion nose, hub drums
  for (const z of o.rear) {
    k.cyl(TM.chassis, 0.1, 1.6, [0, 0.52, z], 'x', 14);
    k.add(TM.chassis, new THREE.SphereGeometry(0.27, 16, 12), [0, 0.52, z], [0, 0, 0], [0.85, 1, 1]);
    k.cyl(TM.chassis, 0.13, 0.32, [0, 0.56, z + 0.32], 'z', 12, 0.08);
    for (const s of [1, -1]) k.cyl(TM.chassis, 0.22, 0.16, [s * 0.74, 0.52, z], 'x', 16);
  }
  if (o.rear.length > 1) {
    // tandem bogie: inverted leaf springs on a trunnion between the axles, torque rods
    const m = (o.rear[0] + o.rear[1]) / 2;
    const span = o.rear[0] - o.rear[1];
    for (const s of [1, -1]) {
      for (let i = 0; i < 5; i++) k.box(TM.chassis, [0.09, 0.028, span + 0.2 - i * 0.22], [s * 0.56, 0.66 + i * 0.03, m]);
      k.cyl(TM.chassis, 0.13, 0.36, [s * 0.58, 0.78, m], 'x', 16);
      k.box(TM.chassis, [0.08, 0.3, 0.3], [s * 0.5, 0.84, m]);
      for (const z of o.rear) k.box(TM.steel, [0.05, 0.05, 0.6], [s * 0.3, 0.82, (z + m) / 2], [0.35 * Math.sign(z - m), 0, 0]);
    }
  } else {
    for (const s of [1, -1]) for (let i = 0; i < 6; i++) k.box(TM.chassis, [0.08, 0.026, 1.5 - i * 0.22], [s * 0.47, 0.64 + i * 0.028, o.rear[0]]);
  }

  // fuel tank (left): D-section aluminium with straps, brackets and cap
  const fz = o.fuelZ ?? -2.3;
  k.box(TM.alu, [0.56, 0.62, 1.3], [0.86, 0.86, fz], undefined, 0.13);
  for (const dz of [-0.42, 0.42]) {
    k.box(TM.chassis, [0.575, 0.635, 0.05], [0.86, 0.86, fz + dz], undefined, 0.13);
    k.box(TM.chassis, [0.36, 0.08, 0.08], [0.62, 1.05, fz + dz]);
  }
  k.cyl(TM.chrome, 0.07, 0.05, [0.9, 1.19, fz + 0.15], 'y', 14);
  // battery box, air tanks and AdBlue tank (right)
  const bz = o.batteryZ ?? -2.1;
  k.box(TM.plastic, [0.5, 0.46, 0.62], [-0.82, 0.83, bz], undefined, 0.03);
  k.box(TM.bumper, [0.52, 0.04, 0.64], [-0.82, 1.07, bz], undefined, 0.015);
  k.box(TM.chassis, [0.34, 0.06, 0.06], [-0.62, 1.02, bz]);
  k.box(TM.plastic, [0.36, 0.42, 0.42], [-0.8, 0.83, bz + 0.62], undefined, 0.05);
  k.cyl(TM.blue, 0.05, 0.05, [-0.8, 1.06, bz + 0.62], 'y', 10);
  for (const [y, dz] of [
    [0.72, -0.85],
    [0.98, -0.85],
  ])
    k.cyl(TM.chassis, 0.12, 0.85, [-0.66, y, bz + dz], 'z', 14);

  // exhaust: muffler and chromed vertical stack with heat shield behind the cab (right), intake snorkel (left)
  k.cyl(TM.chassis, 0.16, 0.85, [-0.95, 1.5, -1.2], 'y', 16);
  k.cyl(TM.chrome, 0.065, 1.7, [-0.95, 2.75, -1.2], 'y', 12);
  k.cyl(TM.steel, 0.1, 0.9, [-0.95, 2.45, -1.2], 'y', 14);
  k.cyl(TM.chrome, 0.07, 0.14, [-0.95, 3.64, -1.24], 'y', 12);
  for (const y of [2.15, 2.9]) k.box(TM.chassis, [0.04, 0.04, 0.26], [-0.95, y, -1.06]);
  k.cyl(TM.plastic, 0.13, 1.75, [0.98, 2.2, -1.17], 'y', 14);
  k.box(TM.plastic, [0.34, 0.2, 0.34], [0.98, 3.12, -1.17], undefined, 0.06);
  k.box(TM.plastic, [0.24, 0.24, 0.42], [0.76, 1.32, -1.12], undefined, 0.05);

  if (o.sideGuard) {
    const z0 = -0.75;
    const z1 = o.rear[0] + 0.7;
    const gl = z0 - z1;
    for (const s of [1, -1]) {
      for (const y of [0.56, 0.84]) k.box(TM.alu, [0.035, 0.1, gl], [s * 1.2, y, (z0 + z1) / 2]);
      for (const z of [z0 - 0.15, z1 + 0.15]) {
        k.box(TM.chassis, [0.04, 0.4, 0.05], [s * 1.18, 0.75, z]);
        k.box(TM.chassis, [0.7, 0.05, 0.05], [s * 0.84, 0.93, z]);
      }
    }
  }
}

// ---------------------------------------------------------------- rear end (lamps, bumper, flaps)

export function buildRear(k: Kit, end: number, lastAxle: number, y: number, tail: THREE.Material) {
  // lamp bar on brackets: tail/brake, indicator and reversing lamp per side
  k.box(TM.chassis, [2.2, 0.06, 0.06], [0, y + 0.08, end - 0.02]);
  for (const s of [1, -1]) {
    k.box(TM.seal, [0.52, 0.17, 0.07], [s * 0.88, y, end - 0.04], undefined, 0.015);
    k.box(tail, [0.2, 0.12, 0.02], [s * 0.98, y, end - 0.082], undefined, 0.005);
    k.box(TM.amber, [0.12, 0.12, 0.02], [s * 0.78, y, end - 0.082], undefined, 0.005);
    k.box(TM.reverse, [0.1, 0.12, 0.02], [s * 0.66, y, end - 0.082], undefined, 0.005);
    // mudflaps behind the last axle
    k.box(TM.seal, [0.62, 0.55, 0.015], [s * 0.93, 0.48, lastAxle - 0.72]);
    k.box(TM.chassis, [0.62, 0.05, 0.05], [s * 0.93, 0.78, lastAxle - 0.72]);
    k.box(TM.chassis, [0.05, 0.05, 0.4], [s * 0.6, 0.8, lastAxle - 0.52]);
  }
  // under-run bar with red/white chevrons and the number plate
  k.box(TM.chassis, [2.2, 0.16, 0.12], [0, 0.56, end + 0.12]);
  for (const s of [1, -1]) k.box(TM.chassis, [0.08, 0.36, 0.08], [s * 0.45, 0.72, end + 0.12]);
  k.add(chevron(), new THREE.PlaneGeometry(2.16, 0.13), [0, 0.56, end + 0.058], [0, Math.PI, 0]);
  k.add(plate('B 9417 TN'), new THREE.PlaneGeometry(0.5, 0.13), [0, 0.84, end + 0.05], [0, Math.PI, 0]);
}

function chevron() {
  return decal('chevron', 512, 32, (g) => {
    g.fillStyle = '#f4f4f2';
    g.fillRect(0, 0, 512, 32);
    g.fillStyle = '#c4161c';
    for (let x = -32; x < 544; x += 48) {
      g.beginPath();
      g.moveTo(x, 32);
      g.lineTo(x + 24, 32);
      g.lineTo(x + 56, 0);
      g.lineTo(x + 32, 0);
      g.fill();
    }
  });
}

// ---------------------------------------------------------------- bodies

/** Steel flatbed with a timber floor, stake pockets, strap winches, headboard and side lamps. */
export function buildFlatbed(k: Kit, o: { z0: number; z1: number; firstAxle: number; lastAxle: number; lv: Livery; tail?: THREE.Material }) {
  const { z0, z1 } = o;
  const len = z0 - z1;
  const mz = (z0 + z1) / 2;
  const frame = paint(o.lv.stripe);
  for (const s of [1, -1]) k.box(TM.chassis, [0.1, 0.14, len], [s * 0.44, 1.16, mz]);
  for (let z = z0 - 0.2; z > z1 + 0.1; z -= 0.55) k.box(TM.chassis, [2.4, 0.08, 0.07], [0, 1.27, z]);
  const n = 10;
  for (let i = 0; i < n; i++) k.box(i % 2 ? TM.wood2 : TM.wood, [2.26 / n - 0.008, 0.05, len - 0.1], [-1.13 + (i + 0.5) * (2.26 / n), 1.355, mz]);
  for (const s of [1, -1]) {
    k.box(frame, [0.12, 0.22, len], [s * 1.19, 1.27, mz]);
    for (let z = z0 - 0.4; z > z1 + 0.2; z -= 0.9) k.box(TM.chassis, [0.06, 0.16, 0.1], [s * 1.275, 1.27, z]);
    for (let z = z0 - 0.9; z > z1 + 0.6; z -= 1.3) {
      k.cyl(TM.steel, 0.05, 0.2, [s * 1.1, 1.1, z], 'z', 10);
      k.box(TM.chassis, [0.1, 0.1, 0.08], [s * 1.1, 1.1, z + 0.14]);
    }
    for (const t of [0.2, 0.5, 0.8]) k.box(TM.amber, [0.02, 0.05, 0.09], [s * 1.255, 1.18, z0 - len * t]);
  }
  for (const z of [z0, z1]) k.box(frame, [2.5, 0.22, 0.14], [0, 1.27, z]);
  // headboard (cab guard): posts, rails and bars
  const hz = z0 - 0.1;
  for (const s of [1, -1]) k.box(frame, [0.1, 1.55, 0.1], [s * 1.15, 1.38 + 0.775, hz]);
  k.box(frame, [2.4, 0.1, 0.1], [0, 2.9, hz]);
  for (const y of [1.8, 2.35]) k.box(TM.chassis, [2.2, 0.05, 0.05], [0, y, hz]);
  for (let i = 0; i < 9; i++) k.box(TM.chassis, [0.035, 1.45, 0.035], [-0.96 + i * 0.24, 2.12, hz]);
  // spare wheel carried flat under the rear overhang
  for (const { mat, geo } of wheelParts(false, 1)) k.add(mat, geo.clone(), [0, 0.62, z1 + 0.8], [0, 0, Math.PI / 2]);
  k.box(TM.chassis, [1.0, 0.05, 0.08], [0, 0.48, z1 + 0.8]);
  // steel toolbox under the deck (right)
  k.box(TM.steel, [0.5, 0.45, 0.9], [-0.88, 0.92, o.firstAxle + 1.02], undefined, 0.02);
  k.box(TM.chassis, [0.05, 0.05, 0.12], [-1.135, 1.0, o.firstAxle + 1.02]);
  buildRear(k, z1, o.lastAxle, 1.02, o.tail ?? TM.tail);
}

/** A curved strip on the elliptical tank side (x = a·√(1 − (y/b)²)), drawn with a canvas decal. */
function tankStrip(side: 1 | -1, len: number, h: number, a: number, b: number, cy: number, cz: number) {
  const g = new THREE.PlaneGeometry(len, h, 1, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i);
    const v = p.getY(i);
    const x = side * (a * Math.sqrt(Math.max(0, 1 - (v / b) ** 2)) + 0.006);
    p.setXYZ(i, x, cy + v, cz - side * u);
  }
  g.computeVertexNormals();
  return g;
}

/** Elliptical aluminium fuel tanker body: dished ends, bands, manholes, walkway and rails, ladder, hose troughs. */
export function buildTanker(k: Kit, o: { z0: number; z1: number; lastAxle: number; text: string; tail?: THREE.Material }) {
  const { z0, z1 } = o;
  const len = z0 - z1 - 0.5;
  const mz = (z0 + z1) / 2;
  const a = 1.2;
  const b = 0.88;
  const cy = 2.08;
  for (const s of [1, -1]) k.box(TM.chassis, [0.12, 0.16, z0 - z1], [s * 0.44, 1.17, mz]);
  for (let z = z0 - 0.4; z > z1; z -= 1.1) k.box(TM.chassis, [1.6, 0.2, 0.12], [0, 1.3, z]);
  k.add(TM.alu, new THREE.CylinderGeometry(1, 1, len, 40, 1, true), [0, cy, mz], [Math.PI / 2, 0, 0], [a, 1, b]);
  for (const e of [1, -1]) {
    const cap = new THREE.SphereGeometry(1, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    k.add(TM.alu, cap, [0, cy, mz + (e * len) / 2], [(e * Math.PI) / 2, 0, 0], [a, 0.28, b]);
  }
  for (let i = 0; i <= 4; i++) {
    const z = mz - len / 2 + 0.15 + (i * (len - 0.3)) / 4;
    k.add(TM.steel, new THREE.CylinderGeometry(1, 1, 0.07, 40, 1, true), [0, cy, z], [Math.PI / 2, 0, 0], [a + 0.012, 1, b + 0.012]);
  }
  // top: three manholes, walkway, folding rails
  const top = cy + b;
  k.box(TM.checker, [0.55, 0.03, len - 0.3], [0, top + 0.03, mz]);
  for (let i = 0; i < 3; i++) {
    const z = mz + len / 3 - (i * len) / 3;
    k.cyl(TM.alu, 0.3, 0.14, [0, top + 0.09, z], 'y', 24);
    k.cyl(TM.steel, 0.2, 0.05, [0, top + 0.18, z], 'y', 20);
    k.cyl(TM.steel, 0.04, 0.12, [0.2, top + 0.22, z + 0.12], 'y', 8);
  }
  for (const s of [1, -1]) {
    for (let i = 0; i < 5; i++) k.cyl(TM.yellow, 0.02, 0.55, [s * 0.38, top + 0.3, mz - len / 2 + 0.3 + (i * (len - 0.6)) / 4], 'y', 6);
    k.cyl(TM.yellow, 0.022, len - 0.5, [s * 0.38, top + 0.57, mz], 'z', 6);
  }
  // rear ladder, valve cabinet, side hose troughs
  for (const s of [1, -1]) k.cyl(TM.steel, 0.022, 2.0, [s * 0.24, 1.9, z1 + 0.18], 'y', 6);
  for (let y = 1.15; y < 2.8; y += 0.3) k.cyl(TM.steel, 0.016, 0.5, [0, y, z1 + 0.18], 'x', 6);
  k.box(TM.alu, [1.5, 0.55, 0.45], [0, 1.0, z1 + 0.45], undefined, 0.03);
  for (const s of [1, -1]) {
    k.box(TM.alu, [0.18, 0.16, len * 0.7], [s * 1.08, 1.32, mz], undefined, 0.03);
    k.add(tankText(o.text), tankStrip(s as 1 | -1, Math.min(4.2, len * 0.8), 0.5, a, b, cy - 0.05, mz), [0, 0, 0]);
    k.add(hazard(), new THREE.PlaneGeometry(0.4, 0.3), [s * 1.18, 1.32, z1 + 1.0], [0, (s * Math.PI) / 2, 0]);
  }
  k.add(hazard(), new THREE.PlaneGeometry(0.4, 0.3), [0, 1.42, z1 + 0.22], [0, Math.PI, 0]);
  k.box(TM.red, [0.04, 0.6, 0.04], [0.55, 0.45, z1 + 0.6]);
  buildRear(k, z1, o.lastAxle, 1.0, o.tail ?? TM.tail);
}

function tankText(text: string) {
  return decal(
    `tank${text}`,
    1024,
    128,
    (g) => {
      g.clearRect(0, 0, 1024, 128);
      g.fillStyle = '#c4161c';
      g.fillRect(0, 96, 1024, 14);
      let size = 84;
      g.font = `bold ${size}px sans-serif`;
      while (g.measureText(text).width > 980 && size > 30) g.font = `bold ${(size -= 4)}px sans-serif`;
      g.textAlign = 'center';
      g.fillText(text, 512, 80);
    },
    { transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 },
  );
}

function hazard() {
  return decal('hazard', 128, 96, (g) => {
    g.fillStyle = '#f07a12';
    g.fillRect(0, 0, 128, 96);
    g.strokeStyle = '#111';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 122, 90);
    g.beginPath();
    g.moveTo(3, 48);
    g.lineTo(125, 48);
    g.stroke();
    g.fillStyle = '#111';
    g.font = 'bold 36px sans-serif';
    g.textAlign = 'center';
    g.fillText('30', 64, 40);
    g.fillText('1202', 64, 86);
  });
}

/** Tractor-unit rear: fifth wheel, quarter fenders over the tandem, catwalk and the trailer air/electric lines. */
export function buildFifthWheel(k: Kit, o: { end: number; rear: number[]; tail?: THREE.Material }) {
  const m = (o.rear[0] + o.rear[o.rear.length - 1]) / 2;
  const fz = m + 0.1;
  k.box(TM.chassis, [1.4, 0.08, 1.3], [0, 1.13, fz]);
  for (const s of [1, -1]) k.box(TM.chassis, [0.22, 0.14, 0.5], [s * 0.45, 1.22, fz]);
  k.cyl(TM.chassis, 0.6, 0.09, [0, 1.32, fz], 'y', 28);
  k.box(TM.seal, [0.16, 0.02, 0.55], [0, 1.37, fz - 0.3]);
  k.box(TM.steel, [0.08, 0.06, 0.4], [0.62, 1.3, fz]);
  for (const s of [1, -1]) {
    k.box(TM.plastic, [0.66, 0.025, 2.3], [s * 0.93, 1.16, m], undefined, 0.01);
    for (const e of [1, -1]) k.box(TM.plastic, [0.66, 0.3, 0.025], [s * 0.93, 1.02, m + e * 1.15]);
    k.box(TM.chassis, [0.4, 0.05, 0.05], [s * 0.66, 1.1, m]);
  }
  k.box(TM.checker, [1.0, 0.035, 0.7], [0, 1.15, -1.5]);
  // suzi coils from the cab back to the fifth wheel (red emergency, yellow service, black electric)
  const coil = (x: number, mat: THREE.Material) => {
    const pts: V3[] = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const z = -1.0 - t * 1.1;
      const a = t * Math.PI * 2 * 9;
      pts.push([x + Math.cos(a) * 0.07, 2.1 - Math.sin(t * Math.PI) * 0.25 + Math.sin(a) * 0.07 - t * 0.5, z]);
    }
    k.tube(mat, pts, 0.012, 240);
  };
  coil(-0.2, TM.red);
  coil(0.0, TM.yellow);
  coil(0.2, TM.seal);
  buildRear(k, o.end, o.rear[o.rear.length - 1], 0.98, o.tail ?? TM.tail);
}

/** Wheels for a truck whose wheels do not need to turn: front single, rear duals. */
export function kitWheels(k: Kit, rear: number[]) {
  for (const s of [1, -1] as const) {
    kitWheel(k, [s * 1.03, 0.52, 0], false, s);
    for (const z of rear) kitWheel(k, [s * 0.93, 0.52, z], true, s);
  }
}

const SOLAR: Livery = { cab: '#f1f2f0', stripe: '#c4161c', text: 'SOLAR', textColor: '#c4161c' };

/** A complete 6×4 fuel tanker (8 kL) with static wheels. */
export function buildFuelTanker(k: Kit) {
  const rear = [-4.6, -5.9];
  buildCab(k, SOLAR);
  buildChassis(k, { end: -6.95, rear, fuelZ: -2.25, batteryZ: -2.1, sideGuard: true });
  buildTanker(k, { z0: -1.55, z1: -7.0, lastAxle: rear[1], text: 'SOLAR  ·  MUDAH TERBAKAR' });
  kitWheels(k, rear);
}
