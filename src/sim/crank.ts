// Crank by circling (docs/MECHANICS.md §4): walking round a capstan's ring winds it. The forge bellows build
// a decaying blast (forge up to 3×, never required); the mine lift hauls a cage of ore every 2 turns.
// A hired winder can walk the capstan instead.

import type { CrankDef } from '../data/mechanics';
import type { HelperDef } from '../data/types';
import { helperSpeed } from './agents';
import type { Sim } from './sim';
import type { HelperState } from './state';

export interface CrankOne {
  /** Signed accumulated angle (radians) for the push-bar animation. */
  angle: number;
  turns: number;
  /** Bellows: 0..1. */
  blast: number;
  /** Lift: turns towards the next cage (0..2). */
  lift: number;
  lastA: number | null;
  dir: number;
  notch: number;
  blastStep: number;
}
export type CrankState = Record<string, CrankOne>;

const TURNS_PER_CAGE = 2;
const CAGE = 6;
const BLAST_PER_TURN = 0.25;
const BLAST_DECAY = 1 / 25;

function one(sim: Sim, id: string): CrankOne {
  return (sim.state.crank[id] ??= { angle: 0, turns: 0, blast: 0, lift: 0, lastA: null, dir: 0, notch: 0, blastStep: 0 });
}

export const crankActive = (sim: Sim, c: CrankDef) => !!sim.state.unlocked[c.unlockedBy] && !!sim.state.areasOpen[c.area];

/** View accessor. */
export function crankInfo(sim: Sim, id: string): { angle: number; blast: number; liftProgress: number; turns: number } {
  const c = one(sim, id);
  return { angle: c.angle, blast: c.blast, liftProgress: c.lift / TURNS_PER_CAGE, turns: c.turns };
}

/** Is (x, z) inside a crank's ring? */
export function inRing(c: CrankDef, x: number, z: number): boolean {
  const d = Math.hypot(x - c.x, z - c.z);
  return d >= c.inner && d <= c.outer;
}

/** Forge speed multiplier from its bellows (1..3). */
export function procBoost(sim: Sim, procId: string): number {
  for (const c of sim.data.mech.cranks) if (c.use === 'bellows' && c.target === procId) return 1 + 2 * one(sim, c.id).blast;
  return 1;
}

function wind(sim: Sim, c: CrankDef, st: CrankOne, dA: number): void {
  if (dA === 0) return;
  const sgn = Math.sign(dA);
  let a = Math.abs(dA);
  if (st.dir !== 0 && sgn !== st.dir) a *= 0.7; // reversing is allowed but wastes a little
  st.dir = sgn;
  st.angle += dA;
  const turns = a / (Math.PI * 2);
  st.turns += turns;
  st.notch += turns * 8;
  while (st.notch >= 1) {
    st.notch -= 1;
    sim.emit({ type: 'crankNotch', id: c.id });
  }
  const before = Math.floor(st.turns - turns);
  if (Math.floor(st.turns) > before) {
    sim.emit({ type: 'crankTurn', id: c.id });
    sim.addStat('crankTurns', 1);
  }
  if (c.use === 'bellows') st.blast = Math.min(1, st.blast + turns * BLAST_PER_TURN);
  else {
    st.lift += turns;
    while (st.lift >= TURNS_PER_CAGE) {
      st.lift -= TURNS_PER_CAGE;
      const pile = sim.state.stations[c.target];
      if (pile && pile.kind === 'pile') pile.count += CAGE;
      sim.addStat('liftCages', 1);
      sim.emit({ type: 'liftArrive', id: c.id, n: CAGE });
    }
  }
}

export function updateCrank(sim: Sim, dt: number): void {
  const p = sim.state.player;
  for (const c of sim.data.mech.cranks) {
    const st = one(sim, c.id);
    if (crankActive(sim, c) && inRing(c, p.x, p.z)) {
      const a = Math.atan2(p.z - c.z, p.x - c.x);
      if (st.lastA !== null) {
        let d = a - st.lastA;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        wind(sim, c, st, d);
      }
      st.lastA = a;
    } else st.lastA = null;
    if (c.use === 'bellows' && st.blast > 0) {
      st.blast = Math.max(0, st.blast - dt * BLAST_DECAY);
      const step = Math.round(st.blast * 10);
      if (step !== st.blastStep) {
        st.blastStep = step;
        sim.emit({ type: 'blast', id: c.id, level: st.blast });
      }
    }
  }
}

/** Helper role 'crank': walks the capstan round at a steady pace. */
export function crankHelper(sim: Sim, def: HelperDef, h: HelperState, dt: number): void {
  const c = sim.data.mech.cranks.find((k) => k.id === def.station);
  if (!c || !crankActive(sim, c)) return;
  const R = (c.inner + c.outer) / 2;
  const st = one(sim, c.id);
  const a0 = Math.atan2(h.z - c.z, h.x - c.x);
  const d0 = Math.hypot(h.x - c.x, h.z - c.z);
  if (Math.abs(d0 - R) > 0.3) {
    // Walk onto the ring first.
    const tx = c.x + Math.cos(a0) * R;
    const tz = c.z + Math.sin(a0) * R;
    const dx = tx - h.x;
    const dz = tz - h.z;
    const l = Math.hypot(dx, dz) || 1;
    const s = Math.min(l, helperSpeed(sim, def) * dt);
    h.x += (dx / l) * s;
    h.z += (dz / l) * s;
    h.moving = true;
    return;
  }
  const dA = (helperSpeed(sim, def) * 0.6 * dt) / R;
  h.x = c.x + Math.cos(a0 + dA) * R;
  h.z = c.z + Math.sin(a0 + dA) * R;
  h.facing = Math.atan2(-Math.sin(a0), Math.cos(a0));
  h.moving = true;
  h.action = 'cook';
  wind(sim, c, st, dA);
}
