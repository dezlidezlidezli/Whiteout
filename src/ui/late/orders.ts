// Open Season orders tracker: a compact column of three caravan-order cards on the right edge.
// Pure display (pointer-events: none) so it never steals a touch from the floating joystick.

import type { Sim, SimEvent } from '../../sim';
import { ICON_EMBER_SM, ICON_TICK, itemIcon, itemName } from './icons';

const RING = 2 * Math.PI * 25;

interface Card {
  id: number;
  el: HTMLDivElement;
  ring: SVGCircleElement;
  num: HTMLDivElement;
  shown: number;
  got: number;
  n: number;
  leaving: boolean;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export class OrdersTracker {
  readonly el: HTMLDivElement;
  private list: HTMLDivElement;
  private season: HTMLDivElement;
  private cards = new Map<number, Card>();
  private seasonLv = -1;
  private visible = false;

  constructor(root: HTMLElement) {
    this.el = h('div', 'fk-orders fk-hidden');
    this.season = h('div', 'fk-ord-season');
    this.list = h('div', 'fk-ord-list');
    this.el.append(this.season, this.list);
    root.appendChild(this.el);
  }

  /** Forget every card (new sim loaded). */
  reset(): void {
    for (const c of this.cards.values()) c.el.remove();
    this.cards.clear();
    this.seasonLv = -1;
  }

  handle(e: SimEvent, sim: Sim): void {
    if (e.type === 'orderProgress') {
      const c = this.cards.get(e.order);
      if (c) {
        c.got = e.got;
        c.el.classList.remove('fk-ord-bump');
        void c.el.offsetWidth;
        c.el.classList.add('fk-ord-bump');
      }
    } else if (e.type === 'orderComplete') {
      const c = this.cards.get(e.order);
      if (c && !c.leaving) {
        c.got = c.n;
        c.leaving = true;
        c.el.classList.add('fk-ord-done');
        c.el.querySelector('.fk-ord-tick')!.innerHTML = ICON_TICK;
        window.setTimeout(() => c.el.classList.add('fk-ord-out'), 900);
        window.setTimeout(() => {
          c.el.remove();
          if (this.cards.get(e.order) === c) this.cards.delete(e.order);
        }, 1350);
      }
    } else if (e.type === 'seasonUp') {
      this.season.classList.remove('fk-ord-seasonup');
      void this.season.offsetWidth;
      this.season.classList.add('fk-ord-seasonup');
    }
    void sim;
  }

  update(sim: Sim, dt: number, hidden: boolean): void {
    const s = sim.state;
    const want = !hidden && s.finale.phase === 'done' && (s.orders.length > 0 || this.cards.size > 0);
    if (want !== this.visible) {
      this.visible = want;
      this.el.classList.toggle('fk-hidden', !want);
    }
    if (s.season !== this.seasonLv) {
      this.seasonLv = s.season;
      this.season.textContent = `Season ${s.season}`;
    }
    // Add cards for new orders (in board order), drop cards for orders that vanished without a completion.
    const live = new Set<number>();
    s.orders.forEach((o, i) => {
      live.add(o.id);
      let c = this.cards.get(o.id);
      if (!c) {
        c = this.makeCard(o.id, o.item, o.n, o.reward);
        c.got = o.got;
        this.cards.set(o.id, c);
        // Keep visual order = board order; leaving cards stay where they are until gone.
        const after = i > 0 ? this.cards.get(s.orders[i - 1].id)?.el : null;
        if (after && after.parentElement === this.list) after.after(c.el);
        else if (i === 0) this.list.prepend(c.el);
        else this.list.appendChild(c.el);
      }
      c.got = o.got;
      c.n = o.n;
    });
    for (const [id, c] of this.cards) {
      if (!live.has(id) && !c.leaving) {
        c.el.remove();
        this.cards.delete(id);
      }
    }
    for (const c of this.cards.values()) {
      if (c.shown === c.got) continue;
      c.shown += (c.got - c.shown) * Math.min(1, dt * 10);
      if (Math.abs(c.got - c.shown) < 0.02) c.shown = c.got;
      const f = Math.max(0, Math.min(1, c.shown / Math.max(1, c.n)));
      c.ring.style.strokeDashoffset = String(RING * (1 - f));
      c.num.textContent = `${Math.min(c.n, Math.round(c.shown))}/${c.n}`;
    }
  }

  private makeCard(id: number, item: string, n: number, reward: number): Card {
    const el = h('div', 'fk-ord fk-ord-in');
    el.setAttribute('aria-label', `Order: ${n} ${itemName(item, n)} for ${reward} embers`);
    el.innerHTML = `
      <div class="fk-ord-badge">
        <svg class="fk-ord-svg" viewBox="0 0 60 60" aria-hidden="true">
          <circle cx="30" cy="30" r="25" class="fk-ord-track"/>
          <circle cx="30" cy="30" r="25" class="fk-ord-fill" stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="${RING.toFixed(1)}"/>
        </svg>
        <div class="fk-ord-ico">${itemIcon(item)}</div>
        <div class="fk-ord-tick"></div>
      </div>
      <div class="fk-ord-num">0/${n}</div>
      <div class="fk-ord-rew"><i>${ICON_EMBER_SM}</i><span>${fmt(reward)}</span></div>`;
    window.setTimeout(() => el.classList.remove('fk-ord-in'), 600);
    const card: Card = {
      id, el, ring: el.querySelector('.fk-ord-fill') as SVGCircleElement, num: el.querySelector('.fk-ord-num') as HTMLDivElement,
      shown: -1, got: 0, n, leaving: false,
    };
    return card;
  }
}

export function fmt(n: number): string {
  if (n >= 100000) return `${Math.round(n / 1000)}k`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('en-US');
}
