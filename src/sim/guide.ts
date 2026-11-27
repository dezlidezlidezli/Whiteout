// Guidance: where the ground arrow points for the current quest. Also drives the autopilot bot,
// so "the arrow always leads somewhere useful" is tested headlessly.

import type { CounterDef, ItemKind, NodeDef, PadDef, ProcessorDef, StationDef } from '../data/types';
import { crankActive } from './crank';
import { orderRoom } from './endless';
import { beaconReady, flameSources, nextTrail } from './flame';
import { deepSnowZones, forEachDeepCell } from './plough';
import { diggable, glowRadius } from './rescue';
import type { Sim } from './sim';
import type { CounterState, NodeState, ProcState } from './state';

export interface GuideTarget {
  x: number;
  z: number;
  id: string;
  /** 'spot' = a point that is not an object (a ring position, a cell to plough, a step aside). */
  kind: 'station' | 'pad' | 'node' | 'embers' | 'spot';
  /** How close counts as "there" (metres from x/z). */
  reach: number;
}

type Dest = GuideTarget;

export function computeGuide(sim: Sim): GuideTarget | null {
  const s = sim.state;
  const memo = s.guideMemo;
  if (memo && !s.player.stack.includes(memo)) s.guideMemo = null;
  const q = sim.data.quests[s.quest.index];
  if (!q) return null;
  const g = q.guide ?? (q.goal.type === 'pad' ? undefined : { type: 'earn' as const });
  // Holding the flame when the goal doesn't need it (both hands are busy): set it down at the nearest source.
  const needsFlame = g?.type === 'flame' || ((g?.type === 'orders' || g?.type === 'openSeason') && s.orders.some((o) => o.festival));
  if (s.flame.held && !needsFlame) {
    const src = flameSources(sim).reduce((a, b) => (dist(sim, b.x, b.z) < dist(sim, a.x, a.z) ? b : a));
    return spot(src.x, src.z, `flame:${src.id}`, src.id === 'hearth' ? 1.9 : 0.9);
  }
  const wanted = wantedItems(sim, q.goal.type === 'pad' && !q.guide ? { pad: q.goal.pad } : g);
  // Carrying goods an Open Season order wants: hand those in first (that frees the pack) instead of unloading junk.
  const handIn = (g?.type === 'orders' || g?.type === 'openSeason') && s.player.stack.some((it) => orderRoom(sim, it) > 0);
  const junk = handIn ? null : unloadJunk(sim, wanted);
  if (junk) return junk;
  const t = q.goal.type === 'pad' && !q.guide ? padGuide(sim, q.goal.pad) : g ? baseGuide(sim, g) : null;
  // Never lead a full pack to a station that can neither take nor give anything: make room somewhere first.
  if (t && t.kind === 'station' && full(sim) && !s.player.stack.some((it) => sim.room(t.id, it) > 0)) {
    const j = unloadJunk(sim, new Set(), true);
    if (j && j.id !== t.id) return j;
  }
  if (t) return t;
  // Nothing useful to do with what we hold: hand anything in anywhere.
  if (s.player.stack.length > 0) return unloadJunk(sim, new Set(), true);
  return null;
}

function baseGuide(sim: Sim, g: import('../data/types').QuestGuide): GuideTarget | null {
  switch (g.type) {
    case 'station': {
      const d = sim.stationDefs.get(g.id);
      return d ? stTarget(d) : null;
    }
    case 'deliver': {
      const dest = nearestDest(sim, g.item, g.to);
      return dest ? deliver(sim, g.item, dest) : null;
    }
    case 'produce':
      return source(sim, g.item, 0) ?? null;
    case 'harvest':
      return nearestNode(sim, (n) => n.tag === g.tag);
    case 'earn':
      return earn(sim);
    case 'pad':
      return padGuide(sim, g.pad);
    case 'orders':
      return ordersGuide(sim) ?? earn(sim);
    case 'openSeason':
      return openSeasonGuide(sim);
    case 'plough':
      return ploughGuide(sim, g.zone);
    case 'rescue':
      return rescueGuide(sim);
    case 'skate':
      return skateGuide(sim);
    case 'crank':
      return crankGuide(sim, g.id);
    case 'flame':
      return flameGuide(sim, g.target);
    default:
      return null;
  }
}

