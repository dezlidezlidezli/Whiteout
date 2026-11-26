// Icebound customers and hired helpers.

import type { CounterDef, HelperDef, ItemKind, NodeDef } from '../data/types';
import { pushOut, steer } from './collision';
import type { Sim } from './sim';
import type { CounterState, CustomerState, HelperState, NodeState } from './state';

// ------------------------------------------------------------------ customers

export function updateCustomers(sim: Sim, dt: number): void {
  const s = sim.state;
  const b = sim.data.balance;
  const counters = sim.data.stations.filter((d): d is CounterDef => d.type === 'counter' && sim.isUsable(d.id));

  // Spawning: each counter draws its own trickle of Icebound out of the storm.
  s.spawnT += dt * s.mods.spawnRate;
  if (s.spawnT >= b.spawnInterval) {
    s.spawnT -= b.spawnInterval;
    let waiting = 0;
    for (const c of s.customers) if (c.phase === 'queue') waiting++;
    for (const c of counters) {
      const q = (s.stations[c.id] as CounterState).queue.length;
      if (q < c.queueLen && waiting < b.maxCustomers) {
        waiting++;
        sim.spawnCustomerAt(c, c.spawn.x + (sim.rand() - 0.5) * 3, c.spawn.z + sim.rand() * 2);
      }
    }
  }

  const price = (item: ItemKind) => (sim.data.items[item].price + s.mods.pricePlus) * (s.hearth.cosy ? b.cosyMultiplier : 1);

  // Serving (front of each queue).
  for (const c of counters) {
    const cs = s.stations[c.id] as CounterState;
    const frontId = cs.queue[0];
    const front = frontId !== undefined ? s.customers.find((x) => x.id === frontId) : undefined;
    if (!front) {
      cs.serveT = 0;
      continue;
    }
    const arrived = Math.hypot(front.x - c.queueStart.x, front.z - c.queueStart.z) < 0.25;
    if (!arrived || cs.stock <= 0) {
      cs.serveT = 0;
      continue;
    }
    cs.serveT += dt;
    if (cs.serveT >= c.serveTime) {
      cs.serveT = 0;
      cs.stock--;
      front.got++;
      sim.emit({ type: 'serve', station: c.id, customer: front.id, item: c.item });
      if (front.got >= front.want) {
        cs.queue.shift();
        front.phase = 'thaw';
        front.t = 0;
        sim.addStat('served', 1);
        sim.addStat(`served.${c.item}`, 1);
        sim.emit({ type: 'thaw', customer: front.id, x: front.x, z: front.z });
        sim.addEmbers(c.emberSpot, Math.round(price(c.item) * front.want), `embers_${c.id}`);
      }
    }
  }

  // Movement.
  const camp = sim.data.camp;
  for (let i = s.customers.length - 1; i >= 0; i--) {
    const cu = s.customers[i];
    const c = sim.data.stations.find((d) => d.id === cu.counter) as CounterDef;
    if (cu.phase === 'queue') {
      const cs = s.stations[c.id] as CounterState;
      const slot = Math.max(0, cs.queue.indexOf(cu.id));
      const tx = c.queueStart.x + c.queueDir.x * c.queueSpacing * slot;
      const tz = c.queueStart.z + c.queueDir.z * c.queueSpacing * slot;
      moveTo(cu, tx, tz, b.customerSpeed * dt);
    } else if (cu.phase === 'thaw') {
      cu.t += dt;
      if (cu.t >= b.thawTime) {
        cu.phase = 'leave';
        cu.path = 0;
      }
    } else {
      const pts = c.exitPath;
      const tx = cu.path < pts.length ? pts[cu.path].x : cu.settleX;
      const tz = cu.path < pts.length ? pts[cu.path].z : cu.settleZ;
      if (moveTo(cu, tx, tz, b.thawedSpeed * dt)) {
        cu.path++;
        if (cu.path > pts.length) {
          s.customers.splice(i, 1);
          sim.addStat('thawed', 1);
          sim.addPopulation(1);
          sim.emit({ type: 'arrive', customer: cu.id, x: cu.x, z: cu.z, population: s.population });
        }
      }
    }
  }
  void camp;
}

function moveTo(o: { x: number; z: number }, tx: number, tz: number, step: number): boolean {
  const dx = tx - o.x;
  const dz = tz - o.z;
  const d = Math.hypot(dx, dz);
  if (d <= step) {
    o.x = tx;
    o.z = tz;
    return true;
  }
  o.x += (dx / d) * step;
  o.z += (dz / d) * step;
  return false;
}

export type { CustomerState };

// ------------------------------------------------------------------ helpers

export function hireHelper(sim: Sim, id: string): void {
  const def = sim.data.helpers.find((h) => h.id === id);
  if (!def || sim.state.helpers[id]) return;
  sim.state.helpers[id] = {
    id, x: def.home.x, z: def.home.z, px: def.home.x, pz: def.home.z, facing: 0, stack: [], phase: 'idle',
    target: null, t: 0, action: 'none', moving: false, stuckT: 0, lastX: def.home.x, lastZ: def.home.z, sideT: 0,
  };
  sim.emit({ type: 'hire', helper: id });
}

