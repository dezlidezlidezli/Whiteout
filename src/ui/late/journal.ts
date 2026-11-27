// The Journal: a bottom sheet (same look as Settings) with Stats, Valley and — once the rescue
// mechanic exists in the sim state — a "Found" page listing the lost villagers (x / 24).
// Opened from a small book button in the HUD's top row, shown only once it is relevant.

import type { Sim } from '../../sim';
import { ICON_BOOK } from './icons';
import { fmt } from './orders';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface LostVillager { id: string; name: string; line: string; area: string }
export interface RescueInfo { villagers: LostVillager[]; found: Set<string>; total: number }

/**
 * Read the rescue mechanic from whatever shape the sim gives it (it is being built elsewhere).
 * Returns null while the state key does not exist, so the page simply is not offered.
 */
export function rescueInfo(sim: Sim): RescueInfo | null {
  const st = (sim.state as unknown as Record<string, unknown>).rescue as Record<string, unknown> | undefined;
  if (!st || typeof st !== 'object') return null;
  const data = sim.data as unknown as Record<string, unknown>;
  const rd = (data.rescue ?? {}) as Record<string, unknown>;
  const rawList = (rd.villagers ?? rd.lost ?? data.lostVillagers ?? data.lost ?? []) as Record<string, unknown>[];
  const villagers: LostVillager[] = Array.isArray(rawList)
    ? rawList.map((v, i) => ({
        id: String(v.id ?? i),
        name: String(v.name ?? `Villager ${i + 1}`),
        line: String(v.line ?? v.flavour ?? v.flavor ?? v.text ?? ''),
        area: String(v.area ?? ''),
      }))
    : [];
  const found = new Set<string>();
  const take = (src: unknown) => {
    if (Array.isArray(src)) for (const x of src) found.add(String(typeof x === 'object' && x ? (x as { id?: unknown }).id : x));
    else if (src && typeof src === 'object') {
      for (const [k, v] of Object.entries(src)) {
        if (v === true || (typeof v === 'number' && v > 0)) found.add(k);
        else if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          if (o.found || o.home || o.rescued || o.state === 'home' || o.phase === 'home') found.add(k);
        }
      }
    }
  };
  take(st.found ?? st.home ?? st.rescued ?? st.villagers);
  const total = villagers.length || Number((rd.total as number) ?? 24) || 24;
  return { villagers, found, total };
}

type Page = 'stats' | 'valley' | 'found';

export class Journal {
  readonly button: HTMLButtonElement;
  private back: HTMLDivElement;
  private sheet: HTMLDivElement;
  private tabs: HTMLDivElement;
  private body: HTMLDivElement;
  private page: Page = 'stats';
  private tabBtns = new Map<Page, HTMLButtonElement>();
  isOpen = false;
  private shownBtn = false;

  constructor(private root: HTMLElement, private getSim: () => Sim, private tap: () => void) {
    this.button = h('button', 'fk-btn fk-journal-btn fk-hidden', ICON_BOOK);
    this.button.type = 'button';
    this.button.setAttribute('data-ui', '');
    this.button.setAttribute('aria-label', 'Journal');
    this.button.addEventListener('click', () => {
      this.tap();
      this.open();
    });
    this.mountButton();

    this.back = h('div', 'fk-sheet-back');
    this.back.setAttribute('data-ui', '');
    this.sheet = h('div', 'fk-sheet fk-journal');
    this.sheet.setAttribute('data-ui', '');
    this.back.style.display = 'none';
    this.sheet.style.display = 'none';
    this.back.addEventListener('click', () => this.close());
    const title = h('h2', '', 'Journal');
    const close = h('button', 'fk-act fk-close', '×');
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => {
      this.tap();
      this.close();
    });
    title.appendChild(close);
    this.tabs = h('div', 'fk-seg fk-jtabs');
    for (const [p, name] of [['stats', 'Stats'], ['valley', 'Valley'], ['found', 'Found']] as [Page, string][]) {
      const b = h('button', '', name);
      b.type = 'button';
      b.addEventListener('click', () => {
        this.tap();
        this.show(p);
      });
      this.tabBtns.set(p, b);
      this.tabs.appendChild(b);
    }
    this.body = h('div', 'fk-jbody');
    this.sheet.append(title, this.tabs, this.body);
    root.append(this.back, this.sheet);
  }

  /** Put the book button in the HUD's top-right row, before the settings gear. */
  private mountButton(): void {
    const row = this.root.querySelector('.fk-top .fk-row');
    const gear = row?.querySelector('button[aria-label="Settings"]');
    if (row && gear) row.insertBefore(this.button, gear);
    else if (row) row.appendChild(this.button);
    else this.root.appendChild(this.button);
  }

  /** Relevance: the Journal appears once the Great Beacon has been started (late game) or Open Season. */
  update(sim: Sim): void {
    const want = sim.state.beacon > 0 || sim.state.finale.phase !== 'none';
    if (want !== this.shownBtn) {
      this.shownBtn = want;
      this.button.classList.toggle('fk-hidden', !want);
      if (want && !this.button.isConnected) this.mountButton();
      this.mountSettingsEntry(want);
    }
    // The top row is tight on narrow phones: if the book would push the gear off screen, the
    // Journal stays reachable from Settings only.
    if (want && ++this.fitTick % 30 === 0) {
      const row = this.button.parentElement;
      const gear = row?.querySelector('button[aria-label="Settings"]') as HTMLElement | null;
      this.button.classList.remove('fk-jsqueezed');
      if (gear && gear.getBoundingClientRect().right > window.innerWidth - 4) this.button.classList.add('fk-jsqueezed');
    }
  }

  private fitTick = 0;
  private settingsBtn: HTMLButtonElement | null = null;

  /** An "Open Journal" button in the Settings sheet, under "Your camp". */
  private mountSettingsEntry(on: boolean): void {
    if (!on) {
      this.settingsBtn?.remove();
      this.settingsBtn = null;
      return;
    }
    if (this.settingsBtn?.isConnected) return;
    const sheet = Array.from(this.root.querySelectorAll('.fk-sheet')).find((e) => !e.classList.contains('fk-journal'));
    const stats = sheet?.querySelector('.fk-stats');
    if (!sheet || !stats) return;
    const b = h('button', 'fk-act fk-jsettings', 'Open Journal');
    b.type = 'button';
    b.addEventListener('click', () => {
      this.tap();
      (sheet.querySelector('.fk-close') as HTMLButtonElement | null)?.click();
      window.setTimeout(() => this.open(), 120);
    });
    stats.after(b);
    this.settingsBtn = b;
  }

  open(): void {
    this.isOpen = true;
    const hasFound = !!rescueInfo(this.getSim());
    this.tabBtns.get('found')!.style.display = hasFound ? '' : 'none';
    if (this.page === 'found' && !hasFound) this.page = 'stats';
    this.show(this.page);
    this.back.style.display = '';
    this.sheet.style.display = '';
    this.sheet.scrollTop = 0;
    requestAnimationFrame(() => {
      this.back.classList.add('fk-open');
      this.sheet.classList.add('fk-open');
    });
  }

  close(): void {
    this.isOpen = false;
    this.back.classList.remove('fk-open');
    this.sheet.classList.remove('fk-open');
    window.setTimeout(() => {
      if (!this.isOpen) {
        this.back.style.display = 'none';
        this.sheet.style.display = 'none';
      }
    }, 300);
  }

  show(p: Page): void {
    this.page = p;
    for (const [k, b] of this.tabBtns) b.classList.toggle('fk-sel', k === p);
    const sim = this.getSim();
    this.body.innerHTML = p === 'stats' ? statsPage(sim) : p === 'valley' ? valleyPage(sim) : foundPage(sim);
  }
}

