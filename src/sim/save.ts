import { SAVE_VERSION, type SimState } from './state';

/** Migrations keyed by the version they upgrade FROM. Each returns state at version+1. */
const MIGRATIONS: Record<number, (s: any) => any> = {
  // 1: (s) => ({ ...s, newField: 0, version: 2 }),
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
