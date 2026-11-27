// Late campaign content: Frozen Lake (Area 3), Ironridge (Area 4), Beacon Peak (Area 5) and the
// Open Season (endless) market. Appended to the base world arrays in ./index.ts.
//
// Every work loop is a compact walled yard (palisades/floors in dressing.ts); neighbours ~3–5 m apart.
//   Frozen Lake  x 7.6..35, z -16.4..7.8 a big rounded rink in the middle (holes ring its north and east rims),
//                                        the south shore boardwalk with racks + smokehouses and the counters in its
//                                        fence (the Icebound crowd masses beyond, z > 8), the market on the east
//                                        shore, the deep-snow lot in the north-east corner, the open lake north.
//   Ironridge    x -10..8.8, z -26..-7.6 ore veins west, forge centre, Great Kitchen east, feast counters in the
//                                        east palisade; crowds mass outside it (x > 9).
//   Beacon Peak  x -6.5..6.5, z -38..-25 the Great Beacon at the summit.
//   Market       x 28..34, z -7..1       Open Season upgrade pads on the east shore, by the notice board.

import { LAKE_HOLES } from './mechanics';
import type {
  CounterDef, DecorDef, EndlessDef, FinaleDef, HelperDef, LinkDef, PadDef, Rect, StationDef, Vec2,
} from './types';

// ------------------------------------------------------------------ helpers

/**
 * Snaking queue polyline. Starts at `start`, runs `lead` metres along `u`, then zig-zags in rows
 * of half-width `half` across `v`, each row `gap` further along `u`.
 */
function snake(start: Vec2, u: Vec2, v: Vec2, lead: number, half: number, gap: number, rows: number): Vec2[] {
  const at = (a: number, b: number): Vec2 => ({ x: start.x + u.x * a + v.x * b, z: start.z + u.z * a + v.z * b });
  const pts: Vec2[] = [at(0, 0), at(lead, 0)];
  let side = 1;
  for (let i = 0; i < rows; i++) {
    const a = lead + i * gap;
    pts.push(at(a, side * half));
    pts.push(at(a + gap, side * half));
    side = -side;
  }
  return pts;
}

function lateCounter(o: {
  id: string; area: 'frozenLake' | 'ironridge'; name: string; x: number; z: number; item: CounterDef['item'];
  facing: 'south' | 'east'; unlockedBy: string; queueLen: number; exitPath: Vec2[]; spawn: Vec2; wantMax: number;
}): CounterDef {
  const south = o.facing === 'south';
  const u: Vec2 = south ? { x: 0, z: 1 } : { x: 1, z: 0 };
  const v: Vec2 = south ? { x: 1, z: 0 } : { x: 0, z: 1 };
  const queueStart = { x: o.x + u.x * 1.4, z: o.z + u.z * 1.4 };
  return {
    id: o.id, type: 'counter', area: o.area, name: o.name, model: 'counter', x: o.x, z: o.z, rot: south ? 0 : Math.PI / 2,
    solid: south ? { hw: 1.15, hd: 0.5 } : { hw: 0.5, hd: 1.15 }, reach: 1.85, item: o.item, cap: 16, serveTime: 0.55,
    queueDir: u, queueLen: o.queueLen, queueSpacing: 0.8, queueStart,
    // Packed crowd (queueSlot) fanning out beyond the palisade gap.
    emberSpot: south ? { x: o.x + 1.7, z: o.z - 1.6 } : { x: o.x - 1.6, z: o.z + 1.7 },
    exitPath: o.exitPath, spawn: o.spawn, wantMin: 1, wantMax: o.wantMax, unlockedBy: o.unlockedBy,
    spawnPer: 1, startCrowd: Math.round(o.queueLen * 0.6),
  };
}

function grid<T>(xs: number[], zs: number[], skip: (x: number, z: number) => boolean, make: (x: number, z: number, i: number) => T): T[] {
  const out: T[] = [];
  let i = 0;
  for (const z of zs) for (const x of xs) if (!skip(x, z)) out.push(make(x, z, i++));
  return out;
}

// ------------------------------------------------------------------ Frozen Lake (Area 3)

// Thawed villagers walk round the outside of the palisade to camp.
const LAKE_EXIT_A: Vec2[] = [{ x: 10.8, z: 8.9 }, { x: 7.4, z: 8.9 }, { x: 6.0, z: 6.0 }, { x: 4.0, z: 4.8 }];
const LAKE_EXIT_B: Vec2[] = [{ x: 23.8, z: 8.9 }, { x: 35.8, z: 8.9 }, { x: 35.8, z: -17.0 }, { x: 6.0, z: -17.0 }, { x: 6.0, z: -3.6 }, { x: 3.0, z: -1.6 }];

const ICE_HOLES: StationDef[] = LAKE_HOLES.map((h, i) => ({
  id: `hole${i}`, type: 'node', area: 'frozenLake', name: 'Ice hole', model: 'iceHole',
  x: h.x, z: h.z, rot: i * 1.3, solid: { r: 0.55 }, reach: 1.5,
  tag: 'iceHole', item: 'fish', hitTime: 0.5, yieldPerHit: 3, hits: 3, regrow: 12, groundCap: 8, speedMod: 'fishSpeed',
}));

