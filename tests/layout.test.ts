// Layout audit: nothing in the world may visibly stand inside something else, inside a frost wall or a
// palisade, on a conveyor or a walk lane, or hidden behind a tall building from the fixed camera.
// Footprints here are VISUAL radii (how big the model looks), not collision solids.
import { describe, expect, it } from 'vitest';
import { FLAT_DECOR, FOOTPRINT, FROST_WALL_HALF, GAME_DATA as D, NATURAL_DECOR, TOLERANCE, segDist, wallSolids } from '../src/data';
import type { Vec2 } from '../src/data';

const R = (m: string, fallback = 0.8) => FOOTPRINT[m] ?? fallback;
/** Buildings that need 1.5 m of clear ground to pads/counters/conveyors and hide what stands behind them. */
const TALL = new Set(['cabin', 'smokehouse', 'greatKitchen', 'sawmill', 'beacon', 'forge']);

interface Thing { id: string; kind: string; x: number; z: number; r: number; natural: boolean; group?: string }

function things(): Thing[] {
  const out: Thing[] = [];
  for (const s of D.stations) {
    const m = (s as { model?: string }).model ?? s.type;
    out.push({ id: s.id, kind: m, x: s.x, z: s.z, r: R(m, 1), natural: false, group: s.type === 'counter' ? 'counter' : 'station' });
  }
  for (const d of D.decor) {
    if (FLAT_DECOR.has(d.model)) continue;
    out.push({ id: d.id, kind: d.model, x: d.x, z: d.z, r: R(d.model) * (d.scale ?? 1), natural: NATURAL_DECOR.has(d.model), group: 'decor' });
  }
  for (const a of D.dressing) for (const l of a.landmarks) out.push({ id: `lm:${a.area}:${l.prop}@${l.x},${l.z}`, kind: l.prop, x: l.x, z: l.z, r: R(l.prop, 0.6), natural: false, group: 'decor' });
  D.camp.tentSpots.forEach((t, i) => out.push({ id: `tent${i}`, kind: 'tent', x: t.x, z: t.z, r: FOOTPRINT.tent, natural: false }));
  for (const p of D.pads) out.push({ id: p.id, kind: 'pad', x: p.x, z: p.z, r: FOOTPRINT.pad, natural: false, group: 'pad' });
  return out;
}

/** A pad and the thing it builds/hires/unlocks may share a spot (the pad disappears when the building appears). */
function padBuilds(padId: string, otherId: string): boolean {
  const def = D.pads.find((p) => p.id === padId);
  if (!def) return false;
  return def.effects.some((e) => (e as { id?: string }).id === otherId || (e as { helper?: string }).helper === otherId
    || ((e as { ids?: string[] }).ids ?? []).includes(otherId));
}
const linkIds = (l: (typeof D.links)[number]) => new Set([l.from, l.to, l.id]);

