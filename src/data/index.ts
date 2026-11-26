import { BALANCE } from './balance';
import { ITEMS, RECIPES } from './items';
import { QUESTS } from './quests';
import type { GameData } from './types';
import { AREAS, CAMP, DECOR, HELPERS, LINKS, PADS, PLAYER_START, STATIONS, WALLS } from './world';

export * from './types';
export { ITEM_KINDS, ITEMS, RECIPES } from './items';

/** The full campaign content bundle. Later areas add entries to these arrays. */
export const GAME_DATA: GameData = {
  items: ITEMS,
  recipes: RECIPES,
  balance: BALANCE,
  areas: AREAS,
  walls: WALLS,
  stations: STATIONS,
  decor: DECOR,
  pads: PADS,
  helpers: HELPERS,
  links: LINKS,
  quests: QUESTS,
  camp: CAMP,
  playerStart: PLAYER_START,
};