const LAKE_STATIONS: StationDef[] = [
  ...ICE_HOLES,
  {
    id: 'fishRack', type: 'pile', area: 'frozenLake', name: 'Fish rack', model: 'fishCrate', x: 17.6, z: 1.4,
    solid: { r: 0.7 }, reach: 1.8, item: 'fish', cap: 40, start: 0, refill: 0, accepts: true, unlockedBy: 'pad_fisher',
  },
  {
    id: 'smokehouseA', type: 'processor', area: 'frozenLake', name: 'Smokehouse', model: 'smokehouse', x: 13.6, z: 1.4,
    solid: { hw: 1.1, hd: 0.9 }, reach: 2.2, recipe: 'smokedFish', inputCap: 12, outputCap: 16, operator: 'none',
    speedMod: 'cookSpeed', unlockedBy: 'pad_smokehouseA',
  },
  {
    id: 'smokehouseB', type: 'processor', area: 'frozenLake', name: 'Second smokehouse', model: 'smokehouse', x: 21.6, z: 1.4,
    solid: { hw: 1.1, hd: 0.9 }, reach: 2.2, recipe: 'smokedFish', inputCap: 12, outputCap: 16, operator: 'boost', boost: 2,
    speedMod: 'cookSpeed', unlockedBy: 'pad_smokehouseB',
  },
  {
    id: 'logRack', type: 'pile', area: 'frozenLake', name: 'Log rack', model: 'woodPile', x: 9.6, z: 1.4,
    solid: { r: 0.7 }, reach: 1.8, item: 'log', cap: 40, start: 0, refill: 0, accepts: true, unlockedBy: 'pad_courier',
  },
  { id: 'shelfLake', type: 'shelf', area: 'frozenLake', name: 'Bin', model: 'barrel', x: 9.4, z: 6.6, rot: Math.PI / 2,
    solid: { r: 0.45 }, reach: 1.7 },
  lateCounter({
    id: 'lakeCounterA', area: 'frozenLake', name: 'Lakeside counter', x: 13.6, z: 7.3, item: 'smokedFish', facing: 'south',
    unlockedBy: 'pad_lakeCounterA', queueLen: 44, exitPath: LAKE_EXIT_A, spawn: { x: 12.8, z: 30 }, wantMax: 2,
  }),
  lateCounter({
    id: 'lakeCounterB', area: 'frozenLake', name: 'Second lakeside counter', x: 21.6, z: 7.3, item: 'smokedFish', facing: 'south',
    unlockedBy: 'pad_lakeCounterB', queueLen: 44, exitPath: LAKE_EXIT_B, spawn: { x: 17.6, z: 30 }, wantMax: 2,
  }),
];

// ------------------------------------------------------------------ Ironridge (Area 4)

const FEAST_EXIT_A: Vec2[] = [{ x: 9.8, z: -18.8 }, { x: 9.8, z: -8.4 }, { x: 3.0, z: -3.0 }];
const FEAST_EXIT_B: Vec2[] = [{ x: 9.8, z: -23.8 }, { x: 9.8, z: -8.4 }, { x: 3.0, z: -3.0 }];

const ORE_VEINS: StationDef[] = grid(
  [-7.6, -5.0, -2.4], [-25.0, -22.0, -19.0], () => false,
  (gx, gz, i) => ({
    id: `vein${i}`, type: 'node', area: 'ironridge', name: 'Ore vein', model: 'oreVein',
    x: gx + ((i % 2) ? 0.2 : 0), z: gz, rot: i * 0.9, solid: { r: 0.6 }, reach: 1.55,
    tag: 'ore', item: 'ore', hitTime: 0.55, yieldPerHit: 1, hits: 4, regrow: 14, groundCap: 6, speedMod: 'mineSpeed',
  }),
);

const PEAK_STATIONS: StationDef[] = [
  { id: 'shelfPeak', type: 'shelf', area: 'beaconPeak', name: 'Bin', model: 'barrel', x: -7.0, z: -38.0, rot: Math.PI / 2,
    solid: { r: 0.45 }, reach: 1.7 },
];

const RIDGE_STATIONS: StationDef[] = [
  ...ORE_VEINS,
  {
    id: 'oreBin', type: 'pile', area: 'ironridge', name: 'Ore bin', model: 'crate', x: -7.8, z: -12.4,
    solid: { r: 0.7 }, reach: 1.8, item: 'ore', cap: 40, start: 0, refill: 0, accepts: true, unlockedBy: 'pad_miner',
  },
  {
    id: 'ridgeLogRack', type: 'pile', area: 'ironridge', name: 'Log rack', model: 'woodPile', x: -6.2, z: -9.6,
    solid: { r: 0.7 }, reach: 1.8, item: 'log', cap: 40, start: 0, refill: 0, accepts: true, unlockedBy: 'pad_courierB',
  },
  {
    id: 'forge', type: 'processor', area: 'ironridge', name: 'Forge', model: 'forge', x: -3.0, z: -12.4,
    solid: { r: 1.0 }, reach: 2.1, recipe: 'ingot', inputCap: 12, outputCap: 20, operator: 'none', unlockedBy: 'pad_forge',
  },
  {
    id: 'greatKitchen', type: 'processor', area: 'ironridge', name: 'Great Kitchen', model: 'greatKitchen', x: 1.6, z: -16.0,
    solid: { hw: 1.3, hd: 1.0 }, reach: 2.3, recipe: 'feast', inputCap: 12, outputCap: 16, operator: 'boost', boost: 2,
    speedMod: 'cookSpeed', unlockedBy: 'pad_greatKitchen',
  },
  { id: 'shelfRidge', type: 'shelf', area: 'ironridge', name: 'Bin', model: 'barrel', x: -9.3, z: -16.2, rot: Math.PI / 2,
    solid: { r: 0.45 }, reach: 1.7 },
  lateCounter({
    id: 'feastCounterA', area: 'ironridge', name: 'Feast counter', x: 8.3, z: -17.0, item: 'feast', facing: 'east',
    unlockedBy: 'pad_feastCounterA', queueLen: 48, exitPath: FEAST_EXIT_A, spawn: { x: 34, z: -17.0 }, wantMax: 2,
  }),
  lateCounter({
    id: 'feastCounterB', area: 'ironridge', name: 'Second feast counter', x: 8.3, z: -22.0, item: 'feast', facing: 'east',
    unlockedBy: 'pad_feastCounterB', queueLen: 48, exitPath: FEAST_EXIT_B, spawn: { x: 34, z: -21.4 }, wantMax: 2,
  }),
];

