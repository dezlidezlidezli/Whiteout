// Housing, made legible for the HUD: how many homes are used, what the next home costs or needs, a
// throttled "build more homes" event when villagers are turned away, and the explanation for a save
// whose population was re-housed by the v2 -> v3 migration. Pure; reads sim state only.

import type { ItemKind, PadDef } from '../data/types';
import type { Sim } from './sim';

/** What raises the camp's capacity next. */
export type NextHome =
  /** A tent rises by itself when the next villager needs it (free). */
  | { kind: 'tent'; homes: number; free: true }
  /** Build a cabin: its pad, cost and materials; `visible` false = not offered yet (see `requires`). */
  | { kind: 'cabin'; pad: string; label: string; homes: number; embers: number; materials: Partial<Record<ItemKind, number>>; visible: boolean; requires: string[] }
  /** Raise the Hearth: allows `tents` more tents. */
  | { kind: 'hearth'; pad: string; level: number; tents: number; homes: number; embers: number; materials: Partial<Record<ItemKind, number>>; visible: boolean };

export interface HousingInfo {
  /** Villagers living in camp (= population) and the homes for them. */
  used: number;
  capacity: number;
  free: number;
  tents: number;
  /** Tents the current Hearth level allows / tents the camp can ever hold. */
  tentsAllowed: number;
  tentsMax: number;
  cabinsBuilt: number;
  cabinsTotal: number;
  /** Rescued villagers bring their own home. */
  rescuedHomes: number;
  /** Lifetime: everyone ever thawed (stays when population is capped), and those who walked on. */
  lifetimeThawed: number;
  passedThrough: number;
  next: NextHome | null;
  /** Set once by the v2 -> v3 migration: population was capped to the homes built (the rest walked on). */
  rehoused: { from: number; to: number } | null;
}

/** Seconds between `homesFull` events while villagers keep being turned away. */
export const HOMES_FULL_EVERY = 30;

export function tentsAllowed(sim: Sim): number {
  const h = sim.data.camp.housing;
  if (!h) return sim.data.camp.tentSpots.length;
  const lv = Math.max(1, Math.min(h.tentsPerLevel.length, sim.state.hearth.level));
  return Math.min(sim.data.camp.tentSpots.length, h.tentsPerLevel[lv - 1]);
}

function padOffer(sim: Sim, p: PadDef) {
  const rem = sim.padRemaining(p.id);
  const ps = sim.state.pads[p.id];
  return { pad: p.id, embers: rem.embers, materials: rem.mats, visible: !!ps?.visible };
}

export function housingInfo(sim: Sim): HousingInfo {
  const s = sim.state;
  const h = sim.data.camp.housing;
  const cap = sim.housingCap();
  const cabinsBuilt = h ? h.cabins.filter((c) => s.unlocked[c]).length : 0;
  let next: NextHome | null = null;
  if (h) {
    const allowed = tentsAllowed(sim);
    if (s.tents < allowed) next = { kind: 'tent', homes: h.perTent, free: true };
    else {
      // The nearest cabin still to build (visible first, then cheapest).
      const cabins = sim.data.pads.filter(
        (p) => !s.pads[p.id]?.done && p.effects.some((e) => e.type === 'unlock' && h.cabins.includes(e.id)),
      );
      cabins.sort((a, b) => Number(!!s.pads[b.id]?.visible) - Number(!!s.pads[a.id]?.visible) || a.cost - b.cost);
      const c = cabins[0];
      // The next Hearth level that allows more tents.
      const hp = sim.data.pads
        .filter((p) => !s.pads[p.id]?.done && p.effects.some((e) => e.type === 'hearth' && e.level > s.hearth.level))
        .map((p) => ({ p, lv: (p.effects.find((e) => e.type === 'hearth') as { level: number }).level }))
        .sort((a, b) => a.lv - b.lv)[0];
      const moreTents = hp ? Math.min(sim.data.camp.tentSpots.length, h.tentsPerLevel[Math.min(h.tentsPerLevel.length, hp.lv) - 1]) - allowed : 0;
      if (c && (s.pads[c.id]?.visible || !hp || !s.pads[hp.p.id]?.visible)) {
        next = { kind: 'cabin', label: c.label, homes: h.perCabin, requires: c.requires.filter((r) => !s.pads[r]?.done), ...padOffer(sim, c) };
      } else if (hp && moreTents > 0) {
        next = { kind: 'hearth', level: hp.lv, tents: moreTents, homes: moreTents * h.perTent, ...padOffer(sim, hp.p) };
      }
    }
  }
  return {
    used: s.population,
    capacity: Number.isFinite(cap) ? cap : s.population,
    free: Number.isFinite(cap) ? Math.max(0, cap - s.population) : Infinity,
    tents: s.tents,
    tentsAllowed: tentsAllowed(sim),
    tentsMax: sim.data.camp.tentSpots.length,
    cabinsBuilt,
    cabinsTotal: h ? h.cabins.length : 0,
    rescuedHomes: s.stats.rescued ?? 0,
    lifetimeThawed: s.stats.thawed ?? 0,
    passedThrough: s.stats.passedThrough ?? 0,
    next,
    rehoused: s.rehoused ?? null,
  };
}

/** The HUD showed the re-housing explanation: forget it. */
export function ackRehoused(sim: Sim): void {
  sim.state.rehoused = null;
}

/** A villager was turned away: count it, and every HOMES_FULL_EVERY seconds tell the view (with what to build). */
export function noteTurnedAway(sim: Sim): void {
  const s = sim.state;
  const hf = (s.homesFull ??= { t: -1e9, n: 0 });
  hf.n++;
  if (s.time - hf.t < HOMES_FULL_EVERY) return;
  const next = housingInfo(sim).next;
  sim.emit({ type: 'homesFull', turnedAway: hf.n, capacity: sim.housingCap(), next: next ? next.kind : null, pad: next && next.kind !== 'tent' ? next.pad : null });
  hf.t = s.time;
  hf.n = 0;
}
