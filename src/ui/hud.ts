// DOM HUD over the canvas: embers, population, quest chip, Cosy meter, toasts, floating numbers,
// first-touch hint and the settings sheet.

import './hud.css';
import type { Sim } from '../sim';
import { ackRehoused, housingInfo, type HousingInfo } from '../sim';
import type { SimEvent } from '../sim';
import { VERSION_LABEL } from '../platform/version';
import { ICON_CHECK, ICON_EMBER, ICON_FLAG, ICON_FLAME, ICON_GEAR, ICON_PEOPLE } from './icons';

export interface SettingsApi {
  getVolumes(): { sfx: number; music: number };
  setVolumes(v: { sfx?: number; music?: number }): void;
  getQuality(): 'auto' | 0 | 1 | 2;
  setQuality(q: 'auto' | 0 | 1 | 2): void;
  getSnow(): 0 | 1 | 2;
  setSnow(level: 0 | 1 | 2): void;
  exportCode(): string;
  importCode(code: string): string | null;
  reset(): void;
  stats(): string;
  tap(): void;
}

/** Little cabin with a lit window: the population pill reads homes used / capacity. */
const ICON_HOUSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.2 12 3.6l9 7.6" fill="none" stroke="#24324f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.2 10.2 12 4.6l6.8 5.6V20a.9.9 0 0 1-.9.9H6.1a.9.9 0 0 1-.9-.9z" fill="#cfe3ff" stroke="#24324f" stroke-width="1.2" stroke-linejoin="round"/><rect x="9.6" y="13.4" width="4.8" height="7.5" rx=".8" fill="#ffb347" stroke="#7a3a10" stroke-width="1"/><path d="M5 10.6 12 4.8l7 5.8" fill="none" stroke="#f4f8ff" stroke-width="1.6" stroke-linecap="round"/></svg>`;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

interface Floater {
  el: HTMLDivElement;
  x: number;
  y: number;
  t: number;
  max: number;
  world: { x: number; y: number; z: number };
}

export class Hud {
  readonly root: HTMLDivElement;
  private emberEl: HTMLSpanElement;
  private emberPill: HTMLDivElement;
  private popEl: HTMLSpanElement;
  private popPill: HTMLDivElement;
  private cosy: HTMLDivElement;
  private cosyBar: HTMLElement;
  private cosyTxt: HTMLSpanElement;
  private quest: HTMLDivElement;
  private qText: HTMLDivElement;
  private qBar: HTMLElement;
  private qNum: HTMLSpanElement;
  private qIco: HTMLDivElement;
  private toasts: HTMLDivElement;
  private floaters: HTMLDivElement;
  private hint: HTMLDivElement;
  /** Five taps on the population pill. */
  onSecretTap: () => void = () => {};
  private shownEmbers = 0;
  private targetEmbers = 0;
  private lastPop = -1;
  private capEl: HTMLSpanElement;
  private lastCap = -2;
  private housingT = 0;
  /** Capacity we already hinted "camp is full" for (one gentle hint per capacity level). */
  private hintedCap = -1;
  /** The guide marker should visit this pad for a while (set by the homes-full hint). */
  onNotePad: (pad: string) => void = () => {};
  private questTick = -1;
  private cosyKey = '';
  private hasFuel = false;
  private fuelCheckTick = -1;
  private lastQuest = '';
  private floats: Floater[] = [];
  private sheet: SettingsSheet;
  private toastQueue: { text: string; kind: string }[] = [];
  private toastBusy = 0;

