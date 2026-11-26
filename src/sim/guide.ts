// Guidance: where the ground arrow points for the current quest. Also drives the autopilot bot,
// so "the arrow always leads somewhere useful" is tested headlessly.

import type { CounterDef, ItemKind, NodeDef, PadDef, ProcessorDef, StationDef } from '../data/types';
import type { Sim } from './sim';
import type { CounterState, NodeState, ProcState } from './state';

export interface GuideTarget {
  x: number;
  z: number;
  id: string;
  kind: 'station' | 'pad' | 'node' | 'embers';
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
  const junk = unloadJunk(sim, wantedItems(sim, q.goal.type === 'pad' && !q.guide ? { pad: q.goal.pad } : g));
  if (junk) return junk;
  const t = q.goal.type === 'pad' && !q.guide ? padGuide(sim, q.goal.pad) : g ? baseGuide(sim, g) : null;
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
    default:
      return null;
  }
}

/** Item kinds useful for the current goal (incl. upstream ingredients). null = anything goes. */
function wantedItems(sim: Sim, g: import('../data/types').QuestGuide | { pad: string } | undefined): Set<ItemKind> | null {
  const out = new Set<ItemKind>();
  const addUp = (it: ItemKind, depth: number) => {
    if (out.has(it) || depth > 4) return;
    out.add(it);
    for (const d of sim.data.stations) {
      if (d.type === 'processor' && sim.data.recipes[d.recipe].output === it) {
        for (const k in sim.data.recipes[d.recipe].inputs) addUp(k as ItemKind, depth + 1);
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
    default:
      return earnItems(sim, addUp, out);
  }
}

function earnItems(sim: Sim, addUp: (it: ItemKind, d: number) => void, out: Set<ItemKind>): Set<ItemKind> {
  for (const d of sim.data.stations) if (d.type === 'counter' && sim.isUsable(d.id)) addUp(d.item, 0);
  if (sim.isUsable('hearth')) out.add('log');
  return out;
}

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
    if (wanted.has(it)) continue;
    const ids = sim.data.stations.filter((d) => d.type !== 'pile' && d.type !== 'node').map((d) => d.id);
    const dest = nearestDest(sim, it, ids);
    if (dest && sim.room(dest.id, it) > 0) {
      s.guideUnload = true;
      return dest;
    }
    // Nothing takes it: hand it back to a crate of its kind.
    for (const d of sim.data.stations) {
      if (d.type !== 'pile' || d.item !== it || !sim.isUsable(d.id)) continue;
      const ps = sim.state.stations[d.id] as import('./state').PileState;
      if (ps.count < d.cap) {
        s.guideUnload = true;
        return stTarget(d);
      }
    }
  }
  s.guideUnload = false;
  return null;
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
  const src = full(sim) ? null : source(sim, item, 0);
  if (src) return src;
  return have > 0 ? dest : null;
}

/** Where to go to obtain `item`. */
function source(sim: Sim, item: ItemKind, depth: number): GuideTarget | null {
  if (depth > 4) return null;
  // 1. Anything stocked.
  let best: Dest | null = null;
  let bd = Infinity;
  for (const d of sim.data.stations) {
    if (!sim.isUsable(d.id) || !sim.takeable(d.id, item)) continue;
    const dd = dist(sim, d.x, d.z);
    if (dd < bd) {
      bd = dd;
      best = stTarget(d);
    }
  }
  // Prefer working the node we're standing at over walking to a far ground pile.
  if (best && best.kind !== 'node') return best;
  // 2. A processor that makes it.
  const producers = sim.data.stations.filter(
    (d): d is ProcessorDef => d.type === 'processor' && sim.isUsable(d.id) && sim.data.recipes[d.recipe].output === item,
  );
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
      if (carrying(sim, m) > 0) return stTarget(pd);
    }
    for (const m of missing) {
      const sub = full(sim) ? null : source(sim, m, depth + 1);
      if (sub) return sub;
    }
  }
  if (best) return best;
  // 3. Harvest it.
  return nearestNode(sim, (n) => n.item === item);
}

function nearestNode(sim: Sim, pred: (n: NodeDef) => boolean): GuideTarget | null {
  let best: NodeDef | null = null;
  let bd = Infinity;
  const p = sim.state.player;
  for (const d of sim.data.stations) {
    if (d.type !== 'node' || !pred(d) || !sim.isUsable(d.id)) continue;
    const st = sim.state.stations[d.id] as NodeState;
    if (!st.alive && st.ground <= 0) continue;
    // Stick with the tree we're chopping.
    const dd = Math.hypot(d.x - p.x, d.z - p.z) - (p.working === d.id ? 3 : 0);
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
  for (const e of s.emberPiles) {
    if (e.count >= 6) return { x: e.x, z: e.z, id: e.id, kind: 'embers', reach: 1.2 };
  }
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
  if (sim.isUsable('hearth') && sim.room('hearth', 'log') > 0) {
    const hd = sim.stationDefs.get('hearth')!;
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