export function updateHelpers(sim: Sim, dt: number): void {
  for (const def of sim.data.helpers) {
    const h = sim.state.helpers[def.id];
    if (!h) continue;
    h.moving = false;
    h.action = 'none';
    if (def.role === 'haul') haul(sim, def, h, dt);
    else if (def.role === 'harvest') harvest(sim, def, h, dt);
    else operate(sim, def, h, dt);
  }
}

function helperSpeed(sim: Sim, def: HelperDef): number {
  const s = sim.state;
  return def.speed * s.mods.helperSpeed * (s.hearth.cosy ? sim.data.balance.cosyHelperSpeed : 1);
}

function capOf(sim: Sim, def: HelperDef): number {
  return def.capacity + sim.state.mods.helperCapacity;
}

/** Walk towards (tx,tz); true when within `arrive` metres. */
function walk(sim: Sim, def: HelperDef, h: HelperState, tx: number, tz: number, arrive: number, dt: number): boolean {
  const d = Math.hypot(tx - h.x, tz - h.z);
  if (d <= arrive) return true;
  const solids = sim.allSolids();
  const side = h.sideT > 0 ? -1 : 1;
  const dir = steer(h, tx, tz, 0.35, solids, side);
  const sp = helperSpeed(sim, def) * dt;
  h.x += dir.x * Math.min(sp, d);
  h.z += dir.z * Math.min(sp, d);
  pushOut(h, 0.35, solids);
  h.facing = Math.atan2(dir.x, dir.z);
  h.moving = true;
  // Unstick: if barely moving for a while, flip the avoidance side.
  h.stuckT += dt;
  if (h.stuckT > 0.8) {
    if (Math.hypot(h.x - h.lastX, h.z - h.lastZ) < 0.4) h.sideT = 1.2;
    h.stuckT = 0;
    h.lastX = h.x;
    h.lastZ = h.z;
  }
  if (h.sideT > 0) h.sideT -= dt;
  return Math.hypot(tx - h.x, tz - h.z) <= arrive;
}

function stationPos(sim: Sim, id: string): { x: number; z: number; reach: number } {
  const d = sim.stationDefs.get(id)!;
  return { x: d.x, z: d.z, reach: d.reach };
}

function bestSource(sim: Sim, def: HelperDef): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const id of def.from ?? []) {
    if (!sim.isUsable(id) || !sim.takeable(id, def.item)) continue;
    const st = sim.state.stations[id];
    const n = st.kind === 'pile' ? st.count : st.kind === 'processor' ? st.output : st.kind === 'node' ? st.ground : 0;
    if (n > bestN) {
      bestN = n;
      best = id;
    }
  }
  return best;
}

function bestDest(sim: Sim, def: HelperDef, items: ItemKind[]): string | null {
  // Choose the destination with the most room (keeps two kettles balanced), in priority order on ties.
  let best: string | null = null;
  let bestRoom = 0;
  for (const id of def.to ?? []) {
    if (!sim.isUsable(id)) continue;
    let room = 0;
    for (const it of new Set(items)) room = Math.max(room, sim.room(id, it, true));
    if (room > 0 && (best === null || room > bestRoom + 1)) {
      bestRoom = room;
      best = id;
    }
  }
  return best;
}

function haul(sim: Sim, def: HelperDef, h: HelperState, dt: number): void {
  const cap = capOf(sim, def);
  const probe: ItemKind[] = h.stack.length ? h.stack : def.item ? [def.item] : [];
  if (h.phase === 'idle' || h.phase === 'work') {
    h.phase = h.stack.length ? 'toDest' : 'toSource';
    h.target = null;
  }
  if (h.phase === 'toSource' || h.phase === 'load') {
    if (!h.target || !sim.takeable(h.target, def.item)) {
      if (h.phase === 'load' && h.stack.length > 0) {
        h.phase = 'toDest';
        h.target = null;
        return;
      }
      h.target = bestSource(sim, def);
      h.phase = 'toSource';
    }
    // Only fetch if someone can take it.
    if (!h.target || !bestDest(sim, def, probe)) {
      if (h.stack.length) h.phase = 'toDest';
      else idleAtHome(sim, def, h, dt);
      return;
    }
    const sp = stationPos(sim, h.target);
    if (h.phase === 'toSource') {
      if (walk(sim, def, h, sp.x, sp.z, sp.reach - 0.2, dt)) {
        h.phase = 'load';
        h.t = 0;
      }
      return;
    }
    h.t += dt;
    if (h.t >= def.transferTime) {
      h.t = 0;
      if (h.stack.length < cap) {
        const it = sim.take(h.target);
        if (it) {
          h.stack.push(it);
          sim.emit({ type: 'pickup', item: it, from: { kind: 'station', id: h.target }, by: { kind: 'helper', id: def.id }, height: h.stack.length });
        }
      }
      if (h.stack.length >= cap) {
        h.phase = 'toDest';
        h.target = null;
      }
    }
    return;
  }
  haulDeliver(sim, def, h, dt);
}