// ------------------------------------------------------------------ Open Season

/** Carry what a caravan order wants to the notice board. */
function ordersGuide(sim: Sim): GuideTarget | null {
  const s = sim.state;
  const board = sim.stationDefs.get(sim.data.endless.board);
  // Lantern Festival: carry a flame round the festival lamps (when the hands are free, or already holding it).
  if (s.orders.some((o) => o.festival) && (s.flame.held || s.player.stack.length === 0 || s.orders.every((o) => o.festival))) {
    const f = flameGuide(sim, 'festival');
    if (f) return f;
  }
  const open = s.orders.filter((o) => o.got < o.n && !o.festival);
  if (!board || open.length === 0) return null;
  const dest = stTarget(board);
  for (const o of open) if (carrying(sim, o.item) > 0) return deliver(sim, o.item, dest);
  // Pick the order whose goods are quickest to get: already stocked somewhere beats cooking/harvesting.
  let best = open[0];
  let bs = Infinity;
  for (const o of open) {
    let stocked = false;
    for (const d of sim.data.stations) if (sim.isUsable(d.id) && d.id !== board.id && sim.takeable(d.id, o.item)) stocked = true;
    const score = (stocked ? 0 : 10) + (o.n - o.got) * 0.05;
    if (score < bs) {
      bs = score;
      best = o;
    }
  }
  return deliver(sim, best.item, dest);
}

/** Endless loop: buy any affordable upgrade or decoration, otherwise fill orders. */
function openSeasonGuide(sim: Sim): GuideTarget | null {
  const s = sim.state;
  let pick: PadDef | null = null;
  let pc = Infinity;
  for (const def of sim.data.pads) {
    if (!def.group) continue;
    const ps = s.pads[def.id];
    if (!ps.visible || ps.done || ps.hold || sim.padLocked(def.id)) continue;
    const rem = sim.padRemaining(def.id);
    if (Object.keys(rem.mats).length > 0 || rem.embers > s.embers) continue;
    if (rem.embers < pc) {
      pc = rem.embers;
      pick = def;
    }
  }
  if (pick) return { x: pick.x, z: pick.z, id: pick.id, kind: 'pad', reach: 0.5 };
  // Embers lying in piles would buy the next upgrade: go and scoop the best pile first.
  let cheapest = Infinity;
  for (const def of sim.data.pads) {
    if (!def.group) continue;
    const ps = s.pads[def.id];
    if (ps.visible && !ps.done && Object.keys(sim.padRemaining(def.id).mats).length === 0) cheapest = Math.min(cheapest, sim.padRemaining(def.id).embers);
  }
  let lying = 0;
  for (const e of s.emberPiles) lying += e.count;
  if (cheapest < Infinity && s.embers < cheapest && s.embers + lying >= cheapest) {
    let best: (typeof s.emberPiles)[number] | null = null;
    let bv = 0;
    for (const e of s.emberPiles) {
      const v = e.count / (dist(sim, e.x, e.z) + 12);
      if (e.count >= 6 && v > bv) {
        bv = v;
        best = e;
      }
    }
    if (best) return { x: best.x, z: best.z, id: best.id, kind: 'embers', reach: 1.2 };
  }
  return ordersGuide(sim) ?? earn(sim);
}

/** Item kinds useful for the current goal (incl. upstream ingredients). null = anything goes. */
function wantedItems(sim: Sim, g: import('../data/types').QuestGuide | { pad: string } | undefined): Set<ItemKind> | null {
  const out = new Set<ItemKind>();
  consumers.clear();
  finalWanted.clear();
  const addUp = (it: ItemKind, depth: number) => {
    if (depth === 0) finalWanted.add(it);
    if (out.has(it) || depth > 4) return;
    out.add(it);
    for (const d of producersOf(sim, it)) {
      {
        for (const k in sim.data.recipes[d.recipe].inputs) {
          const kk = k as ItemKind;
          if (!consumers.has(kk)) consumers.set(kk, []);
          consumers.get(kk)!.push(d.id);
          addUp(kk, depth + 1);
        }
      }
    }
  };
  if (!g) return earnItems(sim, addUp, out);
  if ('pad' in g) {
    const def = sim.padDefs.get(g.pad);
    const rem = def ? sim.padRemaining(def.id).mats : {};
    if (Object.keys(rem).length > 0) {
      for (const k in rem) addUp(k as ItemKind, 0);
      return out;
    }
    return earnItems(sim, addUp, out);
  }
  switch (g.type) {
    case 'deliver':
    case 'produce':
      addUp(g.item, 0);
      return out;
    case 'harvest':
      for (const d of sim.data.stations) if (d.type === 'node' && d.tag === g.tag) addUp(d.item, 0);
      return out;
    case 'plough':
    case 'rescue':
    case 'skate':
    case 'crank':
    case 'flame':
      return null;
    case 'orders':
    case 'openSeason':
      if (sim.state.orders.length === 0) return earnItems(sim, addUp, out);
      for (const o of sim.state.orders) addUp(o.item, 0);
      return out;
    default:
      return earnItems(sim, addUp, out);
  }
}