function row(label: string, value: string, icon = ''): string {
  return `<div class="fk-jrow"><span>${icon}${esc(label)}</span><b>${value}</b></div>`;
}

export function playTime(sec: number): string {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function statsPage(sim: Sim): string {
  const s = sim.state;
  const t = s.totals;
  const km = t.distance / 1000;
  return `<h3>Your story so far</h3>
    ${row('Villagers thawed', fmt(t.thawed))}
    ${row('Dishes served', fmt(t.served))}
    ${row('Embers earned', fmt(t.embersEarned))}
    ${row('Items carried', fmt(t.carried))}
    ${row('Distance walked', km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(t.distance)} m`)}
    ${row('Time by the fire', playTime(t.playTime))}
    <h3>Open Season</h3>
    ${row('Caravan orders filled', fmt(t.ordersDone))}
    ${row('Upgrades bought', fmt(t.upgrades))}
    ${row('Decorations', fmt(t.decorations))}
    ${row('Season', String(s.season))}`;
}

function valleyPage(sim: Sim): string {
  const s = sim.state;
  const d = sim.data;
  const areas = d.areas
    .map((a) => {
      const open = !!s.areasOpen[a.id];
      return `<div class="fk-jarea ${open ? 'fk-on' : ''}"><i>${open ? '✓' : '❄'}</i><span>${esc(a.name)}</span><small>${open ? 'open' : `Hearth ${a.hearth}`}</small></div>`;
    })
    .join('');
  const maxHearth = d.balance.warmRadius.length;
  const lit = s.finale.phase !== 'none';
  const beacon = lit ? 'Lit — the Long Night is over' : `${s.beacon} / 4 stages`;
  const helpers = Object.keys(s.helpers).length;
  const decoPads = d.pads.filter((p) => p.group === 'decor');
  const decoDone = decoPads.filter((p) => s.pads[p.id]?.done).length;
  return `<h3>Areas</h3><div class="fk-jareas">${areas}</div>
    <h3>Camp</h3>
    ${row('Hearth', `level ${s.hearth.level} / ${maxHearth}`)}
    ${row('Great Beacon', beacon)}
    ${row('Villagers at camp', fmt(s.population))}
    ${row('Helpers hired', String(helpers))}
    ${decoPads.length ? row('Decorations placed', `${decoDone} / ${decoPads.length}`) : ''}`;
}

function foundPage(sim: Sim): string {
  const r = rescueInfo(sim);
  if (!r) return '';
  const n = r.villagers.length ? r.villagers.filter((v) => r.found.has(v.id)).length : r.found.size;
  const cells = (r.villagers.length ? r.villagers : Array.from({ length: r.total }, (_, i) => ({ id: String(i), name: '', line: '', area: '' })))
    .map((v, i) => {
      const f = r.found.has(v.id);
      return `<div class="fk-jfound ${f ? 'fk-on' : ''}" style="--k:${i}"><i class="fk-jface" style="--h:${(i * 47) % 360}"></i><div><b>${f ? esc(v.name) : '???'}</b><small>${f ? esc(v.line) : 'Still out in the white…'}</small></div></div>`;
    })
    .join('');
  return `<h3>Found ${n} / ${r.total}</h3><div class="fk-jfounds">${cells}</div>`;
}
