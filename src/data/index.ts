import { BALANCE } from './balance';
import { ITEMS, RECIPES } from './items';
import { QUESTS } from './quests';
import { DRESSING } from './dressing';
import { MECH, mechDecor, mechStations } from './mechanics';
import { ENDLESS, FINALE, LATE_DECOR, LATE_HELPERS, LATE_LANES, LATE_LINKS, LATE_PADS, LATE_STATIONS } from './late';
import { applyPropSolids } from './declutter';
import { growForest, LAYOUT_REV, packTents, placeAreas } from './layout';
export { tentLevel, wallGoneBy } from './layout';
import { ALL_MECHANICS, NO_MECHANICS, SHIPPED_MECHANICS, withMechanics } from './mechflags';
import type { GameData } from './types';
import { AREAS, CAMP, DECOR, HELPERS, LINKS, PADS, PLAYER_START, STATIONS, WALLS } from './world';

export * from './types';
export { applyPropSolids, declutter, FLAT_DECOR, PROP_SOLID, FOOTPRINT, FROST_WALL_HALF, NATURAL_DECOR, TOLERANCE, segDist } from './declutter';
export { ITEM_KINDS, ITEMS, RECIPES } from './items';
export { ORDER_BOARD } from './late';
export { MECH } from './mechanics';
export type { MechDef } from './mechanics';
export { DRESSING, wallSolids } from './dressing';
export { ALL_MECHANICS, anchorQuest, fullDataOf, MECHANIC_IDS, NO_MECHANICS, SHIPPED_MECHANICS, withMechanics } from './mechflags';
export type { MechanicId } from './mechflags';
export type { AreaDressing, FloorType, XZ } from './dressing';

/** The full campaign content bundle. Areas 3–5 and Open Season (./late.ts) are appended to the base arrays. */
// NOTE: `declutter` (./declutter.ts) is not applied yet: any change to tent/decor solids currently
// tips the campaign bot into a stall in Ironridge, which must be fixed first (see tests/layout.test.ts).
const AUTHORED: GameData = {
  items: ITEMS,
  recipes: RECIPES,
  balance: BALANCE,
  areas: AREAS,
  walls: WALLS,
  stations: [...STATIONS, ...LATE_STATIONS, ...mechStations()],
  decor: [...DECOR, ...LATE_DECOR, ...mechDecor()],
  pads: [...PADS, ...LATE_PADS],
  helpers: [...HELPERS, ...LATE_HELPERS],
  links: [...LINKS, ...LATE_LINKS],
  quests: QUESTS,
  camp: CAMP,
  playerStart: PLAYER_START,
  endless: ENDLESS,
  finale: FINALE,
  dressing: DRESSING,
  layoutRev: LAYOUT_REV,
  mech: MECH,
  mechanics: { ...ALL_MECHANICS },
};

/** Every area placed at its world offset, tent plots packed into the camp, the forest grown around it all
 * (with every mechanic switched on; placement is shared by all configurations). */
const FULL_DATA: GameData = (() => {
  const { data, lanes } = placeAreas(AUTHORED, LATE_LANES);
  const tentSpots = packTents(data, data.camp.tentAt.length);
  const camp = { ...data.camp, tentSpots, tentAt: data.camp.tentAt.slice(0, tentSpots.length) };
  const placed = { ...data, camp };
  // Small props: one collision rule per model (solid with a small radius, or clearly walk-through).
  return { ...placed, decor: applyPropSolids([...placed.decor, ...growForest(placed, lanes)]) };
})();

/**
 * The shipped game data. Each signature mechanic (plough, rescue, skate, crank, flame) is switched on
 * in SHIPPED_MECHANICS once the view draws it; turn any of them on or off with
 * `withMechanics(GAME_DATA, { plough: true, ... })` (works from any configuration).
 */
export const GAME_DATA: GameData = withMechanics(FULL_DATA, SHIPPED_MECHANICS);
