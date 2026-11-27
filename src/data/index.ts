import { BALANCE } from './balance';
import { ITEMS, RECIPES } from './items';
import { QUESTS } from './quests';
import { DRESSING } from './dressing';
import { ENDLESS, FINALE, LATE_DECOR, LATE_HELPERS, LATE_LINKS, LATE_PADS, LATE_STATIONS } from './late';
import type { GameData } from './types';
import { AREAS, CAMP, DECOR, HELPERS, LINKS, PADS, PLAYER_START, STATIONS, WALLS } from './world';

export * from './types';
export { declutter, FLAT_DECOR, FOOTPRINT, FROST_WALL_HALF, NATURAL_DECOR, TOLERANCE, segDist } from './declutter';
export { ITEM_KINDS, ITEMS, RECIPES } from './items';
export { ORDER_BOARD } from './late';
export { DRESSING, wallSolids } from './dressing';
export type { AreaDressing, FloorType, XZ } from './dressing';

/** The full campaign content bundle. Areas 3–5 and Open Season (./late.ts) are appended to the base arrays. */
// NOTE: `declutter` (./declutter.ts) is not applied yet: any change to tent/decor solids currently
// tips the campaign bot into a stall in Ironridge, which must be fixed first (see tests/layout.test.ts).
export const GAME_DATA: GameData = {
  items: ITEMS,
  recipes: RECIPES,
  balance: BALANCE,
  areas: AREAS,
  walls: WALLS,
  stations: [...STATIONS, ...LATE_STATIONS],
  decor: [...DECOR, ...LATE_DECOR],
  pads: [...PADS, ...LATE_PADS],
  helpers: [...HELPERS, ...LATE_HELPERS],
  links: [...LINKS, ...LATE_LINKS],
  quests: QUESTS,
  camp: CAMP,
  playerStart: PLAYER_START,
  endless: ENDLESS,
  finale: FINALE,
  dressing: DRESSING,
};
