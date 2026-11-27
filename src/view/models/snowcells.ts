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

export interface IceSheetOpts {
  seed?: number;
  /** snow-dusted rim (default true) */
  edge?: boolean;
  /** organic rounded outline (wobbly ellipse inscribed in width x depth) */
  round?: boolean;
  /** custom outline (local XZ, centred) — overrides `round` */
  polygon?: [number, number][];
}

function insidePoly(poly: [number, number][], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function distToPoly(poly: [number, number][], x: number, z: number): number {
  let m = 1e9;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    m = Math.min(m, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return m;
}

/** Lake-ice floor (one draw call): pale teal edges deepening to dark ice in the centre, branching cracks,
 *  skate swirls, frost dust and a snow-dusted rim. Rectangle, organic `round` outline or a custom `polygon`.
 *  Origin at the centre, top ~0.035 m. userData.outline holds the outline for collision/zones. */
export function iceSheet(width: number, depth: number, o: IceSheetOpts = {}): THREE.Object3D {
  const r = rng((o.seed ?? 0) + 101);
  const b = new Builder();
  const hw = width / 2, hd = depth / 2;
  let poly: [number, number][];
  if (o.polygon) poly = o.polygon;
  else if (o.round) {
    poly = [];
    const ph = r() * 6.28;
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const w = 1 + 0.05 * Math.sin(3 * a + ph) + 0.035 * Math.sin(5 * a + ph * 2);
      poly.push([Math.cos(a) * hw * 0.97 * w, Math.sin(a) * hd * 0.97 * w]);
    }
  } else poly = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  const isIn = (x: number, z: number) => insidePoly(poly, x, z);
  // tessellated top with per-vertex colour: pale near the shore, deep teal-blue in the middle
  const cell = 0.5;
  const pos: number[] = [], col: number[] = [];
  const pale = new THREE.Color(0xcdeff6), mid = new THREE.Color(0x8fd0e2), deep = new THREE.Color(0x3f8fb0), c = new THREE.Color();
  const colAt = (x: number, z: number) => {
    const e = Math.min(1, distToPoly(poly, x, z) / Math.max(3, Math.min(hw, hd) * 0.55));
    const n = 0.5 + 0.5 * Math.sin(x * 0.41 + z * 0.23) * Math.cos(z * 0.31 - x * 0.17);
    if (e < 0.5) c.copy(pale).lerp(mid, e * 2); else c.copy(mid).lerp(deep, (e - 0.5) * 2 * (0.7 + 0.3 * n));
    return c;
  };
  for (let x = -hw; x < hw - 1e-6; x += cell) for (let z = -hd; z < hd - 1e-6; z += cell) {
    if (!isIn(x + cell / 2, z + cell / 2)) continue;
    const q = [[x, z], [x + cell, z], [x + cell, z + cell], [x, z + cell]];
    for (const [a, b2, c2] of [[0, 2, 1], [0, 3, 2]]) for (const k of [a, b2, c2]) {
      pos.push(q[k][0], 0.03, q[k][1]);
      const cc = colAt(q[k][0], q[k][1]);
      col.push(cc.r, cc.g, cc.b);
    }
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  top.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  b.add(top, 0xffffff, { vcol: true });
  // cracks: branching dark lines, mostly in the deep ice
  const area = width * depth;
  for (let k = 0; k < Math.round(area / 16); k++) {
    let x = (r() - 0.5) * width * 0.8, z = (r() - 0.5) * depth * 0.8, a = r() * Math.PI;
    if (!isIn(x, z)) continue;
    for (let s = 0; s < 5; s++) {
      const len = 0.5 + r() * 1.2;
      const nx = x + Math.sin(a) * len, nz = z + Math.cos(a) * len;
      if (!isIn(nx, nz)) break;
      b.add(box(0.03, 0.004, len), 0x2f6f90, { p: [x + Math.sin(a) * len / 2, 0.034, z + Math.cos(a) * len / 2], r: [0, a, 0] });
      if (r() < 0.3) b.add(box(0.02, 0.004, len * 0.5), 0x2f6f90, { p: [x + Math.sin(a + 0.8) * len / 4, 0.034, z + Math.cos(a + 0.8) * len / 4], r: [0, a + 0.8, 0] });
      x = nx; z = nz; a += (r() - 0.5) * 1.2;
    }
  }
  // skate swirls: loops and figure-eights of pale scratches
  for (let k = 0; k < Math.max(3, Math.round(area / 30)); k++) {
    const cx = (r() - 0.5) * width * 0.6, cz = (r() - 0.5) * depth * 0.6, R = 1.2 + r() * 2.2, a0 = r() * 6.28;
    const loops = r() < 0.4 ? 2 : 1;
    for (let L = 0; L < loops; L++) {
      const ox = L ? Math.cos(a0) * R * 2 : 0, oz = L ? Math.sin(a0) * R * 2 : 0;
      for (let s = 0; s < 14; s++) {
        const a = a0 + s * 0.42 + (L ? Math.PI : 0);
        const x = cx + ox + Math.cos(a) * R, z = cz + oz + Math.sin(a) * R * 0.8;
        if (!isIn(x, z)) continue;
        b.add(box(0.018, 0.003, R * 0.42), 0xf2fbfe, { p: [x, 0.036, z], r: [0, -a, 0] });
      }
    }
  }
  // frost dust patches near the shore
  for (let k = 0; k < Math.round(area / 25); k++) {
    const x = (r() - 0.5) * width * 0.85, z = (r() - 0.5) * depth * 0.85;
    if (!isIn(x, z) || distToPoly(poly, x, z) > 2.5) continue;
    b.add(new THREE.CylinderGeometry(0.4 + r() * 0.5, 0.4 + r() * 0.5, 0.006, 9), 0xe4f5fa, { p: [x, 0.033, z], s: [1.6, 1, 1], r: [0, r() * 3, 0], jitter: 0.08, seed: k });
  }
  if (o.edge ?? true) {
    const loop = groundPath([...poly, poly[0]] as [number, number][], o.round || o.polygon ? 0.6 : 1.5);
    const cols = [P.snowShade, P.snow, P.snow, P.snowShade];
    // the rim sweeps on the outside of the outline whichever way the polygon winds
    const s0 = loop.sample(0.01), lat = [Math.cos(s0.yaw), -Math.sin(s0.yaw)];
    const outward = isIn(s0.x + lat[0] * 0.5, s0.z + lat[1] * 0.5) ? -1 : 1;
    b.add(sweep(loop, [[-0.45 * outward, 0.03], [0.1 * outward, 0.2], [0.6 * outward, 0.16], [1.1 * outward, 0.0]], { color: (k) => new THREE.Color(cols[k]) }), 0xffffff, { vcol: true, jitter: 0.04, seed: 3 });
  }
  const m = new THREE.Mesh(b.build(), mats().iceFloor);
  m.name = 'body';
  m.receiveShadow = true;
  const g = new THREE.Group();
  g.name = 'iceSheet';
  g.add(m);
  g.userData = { size: [width, depth], topY: 0.035, surface: 'ice', walkable: true, decor: true, outline: poly };
  return g;
}
