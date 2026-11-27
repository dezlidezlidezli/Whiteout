// Deterministic game simulation. Pure TypeScript: no three.js, no DOM, no Date/Math.random.

import type {
  CounterDef, DepositDef, Effect, GameData, HelperDef, ItemKind, LinkDef, NodeDef, PadDef, PileDef, ProcessorDef, Rect, Solid,
  StationDef, Vec2,
} from '../data/types';
import { moveCircle, navNext, pushOut } from './collision';
import { NavGrid } from './navgrid';
import { wallSolids } from '../data/dressing';
import type { Actor, Place, SimEvent } from './events';
import { queueSlot, updateCustomers, updateHelpers, hireHelper } from './agents';
import { computeGuide, type GuideTarget } from './guide';
import { deliverOrder, orderRoom, updateTotals } from './endless';
import { finaleWarmRadius, setBeaconStage, updateFinale } from './finale';
import { procBoost, updateCrank } from './crank';
import { updateFlame } from './flame';
import { ploughSpeed, updatePlough } from './plough';
import { noteTurnedAway } from './housing';
import { updateRescue } from './rescue';
import { skateBounce, skateVelocity, updateSkate } from './skate';
import { migrate } from './save';
import { nextRandom } from './rng';
import {
  createState, normalizeState, SAVE_VERSION, type CounterState, type DepositState, type NodeState, type PileState,
  type ProcState, type SimState, type StationState,
} from './state';

export const STEP = 1 / 60;
/** Seconds of standing still at a bin before it starts taking the pack. */
export const BIN_DELAY = 0.8;
const MAX_EVENTS = 4000;
/** Room reported for player drops: effectively unlimited, so a drop is never refused. */
const PLAYER_ROOM = 9999;
/** Processor output buffers hold at least this much before the processor pauses. */
const MIN_OUTPUT_CAP = 60;
const PLAYER: Actor = { kind: 'player' };

export interface QuestProgress {
  id: string;
  text: string;
  cur: number;
  max: number;
  index: number;
  total: number;
  final: boolean;
}

export class Sim {
  readonly data: GameData;
  state: SimState;
  events: SimEvent[] = [];

  readonly stationDefs = new Map<string, StationDef>();
  readonly padDefs = new Map<string, PadDef>();
  readonly linkDefs = new Map<string, LinkDef>();
  private moveX = 0;
  private moveZ = 0;
  private solidCache: Solid[] | null = null;
  private rectCache: Rect[] | null = null;
  private padTickT = 0;
  private nav: NavGrid | null = null;
  private navSolids: Solid[] | null = null;
  private navRects: Rect[] | null = null;
  private allCache: Solid[] | null = null;
  /** Spatial index over allSolids(): 4 m cells, each listing every solid within SOLID_REACH of the cell. */
  private gridOf: Solid[] | null = null;
  private grid = new Map<number, Solid[]>();
  private allCacheBase: Solid[] | null = null;
  private allCacheVer = -1;
  /** Bumped whenever a node falls or regrows (invalidates allSolids). */
  private nodeVer = 0;
  private reachBuf: StationDef[] = [];
  private reachDist: number[] = [];
  private reachTick = -1;

  constructor(data: GameData, opts: { seed?: number; save?: string } = {}) {
    this.data = data;
    for (const s of data.stations) this.stationDefs.set(s.id, s);
    for (const p of data.pads) this.padDefs.set(p.id, p);
    for (const l of data.links) this.linkDefs.set(l.id, l);
    this.state = createState(data, opts.seed ?? 1);
    if (opts.save) this.load(opts.save);
    else this.boot();
  }

  /** Fresh-game setup: a few Icebound already waiting so the first loop starts immediately. */
  private boot(): void {
    this.refreshPads(false);
    this.startQuest(0, false);
    const c = this.stationDefs.get('counterA');
    if (c && c.type === 'counter') {
      for (let i = 0; i < 18; i++) {
        const q = queueSlot(c, i);
        this.spawnCustomerAt(c, q.x, q.z + 0.01);
      }
    }
  }

  // ------------------------------------------------------------------ public API

  /** Joystick vector, length clamped to 1. */
  setMove(x: number, z: number): void {
    const l = Math.hypot(x, z);
    if (l > 1) {
      x /= l;
      z /= l;
    }
    this.moveX = x;
    this.moveZ = z;
  }

  getMove(): { x: number; z: number } {
    return { x: this.moveX, z: this.moveZ };
  }

  /** Advance one fixed step (dt defaults to 1/60). */
  step(dt = STEP): void {
    const s = this.state;
    s.time += dt;
    s.tick++;
    const p = s.player;
    p.px = p.x;
    p.pz = p.z;
    for (const c of s.customers) {
      c.px = c.x;
      c.pz = c.z;
    }
    for (const id in s.helpers) {
      const h = s.helpers[id];
      h.px = h.x;
      h.pz = h.z;
    }
    this.updateHearth(dt);
    this.updatePlayer(dt);
    this.updateInteract(dt);
    this.updateStations(dt);
    this.updateLinks(dt);
    updateHelpers(this, dt);
    updateCustomers(this, dt);
    // Switched-off mechanics (data.mechanics) never run: their state just waits in the save.
    const mx = this.data.mechanics;
    if (mx.plough) updatePlough(this, dt);
    if (mx.rescue) updateRescue(this, dt);
    if (mx.skate) updateSkate(this, dt);
    if (mx.crank) updateCrank(this, dt);
    if (mx.flame) updateFlame(this, dt);
    updateFinale(this, dt);
    updateTotals(this, dt);
    this.updateQuest();
  }

  private operators: Map<string, HelperDef[]> | null = null;
  /** Operator helpers (hired or not) that work this station. */
  private operatorsOf(station: string): HelperDef[] {
    if (!this.operators) {
      this.operators = new Map();
      for (const h of this.data.helpers) {
        if (h.role !== 'operate' || !h.station) continue;
        const l = this.operators.get(h.station) ?? [];
        l.push(h);
        this.operators.set(h.station, l);
      }
    }
    return this.operators.get(station) ?? NO_HELPERS;
  }