  constructor(parent: HTMLElement, settings: SettingsApi) {
    this.root = h('div', 'fk-ui');
    parent.appendChild(this.root);
    this.floaters = h('div', 'fk-floaters');
    this.root.appendChild(this.floaters);

    const top = h('div', 'fk-top');
    const left = h('div', 'fk-col');
    this.emberPill = h('div', 'fk-pill fk-ember', `<span class="fk-ico">${ICON_EMBER}</span>`);
    this.emberEl = h('span', '', '0');
    this.emberPill.appendChild(this.emberEl);
    this.cosy = h('div', 'fk-pill fk-cosy fk-off', `<span class="fk-ico">${ICON_FLAME}</span>`);
    const bar = h('div', 'fk-bar', '<i></i>');
    this.cosyBar = bar.firstElementChild as HTMLElement;
    this.cosyTxt = h('span', '', 'Feed logs');
    this.cosy.append(bar, this.cosyTxt);
    this.cosy.style.display = 'none';
    left.append(this.emberPill, this.cosy);
    const right = h('div', 'fk-row');
    this.popPill = h('div', 'fk-pill fk-pop', `<span class="fk-ico">${ICON_HOUSE}</span>`);
    this.popPill.setAttribute('aria-label', 'Villagers housed / homes');
    this.popEl = h('span', '', '0');
    this.capEl = h('span', 'fk-cap', '');
    this.popPill.append(this.popEl, this.capEl);
    void ICON_PEOPLE;
    // Hidden diagnostics toggle: five quick taps on the population pill.
    this.popPill.setAttribute('data-ui', '');
    this.popPill.style.pointerEvents = 'auto';
    let taps = 0;
    let tapT = 0;
    this.popPill.addEventListener('pointerdown', () => {
      const now = performance.now();
      taps = now - tapT < 600 ? taps + 1 : 1;
      tapT = now;
      if (taps >= 5) {
        taps = 0;
        this.onSecretTap();
      }
    });
    const gear = h('button', 'fk-btn', ICON_GEAR);
    gear.setAttribute('data-ui', '');
    gear.setAttribute('aria-label', 'Settings');
    right.append(this.popPill, gear);
    top.append(left, right);
    this.root.appendChild(top);

    this.quest = h('div', 'fk-quest');
    this.qIco = h('div', 'fk-qico', ICON_FLAG);
    const qb = h('div', 'fk-qbody');
    this.qText = h('div', 'fk-qtext');
    const qbar = h('div', 'fk-qbar', '<i></i>');
    this.qBar = qbar.firstElementChild as HTMLElement;
    qb.append(this.qText, qbar);
    this.qNum = h('span', 'fk-qnum');
    this.quest.append(this.qIco, qb, this.qNum);
    this.root.appendChild(this.quest);

    this.toasts = h('div', 'fk-toasts');
    this.root.appendChild(this.toasts);
    this.hint = h('div', 'fk-hint', 'Touch &amp; drag anywhere to walk');
    this.root.appendChild(this.hint);

    this.sheet = new SettingsSheet(this.root, settings);
    gear.addEventListener('click', () => {
      settings.tap();
      this.sheet.open();
    });
  }

  hideHint(): void {
    this.hint.classList.add('fk-gone');
  }

  showHint(show: boolean): void {
    this.hint.classList.toggle('fk-gone', !show);
  }

  get settingsOpen(): boolean {
    return this.sheet.isOpen;
  }

  /** Called when embers visually land in the wallet (counter animates towards sim value). */
  emberLand(): void {
    this.emberPill.classList.add('fk-bump');
    window.setTimeout(() => this.emberPill.classList.remove('fk-bump'), 90);
  }

  /** Sim events the HUD cares about directly (housing). */
  handleEvents(sim: Sim, events: SimEvent[]): void {
    for (const e of events) {
      if (e.type !== 'homesFull' || e.capacity === this.hintedCap) continue;
      // One gentle hint per capacity level, naming the next step; the guide marker visits its pad.
      const info = housingInfo(sim);
      const n = info.next;
      let text = '';
      if (n?.kind === 'cabin' && n.visible) text = `Camp is full — raise a cabin`;
      else if (n?.kind === 'hearth' && n.visible) text = `Camp is full — raise the Hearth for ${n.tents} more tents`;
      else if (n?.kind === 'cabin' || n?.kind === 'hearth') text = 'Camp is full — more homes come with the next upgrades';
      if (!text) continue;
      this.hintedCap = e.capacity;
      this.toast(text, 'note');
      const pad = e.pad ?? (n && n.kind !== 'tent' && n.visible ? n.pad : null);
      if (pad && n && n.kind !== 'tent' && n.visible) this.onNotePad(pad);
    }
  }

  private explainRehoused(sim: Sim, info: HousingInfo): void {
    const r = info.rehoused!;
    const everyone = Math.max(info.lifetimeThawed, r.from);
    const n = (v: number) => Math.round(v).toLocaleString('en-US');
    this.toast(`Your camp now counts the villagers it can house: ${n(r.to)}. Everyone you have thawed — ${n(everyone)} — is in the Journal.`, 'card');
    ackRehoused(sim);
  }

  toast(text: string, kind: string): void {
    this.toastQueue.push({ text, kind });
  }

  float(text: string, world: { x: number; y: number; z: number }, kind: string): void {
    if (this.floats.length > 24) {
      const f = this.floats.shift()!;
      f.el.remove();
    }
    const el = h('div', `fk-float fk-${kind}`, '') as HTMLDivElement;
    el.textContent = text;
    this.floaters.appendChild(el);
    this.floats.push({ el, x: 0, y: 0, t: 0, max: kind === 'big' ? 1.4 : 1.0, world: { ...world } });
  }

