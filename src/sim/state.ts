import type { AreaId, GameData, ItemCounts, ItemKind, ModKey } from '../data/types';

export const SAVE_VERSION = 2;

export interface PlayerState {
  x: number;
  z: number;
  px: number;
  pz: number;
  vx: number;
  vz: number;
  facing: number;
  stack: ItemKind[];
  capacity: number;
  transferCd: number;
  /** Node currently being worked (for animation). */
  working: string | null;
  onPad: string | null;
  padTime: number;
  /** Pile the player is handing items back to (no re-picking from it until they leave). */
  returning: string | null;
  /** Pile the player has taken from during the current visit (never hand back to it then). */
  pickedFrom: string | null;
  /** Spare shelf zone the player is in, and what entering decided: set everything down, or pick it back up. */
  shelf?: { id: string; mode: 'drop' | 'pick' } | null;
}

export interface PileState { kind: 'pile'; count: number; acc: number }
export interface NodeState { kind: 'node'; alive: boolean; hits: number; work: number; regrow: number; ground: number }
export interface ProcState { kind: 'processor'; inputs: ItemCounts; output: number; progress: number; operated: boolean; active: boolean }
export interface CounterState { kind: 'counter'; stock: number; serveT: number; queue: number[] }
export interface DepositState { kind: 'deposit'; count: number }
/** Spare shelf: any mix of kinds, unlimited; last element = most recently shelved. */
export interface ShelfState { kind: 'shelf'; items: ItemKind[] }
export type StationState = PileState | NodeState | ProcState | CounterState | DepositState | ShelfState;

export interface PadState {
  paid: number;
  mats: ItemCounts;
  done: boolean;
  visible: boolean;
  acc: number;
  /** Repeatable pads: times completed (cost grows with it). */
  level?: number;
  /** Repeatable pads: just completed a level; no payment until the player steps off. */
  hold?: boolean;
}

export type CustomerPhase = 'queue' | 'thaw' | 'leave';
export interface CustomerState {
  id: number;
  counter: string;
  x: number;
  z: number;
  px: number;
  pz: number;
  phase: CustomerPhase;
  want: number;
  got: number;
  t: number;
  path: number;
  settleX: number;
  settleZ: number;
  /** 0..1 deterministic variation (coat colour etc.). */
  look: number;
}

export type HelperPhase = 'idle' | 'toSource' | 'load' | 'toDest' | 'unload' | 'work';
export interface HelperState {
  id: string;
  x: number;
  z: number;
  px: number;
  pz: number;
  facing: number;
  stack: ItemKind[];
  phase: HelperPhase;
  target: string | null;
  t: number;
  action: 'none' | 'chop' | 'cook';
  moving: boolean;
  stuckT: number;
  lastX: number;
  lastZ: number;
  sideT: number;
  /** Courier: index of the next route waypoint. */
  wp?: number;
}

export interface BeltItem { item: ItemKind; p: number }
export interface LinkState { t: number; belt: BeltItem[] }

export interface EmberPile { id: string; x: number; z: number; count: number }

/** Finale state machine: 'lighting' (beacon flares) → 'dawn' (storm breaks, valley thaws) → 'done' (forever). */
export type FinalePhase = 'none' | 'lighting' | 'dawn' | 'done';
export interface FinaleState {
  phase: FinalePhase;
  /** Seconds into the current phase. */
  t: number;
  /** 0..1 through the current phase (1 once done). */
  progress: number;
}

/** An open caravan order on the Open Season notice board. */
export interface OrderState {
  id: number;
  item: ItemKind;
  n: number;
  got: number;
  reward: number;
}

/** Lifetime stats for the stats page. */
export interface Totals {
  served: number;
  thawed: number;
  embersEarned: number;
  carried: number;
  /** Metres walked by the player. */
  distance: number;
  /** Seconds of play (sim time). */
  playTime: number;
  ordersDone: number;
  upgrades: number;
  decorations: number;
}

export function createTotals(): Totals {
  return { served: 0, thawed: 0, embersEarned: 0, carried: 0, distance: 0, playTime: 0, ordersDone: 0, upgrades: 0, decorations: 0 };
}

