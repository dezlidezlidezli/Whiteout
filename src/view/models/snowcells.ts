// Deep-snow cells and plough banks for instancing on a 0.5 m grid, plus the lake ice sheet.
import * as THREE from 'three';
import { Builder, box, ico, rng, torus } from './geo';
import { mats } from './materials';
import { PALETTE as P } from './palette';
import { groundPath, sweep } from './paths';
import type { CrowdMeshDef } from './index';

const cells = new Map<string, CrowdMeshDef>();
const SIDE = 0xc4d3ea, SIDE_LOW = 0xaabdd9;

/** One lumpy deep-snow cell: 0.5 m footprint, ~0.45 m tall, origin at ground centre.
 *  A soft pillow on a block whose sides are cool blue, so a field of them reads as a deep, continuous drift
 *  (clearly different from thin ground snow). 4 shape variants: seed % 4. */
export function deepSnowCell(seed = 0): CrowdMeshDef {
  const v = Math.abs(Math.floor(seed)) % 4;
  const key = `deep:${v}`;
  let d = cells.get(key);
  if (d) return d;
  const r = rng(v * 17 + 3);
  const b = new Builder();
  const top = [0.38, 0.46, 0.52, 0.42][v]; // overall heights vary 0.35-0.55 m
  // narrow core block (hidden by the pillows of the neighbours, so no grid seams), cool blue sides
  const h = top - 0.12;
  b.add(box(0.44, h, 0.44), SIDE, { p: [0, h / 2, 0], top: P.snow, topY: 0.7, bottom: SIDE_LOW });
  // one broad pillow that bulges past the footprint plus 1-2 off-centre lumps -> irregular overlapping silhouettes
  const ox = (r() - 0.5) * 0.14, oz = (r() - 0.5) * 0.14;
  b.add(ico(0.4, 1), P.snow, { p: [ox, h - 0.05, oz], s: [0.95 + r() * 0.2, 0.36 + r() * 0.12, 0.95 + r() * 0.2], r: [0, r() * 3, 0], jitter: 0.04, seed: v + 1, bottom: SIDE, topY: -0.2 });
  for (let k = 0; k < 1 + (v % 2); k++) {
    const a = r() * 6.28, d2 = 0.14 + r() * 0.1;
    b.add(ico(0.18 + r() * 0.06, 1), P.snow, { p: [Math.cos(a) * d2, h + 0.02 + r() * 0.05, Math.sin(a) * d2], s: [1.1, 0.55, 1], jitter: 0.025, seed: v * 5 + k, bottom: SIDE, topY: -0.2 });
  }
  if (v === 3) b.add(box(0.05, 0.04, 0.05), 0xffffff, { p: [0.1, h + 0.12, -0.05], r: [0.4, 0.6, 0] }); // sparkle crystal
  const geometry = b.build();
  geometry.name = key;
  d = { geometry, material: mats().std, height: top };
  cells.set(key, d);
  return d;
}

/** Curled-off bank beside a ploughed swath: ~0.55 m long along Z, lip curls towards +X (mirror with rotation.y = PI for the left side). */
export function snowBankCell(seed = 0): CrowdMeshDef {
  const v = Math.abs(Math.floor(seed)) % 3;
  const key = `bank:${v}`;
  let d = cells.get(key);
  if (d) return d;
  const r = rng(v * 13 + 5);
  const b = new Builder();
  b.add(ico(0.32, 1), P.snow, { p: [0, 0.12, 0], s: [0.85, 0.75 + v * 0.06, 1.0], jitter: 0.035, seed: v + 2, bottom: SIDE, topY: 0.1 });
  b.add(torus(0.17, 0.08, 4, 7, Math.PI * 0.9), P.snow, { p: [0.12, 0.28 + v * 0.02, 0], r: [Math.PI / 2, 0, 0], s: [1, 1.25, 1], bottom: SIDE, topY: 0.2 });
  for (let i = 0; i < 2; i++) b.add(ico(0.07, 0), P.snow, { p: [0.3 + r() * 0.1, 0.04, (r() - 0.5) * 0.4], s: [1, 0.6, 1] });
  const geometry = b.build();
  geometry.name = key;
  d = { geometry, material: mats().std, height: 0.45 };
  cells.set(key, d);
  return d;
}

