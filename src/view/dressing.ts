// Yard dressing from `data.dressing`: floors, palisades/fences, paths, frozen streams, landmarks and
// themed clutter, plus natural ground scatter over the open snow. Everything static is MERGED per
// area and material (a handful of draw calls per yard). Areas behind frost walls stay hidden until
// they open. Walls, landmarks and clutter use see-through materials (occlude.ts).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameData } from '../data';
import type { Sim } from '../sim';
import type { GroundUniforms } from './ground';
import { MAX_FLAT } from './ground';
import {
  createFencePath, createFloor, createPathStrip, createProp, createWallPath, getScatterMesh, type ScatterKind, type XZ,
} from './models';
import { seeThrough } from './occlude';

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

  constructor(parent: THREE.Object3D, data: GameData, private ground: GroundUniforms, quality: number) {
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
        // The camp is a green meadow around the Hearth: no big earth slab there (smaller floors stay).
        if (a.area === 'camp' && f.type === 'packedEarth') return;
        const o = createFloor(f.type, f.w, f.d, { seed: ai * 10 + i });
        o.position.set(f.x, 0.004 + i * 0.004, f.z);
        flatRoots.push(o);
        flats.push({ x0: f.x - f.w / 2, z0: f.z - f.d / 2, x1: f.x + f.w / 2, z1: f.z + f.d / 2 });
      });
      a.paths.forEach((p, i) => {
        const o = createPathStrip(p.points, { width: p.width, type: p.type, seed: ai * 10 + i });
        o.position.y = 0.02;
        flatRoots.push(o);
        flats.push(...stripRects(p.points, p.width));
      });
      a.streams.forEach((s, i) => {
        // Frozen water must read as ice whatever the Hearth's warmth: sit it above the melt ground.
        const o = createPathStrip(s.points, { width: s.width, type: 'ice', seed: ai * 10 + i + 5 });
        o.position.y = 0.1;
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

      const group = new THREE.Group();
      group.name = `dressing:${a.area}`;
      for (const m of mergeStatic(flatRoots, false, false)) {
        m.renderOrder = -1;
        group.add(m);
      }
      for (const m of mergeStatic(solidRoots, true, quality >= 1)) group.add(m);
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
    // Show opened areas and press the snow flat under their floors, paths and streams.
    const u = this.ground.uFlat.value;
    let n = 0;
    this.areas.forEach((a, i) => {
      const open = key[i] === '1';
      a.group.visible = open;
      if (!open) return;
      for (const f of a.flats) if (n < MAX_FLAT) u[n++].set(f.x0, f.z0, f.x1, f.z1);
    });
    this.ground.uFlatN.value = n;
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
