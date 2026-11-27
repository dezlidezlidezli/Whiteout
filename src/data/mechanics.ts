// Data for the five signature mechanics (docs/MECHANICS.md): snow plough, rescue walks, ice skating,
// crank by circling, carry the flame. Pure data; the sim modules live in src/sim/{plough,rescue,skate,crank,flame}.ts.

import type { AreaId, DecorDef, ItemKind, Rect, StationDef, Vec2 } from './types';

// ------------------------------------------------------------------ types

export interface DeepSnowZoneDef extends Rect {
  id: string;
  area: AreaId;
  /** Embers paid when the zone is 100 % clear. */
  reward: number;
}

export type FindDef =
  | { id: string; zone: string; x: number; z: number; kind: 'embers'; amount: number }
  /** Reveals (unlocks) a buried-crate Pile station holding items. */
  | { id: string; zone: string; x: number; z: number; kind: 'crate'; station: string }
  /** Reveals a lost villager (see villagers) buried under the snow. */
  | { id: string; zone: string; x: number; z: number; kind: 'villager'; villager: string }
  /** Reveals (unlocks) a landmark decor id. */
  | { id: string; zone: string; x: number; z: number; kind: 'landmark'; decor: string };

export interface LostVillagerDef {
  id: string;
  name: string;
  /** One line of flavour for the Found page. */
  line: string;
  area: AreaId;
  x: number;
  z: number;
  /** Buried under deep snow: only diggable once a plough find reveals it. */
  underSnow?: boolean;
}

export interface CrankDef {
  id: string;
  area: AreaId;
  x: number;
  z: number;
  inner: number;
  outer: number;
  use: 'bellows' | 'lift';
  /** bellows: processor it boosts; lift: pile the cages unload into. */
  target: string;
  /** The capstan works once this id is unlocked (decor id of the capstan). */
  unlockedBy: string;
}

export interface FlameBrazierDef {
  id: string;
  area: AreaId;
  x: number;
  z: number;
  kind: 'trail' | 'yard';
  /** Trail order (1..7); lighting needs the previous one lit. */
  order?: number;
}

export interface MechDef {
  cell: number;
  deepSnow: DeepSnowZoneDef[];
  finds: FindDef[];
  /** Wading speed without / with the plough (×), plough blade half-width per tier (m). */
  wade: number;
  ploughSpeed: number[];
  bladeRadius: number[];
  villagers: LostVillagerDef[];
  /** Lantern glow radius and max followers per lantern tier (index 1, 2). */
  glow: number[];
  maxFollowers: number[];
  digTime: number;
  rescueBonus: number;
  areaFoundBonus: number;
  ice: Rect[];
  gripMats: { x: number; z: number; r: number }[];
  /** Top speed multiplier on ice per skates tier (0 = none, 1 = sharpened). */
  iceTop: number[];
  /** Two points along open ice the guide skates between to build speed. */
  skateLane: Vec2[];
  cranks: CrankDef[];
  braziers: FlameBrazierDef[];
  /** Seconds a full flame lasts walking outside warmth; wind gaps burn it windFactor× faster. */
  flameLife: number;
  windFactor: number;
  windGaps: Rect[];
  brazierWarm: number;
  beacon: { x: number; z: number; reach: number };
  festivalLamps: { id: string; x: number; z: number }[];
  festivalReward: number;
}

// ------------------------------------------------------------------ data

const v = (id: string, name: string, area: AreaId, x: number, z: number, line: string, underSnow?: boolean): LostVillagerDef =>
  ({ id, name, line, area, x, z, underSnow });

