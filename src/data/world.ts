// World layout: one continuous valley, camp at the origin, areas behind frost walls. Each area's work
// loop is a compact walled yard (see dressing.ts for floors/palisades/paths/clutter zones).
//
//              Beacon Peak (z -38..-25, hearth 5)
//              Ironridge   (z -26..-8,  hearth 4)
//  Pinewood  |   CAMP (hearth at 0,0)    | Frozen Lake
//  (x<-8, L2)|   Kettle Yard (z 5.5..16) | (x>8, L3)
//              ~~~ storm: Icebound arrive from +Z ~~~
//
// Screen "up" is -Z (the camera looks from +Z).

import type { AreaDef, CampDef, DecorDef, HelperDef, LinkDef, PadDef, StationDef, Vec2, WallDef } from './types';

export const AREAS: AreaDef[] = [
  // A village-sized camp (authored in world space; the other areas are placed around it by layout.ts).
  { id: 'camp', name: 'Camp', rects: [{ x0: -19.4, x1: 19.4, z0: -18, z1: 12 }], hearth: 1, focus: { x: 0, z: 0 } },
  { id: 'kettleYard', name: 'Kettle Yard', rects: [{ x0: -6.5, x1: 6.5, z0: 5.5, z1: 16.2 }], hearth: 1, focus: { x: 0, z: 11 } },
  { id: 'pinewood', name: 'Pinewood', rects: [{ x0: -27.5, x1: -7.6, z0: -10, z1: 10.4 }, { x0: -8.4, x1: -4.6, z0: -3, z1: 3 }], hearth: 2, focus: { x: -14, z: 0 } },
  { id: 'frozenLake', name: 'Frozen Lake', rects: [{ x0: 7.6, x1: 35, z0: -16.4, z1: 7.8 }, { x0: 4.6, x1: 8.4, z0: -3, z1: 3 }], hearth: 3, focus: { x: 20, z: -4 } },
  { id: 'ironridge', name: 'Ironridge', rects: [{ x0: -16.4, x1: 8.8, z0: -34, z1: -7.6 }, { x0: -3, x1: 3, z0: -8.4, z1: -4.2 }], hearth: 4, focus: { x: 0, z: -16 } },
  { id: 'beaconPeak', name: 'Beacon Peak', rects: [{ x0: -8, x1: 8, z0: -60, z1: -25 }], hearth: 5, focus: { x: 0, z: -40 } },
];

export const WALLS: WallDef[] = [
  // World space (frost walls enclose the camp on three sides; the Kettle Yard side is open from the start).
  { id: 'wall_pinewood', area: 'pinewood', points: [{ x: -18.6, z: -17.6 }, { x: -18.6, z: 11.6 }] },
  { id: 'wall_lake', area: 'frozenLake', points: [{ x: 18.6, z: -17.6 }, { x: 18.6, z: 11.6 }] },
  { id: 'wall_ironridge', area: 'ironridge', points: [{ x: -18.6, z: -17.6 }, { x: 18.6, z: -17.6 }] },
  { id: 'wall_beacon', area: 'beaconPeak', points: [{ x: -6.5, z: -46.5 }, { x: 6.5, z: -46.5 }] },
];

const YARD_COUNTER_Z = 15.7;
const QUEUE_Z = 17.1;

