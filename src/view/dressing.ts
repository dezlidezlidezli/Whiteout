// Yard dressing from `data.dressing`: floors, palisades/fences, paths, frozen streams, landmarks and
// themed clutter, plus natural ground scatter over the open snow. Everything static is MERGED per
// area and material (a handful of draw calls per yard). Areas behind frost walls stay hidden until
// they open. Walls, landmarks and clutter use see-through materials (occlude.ts).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameData } from '../data';
import type { Sim } from '../sim';
import type { GroundUniforms } from './ground';
import { SnowMask, type MaskShape } from './snowmask';
import {
  createFencePath, createFloor, createIceSheet, createPathStrip, createProp, createWallPath, getScatterMesh, type ScatterKind, type XZ,
} from './models';
import { seeThrough } from './occlude';
import { FLOOR_BASE, FLOOR_STEP, PATH_Y, type SurfaceMap } from './surface';

/** The camp is a green meadow around the Hearth: no big earth slab or snowy trampled strips there. */
export function skipCampFloor(area: string, type: string): boolean {
  return area === 'camp' && type === 'packedEarth';
}

type AreaD = GameData['dressing'][number];
type Theme = AreaD['clutterZones'][number]['theme'];

const CLUTTER: Record<Theme, string[]> = {
  kitchen: ['crateStack', 'barrelCluster', 'sackPile', 'potShelf', 'basketPile', 'washTub', 'crateStack'],
  lumber: ['firewoodRack', 'fallenLog', 'toolRack', 'crateStack', 'sackPile', 'firewoodRack'],
  fishing: ['dryingRack', 'basketPile', 'barrelCluster', 'supplySled', 'washTub'],
  mining: ['toolRack', 'crateStack', 'barrelCluster', 'supplySled', 'snowyBoulderCluster'],
  camp: ['firewoodRack', 'basketPile', 'crateStack', 'barrelCluster', 'bench'],
  beacon: ['crateStack', 'toolRack', 'sackPile', 'snowyBoulderCluster'],
  wild: ['bush', 'sapling', 'fallenLog', 'snowyBoulderCluster', 'snowBank'],
};

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

interface Bucket {
  mat: THREE.Material;
  geos: THREE.BufferGeometry[];
  cast: boolean;
}

/** Bake every visible mesh under `roots` into one merged mesh per (material, attributes, shadow). */
function mergeStatic(roots: THREE.Object3D[], see: boolean, castWalls: boolean): THREE.Mesh[] {
  const buckets = new Map<string, Bucket>();
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) return;
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      // Keep only the attributes every art mesh shares.
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      const attrs = Object.keys(g.attributes).sort().join(',');
      const cast = castWalls && m.castShadow;
      const key = `${m.material.uuid}|${attrs}|${cast}`;
      let b = buckets.get(key);
      if (!b) {
        b = { mat: m.material, geos: [], cast };
        buckets.set(key, b);
      }
      b.geos.push(g);
      g = null as unknown as THREE.BufferGeometry;
    });
  }
  const out: THREE.Mesh[] = [];
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const solid = !b.mat.transparent && b.mat.blending === THREE.NormalBlending;
    const mesh = new THREE.Mesh(merged, see && solid ? seeThrough(b.mat) : b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    out.push(mesh);
  }
  return out;
}

interface Rect { x0: number; z0: number; x1: number; z1: number }

/** Axis-aligned bounds of a polyline strip of width w (per segment, so L-shaped paths stay tight). */
function stripRects(points: XZ[], w: number): Rect[] {
  const out: Rect[] = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    out.push({ x0: Math.min(ax, bx) - w / 2, z0: Math.min(az, bz) - w / 2, x1: Math.max(ax, bx) + w / 2, z1: Math.max(az, bz) + w / 2 });
  }
  return out;
}

const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

