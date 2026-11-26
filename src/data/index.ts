import { BALANCE } from './balance';
import { ITEMS, RECIPES } from './items';
import { QUESTS } from './quests';
import { ENDLESS, FINALE, LATE_DECOR, LATE_HELPERS, LATE_LINKS, LATE_PADS, LATE_STATIONS } from './late';
import type { GameData } from './types';
import { AREAS, CAMP, DECOR, HELPERS, LINKS, PADS, PLAYER_START, STATIONS, WALLS } from './world';

export * from './types';
export { ITEM_KINDS, ITEMS, RECIPES } from './items';
export { ORDER_BOARD } from './late';

/** The full campaign content bundle. Areas 3–5 and Open Season (./late.ts) are appended to the base arrays. */
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
};