export const STATIONS: StationDef[] = [
  // ---- Camp ----
  {
    id: 'hearth', type: 'deposit', area: 'camp', name: 'Hearth', model: 'hearth', x: 0, z: 0,
    solid: { r: 1.25 }, reach: 2.5, accepts: ['log'], cap: 40, role: 'fuel',
  },
  // ---- Kettle Yard ----
  // Frozen stream along the west palisade: fishing holes are the source of fish from the very start.
  ...streamHoles(),
  {
    // Plain storage: a one-off starter stock, never refills; the yard fisher fills it.
    id: 'crateA', type: 'pile', area: 'kettleYard', name: 'Fish crate', model: 'fishCrate', x: -3.4, z: 13.2,
    solid: { r: 0.75 }, reach: 1.75, item: 'fish', cap: 14, start: 6, refill: 0, accepts: true,
  },
  { id: 'shelfYard', type: 'shelf', area: 'kettleYard', name: 'Bin', model: 'barrel', x: 5.7, z: 15.4, rot: 0,
    solid: { r: 0.45 }, reach: 1.7 },
  {
    id: 'kettleA', type: 'processor', area: 'kettleYard', name: 'Kettle', model: 'kettle', x: -2.2, z: 10.0,
    solid: { r: 0.8 }, reach: 1.85, recipe: 'stew', inputCap: 10, outputCap: 10, operator: 'none', speedMod: 'cookSpeed',
  },
  {
    id: 'kettleB', type: 'processor', area: 'kettleYard', name: 'Second kettle', model: 'kettle', x: 1.6, z: 10.0,
    solid: { r: 0.8 }, reach: 1.85, recipe: 'stew', inputCap: 10, outputCap: 10, operator: 'boost', boost: 2, speedMod: 'cookSpeed',
    unlockedBy: 'pad_kettleB',
  },

  counter('counterA', -2.2, undefined, 'Counter', -1),
  counter('counterB', 3.0, 'pad_counterB', 'Second counter', 1),
  // ---- Pinewood ----
  {
    id: 'sawmill', type: 'processor', area: 'pinewood', name: 'Sawmill', model: 'sawmill', x: -11.4, z: 3.6, rot: Math.PI / 2,
    solid: { hw: 0.8, hd: 1.2 }, reach: 2.1, recipe: 'plank', inputCap: 12, outputCap: 24, operator: 'none',
    unlockedBy: 'pad_sawmill',
  },
  {
    id: 'woodpile', type: 'pile', area: 'pinewood', name: 'Woodpile', model: 'woodPile', x: -11.4, z: -2.8,
    solid: { r: 0.9 }, reach: 1.9, item: 'log', cap: 30, start: 0, refill: 0, accepts: true, unlockedBy: 'pad_lumberjack',
  },
  { id: 'shelfPine', type: 'shelf', area: 'pinewood', name: 'Bin', model: 'barrel', x: -12.4, z: 9.6, rot: 0,
    solid: { r: 0.45 }, reach: 1.7 },
  ...pines(),
];

