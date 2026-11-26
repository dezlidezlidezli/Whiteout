// localStorage save slots. Never lose a save: the previous good save is kept as a backup and
// anything unreadable is preserved under a ".broken" key instead of being overwritten.

const PREFIX = 'frostkettle.';

function ls(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class SaveStore {
  readonly key: string;
  constructor(slot = 'main') {
    this.key = `${PREFIX}save.${slot}`;
  }

  read(): string | null {
    const s = ls();
    if (!s) return null;
    try {
      return s.getItem(this.key) ?? s.getItem(this.key + '.bak');
    } catch {
      return null;
    }
  }

  readBackup(): string | null {
    try {
      return ls()?.getItem(this.key + '.bak') ?? null;
    } catch {
      return null;
    }
  }

  write(json: string): boolean {
    const s = ls();
    if (!s) return false;
    try {
      const prev = s.getItem(this.key);
      if (prev && prev !== json) s.setItem(this.key + '.bak', prev);
      s.setItem(this.key, json);
      return true;
    } catch {
      return false;
    }
  }

  /** Move an unreadable save aside so it is never silently destroyed. */
  quarantine(): void {
    const s = ls();
    if (!s) return;
    try {
      const cur = s.getItem(this.key);
      if (cur) s.setItem(this.key + '.broken', cur);
      s.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }

  clear(): void {
    const s = ls();
    if (!s) return;
    try {
      const cur = s.getItem(this.key);
      if (cur) s.setItem(this.key + '.reset-backup', cur);
      s.removeItem(this.key);
      s.removeItem(this.key + '.bak');
    } catch {
      /* ignore */
    }
  }
}

export function readPref<T>(name: string, fallback: T): T {
  try {
    const v = ls()?.getItem(PREFIX + 'pref.' + name);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writePref(name: string, v: unknown): void {
  try {
    ls()?.setItem(PREFIX + 'pref.' + name, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
