import { SAVE_VERSION, type SimState } from './state';

/** The v1 quest chain, frozen: v1 saves stored only a quest index (v2 also stores the quest id). */
const V1_QUEST_IDS = ['q_fish', 'q_cook', 'q_serve3', 'q_pack1', 'q_kettleB', 'q_serve12', 'q_counterB', 'q_pop10', 'q_porter', 'q_beltA', 'q_crateB', 'q_pack2', 'q_pop25', 'q_cook_hire', 'q_hearth2', 'q_chop', 'q_fuel', 'q_sawmill', 'q_planks', 'q_cabin1', 'q_pack3', 'q_axe', 'q_pots', 'q_pop45', 'q_lumberjack', 'q_boots', 'q_cabin2', 'q_woodbelt', 'q_pop70', 'q_stoker', 'q_cabin3', 'q_hearth3', 'q_more'];

/** Migrations keyed by the version they upgrade FROM. Each returns state at version+1. */
const MIGRATIONS: Record<number, (s: any) => any> = {
  // v1 → v2: Areas 3–5, finale and Open Season. The quest index is re-anchored by id (normalizeState);
  // v1's final placeholder 'q_more' becomes the first Frozen Lake quest.
  1: (s) => ({
    ...s,
    version: 2,
    quest: { ...s.quest, id: V1_QUEST_IDS[s.quest?.index] === 'q_more' ? 'q_lakefish' : V1_QUEST_IDS[s.quest?.index] },
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
