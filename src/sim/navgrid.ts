// Grid navigation over the open walkable space, around every static solid (buildings, tents, props).
// A distance field is flood-filled from the target once (cached until the target or the world changes),
// then each query string-pulls along it to the farthest waypoint in clear line of sight.
// Used by Sim.navFromPlayer (guidance arrow + autopilot); falls back to rect portals when it can't help.

import type { Rect, Solid } from '../data/types';
import { inRects, pushOut } from './collision';

const CELL = 0.5;
const SEED_R = 1.6;

export class NavGrid {
  private x0 = 0;
  private z0 = 0;
  private nx = 0;
  private nz = 0;
  private free: Uint8Array = new Uint8Array(0);
  private dist: Int32Array = new Int32Array(0);
  private distKey = -1;
  private queue: Int32Array = new Int32Array(0);
  private rects: readonly Rect[];
  private radius: number;

  constructor(rects: readonly Rect[], solids: readonly Solid[], radius: number) {
    this.rects = rects;
    this.radius = radius;
    if (rects.length === 0) return;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const rc of rects) {
      x0 = Math.min(x0, rc.x0);
      x1 = Math.max(x1, rc.x1);
      z0 = Math.min(z0, rc.z0);
      z1 = Math.max(z1, rc.z1);
    }
    this.x0 = x0;
    this.z0 = z0;
    this.nx = Math.ceil((x1 - x0) / CELL) + 1;
    this.nz = Math.ceil((z1 - z0) / CELL) + 1;
    const n = this.nx * this.nz;
    this.free = new Uint8Array(n);
    this.dist = new Int32Array(n);
    this.queue = new Int32Array(n);
    const r = radius + 0.08;
    // Only test solids near each cell (bucket them coarsely).
    for (let j = 0; j < this.nz; j++) {
      const z = z0 + j * CELL;
      for (let i = 0; i < this.nx; i++) {
        const x = x0 + i * CELL;
        let inside = false;
        for (const rc of rects) {
          if (x >= rc.x0 + radius && x <= rc.x1 - radius && z >= rc.z0 + radius && z <= rc.z1 - radius) {
            inside = true;
            break;
          }
        }
        if (!inside) continue;
        let blocked = false;
        for (const s of solids) {
          if (s.kind === 'circle') {
            const dx = x - s.x;
            const dz = z - s.z;
            if (dx * dx + dz * dz < (s.r + r) * (s.r + r)) {
              blocked = true;
              break;
            }
          } else if (Math.abs(x - s.x) < s.hw + r && Math.abs(z - s.z) < s.hd + r) {
            const q = { x, z };
            pushOut(q, r, [s]);
            if (Math.abs(q.x - x) + Math.abs(q.z - z) > 1e-6) {
              blocked = true;
              break;
            }
          }
        }
        if (!blocked) this.free[j * this.nx + i] = 1;
      }
    }
  }

  private cellOf(x: number, z: number): number {
    const i = Math.round((x - this.x0) / CELL);
    const j = Math.round((z - this.z0) / CELL);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  private ensureField(tx: number, tz: number): void {
    const key = (Math.round(tx / CELL) + 10000) * 100000 + (Math.round(tz / CELL) + 10000);
    if (key === this.distKey) return;
    this.distKey = key;
    const { nx, nz, free, dist, queue } = this;
    dist.fill(-1);
    let head = 0;
    let tail = 0;
    const ci = Math.round((tx - this.x0) / CELL);
    const cj = Math.round((tz - this.z0) / CELL);
    // Seed the free cells around the target; a target inside a big solid (the Hearth) seeds its rim instead.
    for (const seedR of [SEED_R, 2.6, 4.0]) {
      const k = Math.ceil(seedR / CELL);
      for (let j = cj - k; j <= cj + k; j++) {
        for (let i = ci - k; i <= ci + k; i++) {
          if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
          const c = j * nx + i;
          if (!free[c] || dist[c] === 0) continue;
          const dx = (i - ci) * CELL;
          const dz = (j - cj) * CELL;
          if (dx * dx + dz * dz > seedR * seedR) continue;
          dist[c] = 0;
          queue[tail++] = c;
        }
      }
      if (tail > 0) break;
    }
    while (head < tail) {
      const c = queue[head++];
      const i = c % nx;
      const j = (c - i) / nx;
      const d = dist[c] + 1;
      if (i > 0 && free[c - 1] && dist[c - 1] < 0) (dist[c - 1] = d), (queue[tail++] = c - 1);
      if (i < nx - 1 && free[c + 1] && dist[c + 1] < 0) (dist[c + 1] = d), (queue[tail++] = c + 1);
      if (j > 0 && free[c - nx] && dist[c - nx] < 0) (dist[c - nx] = d), (queue[tail++] = c - nx);
      if (j < nz - 1 && free[c + nx] && dist[c + nx] < 0) (dist[c + nx] = d), (queue[tail++] = c + nx);
    }
  }

  private clear(ax: number, az: number, bx: number, bz: number): boolean {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5));
    for (let s = 1; s <= n; s++) {
      const x = ax + ((bx - ax) * s) / n;
      const z = az + ((bz - az) * s) / n;
      const c = this.cellOf(x, z);
      if (c < 0 || !this.free[c] || !inRects(x, z, this.radius * 0.9, this.rects)) return false;
    }
    return true;
  }

  private memoFrom = -1;
  private memoTo = -1;
  private memo: { x: number; z: number } | null = null;

  /** Next waypoint from (fx,fz) towards (tx,tz), or null if the grid can't help (caller falls back). */
  next(fx: number, fz: number, tx: number, tz: number): { x: number; z: number } | null {
    if (this.nx === 0) return null;
    // Same player cell (quantised finer than the grid) and same target: same answer.
    const from = Math.round(fx * 8) * 100003 + Math.round(fz * 8);
    const to = Math.round(tx * 8) * 100003 + Math.round(tz * 8);
    if (from === this.memoFrom && to === this.memoTo) return this.memo;
    this.memoFrom = from;
    this.memoTo = to;
    this.memo = this.nextRaw(fx, fz, tx, tz);
    return this.memo;
  }

  private nextRaw(fx: number, fz: number, tx: number, tz: number): { x: number; z: number } | null {
    if (Math.hypot(tx - fx, tz - fz) <= SEED_R + 0.3) return null;
    this.ensureField(tx, tz);
    const { nx, dist } = this;
    // Start from the player's cell (or the best free neighbour if pressed against a solid).
    let c = this.cellOf(fx, fz);
    if (c < 0) return null;
    if (dist[c] < 0) {
      let best = -1;
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          const cc = c + dj * nx + di;
          if (cc < 0 || cc >= dist.length || dist[cc] < 0) continue;
          if (best < 0 || dist[cc] < dist[best]) best = cc;
        }
      }
      if (best < 0) return null;
      c = best;
    }
    if (dist[c] === 0) return null;
    // Follow the gradient; keep the farthest cell still in clear line of sight.
    let wp = c;
    let first = -1;
    let cur = c;
    for (let step = 0; step < 40 && dist[cur] > 0; step++) {
      const i = cur % nx;
      let nb = -1;
      for (const o of [-1, 1, -nx, nx]) {
        const cc = cur + o;
        if (cc < 0 || cc >= dist.length) continue;
        if ((o === -1 && i === 0) || (o === 1 && i === nx - 1)) continue;
        if (dist[cc] >= 0 && dist[cc] < dist[cur]) {
          nb = cc;
          break;
        }
      }
      if (nb < 0) break;
      cur = nb;
      if (first < 0) first = cur;
      const px = this.x0 + (cur % nx) * CELL;
      const pz = this.z0 + Math.floor(cur / nx) * CELL;
      if (this.clear(fx, fz, px, pz)) wp = cur;
      else if (step > 3) break;
    }
    if (dist[cur] === 0 && wp === cur && this.clear(fx, fz, tx, tz)) return { x: tx, z: tz };
    if (wp === c && first >= 0) wp = first;
    return { x: this.x0 + (wp % nx) * CELL, z: this.z0 + Math.floor(wp / nx) * CELL };
  }
}
