// Snow plough (docs/MECHANICS.md §1): deep-snow zones as 0.5 m cell bitsets, wading without the plough,
// pushing a clean swath with it, finds revealed as their cell is cleared, and a reward per 100 % zone.

import type { DeepSnowZoneDef } from '../data/mechanics';
import type { Sim } from './sim';

export interface PloughState {
  /** 0 = no plough, 1 = plough, 2 = wide blade (full speed). */
  tier: number;
  /** Per zone: cleared-cell bitset (32 cells per word) and count. */
  zones: Record<string, { bits: number[]; cleared: number }>;
  /** Finds already revealed. */
  revealed: Record<string, true>;
  pushing: boolean;
  /** Cells cleared since the last snowCleared event, and time since. */
  acc: Record<string, number>;
  accT: number;
  /** Per-zone change counter for cheap re-rendering (not essential to save, but harmless). */
  ver: Record<string, number>;
}

export function createPlough(): PloughState {
  return { tier: 0, zones: {}, revealed: {}, pushing: false, acc: {}, accT: 0, ver: {} };
}

const dims = (sim: Sim, z: DeepSnowZoneDef) => {
  const c = sim.data.mech.cell;
  return { nx: Math.max(1, Math.round((z.x1 - z.x0) / c)), nz: Math.max(1, Math.round((z.z1 - z.z0) / c)), c };
};

function zoneState(sim: Sim, z: DeepSnowZoneDef) {
  const st = sim.state.plough;
  let zs = st.zones[z.id];
  if (!zs) {
    const { nx, nz } = dims(sim, z);
    zs = st.zones[z.id] = { bits: new Array(Math.ceil((nx * nz) / 32)).fill(0), cleared: 0 };
  }
  return zs;
}

/** Is cell (i, j) of zone clear? */
export function isCellClear(sim: Sim, zoneId: string, i: number, j: number): boolean {
  const z = sim.data.mech.deepSnow.find((d) => d.id === zoneId);
  if (!z) return true;
  const { nx } = dims(sim, z);
  const k = j * nx + i;
  return ((zoneState(sim, z).bits[k >> 5] >>> (k & 31)) & 1) === 1;
}

/** Deep snow under (x, z)? (an uncleared cell of an open area's zone) */
export function deepAt(sim: Sim, x: number, z: number): DeepSnowZoneDef | null {
  for (const d of sim.data.mech.deepSnow) {
    if (x < d.x0 || x >= d.x1 || z < d.z0 || z >= d.z1 || !sim.state.areasOpen[d.area]) continue;
    const { nx, c } = dims(sim, d);
    const k = Math.floor((z - d.z0) / c) * nx + Math.floor((x - d.x0) / c);
    if (((zoneState(sim, d).bits[k >> 5] >>> (k & 31)) & 1) === 0) return d;
  }
  return null;
}

/** View accessor: every zone with its grid, progress and change counter. */
export function deepSnowZones(sim: Sim): { id: string; x0: number; z0: number; nx: number; nz: number; cell: number; total: number; cleared: number; ver: number; open: boolean }[] {
  return sim.data.mech.deepSnow.map((z) => {
    const { nx, nz, c } = dims(sim, z);
    return { id: z.id, x0: z.x0, z0: z.z0, nx, nz, cell: c, total: nx * nz, cleared: zoneState(sim, z).cleared, ver: sim.state.plough.ver[z.id] ?? 0, open: !!sim.state.areasOpen[z.area] };
  });
}

/** View accessor: calls fn(x, z) for the centre of every still-deep cell of a zone. */
export function forEachDeepCell(sim: Sim, zoneId: string, fn: (x: number, z: number) => void): void {
  const z = sim.data.mech.deepSnow.find((d) => d.id === zoneId);
  if (!z) return;
  const { nx, nz, c } = dims(sim, z);
  const bits = zoneState(sim, z).bits;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (((bits[k >> 5] >>> (k & 31)) & 1) === 0) fn(z.x0 + (i + 0.5) * c, z.z0 + (j + 0.5) * c);
  }
}

export function zoneProgress(sim: Sim, zoneId: string): number {
  const z = sim.data.mech.deepSnow.find((d) => d.id === zoneId);
  if (!z) return 1;
  const { nx, nz } = dims(sim, z);
  return zoneState(sim, z).cleared / (nx * nz);
}