// ------------------------------------------------------------------ Open Season notice board (west lakeshore, by the market)

export const ORDER_BOARD = 'orderBoard';

const CAMP_STATIONS: StationDef[] = [
  {
    // Always standing; only takes items while caravan orders are open (after the finale).
    id: ORDER_BOARD, type: 'deposit', area: 'frozenLake', name: 'Notice board', model: 'noticeBoard', x: 29.2, z: 4.6,
    rot: 0, solid: { r: 0.5 }, reach: 2.0, accepts: ['fish', 'stew', 'log', 'plank', 'smokedFish', 'ore', 'ingot', 'feast'],
    cap: 9999, role: 'orders',
  },
];

export const LATE_STATIONS: StationDef[] = [...LAKE_STATIONS, ...RIDGE_STATIONS, ...PEAK_STATIONS, ...CAMP_STATIONS];

// ------------------------------------------------------------------ links

export const LATE_LINKS: LinkDef[] = [
  {
    id: 'lakeBeltA', area: 'frozenLake', from: 'smokehouseA', to: 'lakeCounterA', item: 'smokedFish', interval: 0.45, travel: 3,
    path: [{ x: 13.6, z: 2.9 }, { x: 13.6, z: 6.8 }], unlockedBy: 'pad_lakeBeltA', maxOnBelt: 8,
  },
  {
    id: 'lakeBeltB', area: 'frozenLake', from: 'smokehouseB', to: 'lakeCounterB', item: 'smokedFish', interval: 0.45, travel: 3,
    path: [{ x: 21.6, z: 2.9 }, { x: 21.6, z: 6.8 }], unlockedBy: 'pad_lakeBeltB', maxOnBelt: 8,
  },
  {
    id: 'oreBelt', area: 'ironridge', from: 'oreBin', to: 'forge', item: 'ore', interval: 0.5, travel: 2.2,
    path: [{ x: -7.1, z: -12.4 }, { x: -4.4, z: -12.4 }], unlockedBy: 'pad_oreBelt', maxOnBelt: 5,
  },
  {
    id: 'feastBelt', area: 'ironridge', from: 'greatKitchen', to: 'feastCounterA', item: 'feast', interval: 0.5, travel: 3.4,
    path: [{ x: 4.6, z: -17.0 }, { x: 7.8, z: -17.0 }], unlockedBy: 'pad_feastBelt', maxOnBelt: 8,
  },
  {
    id: 'feastBeltB', area: 'ironridge', from: 'greatKitchen', to: 'feastCounterB', item: 'feast', interval: 0.5, travel: 4.5,
    path: [{ x: 1.6, z: -19.0 }, { x: 1.6, z: -22.0 }, { x: 7.8, z: -22.0 }], unlockedBy: 'pad_feastBeltB', maxOnBelt: 10,
  },
];

// ------------------------------------------------------------------ helpers (incl. sled-dog couriers)

/** Woodpile (Pinewood) → lake log rack / smokehouse, along the south edge of camp. */
export const ROUTE_LAKE: Vec2[] = [
  { x: -10.2, z: -2.0 }, { x: -9.4, z: 0.0 }, { x: 3.0, z: 0.0 }, { x: 8.4, z: 0.0 }, { x: 10.8, z: 3.4 },
];
/** Woodpile → Ironridge forge, through the Pinewood–Ironridge gap. */
export const ROUTE_RIDGE: Vec2[] = [{ x: -10.2, z: -3.8 }, { x: -9.4, z: 0.0 }, { x: -3.0, z: -3.0 }, { x: -2.0, z: -6.0 }, { x: -5.2, z: -8.6 }];
/** Smokehouses → Great Kitchen, past the market and the camp's north-east corner. */
export const ROUTE_KITCHEN: Vec2[] = [
  { x: 17.6, z: -0.4 }, { x: 8.6, z: -0.4 }, { x: 3.0, z: -3.0 }, { x: 0.0, z: -6.0 }, { x: 3.4, z: -12.0 },
];

