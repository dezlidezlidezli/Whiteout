// Ground surface height from the dressing data (floors, paths, streams), so ground-level decals and
// props (pads, rings, mats, fishing holes, blob shadows) always sit ON whatever surface is there.

import type { GameData } from '../data';

interface Slab { x0: number; z0: number; x1: number; z1: number; top: number; kind: 'floor' | 'path' | 'stream' }

/** Heights used by DressingView when it places the slabs (keep in sync). */
export const FLOOR_BASE = 0.004;
export const FLOOR_STEP = 0.004;
const FLOOR_TOP: Record<string, number> = { planks: 0.085, cobble: 0.065, stone: 0.065, packedEarth: 0.06, ice: 0.06 };
export const PATH_Y = 0.02;
const PATH_THICK = 0.035;
const STREAM_THICK = 0.045;

export class SurfaceMap {
  private slabs: Slab[] = [];

  constructor(data: GameData, skipFloor: (area: string, type: string) => boolean) {
    data.dressing.forEach((a) => {
      a.floors.forEach((f, i) => {
        if (skipFloor(a.area, f.type)) return;
        this.slabs.push({ x0: f.x - f.w / 2, z0: f.z - f.d / 2, x1: f.x + f.w / 2, z1: f.z + f.d / 2, top: FLOOR_BASE + i * FLOOR_STEP + (FLOOR_TOP[f.type] ?? 0.07), kind: 'floor' });
      });
      for (const p of a.paths) this.addStrip(p.points, p.width, PATH_Y + PATH_THICK, 'path');
    });
    // Streams sit on top of whatever floor is under them.
    for (const a of data.dressing) {
      for (const s of a.streams) {
        let base = 0;
        for (const p of s.points) base = Math.max(base, this.floorTop(p[0], p[1]));
        this.addStrip(s.points, s.width, base + 0.01 + STREAM_THICK, 'stream', base + 0.01);
      }
    }
  }

  private addStrip(points: [number, number][], w: number, top: number, kind: Slab['kind'], _base = 0): void {
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1];
      const [bx, bz] = points[i];
      this.slabs.push({ x0: Math.min(ax, bx) - w / 2, z0: Math.min(az, bz) - w / 2, x1: Math.max(ax, bx) + w / 2, z1: Math.max(az, bz) + w / 2, top, kind });
    }
  }

  private floorTop(x: number, z: number): number {
    let h = 0;
    for (const s of this.slabs) if (s.kind === 'floor' && x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && s.top > h) h = s.top;
    return h;
  }

  /** Base height for a stream strip whose polyline is given (top of the floor under it + 1 cm). */
  streamBase(points: [number, number][]): number {
    let base = 0;
    for (const p of points) base = Math.max(base, this.floorTop(p[0], p[1]));
    return base + 0.01;
  }

  /** Top of the highest surface at (x, z); 0 on open ground. */
  heightAt(x: number, z: number): number {
    let h = 0;
    for (const s of this.slabs) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && s.top > h) h = s.top;
    return h;
  }
}
