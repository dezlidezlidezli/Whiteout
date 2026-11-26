// Declarative content types. Pure data: no three.js, no DOM.

/** Carryable item kinds. Must match ItemKind in src/view/models (minus 'ember', which is never carried). */
export type ItemKind = 'fish' | 'stew' | 'log' | 'plank' | 'smokedFish' | 'ore' | 'ingot' | 'feast';
/** Everything the view can draw as an item, including embers. */
export type RenderKind = ItemKind | 'ember';

export type ItemCounts = Partial<Record<ItemKind, number>>;

export interface Vec2 {
  x: number;
  z: number;
}

export interface ItemDef {
  kind: ItemKind;
  name: string;
  /** Embers paid per unit when served to an Icebound at a counter. 0 = not a dish. */
  price: number;
  /** CSS colour for UI icons. */
  color: string;
}

export interface RecipeDef {
  id: string;
  inputs: ItemCounts;
  output: ItemKind;
  outputCount: number;
  /** Seconds per craft at speed 1. */
  time: number;
}

export type AreaId = 'camp' | 'kettleYard' | 'pinewood' | 'frozenLake' | 'ironridge' | 'beaconPeak';

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface AreaDef {
  id: AreaId;
  name: string;
  /** Walkable rectangles (union). Adjacent areas overlap by >= 1 m where a passage exists. */
  rects: Rect[];
  /** Hearth level at which the area opens (its frost wall shatters). */
  hearth: number;
  /** Where the camera pans when the area opens. */
  focus: Vec2;
}

export interface WallDef {
  id: string;
  area: AreaId;
  /** Polyline of the frost wall (visual). Collision comes from the area being closed. */
  points: Vec2[];
}

export type Solid = { kind: 'circle'; x: number; z: number; r: number } | { kind: 'box'; x: number; z: number; hw: number; hd: number };

interface StationBase {
  id: string;
  area: AreaId;
  x: number;
  z: number;
  /** Facing (radians around +Y, 0 = facing +Z). */
  rot?: number;
  /** Model name for createProp. */
  model: string;
  /** Pad that unlocks it. Absent = present from the start. */
  unlockedBy?: string;
  /** Collision footprint relative to x/z. Circle radius or half extents. */
  solid?: { r: number } | { hw: number; hd: number };
  /** Distance from centre within which the player/helpers interact. */
  reach: number;
  /** Display name for UI / pads. */
  name: string;
}

export interface PileDef extends StationBase {
  type: 'pile';
  item: ItemKind;
  cap: number;
  start: number;
  /** Items per second refilled (0 = only fed by helpers/links). */
  refill: number;
  /** Whether helpers/links may deposit here. */
  accepts?: boolean;
}

export interface NodeDef extends StationBase {
  type: 'node';
  /** Grouping tag for harvest helpers and guidance, e.g. 'pine'. */
  tag: string;
  item: ItemKind;
  hitTime: number;
  yieldPerHit: number;
  /** Hits until it is depleted (tree falls). */
  hits: number;
  regrow: number;
  /** Items that spill to the ground when the harvester's stack is full. */
  groundCap: number;
  /** Global modifier that scales work speed here (default 'chopSpeed'). */
  speedMod?: ModKey;
}

export interface ProcessorDef extends StationBase {
  type: 'processor';
  recipe: string;
  /** Max buffered units of each input. */
  inputCap: number;
  outputCap: number;
  operator: 'none' | 'boost' | 'required';
  /** Speed multiplier while operated by a helper (for 'boost'). */
  boost?: number;
  /** Global modifier that scales this processor's speed (e.g. 'cookSpeed'). */
  speedMod?: ModKey;
}

export interface CounterDef extends StationBase {
  type: 'counter';
  item: ItemKind;
  cap: number;
  serveTime: number;
  /** Unit direction the queue extends in, away from the counter. */
  queueDir: Vec2;
  queueLen: number;
  queueSpacing: number;
  /** Where the queue starts (customer stands here to be served). */
  queueStart: Vec2;
  /** Where embers pile up (player side). */
  emberSpot: Vec2;
  /** Waypoints thawed villagers follow towards camp. */
  exitPath: Vec2[];
  /** Spawn point out in the storm. */
  spawn: Vec2;
  wantMin: number;
  wantMax: number;
  /** Optional queue polyline (starting at queueStart); slots are laid along it instead of queueDir. */
  queuePath?: Vec2[];
  /**
   * Icebound drawn per spawn tick for this counter (default 1). Counters that set it keep a big standing
   * crowd (serving is supply-limited) and are not limited by Balance.maxCustomers, only by queueLen.
   */
  spawnPer?: number;
  /** Icebound that stream in at once when the counter opens. */
  startCrowd?: number;
}

