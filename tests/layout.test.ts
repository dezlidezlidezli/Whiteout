// Layout audit: nothing in the world may visibly stand inside something else, inside a frost wall or a
// palisade, on a conveyor or a walk lane, or hidden behind a tall building from the fixed camera.
// Footprints here are VISUAL radii (how big the model looks), not collision solids.
import { beforeAll, describe, expect, it } from 'vitest';
import { ALL_MECHANICS, FLAT_DECOR, FOOTPRINT, FROST_WALL_HALF, GAME_DATA, NATURAL_DECOR, TOLERANCE, segDist, tentLevel, wallGoneBy, wallSolids, withMechanics } from '../src/data';
import type { CounterDef, GameData, Vec2 } from '../src/data';

/** The configuration under audit (both the shipped one, mechanics off, and every mechanic on). */
let D: GameData = GAME_DATA;

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
      // A late tent plot (needed only once this wall has melted) just keeps clear of the ice itself.
      const late = t.kind === 'tent' && wallGoneBy(D, w.area, tentLevel(D, Number(t.id.slice(4))));
      for (let k = 0; k + 1 < w.points.length; k++) {
        const d = segDist(t.x, t.z, w.points[k], w.points[k + 1]);
        const pen = t.r + (t.natural ? FROST_WALL_HALF : FROST_WALL_HALF + (late ? 0.3 : 2.0)) - d;
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
  // 7. Readable fronts (notice boards, sign boards, market stalls) face the south camera (within 60°).
  const READABLE = new Set(['noticeBoard', 'signBoard', 'marketStall']);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  for (const s of D.stations) if (READABLE.has((s as { model: string }).model) && Math.abs(wrap(s.rot ?? 0)) > Math.PI / 3) bad.push(`edge-on: ${s.id} rot ${s.rot}`);
  for (const d of D.decor) if (READABLE.has(d.model) && Math.abs(wrap(d.rot ?? 0)) > Math.PI / 3) bad.push(`edge-on: ${d.id} rot ${d.rot}`);
  for (const a of D.dressing) for (const l of a.landmarks) if (READABLE.has(l.prop) && Math.abs(wrap(l.yaw ?? 0)) > Math.PI / 3) bad.push(`edge-on: ${l.prop}@${l.x},${l.z}`);
  // 7b. Counters serve towards their queue; cabin doors face the camera's half of the compass or the Hearth.
  // (Models face +z at rot 0; rot θ turns the front to (sin θ, cos θ).)
  const front = (rot: number) => ({ x: Math.sin(rot), z: Math.cos(rot) });
  for (const s of D.stations) {
    if (s.type !== 'counter') continue;
    const f = front(s.rot ?? 0);
    const q = (s as CounterDef).queueDir;
    if (f.x * q.x + f.z * q.z < Math.cos(Math.PI / 6)) bad.push(`counter back to front: ${s.id} rot ${s.rot} queue ${q.x},${q.z}`);
  }
  for (const d of D.decor) {
    if (d.model !== 'cabin') continue;
    const f = front(d.rot ?? 0);
    const hx = D.camp.hearth.x - d.x;
    const hz = D.camp.hearth.z - d.z;
    const toHearth = (f.x * hx + f.z * hz) / Math.hypot(hx, hz);
    if (f.z < 0 && toHearth < Math.cos(Math.PI / 3)) bad.push(`cabin door hidden: ${d.id} rot ${d.rot}`);
  }
  // 8. Pads that can show at the same time stand ≥ 3 m apart (their labels must not overlap).
  const req = new Map(D.pads.map((p) => [p.id, p.requires] as const));
  const after = (a: string, b: string, seen = new Set<string>()): boolean => {
    if (seen.has(a)) return false;
    seen.add(a);
    return (req.get(a) ?? []).some((r) => r === b || after(r, b, seen));
  };
  for (let i = 0; i < D.pads.length; i++) {
    for (let j = i + 1; j < D.pads.length; j++) {
      const a = D.pads[i];
      const b = D.pads[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < 0.05 || d >= 3.0 || after(a.id, b.id) || after(b.id, a.id)) continue;
      bad.push(`labels: ${a.id} x ${b.id} only ${d.toFixed(2)} m apart`);
    }
  }
  return bad;
}

/** Every metre of the walkable world's outline is a wall/fence, a frost wall, a counter in its gap, a gate
 * corridor (into another area) or a declared natural edge: no invisible walls. */
