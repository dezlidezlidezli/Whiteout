// Ice skating (docs/MECHANICS.md §3): momentum on the lake ice (normal footing on grip mats), gentle wall
// bounces, and fish leaps along the player's line that a fast skater scoops up, with a rising combo.

import { deepAt } from './plough';
import type { Sim } from './sim';

export interface FishLeap { id: number; x: number; z: number; t: number }
export interface SkateState {
  on: boolean;
  /** 0 = plain boots, 1 = sharpened skates (tighter turns, higher top speed). */
  tier: number;
  leaps: FishLeap[];
  nextId: number;
  leapT: number;
  combo: number;
  comboT: number;
}

export function createSkate(): SkateState {
  return { on: false, tier: 0, leaps: [], nextId: 1, leapT: 1.5, combo: 0, comboT: 0 };
}

const LEAP_LIFE = 2.6;

/** Is (x, z) skating ice (lake ice in an open area, not a grip mat, not still under deep snow)? */
export function isIce(sim: Sim, x: number, z: number): boolean {
  const m = sim.data.mech;
  if (!sim.state.areasOpen.frozenLake) return false;
  if (!m.ice.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)) return false;
  if (m.gripMats.some((g) => Math.hypot(g.x - x, g.z - z) < g.r)) return false;
  return !deepAt(sim, x, z);
}

/** Momentum movement on ice. Returns false when the player isn't on ice (normal movement applies). */
export function skateVelocity(sim: Sim, dt: number, mx: number, mz: number, speed: number): boolean {
  const p = sim.state.player;
  const st = sim.state.skate;
  const on = isIce(sim, p.x, p.z);
  if (on !== st.on) {
    st.on = on;
    sim.emit({ type: on ? 'skateStart' : 'skateStop' });
    if (!on) st.combo = 0;
  }
  if (!on) return false;
  const top = speed * sim.data.mech.iceTop[Math.min(st.tier, sim.data.mech.iceTop.length - 1)];
  const tx = mx * top;
  const tz = mz * top;
  const push = Math.hypot(mx, mz);
  // Released: glide to a stop in ~1.5 s. Pushing against the glide: brake quickly. Otherwise: build up speed.
  const k = push < 0.1 ? 2.0 : tx * p.vx + tz * p.vz < 0 ? 6.0 : st.tier > 0 ? 3.4 : 2.6;
  const a = Math.min(1, dt * k);
  p.vx += (tx - p.vx) * a;
  p.vz += (tz - p.vz) * a;
  return true;
}

/** After the move: a wall hit while gliding bounces gently. */
export function skateBounce(sim: Sim, intendedX: number, intendedZ: number, movedX: number, movedZ: number): void {
  const p = sim.state.player;
  if (!sim.state.skate.on) return;
  const want = Math.hypot(intendedX, intendedZ);
  if (want < 1e-4 || Math.hypot(p.vx, p.vz) < 2.0) return;
  if (Math.hypot(movedX, movedZ) < want * 0.4) {
    p.vx *= -0.35;
    p.vz *= -0.35;
    sim.emit({ type: 'skateBounce' });
  }
}

/** Fish leaps: telegraphed ahead of a fast skater; skating through one scoops a fish onto the stack. */
export function updateSkate(sim: Sim, dt: number): void {
  const st = sim.state.skate;
  const p = sim.state.player;
  const speed = Math.hypot(p.vx, p.vz);
  for (let i = st.leaps.length - 1; i >= 0; i--) {
    const l = st.leaps[i];
    l.t += dt;
    if (l.t > LEAP_LIFE) {
      st.leaps.splice(i, 1);
      st.combo = 0;
    } else if (speed > 2.5 && Math.hypot(l.x - p.x, l.z - p.z) < 1.1) {
      st.leaps.splice(i, 1);
      st.combo = st.comboT > 0 ? st.combo + 1 : 1;
      st.comboT = 4;
      sim.addStat('fishLeaps', 1);
      // With room (and no flame in hand) the fish lands on the stack; otherwise it is caught and let go
      // with a splash: the catch and the combo still count, nobody has to empty their pack first.
      const kept = p.stack.length < p.capacity && !sim.state.flame.held;
      if (kept) {
        p.stack.push('fish');
        sim.addStat('harvest.fish', 1);
        sim.addStat('carried', 1);
        sim.emit({ type: 'pickup', item: 'fish', from: { kind: 'ground', id: `leap${l.id}` }, by: { kind: 'player' }, height: p.stack.length });
      }
      sim.emit({ type: 'fishLeapCatch', combo: st.combo, x: l.x, z: l.z, kept });
    }
  }
  if (st.comboT > 0) st.comboT -= dt;
  if (!st.on) return;
  st.leapT -= dt;
  if (st.leapT > 0 || speed < 3.0 || st.leaps.length >= 3) return;
  st.leapT = 1.0 + sim.rand() * 1.2;
  const ux = p.vx / speed;
  const uz = p.vz / speed;
  const ahead = 3.5 + sim.rand() * 1.5;
  const side = (sim.rand() - 0.5) * 1.6;
  const x = p.x + ux * ahead - uz * side;
  const z = p.z + uz * ahead + ux * side;
  if (!isIce(sim, x, z)) return;
  const l = { id: st.nextId++, x, z, t: 0 };
  st.leaps.push(l);
  sim.emit({ type: 'fishLeapSpawn', id: l.id, x, z });
}