export interface DepositDef extends StationBase {
  type: 'deposit';
  accepts: ItemKind[];
  cap: number;
  /** 'fuel' feeds the Hearth (Cosy bonus). 'orders' = the Open Season notice board (takes items for open orders). */
  role: 'fuel' | 'store' | 'orders';
}

export type StationDef = PileDef | NodeDef | ProcessorDef | CounterDef | DepositDef;
export type StationType = StationDef['type'];

/** Purely visual/blocking placed prop (fences, decor, cabins). */
export interface DecorDef {
  id: string;
  area: AreaId;
  model: string;
  x: number;
  z: number;
  rot?: number;
  scale?: number;
  level?: number;
  seed?: number;
  unlockedBy?: string;
  solid?: { r: number } | { hw: number; hd: number };
}

export type Effect =
  | { type: 'unlock'; id: string }
  | { type: 'capacity'; add: number }
  | { type: 'hire'; helper: string }
  | { type: 'hearth'; level: number }
  | { type: 'mod'; key: ModKey; add?: number; mul?: number }
  /** Repeatable upgrade: total bonus after L levels is max·(1−(1−rate)^L) (multiplicative, or additive for add-type mods). */
  | { type: 'growth'; key: ModKey; max: number; rate: number }
  /** Tool tier up (view swaps the tool model). */
  | { type: 'tool'; tool: ToolKind }
  /** Great Beacon stage complete (1..4); stage 4 starts the finale. */
  | { type: 'beacon'; stage: number }
  /** Cosmetic camp decoration: unlocks these decor ids. */
  | { type: 'decorate'; ids: string[] };

export type ToolKind = 'axe' | 'pick' | 'kettle' | 'auger';

export type ModKey =
  | 'moveSpeed'
  | 'transferRate'
  | 'spawnRate'
  | 'pricePlus'
  | 'cookSpeed'
  | 'chopSpeed'
  | 'helperSpeed'
  | 'helperCapacity'
  | 'fishSpeed'
  | 'mineSpeed'
  | 'priceMul';

export type PadIcon = { prop: string; level?: number } | { item: ItemKind } | { character: string };

export interface PadDef {
  id: string;
  area: AreaId;
  x: number;
  z: number;
  label: string;
  cost: number;
  materials?: ItemCounts;
  /** All of these pads must be complete before this pad appears. */
  requires: string[];
  requiresHearth?: number;
  requiresPop?: number;
  effects: Effect[];
  icon: PadIcon;
  /** Repeatable pad: after each completion the cost grows ×growth (up to `max` levels, default infinite). */
  repeat?: { growth: number; max?: number };
  /** UI grouping for Open Season pads. */
  group?: 'upgrade' | 'decor';
}

export type HelperRole = 'haul' | 'harvest' | 'operate' | 'courier';

export interface HelperDef {
  id: string;
  name: string;
  role: HelperRole;
  /** Model role for createCharacter. */
  model: string;
  home: Vec2;
  capacity: number;
  speed: number;
  /** haul: source station ids (priority order). */
  from?: string[];
  /** haul/harvest: destination station ids (priority order). */
  to?: string[];
  /** haul: restrict to an item kind. */
  item?: ItemKind;
  /** harvest: node tag. */
  nodeTag?: string;
  /** operate: processor id. */
  station?: string;
  /** Seconds per item transfer. */
  transferTime: number;
  /** courier: fixed trail from the source depot (first point) to the destination depot (last point). */
  route?: Vec2[];
}

export interface LinkDef {
  id: string;
  area: AreaId;
  from: string;
  to: string;
  item: ItemKind;
  /** Seconds between items entering the belt. */
  interval: number;
  /** Seconds an item rides the belt. */
  travel: number;
  /** Belt polyline for the view (start..end). */
  path: Vec2[];
  unlockedBy?: string;
  /** Max items on the belt at once. */
  maxOnBelt: number;
}

export type QuestGoal =
  | { type: 'stat'; stat: string; n: number }
  | { type: 'pad'; pad: string }
  | { type: 'hearth'; level: number }
  | { type: 'pop'; n: number }
  | { type: 'never' };

export type QuestGuide =
  | { type: 'deliver'; item: ItemKind; to: string[] }
  | { type: 'produce'; item: ItemKind }
  | { type: 'station'; id: string }
  | { type: 'harvest'; tag: string }
  | { type: 'earn' }
  | { type: 'pad'; pad: string }
  | { type: 'orders' }
  | { type: 'openSeason' }
  | { type: 'none' };

