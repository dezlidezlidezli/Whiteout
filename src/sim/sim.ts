// Deterministic game simulation. Pure TypeScript: no three.js, no DOM, no Date/Math.random.

import type {
  CounterDef, DepositDef, Effect, GameData, ItemKind, LinkDef, NodeDef, PadDef, PileDef, ProcessorDef, Rect, Solid,
  StationDef, Vec2,
} from '../data/types';
import { moveCircle, navNext, pushOut } from './collision';
import { NavGrid } from './navgrid';
import type { Actor, Place, SimEvent } from './events';
import { updateCustomers, updateHelpers, hireHelper } from './agents';
import { computeGuide, type GuideTarget } from './guide';
import { deliverOrder, orderRoom, updateTotals } from './endless';
import { finaleWarmRadius, setBeaconStage, updateFinale } from './finale';
import { migrate } from './save';
import { nextRandom } from './rng';
import {
  createState, normalizeState, SAVE_VERSION, type CounterState, type DepositState, type NodeState, type PileState,
  type ProcState, type SimState, type StationState,
} from './state';

export const STEP = 1 / 60;
const MAX_EVENTS = 4000;
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
  private allSolidsCache: Solid[] | null = null;
  private allSolidsTick = -1;
  private allSolidsBase: Solid[] | null = null;
  private navSolids: Solid[] | null = null;
  private navRects: Rect[] | null = null;

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
      for (let i = 0; i < 3; i++) this.spawnCustomerAt(c, c.queueStart.x, c.queueStart.z + i * c.queueSpacing + 0.01);
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
    updateFinale(this, dt);
    updateTotals(this, dt);
    this.updateQuest();
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
    // Cached for the current tick (nodes only fall/regrow in updateInteract/updateStations; a one-step lag is harmless).
    if (this.allSolidsCache && this.allSolidsTick === this.state.tick && this.allSolidsBase === base) return this.allSolidsCache;
    const out = base.slice();
    for (const d of this.data.stations) {
      if (d.type !== 'node' || !d.solid || !('r' in d.solid)) continue;
      const st = this.state.stations[d.id] as NodeState;
      if (st.alive) out.push({ kind: 'circle', x: d.x, z: d.z, r: d.solid.r });
    }
    this.allSolidsCache = out;
    this.allSolidsTick = this.state.tick;
    this.allSolidsBase = base;
    return out;
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
        return Math.max(0, d.inputCap - ((st as ProcState).inputs[item] ?? 0));
      }
      case 'counter':
        return d.item === item ? Math.max(0, d.cap - (st as CounterState).stock) : 0;
      case 'deposit':
        if (d.role === 'orders') return byHelper ? 0 : orderRoom(this, item);
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
    const speed = b.playerSpeed * this.state.mods.moveSpeed;
    const tx = this.moveX * speed;
    const tz = this.moveZ * speed;
    const k = Math.min(1, dt * 16);
    p.vx += (tx - p.vx) * k;
    p.vz += (tz - p.vz) * k;
    if (Math.abs(p.vx) < 1e-3 && Math.abs(p.vz) < 1e-3) {
      p.vx = 0;
      p.vz = 0;
    }
    if (p.vx !== 0 || p.vz !== 0) {
      moveCircle(p, p.vx * dt, p.vz * dt, b.playerRadius, this.allSolids(), this.walkRects());
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
      if (p.stack.length < p.capacity || st.ground < best.groundCap) {
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

    // Item transfers at a fixed cadence.
    if (p.transferCd > 0) p.transferCd -= dt;
    if (p.transferCd <= 0) {
      const acted = this.playerDrop() || this.playerPick();
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
      st.hits = 0;
      st.work = 0;
      st.regrow = def.regrow;
      this.emit({ type: 'nodeDeplete', node: def.id });
    }
  }

  private stationsInReach(): StationDef[] {
    const p = this.state.player;
    const out: { d: StationDef; dist: number }[] = [];
    for (const d of this.data.stations) {
      if (d.type === 'node') {
        const st = this.state.stations[d.id] as NodeState;
        if (st.ground <= 0) continue;
      }
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      if (dist > d.reach) continue;
      if (!this.isUsable(d.id)) continue;
      out.push({ d, dist });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out.map((o) => o.d);
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
    for (const d of inReach) {
      for (let i = p.stack.length - 1; i >= 0; i--) {
        const it = p.stack[i];
        if (this.room(d.id, it) > 0) {
          p.stack.splice(i, 1);
          this.put(d.id, it);
          this.emit({ type: 'drop', item: it, to: { kind: 'station', id: d.id }, by: PLAYER, height: i });
          return true;
        }
      }
    }
    // Hand items back to their crate: standing still with a full pack (then keep going until done).
    const still = Math.hypot(this.moveX, this.moveZ) < 0.2;
    for (const d of inReach) {
      if (d.type !== 'pile') continue;
      const ps = this.state.stations[d.id] as PileState;
      // Accepting piles (racks, woodpile) take a full pack back even past their cap, so a pack is never stuck full.
      if (ps.count >= d.cap + (d.accepts ? p.capacity : 0)) continue;
      if (p.returning !== d.id && !(still && p.stack.length >= p.capacity && p.pickedFrom !== d.id)) continue;
      const i = p.stack.lastIndexOf(d.item);
      if (i < 0) continue;
      p.stack.splice(i, 1);
      ps.count++;
      p.returning = d.id;
      this.emit({ type: 'drop', item: d.item, to: { kind: 'station', id: d.id }, by: PLAYER, height: i });
      return true;
    }
    return false;
  }

  private playerPick(): boolean {
    const p = this.state.player;
    if (p.stack.length >= p.capacity) return false;
    for (const d of this.stationsInReach()) {
      if (d.id === p.returning) continue;
      const it = this.takeable(d.id);
      if (!it) continue;
      // Walking past a station only tops up the item already on top; pause to start a new kind.
      const top = p.stack[p.stack.length - 1];
      const moving = Math.hypot(p.vx, p.vz) > 1.6 && Math.hypot(this.moveX, this.moveZ) > 0.3;
      if (moving && top !== it) continue;
      this.take(d.id);
      if (d.type === 'pile') p.pickedFrom = d.id;
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
    if (s.hearth.fuel <= 0 && st.count > 0) {
      st.count--;
      s.hearth.fuel += this.data.balance.fuelPerLog;
    }
    if (s.hearth.fuel > 0) s.hearth.fuel = Math.max(0, s.hearth.fuel - dt);
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
    for (const id in this.state.helpers) {
      const hd = this.data.helpers.find((h) => h.id === id);
      const h = this.state.helpers[id];
      if (hd && hd.role === 'operate' && hd.station === d.id && h.phase === 'work') helperOp = true;
    }
    st.operated = helperOp || playerNear;
    let can = st.output + r.outputCount <= d.outputCap;
    for (const k in r.inputs) {
      const kk = k as ItemKind;
      if ((st.inputs[kk] ?? 0) < (r.inputs[kk] ?? 0)) can = false;
    }
    if (d.operator === 'required' && !st.operated) can = false;
    st.active = can;
    if (!can) return;
    let speed = d.speedMod ? this.state.mods[d.speedMod] : 1;
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

  addPopulation(n: number): void {
    const s = this.state;
    if (n <= 0) return;
    s.population += n;
    const at = this.data.camp.tentAt;
    while (s.tents < at.length && s.tents < this.data.camp.tentSpots.length && s.population >= at[s.tents]) {
      this.emit({ type: 'tent', index: s.tents });
      s.tents++;
      this.invalidateSolids();
    }
  }
}

export function sumCounts(c: Partial<Record<ItemKind, number>> | undefined): number {
  let n = 0;
  if (c) for (const k in c) n += c[k as ItemKind] ?? 0;
  return n;
}
