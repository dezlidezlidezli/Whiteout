// Grid flood-fill reachability over the whole world with everything built (all unlocks, all tents,
// all nodes standing). Used by tests to prove every pad and station can be reached on foot.

import type { GameData, Solid } from '../src/data';
import { Sim } from '../src/sim';
import { inRects, pushOut } from '../src/sim/collision';

export interface ReachMap {
  ok(x: number, z: number): boolean;
  /** Any reachable cell within `r` of (x,z)? */
  near(x: number, z: number, r: number): boolean;
}

export function buildReach(data: GameData, cell = 0.2): ReachMap {
  const sim = new Sim(data, { seed: 1 });
  for (const s of data.stations) sim.state.unlocked[s.id] = true;
  for (const d of data.decor) sim.state.unlocked[d.id] = true;
  for (const a of data.areas) sim.state.areasOpen[a.id] = true;
  sim.state.tents = data.camp.tentSpots.length;
  sim.invalidateSolids();
  sim.invalidateRects();
  const solids: Solid[] = sim.allSolids();
  const rects = sim.walkRects();
  const r = data.balance.playerRadius;
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
  const nx = Math.ceil((x1 - x0) / cell) + 1;
  const nz = Math.ceil((z1 - z0) / cell) + 1;
  const free = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * cell;
      const z = z0 + j * cell;
      if (!inRects(x, z, r, rects)) continue;
      const q = { x, z };
      pushOut(q, r, solids);
      if (Math.hypot(q.x - x, q.z - z) < 1e-6) free[j * nx + i] = 1;
    }
  }
  const seen = new Uint8Array(nx * nz);
  const idx = (x: number, z: number) => {
    const i = Math.round((x - x0) / cell);
    const j = Math.round((z - z0) / cell);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
  };
  const start = idx(data.playerStart.x, data.playerStart.z);
  const todo = [start];
  seen[start] = 1;
  while (todo.length) {
    const k = todo.pop()!;
    const i = k % nx;
    const j = (k - i) / nx;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const kk = b * nx + a;
      if (!free[kk] || seen[kk]) continue;
      seen[kk] = 1;
      todo.push(kk);
    }
  }
  const ok = (x: number, z: number) => {
    const k = idx(x, z);
    return k >= 0 && !!seen[k];
  };
  return {
    ok,
    near(x, z, rad) {
      for (let dz = -rad; dz <= rad + 1e-9; dz += cell) {
        for (let dx = -rad; dx <= rad + 1e-9; dx += cell) if (dx * dx + dz * dz <= rad * rad && ok(x + dx, z + dz)) return true;
      }
      return false;
    },
  };
}

/** Narrowest free gap check helper: is a straight walk from a to b clear at every sample? */
export function clearLine(m: ReachMap, ax: number, az: number, bx: number, bz: number): boolean {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2);
  for (let i = 0; i <= n; i++) if (!m.near(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, 0.2)) return false;
  return true;
}