export interface QuestDef {
  id: string;
  text: string;
  goal: QuestGoal;
  /** Guidance arrow behaviour. For pad goals defaults to the pad. */
  guide?: QuestGuide;
  reward: number;
  /** Toast shown when the quest starts (optional hint). */
  hint?: string;
}

export interface CampDef {
  hearth: Vec2;
  /** Population thresholds at which a tent is raised (index = tent spot). */
  tentAt: number[];
  tentSpots: { x: number; z: number; rot: number }[];
  /** Where arriving villagers settle (ring around the hearth). */
  settleMin: number;
  settleMax: number;
}

export interface Balance {
  playerSpeed: number;
  playerRadius: number;
  startCapacity: number;
  maxCapacity: number;
  /** Seconds between item hops at transferRate 1. */
  transferInterval: number;
  emberCollectRadius: number;
  emberCollectRate: number;
  customerSpeed: number;
  thawedSpeed: number;
  thawTime: number;
  /** Seconds between Icebound arrivals at spawnRate 1. */
  spawnInterval: number;
  /** Max Icebound walking in/queued at once (all counters). */
  maxCustomers: number;
  cosyMultiplier: number;
  cosyHelperSpeed: number;
  /** Seconds of Cosy per log burned. */
  fuelPerLog: number;
  hearthFuelCap: number;
  warmRadius: number[];
  /** Pad payment: base embers/s and acceleration. */
  padBaseRate: number;
  padSecondsToFill: number;
  padAccel: number;
}

// ---- Yard dressing (purely for the view, plus palisade collision) ----

export type FloorType = 'planks' | 'cobble' | 'packedEarth' | 'ice' | 'stone';

/** A floor patch drawn over the snow (later entries draw on top of earlier ones). */
export interface FloorDef extends Rect {
  id: string;
  area: AreaId;
  type: FloorType;
}

/** Enclosing palisade: an axis-aligned polyline (gaps = separate polylines). Solid for collision (0.3 m thick). */
export interface PalisadeDef {
  id: string;
  area: AreaId;
  points: Vec2[];
}

/** Trampled-snow track or boardwalk linking yards, the camp and frost-wall gateways. */
export interface PathDef {
  id: string;
  kind: 'snow' | 'boardwalk';
  width: number;
  points: Vec2[];
}

/** Where purely decorative (non-colliding) clutter may be scattered. Never overlaps stations, pads, belts,
 * queues, helper homes or courier trails (checked by tests). */
export interface ClutterZoneDef extends Rect {
  id: string;
  area: AreaId;
}

export interface DressingDef {
  floors: FloorDef[];
  walls: PalisadeDef[];
  paths: PathDef[];
  clutterZones: ClutterZoneDef[];
}

/** One kind of caravan order the notice board can post. */
export interface OrderKindDef {
  item: ItemKind;
  /** Base quantity at season 1. */
  n: number;
  /** Embers per unit at season 1. */
  value: number;
  /** Relative draw weight. */
  weight: number;
}

export interface EndlessDef {
  /** Station id of the notice board (a deposit with role 'orders'). */
  board: string;
  slots: number;
  orders: OrderKindDef[];
  /** Orders completed per season level. */
  ordersPerSeason: number;
  /** Per season level above 1: quantity growth and per-unit reward growth (linear, gentle). */
  seasonQty: number;
  seasonValue: number;
  /** Quantity never exceeds base·qtyCapMul. */
  qtyCapMul: number;
}

export interface FinaleDef {
  /** Seconds of each cinematic phase (the sim keeps running; the view drives the camera from progress). */
  lightingTime: number;
  dawnTime: number;
  /** Embers granted at dawn, piled at the beacon. */
  reward: number;
  rewardSpot: Vec2;
  /** Warm radius once the Long Night has ended (covers the whole map). */
  warmRadius: number;
}

export interface GameData {
  items: Record<ItemKind, ItemDef>;
  recipes: Record<string, RecipeDef>;
  balance: Balance;
  areas: AreaDef[];
  walls: WallDef[];
  stations: StationDef[];
  decor: DecorDef[];
  pads: PadDef[];
  helpers: HelperDef[];
  links: LinkDef[];
  quests: QuestDef[];
  camp: CampDef;
  playerStart: Vec2;
  endless: EndlessDef;
  finale: FinaleDef;
  /** Floors, palisades, paths and clutter zones per area (view dressing; palisades also collide). */
  dressing: DressingDef;
}