export interface SimState {
  version: number;
  seed: number;
  rng: number;
  time: number;
  tick: number;
  player: PlayerState;
  embers: number;
  emberPiles: EmberPile[];
  stations: Record<string, StationState>;
  pads: Record<string, PadState>;
  unlocked: Record<string, boolean>;
  helpers: Record<string, HelperState>;
  links: Record<string, LinkState>;
  customers: CustomerState[];
  nextCustomerId: number;
  spawnT: number;
  hearth: { level: number; fuel: number; cosy: boolean };
  areasOpen: Record<string, boolean>;
  population: number;
  tents: number;
  /** `id` (v2) re-anchors the index if quests are inserted by later content. */
  quest: { index: number; base: number; id?: string };
  stats: Record<string, number>;
  mods: Record<ModKey, number>;
  guideMemo: ItemKind | null;
  /** Guidance is mid-way through handing in items the goal can't use. */
  guideUnload: boolean;
  // ---- v2: late campaign + Open Season ----
  /** Great Beacon stages completed (0..4). */
  beacon: number;
  finale: FinaleState;
  /** Tool tiers (axe, pick, kettle, auger), for the view's tool models. */
  tools: Record<string, number>;
  /** Open Season caravan orders (empty until the finale is done). */
  orders: OrderState[];
  nextOrderId: number;
  /** Open Season level: grows as orders are filled; gently scales order size and reward. */
  season: number;
  totals: Totals;
  /** World layout revision this state was laid out for (GameData.layoutRev). */
  layoutRev?: number;
}

export const DEFAULT_MODS: Record<ModKey, number> = {
  moveSpeed: 1,
  transferRate: 1,
  spawnRate: 1,
  pricePlus: 0,
  cookSpeed: 1,
  chopSpeed: 1,
  helperSpeed: 1,
  helperCapacity: 0,
  fishSpeed: 1,
  mineSpeed: 1,
  priceMul: 1,
};

/**
 * The world layout changed under this save: put the player at the start, send helpers home (they keep what
 * they carry), let villagers already walking home arrive at once, and move counter ember piles to their
 * counters. Queued Icebound snap back into their crowds on the next step. Nothing is lost.
 */
function reseat(s: SimState, data: GameData): void {
  s.player.x = s.player.px = data.playerStart.x;
  s.player.z = s.player.pz = data.playerStart.z;
  s.player.vx = s.player.vz = 0;
  s.player.onPad = null;
  s.player.returning = null;
  s.player.pickedFrom = null;
  s.player.shelf = null;
  for (const id in s.helpers) {
    const def = data.helpers.find((h) => h.id === id);
    const h = s.helpers[id];
    if (!def) continue;
    h.x = h.px = h.lastX = def.home.x;
    h.z = h.pz = h.lastZ = def.home.z;
    h.phase = 'idle';
    h.target = null;
    h.t = 0;
    h.wp = 0;
  }
  const counters = new Map(data.stations.filter((d) => d.type === 'counter').map((d) => [d.id, d] as const));
  const keep: SimState['customers'] = [];
  for (const c of s.customers) {
    if (c.phase !== 'queue') {
      s.population += 1;
      s.stats.thawed = (s.stats.thawed ?? 0) + 1;
      continue;
    }
    const def = counters.get(c.counter);
    if (def && def.type === 'counter') {
      c.x = c.px = def.spawn.x;
      c.z = c.pz = def.spawn.z;
    }
    keep.push(c);
  }
  s.customers = keep;
  for (const e of s.emberPiles) {
    const def = counters.get(e.id.replace(/^embers_/, ''));
    if (def && def.type === 'counter') {
      e.x = def.emberSpot.x;
      e.z = def.emberSpot.z;
    } else {
      e.x = data.playerStart.x;
      e.z = data.playerStart.z;
    }
  }
  s.layoutRev = data.layoutRev;
}