  /** Run many fixed steps (headless). */
  advance(seconds: number): void {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) this.step(STEP);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  emit(e: SimEvent): void {
    this.events.push(e);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  serialize(): string {
    return JSON.stringify({ v: SAVE_VERSION, state: this.state });
  }

  load(json: string): void {
    const raw = JSON.parse(json) as { v: number; state: SimState };
    const st = migrate(raw);
    normalizeState(st, this.data);
    this.state = st;
    this.solidCache = null;
    this.rectCache = null;
    this.allCache = null;
    this.reachTick = -1;
    this.refreshPads(false);
  }

  // ------------------------------------------------------------------ queries

  rand(): number {
    return nextRandom(this.state);
  }

  isActive(id: string): boolean {
    const def = this.stationDefs.get(id) ?? this.linkDefs.get(id) ?? this.data.decor.find((d) => d.id === id);
    if (!def) return false;
    if (def.unlockedBy && !this.state.unlocked[id]) return false;
    return true;
  }

  /** Station is active and in an open area (reachable). */
  isUsable(id: string): boolean {
    const d = this.stationDefs.get(id);
    return !!d && this.isActive(id) && !!this.state.areasOpen[d.area];
  }

  stationState<T extends StationState>(id: string): T {
    return this.state.stations[id] as T;
  }

  get cosy(): boolean {
    return this.state.hearth.cosy;
  }

  /** Warm radius for a Hearth level; with no argument, the current one (whole map once the finale's dawn breaks). */
  warmRadius(level?: number): number {
    const w = this.data.balance.warmRadius;
    const base = w[Math.max(0, Math.min(w.length - 1, (level ?? this.state.hearth.level) - 1))];
    return level === undefined ? finaleWarmRadius(this, base) : base;
  }

  /** Embers paid per dish of `item` right now (price + bonuses, ×Cosy). */
  dishPrice(item: ItemKind): number {
    const s = this.state;
    return (this.data.items[item].price + s.mods.pricePlus) * s.mods.priceMul * (s.hearth.cosy ? this.data.balance.cosyMultiplier : 1);
  }

  /** Current ember cost of a pad (repeatable pads grow with each level bought). */
  padCost(id: string): number {
    const def = this.padDefs.get(id)!;
    if (!def.repeat) return def.cost;
    const lv = this.state.pads[id]?.level ?? 0;
    return Math.round(def.cost * Math.pow(def.repeat.growth, lv));
  }

  /** Times a repeatable pad has been bought. */
  padLevel(id: string): number {
    return this.state.pads[id]?.level ?? 0;
  }

  invalidateRects(): void {
    this.rectCache = null;
  }

  /** Total fuel as 0..1 of the Hearth's capacity. */
  fuelFraction(): number {
    const st = this.state.stations['hearth'] as DepositState | undefined;
    const def = this.stationDefs.get('hearth') as DepositDef | undefined;
    if (!st || !def) return 0;
    const b = this.data.balance;
    return Math.min(1, (st.count * b.fuelPerLog + this.state.hearth.fuel) / (def.cap * b.fuelPerLog));
  }

  capacity(): number {
    return this.state.player.capacity;
  }

  solids(): Solid[] {
    if (this.solidCache) return this.solidCache;
    const out: Solid[] = [];
    const add = (x: number, z: number, sol: StationDef['solid']) => {
      if (!sol) return;
      if ('r' in sol) out.push({ kind: 'circle', x, z, r: sol.r });
      else out.push({ kind: 'box', x, z, hw: sol.hw, hd: sol.hd });
    };
    for (const d of this.data.stations) {
      if (!this.isActive(d.id)) continue;
      if (d.type === 'node') continue; // nodes handled separately (they fall)
      add(d.x, d.z, d.solid);
    }
    for (const d of this.data.decor) {
      if (d.unlockedBy && !this.state.unlocked[d.id]) continue;
      add(d.x, d.z, d.solid);
    }
    // Yard palisades/fences (gaps cut out).
    for (const w of wallSolids(this.data.dressing ?? [])) out.push({ kind: 'box', ...w });
    const tents = this.data.camp.tentSpots;
    for (let i = 0; i < Math.min(this.state.tents, tents.length); i++) {
      out.push({ kind: 'circle', x: tents[i].x, z: tents[i].z, r: 0.85 });
    }
    this.solidCache = out;
    return out;
  }

  /** Solids including currently standing trees. */
  allSolids(): Solid[] {
    const base = this.solids();
    // Cached until the static solids or any tree's standing state changes (no per-step garbage).
    if (this.allCache && this.allCacheBase === base && this.allCacheVer === this.nodeVer) return this.allCache;
    const out = base.slice();
    this.allCache = out;
    this.allCacheBase = base;
    this.allCacheVer = this.nodeVer;
    for (const d of this.data.stations) {
      if (d.type !== 'node' || !d.solid || !('r' in d.solid)) continue;
      const st = this.state.stations[d.id] as NodeState;
      if (st.alive) out.push({ kind: 'circle', x: d.x, z: d.z, r: d.solid.r });
    }
    return out;
  }

  /**
   * The solids that can matter for something at (x, z): pushing out (any radius) and steering with up to
   * ~6 m of look-ahead. A superset of what is near; never allocates per call.
   */
  solidsNear(x: number, z: number): Solid[] {
    const all = this.allSolids();
    if (this.gridOf !== all) {
      this.gridOf = all;
      this.grid.clear();
      for (const s of all) {
        const ext = (s.kind === 'circle' ? s.r : Math.hypot(s.hw, s.hd)) + SOLID_REACH;
        const x0 = Math.floor((s.x - ext) / SOLID_CELL);
        const x1 = Math.floor((s.x + ext) / SOLID_CELL);
        const z0 = Math.floor((s.z - ext) / SOLID_CELL);
        const z1 = Math.floor((s.z + ext) / SOLID_CELL);
        for (let i = x0; i <= x1; i++) {
          for (let j = z0; j <= z1; j++) {
            const k = cellKey(i, j);
            let l = this.grid.get(k);
            if (!l) this.grid.set(k, (l = []));
            l.push(s);
          }
        }
      }
    }
    return this.grid.get(cellKey(Math.floor(x / SOLID_CELL), Math.floor(z / SOLID_CELL))) ?? NO_SOLIDS;
  }

  walkRects(): Rect[] {
    if (this.rectCache) return this.rectCache;
    const out: Rect[] = [];
    for (const a of this.data.areas) if (this.state.areasOpen[a.id]) out.push(...a.rects);
    this.rectCache = out;
    return out;
  }

  invalidateSolids(): void {
    this.solidCache = null;
  }

  guide(): GuideTarget | null {
    return computeGuide(this);
  }

  /** Next waypoint from the player towards (x,z) through open areas (for the arrow and the bot). */
  navFromPlayer(x: number, z: number): { x: number; z: number } {
    const p = this.state.player;
    const rects = this.walkRects();
    const solidsNow = this.solids();
    if (!this.nav || this.navSolids !== solidsNow || this.navRects !== rects) {
      this.nav = new NavGrid(rects, solidsNow, this.data.balance.playerRadius);
      this.navSolids = solidsNow;
      this.navRects = rects;
    }
    const g = this.nav.next(p.x, p.z, x, z);
    if (g) return g;
    const w = navNext(rects, p.x, p.z, x, z);
    if (w.x === x && w.z === z) return w;
    // The portal waypoint may sit inside a tent or prop: slide it to the nearest free point still inside the portal.
    const r = this.data.balance.playerRadius;
    const solids = this.allSolids();
    const free = (qx: number, qz: number) => {
      let n = 0;
      for (const rc of rects) if (qx >= rc.x0 + r && qx <= rc.x1 - r && qz >= rc.z0 + r && qz <= rc.z1 - r) n++;
      if (n < 2) return false;
      const q = { x: qx, z: qz };
      pushOut(q, r + 0.1, solids);
      return Math.abs(q.x - qx) + Math.abs(q.z - qz) < 1e-6;
    };
    if (free(w.x, w.z)) return w;
    for (let rad = 0.3; rad <= 4.5; rad += 0.3) {
      let best: { x: number; z: number } | null = null;
      let bd = Infinity;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const qx = w.x + Math.cos(a) * rad;
        const qz = w.z + Math.sin(a) * rad;
        if (!free(qx, qz)) continue;
        const d = Math.hypot(qx - p.x, qz - p.z) + Math.hypot(x - qx, z - qz);
        if (d < bd) {
          bd = d;
          best = { x: qx, z: qz };
        }
      }
      if (best) return best;
    }
    return w;
  }