function earnItems(sim: Sim, addUp: (it: ItemKind, d: number) => void, out: Set<ItemKind>): Set<ItemKind> {
  for (const d of sim.data.stations) if (d.type === 'counter' && sim.isUsable(d.id)) addUp(d.item, 0);
  if (sim.isUsable('hearth')) {
    out.add('log');
    if (sim.room('hearth', 'log', true) > 0) finalWanted.add('log');
  }
  return out;
}

const producerCache = new WeakMap<object, Map<ItemKind, ProcessorDef[]>>();

/** Processors whose recipe outputs `item` (static per data bundle). */
function producersOf(sim: Sim, item: ItemKind): ProcessorDef[] {
  let m = producerCache.get(sim.data);
  if (!m) {
    m = new Map();
    for (const d of sim.data.stations) {
      if (d.type !== 'processor') continue;
      const out = sim.data.recipes[d.recipe].output;
      if (!m.has(out)) m.set(out, []);
      m.get(out)!.push(d);
    }
    producerCache.set(sim.data, m);
  }
  return m.get(item) ?? [];
}

/** Ingredient → processors on the current goal's chain that consume it (filled by wantedItems). */
const consumers = new Map<ItemKind, string[]>();

/** Wanted, and (for an ingredient) some processor on the goal's chain still has room for it. */
function useful(sim: Sim, wanted: Set<ItemKind>, it: ItemKind): boolean {
  if (!wanted.has(it)) return false;
  const cs = consumers.get(it);
  if (!cs || cs.length === 0) return true;
  // A final item of the goal (e.g. the dish itself) stays useful even if it is also an ingredient elsewhere.
  if (finalWanted.has(it)) return true;
  return cs.some((id) => sim.isUsable(id) && sim.room(id, it, true) > 0);
}
const finalWanted = new Set<ItemKind>();

/** When the stack is full of things the goal can't use, go hand them in somewhere first. */
function unloadJunk(sim: Sim, wanted: Set<ItemKind> | null, force = false): GuideTarget | null {
  const s = sim.state;
  const p = s.player;
  if (!wanted || (!full(sim) && !s.guideUnload && !force)) {
    s.guideUnload = false;
    return null;
  }
  for (let i = p.stack.length - 1; i >= 0; i--) {
    const it = p.stack[i];
    if (useful(sim, wanted, it)) continue;
    const ids = sim.data.stations.filter((d) => d.type !== 'pile' && d.type !== 'node').map((d) => d.id);
    const dest = nearestDest(sim, it, ids);
    if (dest && sim.room(dest.id, it) > 0) {
      s.guideUnload = true;
      return dest;
    }
    // Nothing takes it: hand it back (uncapped) to a pile or processor output holding its kind. Hand-back
    // only works with a full pack (or once started), so only lead there then.
    if (!full(sim) && !p.returning) continue;
    let back: StationDef | null = null;
    let bd = Infinity;
    for (const d of sim.data.stations) {
      if (!sim.isUsable(d.id)) continue;
      const kind = d.type === 'pile' ? d.item : d.type === 'processor' ? sim.data.recipes[d.recipe].output : null;
      if (kind !== it) continue;
      // Avoid a processor that would swallow useful items we carry first (e.g. logs into the sawmill).
      const swallows = d.type === 'processor' && p.stack.some((x) => x !== it && useful(sim, wanted, x) && sim.room(d.id, x) > 0);
      const dd = p.returning === d.id ? -1 : dist(sim, d.x, d.z) + (swallows ? 1000 : 0);
      if (dd < bd) {
        bd = dd;
        back = d;
      }
    }
    if (back) {
      s.guideUnload = true;
      // Items can't go straight back where they were just taken from: step out of its zone, then return.
      if (p.pickedFrom === back.id) return leaveZone(sim, back);
      return stTarget(back);
    }
  }
  // Last resort, only when everything carried is genuinely unwanted: the nearest bin.
  if (wanted && full(sim) && p.stack.every((it) => !useful(sim, wanted, it))) {
    let bin: StationDef | null = null;
    for (const d of sim.data.stations) {
      if (d.type === 'shelf' && sim.isUsable(d.id) && (!bin || dist(sim, d.x, d.z) < dist(sim, bin.x, bin.z))) bin = d;
    }
    if (bin) {
      s.guideUnload = true;
      return stTarget(bin);
    }
  }
  s.guideUnload = false;
  return null;
}

