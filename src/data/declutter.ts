// Layout clean-up applied when the game data is assembled: nothing may be placed inside
// something else. Footprints are VISUAL radii measured from the models (not collision solids).
// The same table drives the layout audit in tests/layout.test.ts.

import type { GameData, Vec2 } from './types';

/** Approximate visual footprint radius per model, metres (measured from the model bounds). */
export const FOOTPRINT: Record<string, number> = {
  hearth: 2.4, iceHole: 1.15, fishCrate: 0.7, storageTable: 0.85, kettle: 1.05, counter: 1.15, sawmill: 1.9,
  woodPile: 1.0, pine: 1.1, smokehouse: 1.5, oreVein: 1.2, crate: 0.5, forge: 1.5, greatKitchen: 3.0,
  noticeBoard: 1.0, cabin: 2.45, signpost: 0.5, lantern: 0.35, bench: 0.8, barrel: 0.45, snowman: 0.65,
  brazier: 0.6, sled: 0.9, rock: 0.95, pineSnowy: 1.15, beacon: 2.3, tent: 1.65, pad: 0.95,
};
/** Half-depth of a frost wall section. */
export const FROST_WALL_HALF = 1.7;
/** Ground-hugging things that may overlap anything. */
export const FLAT_DECOR = new Set(['snowDrift', 'rugMat', 'gripMat', 'windGap']);
/** Natural scatter: may overlap each other (a dense forest is fine) but nothing built. */
export const NATURAL_DECOR = new Set(['pineSnowy', 'rock']);
/** Small set-dressing that is simply removed if it would stand inside something. */
const REMOVABLE = new Set(['bench', 'snowman', 'signpost', 'lantern', 'barrel', 'crate', 'sled', 'brazier', 'rock', 'pineSnowy']);
/** Overlap allowed before two things count as clipping, metres. */
export const TOLERANCE = 0.25;
/** Upper limit on tents after auto-filling free camp ground (0 = keep only the authored spots that fit). */
const MAX_AUTO_TENTS = 0;

export function segDist(px: number, pz: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

interface Disc { x: number; z: number; r: number }

function hitsWall(d: GameData, c: Disc): boolean {
  for (const w of d.walls) {
    for (let k = 0; k + 1 < w.points.length; k++) {
      if (c.r + FROST_WALL_HALF - segDist(c.x, c.z, w.points[k], w.points[k + 1]) > TOLERANCE) return true;
    }
  }
  return false;
}
const hits = (a: Disc, b: Disc) => a.r + b.r - Math.hypot(a.x - b.x, a.z - b.z) > TOLERANCE;

/**
 * Returns a copy of the data with (1) tent spots that would overlap the hearth, a cabin, a pad,
 * a station, a frost wall or an earlier tent removed, and (2) small set-dressing removed where it
 * would stand inside a building, tent, pad, station or frost wall. Gameplay objects never move.
 */
export function declutter(d: GameData): GameData {
  const built: Disc[] = [];
  for (const s of d.stations) {
    const m = (s as { model?: string }).model ?? s.type;
    built.push({ x: s.x, z: s.z, r: FOOTPRINT[m] ?? 1 });
  }
  // Cabins are built late and currently share corners with the first tents (the camp is too
  // small for both; it is being re-laid out). Until then tents are only kept clear of each other,
  // the hearth, pads, stations and frost walls, and small dressing is kept clear of cabins too.
  const cabins: Disc[] = [];
  for (const c of d.decor) if (c.model === 'cabin' || c.model === 'beacon') cabins.push({ x: c.x, z: c.z, r: FOOTPRINT[c.model] * (c.scale ?? 1) });
  const pads: Disc[] = d.pads.map((p) => ({ x: p.x, z: p.z, r: FOOTPRINT.pad }));

  // 1. Tents, in the order they are raised.
  const tents: Disc[] = [];
  const tentSpots = d.camp.tentSpots.filter((t) => {
    const c: Disc = { x: t.x, z: t.z, r: FOOTPRINT.tent };
    if (FOOTPRINT.hearth + FOOTPRINT.tent - Math.hypot(t.x - d.camp.hearth.x, t.z - d.camp.hearth.z) > TOLERANCE) return false;
    if (hitsWall(d, c)) return false;
    if (built.some((b) => hits(b, c)) || pads.some((p) => hits(p, c)) || tents.some((o) => hits(o, c))) return false;
    tents.push(c);
    return true;
  });

  // 1b. Fill the free ground that is left with more tent spots (greedy, nearest the hearth
  // first), clear of everything including cabins and the camp's paths, so the camp is as full
  // as it can be without anything touching.
  const camp = d.areas.find((a) => a.id === 'camp');
  const campPaths = d.dressing.find((a) => a.area === 'camp')?.paths ?? [];
  if (camp) {
    const cand: Disc[] = [];
    for (const rc of camp.rects) {
      for (let x = rc.x0 + 0.5; x <= rc.x1 - 0.5; x += 0.5) {
        for (let z = rc.z0 + 0.5; z <= rc.z1 - 0.5; z += 0.5) cand.push({ x, z, r: FOOTPRINT.tent });
      }
    }
    const hd = (c: Disc) => Math.hypot(c.x - d.camp.hearth.x, c.z - d.camp.hearth.z);
    cand.sort((a, b) => hd(a) - hd(b) || a.x - b.x || a.z - b.z);
    for (const c of cand) {
      if (tentSpots.length >= Math.min(d.camp.tentAt.length, MAX_AUTO_TENTS)) break;
      // Leave a ring of open ground round the fire for villagers to gather.
      if (hd(c) < FOOTPRINT.hearth + FOOTPRINT.tent + 1.6) continue;
      if (hitsWall(d, { ...c, r: c.r + 0.3 })) continue;
      const fat: Disc = { ...c, r: c.r + 0.35 };
      if (built.some((b) => hits(b, fat)) || cabins.some((b) => hits(b, fat)) || pads.some((p) => hits(p, fat)) || tents.some((o) => hits(o, fat))) continue;
      if (campPaths.some((p) => p.points.some((_, k) => k + 1 < p.points.length &&
        segDist(c.x, c.z, { x: p.points[k][0], z: p.points[k][1] }, { x: p.points[k + 1][0], z: p.points[k + 1][1] }) < c.r + p.width / 2))) continue;
      // Keep the way to the Kettle Yard (south) open.
      if (c.z > 3.5 && Math.abs(c.x) < 3.2) continue;
      tents.push(c);
      tentSpots.push({ x: c.x, z: c.z, rot: Math.atan2(-c.x, -c.z) });
    }
  }

  // 2. Small set-dressing. Things a pad unlocks are kept (they are placed on purpose).
  const solid: Disc[] = [...built, ...cabins, ...tents, ...pads];
  const keptSmall: Disc[] = [];
  const decor = d.decor.filter((c) => {
    // Camp only for now: the other yards are being re-laid out by hand.
    if (c.area !== 'camp' || !REMOVABLE.has(c.model) || c.unlockedBy) return true;
    const disc: Disc = { x: c.x, z: c.z, r: (FOOTPRINT[c.model] ?? 0.8) * (c.scale ?? 1) };
    if (solid.some((b) => hits(b, disc))) return false;
    if (!NATURAL_DECOR.has(c.model)) {
      if (hitsWall(d, disc)) return false;
      if (keptSmall.some((o) => hits(o, disc))) return false;
      keptSmall.push(disc);
    }
    return true;
  });

  return {
    ...d,
    decor,
    camp: { ...d.camp, tentSpots, tentAt: d.camp.tentAt.slice(0, tentSpots.length) },
  };
}