  questProgress(): QuestProgress {
    const s = this.state;
    const qs = this.data.quests;
    const q = qs[Math.min(s.quest.index, qs.length - 1)];
    let cur = 0;
    let max = 1;
    const g = q.goal;
    if (g.type === 'stat') {
      cur = (s.stats[g.stat] ?? 0) - s.quest.base;
      max = g.n;
    } else if (g.type === 'pad') {
      const def = this.padDefs.get(g.pad)!;
      const ps = s.pads[g.pad];
      max = this.padCost(def.id) + sumCounts(def.materials);
      cur = ps.paid + sumCounts(ps.mats);
    } else if (g.type === 'hearth') {
      cur = s.hearth.level;
      max = g.level;
    } else if (g.type === 'pop') {
      cur = s.population;
      max = g.n;
    } else {
      cur = 0;
      max = 0;
    }
    return { id: q.id, text: q.text, cur: Math.min(cur, max), max, index: s.quest.index, total: qs.length, final: g.type === 'never' };
  }

  padRemaining(id: string): { embers: number; mats: Partial<Record<ItemKind, number>> } {
    const def = this.padDefs.get(id)!;
    const ps = this.state.pads[id];
    const mats: Partial<Record<ItemKind, number>> = {};
    for (const k in def.materials ?? {}) {
      const kk = k as ItemKind;
      const r = (def.materials![kk] ?? 0) - (ps.mats[kk] ?? 0);
      if (r > 0) mats[kk] = r;
    }
    return { embers: Math.max(0, this.padCost(id) - ps.paid), mats };
  }

  /** Pad visible but gated by population. */
  padLocked(id: string): boolean {
    const def = this.padDefs.get(id)!;
    return (def.requiresPop ?? 0) > this.state.population;
  }

  // ------------------------------------------------------------------ containers (generic station I/O)

  /** Item a station currently offers for pickup, or null. */
  takeable(id: string, item?: ItemKind): ItemKind | null {
    const d = this.stationDefs.get(id);
    if (!d) return null;
    const st = this.state.stations[id];
    switch (d.type) {
      case 'pile':
        return (st as PileState).count >= 1 && (!item || item === d.item) ? d.item : null;
      case 'processor': {
        const out = this.data.recipes[d.recipe].output;
        return (st as ProcState).output >= 1 && (!item || item === out) ? out : null;
      }
      case 'node':
        return (st as NodeState).ground >= 1 && (!item || item === d.item) ? d.item : null;
      default:
        return null;
    }
  }

  take(id: string): ItemKind | null {
    const it = this.takeable(id);
    if (!it) return null;
    const st = this.state.stations[id];
    if (st.kind === 'pile') st.count--;
    else if (st.kind === 'processor') st.output--;
    else if (st.kind === 'node') st.ground--;
    return it;
  }

  /** How many more of item the station accepts. `byHelper` lets helpers/links fill accepting piles. */
  room(id: string, item: ItemKind, byHelper = false): number {
    const d = this.stationDefs.get(id);
    if (!d) return 0;
    const st = this.state.stations[id];
    switch (d.type) {
      case 'processor': {
        const need = this.data.recipes[d.recipe].inputs[item];
        if (!need) return 0;
        // The player is never refused (no soft-locks); caps are soft targets for helpers/links.
        if (!byHelper) return PLAYER_ROOM;
        return Math.max(0, d.inputCap - ((st as ProcState).inputs[item] ?? 0));
      }
      case 'counter':
        if (d.item === item && !byHelper) return PLAYER_ROOM;
        return d.item === item ? Math.max(0, d.cap - (st as CounterState).stock) : 0;
      case 'deposit':
        // The Open Season notice board only takes what open orders still want.
        if (d.role === 'orders') return byHelper ? 0 : orderRoom(this, item);
        if (d.accepts.includes(item) && !byHelper) return PLAYER_ROOM;
        return d.accepts.includes(item) ? Math.max(0, d.cap - (st as DepositState).count) : 0;
      case 'pile':
        return byHelper && d.accepts && d.item === item ? Math.max(0, d.cap - (st as PileState).count) : 0;
      default:
        return 0;
    }
  }