  update(sim: Sim, dt: number, project: (w: { x: number; y: number; z: number }) => { x: number; y: number; on: boolean }): void {
    const s = sim.state;
    // Ember counter eases towards the wallet so collection reads as a stream.
    this.targetEmbers = s.embers;
    const diff = this.targetEmbers - this.shownEmbers;
    if (diff !== 0) {
      const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt * 9)));
      this.shownEmbers = Math.abs(step) >= Math.abs(diff) ? this.targetEmbers : this.shownEmbers + step;
      this.emberEl.textContent = fmt(this.shownEmbers);
    }
    // Housing: "housed / homes", refreshed on change and twice a second (capacity moves with builds).
    this.housingT -= dt;
    if (s.population !== this.lastPop || this.housingT <= 0) {
      this.housingT = 0.5;
      const info = housingInfo(sim);
      if (s.population !== this.lastPop) {
        if (this.lastPop >= 0) {
          this.popPill.classList.add('fk-bump');
          window.setTimeout(() => this.popPill.classList.remove('fk-bump'), 110);
        }
        this.lastPop = s.population;
        this.popEl.textContent = fmt(s.population);
      }
      const cap = info.free === Infinity ? -1 : info.capacity;
      if (cap !== this.lastCap) {
        this.lastCap = cap;
        this.capEl.textContent = cap >= 0 ? `/${fmt(cap)}` : '';
      }
      this.popPill.classList.toggle('fk-full', cap > 0 && info.used >= cap);
      if (info.rehoused) this.explainRehoused(sim, info);
    }
    // Cosy meter (once logs exist).
    // Only touch the DOM when something actually changed.
    if (s.tick - this.fuelCheckTick > 30 || this.fuelCheckTick < 0) {
      this.fuelCheckTick = s.tick;
      this.hasFuel = sim.data.stations.some((d) => d.type === 'node' && d.item === 'log' && sim.isUsable(d.id));
    }
    const hasFuel = this.hasFuel;
    const pct = hasFuel ? Math.round(sim.fuelFraction() * 100) : -1;
    const key = `${hasFuel}|${pct}|${sim.cosy}`;
    if (key !== this.cosyKey) {
      this.cosyKey = key;
      this.cosy.style.display = hasFuel ? '' : 'none';
      this.root.classList.toggle('fk-has-cosy', hasFuel);
      if (hasFuel) {
        this.cosyBar.style.width = `${pct}%`;
        this.cosy.classList.toggle('fk-on', sim.cosy);
        this.cosy.classList.toggle('fk-off', !sim.cosy);
        this.cosyTxt.textContent = sim.cosy ? 'Cosy ×2' : 'Feed logs';
        this.cosyTxt.className = sim.cosy ? 'fk-x2' : '';
      }
    }
    // Quest chip.
    if (s.tick !== this.questTick) this.updateQuest(sim);
    this.questTick = s.tick;
    this.updateToastsAndFloaters(dt, project);
  }

  private updateQuest(sim: Sim): void {
    const q = sim.questProgress();
    const key = `${q.id}|${q.cur}|${q.max}`;
    if (key !== this.lastQuest) {
      const newQuest = !this.lastQuest.startsWith(q.id + '|');
      this.lastQuest = key;
      this.qText.textContent = q.text;
      const frac = q.max > 0 ? q.cur / q.max : 0;
      this.qBar.style.width = `${Math.round(frac * 100)}%`;
      this.qBar.parentElement!.style.display = q.final ? 'none' : '';
      const amt = q.final ? '' : questAmount(sim, q);
      this.qNum.innerHTML = amt.startsWith('@') ? `<span class="fk-qe">${ICON_EMBER}</span>${amt.slice(1)}` : amt;
      this.qIco.innerHTML = frac >= 1 ? ICON_CHECK : ICON_FLAG;
      this.quest.classList.toggle('fk-done', frac >= 1);
      if (newQuest) {
        this.quest.classList.add('fk-pop-in');
        window.setTimeout(() => this.quest.classList.remove('fk-pop-in'), 220);
      }
    }
  }

  private updateToastsAndFloaters(dt: number, project: (w: { x: number; y: number; z: number }) => { x: number; y: number; on: boolean }): void {
    // Toasts: one at a time, briefly.
    this.toastBusy -= dt;
    if (this.toastBusy <= 0 && this.toastQueue.length) {
      const t = this.toastQueue.shift()!;
      const el = h('div', `fk-toast fk-${t.kind}`);
      el.textContent = t.text;
      this.toasts.appendChild(el);
      const life = t.kind === 'card' ? 8000 : t.kind === 'note' ? 4200 : t.kind === 'area' ? 2600 : 1700;
      if (t.kind === 'card') {
        // A card stays a while; a tap puts it away.
        el.setAttribute('data-ui', '');
        el.addEventListener('pointerdown', () => { el.classList.add('fk-out'); window.setTimeout(() => el.remove(), 320); });
      }
      window.setTimeout(() => el.classList.add('fk-out'), life);
      window.setTimeout(() => el.remove(), life + 320);
      this.toastBusy = this.toastQueue.length > 2 ? 0.35 : 0.7;
      while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    }
    // Floaters rise from their world anchor.
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t >= f.max) {
        f.el.remove();
        this.floats.splice(i, 1);
        continue;
      }
      const p = project(f.world);
      const k = f.t / f.max;
      const rise = (1 - Math.pow(1 - k, 2)) * 60;
      const sc = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.6);
      f.el.style.transform = `translate(${p.x}px, ${p.y - rise}px) translate(-50%, -50%) scale(${sc.toFixed(3)})`;
      f.el.style.opacity = String(k > 0.7 ? (1 - k) / 0.3 : 1);
      f.el.style.visibility = p.on ? 'visible' : 'hidden';
    }
  }
}

