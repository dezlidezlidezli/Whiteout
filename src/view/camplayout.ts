// Interim, view-only camp tidy-up: the camp is too small for every tent the data places, so tents
// that would stand inside a frost wall, a built cabin or an earlier tent are simply not drawn, and
// the rest are drawn a little smaller. (The camp itself is being enlarged in the data.)

import { FOOTPRINT, FROST_WALL_HALF, segDist, TOLERANCE, type GameData } from '../data';
import type { SimState } from '../sim';

export const TENT_SCALE = 0.82;

let cacheKey = '';
let cache: boolean[] = [];

export function visibleTents(data: GameData, s: SimState): boolean[] {
  const cabins = data.decor.filter((d) => d.model === 'cabin' && !!s.unlocked[d.id]);
  const walls = data.walls.filter((w) => !s.areasOpen[w.area]);
  const key = `${s.tents}|${cabins.map((c) => c.id).join(',')}|${walls.map((w) => w.id).join(',')}`;
  if (key === cacheKey) return cache;
  cacheKey = key;
  const r = FOOTPRINT.tent * TENT_SCALE;
  const spots = data.camp.tentSpots;
  const kept: { x: number; z: number }[] = [];
  cache = spots.map((t, i) => {
    if (i >= s.tents) return false;
    for (const c of cabins) if (r + FOOTPRINT.cabin * (c.scale ?? 1) - Math.hypot(t.x - c.x, t.z - c.z) > TOLERANCE) return false;
    for (const w of walls) {
      for (let k = 0; k + 1 < w.points.length; k++) {
        if (r + FROST_WALL_HALF - segDist(t.x, t.z, w.points[k], w.points[k + 1]) > TOLERANCE) return false;
      }
    }
    for (const o of kept) if (2 * r - Math.hypot(t.x - o.x, t.z - o.z) > TOLERANCE) return false;
    kept.push(t);
    return true;
  });
  return cache;
}