/** Props for a data-authored edge run, spaced along the polyline with natural jitter. */
const EDGE_KIT: Record<string, { props: string[]; step: number; jitter: number; along: boolean }> = {
  snowBank: { props: ['snowBank', 'snowBank', 'snowyBoulderCluster'], step: 3.4, jitter: 0.35, along: true },
  rocks: { props: ['snowyBoulderCluster', 'rock', 'snowyBoulderCluster', 'snowBank'], step: 2.0, jitter: 0.5, along: false },
  trees: { props: ['pineSnowy', 'pineSnowy', 'bush', 'pineSnowy'], step: 2.3, jitter: 0.6, along: false },
  iceShelf: { props: ['iceShards', 'snowBank', 'iceShards'], step: 2.2, jitter: 0.3, along: true },
};

function edgeRun(kind: string, points: XZ[], rand: () => number): THREE.Object3D[] {
  const kit = EDGE_KIT[kind] ?? EDGE_KIT.snowBank;
  const out: THREE.Object3D[] = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / kit.step));
    const yaw = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k <= n; k++) {
      if (k === n && i < points.length - 1) continue; // corner shared with the next leg
      const t = k / n;
      const nx = Math.cos(yaw);
      const nz = -Math.sin(yaw);
      const j = (rand() - 0.5) * 2 * kit.jitter;
      const o = createProp(kit.props[Math.floor(rand() * kit.props.length)], { seed: Math.floor(rand() * 999) });
      o.position.set(ax + (bx - ax) * t + nx * j, 0, az + (bz - az) * t + nz * j);
      o.rotation.y = (kit.along ? yaw + Math.PI / 2 : rand() * Math.PI * 2) + (rand() - 0.5) * 0.3;
      o.scale.setScalar(0.85 + rand() * 0.35);
      out.push(o);
    }
  }
  return out;
}

/** A post where a fence run meets a palisade run, so the junction reads tidy and solid. */
function junctionPosts(a: AreaD): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const pal = a.walls.filter((w) => w.kind === 'palisade');
  for (const f of a.walls) {
    if (f.kind !== 'fence') continue;
    for (const end of [f.points[0], f.points[f.points.length - 1]]) {
      const near = pal.some((w) => w.points.some((_, i) => i > 0 && segDist(end[0], end[1], w.points[i - 1], w.points[i]) < 0.8));
      if (!near) continue;
      const o = createProp('lampPost', { seed: 5 });
      o.position.set(end[0], 0, end[1]);
      out.push(o);
    }
  }
  return out;
}

/**
 * Visible barriers wherever an area's walkable rect ends with nothing drawn there (no palisade or
 * fence): snow banks, boulders and bushes just outside the edge. Corridor rects (every rect after an
 * area's first) get lamp-post gateposts so openings read as inviting. Data-driven from the rects.
 */
