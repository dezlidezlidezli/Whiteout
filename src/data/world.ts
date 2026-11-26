// World layout: one continuous valley, camp at the origin, areas behind frost walls.
//
//              Beacon Peak (z -48..-29, hearth 5)
//              Ironridge   (z -30..-8,  hearth 4)
//  Pinewood  |   CAMP (hearth at 0,0)   | Frozen Lake
//  (x<-8, L2)|   Kettle Yard (z 6.5..19) | (x>8, L3)
//              ~~~ storm: Icebound arrive from +Z ~~~
//
// Screen "up" is -Z (the camera looks from +Z).

import { LATE_LANES } from './late';
import type { AreaDef, CampDef, DecorDef, HelperDef, LinkDef, PadDef, StationDef, Vec2, WallDef } from './types';

export const AREAS: AreaDef[] = [
  { id: 'camp', name: 'Camp', rects: [{ x0: -9, x1: 9, z0: -9, z1: 7.5 }], hearth: 1, focus: { x: 0, z: 0 } },
  { id: 'kettleYard', name: 'Kettle Yard', rects: [{ x0: -6.5, x1: 6.5, z0: 5.5, z1: 19.2 }], hearth: 1, focus: { x: 0, z: 12 } },
  { id: 'pinewood', name: 'Pinewood', rects: [{ x0: -26, x1: -7.6, z0: -10, z1: 14 }], hearth: 2, focus: { x: -16, z: 2 } },
  // Reserved for later content (open, but mostly empty until their data lands).
  { id: 'frozenLake', name: 'Frozen Lake', rects: [{ x0: 7.6, x1: 28, z0: -10, z1: 16 }], hearth: 3, focus: { x: 17, z: 2 } },
  { id: 'ironridge', name: 'Ironridge', rects: [{ x0: -10, x1: 10, z0: -30, z1: -7.6 }], hearth: 4, focus: { x: 0, z: -19 } },
  { id: 'beaconPeak', name: 'Beacon Peak', rects: [{ x0: -8, x1: 8, z0: -48, z1: -29 }], hearth: 5, focus: { x: 0, z: -40 } },
];

export const WALLS: WallDef[] = [
  { id: 'wall_pinewood', area: 'pinewood', points: [{ x: -8.6, z: -9.6 }, { x: -8.6, z: 8.2 }] },
  { id: 'wall_lake', area: 'frozenLake', points: [{ x: 8.6, z: -9.6 }, { x: 8.6, z: 8.2 }] },
  { id: 'wall_ironridge', area: 'ironridge', points: [{ x: -9.6, z: -8.6 }, { x: 9.6, z: -8.6 }] },
  { id: 'wall_beacon', area: 'beaconPeak', points: [{ x: -8, z: -29.5 }, { x: 8, z: -29.5 }] },
];

const YARD_COUNTER_Z = 18.2;
const QUEUE_Z = 19.6;

export const STATIONS: StationDef[] = [
  // ---- Camp ----
  {
    id: 'hearth', type: 'deposit', area: 'camp', name: 'Hearth', model: 'hearth', x: 0, z: 0,
    solid: { r: 1.25 }, reach: 2.5, accepts: ['log'], cap: 40, role: 'fuel',
  },
  // ---- Kettle Yard ----
  {
    id: 'crateA', type: 'pile', area: 'kettleYard', name: 'Fish crate', model: 'fishCrate', x: -4.4, z: 10.6,
    solid: { r: 0.75 }, reach: 1.75, item: 'fish', cap: 14, start: 10, refill: 1.25,
  },
  {
    id: 'kettleA', type: 'processor', area: 'kettleYard', name: 'Kettle', model: 'kettle', x: -1.0, z: 10.6,
    solid: { r: 0.8 }, reach: 1.85, recipe: 'stew', inputCap: 10, outputCap: 10, operator: 'none', speedMod: 'cookSpeed',
  },
  {
    id: 'kettleB', type: 'processor', area: 'kettleYard', name: 'Second kettle', model: 'kettle', x: 2.6, z: 10.6,
    solid: { r: 0.8 }, reach: 1.85, recipe: 'stew', inputCap: 10, outputCap: 10, operator: 'boost', boost: 2, speedMod: 'cookSpeed',
    unlockedBy: 'pad_kettleB',
  },
  {
    id: 'crateB', type: 'pile', area: 'kettleYard', name: 'Fish crate', model: 'fishCrate', x: -4.4, z: 14.0,
    solid: { r: 0.75 }, reach: 1.75, item: 'fish', cap: 14, start: 14, refill: 1.25, unlockedBy: 'pad_crateB',
  },
  counter('counterA', -2.2, undefined, 'Counter', -1),
  counter('counterB', 3.0, 'pad_counterB', 'Second counter', 1),
  // ---- Pinewood ----
  {
    id: 'sawmill', type: 'processor', area: 'pinewood', name: 'Sawmill', model: 'sawmill', x: -11.6, z: 9.2, rot: Math.PI / 2,
    solid: { hw: 0.8, hd: 1.2 }, reach: 2.1, recipe: 'plank', inputCap: 12, outputCap: 24, operator: 'none',
    unlockedBy: 'pad_sawmill',
  },
  {
    id: 'woodpile', type: 'pile', area: 'pinewood', name: 'Woodpile', model: 'woodPile', x: -11.8, z: -4.2,
    solid: { r: 0.9 }, reach: 1.9, item: 'log', cap: 30, start: 0, refill: 0, accepts: true, unlockedBy: 'pad_lumberjack',
  },
  ...pines(),
];