export function createStationState(def: GameData['stations'][number]): StationState {
  switch (def.type) {
    case 'pile':
      return { kind: 'pile', count: def.start, acc: 0 };
    case 'node':
      return { kind: 'node', alive: true, hits: 0, work: 0, regrow: 0, ground: 0 };
    case 'processor':
      return { kind: 'processor', inputs: {}, output: 0, progress: 0, operated: false, active: false };
    case 'counter':
      return { kind: 'counter', stock: 0, serveT: 0, queue: [] };
    case 'deposit':
      return { kind: 'deposit', count: 0 };
    case 'shelf':
      return { kind: 'shelf', items: [] };
  }
}

export function createPadState(): PadState {
  return { paid: 0, mats: {}, done: false, visible: false, acc: 0 };
}

export function createState(data: GameData, seed: number): SimState {
  const s: SimState = {
    version: SAVE_VERSION,
    seed,
    rng: (seed * 2654435761) >>> 0,
    time: 0,
    tick: 0,
    player: {
      x: data.playerStart.x, z: data.playerStart.z, px: data.playerStart.x, pz: data.playerStart.z,
      vx: 0, vz: 0, facing: Math.PI, stack: [], capacity: data.balance.startCapacity, transferCd: 0,
      working: null, onPad: null, padTime: 0, returning: null, pickedFrom: null,
    },
    embers: 0,
    emberPiles: [],
    stations: {},
    pads: {},
    unlocked: {},
    helpers: {},
    links: {},
    customers: [],
    nextCustomerId: 1,
    spawnT: 0,
    hearth: { level: 1, fuel: 0, cosy: false },
    areasOpen: {},
    population: 0,
    tents: 0,
    quest: { index: 0, base: 0, id: data.quests[0]?.id },
    stats: {},
    mods: { ...DEFAULT_MODS },
    guideMemo: null,
    guideUnload: false,
    beacon: 0,
    finale: { phase: 'none', t: 0, progress: 0 },
    tools: {},
    orders: [],
    nextOrderId: 1,
    season: 1,
    totals: createTotals(),
    layoutRev: data.layoutRev,
  };
  normalizeState(s, data);
  return s;
}

/** Fill in any state entries missing for the current data (new stations/pads added by later content). */
export function normalizeState(s: SimState, data: GameData): void {
  for (const d of data.stations) if (!s.stations[d.id]) s.stations[d.id] = createStationState(d);
  for (const p of data.pads) if (!s.pads[p.id]) s.pads[p.id] = createPadState();
  for (const l of data.links) if (!s.links[l.id]) s.links[l.id] = { t: 0, belt: [] };
  for (const a of data.areas) if (a.hearth <= s.hearth.level) s.areasOpen[a.id as AreaId] = true;
  s.mods = { ...DEFAULT_MODS, ...s.mods };
  // A save from an older layout may leave the player where a wall or building now stands:
  // put them back at the start point (set by the migration that changed the layout).
  if ((s as { relocatePlayer?: boolean }).relocatePlayer) {
    s.player.x = s.player.px = data.playerStart.x;
    s.player.z = s.player.pz = data.playerStart.z;
    s.player.vx = s.player.vz = 0;
    delete (s as { relocatePlayer?: boolean }).relocatePlayer;
  }
  if ((s.layoutRev ?? 1) !== data.layoutRev) reseat(s, data);
  s.stats = s.stats ?? {};
  s.guideUnload = !!s.guideUnload;
  s.player.returning = s.player.returning ?? null;
  s.player.pickedFrom = s.player.pickedFrom ?? null;
  s.player.shelf = s.player.shelf ?? null;
  s.beacon = s.beacon ?? 0;
  s.finale = s.finale ?? { phase: 'none', t: 0, progress: 0 };
  s.tools = s.tools ?? {};
  s.orders = s.orders ?? [];
  s.nextOrderId = s.nextOrderId ?? 1;
  s.season = s.season ?? 1;
  s.totals = { ...createTotals(), ...(s.totals ?? {}) };
  // Quest chain re-anchoring: keep the player on the same quest even if quests were inserted before it.
  if (s.quest.id) {
    const i = data.quests.findIndex((q) => q.id === s.quest.id);
    if (i >= 0) s.quest.index = i;
  }
  s.quest.id = data.quests[s.quest.index]?.id;
}
