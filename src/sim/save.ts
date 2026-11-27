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
    relocatePlayer: true, // the world layout changed in v2 (compact walled yards)
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

const BAD_CODE = 'That does not look like a complete Frostkettle save code. Copy the whole code and try again.';

/** Text code for export/import (base64 of the JSON, URL-safe). */
export function encodeSaveCode(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'FK1:' + btoa(bin);
}

export function decodeSaveCode(code: string): string {
  let c = code.trim();
  if (c.startsWith('{')) return c;
  // Be forgiving: notes apps, messengers and keyboards add spaces, line breaks, invisible marks or
  // text around the code, swap in look-alike characters, or drop the trailing "=" padding.
  const at = c.indexOf('FK1:');
  if (at >= 0) c = c.slice(at + 4);
  let body = c.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
  if (body.length < 8 || body.length % 4 === 1) throw new Error(BAD_CODE);
  while (body.length % 4) body += '=';
  let bin: string;
  try {
    bin = atob(body);
  } catch {
    throw new Error(BAD_CODE);
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const text = new TextDecoder().decode(bytes);
  if (!text.trimStart().startsWith('{')) throw new Error(BAD_CODE);
  return text;
}