function counter(id: string, x: number, unlockedBy: string | undefined, name: string, side: number): StationDef {
  return {
    id, type: 'counter', area: 'kettleYard', name, model: 'counter', x, z: YARD_COUNTER_Z, rot: 0,
    solid: { hw: 1.15, hd: 0.5 }, reach: 1.85, item: 'stew', cap: 12, serveTime: 0.55,
    queueDir: { x: 0, z: 1 }, queueLen: 7, queueSpacing: 1.05, queueStart: { x, z: QUEUE_Z },
    emberSpot: { x: x + 1.7, z: 16.6 },
    exitPath: [
      { x: x + side * 2.1, z: QUEUE_Z + 0.4 },
      { x: x + side * 3.6, z: 18.5 },
      { x: side * 6.0, z: 8.5 },
      { x: side * 3.0, z: 5.2 },
    ],
    spawn: { x, z: 32 },
    wantMin: 1, wantMax: 1,
    unlockedBy,
  };
}

/** Deterministic tiny hash RNG for layout generation. */
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

function pines(): StationDef[] {
  const out: StationDef[] = [];
  const r = lrng(7);
  let i = 0;
  for (let gz = -7; gz <= 10; gz += 2.9) {
    for (let gx = -23.5; gx <= -14.5; gx += 2.9) {
      const x = gx + (r() - 0.5) * 1.2 + ((Math.round(gz) & 1) ? 0.7 : 0);
      const z = gz + (r() - 0.5) * 1.2;
      out.push({
        id: `pine${i++}`, type: 'node', area: 'pinewood', name: 'Pine', model: 'pine', x, z, rot: r() * Math.PI * 2,
        solid: { r: 0.42 }, reach: 1.45, tag: 'pine', item: 'log', hitTime: 0.42, yieldPerHit: 1, hits: 3,
        regrow: 16, groundCap: 6,
      });
    }
  }
  return out;
}

export const LINKS: LinkDef[] = [
  {
    id: 'beltA', area: 'kettleYard', from: 'kettleA', to: 'counterA', item: 'stew', interval: 0.5, travel: 2.4,
    path: [{ x: -1.3, z: 11.5 }, { x: -2.2, z: 13.4 }, { x: -2.2, z: 17.6 }], unlockedBy: 'pad_beltA', maxOnBelt: 6,
  },
  {
    id: 'woodbelt', area: 'pinewood', from: 'woodpile', to: 'sawmill', item: 'log', interval: 0.8, travel: 5,
    path: [{ x: -11.8, z: -3.2 }, { x: -11.6, z: 8.1 }], unlockedBy: 'pad_woodbelt', maxOnBelt: 8,
  },
];

export const HELPERS: HelperDef[] = [
  {
    id: 'porter', name: 'Porter', role: 'haul', model: 'porter', home: { x: -3.0, z: 8.2 }, capacity: 5, speed: 3.4,
    from: ['crateA', 'crateB'], to: ['kettleA', 'kettleB'], item: 'fish', transferTime: 0.16,
  },
  {
    id: 'cook', name: 'Cook', role: 'operate', model: 'cook', home: { x: 3.6, z: 9.0 }, capacity: 0, speed: 3,
    station: 'kettleB', transferTime: 0.2,
  },
  {
    id: 'lumberjack', name: 'Lumberjack', role: 'harvest', model: 'lumberjack', home: { x: -13, z: -2 }, capacity: 6,
    speed: 3.4, nodeTag: 'pine', to: ['woodpile'], transferTime: 0.14,
  },
  {
    id: 'stoker', name: 'Stoker', role: 'haul', model: 'porter', home: { x: -6, z: -1 }, capacity: 6, speed: 3.6,
    from: ['woodpile'], to: ['hearth', 'sawmill'], item: 'log', transferTime: 0.14,
  },
];