export const MECH: MechDef = {
  cell: 0.5,
  // Side lots off each yard (never on a helper route or a station's access).
  deepSnow: [
    { id: 'dsPine', area: 'pinewood', x0: -27.4, x1: -21.6, z0: -9.8, z1: 10.2, reward: 250 },
    { id: 'dsLake', area: 'frozenLake', x0: 29.4, x1: 34.8, z0: -9.8, z1: 7.4, reward: 600 },
  ],
  finds: [
    { id: 'fPineCache', zone: 'dsPine', x: -25.6, z: -5.8, kind: 'embers', amount: 150 },
    { id: 'fPineCrate', zone: 'dsPine', x: -23.8, z: 4.2, kind: 'crate', station: 'crateFindPine' },
    { id: 'fPineV1', zone: 'dsPine', x: -26.4, z: 8.6, kind: 'villager', villager: 'lv_pine5' },
    { id: 'fPineV2', zone: 'dsPine', x: -22.6, z: -8.8, kind: 'villager', villager: 'lv_pine6' },
    { id: 'fPineMark', zone: 'dsPine', x: -24.6, z: 0.2, kind: 'landmark', decor: 'lm_pineStatue' },
    { id: 'fLakeCache', zone: 'dsLake', x: 33.0, z: -8.0, kind: 'embers', amount: 300 },
    { id: 'fLakeCrate', zone: 'dsLake', x: 31.6, z: 5.0, kind: 'crate', station: 'crateFindLake' },
    { id: 'fLakeV1', zone: 'dsLake', x: 33.8, z: 2.0, kind: 'villager', villager: 'lv_lake5' },
    { id: 'fLakeV2', zone: 'dsLake', x: 30.4, z: -4.4, kind: 'villager', villager: 'lv_lake6' },
    { id: 'fLakeMark', zone: 'dsLake', x: 32.2, z: -1.2, kind: 'landmark', decor: 'lm_lakeSculpture' },
  ],
  wade: 0.45,
  ploughSpeed: [0.8, 1.0],
  bladeRadius: [0.8, 1.2],
  villagers: [
    v('lv_pine1', 'Old Brannoc', 'pinewood', -8.6, -9.4, 'Swears the storm stole his left mitten on purpose.'),
    v('lv_pine2', 'Wren Tallow', 'pinewood', -21.0, -9.4, 'Counted pine cones to stay awake. Lost count at 4,112.'),
    v('lv_pine3', 'Pip Ashcombe', 'pinewood', -12.8, 9.9, 'Was looking for the perfect sledging hill. Found a drift.'),
    v('lv_pine4', 'Marta Fennick', 'pinewood', -16.2, -9.6, 'Knits faster when frightened. Has eleven scarves.'),
    v('lv_pine5', 'Hollis Reed', 'pinewood', -26.4, 8.6, 'Dreamt of stew the whole time. Would like some now.', true),
    v('lv_pine6', 'Juniper Vale', 'pinewood', -22.6, -8.8, 'Talked to a fox for three days. The fox was polite.', true),
    v('lv_lake1', 'Captain Odo', 'frozenLake', 8.2, -9.4, 'Ice-fished through the night. Caught one boot.'),
    v('lv_lake2', 'Sable Wick', 'frozenLake', 25.0, 7.2, 'Followed a lantern that turned out to be the moon.'),
    v('lv_lake3', 'Tamsin Brook', 'frozenLake', 16.6, -9.4, 'Skated in circles until the circles froze too.'),
    v('lv_lake4', 'Ferris Lowe', 'frozenLake', 26.6, -9.6, 'Insists the lake hummed a tune. Still humming it.'),
    v('lv_lake5', 'Nell Harrow', 'frozenLake', 33.8, 2.0, 'Built a snow fort. It was very good. Too good.', true),
    v('lv_lake6', 'Bartley Frost', 'frozenLake', 30.4, -4.4, 'No relation to the weather, he would like you to know.', true),
    v('lv_ridge1', 'Gretta Ironsong', 'ironridge', -15.4, -25.4, 'Mined a seam of pure silence. Not valuable, sadly.'),
    v('lv_ridge2', 'Dunstan Moss', 'ironridge', -15.4, -17.0, 'Hid in a crate. The crate was also cold.'),
    v('lv_ridge3', 'Ivy Kettering', 'ironridge', 7.8, -25.4, 'Kept a candle alive for a week. Then it was her turn.'),
    v('lv_ridge4', 'Rook Pellam', 'ironridge', -15.6, -10.6, 'Wrote a song called "Still Cold". Eight verses.'),
    v('lv_ridge5', 'Agnes Coldbrook', 'ironridge', 2.6, -25.4, 'Bakes. Has not baked in a while. Will bake.'),
    v('lv_ridge6', 'Thimble', 'ironridge', -4.2, -25.6, 'A very small person with a very large hat.'),
    v('lv_peak1', 'Sister Aurel', 'beaconPeak', -7.4, -30.0, 'Climbed up to pray for dawn. Got the order wrong.'),
    v('lv_peak2', 'Merrow Finch', 'beaconPeak', 7.4, -40.4, 'Mapped every rock on the peak. Some twice.'),
    v('lv_peak3', 'Old Lamplighter Joss', 'beaconPeak', -7.4, -49.0, 'Lit the beacon once, sixty winters ago. Remembers how.'),
    v('lv_peak4', 'Clem & Clover', 'beaconPeak', 7.4, -58.8, 'Twins. Disagree about everything except soup.'),
    v('lv_peak5', 'Yarrow Dane', 'beaconPeak', -7.4, -58.8, 'Followed the wind to see where it went. It went here.'),
    v('lv_peak6', 'Little Ember', 'beaconPeak', 0.0, -39.6, 'Nobody knows her real name. Everybody knows her laugh.'),
  ],
  glow: [0, 6, 9],
  maxFollowers: [0, 3, 6],
  digTime: 1.5,
  rescueBonus: 60,
  areaFoundBonus: 400,
  // The lake ice (incl. the snowed-over east lot once ploughed); stations on it stand on grip mats.
  ice: [{ x0: 17.4, x1: 34.8, z0: -9.8, z1: -2.0 }],
  // Grip mats under the ice holes (matching late.ts ICE_HOLES) and the skates pad.
  gripMats: [...[-8.8, -6.2, -3.6].flatMap((z, j) => [19.0, 22.0, 25.0].map((x, i) => ({ x: x + ((j * 3 + i) % 2 ? 0.2 : 0), z, r: 1.6 }))),
  ],
  iceTop: [1.5, 1.75],
  skateLane: [{ x: 27.4, z: -9.0 }, { x: 27.4, z: -2.8 }],
  cranks: [
    { id: 'capBellows', area: 'ironridge', x: -13.0, z: -13.0, inner: 1.2, outer: 2.8, use: 'bellows', target: 'forge', unlockedBy: 'capBellows' },
    { id: 'capLift', area: 'ironridge', x: -13.0, z: -21.0, inner: 1.2, outer: 2.8, use: 'lift', target: 'shaftPile', unlockedBy: 'capLift' },
  ],
  braziers: [
    // One optional brazier per earlier yard: lighting it makes that yard a little Cosier for good.
    { id: 'brazierYard', area: 'kettleYard', x: 2.8, z: 6.0, kind: 'yard' },
    { id: 'brazierPine', area: 'pinewood', x: -9.4, z: 9.6, kind: 'yard' },
    { id: 'brazierLake', area: 'frozenLake', x: 28.6, z: -9.2, kind: 'yard' },
    { id: 'brazierRidge', area: 'ironridge', x: -0.4, z: -22.2, kind: 'yard' },
    // The Trail of Light up Beacon Peak (lit in order; legs of ~6–9 m around the rock barriers).
    { id: 'trail1', area: 'beaconPeak', x: 0.0, z: -30.4, kind: 'trail', order: 1 },
    { id: 'trail2', area: 'beaconPeak', x: 5.8, z: -32.8, kind: 'trail', order: 2 },
    { id: 'trail3', area: 'beaconPeak', x: 5.8, z: -38.6, kind: 'trail', order: 3 },
    { id: 'trail4', area: 'beaconPeak', x: -5.8, z: -41.4, kind: 'trail', order: 4 },
    { id: 'trail5', area: 'beaconPeak', x: -5.8, z: -48.6, kind: 'trail', order: 5 },
    { id: 'trail6', area: 'beaconPeak', x: 5.0, z: -50.6, kind: 'trail', order: 6 },
    { id: 'trail7', area: 'beaconPeak', x: -3.6, z: -53.4, kind: 'trail', order: 7 },
  ],
  flameLife: 20,
  windFactor: 3,
  // Two risky short-cuts: the narrow gaps through the middle of the rock barriers.
  windGaps: [
    { x0: -1.6, x1: 1.6, z0: -36.4, z1: -33.6 },
    { x0: -1.6, x1: 1.6, z0: -46.4, z1: -43.6 },
  ],
  brazierWarm: 3.0,
  beacon: { x: 0, z: -57.0, reach: 3.4 },
  // Beside the camp paths (never on tent ground).
  festivalLamps: [[5.5, 1.6], [-5.5, -1.6], [9.0, -1.6], [-9.0, 1.6], [1.6, -8.0], [-1.6, 6.2]].map(([x, z], i) => ({ id: `festLamp${i}`, x, z })),
  festivalReward: 900,
};