function edgeBarriers(data: GameData, a: AreaD, rand: () => number): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const area = data.areas.find((x) => x.id === a.area);
  if (!area) return out;
  const all = data.areas.flatMap((x) => x.rects);
  const inR = (r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const frost: XZ[][] = data.walls.map((w) => w.points.map((p) => [p.x, p.z] as XZ));
  const nearFrost = (x: number, z: number) => frost.some((pts) => pts.some((_, i) => i > 0 && segDist(x, z, pts[i - 1], pts[i]) < 1.6));
  const walls: XZ[][] = data.dressing.flatMap((d) => [...d.walls.map((w) => w.points), ...(d.edges ?? []).map((e) => e.points)]);
  const nearWall = (x: number, z: number) => walls.some((pts) => pts.some((_, i) => i > 0 && segDist(x, z, pts[i - 1], pts[i]) < 1.4));
  const kinds = ['snowBank', 'snowyBoulderCluster', 'snowBank', 'bush', 'snowBank'];
  area.rects.forEach((r, ri) => {
    const edges: { ax: number; az: number; bx: number; bz: number; nx: number; nz: number }[] = [
      { ax: r.x0, az: r.z0, bx: r.x1, bz: r.z0, nx: 0, nz: -1 },
      { ax: r.x1, az: r.z0, bx: r.x1, bz: r.z1, nx: 1, nz: 0 },
      { ax: r.x0, az: r.z1, bx: r.x1, bz: r.z1, nx: 0, nz: 1 },
      { ax: r.x0, az: r.z0, bx: r.x0, bz: r.z1, nx: -1, nz: 0 },
    ];
    for (const e of edges) {
      const len = Math.hypot(e.bx - e.ax, e.bz - e.az);
      const n = Math.max(1, Math.round(len / 3.2));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const px = e.ax + (e.bx - e.ax) * t;
        const pz = e.az + (e.bz - e.az) * t;
        // Passable only where another rect spans across this edge (touching rects still block the
        // player). Elsewhere it is a dead end that must be visible, unless a wall is drawn there.
        const across = all.some((o) => o !== r && inR(o, px - e.nx * 0.5, pz - e.nz * 0.5) && inR(o, px + e.nx * 0.5, pz + e.nz * 0.5));
        if (across || nearWall(px, pz) || nearFrost(px, pz)) continue;
        if (DEBUG) console.info(`[dressing] fallback barrier: ${a.area} edge at (${px.toFixed(1)}, ${pz.toFixed(1)}) has no wall/fence/edge in data`);
        const o = createProp(kinds[Math.floor(rand() * kinds.length)], { seed: Math.floor(rand() * 999) });
        o.position.set(px + e.nx * 1.0, 0, pz + e.nz * 1.0);
        o.rotation.y = Math.atan2(e.bx - e.ax, e.bz - e.az) + Math.PI / 2 + (rand() - 0.5) * 0.3;
        out.push(o);
      }
    }
    if (ri > 0) {
      // Corridor: lamp-post gateposts at its corners.
      for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]] as [number, number][]) {
        if (nearWall(x, z)) continue;
        const o = createProp('lampPost', { seed: 3 });
        o.position.set(x + Math.sign(x - (r.x0 + r.x1) / 2) * 0.4, 0, z + Math.sign(z - (r.z0 + r.z1) / 2) * 0.4);
        out.push(o);
      }
    }
  });
  return out;
}

/** A soft, irregular octagon (local XZ) for organic patches like the camp's hearth stones. */
function irregular(w: number, d: number, rand: () => number): XZ[] {
  const out: XZ[] = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const r = 0.86 + rand() * 0.14;
    out.push([(Math.cos(a) * w * r) / 2, (Math.sin(a) * d * r) / 2]);
  }
  return out;
}

/** Rinks: clusters of touching 'ice' floor boxes, each outlined as one smooth loop (radial sample of the
 *  union from its centre, then smoothed so steps between boxes become rounded corners). */
function rinks(floors: { x: number; z: number; w: number; d: number }[]): { cx: number; cz: number; w: number; d: number; poly: [number, number][] }[] {
  const boxes = floors.map((f) => ({ x0: f.x - f.w / 2, x1: f.x + f.w / 2, z0: f.z - f.d / 2, z1: f.z + f.d / 2 }));
  const groups: (typeof boxes)[] = [];
  for (const b of boxes) {
    const hit = groups.filter((g) => g.some((o) => b.x0 <= o.x1 + 0.1 && b.x1 >= o.x0 - 0.1 && b.z0 <= o.z1 + 0.1 && b.z1 >= o.z0 - 0.1));
    const merged = [b, ...hit.flat()];
    for (const g of hit) groups.splice(groups.indexOf(g), 1);
    groups.push(merged);
  }
  return groups.map((g) => {
    const x0 = Math.min(...g.map((b) => b.x0));
    const x1 = Math.max(...g.map((b) => b.x1));
    const z0 = Math.min(...g.map((b) => b.z0));
    const z1 = Math.max(...g.map((b) => b.z1));
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const inside = (x: number, z: number) => g.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
    const N = 120;
    const rad: number[] = [];
    const maxR = Math.hypot(x1 - x0, z1 - z0);
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      let r = 0;
      for (let t = 0; t < maxR; t += 0.05) if (inside(cx + Math.cos(a) * t, cz + Math.sin(a) * t)) r = t;
      rad.push(r);
    }
    // Smooth: rounds the corners and the steps between boxes (a few passes of a 5-tap average).
    let cur = rad;
    for (let pass = 0; pass < 4; pass++) cur = cur.map((_, k) => (cur[(k - 2 + N) % N] + cur[(k - 1 + N) % N] * 2 + cur[k] * 3 + cur[(k + 1) % N] * 2 + cur[(k + 2) % N]) / 9);
    const poly = cur.map((r, k) => [Math.cos((k / N) * Math.PI * 2) * r, Math.sin((k / N) * Math.PI * 2) * r] as [number, number]);
    return { cx, cz, w: x1 - x0 + 0.2, d: z1 - z0 + 0.2, poly };
  });
}