export const PADS: PadDef[] = [
  // ---- Kettle Yard ----
  { id: 'pad_pack1', area: 'kettleYard', x: 0.6, z: 14.4, label: 'Bigger pack', cost: 20, requires: [],
    effects: [{ type: 'capacity', add: 3 }], icon: { item: 'fish' } },
  { id: 'pad_kettleB', area: 'kettleYard', x: 2.6, z: 10.6, label: 'Second kettle', cost: 45, requires: ['pad_pack1'],
    effects: [{ type: 'unlock', id: 'kettleB' }], icon: { prop: 'kettle' } },
  { id: 'pad_counterB', area: 'kettleYard', x: 3.0, z: 17.0, label: 'Second counter', cost: 80, requires: ['pad_kettleB'],
    effects: [{ type: 'unlock', id: 'counterB' }], icon: { prop: 'counter' } },
  { id: 'pad_porter', area: 'kettleYard', x: -3.0, z: 7.9, label: 'Hire a porter', cost: 130, requires: ['pad_counterB'],
    requiresPop: 10, effects: [{ type: 'hire', helper: 'porter' }], icon: { character: 'porter' } },
  { id: 'pad_crateB', area: 'kettleYard', x: -4.4, z: 14.0, label: 'Fish crate', cost: 110, requires: ['pad_porter'],
    effects: [{ type: 'unlock', id: 'crateB' }], icon: { prop: 'fishCrate' } },
  { id: 'pad_beltA', area: 'kettleYard', x: -2.2, z: 14.6, label: 'Stew conveyor', cost: 180, requires: ['pad_porter'],
    effects: [{ type: 'unlock', id: 'beltA' }], icon: { prop: 'conveyor' } },
  { id: 'pad_pack2', area: 'kettleYard', x: 0.6, z: 14.4, label: 'Bigger pack', cost: 170, requires: ['pad_beltA', 'pad_crateB'],
    effects: [{ type: 'capacity', add: 3 }], icon: { item: 'stew' } },
  { id: 'pad_cook', area: 'kettleYard', x: 5.0, z: 12.4, label: 'Hire a cook', cost: 220, requires: ['pad_beltA'],
    requiresPop: 25, effects: [{ type: 'hire', helper: 'cook' }], icon: { character: 'cook' } },
  { id: 'pad_hearth2', area: 'camp', x: 0, z: 3.4, label: 'Raise the Hearth', cost: 480, requires: ['pad_pack2', 'pad_cook'],
    effects: [{ type: 'hearth', level: 2 }], icon: { prop: 'hearth', level: 2 } },
  // ---- Pinewood ----
  { id: 'pad_sawmill', area: 'pinewood', x: -11.6, z: 9.2, label: 'Sawmill', cost: 180, requires: ['pad_hearth2'],
    effects: [{ type: 'unlock', id: 'sawmill' }], icon: { prop: 'sawmill' } },
  { id: 'pad_cabin1', area: 'camp', x: -6.3, z: -5.2, label: 'Cabin', cost: 160, materials: { plank: 8 }, requires: ['pad_sawmill'],
    effects: [{ type: 'unlock', id: 'cabin1' }, { type: 'mod', key: 'spawnRate', add: 0.25 }], icon: { prop: 'cabin' } },
  { id: 'pad_pack3', area: 'pinewood', x: -17.0, z: 12.4, label: 'Sturdy pack', cost: 260, materials: { plank: 6 }, requires: ['pad_sawmill'],
    effects: [{ type: 'capacity', add: 4 }], icon: { item: 'log' } },
  { id: 'pad_axe', area: 'pinewood', x: -13.8, z: 12.6, label: 'Sharper axe', cost: 220, requires: ['pad_pack3'],
    effects: [{ type: 'mod', key: 'chopSpeed', mul: 1.6 }, { type: 'tool', tool: 'axe' }], icon: { prop: 'stump' } },
  { id: 'pad_pots', area: 'kettleYard', x: 5.0, z: 15.0, label: 'Copper pots', cost: 340, materials: { plank: 10 }, requires: ['pad_cabin1'],
    effects: [{ type: 'mod', key: 'cookSpeed', mul: 1.6 }, { type: 'mod', key: 'pricePlus', add: 1 }, { type: 'tool', tool: 'kettle' }], icon: { prop: 'kettle', level: 2 } },
  { id: 'pad_lumberjack', area: 'pinewood', x: -11.4, z: 0.6, label: 'Hire a lumberjack', cost: 420, requires: ['pad_cabin1', 'pad_pack3'],
    requiresPop: 45, effects: [{ type: 'unlock', id: 'woodpile' }, { type: 'hire', helper: 'lumberjack' }], icon: { character: 'lumberjack' } },
  { id: 'pad_boots', area: 'camp', x: 3.4, z: -2.2, label: 'Warm boots', cost: 330, requires: ['pad_pots'],
    effects: [{ type: 'mod', key: 'moveSpeed', mul: 1.15 }], icon: { prop: 'sled' } },
  { id: 'pad_cabin2', area: 'camp', x: 6.3, z: -5.2, label: 'Cabin', cost: 400, materials: { plank: 14 }, requires: ['pad_lumberjack'],
    effects: [{ type: 'unlock', id: 'cabin2' }, { type: 'mod', key: 'spawnRate', add: 0.25 }], icon: { prop: 'cabin' } },
  { id: 'pad_woodbelt', area: 'pinewood', x: -11.0, z: 3.6, label: 'Log conveyor', cost: 520, requires: ['pad_lumberjack'],
    effects: [{ type: 'unlock', id: 'woodbelt' }], icon: { prop: 'conveyor' } },
  { id: 'pad_stoker', area: 'camp', x: -6.0, z: 1.2, label: 'Hire a stoker', cost: 600, requires: ['pad_woodbelt'],
    requiresPop: 70, effects: [{ type: 'hire', helper: 'stoker' }], icon: { character: 'porter' } },
  { id: 'pad_cabin3', area: 'camp', x: 6.3, z: 3.8, label: 'Cabin', cost: 720, materials: { plank: 20 }, requires: ['pad_cabin2', 'pad_boots'],
    effects: [{ type: 'unlock', id: 'cabin3' }, { type: 'mod', key: 'spawnRate', add: 0.25 }, { type: 'mod', key: 'helperSpeed', mul: 1.2 }],
    icon: { prop: 'cabin' } },
  { id: 'pad_hearth3', area: 'camp', x: 0, z: 3.4, label: 'Raise the Hearth', cost: 1350, materials: { plank: 30 },
    requires: ['pad_stoker', 'pad_cabin3'], effects: [{ type: 'hearth', level: 3 }], icon: { prop: 'hearth', level: 3 } },
];