export const LATE_HELPERS: HelperDef[] = [
  {
    id: 'lumberjack2', name: 'Lumberjack', role: 'harvest', model: 'lumberjack', home: { x: -15.6, z: -9.2 }, capacity: 6,
    speed: 3.4, nodeTag: 'pine', to: ['woodpile'], transferTime: 0.14,
  },
  {
    id: 'fisher', name: 'Fisher', role: 'harvest', model: 'fisher', home: { x: 16.0, z: -0.1 }, capacity: 8,
    speed: 3.4, nodeTag: 'iceHole', to: ['fishRack'], transferTime: 0.12,
  },
  {
    id: 'lakePorter', name: 'Porter', role: 'haul', model: 'porter', home: { x: 11.4, z: 0.0 }, capacity: 8, speed: 3.6,
    from: ['fishRack'], to: ['smokehouseA'], item: 'fish', transferTime: 0.14,
  },
  {
    id: 'sledDog', name: 'Sled dog', role: 'courier', model: 'dog', home: ROUTE_LAKE[0], capacity: 16, speed: 7.5,
    from: ['woodpile'], to: ['smokehouseA', 'logRack'], item: 'log', transferTime: 0.08, route: ROUTE_LAKE,
  },
  {
    // Runs the second smokehouse by herself: fetches fish and logs from the racks, smokes at double speed.
    id: 'smoker', name: 'Smoker', role: 'operate', model: 'cook', home: { x: 19.6, z: 0.2 }, capacity: 8, speed: 3.4,
    station: 'smokehouseB', from: ['fishRack', 'logRack'], transferTime: 0.12,
  },
  {
    id: 'lumberjack3', name: 'Lumberjack', role: 'harvest', model: 'lumberjack', home: { x: -20.6, z: 9.6 }, capacity: 6,
    speed: 3.4, nodeTag: 'pine', to: ['woodpile'], transferTime: 0.14,
  },
  {
    id: 'miner', name: 'Miner', role: 'harvest', model: 'miner', home: { x: -4.0, z: -17.0 }, capacity: 8,
    speed: 3.4, nodeTag: 'ore', to: ['oreBin'], transferTime: 0.12,
  },
  {
    id: 'ridgeDog', name: 'Sled dog', role: 'courier', model: 'dog', home: ROUTE_RIDGE[0], capacity: 16, speed: 7.5,
    from: ['woodpile'], to: ['forge', 'ridgeLogRack'], item: 'log', transferTime: 0.08, route: ROUTE_RIDGE,
  },
  {
    id: 'kitchenPorter', name: 'Porter', role: 'haul', model: 'porter', home: { x: 1.2, z: -11.2 }, capacity: 10, speed: 4.2,
    from: ['kettleB', 'kettleA'], to: ['greatKitchen'], item: 'stew', transferTime: 0.12,
  },
  {
    id: 'kitchenDog', name: 'Sled dog', role: 'courier', model: 'dog', home: ROUTE_KITCHEN[0], capacity: 16, speed: 7.5,
    from: ['smokehouseA', 'smokehouseB'], to: ['greatKitchen'], item: 'smokedFish', transferTime: 0.08, route: ROUTE_KITCHEN,
  },
  {
    id: 'winder', name: 'Winder', role: 'crank', model: 'miner', home: { x: -11.0, z: -23.4 }, capacity: 0, speed: 3,
    station: 'capLift', transferTime: 0.2,
  },
  {
    // Runs the Great Kitchen at double speed and serves the second feast counter herself.
    id: 'chef', name: 'Chef', role: 'operate', model: 'cook', home: { x: 6.2, z: -14.6 }, capacity: 8, speed: 3.6,
    station: 'greatKitchen', to: ['feastCounterB'], transferTime: 0.12,
  },
];

// ------------------------------------------------------------------ pads

const HEARTH_SPOT = { x: 4.2, z: 4.2 };
const BEACON_PAD = { x: 0, z: -52.0 };

