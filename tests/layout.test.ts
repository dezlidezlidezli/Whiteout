// Layout audit: nothing in the world may visibly stand inside something else.
// Footprints here are VISUAL radii (how big the model looks), not collision solids.
import { describe, expect, it } from 'vitest';
import { FLAT_DECOR, FOOTPRINT, FROST_WALL_HALF, GAME_DATA as D, NATURAL_DECOR, TOLERANCE, segDist } from '../src/data';

const R = FOOTPRINT;
const FLAT = FLAT_DECOR;
const NATURAL = NATURAL_DECOR;
const WALL_HALF = FROST_WALL_HALF;

interface Thing { id: string; kind: string; x: number; z: number; r: number; natural: boolean; group?: string }

function things(): Thing[] {
  const out: Thing[] = [];
  for (const s of D.stations) {
    const m = (s as { model?: string }).model ?? s.type;
    out.push({ id: s.id, kind: m, x: s.x, z: s.z, r: R[m] ?? 1, natural: false });
  }
  for (const d of D.decor) {
    if (FLAT.has(d.model)) continue;
    out.push({ id: d.id, kind: d.model, x: d.x, z: d.z, r: (R[d.model] ?? 0.8) * (d.scale ?? 1), natural: NATURAL.has(d.model) });
  }
  D.camp.tentSpots.forEach((t, i) => out.push({ id: `tent${i}`, kind: 'tent', x: t.x, z: t.z, r: R.tent, natural: false }));
  for (const p of D.pads) out.push({ id: p.id, kind: 'pad', x: p.x, z: p.z, r: R.pad, natural: false, group: 'pad' });
  return out;
}

/** A pad and the thing it builds may share a spot (the pad disappears when the building appears). */
function padBuilds(pad: Thing, other: Thing): boolean {
  const def = D.pads.find((p) => p.id === pad.id);
  if (!def) return false;
  return def.effects.some((e) => (e as { id?: string }).id === other.id || (e as { helper?: string }).helper === other.id);
}

export function findOverlaps(): string[] {
  const all = things();
  const bad: string[] = [];
  const TOL = TOLERANCE;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.natural && b.natural) continue;
      if (a.group === 'pad' && b.group === 'pad') {
        // Pads stacked on one spot are sequential upgrades of the same thing: fine.
        if (Math.hypot(a.x - b.x, a.z - b.z) < 0.05) continue;
      }
      if (a.group === 'pad' && padBuilds(a, b)) continue;
      if (b.group === 'pad' && padBuilds(b, a)) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      const pen = a.r + b.r - d;
      if (pen > TOL) bad.push(`${a.kind}:${a.id} x ${b.kind}:${b.id} overlap ${pen.toFixed(2)} m at (${a.x.toFixed(1)}, ${a.z.toFixed(1)})`);
    }
  }
  for (const w of D.walls) {
    for (const t of all) {
      for (let k = 0; k + 1 < w.points.length; k++) {
        const d = segDist(t.x, t.z, w.points[k], w.points[k + 1]);
        const pen = t.r + WALL_HALF - d;
        if (pen > TOL) {
          bad.push(`frostWall:${w.id} x ${t.kind}:${t.id} overlap ${pen.toFixed(2)} m at (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`);
          break;
        }
      }
    }
  }
  return bad;
}

/** Known overlaps still to be fixed by re-laying out the camp and a few yards. Only ever lower this. */
const KNOWN_OVERLAPS = 114;

describe('world layout', () => {
  it('has no objects standing inside each other (ratchet)', () => {
    const bad = findOverlaps();
    console.log(`LAYOUT ${bad.length} overlaps; tents kept ${D.camp.tentSpots.length}\n` + bad.join('\n'));
    expect(bad.length).toBeLessThanOrEqual(KNOWN_OVERLAPS);
  });
});