/** Rock barriers on the Beacon Peak trail (solid), leaving a side passage each and the windy middle gaps. */
export function peakBarrierRocks(): Vec2[] {
  const out: Vec2[] = [];
  // Barrier A (z -35): open on the east (x > 3.6) and through the windy middle gap.
  for (const x of [-7.6, -6.4, -5.2, -4.0, -2.8, 2.6]) out.push({ x, z: -35.0 });
  // Barrier B (z -45): open on the west (x < -3.6) and through the windy middle gap.
  for (const x of [7.6, 6.4, 5.2, 4.0, 2.8, -2.6]) out.push({ x, z: -45.0 });
  return out;
}

/** Decor and stations the mechanics need (area-local; placed with everything else). */
export function mechDecor(): DecorDef[] {
  const out: DecorDef[] = [];
  for (const b of MECH.braziers) {
    out.push({ id: b.id, area: b.area, model: b.kind === 'trail' ? 'trailBrazier' : 'brazier', x: b.x, z: b.z, solid: { r: 0.4 } });
  }
  peakBarrierRocks().forEach((p, i) => out.push({ id: `peakRockA${i}`, area: 'beaconPeak', model: 'rock', x: p.x, z: p.z, scale: 1.1, seed: i, solid: { r: 0.75 } }));
  for (const w of MECH.windGaps) out.push({ id: `windGap${out.length}`, area: 'beaconPeak', model: 'windGap', x: (w.x0 + w.x1) / 2, z: (w.z0 + w.z1) / 2 });
  for (const c of MECH.cranks) out.push({ id: c.unlockedBy, area: c.area, model: 'capstan', x: c.x, z: c.z, unlockedBy: c.use === 'bellows' ? 'pad_bellows' : 'pad_mineLift', solid: { r: 0.45 } });
  out.push({ id: 'mineLiftFrame', area: 'ironridge', model: 'mineLift', x: -13.0, z: -24.6, unlockedBy: 'pad_mineLift', solid: { r: 0.5 } });
  for (const g of MECH.gripMats) out.push({ id: `gripMat${out.length}`, area: 'frozenLake', model: 'gripMat', x: g.x, z: g.z });
  for (const l of MECH.festivalLamps) out.push({ id: l.id, area: 'camp', model: 'festivalLamp', x: l.x, z: l.z });
  out.push({ id: 'lm_pineStatue', area: 'pinewood', model: 'statue', x: -24.6, z: 0.2, unlockedBy: 'fPineMark' });
  out.push({ id: 'lm_lakeSculpture', area: 'frozenLake', model: 'iceSculpture', x: 32.2, z: -1.2, unlockedBy: 'fLakeMark' });
  out.push({ id: 'foundBoard', area: 'camp', model: 'foundBoard', x: -5.0, z: 9.6, unlockedBy: 'pad_lantern' });
  out.push({ id: 'monument', area: 'camp', model: 'monument', x: 6.2, z: 8.6, unlockedBy: 'allFound' });
  return out;
}

export function mechStations(): StationDef[] {
  return [
    { id: 'crateFindPine', type: 'pile', area: 'pinewood', name: 'Buried crate', model: 'buriedCrate', x: -23.8, z: 4.2,
      solid: { r: 0.5 }, reach: 1.6, item: 'plank', cap: 12, start: 12, refill: 0, unlockedBy: 'fPineCrate' },
    { id: 'crateFindLake', type: 'pile', area: 'frozenLake', name: 'Buried crate', model: 'buriedCrate', x: 31.6, z: 5.0,
      solid: { r: 0.5 }, reach: 1.6, item: 'smokedFish', cap: 12, start: 12, refill: 0, unlockedBy: 'fLakeCrate' },
    // Pit-head pile the mine lift hauls ore up into.
    { id: 'shaftPile', type: 'pile', area: 'ironridge', name: 'Pit-head pile', model: 'shaftPile', x: -9.6, z: -20.6,
      solid: { r: 0.6 }, reach: 1.7, item: 'ore', cap: 60, start: 0, refill: 0, unlockedBy: 'pad_mineLift' },
  ];
}

export type { ItemKind };
