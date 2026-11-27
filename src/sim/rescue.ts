// Rescue walks (docs/MECHANICS.md §2): dig lost villagers out with the lantern, lead them home in a conga
// line, followers outside the glow wait safely, and every one thawed in any warmth joins the camp.

import type { LostVillagerDef } from '../data/mechanics';
import { isWarm } from './flame';
import type { Sim } from './sim';

export type LostStatus = 'following' | 'waiting' | 'home';
export interface RescueState {
  /** 0 = no lantern, 1 = lantern (glow 6 m, 3 followers), 2 = brighter (9 m, 6). */
  lantern: number;
  status: Record<string, LostStatus>;
  /** Villagers buried under deep snow that the plough has uncovered. */
  revealed: Record<string, true>;
  /** Follower order (first = right behind the player). */
  followers: string[];
  /** Positions of rescued villagers still out in the cold (following or waiting). */
  pos: Record<string, { x: number; z: number }>;
  dig: { id: string; t: number } | null;
  areaDone: Record<string, true>;
  all: boolean;
  /** Lantern currently glowing (player outside warmth); drives lanternOn/lanternOff. */
  lit?: boolean;
}

export function createRescue(): RescueState {
  return { lantern: 0, status: {}, revealed: {}, followers: [], pos: {}, dig: null, areaDone: {}, all: false };
}

/** Still buried and diggable now (area open, uncovered if it was under snow). */
export function diggable(sim: Sim, v: LostVillagerDef): boolean {
  const r = sim.state.rescue;
  return !r.status[v.id] && !!sim.state.areasOpen[v.area] && (!v.underSnow || !!r.revealed[v.id]);
}

export function glowRadius(sim: Sim): number {
  const r = sim.state.rescue;
  return sim.data.mech.glow[Math.min(r.lantern, sim.data.mech.glow.length - 1)];
}

/** View accessor: everyone rescued but not home yet, with where they stand and what they are doing. */
export function followers(sim: Sim): { id: string; name: string; x: number; z: number; status: LostStatus }[] {
  const r = sim.state.rescue;
  const out: { id: string; name: string; x: number; z: number; status: LostStatus }[] = [];
  for (const v of sim.data.mech.villagers) {
    const st = r.status[v.id];
    if (st === 'following' || st === 'waiting') out.push({ id: v.id, name: v.name, ...r.pos[v.id], status: st });
  }
  return out;
}

export function foundCount(sim: Sim): number {
  let n = 0;
  for (const id in sim.state.rescue.status) if (sim.state.rescue.status[id] === 'home') n++;
  return n;
}

export function updateRescue(sim: Sim, dt: number): void {
  const r = sim.state.rescue;
  if (r.lantern <= 0) return;
  const m = sim.data.mech;
  const p = sim.state.player;
  const glow = glowRadius(sim);
  const maxF = m.maxFollowers[Math.min(r.lantern, m.maxFollowers.length - 1)];

  // The lantern glows whenever the player is out in the cold (warmth makes it unnecessary).
  // Half a metre of hysteresis either side of the warmth edge so it does not flicker.
  const lit = r.lit ? !isWarm(sim, p.x, p.z, 0.5) : !isWarm(sim, p.x, p.z, -0.5);
  if (lit !== !!r.lit) {
    r.lit = lit;
    sim.emit({ type: lit ? 'lanternOn' : 'lanternOff' });
  }

  // Dig out the nearest buried villager the player stands by (automatic, ~1.5 s).
  let near: LostVillagerDef | null = null;
  let nd = 1.4;
  if (r.followers.length < maxF) {
    for (const v of m.villagers) {
      if (!diggable(sim, v)) continue;
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < nd) {
        nd = d;
        near = v;
      }
    }
  }
  if (!near) r.dig = null;
  else {
    if (!r.dig || r.dig.id !== near.id) {
      r.dig = { id: near.id, t: 0 };
      sim.emit({ type: 'digStart', id: near.id });
    }
    r.dig.t += dt;
    if (r.dig.t >= m.digTime) {
      r.dig = null;
      r.status[near.id] = 'following';
      r.pos[near.id] = { x: near.x, z: near.z };
      r.followers.push(near.id);
      sim.emit({ type: 'rescued', id: near.id });
    }
  }

  // Waiting villagers rejoin when the glow reaches them again.
  for (const id in r.status) {
    if (r.status[id] !== 'waiting' || r.followers.length >= maxF) continue;
    const q = r.pos[id];
    if (Math.hypot(q.x - p.x, q.z - p.z) <= glow) {
      r.status[id] = 'following';
      r.followers.push(id);
    }
  }

  // The conga line: each follower trails the one ahead at ~1 m, at the player's pace.
  const sp = Math.max(3.6, Math.hypot(p.vx, p.vz) * 1.1) * dt;
  let lead = { x: p.x, z: p.z };
  for (let i = 0; i < r.followers.length; i++) {
    const id = r.followers[i];
    const q = r.pos[id];
    const dx = lead.x - q.x;
    const dz = lead.z - q.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.0) {
      const k = Math.min(sp, d - 1.0) / d;
      q.x += dx * k;
      q.z += dz * k;
    }
    lead = q;
  }

  // Outside the glow: stop and wait, safe. Inside any warmth: home.
  for (let i = r.followers.length - 1; i >= 0; i--) {
    const id = r.followers[i];
    const q = r.pos[id];
    if (isWarm(sim, q.x, q.z, 1.0)) {
      r.followers.splice(i, 1);
      goHome(sim, id, q);
    } else if (Math.hypot(q.x - p.x, q.z - p.z) > glow) {
      r.followers.splice(i, 1);
      r.status[id] = 'waiting';
      sim.emit({ type: 'followerWait', id });
    }
  }
  for (const id in r.status) {
    if (r.status[id] === 'waiting' && isWarm(sim, r.pos[id].x, r.pos[id].z, 1.0)) goHome(sim, id, r.pos[id]);
  }
}

function goHome(sim: Sim, id: string, at: { x: number; z: number }): void {
  const r = sim.state.rescue;
  const m = sim.data.mech;
  r.status[id] = 'home';
  delete r.pos[id];
  sim.addStat('rescued', 1);
  sim.addPopulation(1);
  sim.addEmbers(at, m.rescueBonus, 'embers_rescue');
  sim.emit({ type: 'followerHome', id });
  const v = m.villagers.find((x) => x.id === id)!;
  if (!r.areaDone[v.area] && m.villagers.every((x) => x.area !== v.area || r.status[x.id] === 'home')) {
    r.areaDone[v.area] = true;
    sim.addEmbers(at, m.areaFoundBonus, 'embers_rescue');
    sim.emit({ type: 'areaAllFound', area: v.area });
  }
  if (!r.all && m.villagers.every((x) => r.status[x.id] === 'home')) {
    r.all = true;
    sim.state.unlocked.allFound = true;
    sim.invalidateSolids();
    sim.emit({ type: 'allFound' });
  }
}