/** Point at arc length s along a closed loop, with the outward normal (for a loop around its centroid). */
function alongLoop(pts: XZ[], s: number): { x: number; z: number; nx: number; nz: number } {
  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p[0];
    cz += p[1];
  }
  cx /= pts.length;
  cz /= pts.length;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= l || i === pts.length - 1) {
      const t = l > 0 ? Math.min(1, s / l) : 0;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      let nx = (b[1] - a[1]) / (l || 1);
      let nz = -(b[0] - a[0]) / (l || 1);
      if (nx * (x - cx) + nz * (z - cz) < 0) {
        nx = -nx;
        nz = -nz;
      }
      return { x, z, nx, nz };
    }
    s -= l;
  }
  return { x: pts[0][0], z: pts[0][1], nx: 0, nz: 1 };
}

function segDist(px: number, pz: number, a: XZ, b: XZ): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2));
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
}

interface AreaView {
  area: string;
  group: THREE.Group;
  flats: Rect[];
}

const SCATTER: { kind: ScatterKind; n: number; near: 'trees' | 'paths' | 'any'; scale: [number, number] }[] = [
  { kind: 'tuft', n: 260, near: 'any', scale: [0.7, 1.4] },
  { kind: 'pebble', n: 160, near: 'paths', scale: [0.6, 1.3] },
  { kind: 'snowClump', n: 200, near: 'any', scale: [0.7, 1.6] },
  { kind: 'twig', n: 140, near: 'trees', scale: [0.8, 1.4] },
  { kind: 'woodChip', n: 90, near: 'trees', scale: [0.8, 1.3] },
];

export class DressingView {
  private areas: AreaView[] = [];
  private openKey = '';
  private scatter: THREE.InstancedMesh[] = [];
  /** Merged walls/landmarks/clutter/barriers (for debug coverage checks). */
  readonly solidMeshes: THREE.Mesh[] = [];
  readonly mask: SnowMask;
  private data: GameData;

  constructor(parent: THREE.Object3D, data: GameData, private ground: GroundUniforms, quality: number, surface: SurfaceMap) {
    this.data = data;
    this.mask = new SnowMask(data);
    // Things clutter must keep clear of: stations (reach), pads, belts, counter queues.
    const keepOut: { x: number; z: number; r: number }[] = [];
    for (const s of data.stations) keepOut.push({ x: s.x, z: s.z, r: Math.max(1.3, (s.reach ?? 1.5) * 0.85) });
    for (const p of data.pads) keepOut.push({ x: p.x, z: p.z, r: 1.5 });
    for (const s of data.stations) {
      if (s.type === 'counter') {
        for (let k = 0; k < 8; k++) keepOut.push({ x: s.queueStart.x + s.queueDir.x * k, z: s.queueStart.z + s.queueDir.z * k, r: 2.2 });
      }
    }
    const belts: XZ[][] = data.links.map((l) => (l.path ?? []).map((p) => [p.x, p.z] as XZ));
    const blocked = (x: number, z: number, r: number) =>
      keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + r) ||
      belts.some((pts) => pts.some((_, i) => i > 0 && segDist(x, z, pts[i - 1], pts[i]) < 1.0 + r));

