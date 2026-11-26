import type { AreaId, GameData, ItemCounts, ItemKind, ModKey } from '../data/types';

export const SAVE_VERSION = 1;

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
}

export interface PileState { kind: 'pile'; count: number; acc: number }
export interface NodeState { kind: 'node'; alive: boolean; hits: number; work: number; regrow: number; ground: number }
export interface ProcState { kind: 'processor'; inputs: ItemCounts; output: number; progress: number; operated: boolean; active: boolean }
export interface CounterState { kind: 'counter'; stock: number; serveT: number; queue: number[] }
export interface DepositState { kind: 'deposit'; count: number }
export type StationState = PileState | NodeState | ProcState | CounterState | DepositState;

export interface PadState {
  paid: number;
  mats: ItemCounts;
  done: boolean;
  visible: boolean;
  acc: number;
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
}

export interface BeltItem { item: ItemKind; p: number }
export interface LinkState { t: number; belt: BeltItem[] }

export interface EmberPile { id: string; x: number; z: number; count: number }

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
  quest: { index: number; base: number };
  stats: Record<string, number>;
  mods: Record<ModKey, number>;
  guideMemo: ItemKind | null;
  /** Guidance is mid-way through handing in items the goal can't use. */
  guideUnload: boolean;
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
};

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
    quest: { index: 0, base: 0 },
    stats: {},
    mods: { ...DEFAULT_MODS },
    guideMemo: null,
    guideUnload: false,
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
  s.stats = s.stats ?? {};
  s.guideUnload = !!s.guideUnload;
  s.player.returning = s.player.returning ?? null;
  s.player.pickedFrom = s.player.pickedFrom ?? null;
}