export function bareEdges(): string[] {
  const rects = D.areas.flatMap((a) => a.rects);
  const inside = (x: number, z: number, m: number) => rects.some((r) => x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m);
  const solids = wallSolids(D.dressing);
  const counters = D.stations.filter((s) => s.type === 'counter');
  const lines: { a: Vec2; b: Vec2; tol: number }[] = [];
  for (const w of D.walls) for (let k = 0; k + 1 < w.points.length; k++) lines.push({ a: w.points[k], b: w.points[k + 1], tol: 1.0 });
  for (const a of D.dressing) for (const e of a.edges ?? []) {
    for (let k = 0; k + 1 < e.points.length; k++) lines.push({ a: { x: e.points[k][0], z: e.points[k][1] }, b: { x: e.points[k + 1][0], z: e.points[k + 1][1] }, tol: 0.6 });
  }
  const bad: string[] = [];
  for (const r of rects) {
    const edge: [number, number, number, number][] = [[r.x0, r.z0, r.x1, r.z0], [r.x1, r.z0, r.x1, r.z1], [r.x1, r.z1, r.x0, r.z1], [r.x0, r.z1, r.x0, r.z0]];
    for (const [ax, az, bx, bz] of edge) {
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 0.5));
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const z = az + ((bz - az) * k) / n;
        // Interior (shared with another rect: a gate or an overlap) is not an outline.
        const ox = (bz - az) !== 0 ? 0.3 : 0;
        const oz = (bx - ax) !== 0 ? 0.3 : 0;
        if (inside(x + ox, z + oz, 0) && inside(x - ox, z - oz, 0)) continue;
        if (solids.some((s) => Math.max(Math.abs(x - s.x) - s.hw, 0) ** 2 + Math.max(Math.abs(z - s.z) - s.hd, 0) ** 2 < 0.6 * 0.6)) continue;
        if (lines.some((l) => segDist(x, z, l.a, l.b) < l.tol)) continue;
        if (counters.some((c) => Math.hypot(c.x - x, c.z - z) < 1.8)) continue;
        bad.push(`bare edge at (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
    }
  }
  return bad;
}

const CONFIGS: [string, GameData][] = [
  ['shipped (mechanics off)', GAME_DATA],
  ['all mechanics on', withMechanics(GAME_DATA, ALL_MECHANICS)],
];
for (const [name, data] of CONFIGS) describe(`world layout: ${name}`, () => {
  beforeAll(() => {
    D = data;
  });
  it('every edge of the walkable world is drawn (no invisible walls); every gate has an arch and a path', () => {
    const bare = bareEdges();
    if (bare.length) (globalThis as any).process?.stdout?.write?.(`BARE ${bare.length}\n${bare.slice(0, 60).join('\n')}\nEND\n`);
    expect(bare).toEqual([]);
    for (const a of D.areas) {
      if (a.id === 'camp' || a.id === 'beaconPeak' || a.id === 'kettleYard') continue;
      const gate = a.rects[1];
      expect(gate, a.id).toBeDefined();
      const d = D.dressing.find((x) => x.area === a.id)!;
      const inGate = (x: number, z: number) => x >= gate.x0 - 1 && x <= gate.x1 + 1 && z >= gate.z0 - 1 && z <= gate.z1 + 1;
      expect(d.landmarks.some((l) => l.prop === 'woodenArch' && inGate(l.x, l.z)), `${a.id} arch`).toBe(true);
      expect(d.paths.some((p) => p.points.some(([x, z]) => inGate(x, z))), `${a.id} path`).toBe(true);
    }
  });

  it('has no clipping, no wall/conveyor/lane intrusions and nothing hidden behind buildings', () => {
    const bad = findProblems();
    if (bad.length) (globalThis as any).process?.stdout?.write?.(`LAYOUT ${bad.length} problems\n${bad.join('\n')}\nEND\n`);
    expect(bad).toEqual([]);
  });
  it('the camp holds a village: every tent plot the housing needs (16) and 3 cabins', () => {
    expect(D.camp.tentSpots.length).toBe(D.camp.housing!.tentsPerLevel.at(-1));
    expect(D.decor.filter((d) => d.area === 'camp' && d.model === 'cabin').length).toBeGreaterThanOrEqual(3);
  });
  it('the Hearth is a short walk from the Kettle Yard kettles (≤ 4 s)', () => {
    const k = D.stations.find((s) => s.id === 'kettleA')!;
    expect(Math.hypot(k.x - D.camp.hearth.x, k.z - D.camp.hearth.z) / D.balance.playerSpeed).toBeLessThan(4);
  });
});