/** Consistent units on the quest chip: what is still needed ("120 embers to go", "3/5"). */
function questAmount(sim: Sim, q: { id: string; cur: number; max: number }): string {
  const def = sim.data.quests.find((x) => x.id === q.id);
  const g = def?.goal;
  if (g && g.type === 'pad') {
    const rem = sim.padRemaining(g.pad);
    const mats = Object.entries(rem.mats).filter(([, n]) => (n ?? 0) > 0);
    if (rem.embers > 0) return `@${fmt(rem.embers)}`;
    if (mats.length) {
      const [k, n] = mats[0];
      const name = sim.data.items[k as keyof typeof sim.data.items]?.name.toLowerCase() ?? k;
      return `${n} ${name}${(n ?? 0) > 1 && !name.endsWith('s') ? 's' : ''}`;
    }
    return '';
  }
  if (q.max <= 1) return '';
  return `${fmt(Math.min(q.cur, q.max))}/${fmt(q.max)}`;
}

function fmt(n: number): string {
  if (n >= 100000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.floor(n));
}

class SettingsSheet {
  private back: HTMLDivElement;
  private sheet: HTMLDivElement;
  isOpen = false;
  private api: SettingsApi;
  private msg: HTMLDivElement;
  private stats: HTMLDivElement;
  private resetBtn: HTMLButtonElement;
  private armed = 0;

  constructor(root: HTMLElement, api: SettingsApi) {
    this.api = api;
    this.back = h('div', 'fk-sheet-back');
    this.back.setAttribute('data-ui', '');
    this.sheet = h('div', 'fk-sheet');
    this.sheet.setAttribute('data-ui', '');
    this.back.style.display = 'none';
    this.sheet.style.display = 'none';
    root.append(this.back, this.sheet);
    this.back.addEventListener('click', () => this.close());

    const title = h('h2', '', 'Settings');
    const close = h('button', 'fk-act fk-close', '×');
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.close());
    title.appendChild(close);
    this.sheet.appendChild(title);

    this.sheet.appendChild(h('h3', '', 'Sound'));
    const vol = api.getVolumes();
    this.sheet.appendChild(this.slider('Effects', vol.sfx, (v) => api.setVolumes({ sfx: v })));
    this.sheet.appendChild(this.slider('Music', vol.music, (v) => api.setVolumes({ music: v })));

    this.sheet.appendChild(h('h3', '', 'Graphics'));
    const seg = h('div', 'fk-seg');
    const opts: ['auto' | 0 | 1 | 2, string][] = [['auto', 'Auto'], [0, 'Smooth'], [1, 'Balanced'], [2, 'Pretty']];
    const btns: HTMLButtonElement[] = [];
    for (const [q, name] of opts) {
      const b = h('button', '', name);
      b.addEventListener('click', () => {
        api.tap();
        api.setQuality(q);
        btns.forEach((x, i) => x.classList.toggle('fk-sel', opts[i][0] === q));
      });
      b.classList.toggle('fk-sel', api.getQuality() === q);
      btns.push(b);
      seg.appendChild(b);
    }
    const ql = h('label', '', '<span>Graphics</span>');
    ql.appendChild(seg);
    this.sheet.appendChild(ql);
    const sseg = h('div', 'fk-seg');
    const sopts: [0 | 1 | 2, string][] = [[0, 'Off'], [1, 'Light'], [2, 'Full']];
    const sbtns: HTMLButtonElement[] = [];
    for (const [lv, name] of sopts) {
      const b = h('button', '', name);
      b.classList.toggle('fk-sel', api.getSnow() === lv);
      b.addEventListener('click', () => {
        api.tap();
        api.setSnow(lv);
        sbtns.forEach((x, i) => x.classList.toggle('fk-sel', sopts[i][0] === lv));
      });
      sbtns.push(b);
      sseg.appendChild(b);
    }
    const sl = h('label', '', '<span>Snowfall</span>');
    sl.appendChild(sseg);
    this.sheet.appendChild(sl);

