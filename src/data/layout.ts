// World placement. Each area is authored in its own coordinates (world.ts/late.ts/dressing.ts) and
// placed here by a rigid per-area offset, so yards are never distorted when the camp grows. Then the
// camp's tent plots are packed into the free camp ground and the procedural forest is grown around
// the final shapes.

import type { AreaDressing } from './dressing';
import { FOOTPRINT, FROST_WALL_HALF, segDist } from './declutter';
import type { AreaId, CounterDef, DecorDef, GameData, Rect, StationDef, Vec2 } from './types';

/** Current world-layout revision (see GameData.layoutRev). 2 = compact yards, 3 = village camp. */
export const LAYOUT_REV = 3;

/** World offset of each area's authored coordinates. */
export const AREA_OFFSET: Record<AreaId, Vec2> = {
  camp: { x: 0, z: 0 },
  kettleYard: { x: 0, z: 4.5 },
  pinewood: { x: -14, z: 0 },
  frozenLake: { x: 14, z: 0 },
  ironridge: { x: 0, z: -13 },
  beaconPeak: { x: 0, z: -21 },
};

/** Authored (pre-placement) rects, used to tell which area an authored cross-area point belongs to. */
const AUTHORED: [AreaId, Rect][] = [
  ['kettleYard', { x0: -6.5, x1: 6.5, z0: 5.5, z1: 16.2 }],
  ['pinewood', { x0: -27.6, x1: -4.6, z0: -10.4, z1: 10.8 }],
  ['frozenLake', { x0: 4.6, x1: 29.4, z0: -10.4, z1: 8.2 }],
  ['ironridge', { x0: -16.4, x1: 9.4, z0: -34.4, z1: -4.2 }],
  ['beaconPeak', { x0: -8.4, x1: 8.4, z0: -61, z1: -34.4 }],
];

function areaOf(x: number, z: number, fallback: AreaId): AreaId {
  for (const [id, r] of AUTHORED) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return id;
  return fallback;
}
const sh = (p: Vec2, a: AreaId): Vec2 => ({ x: p.x + AREA_OFFSET[a].x, z: p.z + AREA_OFFSET[a].z });
const shAuto = (p: Vec2, fallback: AreaId): Vec2 => sh(p, areaOf(p.x, p.z, fallback));
const shRect = <T extends Rect>(r: T, a: AreaId): T => ({ ...r, x0: r.x0 + AREA_OFFSET[a].x, x1: r.x1 + AREA_OFFSET[a].x, z0: r.z0 + AREA_OFFSET[a].z, z1: r.z1 + AREA_OFFSET[a].z });

/** Places every area at its offset. Camp content and the frost walls are authored in world space. */
export function placeAreas(d: GameData, lanes: Rect[]): { data: GameData; lanes: Rect[] } {
  const stations = d.stations.map((s): StationDef => {
    const a = s.area;
    const p = sh(s, a);
    if (s.type !== 'counter') return { ...s, x: p.x, z: p.z };
    const c = s as CounterDef;
    return {
      ...c, x: p.x, z: p.z,
      queueStart: sh(c.queueStart, a),
      queuePath: c.queuePath?.map((q) => sh(q, a)),
      emberSpot: sh(c.emberSpot, a),
      spawn: sh(c.spawn, a),
      exitPath: c.exitPath.map((q) => shAuto(q, a)),
    };
  });
  const decor = d.decor.map((o): DecorDef => ({ ...o, ...sh(o, o.area) }));
  const pads = d.pads.map((p) => ({ ...p, ...sh(p, p.area) }));
  const links = d.links.map((l) => ({ ...l, path: l.path.map((q) => sh(q, l.area)) }));
  const helpers = d.helpers.map((h) => {
    const a = areaOf(h.home.x, h.home.z, 'camp');
    return { ...h, home: sh(h.home, a), route: h.route?.map((q) => shAuto(q, a)) };
  });
  const areas = d.areas.map((a) => ({ ...a, rects: a.rects.map((r) => shRect(r, a.id)), focus: sh(a.focus, a.id) }));
  const dressing = d.dressing.map((a): AreaDressing => {
    const o = AREA_OFFSET[a.area as AreaId] ?? { x: 0, z: 0 };
    const xz = ([x, z]: [number, number]): [number, number] => [x + o.x, z + o.z];
    return {
      ...a,
      floors: a.floors.map((f) => ({ ...f, x: f.x + o.x, z: f.z + o.z })),
      walls: a.walls.map((w) => ({ ...w, points: w.points.map(xz) })),
      paths: a.paths.map((p) => ({ ...p, points: p.points.map(xz) })),
      streams: a.streams.map((s) => ({ ...s, points: s.points.map(xz) })),
      clutterZones: a.clutterZones.map((c) => ({ ...c, x: c.x + o.x, z: c.z + o.z })),
      landmarks: a.landmarks.map((l) => ({ ...l, x: l.x + o.x, z: l.z + o.z })),
    };
  });
  const finale = { ...d.finale, rewardSpot: sh(d.finale.rewardSpot, 'beaconPeak') };
  const outLanes = [shRect(lanes[0], 'frozenLake'), shRect(lanes[1], 'ironridge')];
  return {
    data: { ...d, stations, decor, pads, links, helpers, areas, dressing, finale, playerStart: sh(d.playerStart, 'kettleYard') },
    lanes: outLanes,
  };
}