export function findProblems(): string[] {
  const all = things();
  const bad: string[] = [];
  const TOL = TOLERANCE;
  const at = (t: Thing) => `(${t.x.toFixed(1)}, ${t.z.toFixed(1)})`;
  // 1. Things inside each other.
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (a.natural && b.natural) continue;
      if (a.group === 'pad' && b.group === 'pad' && Math.hypot(a.x - b.x, a.z - b.z) < 0.05) continue;
      if ((a.group === 'pad' && padBuilds(a.id, b.id)) || (b.group === 'pad' && padBuilds(b.id, a.id))) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      // Buildings keep 1.5 m of clear ground to pads and counters.
      const gap = (TALL.has(a.kind) && (b.group === 'pad' || b.group === 'counter')) || (TALL.has(b.kind) && (a.group === 'pad' || a.group === 'counter')) ? 1.5 : 0;
      const pen = a.r + b.r + gap - d;
      if (pen > TOL) bad.push(`${a.kind}:${a.id} x ${b.kind}:${b.id} overlap ${pen.toFixed(2)} m at ${at(a)}`);
    }
  }
  // 2. Frost walls: built things keep 2 m clear of the wall section (natural scatter just stays out of it).
  for (const w of D.walls) {
    for (const t of all) {
      for (let k = 0; k + 1 < w.points.length; k++) {
        const d = segDist(t.x, t.z, w.points[k], w.points[k + 1]);
        const pen = t.r + (t.natural ? FROST_WALL_HALF : FROST_WALL_HALF + 2.0) - d;
        if (pen > TOL) {
          bad.push(`frostWall:${w.id} x ${t.kind}:${t.id} overlap ${pen.toFixed(2)} m at ${at(t)}`);
          break;
        }
      }
    }
  }
  // 3. Palisades/fences (solid, gaps cut out).
  for (const b of wallSolids(D.dressing)) {
    for (const t of all) {
      if (t.natural) continue;
      const dx = Math.max(Math.abs(t.x - b.x) - b.hw, 0);
      const dz = Math.max(Math.abs(t.z - b.z) - b.hd, 0);
      const pen = t.r - Math.hypot(dx, dz);
      if (pen > TOL + 0.1) bad.push(`palisade@(${b.x.toFixed(1)}, ${b.z.toFixed(1)}) x ${t.kind}:${t.id} overlap ${pen.toFixed(2)} m`);
    }
  }
  // 4. Conveyors (0.7 m wide) keep clear of everything but their own ends (and 1.5 m from buildings).
  for (const l of D.links) {
    const own = linkIds(l);
    for (const t of all) {
      if (t.natural || own.has(t.id) || (t.group === 'pad' && (padBuilds(t.id, l.id) || padBuilds(t.id, l.from) || padBuilds(t.id, l.to)))) continue;
      let d = Infinity;
      for (let k = 0; k + 1 < l.path.length; k++) d = Math.min(d, segDist(t.x, t.z, l.path[k], l.path[k + 1]));
      const pen = t.r + 0.35 + (TALL.has(t.kind) ? 1.5 : 0) - d;
      if (pen > TOL) bad.push(`conveyor:${l.id} x ${t.kind}:${t.id} overlap ${pen.toFixed(2)} m at ${at(t)}`);
    }
  }
  // 5. Pads stay off the walk lanes (dressing paths).
  for (const a of D.dressing) {
    for (const p of a.paths) {
      for (const t of all) {
        if (t.group !== 'pad') continue;
        for (let k = 0; k + 1 < p.points.length; k++) {
          const A: Vec2 = { x: p.points[k][0], z: p.points[k][1] };
          const B: Vec2 = { x: p.points[k + 1][0], z: p.points[k + 1][1] };
          const pen = t.r + p.width / 2 - segDist(t.x, t.z, A, B);
          if (pen > TOL) {
            bad.push(`path@${a.area} x pad:${t.id} overlap ${pen.toFixed(2)} m at ${at(t)}`);
            break;
          }
        }
      }
    }
  }
  // 6. Hidden from the camera (south, ~50°): no pad or station just north of a tall building.
  for (const b of all) {
    if (!TALL.has(b.kind)) continue;
    for (const t of all) {
      if (t === b || (t.group !== 'pad' && t.group !== 'station' && t.group !== 'counter')) continue;
      if (t.group === 'pad' && padBuilds(t.id, b.id)) continue;
      const behind = b.z - t.z;
      if (behind > 0 && behind < b.r + 3 && Math.abs(t.x - b.x) < b.r * 0.8) bad.push(`hidden: ${t.kind}:${t.id} behind ${b.kind}:${b.id} at ${at(t)}`);
    }
  }
  return bad;
}

describe('world layout', () => {
  it('has no clipping, no wall/conveyor/lane intrusions and nothing hidden behind buildings', () => {
    const bad = findProblems();
    if (bad.length) (globalThis as any).process?.stdout?.write?.(`LAYOUT ${bad.length} problems\n${bad.join('\n')}\nEND\n`);
    expect(bad).toEqual([]);
  });
  it('the camp holds a village: at least 12 tent plots and 3 cabins', () => {
    expect(D.camp.tentSpots.length).toBeGreaterThanOrEqual(12);
    expect(D.decor.filter((d) => d.area === 'camp' && d.model === 'cabin').length).toBeGreaterThanOrEqual(3);
  });
  it('the Hearth is a short walk from the Kettle Yard kettles (≤ 4 s)', () => {
    const k = D.stations.find((s) => s.id === 'kettleA')!;
    expect(Math.hypot(k.x - D.camp.hearth.x, k.z - D.camp.hearth.z) / D.balance.playerSpeed).toBeLessThan(4);
  });
});