function idleAtHome(sim: Sim, def: HelperDef, h: HelperState, dt: number): void {
  walk(sim, def, h, def.home.x, def.home.z, 0.3, dt);
}

function harvest(sim: Sim, def: HelperDef, h: HelperState, dt: number): void {
  const cap = capOf(sim, def);
  if (h.phase === 'toDest' || h.phase === 'unload') {
    haulDeliver(sim, def, h, dt);
    return;
  }
  if (h.stack.length >= cap) {
    h.phase = 'toDest';
    h.target = null;
    return;
  }
  let node = h.target ? (sim.stationDefs.get(h.target) as NodeDef | undefined) : undefined;
  if (!node || node.type !== 'node' || !(sim.state.stations[node.id] as NodeState).alive) {
    node = nearestNode(sim, def, h);
    h.target = node?.id ?? null;
    h.phase = 'toSource';
    h.t = 0;
  }
  if (!node) {
    if (h.stack.length) {
      h.phase = 'toDest';
      h.target = null;
    } else idleAtHome(sim, def, h, dt);
    return;
  }
  if (h.phase !== 'work') {
    if (walk(sim, def, h, node.x, node.z, node.reach - 0.3, dt)) {
      h.phase = 'work';
      h.t = 0;
    }
    return;
  }
  h.action = 'chop';
  h.facing = Math.atan2(node.x - h.x, node.z - h.z);
  h.t += dt * sim.state.mods.chopSpeed * (sim.state.hearth.cosy ? sim.data.balance.cosyHelperSpeed : 1);
  if (h.t >= node.hitTime * 1.5) {
    h.t = 0;
    sim.hitNode(node, { kind: 'helper', id: def.id }, h.stack, cap);
    if (!(sim.state.stations[node.id] as NodeState).alive) h.target = null;
    if (h.stack.length >= cap) {
      h.phase = 'toDest';
      h.target = null;
    }
  }
}

function nearestNode(sim: Sim, def: HelperDef, h: HelperState): NodeDef | undefined {
  let best: NodeDef | undefined;
  let bd = Infinity;
  const p = sim.state.player;
  for (const d of sim.data.stations) {
    if (d.type !== 'node' || d.tag !== def.nodeTag || !sim.isUsable(d.id)) continue;
    if (!(sim.state.stations[d.id] as NodeState).alive) continue;
    // Prefer trees away from the player so we don't fight over one.
    const dd = Math.hypot(d.x - h.x, d.z - h.z) + (Math.hypot(d.x - p.x, d.z - p.z) < 2 ? 6 : 0);
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  return best;
}

function haulDeliver(sim: Sim, def: HelperDef, h: HelperState, dt: number): void {
  if (h.stack.length === 0) {
    h.phase = 'toSource';
    h.target = null;
    return;
  }
  if (!h.target || h.stack.every((it) => sim.room(h.target!, it, true) <= 0)) {
    h.target = bestDest(sim, def, h.stack);
    h.phase = 'toDest';
    if (!h.target) {
      idleAtHome(sim, def, h, dt);
      return;
    }
  }
  const dp = stationPos(sim, h.target);
  if (h.phase === 'toDest') {
    if (walk(sim, def, h, dp.x, dp.z, dp.reach - 0.2, dt)) {
      h.phase = 'unload';
      h.t = 0;
    }
    return;
  }
  h.t += dt;
  if (h.t >= def.transferTime) {
    h.t = 0;
    for (let i = h.stack.length - 1; i >= 0; i--) {
      const it = h.stack[i];
      if (sim.room(h.target, it, true) > 0) {
        h.stack.splice(i, 1);
        sim.put(h.target, it);
        sim.emit({ type: 'drop', item: it, to: { kind: 'station', id: h.target }, by: { kind: 'helper', id: def.id }, height: i });
        break;
      }
    }
  }
}

function operate(sim: Sim, def: HelperDef, h: HelperState, dt: number): void {
  if (!def.station || !sim.isUsable(def.station)) {
    idleAtHome(sim, def, h, dt);
    return;
  }
  const sp = stationPos(sim, def.station);
  if (h.phase !== 'work') {
    if (walk(sim, def, h, sp.x + 0.9, sp.z - 0.9, 0.25, dt)) h.phase = 'work';
    return;
  }
  h.facing = Math.atan2(sp.x - h.x, sp.z - h.z);
  h.action = 'cook';
  if (Math.hypot(sp.x - h.x, sp.z - h.z) > sp.reach + 0.5) h.phase = 'idle';
}