// ------------------------------------------------------------------ camp tents

interface Disc { x: number; z: number; r: number }

/** Greedy tent plots in the free camp ground: nearest the fire first, clear of everything built,
 * the four paths, the yard mouth and ≥ 2 m clear of the frost walls. */
export function packTents(d: GameData, count: number): { x: number; z: number; rot: number }[] {
  const camp = d.areas.find((a) => a.id === 'camp')!.rects[0];
  const tent = FOOTPRINT.tent;
  const block: Disc[] = [{ x: d.camp.hearth.x, z: d.camp.hearth.z, r: 2.95 + 1.2 }];
  const fp = (m: string) => FOOTPRINT[m] ?? 0.8;
  for (const s of d.stations) if (s.area === 'camp') block.push({ x: s.x, z: s.z, r: fp((s as { model: string }).model) });
  for (const o of d.decor) if (o.area === 'camp' && !o.id.startsWith('tree')) block.push({ x: o.x, z: o.z, r: fp(o.model) * (o.scale ?? 1) });
  for (const p of d.pads) if (p.area === 'camp') block.push({ x: p.x, z: p.z, r: FOOTPRINT.pad });
  for (const a of d.dressing) if (a.area === 'camp') for (const l of a.landmarks) block.push({ x: l.x, z: l.z, r: fp(l.prop) });
  const out: { x: number; z: number; rot: number }[] = [];
  const cand: Vec2[] = [];
  for (let x = camp.x0 + 1; x <= camp.x1 - 1; x += 0.5) for (let z = camp.z0 + 1; z <= camp.z1 - 1; z += 0.5) cand.push({ x, z });
  const hd = (c: Vec2) => Math.hypot(c.x - d.camp.hearth.x, c.z - d.camp.hearth.z);
  cand.sort((a, b) => hd(a) - hd(b) || a.x - b.x || a.z - b.z);
  for (const c of cand) {
    if (out.length >= count) break;
    // The four paths radiating from the fire (2.2 m wide) and the mouth of the Kettle Yard.
    if (Math.abs(c.x) < 1.1 + tent + 0.3 || Math.abs(c.z) < 1.1 + tent + 0.3) continue;
    if (c.z > 7.0 && Math.abs(c.x) < 8.0) continue;
    if (c.z > camp.z1 - tent - 0.6) continue;
    let ok = true;
    for (const w of d.walls) {
      for (let k = 0; k + 1 < w.points.length; k++) if (segDist(c.x, c.z, w.points[k], w.points[k + 1]) < tent + FROST_WALL_HALF + 2.0) ok = false;
    }
    if (!ok) continue;
    if (block.some((b) => Math.hypot(b.x - c.x, b.z - c.z) < b.r + tent + 0.35)) continue;
    if (out.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < 2 * tent + 0.35)) continue;
    out.push({ x: c.x, z: c.z, rot: Math.atan2(-c.x, -c.z) });
  }
  return out;
}

// ------------------------------------------------------------------ forest

function lrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The procedural forest around the final play space (never on it, its walls, queues or walk-in lanes). */
export function growForest(d: GameData, lanes: Rect[]): DecorDef[] {
  const yard = d.areas.find((a) => a.id === 'kettleYard')!.rects[0];
  const near = (x: number, z: number, m: number): boolean => {
    for (const a of d.areas) for (const rc of a.rects) if (x > rc.x0 - m && x < rc.x1 + m && z > rc.z0 - m && z < rc.z1 + m) return true;
    // Icebound crowds and walk-in lanes south of the Kettle Yard.
    if (z > yard.z1 - 1 && z < yard.z1 + 28 && Math.abs(x) < 9) return true;
    for (const rc of lanes) if (x > rc.x0 - m && x < rc.x1 + m && z > rc.z0 - m && z < rc.z1 + m) return true;
    return false;
  };
  const out: DecorDef[] = [];
  const r = lrng(99);
  let i = 0;
  for (let z = -70; z <= 52; z += 2.6) {
    for (let x = -46; x <= 46; x += 2.6) {
      const px = x + (r() - 0.5) * 2;
      const pz = z + (r() - 0.5) * 2;
      if (near(px, pz, 1.6)) continue;
      if (d.walls.some((w) => w.points.some((_, k) => k + 1 < w.points.length && segDist(px, pz, w.points[k], w.points[k + 1]) < FROST_WALL_HALF + 1.6))) continue;
      // Keep the camera side (south of the play space) clear so trees never hide the action.
      if ((near(px, pz - 9, 0) || near(px, pz - 15, 0)) && pz > -14) continue;
      const close = near(px, pz, 7);
      if (!close && r() < 0.55) continue;
      const roll = r();
      const model = roll < 0.12 ? 'rock' : roll < 0.2 ? 'snowDrift' : 'pineSnowy';
      out.push({ id: `tree${i++}`, area: 'camp', model, x: px, z: pz, rot: r() * 6.28, scale: 0.8 + r() * 0.6, seed: i });
    }
  }
  return out;
}
