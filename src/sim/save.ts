import { SAVE_VERSION, type SimState } from './state';

/** Migrations keyed by the version they upgrade FROM. Each returns state at version+1. */
const MIGRATIONS: Record<number, (s: any) => any> = {
  // v1 → v2: Areas 3–5, finale and Open Season. v1 content ended on the placeholder quest 'q_more'
  // (index 32); the Frozen Lake chain now starts at that index, so the quest index carries over as is.
  1: (s) => ({
    ...s,
    version: 2,
    quest: { ...s.quest, id: s.quest?.index === 32 ? 'q_lakefish' : undefined },
    beacon: 0,
    finale: { phase: 'none', t: 0, progress: 0 },
    tools: { ...(s.pads?.pad_axe?.done ? { axe: 1 } : {}), ...(s.pads?.pad_pots?.done ? { kettle: 1 } : {}) },
    orders: [],
    nextOrderId: 1,
    season: 1,
    totals: {
      served: s.stats?.served ?? 0,
      thawed: s.stats?.thawed ?? 0,
      embersEarned: s.stats?.embersEarned ?? 0,
      carried: 0,
      distance: 0,
      playTime: s.time ?? 0,
      ordersDone: 0,
      upgrades: 0,
      decorations: 0,
    },
    mods: { ...s.mods, fishSpeed: 1, mineSpeed: 1, priceMul: 1 },
  }),
};

export function migrate(raw: { v?: number; state?: any }): SimState {
  if (!raw || typeof raw !== 'object' || !raw.state) throw new Error('Not a Frostkettle save');
  let v = raw.v ?? raw.state.version ?? 1;
  let s = raw.state;
  if (v > SAVE_VERSION) throw new Error(`Save is from a newer version (${v})`);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`No migration from save version ${v}`);
    s = m(s);
    v++;
  }
  s.version = SAVE_VERSION;
  return s as SimState;
}

/** Text code for export/import (base64 of the JSON, URL-safe). */
export function encodeSaveCode(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'FK1:' + btoa(bin);
}

export function decodeSaveCode(code: string): string {
  const c = code.trim();
  if (c.startsWith('{')) return c;
  const body = c.startsWith('FK1:') ? c.slice(4) : c;
  const bin = atob(body.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
