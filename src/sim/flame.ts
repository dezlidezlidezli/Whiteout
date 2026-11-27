// Carry the flame (docs/MECHANICS.md §5). Stand still a moment at the Hearth or a lit brazier with an empty
// pack to take up the flame (both hands; no picking up while held); stand still at a source again to set it
// back. Outside warmth it gutters over ~20 s (faster in wind gaps); a lit brazier restores it. Carry it to
// unlit braziers to light them (the Trail of Light in order), to the finished Beacon's crown for the finale,
// and to festival lamps for Lantern Festival orders.

import { festivalLampLit } from './endless';
import { startFinale } from './finale';
import type { Sim } from './sim';

export interface FlameState {
  held: boolean;
  level: number;
  lit: Record<string, true>;
  beaconLit: boolean;
  /** Festival lamps lit for the open Lantern Festival order. */
  lamps: Record<string, true>;
  /** Seconds standing still at a flame source (take / set down after TAKE_T). */
  stillT: number;
  evT: number;
}

export function createFlame(): FlameState {
  return { held: false, level: 0, lit: {}, beaconLit: false, lamps: {}, stillT: 0, evT: 0 };
}

const TAKE_T = 0.6;
const SOURCE_R = 2.2;
const LIGHT_R = 1.6;

/** Is (x, z) warm (inside the Hearth's warm radius or by a lit brazier)? `margin` shrinks the radius. */
export function isWarm(sim: Sim, x: number, z: number, margin = 0): boolean {
  const h = sim.data.camp.hearth;
  if (Math.hypot(x - h.x, z - h.z) <= sim.warmRadius() - margin) return true;
  const st = sim.state.flame;
  for (const b of sim.data.mech.braziers) if (st.lit[b.id] && Math.hypot(b.x - x, b.z - z) <= sim.data.mech.brazierWarm) return true;
  return false;
}

/** Flame sources: the Hearth and every lit brazier in an open area. */
export function flameSources(sim: Sim): { id: string; x: number; z: number }[] {
  const st = sim.state.flame;
  const out = [{ id: 'hearth', x: sim.data.camp.hearth.x, z: sim.data.camp.hearth.z }];
  for (const b of sim.data.mech.braziers) if (st.lit[b.id] && sim.state.areasOpen[b.area]) out.push({ id: b.id, x: b.x, z: b.z });
  return out;
}

/** Next Trail of Light brazier to light (null when the trail is complete). */
export function nextTrail(sim: Sim) {
  const st = sim.state.flame;
  return sim.data.mech.braziers.filter((b) => b.kind === 'trail' && !st.lit[b.id]).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0] ?? null;
}

export const trailComplete = (sim: Sim) => nextTrail(sim) === null;
export const beaconReady = (sim: Sim) => sim.state.beacon >= 4 && trailComplete(sim) && !sim.state.flame.beaconLit;

export function updateFlame(sim: Sim, dt: number): void {
  const st = sim.state.flame;
  const p = sim.state.player;
  const m = sim.data.mech;
  const still = Math.hypot(p.vx, p.vz) < 0.4;
  const atSource = flameSources(sim).some((s) => Math.hypot(s.x - p.x, s.z - p.z) <= SOURCE_R);
  st.stillT = still && atSource ? st.stillT + dt : 0;
  if (!st.held) {
    if (st.stillT >= TAKE_T && p.stack.length === 0 && wantsFlame(sim)) {
      st.held = true;
      st.level = 1;
      st.stillT = -2; // don't set it straight back down
      sim.emit({ type: 'flameTaken' });
    }
    return;
  }
  // Set it back down at a source (only once there is nothing left to light).
  if (st.stillT >= TAKE_T) {
    st.held = false;
    st.stillT = 0;
    sim.emit({ type: 'flameDown' });
    return;
  }
  if (atSource) st.level = 1;
  else if (!isWarm(sim, p.x, p.z)) {
    const wind = m.windGaps.some((r) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1);
    st.level -= (dt / m.flameLife) * (wind ? m.windFactor : 1);
  }
  if (st.level <= 0) {
    st.level = 0;
    st.held = false;
    sim.emit({ type: 'flameOut' });
    return;
  }
  st.evT += dt;
  if (st.evT >= 0.5) {
    st.evT = 0;
    sim.emit({ type: 'flameLevel', v: st.level });
  }
  // Light unlit braziers (the trail only in order).
  const next = nextTrail(sim);
  for (const b of m.braziers) {
    if (st.lit[b.id] || !sim.state.areasOpen[b.area] || Math.hypot(b.x - p.x, b.z - p.z) > LIGHT_R) continue;
    if (b.kind === 'trail' && next?.id !== b.id) continue;
    st.lit[b.id] = true;
    sim.emit({ type: 'brazierLit', id: b.id });
    if (b.kind === 'yard') sim.state.mods.priceMul *= 1.03; // a little Cosier for good
    else {
      sim.addStat('trailLit', 1);
      if (trailComplete(sim)) sim.emit({ type: 'trailComplete' });
    }
  }
  // The finished Beacon's crown.
  if (beaconReady(sim) && Math.hypot(m.beacon.x - p.x, m.beacon.z - p.z) <= m.beacon.reach) {
    st.beaconLit = true;
    st.held = false;
    sim.addStat('beaconLit', 1);
    sim.emit({ type: 'beaconLit' });
    startFinale(sim);
    return;
  }
  // Lantern Festival lamps.
  if (sim.state.orders.some((o) => o.festival)) {
    for (const l of m.festivalLamps) {
      if (st.lamps[l.id] || Math.hypot(l.x - p.x, l.z - p.z) > 1.4) continue;
      st.lamps[l.id] = true;
      sim.emit({ type: 'brazierLit', id: l.id });
      festivalLampLit(sim);
    }
  }
}

/** Is there anything the flame could light right now? (taking it is pointless otherwise) */
export function wantsFlame(sim: Sim): boolean {
  const st = sim.state.flame;
  if (beaconReady(sim)) return true;
  const next = nextTrail(sim);
  if (next && sim.state.areasOpen[next.area]) return true;
  if (sim.data.mech.braziers.some((b) => b.kind === 'yard' && !st.lit[b.id] && sim.state.areasOpen[b.area])) return true;
  return sim.state.orders.some((o) => o.festival) && sim.data.mech.festivalLamps.some((l) => !st.lamps[l.id]);
}
