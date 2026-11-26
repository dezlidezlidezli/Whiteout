// Courier helper role (sled dogs): a fast, long-range hauler that runs a fixed trail between two
// depots. Loads from `from` stations near route[0], runs the trail, unloads into `to` stations near
// the last point, runs back. No collision (it stays on its trail), so long hauls are cheap and reliable.

import type { HelperDef, ItemKind } from '../data/types';
import { capOf, helperSpeed } from './agents';
import type { Sim } from './sim';
import type { HelperState } from './state';

/** Seconds a part-loaded courier waits for more before setting off. */
const PATIENCE = 1.2;

export function courier(sim: Sim, def: HelperDef, h: HelperState, dt: number): void {
  const route = def.route ?? [def.home];
  const last = route.length - 1;
  const cap = capOf(sim, def);
  if (h.phase === 'idle' || h.phase === 'work') {
    h.phase = h.stack.length ? 'toDest' : 'toSource';
    h.wp = h.phase === 'toDest' ? Math.min(1, last) : Math.max(0, last - 1);
  }
  const step = helperSpeed(sim, def) * dt;
  if (h.phase === 'toDest' || h.phase === 'toSource') {
    const fwd = h.phase === 'toDest';
    let wp = Math.max(0, Math.min(last, h.wp ?? 0));
    let budget = step;
    while (budget > 0) {
      const t = route[wp];
      const dx = t.x - h.x;
      const dz = t.z - h.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-6) h.facing = Math.atan2(dx, dz);
      if (d > budget) {
        h.x += (dx / d) * budget;
        h.z += (dz / d) * budget;
        h.moving = true;
        break;
      }
      h.x = t.x;
      h.z = t.z;
      budget -= d;
      h.moving = true;
      if (fwd ? wp >= last : wp <= 0) {
        h.phase = fwd ? 'unload' : 'load';
        h.t = 0;
        h.stuckT = 0;
        sim.emit({ type: 'courierArrive', helper: def.id, at: fwd ? 'dest' : 'source', items: h.stack.length });
        break;
      }
      wp += fwd ? 1 : -1;
    }
    h.wp = wp;
    return;
  }
  if (h.phase === 'load') {
    h.t += dt;
    const anyRoom = destWithRoom(sim, def, def.item ? [def.item] : h.stack) !== null;
    let src: string | null = null;
    for (const id of def.from ?? []) {
      if (sim.isUsable(id) && sim.takeable(id, def.item)) {
        src = id;
        break;
      }
    }
    if (src && anyRoom && h.stack.length < cap) {
      h.stuckT = 0;
      if (h.t >= def.transferTime) {
        h.t = 0;
        const it = sim.take(src);
        if (it) {
          h.stack.push(it);
          sim.emit({ type: 'pickup', item: it, from: { kind: 'station', id: src }, by: { kind: 'helper', id: def.id }, height: h.stack.length });
        }
      }
    } else {
      h.t = 0;
      h.stuckT += dt;
    }
    const ready = h.stack.length >= cap || (h.stack.length > 0 && h.stuckT >= PATIENCE);
    if (ready && anyRoom) {
      h.phase = 'toDest';
      h.wp = Math.min(1, last);
      sim.emit({ type: 'courierDepart', helper: def.id, item: h.stack[0], n: h.stack.length });
    }
    return;
  }
  // unload
  h.t += dt;
  if (h.t < def.transferTime) return;
  h.t = 0;
  if (h.stack.length === 0) {
    h.phase = 'toSource';
    h.wp = Math.max(0, last - 1);
    sim.emit({ type: 'courierDepart', helper: def.id, item: null, n: 0 });
    return;
  }
  const dest = destWithRoom(sim, def, h.stack);
  if (!dest) return; // waits at the depot until there is room (never drops anything)
  for (let i = h.stack.length - 1; i >= 0; i--) {
    const it = h.stack[i];
    if (sim.room(dest, it, true) > 0) {
      h.stack.splice(i, 1);
      sim.put(dest, it);
      sim.emit({ type: 'drop', item: it, to: { kind: 'station', id: dest }, by: { kind: 'helper', id: def.id }, height: i });
      break;
    }
  }
}

/** First destination (priority order: e.g. the smokehouse before the overflow rack) with room for any of `items`. */
function destWithRoom(sim: Sim, def: HelperDef, items: ItemKind[]): string | null {
  for (const id of def.to ?? []) {
    if (!sim.isUsable(id)) continue;
    for (const it of new Set(items)) if (sim.room(id, it, true) > 0) return id;
  }
  return null;
}
