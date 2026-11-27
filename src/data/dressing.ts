// Yard dressing for the view: floors, palisades/fences (solid for collision), paths, frozen streams,
// clutter zones and hand-placed landmarks, per area. Every area's work loop is a compact walled yard that
// opens towards the camp; counters sit in gaps of the outer palisade with the Icebound crowd massed beyond.
// Clutter zones and landmarks are decorative only (no collision) and are kept out of walk lanes, stations,
// pads, conveyors, queues, helper homes and courier trails (checked by tests/dressing.test.ts).

export type FloorType = 'planks' | 'cobble' | 'packedEarth' | 'ice' | 'stone';
export type XZ = [number, number];

export interface AreaDressing {
  /** Area id as used in world data. */
  area: string;
  /** Centre + size, axis-aligned. Later entries draw on top of earlier ones. */
  floors: { type: FloorType; x: number; z: number; w: number; d: number }[];
  /** Solid for collision (0.3 m thick); `at` = metres along the polyline where a gap is centred. */
  walls: { kind: 'palisade' | 'fence'; points: XZ[]; gaps?: { at: number; width: number }[] }[];
  paths: { type: 'trampled' | 'planks' | 'cobble' | 'ice'; points: XZ[]; width: number }[];
  /** Frozen streams/shorelines (decorative ice strips; fishing holes are ordinary Nodes placed on them). */
  streams: { points: XZ[]; width: number }[];
  clutterZones: {
    theme: 'kitchen' | 'lumber' | 'fishing' | 'mining' | 'camp' | 'beacon' | 'wild';
    x: number; z: number; w: number; d: number; density?: number;
  }[];
  /** Hand-placed decor (arches, watch towers, lamp posts, sign boards…). Decorative, no collision. */
  landmarks: { prop: string; x: number; z: number; yaw?: number; seed?: number }[];
}

/** Rect (x0..x1, z0..z1) → centre + size. */
const box = (x0: number, x1: number, z0: number, z1: number) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });

