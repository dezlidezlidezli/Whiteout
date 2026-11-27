// Yard floors (one draw call each) and tiny ground-scatter meshes for instancing.
import * as THREE from 'three';
import { Builder, box, cone, cyl, ico, rng, sphere } from './geo';
import { mats } from './materials';
import { PALETTE as P } from './palette';
import { groundPath, sweep, type XZ } from './paths';
import type { ItemMeshDef } from './index';

export type FloorType = 'planks' | 'cobble' | 'packedEarth' | 'ice' | 'stone';
export interface FloorOpts {
  seed?: number;
  /** optional polygon (local XZ, centred on the origin) to clip the floor to; defaults to the rectangle */
  polygon?: XZ[];
  /** draw the border kerb (default true) */
  kerb?: boolean;
}

function inside(poly: XZ[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

const cache = new Map<string, THREE.BufferGeometry>();

/** A warm, worn yard floor slab a few cm above the snow, with a chunky kerb. Origin at the centre. */
export function floor(type: FloorType, width: number, depth: number, o: FloorOpts = {}): THREE.Object3D {
  const key = `${type}:${width}:${depth}:${o.seed ?? 0}:${o.kerb ?? true}:${JSON.stringify(o.polygon ?? null)}`;
  let geo = cache.get(key);
  if (!geo) { geo = buildFloor(type, width, depth, o).build(); cache.set(key, geo); }
  const m = new THREE.Mesh(geo, mats().std);
  m.name = 'body';
  m.receiveShadow = true;
  m.castShadow = false;
  const g = new THREE.Group();
  g.name = `floor:${type}`;
  g.add(m);
  g.userData = { type, size: [width, depth], walkable: true, decor: true, topY: type === 'planks' ? 0.07 : 0.05 };
  return g;
}

function buildFloor(type: FloorType, W: number, D: number, o: FloorOpts): Builder {
  const b = new Builder();
  const r = rng((o.seed ?? 0) * 7 + type.length * 31);
  const poly: XZ[] = o.polygon ?? [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
  const isIn = (x: number, z: number) => inside(poly, x, z);
  const pick = (a: number[]) => a[Math.floor(r() * a.length)];
  // base slab under everything (fills the gaps between tiles/planks)
  const base = { planks: 0x4a3324, cobble: 0x5f5853, stone: 0x6a645e, packedEarth: 0x6e5038, ice: 0x8fc4e0 }[type];
  const cells = (step: number, f: (x: number, z: number, i: number, j: number) => void) => {
    let i = 0;
    for (let z = -D / 2 + step / 2; z < D / 2; z += step, i++) {
      let j = 0;
      for (let x = -W / 2 + step / 2; x < W / 2; x += step, j++) if (isIn(x, z)) f(x, z, i, j);
    }
  };
  cells(1.0, (x, z) => b.add(box(1.0, 0.03, 1.0), base, { p: [x, 0.015, z] }));

  if (type === 'planks') {
    const pw = 0.3;
    for (let z = -D / 2 + pw / 2; z < D / 2; z += pw) {
      let x = -W / 2 + (r() - 0.5) * 0.8;
      while (x < W / 2) {
        const len = 1.2 + r() * 1.4;
        const x0 = Math.max(-W / 2, x), x1 = Math.min(W / 2, x + len);
        const cx = (x0 + x1) / 2;
        if (x1 - x0 > 0.2 && isIn(cx, z)) {
          const worn = r() < 0.12;
          const c = worn ? 0x8a6440 : pick([P.woodLight, P.woodPale, 0xd2a870, P.wood, 0xc89a63, 0xb98a58]);
          b.add(box(x1 - x0 - 0.025, 0.05, pw - 0.03), c, { p: [cx, 0.055, z], r: [0, 0, (r() - 0.5) * 0.006] });
          if (r() < 0.5) for (const ex of [x0 + 0.08, x1 - 0.08]) b.add(box(0.025, 0.006, 0.025), 0x4a4440, { p: [ex, 0.083, z] });
          if (r() < 0.06) b.add(box(0.12, 0.004, 0.06), 0x5a3a24, { p: [cx + (r() - 0.5) * 0.4, 0.082, z], r: [0, r() * 3, 0] }); // knot / stain
        }
        x += len;
      }
    }
  } else if (type === 'cobble' || type === 'stone') {
    const step = type === 'cobble' ? 0.45 : 0.85;
    const cols = type === 'cobble' ? [P.stone, P.stoneWarm, 0x9aa0ab, 0x8a8478, 0xb0a596] : [0xb8ad9e, P.stoneWarm, 0xa59e94, 0xc4baa8, 0x9a958c];
    cells(step, (x, z, i) => {
      const off = type === 'cobble' && i % 2 ? step / 2 : 0;
      const xx = x + off;
      if (xx > W / 2 - step * 0.3 || !isIn(xx, z)) return;
      const s = step - (type === 'cobble' ? 0.07 : 0.06);
      const h = 0.04 + r() * 0.03;
      b.add(box(s * (0.9 + r() * 0.1), h, s * (0.9 + r() * 0.1)), pick(cols), { p: [xx + (r() - 0.5) * 0.03, 0.03 + h / 2, z + (r() - 0.5) * 0.03], r: [0, (r() - 0.5) * 0.12, 0] });
    });
  } else if (type === 'packedEarth') {
    const sx = Math.max(2, Math.round(W / 0.6)), sz = Math.max(2, Math.round(D / 0.6));
    const pg = new THREE.PlaneGeometry(W, D, sx, sz).rotateX(-Math.PI / 2);
    b.add(pg, 0x8a6446, { p: [0, 0.045, 0], jitter: 0.015, seed: o.seed ?? 1, shade: 0.12 });
    // wood chips, straw and sawdust
    const n = Math.round(W * D * 1.6);
    for (let k = 0; k < n; k++) {
      const x = (r() - 0.5) * W * 0.95, z = (r() - 0.5) * D * 0.95;
      if (!isIn(x, z)) continue;
      const c = pick([0xe2c08c, 0xd8b070, 0xc89a63, 0xe8cf9a, 0xb8a070]);
      b.add(box(0.08 + r() * 0.08, 0.012, 0.03 + r() * 0.03), c, { p: [x, 0.06, z], r: [0, r() * 3, 0] });
    }
    for (let k = 0; k < 5; k++) {
      const x = (r() - 0.5) * W * 0.8, z = (r() - 0.5) * D * 0.8;
      if (isIn(x, z)) b.add(cone(0.25, 0.08, 7), 0xc8a26a, { p: [x, 0.08, z], s: [1.3, 1, 1], jitter: 0.02, seed: k });
    }
  } else {
    // ice shelf: pale slab with frosty patches and cracks
    const sx = Math.max(2, Math.round(W / 0.8)), sz = Math.max(2, Math.round(D / 0.8));
    b.add(new THREE.PlaneGeometry(W, D, sx, sz).rotateX(-Math.PI / 2), P.ice, { p: [0, 0.04, 0], jitter: 0.008, seed: 2, shade: 0.08 });
    const n = Math.round(W * D * 0.25);
    for (let k = 0; k < n; k++) {
      const x = (r() - 0.5) * W * 0.9, z = (r() - 0.5) * D * 0.9;
      if (!isIn(x, z)) continue;
      if (r() < 0.5) b.add(box(0.015, 0.005, 0.6 + r() * 1.2), 0x6fa8cc, { p: [x, 0.05, z], r: [0, r() * 3, 0] });
      else b.add(cyl(0.3 + r() * 0.3, 0.3 + r() * 0.3, 0.012, 9), 0xd6eef9, { p: [x, 0.047, z], s: [1.4, 1, 1], r: [0, r() * 3, 0], jitter: 0.03, seed: k });
    }
  }

  if (o.kerb ?? true) {
    const loop = [...poly, poly[0]];
    const path = groundPath(loop, 0.05);
    if (type === 'planks' || type === 'packedEarth') {
      const oct: [number, number][] = [];
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; oct.push([Math.cos(a) * 0.13, 0.11 + Math.sin(a) * 0.11]); }
      b.add(sweep(path, oct, { closed: true }), P.bark, { shade: 0.04, seed: 3 });
      // corner posts
      for (const [x, z] of poly) {
        b.add(cyl(0.16, 0.18, 0.5, 7), P.woodDark, { p: [x, 0.25, z] });
        b.add(cyl(0.17, 0.17, 0.05, 7), P.snow, { p: [x, 0.52, z] });
      }
    } else if (type === 'ice') {
      b.add(sweep(path, [[-0.05, 0.03], [0.25, 0.14], [0.6, 0.0]], { color: (k) => new THREE.Color([P.snowShade, P.snow, P.snow][k]) }), 0xffffff, { vcol: true });
    } else {
      // stone kerb blocks
      const step = 0.55;
      for (let d = step / 2; d < path.length; d += step) {
        const p = path.sample(d);
        b.add(box(step - 0.05, 0.16, 0.24), pick([P.stone, P.stoneDark, 0x9aa0ab]), { p: [p.x, 0.08, p.z], r: [0, p.yaw + Math.PI / 2, 0] });
      }
    }
  }
  return b;
}

// ---------------------------------------------------------------- scatter
export type ScatterKind = 'tuft' | 'pebble' | 'snowClump' | 'twig' | 'woodChip' | 'footprint';
const scatterCache = new Map<string, ItemMeshDef>();
/** Tiny ground scatter (8-40 tris) for InstancedMesh: one geometry + the shared material. */
export function scatterMesh(kind: ScatterKind): ItemMeshDef {
  let d = scatterCache.get(kind);
  if (d) return d;
  const b = new Builder();
  let radius = 0.15;
  switch (kind) {
    case 'tuft':
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        b.add(cone(0.025, 0.22 + (i % 2) * 0.08, 3), i % 2 ? 0xc8b078 : 0x9aa05a, { p: [Math.cos(a) * 0.04, 0.12, Math.sin(a) * 0.04], r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35] });
      }
      radius = 0.1;
      break;
    case 'pebble':
      b.add(ico(0.09, 0), P.stone, { p: [0, 0.03, 0], s: [1.2, 0.55, 1], jitter: 0.012, seed: 2, top: P.snow, topY: 0.85, shade: 0.1 });
      radius = 0.1;
      break;
    case 'snowClump':
      b.add(ico(0.16, 0), P.snow, { p: [0, 0.02, 0], s: [1.3, 0.45, 1], jitter: 0.02, seed: 3, bottom: P.snowShade, topY: 0.2 });
      radius = 0.2;
      break;
    case 'twig':
      b.add(box(0.025, 0.025, 0.4), P.bark, { p: [0, 0.015, 0], r: [0, 0.1, 0] });
      b.add(box(0.018, 0.018, 0.16), P.bark, { p: [0.05, 0.015, 0.08], r: [0, 0.9, 0] });
      radius = 0.2;
      break;
    case 'woodChip':
      b.add(box(0.12, 0.018, 0.05), 0xe2c08c, { p: [0, 0.01, 0], r: [0, 0, 0.1] });
      radius = 0.07;
      break;
    case 'footprint':
      for (const s of [-1, 1]) b.add(cyl(0.06, 0.06, 0.006, 6), 0xb4c2d8, { p: [s * 0.08, 0.004, s * 0.12], s: [0.8, 1, 1.5] });
      radius = 0.18;
      break;
  }
  const geometry = b.build();
  geometry.name = `scatter:${kind}`;
  d = { geometry, material: mats().std, stackHeight: 0, radius };
  scatterCache.set(kind, d);
  return d;
}