  put(id: string, item: ItemKind): void {
    const st = this.state.stations[id];
    const od = this.stationDefs.get(id);
    if (od && od.type === 'deposit' && od.role === 'orders') {
      this.addStat(`deliver.${id}`, 1);
      deliverOrder(this, item);
      return;
    }
    if (st.kind === 'processor') st.inputs[item] = (st.inputs[item] ?? 0) + 1;
    else if (st.kind === 'counter') st.stock++;
    else if (st.kind === 'deposit') st.count++;
    else if (st.kind === 'pile') st.count++;
    this.addStat(`deliver.${id}`, 1);
    const d = this.stationDefs.get(id);
    if (d && d.type === 'deposit' && d.role === 'fuel') this.addStat('fuel', 1);
  }

  addStat(key: string, n: number): void {
    this.state.stats[key] = (this.state.stats[key] ?? 0) + n;
  }

  // ------------------------------------------------------------------ player

  private updatePlayer(dt: number): void {
    const p = this.state.player;
    const b = this.data.balance;
    // Deep snow slows (wading, or pushing the plough); lake ice has momentum (skate.ts).
    const speed = b.playerSpeed * this.state.mods.moveSpeed * ploughSpeed(this, p.x, p.z, p.vx, p.vz);
    const tx = this.moveX * speed;
    const tz = this.moveZ * speed;
    if (!skateVelocity(this, dt, this.moveX, this.moveZ, speed)) {
      const k = Math.min(1, dt * 16);
      p.vx += (tx - p.vx) * k;
      p.vz += (tz - p.vz) * k;
    }
    if (Math.abs(p.vx) < 1e-3 && Math.abs(p.vz) < 1e-3) {
      p.vx = 0;
      p.vz = 0;
    }
    if (p.vx !== 0 || p.vz !== 0) {
      const ox = p.x;
      const oz = p.z;
      moveCircle(p, p.vx * dt, p.vz * dt, b.playerRadius, this.solidsNear(p.x, p.z), this.walkRects());
      skateBounce(this, p.vx * dt, p.vz * dt, p.x - ox, p.z - oz);
      if (Math.hypot(tx, tz) > 0.3) p.facing = Math.atan2(p.vx, p.vz);
    }
  }