export const DRESSING: AreaDressing[] = [
  {
    area: 'camp',
    floors: [
      { type: 'packedEarth', ...box(-19.4, 19.4, -18, 12) },
      { type: 'cobble', ...box(-2.6, 2.6, -2.6, 2.6) },
    ],
    walls: [],
    paths: [
      { type: 'planks', width: 2.0, points: [[0, 2.8], [0, 12.0]] },
      { type: 'trampled', width: 2.2, points: [[-2.8, 0], [-19.4, 0]] },
      { type: 'trampled', width: 2.2, points: [[2.8, 0], [19.4, 0]] },
      { type: 'trampled', width: 2.2, points: [[0, -2.8], [0, -18.0]] },
    ],
    streams: [],
    clutterZones: [],
    landmarks: [
      { prop: 'lampPost', x: -1.6, z: 8.4 },
      { prop: 'lampPost', x: 1.6, z: 8.4 },
      { prop: 'lampPost', x: -14.0, z: -1.6 },
      { prop: 'lampPost', x: 14.0, z: 1.6 },
      { prop: 'lampPost', x: -1.6, z: -13.4 },
      { prop: 'lampPost', x: 1.6, z: -13.4 },
    ],
  },
  {
    area: 'kettleYard',
    floors: [
      { type: 'packedEarth', ...box(-6.5, 6.5, 7.5, 16.2) },
      { type: 'planks', ...box(-4.6, 6.5, 13.9, 16.2) },
    ],
    walls: [
      // Open to the camp (north); the two counters fill gaps in the south palisade.
      { kind: 'palisade', points: [[-6.8, 7.4], [-6.8, 16.2], [6.8, 16.2], [6.8, 7.4]], gaps: [{ at: 13.4, width: 2.3 }, { at: 18.6, width: 2.3 }] },
    ],
    paths: [{ type: 'planks', width: 1.6, points: [[-2.2, 7.6], [-2.2, 9.0]] }],
    streams: [{ points: [[-5.9, 5.6], [-5.9, 16.2]], width: 1.4 }],
    clutterZones: [
      { theme: 'kitchen', ...box(5.7, 6.5, 7.6, 9.4), density: 0.8 },
    ],
    landmarks: [{ prop: 'woodenArch', x: 0, z: 7.5, yaw: 0 }],
  },
  {
    area: 'pinewood',
    floors: [
      { type: 'packedEarth', ...box(-13.4, -7.6, -6.0, 8.0) },
      { type: 'planks', ...box(-12.8, -10.0, 2.0, 5.4) },
    ],
    walls: [{ kind: 'palisade', points: [[-7.8, 10.6], [-27.8, 10.6], [-27.8, -10.2], [-10.2, -10.2]] }],
    paths: [],
    streams: [],
    clutterZones: [
    ],
    landmarks: [{ prop: 'firewoodRack', x: -9.6, z: -8.4, yaw: Math.PI / 2 }, { prop: 'watchTower', x: -21.0, z: 9.8 }],
  },
  {
    area: 'frozenLake',
    floors: [
      { type: 'packedEarth', ...box(7.6, 15.6, -10, -2.2) },
      { type: 'ice', ...box(17.4, 29, -10, -2.0) },
      { type: 'planks', ...box(8.4, 23.8, 0.0, 3.0) },
      { type: 'planks', ...box(11.6, 23.8, 5.2, 7.8) },
    ],
    walls: [
      // Counters fill the two gaps in the south palisade; open to the camp (west).
      { kind: 'palisade', points: [[7.8, 8.0], [35.2, 8.0], [35.2, -10.2], [9.0, -10.2]], gaps: [{ at: 5.8, width: 2.3 }, { at: 13.8, width: 2.3 }] },
    ],
    paths: [],
    streams: [{ points: [[17.4, -1.6], [29.0, -1.6]], width: 0.8 }],
    clutterZones: [{ theme: 'fishing', ...box(28.0, 29, -7.8, -6.4) }],
    landmarks: [{ prop: 'dryingRack', x: 28.4, z: -2.6, yaw: Math.PI / 2 }],
  },
  {
    area: 'ironridge',
    floors: [
      { type: 'stone', ...box(-10, -0.8, -27, -17.4) },
      { type: 'cobble', ...box(-10, 8.8, -14.6, -8.8) },
      { type: 'planks', ...box(5.6, 8.8, -23.6, -15.4) },
    ],
    walls: [
      { kind: 'palisade', points: [[9.0, -10.2], [9.0, -34.2], [6.5, -34.2]], gaps: [{ at: 6.8, width: 2.3 }, { at: 11.8, width: 2.3 }] },
      { kind: 'palisade', points: [[-6.5, -34.2], [-16.6, -34.2], [-16.6, -10.2]] },
    ],
    paths: [],
    streams: [],
    clutterZones: [
      { theme: 'mining', ...box(-10, -8.6, -34, -32.6) },
      { theme: 'mining', ...box(-10, -8.8, -11.2, -10.4) },
      { theme: 'kitchen', ...box(6.6, 8.8, -34, -30.0) },
    ],
    landmarks: [{ prop: 'toolRack', x: -9.6, z: -23.2, yaw: Math.PI / 2 }, { prop: 'bellows', x: -1.0, z: -10.4 }],
  },
  {
    area: 'beaconPeak',
    floors: [{ type: 'stone', ...box(-8, 8, -60, -25) }],
    walls: [{ kind: 'palisade', points: [[-8.3, -26.2], [-8.3, -60.3], [8.3, -60.3], [8.3, -26.2]] }],
    paths: [],
    streams: [],
    clutterZones: [],
    landmarks: [{ prop: 'flagPole', x: -7.0, z: -30.2 }, { prop: 'flagPole', x: 7.0, z: -30.6 }],
  },
];

/** Solid boxes for every wall leg piece outside its gaps (axis-aligned legs, 0.3 m thick). */
export function wallSolids(d: AreaDressing[]): { x: number; z: number; hw: number; hd: number }[] {
  const out: { x: number; z: number; hw: number; hd: number }[] = [];
  for (const a of d) {
    for (const w of a.walls) {
      let along = 0;
      for (let i = 1; i < w.points.length; i++) {
        const [ax, az] = w.points[i - 1];
        const [bx, bz] = w.points[i];
        const len = Math.hypot(bx - ax, bz - az);
        // Cut this leg into pieces around the gaps that fall on it.
        const cuts: [number, number][] = [];
        for (const g of w.gaps ?? []) {
          const s0 = g.at - g.width / 2 - along;
          const s1 = g.at + g.width / 2 - along;
          if (s1 > 0 && s0 < len) cuts.push([Math.max(0, s0), Math.min(len, s1)]);
        }
        cuts.sort((p, q) => p[0] - q[0]);
        let t = 0;
        const piece = (t0: number, t1: number) => {
          if (t1 - t0 < 0.05) return;
          const x0 = ax + ((bx - ax) * t0) / len;
          const z0 = az + ((bz - az) * t0) / len;
          const x1 = ax + ((bx - ax) * t1) / len;
          const z1 = az + ((bz - az) * t1) / len;
          out.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: Math.abs(x1 - x0) / 2 + 0.15, hd: Math.abs(z1 - z0) / 2 + 0.15 });
        };
        for (const [c0, c1] of cuts) {
          piece(t, c0);
          t = Math.max(t, c1);
        }
        piece(t, len);
        along += len;
      }
    }
  }
  return out;
}