function counter(id: string, x: number, unlockedBy: string | undefined, name: string, side: number): StationDef {
  return {
    id, type: 'counter', area: 'kettleYard', name, model: 'counter', x, z: YARD_COUNTER_Z, rot: 0,
    solid: { hw: 1.15, hd: 0.5 }, reach: 1.85, item: 'stew', cap: 12, serveTime: 0.55,
    queueDir: { x: 0, z: 1 }, queueLen: 40, queueSpacing: 0.8, queueStart: { x, z: QUEUE_Z },
    emberSpot: { x: x + 1.7, z: YARD_COUNTER_Z - 1.6 },
    // Thawed villagers walk round the outside of the yard palisade to camp.
    exitPath: [
      { x: x + side * 2.1, z: QUEUE_Z + 0.4 },
      { x: side * 7.4, z: QUEUE_Z + 0.4 },
      { x: side * 7.4, z: 7.4 },
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

function streamHoles(): StationDef[] {
  return [8.8, 11.6, 14.4].map((z, i): StationDef => ({
    id: `streamHole${i}`, type: 'node', area: 'kettleYard', name: 'Fishing hole', model: 'iceHole', x: -5.6, z, rot: i * 1.7,
    solid: { r: 0.5 }, reach: 1.45, tag: 'stream', item: 'fish', hitTime: 0.4, yieldPerHit: 2, hits: 2, regrow: 7,
    groundCap: 6, speedMod: 'fishSpeed', unlockedBy: i === 2 ? 'pad_crateB' : undefined,
  }));
}

function pines(): StationDef[] {
  const out: StationDef[] = [];
  const r = lrng(7);
  let i = 0;
  // A compact grove (3 × 6) right next to the woodpile and sawmill, ~2.6 m apart with ~2 m lanes.
  for (let k = 0; k < 6; k++) {
    const gz = -7.6 + k * 2.6;
    for (const gx of [-19.6, -17.0, -14.4]) {
      const x = gx + (r() - 0.5) * 0.5;
      const z = gz + (r() - 0.5) * 0.5;
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
    path: [{ x: -2.2, z: 10.9 }, { x: -2.2, z: 15.1 }], unlockedBy: 'pad_beltA', maxOnBelt: 6,
  },
  {
    id: 'woodbelt', area: 'pinewood', from: 'woodpile', to: 'sawmill', item: 'log', interval: 0.8, travel: 5,
    path: [{ x: -11.4, z: -1.8 }, { x: -11.4, z: 2.3 }], unlockedBy: 'pad_woodbelt', maxOnBelt: 6,
  },
];

export const HELPERS: HelperDef[] = [
  {
    id: 'porter', name: 'Porter', role: 'haul', model: 'porter', home: { x: -0.4, z: 7.6 }, capacity: 5, speed: 3.4,
    from: ['crateA'], to: ['kettleA'], item: 'fish', transferTime: 0.16,
  },
  {
    id: 'yardFisher', name: 'Fisher', role: 'harvest', model: 'fisher', home: { x: -3.6, z: 7.0 }, capacity: 6,
    speed: 3.4, nodeTag: 'stream', to: ['crateA'], transferTime: 0.12,
  },
  {
    // Runs the second kettle by herself: fetches fish from the crate, cooks at double speed, stacks the stew.
    id: 'cook', name: 'Cook', role: 'operate', model: 'cook', home: { x: 3.6, z: 8.4 }, capacity: 6, speed: 3.2,
    station: 'kettleB', from: ['crateA'], transferTime: 0.14,
  },
  {
    id: 'lumberjack', name: 'Lumberjack', role: 'harvest', model: 'lumberjack', home: { x: -13, z: -0.4 }, capacity: 6,
    speed: 3.4, nodeTag: 'pine', to: ['woodpile'], transferTime: 0.14,
  },
  {
    id: 'stoker', name: 'Stoker', role: 'haul', model: 'porter', home: { x: -6, z: -1 }, capacity: 6, speed: 3.6,
    from: ['woodpile'], to: ['hearth', 'sawmill'], item: 'log', transferTime: 0.14,
  },
];

export const PADS: PadDef[] = [
  // ---- Kettle Yard ----
  { id: 'pad_pack1', area: 'kettleYard', x: 1.4, z: 13.0, label: 'Bigger pack', cost: 20, requires: [],
    effects: [{ type: 'capacity', add: 3 }], icon: { item: 'fish' } },
  { id: 'pad_kettleB', area: 'kettleYard', x: 1.6, z: 10.0, label: 'Second kettle', cost: 50, requires: ['pad_pack1'],
    effects: [{ type: 'unlock', id: 'kettleB' }], icon: { prop: 'kettle' } },
  { id: 'pad_counterB', area: 'kettleYard', x: 3.2, z: 14.4, label: 'Second counter', cost: 110, requires: ['pad_kettleB'],
    effects: [{ type: 'unlock', id: 'counterB' }], icon: { prop: 'counter' } },
  { id: 'pad_ladles', area: 'camp', x: -7.0, z: 9.0, label: 'Iron ladles', cost: 75, requires: ['pad_counterB'],
    effects: [{ type: 'mod', key: 'cookSpeed', mul: 1.25 }, { type: 'mod', key: 'transferRate', mul: 1.15 }], icon: { prop: 'kettle' } },
  { id: 'pad_fisherYard', area: 'kettleYard', x: -4.0, z: 7.2, label: 'Hire a fisher', cost: 140, requires: ['pad_ladles'],
    requiresPop: 6, effects: [{ type: 'hire', helper: 'yardFisher' }], icon: { character: 'fisher' } },
  { id: 'pad_porter', area: 'kettleYard', x: 4.4, z: 7.6, label: 'Hire a porter', cost: 150, requires: ['pad_fisherYard'],
    requiresPop: 10, effects: [{ type: 'hire', helper: 'porter' }], icon: { character: 'porter' } },
  { id: 'pad_crateB', area: 'kettleYard', x: -4.4, z: 15.2, label: 'Cut another fishing hole', cost: 160, requires: ['pad_porter'],
    effects: [{ type: 'unlock', id: 'streamHole2' }], icon: { prop: 'iceHole' } },
  { id: 'pad_beltA', area: 'kettleYard', x: -0.8, z: 13.6, label: 'Stew conveyor', cost: 260, requires: ['pad_porter'],
    effects: [{ type: 'unlock', id: 'beltA' }], icon: { prop: 'conveyor' } },
  { id: 'pad_pack2', area: 'kettleYard', x: 1.4, z: 13.0, label: 'Bigger pack', cost: 250, requires: ['pad_beltA', 'pad_crateB'],
    effects: [{ type: 'capacity', add: 3 }], icon: { item: 'stew' } },
  { id: 'pad_cook', area: 'kettleYard', x: 5.2, z: 10.6, label: 'Hire a cook', cost: 320, requires: ['pad_beltA'],
    requiresPop: 25, effects: [{ type: 'hire', helper: 'cook' }], icon: { character: 'cook' } },
  { id: 'pad_hearth2', area: 'camp', x: 4.2, z: 4.2, label: 'Raise the Hearth', cost: 500, requires: ['pad_pack2', 'pad_cook'],
    effects: [{ type: 'hearth', level: 2 }], icon: { prop: 'hearth', level: 2 } },
  // ---- Pinewood ----
  { id: 'pad_sawmill', area: 'pinewood', x: -11.4, z: 3.6, label: 'Sawmill', cost: 260, requires: ['pad_hearth2'],
    effects: [{ type: 'unlock', id: 'sawmill' }], icon: { prop: 'sawmill' } },
  { id: 'pad_cabin1', area: 'camp', x: -12.4, z: -11.4, label: 'Cabin', cost: 210, materials: { plank: 8 }, requires: ['pad_sawmill'],
    effects: [{ type: 'unlock', id: 'cabin1' }, { type: 'mod', key: 'spawnRate', add: 0.25 }], icon: { prop: 'cabin' } },
  { id: 'pad_pack3', area: 'pinewood', x: -17.0, z: 8.6, label: 'Sturdy pack', cost: 390, materials: { plank: 6 }, requires: ['pad_sawmill'],
    effects: [{ type: 'capacity', add: 4 }], icon: { item: 'log' } },
  { id: 'pad_axe', area: 'pinewood', x: -14.4, z: 8.6, label: 'Sharper axe', cost: 330, requires: ['pad_pack3'],
    effects: [{ type: 'mod', key: 'chopSpeed', mul: 1.6 }, { type: 'tool', tool: 'axe' }], icon: { prop: 'stump' } },
  { id: 'pad_pots', area: 'kettleYard', x: 5.3, z: 12.6, label: 'Copper pots', cost: 440, materials: { plank: 10 }, requires: ['pad_cabin1'],
    effects: [{ type: 'mod', key: 'cookSpeed', mul: 1.6 }, { type: 'mod', key: 'pricePlus', add: 1 }, { type: 'tool', tool: 'kettle' }], icon: { prop: 'kettle', level: 2 } },
  { id: 'pad_lumberjack', area: 'pinewood', x: -11.4, z: -2.8, label: 'Hire a lumberjack', cost: 560, requires: ['pad_cabin1', 'pad_pack3'],
    requiresPop: 45, effects: [{ type: 'unlock', id: 'woodpile' }, { type: 'hire', helper: 'lumberjack' }], icon: { character: 'lumberjack' } },
  { id: 'pad_boots', area: 'camp', x: -4.2, z: 4.2, label: 'Warm boots', cost: 440, requires: ['pad_pots'],
    effects: [{ type: 'mod', key: 'moveSpeed', mul: 1.15 }], icon: { prop: 'sled' } },
  { id: 'pad_cabin2', area: 'camp', x: 12.4, z: -11.4, label: 'Cabin', cost: 550, materials: { plank: 14 }, requires: ['pad_lumberjack'],
    effects: [{ type: 'unlock', id: 'cabin2' }, { type: 'mod', key: 'spawnRate', add: 0.25 }], icon: { prop: 'cabin' } },
  { id: 'pad_woodbelt', area: 'pinewood', x: -9.4, z: 8.0, label: 'Log conveyor', cost: 560, requires: ['pad_lumberjack'],
    effects: [{ type: 'unlock', id: 'woodbelt' }], icon: { prop: 'conveyor' } },
  { id: 'pad_stoker', area: 'camp', x: -4.2, z: -4.2, label: 'Hire a stoker', cost: 700, requires: ['pad_woodbelt'],
    requiresPop: 70, effects: [{ type: 'hire', helper: 'stoker' }], icon: { character: 'porter' } },
  { id: 'pad_cabin3', area: 'camp', x: 12.4, z: 8.0, label: 'Cabin', cost: 1000, materials: { plank: 20 }, requires: ['pad_cabin2', 'pad_boots'],
    effects: [{ type: 'unlock', id: 'cabin3' }, { type: 'mod', key: 'spawnRate', add: 0.25 }, { type: 'mod', key: 'helperSpeed', mul: 1.2 }],
    icon: { prop: 'cabin' } },
  { id: 'pad_hearth3', area: 'camp', x: 4.2, z: 4.2, label: 'Raise the Hearth', cost: 1550, materials: { plank: 30 },
    requires: ['pad_stoker', 'pad_cabin3'], effects: [{ type: 'hearth', level: 3 }], icon: { prop: 'hearth', level: 3 } },
];

// ---- Camp ----
const TENT_RING: [number, number][] = [
  [4.6, 250], [4.6, 290], [4.6, 215], [4.6, 325], [4.7, 180], [4.7, 0], [4.9, 148], [4.9, 32],
  [7.4, 270], [7.2, 237], [7.2, 303], [7.4, 160], [7.4, 340],
];
/** Outer corner spots for the biggest milestones. */
const TENT_EXTRA = [{ x: -7.8, z: -7.9 }, { x: 7.8, z: -7.9 }, { x: -7.3, z: 5.0 }];
export const CAMP: CampDef = {
  hearth: { x: 0, z: 0 },
  tentAt: [2, 5, 9, 14, 20, 27, 35, 44, 54, 65, 77, 90, 104, 150, 220, 320],
  tentSpots: TENT_RING.map(([r, deg]) => {
    const a = (deg * Math.PI) / 180;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }).concat(TENT_EXTRA).map(({ x, z }) => ({ x, z, rot: Math.atan2(-x, -z) })),
  housing: { base: 8, perTent: 5, perCabin: 12, cabins: ['cabin1', 'cabin2', 'cabin3', 'cabin4', 'cabin5'], tentsPerLevel: [4, 8, 11, 14, 16] },
  settleMin: 3.6,
  settleMax: 9.0,
};

export const DECOR: DecorDef[] = [
  { id: 'cabin1', area: 'camp', model: 'cabin', x: -12.4, z: -11.4, rot: 0.5, scale: 0.72, unlockedBy: 'pad_cabin1', solid: { hw: 0.94, hd: 0.8 } },
  { id: 'cabin2', area: 'camp', model: 'cabin', x: 12.4, z: -11.4, rot: -0.5, scale: 0.72, unlockedBy: 'pad_cabin2', solid: { hw: 0.94, hd: 0.8 } },
  { id: 'cabin3', area: 'camp', model: 'cabin', x: 12.4, z: 8.0, rot: -2.4, scale: 0.72, unlockedBy: 'pad_cabin3', solid: { hw: 0.94, hd: 0.8 } },
  { id: 'sign_yard', area: 'camp', model: 'signpost', x: 5.6, z: 10.4, rot: 0.3 },
  { id: 'lantern2', area: 'kettleYard', model: 'lantern', x: 6.2, z: 8.4 },
  { id: 'lantern3', area: 'kettleYard', model: 'lantern', x: -6.2, z: 15.9 },
  { id: 'bench1', area: 'camp', model: 'bench', x: -2.6, z: 2.3, rot: 2.3 },
  { id: 'bench2', area: 'camp', model: 'bench', x: 2.6, z: 2.3, rot: -2.3 },
  { id: 'barrel1', area: 'kettleYard', model: 'barrel', x: -5.0, z: 6.2, solid: { r: 0.4 } },
  { id: 'snowman1', area: 'camp', model: 'snowman', x: -12.8, z: 10.0, solid: { r: 0.45 } },
  { id: 'sled1', area: 'pinewood', model: 'sled', x: -12.0, z: -9.4, rot: 0.6, solid: { r: 0.6 } },
  { id: 'sign_lake', area: 'frozenLake', model: 'signpost', x: 9.4, z: 4.0, rot: -0.4 },
  { id: 'sign_ridge', area: 'ironridge', model: 'signpost', x: -4.0, z: -9.6, rot: 0.2 },
];

export const PLAYER_START: Vec2 = { x: -1.6, z: 13.6 };