// ---- Camp ----
const TENT_RING: [number, number][] = [
  [4.6, 250], [4.6, 290], [4.6, 215], [4.6, 325], [4.7, 180], [4.7, 0], [4.9, 148], [4.9, 32],
  [7.4, 270], [7.2, 237], [7.2, 303], [7.4, 160], [7.4, 20],
];
export const CAMP: CampDef = {
  hearth: { x: 0, z: 0 },
  tentAt: [2, 5, 9, 14, 20, 27, 35, 44, 54, 65, 77, 90, 104],
  tentSpots: TENT_RING.map(([r, deg]) => {
    const a = (deg * Math.PI) / 180;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    return { x, z, rot: Math.atan2(-x, -z) };
  }),
  settleMin: 2.4,
  settleMax: 6.2,
};

export const DECOR: DecorDef[] = [
  { id: 'cabin1', area: 'camp', model: 'cabin', x: -6.3, z: -5.2, rot: 0.5, unlockedBy: 'pad_cabin1', solid: { hw: 1.3, hd: 1.1 } },
  { id: 'cabin2', area: 'camp', model: 'cabin', x: 6.3, z: -5.2, rot: -0.5, unlockedBy: 'pad_cabin2', solid: { hw: 1.3, hd: 1.1 } },
  { id: 'cabin3', area: 'camp', model: 'cabin', x: 6.3, z: 3.8, rot: -2.4, unlockedBy: 'pad_cabin3', solid: { hw: 1.3, hd: 1.1 } },
  { id: 'sign_yard', area: 'camp', model: 'signpost', x: 4.2, z: 6.6, rot: 0.3 },
  { id: 'lantern1', area: 'kettleYard', model: 'lantern', x: -6.2, z: 9.0 },
  { id: 'lantern2', area: 'kettleYard', model: 'lantern', x: 6.2, z: 9.0 },
  { id: 'lantern3', area: 'kettleYard', model: 'lantern', x: -6.2, z: 18.6 },
  { id: 'lantern4', area: 'kettleYard', model: 'lantern', x: 6.2, z: 18.6 },
  { id: 'bench1', area: 'camp', model: 'bench', x: -2.6, z: 2.3, rot: 2.3 },
  { id: 'bench2', area: 'camp', model: 'bench', x: 2.6, z: 2.3, rot: -2.3 },
  { id: 'barrel1', area: 'kettleYard', model: 'barrel', x: -6.0, z: 8.0, solid: { r: 0.4 } },
  { id: 'crate1', area: 'kettleYard', model: 'crate', x: -5.8, z: 16.4, solid: { r: 0.45 } },
  { id: 'snowman1', area: 'camp', model: 'snowman', x: 7.8, z: 6.4 }, // no collision: it stands in the yard–lake passage
  { id: 'brazier1', area: 'pinewood', model: 'brazier', x: -9.8, z: 11.6 },
  { id: 'sled1', area: 'pinewood', model: 'sled', x: -10.2, z: -7.8, rot: 0.6, solid: { r: 0.6 } },
  { id: 'sign_lake', area: 'frozenLake', model: 'signpost', x: 10.2, z: 4.0, rot: -0.4 },
  { id: 'sign_ridge', area: 'ironridge', model: 'signpost', x: 3, z: -10.2, rot: 0.2 },
  ...fences(),
  ...forest(),
];