  private updateInteract(dt: number): void {
    const s = this.state;
    const p = s.player;
    const b = this.data.balance;

    // Embers fly into the wallet by proximity.
    const cr2 = b.emberCollectRadius * b.emberCollectRadius;
    for (let i = s.emberPiles.length - 1; i >= 0; i--) {
      const e = s.emberPiles[i];
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      if (dx * dx + dz * dz > cr2) continue;
      const n = Math.min(e.count, Math.max(1, Math.ceil(e.count * 0.12)));
      e.count -= n;
      s.embers += n;
      this.emit({ type: 'emberCollect', x: e.x, z: e.z, n });
      if (e.count <= 0) s.emberPiles.splice(i, 1);
    }

    // Pads.
    const prevPad = p.onPad;
    p.onPad = null;
    for (const def of this.data.pads) {
      const ps = s.pads[def.id];
      if (!ps.visible || ps.done) continue;
      if (Math.abs(p.x - def.x) < 0.95 && Math.abs(p.z - def.z) < 0.95) {
        p.onPad = def.id;
        break;
      }
    }
    if (prevPad && prevPad !== p.onPad && s.pads[prevPad]) s.pads[prevPad].hold = false;
    if (p.onPad && !this.padLocked(p.onPad)) {
      p.padTime += dt;
      this.payPad(p.onPad, dt);
    } else {
      p.padTime = 0;
    }

    // Nodes (auto-harvest when adjacent).
    p.working = null;
    let best: NodeDef | null = null;
    let bestD = Infinity;
    for (const d of this.data.stations) {
      if (d.type !== 'node' || !this.isUsable(d.id)) continue;
      const st = this.state.stations[d.id] as NodeState;
      if (!st.alive) continue;
      const dd = Math.hypot(d.x - p.x, d.z - p.z);
      if (dd <= d.reach && dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    if (best) {
      const st = this.state.stations[best.id] as NodeState;
      if ((p.stack.length < p.capacity || st.ground < best.groundCap) && !s.flame.held) {
        p.working = best.id;
        st.work += dt * s.mods[best.speedMod ?? 'chopSpeed'];
        if (st.work >= best.hitTime) {
          st.work -= best.hitTime;
          this.hitNode(best, PLAYER, p.stack, p.capacity);
        }
      }
    }

    for (const key of ['returning', 'pickedFrom'] as const) {
      const id = p[key];
      if (!id) continue;
      const rd = this.stationDefs.get(id);
      if (!rd || Math.hypot(rd.x - p.x, rd.z - p.z) > rd.reach + 0.3) p[key] = null;
    }

    // Bin: only standing still in its zone (for BIN_DELAY s) throws things away; walking past never does.
    let shelfId: string | null = null;
    let shelfD = Infinity;
    for (const d of this.data.stations) {
      if (d.type !== 'shelf' || !this.isUsable(d.id)) continue;
      const dd = Math.hypot(d.x - p.x, d.z - p.z);
      if (dd <= d.reach && dd < shelfD) {
        shelfD = dd;
        shelfId = d.id;
      }
    }
    if (!shelfId) {
      p.shelf = null;
      p.binT = 0;
    } else {
      if (!p.shelf || p.shelf.id !== shelfId) p.shelf = { id: shelfId, mode: 'drop' };
      const still = Math.hypot(this.moveX, this.moveZ) < 0.2 && Math.hypot(p.vx, p.vz) < 0.4;
      p.binT = still ? (p.binT ?? 0) + dt : 0;
    }

    // Item transfers at a fixed cadence.
    if (p.transferCd > 0) p.transferCd -= dt;
    if (p.transferCd <= 0) {
      const acted = this.playerShelf() || this.playerDrop() || this.playerPick();
      if (acted) p.transferCd += b.transferInterval / s.mods.transferRate;
      else p.transferCd = 0;
    }
  }

  /** One harvest hit. Items go into `stack` (up to cap) or spill to the node's ground pile. */
  hitNode(def: NodeDef, by: Actor, stack: ItemKind[], cap: number): void {
    const st = this.state.stations[def.id] as NodeState;
    this.emit({ type: 'nodeHit', node: def.id, by });
    for (let i = 0; i < def.yieldPerHit; i++) {
      if (stack.length < cap) {
        stack.push(def.item);
        if (by.kind === 'player') this.addStat('carried', 1);
        this.emit({ type: 'pickup', item: def.item, from: { kind: 'ground', id: def.id }, by, height: stack.length });
      } else if (st.ground < def.groundCap) {
        st.ground++;
      }
      this.addStat(`harvest.${def.item}`, 1);
    }
    st.hits++;
    if (st.hits >= def.hits) {
      st.alive = false;
      this.nodeVer++;
      st.hits = 0;
      st.work = 0;
      st.regrow = def.regrow;
      this.emit({ type: 'nodeDeplete', node: def.id });
    }
  }

  private stationsInReach(): StationDef[] {
    // Reused buffers, computed once per step (drop and pick share it): no per-step garbage.
    if (this.reachTick === this.state.tick) return this.reachBuf;
    this.reachTick = this.state.tick;
    const p = this.state.player;
    const out = this.reachBuf;
    const ds = this.reachDist;
    out.length = 0;
    ds.length = 0;
    for (const d of this.data.stations) {
      if (d.type === 'node') {
        const st = this.state.stations[d.id] as NodeState;
        if (st.ground <= 0) continue;
      }
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      if (dist > d.reach) continue;
      if (!this.isUsable(d.id)) continue;
      // Insertion sort by distance (only a handful of entries).
      let i = out.length;
      out.push(d);
      ds.push(dist);
      while (i > 0 && ds[i - 1] > dist) {
        out[i] = out[i - 1];
        ds[i] = ds[i - 1];
        i--;
      }
      out[i] = d;
      ds[i] = dist;
    }
    return out;
  }

  /** One shelf transfer (set down the top item, or take back the most recently shelved one). */
  private playerShelf(): boolean {
    const p = this.state.player;
    if (!p.shelf || (p.binT ?? 0) < BIN_DELAY) return false;
    const st = this.state.stations[p.shelf.id];
    if (!st || st.kind !== 'shelf') return false;
    const it = p.stack.pop();
    if (!it) return false;
    this.addStat('binned', 1);
    this.emit({ type: 'drop', item: it, to: { kind: 'station', id: p.shelf.id }, by: PLAYER, height: p.stack.length });
    this.emit({ type: 'binned', bin: p.shelf.id, item: it });
    return true;
  }

  private playerDrop(): boolean {
    const p = this.state.player;
    if (p.stack.length === 0) return false;
    // Pad materials first (when standing on a pad).
    if (p.onPad && !this.padLocked(p.onPad)) {
      const rem = this.padRemaining(p.onPad).mats;
      for (let i = p.stack.length - 1; i >= 0; i--) {
        const it = p.stack[i];
        if ((rem[it] ?? 0) > 0) {
          p.stack.splice(i, 1);
          const ps = this.state.pads[p.onPad];
          ps.mats[it] = (ps.mats[it] ?? 0) + 1;
          this.emit({ type: 'drop', item: it, to: { kind: 'pad', id: p.onPad }, by: PLAYER, height: i });
          this.checkPadDone(p.onPad);
          return true;
        }
      }
    }
    const inReach = this.stationsInReach();
    // Walking past a station only fills it up to its soft cap (so a pack meant for elsewhere isn't emptied on the
    // way); standing still, it takes everything (never refused, so the player can't be stranded).
    const walking = Math.hypot(p.vx, p.vz) > 1.6 && Math.hypot(this.moveX, this.moveZ) > 0.3;
    for (const d of inReach) {
      for (let i = p.stack.length - 1; i >= 0; i--) {
        const it = p.stack[i];
        const room = walking ? (d.type === 'pile' ? 0 : this.room(d.id, it, true)) : this.room(d.id, it);
        if (room > 0) {
          p.stack.splice(i, 1);
          this.put(d.id, it);
          this.emit({ type: 'drop', item: it, to: { kind: 'station', id: d.id }, by: PLAYER, height: i });
          return true;
        }
      }
    }
    // Hand items back: standing still with a full pack (then keep going until done).
    const still = Math.hypot(this.moveX, this.moveZ) < 0.2;
    // (Any pile or processor output holding that kind takes it back, uncapped.)
    for (const d of inReach) {
      if (d.type !== 'pile' && d.type !== 'processor') continue;
      const kind = d.type === 'pile' ? d.item : this.data.recipes[d.recipe].output;
      if (p.returning !== d.id && !(still && p.stack.length >= p.capacity && p.pickedFrom !== d.id)) continue;
      const i = p.stack.lastIndexOf(kind);
      if (i < 0) continue;
      p.stack.splice(i, 1);
      const rs = this.state.stations[d.id];
      if (rs.kind === 'pile') rs.count++;
      else if (rs.kind === 'processor') rs.output++;
      p.returning = d.id;
      this.emit({ type: 'drop', item: kind, to: { kind: 'station', id: d.id }, by: PLAYER, height: i });
      return true;
    }
    return false;
  }

  private playerPick(): boolean {
    const p = this.state.player;
    if (p.stack.length >= p.capacity || this.state.flame.held) return false; // both hands hold the flame
    for (const d of this.stationsInReach()) {
      if (d.id === p.returning) continue;
      const it = this.takeable(d.id);
      if (!it) continue;
      // Walking past a station only tops up the item already on top; pause to start a new kind.
      const top = p.stack[p.stack.length - 1];
      const moving = Math.hypot(p.vx, p.vz) > 1.6 && Math.hypot(this.moveX, this.moveZ) > 0.3;
      if (moving && top !== it) continue;
      this.take(d.id);
      if (d.type === 'pile' || d.type === 'processor') p.pickedFrom = d.id;
      p.stack.push(it);
      this.addStat(`pickup.${it}`, 1);
      this.addStat('carried', 1);
      const from: Place = d.type === 'node' ? { kind: 'ground', id: d.id } : { kind: 'station', id: d.id };
      this.emit({ type: 'pickup', item: it, from, by: PLAYER, height: p.stack.length });
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ pads

  private payPad(id: string, dt: number): void {
    const s = this.state;
    const def = this.padDefs.get(id)!;
    const ps = s.pads[id];
    if (ps.hold) return;
    const cost = this.padCost(id);
    const remaining = cost - ps.paid;
    if (remaining > 0 && s.embers > 0) {
      const b = this.data.balance;
      const rate = Math.max(b.padBaseRate, cost / b.padSecondsToFill) * (1 + b.padAccel * s.player.padTime);
      ps.acc += rate * dt;
      const n = Math.min(Math.floor(ps.acc), remaining, s.embers);
      if (n > 0) {
        ps.acc -= n;
        ps.paid += n;
        s.embers -= n;
        this.padTickT -= dt;
        if (this.padTickT <= 0) {
          this.padTickT = 0.07;
          this.emit({ type: 'padTick', pad: id, frac: ps.paid / cost });
        }
      }
    } else {
      ps.acc = 0;
    }
    this.checkPadDone(id);
  }

  private checkPadDone(id: string): void {
    const def = this.padDefs.get(id)!;
    const ps = this.state.pads[id];
    if (ps.done || ps.hold || ps.paid < this.padCost(id)) return;
    for (const k in def.materials ?? {}) {
      const kk = k as ItemKind;
      if ((ps.mats[kk] ?? 0) < (def.materials![kk] ?? 0)) return;
    }
    this.completePad(id);
  }

  completePad(id: string): void {
    const def = this.padDefs.get(id);
    if (!def) return;
    const ps = this.state.pads[id];
    if (ps.done) return;
    if (def.repeat) {
      // Repeatable upgrade: level up, reset, and wait for the player to step off before taking more.
      const lv = (ps.level ?? 0) + 1;
      ps.level = lv;
      ps.paid = 0;
      ps.mats = {};
      ps.acc = 0;
      ps.hold = true;
      this.state.player.padTime = 0;
      if (def.repeat.max !== undefined && lv >= def.repeat.max) ps.done = true;
      this.addStat('padsDone', 1);
      this.addStat('upgrades', 1);
      this.emit({ type: 'padComplete', pad: id });
      this.emit({ type: 'upgrade', pad: id, level: lv, cost: this.padCost(id), maxed: ps.done });
      for (const e of def.effects) this.applyEffect(e, lv);
      this.refreshPads(true);
      return;
    }
    ps.done = true;
    ps.paid = def.cost;
    ps.mats = { ...(def.materials ?? {}) };
    this.addStat('padsDone', 1);
    this.emit({ type: 'padComplete', pad: id });
    for (const e of def.effects) this.applyEffect(e);
    this.refreshPads(true);
  }

  /** Apply a pad effect. `level` is the pad level just reached (repeatable pads), 1 otherwise. */
  applyEffect(e: Effect, level = 1): void {
    const s = this.state;
    switch (e.type) {
      case 'unlock':
        s.unlocked[e.id] = true;
        this.invalidateSolids();
        this.emit({ type: 'unlock', id: e.id });
        this.openCrowd(e.id);
        break;
      case 'growth': {
        const bonus = (lv: number) => e.max * (1 - Math.pow(1 - e.rate, lv));
        if (e.key === 'helperCapacity' || e.key === 'pricePlus') {
          s.mods[e.key] += Math.floor(bonus(level)) - Math.floor(bonus(level - 1));
        } else {
          s.mods[e.key] *= (1 + bonus(level)) / (1 + bonus(level - 1));
        }
        break;
      }
      case 'tool': {
        const lv = (s.tools[e.tool] ?? 0) + 1;
        s.tools[e.tool] = lv;
        this.emit({ type: 'toolUpgrade', tool: e.tool, level: lv });
        break;
      }
      case 'beacon':
        setBeaconStage(this, e.stage);
        break;
      case 'grant':
        if (e.what === 'plough') s.plough.tier = Math.min(2, s.plough.tier + 1);
        else if (e.what === 'lantern') s.rescue.lantern = Math.min(2, s.rescue.lantern + 1);
        else s.skate.tier = 1;
        this.emit({ type: 'toolUpgrade', tool: e.what === 'skates' ? 'auger' : e.what === 'plough' ? 'axe' : 'kettle', level: 0 });
        break;
      case 'decorate':
        for (const id of e.ids) s.unlocked[id] = true;
        this.invalidateSolids();
        this.addStat('decorations', 1);
        this.emit({ type: 'decorate', ids: e.ids });
        break;
      case 'capacity':
        s.player.capacity = Math.min(this.data.balance.maxCapacity, s.player.capacity + e.add);
        this.emit({ type: 'capacity', capacity: s.player.capacity });
        break;
      case 'hire':
        hireHelper(this, e.helper);
        break;
      case 'hearth':
        this.setHearth(e.level);
        break;
      case 'mod':
        s.mods[e.key] = s.mods[e.key] * (e.mul ?? 1) + (e.add ?? 0);
        break;
    }
  }

  setHearth(level: number): void {
    const s = this.state;
    if (level <= s.hearth.level) return;
    s.hearth.level = level;
    this.emit({ type: 'hearthUp', level });
    for (const a of this.data.areas) {
      if (a.hearth <= level && !s.areasOpen[a.id]) {
        s.areasOpen[a.id] = true;
        this.rectCache = null;
        this.emit({ type: 'areaOpen', area: a.id });
      }
    }
    this.refreshPads(true);
  }

  /** Recompute pad visibility; emit padAppear for new ones. */
  refreshPads(emit: boolean): void {
    const s = this.state;
    for (const def of this.data.pads) {
      const ps = s.pads[def.id];
      if (ps.done) {
        ps.visible = false;
        continue;
      }
      const vis =
        def.requires.every((r) => s.pads[r]?.done) &&
        (def.requiresHearth ?? 0) <= s.hearth.level &&
        !!s.areasOpen[def.area] &&
        !this.padSpotTaken(def);
      if (vis && !ps.visible && emit) this.emit({ type: 'padAppear', pad: def.id });
      ps.visible = vis;
    }
  }

  /** Two pads can share a spot (e.g. pack upgrades); only the first unfinished shows. */
  private padSpotTaken(def: PadDef): boolean {
    for (const o of this.data.pads) {
      if (o === def) return false;
      if (o.x === def.x && o.z === def.z && !this.state.pads[o.id].done) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ stations

  private updateHearth(dt: number): void {
    const s = this.state;
    const st = s.stations['hearth'] as DepositState | undefined;
    if (!st) return;
    if (s.hearth.fuel > 0) s.hearth.fuel = Math.max(0, s.hearth.fuel - dt);
    // Take the next log in the same step the last one burns out, so Cosy does not flicker
    // off and on (and re-announce itself) every time a log is used up.
    if (s.hearth.fuel <= 0 && st.count > 0) {
      st.count--;
      s.hearth.fuel += this.data.balance.fuelPerLog;
    }
    const cosy = s.hearth.fuel > 0;
    if (cosy !== s.hearth.cosy) {
      s.hearth.cosy = cosy;
      this.emit({ type: 'cosy', on: cosy });
    }
  }

  private updateStations(dt: number): void {
    const s = this.state;
    const p = s.player;
    for (const d of this.data.stations) {
      const st = s.stations[d.id];
      if (d.type === 'pile') {
        const ps = st as PileState;
        if (!this.isActive(d.id) || (d as PileDef).refill <= 0) continue;
        if (ps.count < d.cap) {
          ps.acc += d.refill * dt;
          while (ps.acc >= 1 && ps.count < d.cap) {
            ps.acc -= 1;
            ps.count++;
          }
        } else ps.acc = 0;
      } else if (d.type === 'node') {
        const ns = st as NodeState;
        if (!ns.alive) {
          ns.regrow -= dt;
          if (ns.regrow <= 0) {
            ns.alive = true;
            this.nodeVer++;
            ns.hits = 0;
            this.emit({ type: 'nodeRegrow', node: d.id });
          }
        }
      } else if (d.type === 'processor') {
        if (!this.isActive(d.id)) continue;
        this.updateProcessor(d, st as ProcState, dt, Math.hypot(d.x - p.x, d.z - p.z) <= d.reach);
      }
    }
  }

  private updateProcessor(d: ProcessorDef, st: ProcState, dt: number, playerNear: boolean): void {
    const r = this.data.recipes[d.recipe];
    let helperOp = false;
    for (const hd of this.operatorsOf(d.id)) {
      const h = this.state.helpers[hd.id];
      if (h && h.phase === 'work') helperOp = true;
    }
    st.operated = helperOp || playerNear;
    let can = st.output + r.outputCount <= Math.max(d.outputCap, MIN_OUTPUT_CAP);
    for (const k in r.inputs) {
      const kk = k as ItemKind;
      if ((st.inputs[kk] ?? 0) < (r.inputs[kk] ?? 0)) can = false;
    }
    if (d.operator === 'required' && !st.operated) can = false;
    st.active = can;
    if (!can) return;
    let speed = (d.speedMod ? this.state.mods[d.speedMod] : 1) * procBoost(this, d.id);
    if (d.operator === 'boost' && helperOp) speed *= d.boost ?? 1.5;
    st.progress += dt * speed;
    if (st.progress >= r.time) {
      st.progress -= r.time;
      for (const k in r.inputs) {
        const kk = k as ItemKind;
        st.inputs[kk] = (st.inputs[kk] ?? 0) - (r.inputs[kk] ?? 0);
      }
      st.output += r.outputCount;
      this.addStat(`craft.${r.output}`, r.outputCount);
      this.emit({ type: 'craft', station: d.id, item: r.output, count: r.outputCount });
    }
  }

  private updateLinks(dt: number): void {
    for (const l of this.data.links) {
      if (!this.isActive(l.id)) continue;
      const ls = this.state.links[l.id];
      const gap = 1 / l.maxOnBelt;
      for (let i = 0; i < ls.belt.length; i++) {
        const limit = i === 0 ? 1 : ls.belt[i - 1].p - gap;
        ls.belt[i].p = Math.min(limit, ls.belt[i].p + dt / l.travel);
      }
      if (ls.belt.length && ls.belt[0].p >= 1 && this.room(l.to, ls.belt[0].item, true) > 0) {
        const it = ls.belt.shift()!;
        this.put(l.to, it.item);
        this.emit({ type: 'drop', item: it.item, to: { kind: 'station', id: l.to }, by: { kind: 'link', id: l.id }, height: 0 });
      }
      ls.t += dt;
      const last = ls.belt[ls.belt.length - 1];
      // The player standing at the source with room in their pack gets first pick (the belt waits).
      const fd = this.stationDefs.get(l.from);
      const pl = this.state.player;
      const playerTaking = !!fd && pl.stack.length < pl.capacity && Math.hypot(fd.x - pl.x, fd.z - pl.z) <= fd.reach
        && Math.hypot(pl.vx, pl.vz) < 0.5;
      if (!playerTaking && ls.t >= l.interval && ls.belt.length < l.maxOnBelt && (!last || last.p >= gap) && this.takeable(l.from, l.item)) {
        ls.t = 0;
        this.take(l.from);
        ls.belt.push({ item: l.item, p: 0 });
        this.emit({ type: 'pickup', item: l.item, from: { kind: 'station', id: l.from }, by: { kind: 'link', id: l.id }, height: 0 });
      }
      if (ls.t > l.interval) ls.t = l.interval;
    }
  }

  // ------------------------------------------------------------------ customers & embers (shared with agents)

  /** A crowd counter just opened: a big crowd of Icebound streams in from the storm at once. */
  private openCrowd(id: string): void {
    const c = this.stationDefs.get(id);
    if (!c || c.type !== 'counter' || !c.startCrowd || !this.state.areasOpen[c.area]) return;
    const cs = this.state.stations[id] as CounterState;
    const n = Math.min(c.startCrowd, c.queueLen - cs.queue.length);
    for (let i = 0; i < n; i++) {
      this.spawnCustomerAt(c, c.spawn.x + (this.rand() - 0.5) * 6, c.spawn.z + (this.rand() - 0.5) * 6);
    }
  }

  spawnCustomerAt(c: CounterDef, x: number, z: number): void {
    const s = this.state;
    const id = s.nextCustomerId++;
    const ang = this.rand() * Math.PI * 2;
    const rad = this.data.camp.settleMin + this.rand() * (this.data.camp.settleMax - this.data.camp.settleMin);
    const want = c.wantMin + Math.floor(this.rand() * (c.wantMax - c.wantMin + 1));
    s.customers.push({
      id, counter: c.id, x, z, px: x, pz: z, phase: 'queue', want, got: 0, t: 0, path: 0,
      settleX: this.data.camp.hearth.x + Math.cos(ang) * rad, settleZ: this.data.camp.hearth.z + Math.sin(ang) * rad,
      look: this.rand(),
    });
    (s.stations[c.id] as CounterState).queue.push(id);
    this.emit({ type: 'spawn', customer: id });
  }

  addEmbers(spot: Vec2, n: number, pileId: string): void {
    const s = this.state;
    let pile = s.emberPiles.find((e) => e.id === pileId);
    if (!pile) {
      pile = { id: pileId, x: spot.x, z: spot.z, count: 0 };
      s.emberPiles.push(pile);
    }
    pile.count += n;
    this.addStat('embersEarned', n);
    this.emit({ type: 'emberSpawn', x: spot.x, z: spot.z, n, pile: pileId });
  }

  // ------------------------------------------------------------------ quests

  private startQuest(index: number, emit: boolean): void {
    const s = this.state;
    s.quest.index = index;
    const q = this.data.quests[index];
    s.quest.id = q?.id;
    if (!q) return;
    s.quest.base = q.goal.type === 'stat' ? s.stats[q.goal.stat] ?? 0 : 0;
    if (emit) this.emit({ type: 'questStart', quest: q.id, index });
  }

  private updateQuest(): void {
    const s = this.state;
    const q = this.data.quests[s.quest.index];
    if (!q) return;
    const g = q.goal;
    let done = false;
    if (g.type === 'stat') done = (s.stats[g.stat] ?? 0) - s.quest.base >= g.n;
    else if (g.type === 'pad') done = !!s.pads[g.pad]?.done;
    else if (g.type === 'hearth') done = s.hearth.level >= g.level;
    else if (g.type === 'pop') done = s.population >= g.n;
    if (!done) return;
    if (q.reward > 0) {
      s.embers += q.reward;
      this.addStat('embersEarned', q.reward);
      this.emit({ type: 'emberSpawn', x: s.player.x, z: s.player.z, n: q.reward, pile: null });
    }
    this.emit({ type: 'questComplete', quest: q.id, reward: q.reward });
    this.startQuest(s.quest.index + 1, true);
  }

  /** Debug: complete the current quest's goal outright. */
  skipQuest(): void {
    const s = this.state;
    const q = this.data.quests[s.quest.index];
    if (!q) return;
    const g = q.goal;
    if (g.type === 'pad') this.completePad(g.pad);
    else if (g.type === 'stat') s.stats[g.stat] = s.quest.base + g.n;
    else if (g.type === 'pop') this.addPopulation(g.n - s.population);
    else if (g.type === 'hearth') this.setHearth(g.level);
    this.updateQuest();
  }

  /** Homes in the camp: base + tents + cabins (+ every rescued villager, who brings their own). */
  housingCap(): number {
    const h = this.data.camp.housing;
    if (!h) return Infinity;
    const s = this.state;
    const real = h.base + h.perTent * s.tents + h.perCabin * h.cabins.filter((c) => s.unlocked[c]).length + (s.stats.rescued ?? 0);
    return Math.max(real, s.popFloor ?? 0);
  }

  /** A thawed villager reaches the camp: stays if there is a home (a tent rises when one is allowed), else passes through. */
  welcome(): boolean {
    const s = this.state;
    const h = this.data.camp.housing;
    if (!h) {
      this.addPopulation(1);
      return true;
    }
    const allowed = Math.min(this.data.camp.tentSpots.length, h.tentsPerLevel[Math.max(0, Math.min(h.tentsPerLevel.length, s.hearth.level) - 1)]);
    if (s.population >= this.housingCap() && s.tents < allowed) {
      this.emit({ type: 'tent', index: s.tents });
      s.tents++;
      this.invalidateSolids();
    }
    if (s.population >= this.housingCap()) {
      this.addStat('passedThrough', 1);
      noteTurnedAway(this);
      return false;
    }
    s.population += 1;
    return true;
  }

  addPopulation(n: number): void {
    const s = this.state;
    if (n <= 0) return;
    s.population += n;
    if (this.data.camp.housing) return; // homes rise as villagers need them (welcome())
    const at = this.data.camp.tentAt;
    while (s.tents < at.length && s.tents < this.data.camp.tentSpots.length && s.population >= at[s.tents]) {
      this.emit({ type: 'tent', index: s.tents });
      s.tents++;
      this.invalidateSolids();
    }
  }
}

const SOLID_CELL = 4;
/** Reach covered by solidsNear: pushes (radius + up to ~1 m) and steering look-ahead (3.2 m + solid size). */
const SOLID_REACH = 6.5;
const NO_SOLIDS: Solid[] = [];
const NO_HELPERS: HelperDef[] = [];
const cellKey = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);

export function sumCounts(c: Partial<Record<ItemKind, number>> | undefined): number {
  let n = 0;
  if (c) for (const k in c) n += c[k as ItemKind] ?? 0;
  return n;
}
