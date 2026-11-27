// Yard dressing: draws the floors, palisade walls, fences, paths, frozen streams, clutter and
// landmarks described by `data.dressing` (see src/data/dressing.ts), using the art kit. First
// version: one group per area, shown once the area is open. Purely visual; walls collide in the sim.

import * as THREE from 'three';
import type { GameData } from '../data';
import type { Sim } from '../sim';
import { createFencePath, createFloor, createPathStrip, createProp, createWallPath } from './models';

type Theme = GameData['dressing'][number]['clutterZones'][number]['theme'];

const CLUTTER: Record<Theme, string[]> = {
  kitchen: ['crateStack', 'barrelCluster', 'sackPile', 'potShelf', 'basketPile', 'firewoodRack', 'washTub'],
  lumber: ['firewoodRack', 'fallenLog', 'toolRack', 'crateStack', 'sackPile'],
  fishing: ['dryingRack', 'basketPile', 'barrelCluster', 'supplySled', 'washTub'],
  mining: ['toolRack', 'crateStack', 'barrelCluster', 'supplySled', 'snowyBoulderCluster'],
  camp: ['firewoodRack', 'basketPile', 'crateStack', 'barrelCluster'],
  beacon: ['crateStack', 'toolRack', 'sackPile', 'snowyBoulderCluster'],
  wild: ['bush', 'sapling', 'fallenLog', 'snowyBoulderCluster', 'iceShards'],
};

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function quiet(o: THREE.Object3D, receive: boolean): void {
  o.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) {
      m.castShadow = false;
      m.receiveShadow = receive;
    }
  });
}

export class DressingView {
  private groups: { area: string; group: THREE.Group }[] = [];

  constructor(parent: THREE.Object3D, data: GameData) {
    data.dressing.forEach((a, ai) => {
      const g = new THREE.Group();
      g.name = `dressing:${a.area}`;
      const rand = rng(ai + 11);

      a.floors.forEach((f, i) => {
        const o = createFloor(f.type, f.w, f.d, { seed: ai * 10 + i });
        o.position.set(f.x, 0.012 * (i + 1), f.z);
        quiet(o, true);
        g.add(o);
      });
      a.paths.forEach((p, i) => {
        const o = createPathStrip(p.points, { width: p.width, type: p.type, seed: ai * 10 + i });
        o.position.y += 0.006;
        quiet(o, true);
        g.add(o);
      });
      a.streams.forEach((s, i) => {
        const o = createPathStrip(s.points, { width: s.width, type: 'ice', seed: ai * 10 + i + 5 });
        o.position.y += 0.004;
        quiet(o, true);
        g.add(o);
      });
      a.walls.forEach((w, i) => {
        const o = w.kind === 'fence'
          ? createFencePath(w.points, { seed: ai * 10 + i, gaps: w.gaps } as Parameters<typeof createFencePath>[1])
          : createWallPath(w.points, { seed: ai * 10 + i, gaps: w.gaps });
        quiet(o, false);
        g.add(o);
      });
      for (const l of a.landmarks) {
        const o = createProp(l.prop, { seed: l.seed ?? 0 });
        o.position.set(l.x, 0, l.z);
        o.rotation.y = l.yaw ?? 0;
        quiet(o, false);
        g.add(o);
      }
      // Clutter: a seeded scatter of themed props inside each zone, kept apart from one another.
      for (const z of a.clutterZones) {
        const list = CLUTTER[z.theme] ?? CLUTTER.wild;
        const n = Math.max(1, Math.round(z.w * z.d * (z.density ?? 0.09)));
        const placed: { x: number; z: number }[] = [];
        for (let k = 0, tries = 0; k < n && tries < n * 8; tries++) {
          const x = z.x + (rand() - 0.5) * Math.max(0, z.w - 1);
          const zz = z.z + (rand() - 0.5) * Math.max(0, z.d - 1);
          if (placed.some((p) => Math.hypot(p.x - x, p.z - zz) < 1.5)) continue;
          placed.push({ x, z: zz });
          const o = createProp(list[Math.floor(rand() * list.length)], { seed: Math.floor(rand() * 1000) });
          o.position.set(x, 0, zz);
          o.rotation.y = Math.floor(rand() * 4) * (Math.PI / 2) + (rand() - 0.5) * 0.3;
          quiet(o, false);
          g.add(o);
          k++;
        }
      }
      g.visible = false;
      parent.add(g);
      this.groups.push({ area: a.area, group: g });
    });
  }

  update(sim: Sim): void {
    for (const e of this.groups) e.group.visible = !!sim.state.areasOpen[e.area as keyof typeof sim.state.areasOpen];
  }

  dispose(): void {
    for (const e of this.groups) e.group.removeFromParent();
    this.groups = [];
  }
}