export const LATE_PADS: PadDef[] = [
  // ---- Signature mechanics ----
  { id: 'pad_plough', area: 'pinewood', x: -9.4, z: -4.8, label: 'Snow plough', cost: 400, materials: { plank: 10 }, requires: ['pad_woodbelt'],
    effects: [{ type: 'grant', what: 'plough' }], icon: { prop: 'plough' } },
  { id: 'pad_lantern', area: 'camp', x: 4.2, z: -4.2, label: 'Rescue lantern', cost: 530, requires: ['pad_stoker'],
    effects: [{ type: 'grant', what: 'lantern' }, { type: 'unlock', id: 'foundBoard' }], icon: { prop: 'lanternHeld' } },
  { id: 'pad_lantern2', area: 'camp', x: 4.2, z: -4.2, label: 'Brighter lantern', cost: 2600, requires: ['pad_lantern', 'pad_hearth4'],
    effects: [{ type: 'grant', what: 'lantern' }], icon: { prop: 'lanternHeld' } },
  { id: 'pad_skates', area: 'ironridge', x: -3.0, z: -29.0, label: 'Sharpened skates', cost: 1850, materials: { ingot: 6 }, requires: ['pad_forge'],
    effects: [{ type: 'grant', what: 'skates' }], icon: { prop: 'iceHole' } },
  { id: 'pad_bellows', area: 'ironridge', x: -13.0, z: -13.0, label: 'Forge bellows', cost: 1200, requires: ['pad_forge'],
    effects: [{ type: 'unlock', id: 'capBellows' }], icon: { prop: 'bellows' } },
  { id: 'pad_mineLift', area: 'ironridge', x: -13.0, z: -21.0, label: 'Mine lift', cost: 1700, requires: ['pad_miner'],
    effects: [{ type: 'unlock', id: 'capLift' }, { type: 'unlock', id: 'shaftPile' }, { type: 'unlock', id: 'mineLiftFrame' }], icon: { prop: 'mineLift' } },
  { id: 'pad_winder', area: 'ironridge', x: -11.4, z: -17.0, label: 'Hire a winder', cost: 2700, requires: ['pad_mineLift'],
    effects: [{ type: 'hire', helper: 'winder' }], icon: { character: 'miner' } },
  { id: 'pad_ploughBlade', area: 'ironridge', x: -14.4, z: -17.0, label: 'Wide plough blade', cost: 1700, materials: { ingot: 6 }, requires: ['pad_mineLift'],
    effects: [{ type: 'grant', what: 'plough' }], icon: { prop: 'plough' } },
  // ---- Frozen Lake ----
  { id: 'pad_smokehouseA', area: 'frozenLake', x: 13.6, z: 1.4, label: 'Smokehouse', cost: 550, requires: ['pad_hearth3'],
    effects: [{ type: 'unlock', id: 'smokehouseA' }], icon: { prop: 'smokehouse' } },
  { id: 'pad_lakeCounterA', area: 'frozenLake', x: 13.6, z: 6.6, label: 'Lakeside counter', cost: 700, requires: ['pad_smokehouseA'],
    effects: [{ type: 'unlock', id: 'lakeCounterA' }], icon: { prop: 'counter' } },
  { id: 'pad_lakeBeltA', area: 'frozenLake', x: 11.0, z: 4.6, label: 'Smoked fish conveyor', cost: 710, requires: ['pad_lakeCounterA'],
    effects: [{ type: 'unlock', id: 'lakeBeltA' }], icon: { prop: 'conveyor' } },
  { id: 'pad_lumberjack2', area: 'pinewood', x: -11.6, z: -7.4, label: 'Hire a lumberjack', cost: 750, requires: ['pad_lakeCounterA'],
    effects: [{ type: 'hire', helper: 'lumberjack2' }], icon: { character: 'lumberjack' } },
  { id: 'pad_fisher', area: 'frozenLake', x: 17.6, z: 1.4, label: 'Hire a fisher', cost: 760, requires: ['pad_lakeBeltA'],
    effects: [{ type: 'unlock', id: 'fishRack' }, { type: 'hire', helper: 'fisher' }], icon: { character: 'fisher' } },
  { id: 'pad_courier', area: 'frozenLake', x: 9.6, z: 1.4, label: 'Sled-dog courier', cost: 1500, requires: ['pad_fisher'],
    effects: [{ type: 'unlock', id: 'logRack' }, { type: 'hire', helper: 'sledDog' }], icon: { character: 'dog' } },
  { id: 'pad_lakePorter', area: 'frozenLake', x: 16.6, z: 4.0, label: 'Hire a porter', cost: 1350, requires: ['pad_fisher'],
    effects: [{ type: 'hire', helper: 'lakePorter' }], icon: { character: 'porter' } },
  { id: 'pad_auger', area: 'frozenLake', x: 26.0, z: 4.6, label: 'Ice auger', cost: 1350, materials: { plank: 12 }, requires: ['pad_fisher'],
    effects: [{ type: 'mod', key: 'fishSpeed', mul: 1.6 }, { type: 'tool', tool: 'auger' }], icon: { prop: 'iceHole' } },
  { id: 'pad_pack4', area: 'frozenLake', x: 28.8, z: 1.8, label: 'Fur-lined pack', cost: 1800, materials: { smokedFish: 10 },
    requires: ['pad_courier'], effects: [{ type: 'capacity', add: 4 }], icon: { item: 'smokedFish' } },
  { id: 'pad_smokehouseB', area: 'frozenLake', x: 21.6, z: 1.4, label: 'Second smokehouse', cost: 2050, materials: { plank: 16 },
    requires: ['pad_courier', 'pad_lakePorter'], effects: [{ type: 'unlock', id: 'smokehouseB' }], icon: { prop: 'smokehouse' } },
  { id: 'pad_lakeCounterB', area: 'frozenLake', x: 21.6, z: 6.6, label: 'Second lakeside counter', cost: 2300, requires: ['pad_smokehouseB'],
    effects: [{ type: 'unlock', id: 'lakeCounterB' }], icon: { prop: 'counter' } },
  { id: 'pad_smoker', area: 'frozenLake', x: 25.6, z: 1.4, label: 'Hire a smoker', cost: 2250, requires: ['pad_smokehouseB'],
    effects: [{ type: 'hire', helper: 'smoker' }], icon: { character: 'cook' } },
  { id: 'pad_lakeBeltB', area: 'frozenLake', x: 19.4, z: 5.6, label: 'Smoked fish conveyor', cost: 2650, requires: ['pad_lakeCounterB'],
    effects: [{ type: 'unlock', id: 'lakeBeltB' }], icon: { prop: 'conveyor' } },
  { id: 'pad_cabin4', area: 'frozenLake', x: 33.0, z: 5.4, label: 'Lakeside lodge', cost: 2450, materials: { plank: 24 },
    requires: ['pad_pack4'], effects: [{ type: 'unlock', id: 'cabin4' }, { type: 'mod', key: 'spawnRate', add: 0.25 }],
    icon: { prop: 'cabin' } },
  { id: 'pad_hearth4', area: 'camp', ...HEARTH_SPOT, label: 'Raise the Hearth', cost: 4600, materials: { plank: 40, smokedFish: 30 },
    requires: ['pad_lakeCounterB', 'pad_lakeBeltB', 'pad_smoker', 'pad_cabin4', 'pad_auger'],
    effects: [{ type: 'hearth', level: 4 }], icon: { prop: 'hearth', level: 4 } },

  // ---- Ironridge ----
  { id: 'pad_forge', area: 'ironridge', x: -3.0, z: -12.4, label: 'Forge', cost: 1450, requires: ['pad_hearth4'],
    effects: [{ type: 'unlock', id: 'forge' }], icon: { prop: 'forge' } },
  { id: 'pad_pick', area: 'ironridge', x: -4.4, z: -16.2, label: 'Steel pick', cost: 1200, materials: { ingot: 4 }, requires: ['pad_forge'],
    effects: [{ type: 'mod', key: 'mineSpeed', mul: 1.6 }, { type: 'tool', tool: 'pick' }], icon: { prop: 'oreVein' } },
  { id: 'pad_miner', area: 'ironridge', x: -7.8, z: -12.4, label: 'Hire a miner', cost: 1650, requires: ['pad_forge'],
    effects: [{ type: 'unlock', id: 'oreBin' }, { type: 'hire', helper: 'miner' }], icon: { character: 'miner' } },
  { id: 'pad_pack5', area: 'ironridge', x: 2.0, z: -26.6, label: 'Iron-frame pack', cost: 1900, materials: { ingot: 8 }, requires: ['pad_pick'],
    effects: [{ type: 'capacity', add: 5 }], icon: { item: 'ingot' } },
  { id: 'pad_lumberjack3', area: 'pinewood', x: -19.8, z: 8.6, label: 'Hire a lumberjack', cost: 1900, requires: ['pad_miner'],
    effects: [{ type: 'hire', helper: 'lumberjack3' }], icon: { character: 'lumberjack' } },
  { id: 'pad_courierB', area: 'ironridge', x: -6.2, z: -9.6, label: 'Sled-dog courier', cost: 2100, requires: ['pad_miner'],
    effects: [{ type: 'unlock', id: 'ridgeLogRack' }, { type: 'hire', helper: 'ridgeDog' }], icon: { character: 'dog' } },
  { id: 'pad_oreBelt', area: 'ironridge', x: -7.4, z: -15.4, label: 'Ore conveyor', cost: 2100, requires: ['pad_miner'],
    effects: [{ type: 'unlock', id: 'oreBelt' }], icon: { prop: 'conveyor' } },
  { id: 'pad_steelAxe', area: 'ironridge', x: 0.8, z: -9.6, label: 'Steel axe', cost: 1650, materials: { ingot: 6 }, requires: ['pad_pack5'],
    effects: [{ type: 'mod', key: 'chopSpeed', mul: 1.4 }, { type: 'tool', tool: 'axe' }], icon: { prop: 'stump' } },
  { id: 'pad_steelKettle', area: 'ironridge', x: 3.8, z: -9.6, label: 'Steel kettles', cost: 1900, materials: { ingot: 8 },
    requires: ['pad_steelAxe'], effects: [{ type: 'mod', key: 'cookSpeed', mul: 1.5 }, { type: 'tool', tool: 'kettle' }],
    icon: { prop: 'kettle', level: 3 } },
  { id: 'pad_greatKitchen', area: 'ironridge', x: 1.6, z: -16.0, label: 'Great Kitchen', cost: 2700, materials: { plank: 20, ingot: 10 },
    requires: ['pad_courierB', 'pad_steelKettle'], effects: [{ type: 'unlock', id: 'greatKitchen' }], icon: { prop: 'greatKitchen' } },
  { id: 'pad_feastCounterA', area: 'ironridge', x: 7.6, z: -17.0, label: 'Feast counter', cost: 2850, requires: ['pad_greatKitchen'],
    effects: [{ type: 'unlock', id: 'feastCounterA' }], icon: { prop: 'counter' } },
  { id: 'pad_kitchenPorter', area: 'ironridge', x: 6.8, z: -9.6, label: 'Hire a kitchen porter', cost: 3050, requires: ['pad_feastCounterA'],
    effects: [{ type: 'hire', helper: 'kitchenPorter' }], icon: { character: 'porter' } },
  { id: 'pad_kitchenDog', area: 'ironridge', x: 7.6, z: -12.8, label: 'Sled-dog courier', cost: 3300, requires: ['pad_feastCounterA'],
    effects: [{ type: 'hire', helper: 'kitchenDog' }], icon: { character: 'dog' } },
  { id: 'pad_feastBelt', area: 'ironridge', x: 6.2, z: -19.6, label: 'Feast conveyor', cost: 3600, requires: ['pad_kitchenPorter'],
    effects: [{ type: 'unlock', id: 'feastBelt' }], icon: { prop: 'conveyor' } },
  { id: 'pad_pack6', area: 'ironridge', x: 2.0, z: -26.6, label: 'Iron-frame pack', cost: 3300, materials: { ingot: 14 },
    requires: ['pad_pack5', 'pad_greatKitchen'], effects: [{ type: 'capacity', add: 5 }], icon: { item: 'feast' } },
  { id: 'pad_cabin5', area: 'ironridge', x: -8.4, z: -28.0, label: "Miners' lodge", cost: 2500, materials: { plank: 24 },
    requires: ['pad_feastCounterA'], effects: [{ type: 'unlock', id: 'cabin5' }, { type: 'mod', key: 'spawnRate', add: 0.25 }],
    icon: { prop: 'cabin' } },
  { id: 'pad_hearth5', area: 'camp', ...HEARTH_SPOT, label: 'Raise the Hearth', cost: 5200, materials: { plank: 26, ingot: 18, feast: 10 },
    requires: ['pad_feastBelt', 'pad_kitchenDog', 'pad_pack6', 'pad_cabin5', 'pad_oreBelt', 'pad_lumberjack3'],
    effects: [{ type: 'hearth', level: 5 }], icon: { prop: 'hearth', level: 5 } },

  // ---- Beacon Peak ----
  { id: 'pad_beacon1', area: 'beaconPeak', ...BEACON_PAD, label: 'Beacon: timber frame', cost: 2200, materials: { plank: 60 },
    requires: ['pad_hearth5'], effects: [{ type: 'beacon', stage: 1 }], icon: { prop: 'beacon', level: 1 } },
  { id: 'pad_peakLights', area: 'beaconPeak', x: 5.0, z: -30.6, label: 'Warm cloaks', cost: 3300, requires: ['pad_beacon1'],
    effects: [{ type: 'mod', key: 'moveSpeed', mul: 1.1 }], icon: { prop: 'brazier' } },
  { id: 'pad_beacon2', area: 'beaconPeak', ...BEACON_PAD, label: 'Beacon: iron crown', cost: 3750, materials: { ingot: 40 },
    requires: ['pad_beacon1'], effects: [{ type: 'beacon', stage: 2 }], icon: { prop: 'beacon', level: 2 } },
  { id: 'pad_feastCounterB', area: 'ironridge', x: 7.6, z: -22.0, label: 'Second feast counter', cost: 4350, requires: ['pad_beacon1'],
    effects: [{ type: 'unlock', id: 'feastCounterB' }], icon: { prop: 'counter' } },
  { id: 'pad_chef', area: 'ironridge', x: 7.8, z: -25.2, label: 'Hire a chef', cost: 3900, requires: ['pad_beacon2'],
    effects: [{ type: 'hire', helper: 'chef' }], icon: { character: 'cook' } },
  { id: 'pad_pack7', area: 'beaconPeak', x: -5.0, z: -31.2, label: 'Summit pack', cost: 4200, materials: { ingot: 12, plank: 20 },
    requires: ['pad_beacon2'], effects: [{ type: 'capacity', add: 5 }], icon: { item: 'plank' } },
  { id: 'pad_beacon3', area: 'beaconPeak', ...BEACON_PAD, label: 'Beacon: fire bed', cost: 3600, materials: { log: 60 },
    requires: ['pad_beacon2'], effects: [{ type: 'beacon', stage: 3 }], icon: { prop: 'beacon', level: 3 } },
  { id: 'pad_feastBeltB', area: 'ironridge', x: 4.0, z: -24.6, label: 'Feast conveyor', cost: 3900, requires: ['pad_beacon3', 'pad_feastCounterB'],
    effects: [{ type: 'unlock', id: 'feastBeltB' }], icon: { prop: 'conveyor' } },
  { id: 'pad_beacon4', area: 'beaconPeak', ...BEACON_PAD, label: 'Light the Great Beacon', cost: 4350, requires: ['pad_feastBeltB'],
    effects: [{ type: 'beacon', stage: 4 }], icon: { prop: 'beacon', level: 4 } },

  // ---- Open Season (after the finale): repeatable upgrades (market, east lakeshore) ----
  ...openSeasonPads(),
];

