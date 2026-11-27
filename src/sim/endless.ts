// Open Season (endless mode): caravan orders on the notice board, season level, lifetime totals.
// No timers anywhere: a filled order is replaced by a fresh one on the same step.

import type { ItemKind } from '../data/types';
import type { Sim } from './sim';
import type { OrderState } from './state';

export function openSeasonActive(sim: Sim): boolean {
  return sim.state.finale.phase === 'done';
}

export function startOpenSeason(sim: Sim): void {
  fillOrders(sim);
}

/** Top the board up to `slots` open orders. */
export function fillOrders(sim: Sim): void {
  const s = sim.state;
  if (!openSeasonActive(sim)) return;
  while (s.orders.length < sim.data.endless.slots) {
    const o = drawOrder(sim);
    if (!o) break;
    s.orders.push(o);
    sim.emit({ type: 'orderPosted', order: o.id, item: o.item, n: o.n, reward: o.reward, slot: s.orders.length - 1 });
  }
}

function drawOrder(sim: Sim): OrderState | null {
  const s = sim.state;
  const e = sim.data.endless;
  const open = new Set(s.orders.map((o) => o.item));
  const pool = e.orders.filter((k) => !open.has(k.item));
  if (pool.length === 0) return null;
  let total = 0;
  for (const k of pool) total += k.weight;
  let r = sim.rand() * total;
  let kind = pool[pool.length - 1];
  for (const k of pool) {
    r -= k.weight;
    if (r <= 0) {
      kind = k;
      break;
    }
  }
  const lv = s.season - 1;
  const jitter = 0.85 + sim.rand() * 0.3;
  const n = Math.max(1, Math.round(Math.min(kind.n * e.qtyCapMul, kind.n * (1 + e.seasonQty * lv) * jitter)));
  const reward = Math.round(n * kind.value * (1 + e.seasonValue * lv));
  return { id: s.nextOrderId++, item: kind.item, n, got: 0, reward };
}

/** How many of `item` the open orders still want. */
export function orderRoom(sim: Sim, item: ItemKind): number {
  if (!openSeasonActive(sim)) return 0;
  let n = 0;
  for (const o of sim.state.orders) if (o.item === item) n += o.n - o.got;
  return n;
}

/** One item handed in at the board. */
export function deliverOrder(sim: Sim, item: ItemKind): void {
  const s = sim.state;
  const i = s.orders.findIndex((o) => o.item === item && o.got < o.n);
  if (i < 0) return;
  const o = s.orders[i];
  o.got++;
  sim.emit({ type: 'orderProgress', order: o.id, got: o.got, n: o.n });
  if (o.got < o.n) return;
  s.orders.splice(i, 1);
  sim.addStat('ordersDone', 1);
  const board = sim.stationDefs.get(sim.data.endless.board)!;
  sim.addEmbers({ x: board.x - 1.5, z: board.z }, o.reward, 'embers_board');
  sim.emit({ type: 'orderComplete', order: o.id, item: o.item, reward: o.reward });
  const lv = 1 + Math.floor((s.stats.ordersDone ?? 0) / sim.data.endless.ordersPerSeason);
  if (lv > s.season) {
    s.season = lv;
    sim.emit({ type: 'seasonUp', level: lv });
  }
  fillOrders(sim);
}

/** Lifetime totals for the stats page (cheap: a handful of reads per step). */
export function updateTotals(sim: Sim, dt: number): void {
  const s = sim.state;
  const t = s.totals;
  const p = s.player;
  t.distance += Math.hypot(p.x - p.px, p.z - p.pz);
  t.playTime += dt;
  t.served = s.stats.served ?? 0;
  t.thawed = s.stats.thawed ?? 0;
  t.embersEarned = s.stats.embersEarned ?? 0;
  t.carried = s.stats.carried ?? 0;
  t.ordersDone = s.stats.ordersDone ?? 0;
  t.upgrades = s.stats.upgrades ?? 0;
  t.decorations = s.stats.decorations ?? 0;
}
