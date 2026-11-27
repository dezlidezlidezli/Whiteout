import type { Rect, Solid } from '../data/types';

export interface P2 {
  x: number;
  z: number;
}

/** Push a circle out of all solids. Mutates p. */
export function pushOut(p: P2, r: number, solids: readonly Solid[]): void {
  for (let iter = 0; iter < 2; iter++) {
    for (const s of solids) {
      if (s.kind === 'circle') {
        const dx = p.x - s.x;
        const dz = p.z - s.z;
        const min = r + s.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 1e-4;
          const k = (min - d) / d;
          p.x += (d2 === 0 ? 1e-4 : dx) * k;
          p.z += dz * k;
        }
      } else {
        const cx = Math.max(s.x - s.hw, Math.min(p.x, s.x + s.hw));
        const cz = Math.max(s.z - s.hd, Math.min(p.z, s.z + s.hd));
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0 && d2 < r * r) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (r - d);
          p.z += (dz / d) * (r - d);
        } else if (d2 === 0) {
          // Centre inside box: push out along the shallowest axis.
          const ox = s.hw + r - Math.abs(p.x - s.x);
          const oz = s.hd + r - Math.abs(p.z - s.z);
          if (ox < oz) p.x += Math.sign(p.x - s.x || 1) * ox;
          else p.z += Math.sign(p.z - s.z || 1) * oz;
        }
      }
    }
  }
}

export function inRects(x: number, z: number, r: number, rects: readonly Rect[]): boolean {
  for (const rc of rects) {
    if (x >= rc.x0 + r && x <= rc.x1 - r && z >= rc.z0 + r && z <= rc.z1 - r) return true;
  }
  return false;
}

/** Move a circle by (dx,dz) against solids, constrained to the walkable rect union. */
export function moveCircle(p: P2, dx: number, dz: number, r: number, solids: readonly Solid[], rects: readonly Rect[]): void {
  const ox = p.x;
  const oz = p.z;
  const tryPos = (nx: number, nz: number): boolean => {
    const q = { x: nx, z: nz };
    pushOut(q, r, solids);
    if (inRects(q.x, q.z, r, rects)) {
      p.x = q.x;
      p.z = q.z;
      return true;
    }
    return false;
  };
  if (tryPos(ox + dx, oz + dz)) {
    // Pushing (nearly) head-on into a round solid barely moves: slide round it instead of snagging.
    const len = Math.hypot(dx, dz);
    const gain = ((p.x - ox) * dx + (p.z - oz) * dz) / (len || 1);
    if (len > 1e-4 && gain < len * 0.35) {
      let best = { x: p.x, z: p.z, g: gain };
      for (const ang of [0.6, -0.6, 1.1, -1.1]) {
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const q = { x: ox + dx * c - dz * s, z: oz + dx * s + dz * c };
        pushOut(q, r, solids);
        if (!inRects(q.x, q.z, r, rects)) continue;
        const g = ((q.x - ox) * dx + (q.z - oz) * dz) / len;
        if (g > best.g + 1e-6) best = { x: q.x, z: q.z, g };
      }
      p.x = best.x;
      p.z = best.z;
    }
    return;
  }
  if (dx !== 0 && tryPos(ox + dx, oz)) return;
  if (dz !== 0 && tryPos(ox, oz + dz)) return;
  // Stuck (e.g. a building appeared on top of us): nudge out but stay inside the walkable space.
  const q = { x: ox, z: oz };
  pushOut(q, r, solids);
  if (inRects(q.x, q.z, r, rects)) {
    p.x = q.x;
    p.z = q.z;
  }
}