function openSeasonPads(): PadDef[] {
  // Labels must not overlap: 3 m apart. Upgrades at the lake market, decorations in the camp's north band.
  const spot = (i: number) => (i < 6 ? { x: 29.4 + (i % 2) * 3.0, z: -6.0 + Math.floor(i / 2) * 3.0 } : null);
  // Decorations: the strips beside the camp paths, where tents can never stand.
  const camp = (i: number) => [{ x: -2.4, z: -10.4 }, { x: 2.4, z: -10.4 }, { x: -10.4, z: -2.4 }, { x: 10.4, z: -2.4 }, { x: -10.4, z: 2.4 }, { x: 10.4, z: 2.4 }][i - 6];
  const req = ['pad_beacon4'];
  const up = (i: number, id: string, label: string, cost: number, growth: number, effects: PadDef['effects'], icon: PadDef['icon'], max?: number): PadDef => ({
    id, area: 'frozenLake', ...spot(i)!, label, cost, requires: req, effects, icon, repeat: { growth, max }, group: 'upgrade',
  });
  const deco = (i: number, id: string, label: string, cost: number, ids: string[], icon: PadDef['icon']): PadDef => ({
    id, area: 'camp', ...camp(i), label, cost, requires: req, effects: [{ type: 'decorate', ids }], icon, group: 'decor',
  });
  return [
    up(0, 'up_pack', 'Bigger pack', 1500, 1.2, [{ type: 'capacity', add: 1 }], { item: 'fish' }, 24),
    up(1, 'up_boots', 'Swifter boots', 1500, 1.3, [{ type: 'growth', key: 'moveSpeed', max: 0.5, rate: 0.1 }], { prop: 'sled' }),
    up(2, 'up_helpers', 'Helper cocoa', 2000, 1.3, [{ type: 'growth', key: 'helperSpeed', max: 1.0, rate: 0.08 }], { character: 'porter' }),
    up(3, 'up_helperPack', 'Helper baskets', 2000, 1.35, [{ type: 'growth', key: 'helperCapacity', max: 12, rate: 0.1 }], { prop: 'crate' }),
    up(4, 'up_cook', 'Hotter stoves', 1800, 1.3, [{ type: 'growth', key: 'cookSpeed', max: 1.5, rate: 0.08 }], { prop: 'kettle', level: 3 }),
    up(5, 'up_price', 'Famous recipes', 2500, 1.35, [{ type: 'growth', key: 'priceMul', max: 1.0, rate: 0.06 }], { item: 'feast' }),
    deco(6, 'deco_lanterns', 'Hearth lanterns', 3000, ['decoLantern1', 'decoLantern2', 'decoLantern3', 'decoLantern4'], { prop: 'lantern' }),
    deco(7, 'deco_benches', 'Fireside benches', 3500, ['decoBench1', 'decoBench2'], { prop: 'bench' }),
    deco(8, 'deco_snowmen', 'Snowman family', 4000, ['decoSnowman1', 'decoSnowman2', 'decoSnowman3'], { prop: 'snowman' }),
    deco(9, 'deco_bunting', 'Festival bunting', 5000, ['decoFlag1', 'decoFlag2', 'decoFlag3', 'decoFlag4'], { prop: 'signpost' }),
    deco(10, 'deco_braziers', 'Gate braziers', 6000, ['decoBrazier1', 'decoBrazier2'], { prop: 'brazier' }),
    deco(11, 'deco_sleds', 'Sled display', 8000, ['decoSled1', 'decoBarrel1', 'decoBarrel2', 'decoCrate1'], { prop: 'sled' }),
  ];
}

