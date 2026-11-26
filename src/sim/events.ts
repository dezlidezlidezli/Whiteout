import type { AreaId, ItemKind } from '../data/types';

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
  | { type: 'spawn'; customer: number };

export type SimEventType = SimEvent['type'];