/** A free spot just outside a station's zone, on the player's side (to leave and come back). */
function leaveZone(sim: Sim, d: StationDef): Dest {
  const p = sim.state.player;
  let dx = p.x - d.x;
  let dz = p.z - d.z;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l;
  dz /= l;
  const r = d.reach + 1.2;
  return { x: d.x + dx * r, z: d.z + dz * r, id: `leave:${d.id}`, kind: 'spot', reach: 0.5 };
}

function stTarget(d: StationDef): Dest {
  return { x: d.x, z: d.z, id: d.id, kind: d.type === 'node' ? 'node' : 'station', reach: Math.max(d.reach * 0.6, d.reach - 0.4) };
}

function dist(sim: Sim, x: number, z: number): number {
  const p = sim.state.player;
  return Math.hypot(x - p.x, z - p.z);
}

function carrying(sim: Sim, item: ItemKind): number {
  let n = 0;
  for (const it of sim.state.player.stack) if (it === item) n++;
  return n;
}

function full(sim: Sim): boolean {
  return sim.state.player.stack.length >= sim.state.player.capacity;
}

function nearestDest(sim: Sim, item: ItemKind, ids: string[]): Dest | null {
  let best: StationDef | null = null;
  let bd = Infinity;
  let anyActive: StationDef | null = null;
  for (const id of ids) {
    if (!sim.isUsable(id)) continue;
    const d = sim.stationDefs.get(id)!;
    anyActive ??= d;
    if (sim.room(id, item) <= 0) continue;
    // Counters: prefer the one with customers waiting.
    let pen = 0;
    if (d.type === 'counter') {
      const cs = sim.state.stations[id] as CounterState;
      pen = cs.queue.length === 0 ? 8 : 0;
      pen += cs.stock * 0.6;
    }
    const dd = dist(sim, d.x, d.z) + pen;
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  const d = best ?? anyActive;
  return d ? stTarget(d) : null;
}

/** Is there something to pick up for `item` right now (or are we mid-harvest/cook at one)? */
function sourceAvailable(sim: Sim, item: ItemKind): boolean {
  const p = sim.state.player;
  for (const d of sim.data.stations) {
    if (!sim.isUsable(d.id)) continue;
    if (sim.takeable(d.id, item)) return true;
    const near = Math.hypot(d.x - p.x, d.z - p.z) <= d.reach;
    if (!near) continue;
    if (d.type === 'node' && d.item === item && (sim.state.stations[d.id] as NodeState).alive) return true;
    if (d.type === 'processor' && sim.data.recipes[d.recipe].output === item && (sim.state.stations[d.id] as ProcState).active) return true;
  }
  return false;
}

/** Carry `item` to `dest`, fetching it first if needed. */
function deliver(sim: Sim, item: ItemKind, dest: Dest): GuideTarget | null {
  const s = sim.state;
  const have = carrying(sim, item);
  if (have > 0 && s.guideMemo === item) return dest;
  if (have > 0 && (full(sim) || !sourceAvailable(sim, item))) {
    s.guideMemo = item;
    return dest;
  }
  let src = source(sim, item, 0);
  // A full pack can't pick anything up: only follow the source chain to a station that takes what we carry.
  if (src && full(sim) && !s.player.stack.some((it) => sim.room(src!.id, it) > 0)) src = null;
  if (src) return src;
  return have > 0 ? dest : null;
}

/** Where to go to obtain `item`. With `near` (the processor it is for), prefer sources close to that processor. */
function source(sim: Sim, item: ItemKind, depth: number, near?: { x: number; z: number }): GuideTarget | null {
  if (depth > 4) return null;
  const cost = (x: number, z: number) => (near ? Math.hypot(x - near.x, z - near.z) + 0.5 * dist(sim, x, z) : dist(sim, x, z));
  // 1. Anything stocked.
  let best: Dest | null = null;
  let bd = Infinity;
  for (const d of sim.data.stations) {
    if (!sim.isUsable(d.id) || !sim.takeable(d.id, item)) continue;
    const dd = cost(d.x, d.z);
    if (dd < bd) {
      bd = dd;
      best = stTarget(d);
    }
  }
  // For a processor's ingredient, harvesting right by the processor beats fetching stock from across the map.
  if (near && best && best.kind !== 'node') {
    const n = nearestNode(sim, (nd) => nd.item === item, near);
    if (n && cost(n.x, n.z) + 4 < bd) return n;
  }
  // Prefer working the node we're standing at over walking to a far ground pile.
  if (best && best.kind !== 'node') return best;
  // 2. A processor that makes it.
  const producers = producersOf(sim, item).filter((d) => sim.isUsable(d.id));
  producers.sort((a, b) => dist(sim, a.x, a.z) - dist(sim, b.x, b.z));
  for (const pd of producers) {
    const st = sim.state.stations[pd.id] as ProcState;
    const r = sim.data.recipes[pd.recipe];
    const missing: ItemKind[] = [];
    for (const k in r.inputs) {
      const kk = k as ItemKind;
      if ((st.inputs[kk] ?? 0) < (r.inputs[kk] ?? 0)) missing.push(kk);
    }
    if (missing.length === 0) return stTarget(pd); // cooking: wait here
    for (const m of missing) {
      // Bring it once we carry as much as the processor can take (or can't get more): no over-fetching.
      const c = carrying(sim, m);
      // Once committed to bringing it, keep going (a source flickering back into stock must not turn us round).
      if (c > 0 && sim.state.guideMemo === m) return stTarget(pd);
      if (c > 0 && (c >= sim.room(pd.id, m, true) || full(sim) || !sourceAvailable(sim, m))) {
        sim.state.guideMemo = m;
        return stTarget(pd);
      }
    }
    for (const m of missing) {
      const sub = full(sim) ? null : source(sim, m, depth + 1, pd);
      if (sub) return sub;
    }
  }
  if (best) return best;
  // 3. Harvest it.
  return nearestNode(sim, (n) => n.item === item, near);
}

function nearestNode(sim: Sim, pred: (n: NodeDef) => boolean, near?: { x: number; z: number }): GuideTarget | null {
  let best: NodeDef | null = null;
  let bd = Infinity;
  const p = sim.state.player;
  for (const d of sim.data.stations) {
    if (d.type !== 'node' || !pred(d) || !sim.isUsable(d.id)) continue;
    const st = sim.state.stations[d.id] as NodeState;
    if (!st.alive && st.ground <= 0) continue;
    // A full pack can only work a node that still has room to spill onto the ground.
    if (full(sim) && st.ground >= d.groundCap) continue;
    // Stick with the tree we're chopping.
    const dp = Math.hypot(d.x - p.x, d.z - p.z);
    const dd = (near ? Math.hypot(d.x - near.x, d.z - near.z) + 0.5 * dp : dp) - (p.working === d.id ? 3 : 0);
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  return best ? stTarget(best) : null;
}

function padGuide(sim: Sim, padId: string): GuideTarget | null {
  const def = sim.padDefs.get(padId) as PadDef;
  const ps = sim.state.pads[padId];
  const here: Dest = { x: def.x, z: def.z, id: def.id, kind: 'pad', reach: 0.5 };
  if (!ps || ps.done) return null;
  if (!ps.visible || sim.padLocked(padId)) return earn(sim);
  const rem = sim.padRemaining(padId);
  // Materials: bring them.
  for (const k in rem.mats) {
    const m = k as ItemKind;
    if ((rem.mats[m] ?? 0) <= 0) continue;
    if (carrying(sim, m) > 0) {
      // Fill up first if a source is right here and we have room.
      if (!full(sim) && carrying(sim, m) < (rem.mats[m] ?? 0) && sim.state.guideMemo !== m && sourceAvailable(sim, m)) {
        const src = source(sim, m, 0);
        if (src && dist(sim, src.x, src.z) < 3) return src;
      }
      sim.state.guideMemo = m;
      return here;
    }
  }
  for (const k in rem.mats) {
    const m = k as ItemKind;
    if ((rem.mats[m] ?? 0) <= 0) continue;
    const src = source(sim, m, 0);
    if (src) return src;
  }
  // Embers: go pay once we have a useful amount (or we're already on it).
  if (rem.embers > 0) {
    const need = Math.min(rem.embers, Math.max(12, Math.ceil(rem.embers * 0.45)));
    if (sim.state.embers < need && sim.state.player.onPad !== padId) return earn(sim);
    if (sim.state.embers <= 0) return earn(sim);
  }
  return here;
}

/** The best way to make embers right now. */
function earn(sim: Sim): GuideTarget | null {
  const s = sim.state;
  // Big ember piles lying around: scoop them.
  // Pick the pile worth the walk (big piles far away, small ones only when close).
  let pile: (typeof s.emberPiles)[number] | null = null;
  let ps = 0;
  for (const e of s.emberPiles) {
    if (e.count < 6) continue;
    const v = e.count / (dist(sim, e.x, e.z) + 12);
    if (v > ps) {
      ps = v;
      pile = e;
    }
  }
  if (pile) return { x: pile.x, z: pile.z, id: pile.id, kind: 'embers', reach: 1.2 };
  // Serve the busiest counter's dish.
  let best: CounterDef | null = null;
  let bq = -Infinity;
  for (const d of sim.data.stations) {
    if (d.type !== 'counter' || !sim.isUsable(d.id)) continue;
    const cs = s.stations[d.id] as CounterState;
    const score = cs.queue.length - cs.stock * 0.5;
    if (score > bq) {
      bq = score;
      best = d;
    }
  }
  // Keep the Hearth fed (Cosy doubles every bowl): unload carried logs, or fetch some when low.
  if (sim.isUsable('hearth') && sim.room('hearth', 'log', true) > 0) {
    const hd = sim.stationDefs.get('hearth')!;
    if (carrying(sim, 'log') > 0 && carrying(sim, 'log') >= sim.room('hearth', 'log', true)) {
      s.guideMemo = 'log';
      return stTarget(hd);
    }
    if (carrying(sim, 'log') > 0) return deliver(sim, 'log', stTarget(hd));
    const logSource = sim.data.stations.some((d) => d.type === 'node' && d.item === 'log' && sim.isUsable(d.id));
    if (logSource && sim.fuelFraction() < 0.25 && !s.player.stack.some((it) => it !== 'log')) {
      return deliver(sim, 'log', stTarget(hd));
    }
  }
  if (!best) return null;
  const counters = sim.data.stations.filter((d) => d.type === 'counter' && (d as CounterDef).item === best!.item).map((d) => d.id);
  const dest = nearestDest(sim, best.item, counters);
  if (!dest) return null;
  return deliver(sim, best.item, dest);
}

// ------------------------------------------------------------------ signature mechanics

const spot = (x: number, z: number, id: string, reach: number): GuideTarget => ({ x, z, id, kind: 'spot', reach });

/** Plough: the nearest still-deep cell of the zone (the swath clears around the player). */
function ploughGuide(sim: Sim, zone: string): GuideTarget | null {
  if (sim.state.plough.tier <= 0) return padGuide(sim, 'pad_plough');
  const z = deepSnowZones(sim).find((d) => d.id === zone);
  if (!z || !z.open || z.cleared >= z.total) return earn(sim);
  let best: GuideTarget | null = null;
  let bd = Infinity;
  forEachDeepCell(sim, zone, (x, cz) => {
    const d = dist(sim, x, cz);
    if (d < bd) {
      bd = d;
      best = spot(x, cz, `snow:${zone}`, 0.3);
    }
  });
  return best ?? earn(sim);
}

/** Warmth to lead followers into: the Hearth's warm radius, or a lit brazier. */
function nearestWarmth(sim: Sim): GuideTarget {
  const h = sim.data.camp.hearth;
  let best = spot(h.x, h.z, 'warm:hearth', Math.max(1.5, sim.warmRadius() - 4));
  let bd = dist(sim, h.x, h.z) - best.reach;
  const st = sim.state.flame;
  for (const b of sim.data.mech.braziers) {
    if (!st.lit[b.id] || !sim.state.areasOpen[b.area]) continue;
    const d = dist(sim, b.x, b.z) - 1.2;
    if (d < bd) {
      bd = d;
      best = spot(b.x, b.z, `warm:${b.id}`, 1.2);
    }
  }
  return best;
}

/** Rescue: dig out the nearest lost villager, lead the conga line into warmth, fetch anyone left waiting. */
function rescueGuide(sim: Sim): GuideTarget | null {
  const r = sim.state.rescue;
  if (r.lantern <= 0) return padGuide(sim, 'pad_lantern');
  if (r.followers.length > 0) return nearestWarmth(sim);
  let best: GuideTarget | null = null;
  let bd = Infinity;
  for (const id in r.status) {
    if (r.status[id] !== 'waiting') continue;
    const q = r.pos[id];
    const d = dist(sim, q.x, q.z);
    if (d < bd) {
      bd = d;
      best = spot(q.x, q.z, `lost:${id}`, glowRadius(sim) * 0.5);
    }
  }
  if (best) return best;
  for (const v of sim.data.mech.villagers) {
    if (!diggable(sim, v)) continue;
    const d = dist(sim, v.x, v.z);
    if (d < bd) {
      bd = d;
      best = spot(v.x, v.z, `lost:${v.id}`, 0.8);
    }
  }
  if (best) return best;
  // Some are still under deep snow: plough them out.
  for (const z of deepSnowZones(sim)) if (z.open && z.cleared < z.total) return ploughGuide(sim, z.id);
  return earn(sim);
}

/** Skate: chase a fish leap, else build speed along the open ice lane. */
function skateGuide(sim: Sim): GuideTarget | null {
  const st = sim.state.skate;
  let best: GuideTarget | null = null;
  let bd = Infinity;
  for (const l of st.leaps) {
    const d = dist(sim, l.x, l.z);
    if (d < bd) {
      bd = d;
      best = spot(l.x, l.z, `leap:${l.id}`, 0.4);
    }
  }
  if (best) return best;
  // Glide end to end along the lane: keep heading the way we're going, turn round near an end.
  const lane = sim.data.mech.skateLane;
  const p = sim.state.player;
  const a = lane[0];
  const b = lane[1];
  const da = dist(sim, a.x, a.z);
  const db = dist(sim, b.x, b.z);
  let toA = da > db;
  if (Math.hypot(p.vx, p.vz) > 1 && da > 1.5 && db > 1.5) toA = (a.x - p.x) * p.vx + (a.z - p.z) * p.vz > 0;
  return toA ? spot(a.x, a.z, 'ice:a', 0.8) : spot(b.x, b.z, 'ice:b', 0.8);
}

/** Crank: step onto the ring, then keep walking round it. */
function crankGuide(sim: Sim, id: string): GuideTarget | null {
  const c = sim.data.mech.cranks.find((k) => k.id === id);
  if (!c) return null;
  if (!crankActive(sim, c)) return padGuide(sim, c.use === 'bellows' ? 'pad_bellows' : 'pad_mineLift');
  const p = sim.state.player;
  const R = (c.inner + c.outer) / 2;
  const a = Math.atan2(p.z - c.z, p.x - c.x);
  const d = Math.hypot(p.x - c.x, p.z - c.z);
  if (d < c.inner + 0.15 || d > c.outer - 0.15) return spot(c.x + Math.cos(a) * R, c.z + Math.sin(a) * R, `ring:${id}`, 0.3);
  return spot(c.x + Math.cos(a + 0.9) * R, c.z + Math.sin(a + 0.9) * R, `ring:${id}`, 0.2);
}

/** Empty the hands (the flame needs both): put each item where it is used, on a pad that needs it, back where
 * it came from (with a full pack), and only for things nothing wants right now, in the bin. */
function emptyHands(sim: Sim): GuideTarget | null {
  const p = sim.state.player;
  // Go where the most of the pack can be put down (nearer wins ties), so a stray item picked up on
  // the way does not flip the target back and forth.
  const counts = new Map<ItemKind, number>();
  for (const it of p.stack) counts.set(it, (counts.get(it) ?? 0) + 1);
  let pick: GuideTarget | null = null;
  let ps = -Infinity;
  const consider = (t: GuideTarget, n: number, x: number, z: number) => {
    const sc = n / (1 + dist(sim, x, z) / 25);
    if (sc > ps + 1e-9) {
      ps = sc;
      pick = t;
    }
  };
  for (const [it, n] of counts) {
    let best: StationDef | null = null;
    let bd = Infinity;
    for (const d of sim.data.stations) {
      if (!sim.isUsable(d.id) || d.type === 'pile' || d.type === 'node' || d.type === 'shelf' || sim.room(d.id, it) <= 0) continue;
      const dd = dist(sim, d.x, d.z);
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    if (best) consider(stTarget(best), n, best.x, best.z);
    for (const def of sim.data.pads) {
      const st = sim.state.pads[def.id];
      const need = sim.padRemaining(def.id).mats[it] ?? 0;
      if (!st.visible || st.done || sim.padLocked(def.id) || need <= 0) continue;
      consider({ x: def.x, z: def.z, id: def.id, kind: 'pad', reach: 0.5 }, Math.min(n, need), def.x, def.z);
    }
  }
  if (pick) return pick;
  if (full(sim)) {
    const j = unloadJunk(sim, new Set(), true);
    if (j) return j;
  }
  let bin: StationDef | null = null;
  for (const d of sim.data.stations) if (d.type === 'shelf' && sim.isUsable(d.id) && (!bin || dist(sim, d.x, d.z) < dist(sim, bin.x, bin.z))) bin = d;
  return bin ? stTarget(bin) : null;
}

/** Carry the flame: take it up at the source nearest the goal, restore it when low, light the next target. */
function flameGuide(sim: Sim, target: 'trail' | 'beacon' | 'festival'): GuideTarget | null {
  const st = sim.state.flame;
  const m = sim.data.mech;
  let goal: { x: number; z: number; id: string; reach: number } | null = null;
  if (target === 'beacon' && beaconReady(sim)) goal = { x: m.beacon.x, z: m.beacon.z, id: 'beacon', reach: m.beacon.reach - 0.6 };
  else if (target === 'festival') {
    let bd = Infinity;
    for (const l of m.festivalLamps) {
      if (st.lamps[l.id]) continue;
      const d = dist(sim, l.x, l.z);
      if (d < bd) {
        bd = d;
        goal = { x: l.x, z: l.z, id: l.id, reach: 0.8 };
      }
    }
  }
  if (!goal) {
    const n = nextTrail(sim);
    if (n && sim.state.areasOpen[n.area]) goal = { x: n.x, z: n.z, id: n.id, reach: 0.9 };
  }
  if (!goal) return target === 'beacon' ? null : earn(sim);
  const srcs = flameSources(sim);
  const nearGoal = (g: { x: number; z: number }) => srcs.reduce((a, b) => (Math.hypot(b.x - g.x, b.z - g.z) < Math.hypot(a.x - g.x, a.z - g.z) ? b : a));
  const toSource = (s: { id: string; x: number; z: number }) => spot(s.x, s.z, `flame:${s.id}`, s.id === 'hearth' ? 1.9 : 0.9);
  if (!st.held) {
    if (sim.state.player.stack.length > 0) return emptyHands(sim) ?? earn(sim);
    return toSource(nearGoal(goal));
  }
  // Holding it: will it last to the goal? If not, restore at the nearest source first.
  const budget = st.level * m.flameLife * sim.data.balance.playerSpeed * 0.7;
  if (dist(sim, goal.x, goal.z) > budget) {
    const s = srcs.reduce((a, b) => (dist(sim, b.x, b.z) < dist(sim, a.x, a.z) ? b : a));
    if (dist(sim, s.x, s.z) > 2.0) return toSource(s);
  }
  return spot(goal.x, goal.z, `light:${goal.id}`, goal.reach);
}