// ------------------------------------------------------------------ decor

export const LATE_DECOR: DecorDef[] = [
  // Lake
  { id: 'cabin4', area: 'frozenLake', model: 'cabin', x: 33.0, z: 5.4, rot: 0, scale: 0.72, unlockedBy: 'pad_cabin4', solid: { hw: 0.94, hd: 0.8 } },
  { id: 'lakeLantern1', area: 'frozenLake', model: 'lantern', x: 10.6, z: 7.4 },
  { id: 'lakeLantern2', area: 'frozenLake', model: 'lantern', x: 15.2, z: 7.4 },
  { id: 'lakeSled', area: 'frozenLake', model: 'sled', x: 34.0, z: 2.0, rot: 1.2, solid: { r: 0.6 } },
  // Ironridge
  { id: 'cabin5', area: 'ironridge', model: 'cabin', x: -8.4, z: -28.0, rot: 1.2, scale: 0.72, unlockedBy: 'pad_cabin5', solid: { hw: 0.94, hd: 0.8 } },
  { id: 'ridgeLantern1', area: 'ironridge', model: 'lantern', x: -1.0, z: -26.0 },
  { id: 'ridgeLantern2', area: 'ironridge', model: 'lantern', x: 6.4, z: -24.6 },
  { id: 'ridgeCrate', area: 'ironridge', model: 'crate', x: -9.3, z: -25.3, solid: { r: 0.4 } },
  { id: 'sign_peak', area: 'ironridge', model: 'signpost', x: -4.4, z: -29.4, rot: 0.3 },
  // Beacon Peak
  { id: 'greatBeacon', area: 'beaconPeak', model: 'beacon', x: 0, z: -57.0, solid: { r: 2.2 } },
  // Open Season decorations (camp; drawn once unlocked by their pad).
  ...[60, 120, 240, 300].map((deg, i): DecorDef => {
    const a = (deg * Math.PI) / 180;
    return { id: `decoLantern${i + 1}`, area: 'camp', model: 'lantern', x: Math.cos(a) * 3.4, z: Math.sin(a) * 3.4, unlockedBy: 'deco_lanterns' };
  }),
  { id: 'decoBench1', area: 'camp', model: 'bench', x: -2.6, z: -2.3, rot: 0.85, unlockedBy: 'deco_benches' },
  { id: 'decoBench2', area: 'camp', model: 'bench', x: 2.6, z: -2.3, rot: -0.85, unlockedBy: 'deco_benches' },
  { id: 'decoSnowman1', area: 'camp', model: 'snowman', x: -2.4, z: -6.0, unlockedBy: 'deco_snowmen' },
  { id: 'decoSnowman2', area: 'camp', model: 'snowman', x: 2.4, z: -6.0, scale: 0.8, unlockedBy: 'deco_snowmen' },
  { id: 'decoSnowman3', area: 'camp', model: 'snowman', x: -4.6, z: 7.2, scale: 0.6, unlockedBy: 'deco_snowmen' },
  { id: 'decoFlag1', area: 'camp', model: 'signpost', x: -1.8, z: 10.8, unlockedBy: 'deco_bunting' },
  { id: 'decoFlag2', area: 'camp', model: 'signpost', x: 1.8, z: 10.8, unlockedBy: 'deco_bunting' },
  { id: 'decoFlag3', area: 'camp', model: 'signpost', x: -14.2, z: 1.6, unlockedBy: 'deco_bunting' },
  { id: 'decoFlag4', area: 'camp', model: 'signpost', x: 14.2, z: -1.6, unlockedBy: 'deco_bunting' },
  { id: 'decoBrazier1', area: 'camp', model: 'brazier', x: -13.0, z: 1.8, unlockedBy: 'deco_braziers' },
  { id: 'decoBrazier2', area: 'camp', model: 'brazier', x: 13.0, z: 1.8, unlockedBy: 'deco_braziers' },
  { id: 'decoSled1', area: 'camp', model: 'sled', x: -12.4, z: -5.0, rot: 0.8, unlockedBy: 'deco_sleds' },
  { id: 'decoBarrel1', area: 'camp', model: 'barrel', x: -13.0, z: -3.0, unlockedBy: 'deco_sleds' },
  { id: 'decoBarrel2', area: 'camp', model: 'barrel', x: -12.0, z: -2.2, unlockedBy: 'deco_sleds' },
  { id: 'decoCrate1', area: 'camp', model: 'crate', x: -12.9, z: -6.8, unlockedBy: 'deco_sleds' },
];