/** Steering helper for NPCs and the autopilot: returns a unit direction that bends around circles in the way. */
export function steer(p: P2, tx: number, tz: number, r: number, solids: readonly Solid[], side = 1): { x: number; z: number } {
  let dx = tx - p.x;
  let dz = tz - p.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-5) return { x: 0, z: 0 };
  dx /= dist;
  dz /= dist;
  let ax = 0;
  let az = 0;
  const look = Math.min(dist, 3.2);
  for (const s of solids) {
    const sr = s.kind === 'circle' ? s.r : Math.hypot(s.hw, s.hd) * 0.85;
    const rx = s.x - p.x;
    const rz = s.z - p.z;
    const along = rx * dx + rz * dz;
    if (along < 0 || along > look + sr) continue;
    const perp = rx * -dz + rz * dx; // signed lateral offset
    const clear = sr + r + 0.25;
    if (Math.abs(perp) >= clear) continue;
    // Do not avoid the obstacle we are heading to.
    const tdx = tx - s.x;
    const tdz = tz - s.z;
    if (s.kind === 'circle' ? tdx * tdx + tdz * tdz < (s.r + 0.15) * (s.r + 0.15) : Math.abs(tdx) < s.hw + 0.15 && Math.abs(tdz) < s.hd + 0.15) continue;
    const w = (1 - along / (look + sr)) * (clear - Math.abs(perp)) / clear;
    const dirSign = perp === 0 ? side : -Math.sign(perp);
    ax += -dz * dirSign * w * 2.2;
    az += dx * dirSign * w * 2.2;
  }
  let ox = dx + ax;
  let oz = dz + az;
  const l = Math.hypot(ox, oz) || 1;
  ox /= l;
  oz /= l;
  // Never steer backwards: blend towards the goal when avoidance fights it.
  if (ox * dx + oz * dz < 0.15) {
    ox = ox * 0.5 + dx * 0.5;
    oz = oz * 0.5 + dz * 0.5;
    const l2 = Math.hypot(ox, oz) || 1;
    ox /= l2;
    oz /= l2;
  }
  return { x: ox, z: oz };
}

function rectsAt(x: number, z: number, rects: readonly Rect[], m: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < rects.length; i++) {
    const rc = rects[i];
    if (x >= rc.x0 - m && x <= rc.x1 + m && z >= rc.z0 - m && z <= rc.z1 + m) out.push(i);
  }
  return out;
}

function nearestRect(x: number, z: number, rects: readonly Rect[]): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const rc = rects[i];
    const dx = Math.max(rc.x0 - x, 0, x - rc.x1);
    const dz = Math.max(rc.z0 - z, 0, z - rc.z1);
    const d = dx * dx + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * Next waypoint from (fx,fz) towards (tx,tz) through the walkable rect union: if both are in the
 * same rect, the target itself; otherwise the nearest point of the next rect-overlap "portal".
 */
export function navNext(rects: readonly Rect[], fx: number, fz: number, tx: number, tz: number): P2 {
  if (rects.length === 0) return { x: tx, z: tz };
  let from = rectsAt(fx, fz, rects, -0.3);
  if (from.length === 0) from = [nearestRect(fx, fz, rects)];
  let to = rectsAt(tx, tz, rects, 0.6);
  if (to.length === 0) to = [nearestRect(tx, tz, rects)];
  if (from.some((i) => to.includes(i))) return { x: tx, z: tz };
  // BFS over rect overlaps.
  const prev = new Map<number, number>();
  const queue = [...from];
  for (const f of from) prev.set(f, -1);
  let goal = -1;
  while (queue.length) {
    const a = queue.shift()!;
    if (to.includes(a)) {
      goal = a;
      break;
    }
    for (let b = 0; b < rects.length; b++) {
      if (prev.has(b) || !overlap(rects[a], rects[b])) continue;
      prev.set(b, a);
      queue.push(b);
    }
  }
  if (goal < 0) return { x: tx, z: tz };
  // Walk back to the first step after the start rect.
  let step = goal;
  while (prev.get(step)! >= 0 && !from.includes(prev.get(step)!)) step = prev.get(step)!;
  const start = prev.get(step)!;
  const o = overlap(rects[start], rects[step])!;
  const m = 0.7;
  const cx = (o.x0 + o.x1) / 2;
  const cz = (o.z0 + o.z1) / 2;
  const px = o.x1 - o.x0 > 2 * m ? Math.max(o.x0 + m, Math.min(o.x1 - m, (fx + tx) / 2)) : cx;
  const pz = o.z1 - o.z0 > 2 * m ? Math.max(o.z0 + m, Math.min(o.z1 - m, (fz + tz) / 2)) : cz;
  return { x: px, z: pz };
}

function overlap(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x0, b.x0);
  const x1 = Math.min(a.x1, b.x1);
  const z0 = Math.max(a.z0, b.z0);
  const z1 = Math.min(a.z1, b.z1);
  if (x1 - x0 < 0.8 || z1 - z0 < 0.8) return null;
  return { x0, x1, z0, z1 };
}
