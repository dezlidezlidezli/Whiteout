import type { AreaId, ItemKind, ToolKind } from '../data/types';
import type { FinalePhase } from './state';

/** Who moved an item: the player, a helper id, or a link id. */
export type Actor = { kind: 'player' } | { kind: 'helper'; id: string } | { kind: 'link'; id: string };

/** Where an item came from / went to. */
export type Place =
  | { kind: 'station'; id: string }
  | { kind: 'pad'; id: string }
  | { kind: 'ground'; id: string };

export type SimEvent =
  | { type: 'pickup'; item: ItemKind; from: Place; by: Actor; height: number }
  | { type: 'drop'; item: ItemKind; to: Place; by: Actor; height: number }
  | { type: 'craft'; station: string; item: ItemKind; count: number }
  | { type: 'serve'; station: string; customer: number; item: ItemKind }
  | { type: 'thaw'; customer: number; x: number; z: number }
  | { type: 'emberSpawn'; x: number; z: number; n: number; pile: string | null }
  | { type: 'emberCollect'; x: number; z: number; n: number }
  | { type: 'padTick'; pad: string; frac: number }
  | { type: 'padAppear'; pad: string }
  | { type: 'padComplete'; pad: string }
  | { type: 'unlock'; id: string }
  | { type: 'hire'; helper: string }
  | { type: 'capacity'; capacity: number }
  | { type: 'hearthUp'; level: number }
  | { type: 'areaOpen'; area: AreaId }
  | { type: 'questStart'; quest: string; index: number }
  | { type: 'questComplete'; quest: string; reward: number }
  | { type: 'nodeHit'; node: string; by: Actor }
  | { type: 'nodeDeplete'; node: string }
  | { type: 'nodeRegrow'; node: string }
  | { type: 'arrive'; customer: number; x: number; z: number; population: number }
  | { type: 'tent'; index: number }
  | { type: 'cosy'; on: boolean }
  | { type: 'spawn'; customer: number }
  // ---- late campaign + Open Season ----
  /** A sled-dog courier set off along its trail (item null = running back empty). */
  | { type: 'courierDepart'; helper: string; item: ItemKind | null; n: number }
  /** item: what the sled carries (the first of its load, or the courier's item kind when empty); count = items. */
  | { type: 'courierArrive'; helper: string; at: 'source' | 'dest'; items: number; item: ItemKind | null; count: number }
  | { type: 'toolUpgrade'; tool: ToolKind; level: number }
  /** A repeatable (Open Season) upgrade pad was bought; `cost` is the next level's price. */
  | { type: 'upgrade'; pad: string; level: number; cost: number; maxed: boolean }
  | { type: 'decorate'; ids: string[] }
  | { type: 'beaconStage'; stage: number }
  | { type: 'finale'; phase: FinalePhase }
  /** At dawn: the storm breaks for good. */
  | { type: 'longNightEnds'; thawed: number; reward: number }
  | { type: 'orderPosted'; order: number; item: ItemKind; n: number; reward: number; slot: number }
  | { type: 'orderProgress'; order: number; got: number; n: number }
  | { type: 'orderComplete'; order: number; item: ItemKind; reward: number }
  | { type: 'seasonUp'; level: number }
  /** An item thrown away at a bin (after a 'drop' event to the bin station). */
  | { type: 'binned'; bin: string; item: ItemKind }
  // ---- signature mechanics ----
  | { type: 'ploughStart' }
  | { type: 'ploughStop' }
  | { type: 'snowCleared'; zone: string; cells: number }
  | { type: 'findRevealed'; find: string; kind: 'embers' | 'crate' | 'villager' | 'landmark'; x: number; z: number }
  | { type: 'zoneCleared'; zone: string }
  | { type: 'lanternOn' }
  | { type: 'lanternOff' }
  | { type: 'digStart'; id: string }
  | { type: 'rescued'; id: string }
  | { type: 'followerWait'; id: string }
  | { type: 'followerHome'; id: string }
  | { type: 'areaAllFound'; area: AreaId }
  | { type: 'allFound' }
  | { type: 'skateStart' }
  | { type: 'skateStop' }
  | { type: 'fishLeapSpawn'; id: number; x: number; z: number }
  /** kept: the fish landed on the stack (false: caught and let go, the pack was full or the flame in hand). */
  | { type: 'fishLeapCatch'; combo: number; x: number; z: number; kept: boolean }
  | { type: 'skateBounce' }
  | { type: 'crankNotch'; id: string }
  | { type: 'crankTurn'; id: string }
  | { type: 'blast'; id: string; level: number }
  | { type: 'liftArrive'; id: string; n: number }
  | { type: 'flameTaken' }
  | { type: 'flameDown' }
  | { type: 'flameLevel'; v: number }
  | { type: 'flameOut' }
  | { type: 'brazierLit'; id: string }
  | { type: 'trailComplete' }
  | { type: 'beaconLit' }
  /** A thawed villager found no free home and walked on to the valley. */
  | { type: 'passThrough'; customer: number }
  /** Throttled (every 30 s at most): villagers are being turned away for lack of homes. `next`: what raises
   * capacity next ('tent' rises by itself; 'cabin'/'hearth' name the pad to build). */
  | { type: 'homesFull'; turnedAway: number; capacity: number; next: 'tent' | 'cabin' | 'hearth' | null; pad: string | null };

export type SimEventType = SimEvent['type'];