/** Ground kept clear of forest for the Icebound queues and walk-in lanes of the late counters. */
export const LATE_LANES: Rect[] = [
  { x0: 8.0, x1: 23.5, z0: 7.8, z1: 32.0 },
  { x0: 8.8, x1: 36.0, z0: -28.0, z1: -12.0 },
];

// ------------------------------------------------------------------ Open Season + finale tuning

export const ENDLESS: EndlessDef = {
  board: ORDER_BOARD,
  slots: 3,
  orders: [
    { item: 'fish', n: 24, value: 3, weight: 1 },
    { item: 'log', n: 24, value: 3, weight: 1 },
    { item: 'stew', n: 18, value: 6, weight: 1.2 },
    { item: 'plank', n: 24, value: 5, weight: 1 },
    { item: 'smokedFish', n: 16, value: 10, weight: 1.2 },
    { item: 'ore', n: 18, value: 6, weight: 1 },
    { item: 'ingot', n: 10, value: 18, weight: 1 },
    { item: 'feast', n: 10, value: 28, weight: 1.2 },
  ],
  ordersPerSeason: 4,
  seasonQty: 0.12,
  seasonValue: 0.08,
  qtyCapMul: 3,
};

export const FINALE: FinaleDef = {
  lightingTime: 5,
  dawnTime: 9,
  reward: 5000,
  rewardSpot: { x: 2.6, z: -53.6 },
  warmRadius: 120,
};