function fences(): DecorDef[] {
  const out: DecorDef[] = [];
  let i = 0;
  // Yard south edge, with gaps where the Icebound queues pass through.
  for (let x = -6; x <= 6.01; x += 2) {
    if (Math.abs(x - -2.2) < 1.3 || Math.abs(x - 3.0) < 1.3) continue;
    out.push({ id: `fence${i++}`, area: 'kettleYard', model: 'fence', x, z: 19.7, rot: 0 });
  }
  // Yard sides.
  for (let z = 8.5; z <= 19; z += 2) {
    out.push({ id: `fence${i++}`, area: 'kettleYard', model: 'fence', x: -7.0, z, rot: Math.PI / 2 });
    out.push({ id: `fence${i++}`, area: 'kettleYard', model: 'fence', x: 7.0, z, rot: Math.PI / 2 });
  }
  return out;
}

/** True if a point lies inside any walkable rect (expanded by m) or a reserved corridor. */
function nearPlay(x: number, z: number, m: number): boolean {
  for (const a of AREAS) {
    for (const rc of a.rects) {
      if (x > rc.x0 - m && x < rc.x1 + m && z > rc.z0 - m && z < rc.z1 + m) return true;
    }
  }
  // Icebound walk-in lanes south of the yard.
  if (z > 18 && z < 44 && (Math.abs(x + 2.2) < 2.2 || Math.abs(x - 3) < 2.2)) return true;
  // Queues and walk-in lanes of the late counters.
  for (const rc of LATE_LANES) if (x > rc.x0 - m && x < rc.x1 + m && z > rc.z0 - m && z < rc.z1 + m) return true;
  return false;
}

function forest(): DecorDef[] {
  const out: DecorDef[] = [];
  const r = lrng(99);
  let i = 0;
  for (let z = -56; z <= 46; z += 2.6) {
    for (let x = -40; x <= 40; x += 2.6) {
      const px = x + (r() - 0.5) * 2;
      const pz = z + (r() - 0.5) * 2;
      if (nearPlay(px, pz, 1.2)) continue;
      // Thin out far away to save triangles, keep a dense belt near the play space.
      const near = nearPlay(px, pz, 7);
      if (!near && r() < 0.55) continue;
      const roll = r();
      const model = roll < 0.12 ? 'rock' : roll < 0.2 ? 'snowDrift' : 'pineSnowy';
      out.push({ id: `tree${i++}`, area: 'camp', model, x: px, z: pz, rot: r() * 6.28, scale: 0.8 + r() * 0.6, seed: i });
    }
  }
  // Pinewood interior decoration (non-harvestable, beyond the chopping grove).
  for (let k = 0; k < 10; k++) {
    const px = -25 + r() * 1.5;
    const pz = -9 + k * 2.4;
    out.push({ id: `tree${i++}`, area: 'pinewood', model: 'pineSnowy', x: px, z: pz, rot: r() * 6, scale: 1 + r() * 0.4, seed: i, solid: { r: 0.5 } });
  }
  return out;
}

export const PLAYER_START: Vec2 = { x: -1.6, z: 13.6 };