    this.sheet.appendChild(h('h3', '', 'Save code'));
    const ta = h('textarea');
    ta.setAttribute('spellcheck', 'false');
    // A save code must arrive exactly as pasted: no autocorrect, capitalisation or smart punctuation.
    for (const a of ['autocorrect', 'autocapitalize', 'autocomplete']) ta.setAttribute(a, 'off');
    ta.placeholder = 'Tap “Export” to get your save code, or paste one here and tap “Import”.';
    this.sheet.appendChild(ta);
    const acts = h('div', 'fk-acts');
    const exp = h('button', 'fk-act', 'Export');
    const copy = h('button', 'fk-act', 'Copy');
    const imp = h('button', 'fk-act', 'Import');
    acts.append(exp, copy, imp);
    this.sheet.appendChild(acts);
    this.msg = h('div', 'fk-msg');
    this.sheet.appendChild(this.msg);
    exp.addEventListener('click', () => {
      api.tap();
      ta.value = api.exportCode();
      ta.select();
      this.msg.textContent = 'Keep this code somewhere safe.';
    });
    copy.addEventListener('click', async () => {
      api.tap();
      if (!ta.value) ta.value = api.exportCode();
      try {
        await navigator.clipboard.writeText(ta.value);
        this.msg.textContent = 'Copied!';
      } catch {
        ta.select();
        this.msg.textContent = 'Select the text and copy it.';
      }
    });
    imp.addEventListener('click', () => {
      api.tap();
      const err = api.importCode(ta.value);
      this.msg.textContent = err ? `Could not import: ${err}` : 'Save loaded!';
      if (!err) window.setTimeout(() => this.close(), 600);
    });

    this.sheet.appendChild(h('h3', '', 'Your camp'));
    this.stats = h('div', 'fk-stats');
    this.sheet.appendChild(this.stats);

    this.sheet.appendChild(h('h3', '', 'Start over'));
    this.resetBtn = h('button', 'fk-act fk-danger', 'Reset game');
    this.resetBtn.addEventListener('click', () => {
      api.tap();
      if (this.armed > performance.now()) {
        api.reset();
        this.disarm();
        this.close();
      } else {
        this.armed = performance.now() + 4000;
        this.resetBtn.textContent = 'Tap again to erase everything';
        this.resetBtn.classList.add('fk-armed');
        window.setTimeout(() => this.disarm(), 4000);
      }
    });
    this.sheet.appendChild(this.resetBtn);
    const ver = h('div', 'fk-msg');
    ver.style.cssText = 'margin-top:18px;text-align:center;opacity:.65;font-size:12px';
    ver.textContent = VERSION_LABEL;
    this.sheet.appendChild(ver);

    // Optional "update ready" hook from the PWA layer.
    window.addEventListener('fk-update-ready', () => {
      const pwa = (window as unknown as { __fkPwa?: { applyUpdate?: () => void } }).__fkPwa;
      if (!pwa?.applyUpdate || this.sheet.querySelector('.fk-update')) return;
      const b = h('button', 'fk-act fk-update', 'Update ready: restart');
      b.addEventListener('click', () => pwa.applyUpdate!());
      this.sheet.insertBefore(b, this.sheet.children[1]);
    });
  }

  private disarm(): void {
    this.armed = 0;
    this.resetBtn.textContent = 'Reset game';
    this.resetBtn.classList.remove('fk-armed');
  }

  private slider(name: string, value: number, on: (v: number) => void): HTMLLabelElement {
    const l = h('label', '', `<span>${name}</span>`);
    const r = h('input');
    r.type = 'range';
    r.min = '0';
    r.max = '1';
    r.step = '0.05';
    r.value = String(value);
    r.addEventListener('input', () => on(Number(r.value)));
    r.addEventListener('change', () => this.api.tap());
    l.appendChild(r);
    return l;
  }

  open(): void {
    this.isOpen = true;
    this.stats.innerHTML = this.api.stats();
    this.back.style.display = '';
    this.sheet.style.display = '';
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
}