    data.dressing.forEach((a, ai) => {
      const rand = rng(ai * 131 + 17);
      const flatRoots: THREE.Object3D[] = [];
      const solidRoots: THREE.Object3D[] = [];
      const flats: Rect[] = [];

      a.floors.forEach((f, i) => {
        if (skipCampFloor(a.area, f.type)) return;
        if (f.type === 'ice') {
          // Lake ice is drawn below as one organic sheet per rink (no tile seams); still pressed flat.
          flats.push({ x0: f.x - f.w / 2, z0: f.z - f.d / 2, x1: f.x + f.w / 2, z1: f.z + f.d / 2 });
          return;
        }
        // In the camp meadow the hearth square is a smaller, irregular patch of warm stones.
        const soft = a.area === 'camp';
        const w = soft ? f.w * 0.82 : f.w;
        const d = soft ? f.d * 0.82 : f.d;
        const polygon = soft ? irregular(w, d, rand) : undefined;
        const o = createFloor(f.type, w, d, { seed: ai * 10 + i, polygon, kerb: !soft });
        o.position.set(f.x, FLOOR_BASE + i * FLOOR_STEP, f.z);
        flatRoots.push(o);
        flats.push({ x0: f.x - f.w / 2, z0: f.z - f.d / 2, x1: f.x + f.w / 2, z1: f.z + f.d / 2 });
      });
      for (const rk of rinks(a.floors.filter((f) => f.type === 'ice'))) {
        const sheet = createIceSheet(rk.w, rk.d, { polygon: rk.poly, seed: ai * 7 + 3, edge: true });
        sheet.position.set(rk.cx, FLOOR_BASE + 0.03, rk.cz);
        flatRoots.push(sheet);
        // Warm post lanterns along the shore sides (not the open ice-shelf side, not on stations/pads).
        const shelf = (a.edges ?? []).filter((e) => e.kind === 'iceShelf').map((e) => e.points);
        const rects = data.areas.find((ar) => ar.id === a.area)?.rects ?? [];
        const inArea = (x: number, z: number) => rects.some((r) => x > r.x0 + 0.6 && x < r.x1 - 0.6 && z > r.z0 + 0.6 && z < r.z1 - 0.6);
        const nearShelf = (x: number, z: number) => shelf.some((pts) => pts.some((_, i) => i > 0 && segDist(x, z, pts[i - 1], pts[i]) < 2.6));
        const outline = rk.poly.map(([x, z]) => [x + rk.cx, z + rk.cz] as XZ);
        let per = 0;
        for (let i = 0; i < outline.length; i++) per += Math.hypot(outline[(i + 1) % outline.length][0] - outline[i][0], outline[(i + 1) % outline.length][1] - outline[i][1]);
        const n = Math.max(4, Math.round(per / 3.0));
        let lastX = Infinity;
        let lastZ = Infinity;
        for (let k = 0; k < n; k++) {
          const q = alongLoop(outline, (k / n) * per);
          // Step 1.1 m out from the ice onto the snowy shore.
          const x = q.x + q.nx * 1.1;
          const z = q.z + q.nz * 1.1;
          if (!inArea(x, z) || nearShelf(x, z) || blocked(x, z, 0.35) || Math.hypot(x - lastX, z - lastZ) < 2.2) continue;
          const o = createProp('rinkLantern', { seed: k });
          o.position.set(x, 0, z);
          o.rotation.y = Math.atan2(-q.nx, -q.nz);
          solidRoots.push(o);
          lastX = x;
          lastZ = z;
        }
      }
      a.paths.forEach((p, i) => {
        // Inside the warm camp meadow the ground itself shows the worn earth: no snowy strips.
        if (a.area === 'camp' && p.type === 'trampled') return;
        const o = createPathStrip(p.points, { width: p.width, type: p.type, seed: ai * 10 + i });
        o.position.y = PATH_Y;
        flatRoots.push(o);
        flats.push(...stripRects(p.points, p.width));
      });
      a.streams.forEach((s, i) => {
        // Frozen water must read as ice whatever the Hearth's warmth: sit it above the melt ground.
        const o = createPathStrip(s.points, { width: s.width, type: 'ice', seed: ai * 10 + i + 5 });
        o.position.y = surface.streamBase(s.points);
        flatRoots.push(o);
        flats.push(...stripRects(s.points, s.width + 0.4));
      });
      a.walls.forEach((w, i) => {
        const o = w.kind === 'fence'
          ? createFencePath(w.points, { seed: ai * 10 + i, gaps: w.gaps })
          : createWallPath(w.points, { seed: ai * 10 + i, gaps: w.gaps });
        solidRoots.push(o);
      });
      for (const l of a.landmarks) {
        const o = createProp(l.prop, { seed: l.seed ?? 0 });
        o.position.set(l.x, 0, l.z);
        o.rotation.y = l.yaw ?? 0;
        solidRoots.push(o);
      }
      // Themed clutter: props hug the zone's wall-side edge, facing into the yard.
      for (const z of a.clutterZones) {
        const list = CLUTTER[z.theme] ?? CLUTTER.wild;
        const long = z.w >= z.d;
        const len = long ? z.w : z.d;
        const step = 1.45 / Math.max(0.4, z.density ?? 1);
        const n = Math.max(1, Math.floor(len / step));
        // Which side of the zone faces the nearest wall?
        let wallSide = 0;
        let best = Infinity;
        for (const w of a.walls) {
          for (let k = 1; k < w.points.length; k++) {
            const d = segDist(z.x, z.z, w.points[k - 1], w.points[k]);
            if (d < best) {
              best = d;
              const mx = (w.points[k - 1][0] + w.points[k][0]) / 2;
              const mz = (w.points[k - 1][1] + w.points[k][1]) / 2;
              wallSide = long ? Math.sign(mz - z.z) : Math.sign(mx - z.x);
            }
          }
        }
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n - 0.5;
          const across = (long ? z.d : z.w) / 2 - 0.45;
          const x = long ? z.x + t * (z.w - 0.6) : z.x + wallSide * across * 0.6;
          const zz = long ? z.z + wallSide * across * 0.6 : z.z + t * (z.d - 0.6);
          if (blocked(x, zz, 0.5)) continue;
          const o = createProp(list[Math.floor(rand() * list.length)], { seed: Math.floor(rand() * 1000) });
          o.position.set(x + (rand() - 0.5) * 0.2, 0, zz + (rand() - 0.5) * 0.2);
          // Back to the wall, small jitter.
          const face = long ? (wallSide > 0 ? Math.PI : 0) : wallSide > 0 ? -Math.PI / 2 : Math.PI / 2;
          o.rotation.y = face + (rand() - 0.5) * 0.25;
          solidRoots.push(o);
        }
      }

      // Data-authored edges (snow banks, rocks, trees, ice shelf) as natural continuous runs.
      for (const e of a.edges ?? []) solidRoots.push(...edgeRun(e.kind, e.points, rand));
      // Fence <-> palisade junctions get a sturdy post so the two read as one tidy enclosure.
      solidRoots.push(...junctionPosts(a));
      // Safety net: any walkable edge still uncovered gets a computed barrier (logged in debug).
      solidRoots.push(...edgeBarriers(data, a, rand));

      const group = new THREE.Group();
      group.name = `dressing:${a.area}`;
      for (const m of mergeStatic(flatRoots, false, false)) {
        m.renderOrder = -1;
        group.add(m);
      }
      for (const m of mergeStatic(solidRoots, true, quality >= 1)) {
        group.add(m);
        this.solidMeshes.push(m);
      }
      group.visible = false;
      parent.add(group);
      this.areas.push({ area: a.area, group, flats });
    });

    this.buildScatter(parent, data, blocked);
  }

  /** Natural detail over the open snow: tufts, pebbles, snow clumps, twigs, wood chips (instanced). */
  private buildScatter(parent: THREE.Object3D, data: GameData, blocked: (x: number, z: number, r: number) => boolean): void {
    const rand = rng(4242);
    const floors: Rect[] = this.areas.flatMap((a) => a.flats);
    const trees = data.decor.filter((d) => /pine|tree/i.test(d.model)).concat(data.stations.filter((s) => s.type === 'node') as never[]);
    const pathPts: XZ[][] = data.dressing.flatMap((a) => a.paths.map((p) => p.points));
    const nearTree = (x: number, z: number) => trees.some((t: { x: number; z: number }) => Math.abs(t.x - x) < 3 && Math.abs(t.z - z) < 3);
    const nearPath = (x: number, z: number) => pathPts.some((pts) => pts.some((_, i) => i > 0 && segDist(x, z, pts[i - 1], pts[i]) < 2.2));
    const inFloor = (x: number, z: number) => floors.some((f) => x > f.x0 - 0.3 && x < f.x1 + 0.3 && z > f.z0 - 0.3 && z < f.z1 + 0.3);
    // Sample around the playable rects (plus a margin), where the camera actually looks.
    const rects = data.areas.flatMap((a) => a.rects);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (const s of SCATTER) {
      const def = getScatterMesh(s.kind);
      const im = new THREE.InstancedMesh(def.geometry, def.material, s.n);
      im.castShadow = false;
      im.receiveShadow = true;
      let n = 0;
      for (let tries = 0; n < s.n && tries < s.n * 12; tries++) {
        const r = rects[Math.floor(rand() * rects.length)];
        const x = r.x0 - 4 + rand() * (r.x1 - r.x0 + 8);
        const z = r.z0 - 4 + rand() * (r.z1 - r.z0 + 8);
        if (inFloor(x, z) || blocked(x, z, 0)) continue;
        const want = s.near === 'trees' ? nearTree(x, z) : s.near === 'paths' ? nearPath(x, z) : true;
        if (!want && rand() > 0.25) continue;
        const k = s.scale[0] + rand() * (s.scale[1] - s.scale[0]);
        e.set(0, rand() * Math.PI * 2, 0);
        q.setFromEuler(e);
        v.set(x, 0.02, z);
        sc.set(k, k, k);
        im.setMatrixAt(n++, m.compose(v, q, sc));
      }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      parent.add(im);
      this.scatter.push(im);
    }
  }

  update(sim: Sim): void {
    let key = '';
    for (const a of this.areas) key += sim.state.areasOpen[a.area as keyof typeof sim.state.areasOpen] ? '1' : '0';
    if (key === this.openKey) return;
    this.openKey = key;
    // Show opened areas; press the snow flat under floors, paths, streams, pads and stations.
    const shapes: MaskShape[] = [];
    this.areas.forEach((a, i) => {
      const open = key[i] === '1';
      a.group.visible = open;
      if (open) for (const f of a.flats) shapes.push({ ...f, area: a.area });
    });
    for (const p of this.data.pads) if (sim.state.areasOpen[p.area as keyof typeof sim.state.areasOpen]) shapes.push({ x0: p.x - 1, z0: p.z - 1, x1: p.x + 1, z1: p.z + 1, area: p.area });
    for (const st of this.data.stations) {
      if (!sim.state.areasOpen[st.area as keyof typeof sim.state.areasOpen]) continue;
      const r = st.type === 'node' ? 0.9 : 1.1;
      shapes.push({ x0: st.x - r, z0: st.z - r, x1: st.x + r, z1: st.z + r, area: st.area });
    }
    this.mask.build(shapes);
    this.ground.uMask.value = this.mask.tex;
    this.ground.uMaskRect.value.copy(this.mask.rect);
  }

  dispose(): void {
    for (const a of this.areas) {
      a.group.removeFromParent();
      a.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    for (const s of this.scatter) s.removeFromParent();
    this.areas = [];
    this.scatter = [];
  }
}