export interface IceSheetOpts { seed?: number; edge?: boolean }
/** Large lake-ice floor (one draw call): glossy pale teal, darker cracks, skate scratches, snow-dusted edges. Origin at centre, top ~0.03 m. */
export function iceSheet(width: number, depth: number, o: IceSheetOpts = {}): THREE.Object3D {
  const r = rng((o.seed ?? 0) + 101);
  const b = new Builder();
  const sx = Math.max(2, Math.round(width / 1.5)), sz = Math.max(2, Math.round(depth / 1.5));
  const pg = new THREE.PlaneGeometry(width, depth, sx, sz).rotateX(-Math.PI / 2);
  // per-vertex teal variation (darker, deeper patches in the middle)
  const pos = pg.attributes.position, col: number[] = [];
  const c = new THREE.Color(), deep = new THREE.Color(0x7cc4d8), pale = new THREE.Color(0xc4ecf4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const e = Math.min(1, Math.min(width / 2 - Math.abs(x), depth / 2 - Math.abs(z)) / 6);
    const n = 0.5 + 0.5 * Math.sin(x * 0.37 + z * 0.21) * Math.cos(z * 0.29 - x * 0.13);
    c.copy(pale).lerp(deep, e * (0.4 + 0.5 * n));
    col.push(c.r, c.g, c.b);
  }
  pg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  b.add(pg, 0xffffff, { p: [0, 0.03, 0], vcol: true });
  // cracks: branching dark lines
  const nCr = Math.round((width * depth) / 18);
  for (let k = 0; k < nCr; k++) {
    let x = (r() - 0.5) * width * 0.85, z = (r() - 0.5) * depth * 0.85, a = r() * Math.PI;
    for (let s = 0; s < 4; s++) {
      const len = 0.5 + r() * 1.3;
      b.add(box(0.025, 0.004, len), 0x4f8aa8, { p: [x + Math.sin(a) * len / 2, 0.034, z + Math.cos(a) * len / 2], r: [0, a, 0] });
      x += Math.sin(a) * len; z += Math.cos(a) * len; a += (r() - 0.5) * 1.2;
    }
  }
  // skate scratches: faint pale arcs
  const nSc = Math.round((width * depth) / 25);
  for (let k = 0; k < nSc; k++) {
    const cx = (r() - 0.5) * width * 0.8, cz = (r() - 0.5) * depth * 0.8, R = 1.5 + r() * 3, a0 = r() * 6.28;
    for (let s = 0; s < 6; s++) {
      const a = a0 + s * 0.22;
      b.add(box(0.015, 0.003, R * 0.23), 0xeef9fc, { p: [cx + Math.cos(a) * R, 0.035, cz + Math.sin(a) * R], r: [0, -a, 0] });
    }
  }
  // frosty dust patches
  for (let k = 0; k < Math.round((width * depth) / 30); k++) {
    const x = (r() - 0.5) * width * 0.8, z = (r() - 0.5) * depth * 0.8;
    b.add(new THREE.CylinderGeometry(0.4 + r() * 0.5, 0.4 + r() * 0.5, 0.006, 9), 0xcdeaf3, { p: [x, 0.033, z], s: [1.6, 1, 1], r: [0, r() * 3, 0], jitter: 0.08, seed: k });
  }
  if (o.edge ?? true) {
    const hw = width / 2, hd = depth / 2;
    const loop = groundPath([[-hw, hd], [-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], 1.5);
    const cols = [P.snowShade, P.snow, P.snow];
    b.add(sweep(loop, [[-0.4, 0.035], [0.2, 0.18], [0.9, 0.0]], { color: (k) => new THREE.Color(cols[k]) }), 0xffffff, { vcol: true, jitter: 0.04, seed: 3 });
  }
  const m = new THREE.Mesh(b.build(), mats().iceFloor);
  m.name = 'body';
  m.receiveShadow = true;
  const g = new THREE.Group();
  g.name = 'iceSheet';
  g.add(m);
  g.userData = { size: [width, depth], topY: 0.035, surface: 'ice', walkable: true, decor: true };
  return g;
}