/** Player speed multiplier from deep snow just ahead (wading 45 %, pushing the plough 80 % / 100 %). */
export function ploughSpeed(sim: Sim, x: number, z: number, vx: number, vz: number): number {
  const sp = Math.hypot(vx, vz);
  const ax = sp > 0.1 ? x + (vx / sp) * 0.5 : x;
  const az = sp > 0.1 ? z + (vz / sp) * 0.5 : z;
  if (!deepAt(sim, ax, az) && !deepAt(sim, x, z)) return 1;
  const m = sim.data.mech;
  const t = sim.state.plough.tier;
  return t <= 0 ? m.wade : m.ploughSpeed[Math.min(t, m.ploughSpeed.length) - 1];
}

/** Each step: clear the blade swath around the player, reveal finds, pay completed zones. */
export function updatePlough(sim: Sim, dt: number): void {
  const st = sim.state.plough;
  const p = sim.state.player;
  const m = sim.data.mech;
  const moving = Math.hypot(p.vx, p.vz) > 0.3;
  let pushing = false;
  if (st.tier > 0 && moving) {
    const r = m.bladeRadius[Math.min(st.tier, m.bladeRadius.length) - 1];
    for (const z of m.deepSnow) {
      if (!sim.state.areasOpen[z.area] || p.x < z.x0 - r || p.x > z.x1 + r || p.z < z.z0 - r || p.z > z.z1 + r) continue;
      const { nx, nz, c } = dims(sim, z);
      const zs = zoneState(sim, z);
      const i0 = Math.max(0, Math.floor((p.x - r - z.x0) / c));
      const i1 = Math.min(nx - 1, Math.floor((p.x + r - z.x0) / c));
      const j0 = Math.max(0, Math.floor((p.z - r - z.z0) / c));
      const j1 = Math.min(nz - 1, Math.floor((p.z + r - z.z0) / c));
      let n = 0;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cx = z.x0 + (i + 0.5) * c;
        const cz = z.z0 + (j + 0.5) * c;
        if ((cx - p.x) ** 2 + (cz - p.z) ** 2 > r * r) continue;
        const k = j * nx + i;
        if (((zs.bits[k >> 5] >>> (k & 31)) & 1) === 1) continue;
        zs.bits[k >> 5] |= 1 << (k & 31);
        n++;
      }
      if (n === 0) continue;
      pushing = true;
      zs.cleared += n;
      st.ver[z.id] = (st.ver[z.id] ?? 0) + 1;
      st.acc[z.id] = (st.acc[z.id] ?? 0) + n;
      sim.addStat('snowCells', n);
      revealFinds(sim, z.id);
      if (zs.cleared >= nx * nz) {
        sim.emit({ type: 'zoneCleared', zone: z.id });
        sim.addEmbers({ x: (z.x0 + z.x1) / 2, z: (z.z0 + z.z1) / 2 }, z.reward, `embers_${z.id}`);
        sim.addStat('zonesCleared', 1);
      }
    }
  }
  if (pushing !== st.pushing) {
    st.pushing = pushing;
    sim.emit({ type: pushing ? 'ploughStart' : 'ploughStop' });
  }
  st.accT += dt;
  if (st.accT >= 0.15) {
    st.accT = 0;
    for (const id in st.acc) if (st.acc[id] > 0) sim.emit({ type: 'snowCleared', zone: id, cells: st.acc[id] });
    st.acc = {};
  }
}

function revealFinds(sim: Sim, zoneId: string): void {
  const st = sim.state.plough;
  for (const f of sim.data.mech.finds) {
    if (f.zone !== zoneId || st.revealed[f.id]) continue;
    const z = sim.data.mech.deepSnow.find((d) => d.id === zoneId)!;
    const { nx, c } = dims(sim, z);
    const i = Math.floor((f.x - z.x0) / c);
    const j = Math.floor((f.z - z.z0) / c);
    if (!isCellClear(sim, zoneId, i, j)) continue;
    void nx;
    st.revealed[f.id] = true;
    sim.emit({ type: 'findRevealed', find: f.id, kind: f.kind, x: f.x, z: f.z });
    if (f.kind === 'embers') sim.addEmbers({ x: f.x, z: f.z }, f.amount, `embers_${f.id}`);
    else if (f.kind === 'crate') sim.state.unlocked[f.station] = true;
    else if (f.kind === 'landmark') sim.state.unlocked[f.decor] = true;
    else sim.state.rescue.revealed[f.villager] = true;
    sim.state.unlocked[f.id] = true;
    sim.invalidateSolids();
  }
}
