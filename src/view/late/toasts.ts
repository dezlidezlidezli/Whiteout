// Toast hygiene for the busy late game: everything the view toasts passes through here first.
//  - a burst of caravan order completions becomes one toast ("3 orders complete  +940")
//  - identical toasts waiting in line are merged, at most a few wait, and anything stale is dropped
//    (a toast is a moment, not a log), so nothing drips out minutes later
// The HUD still draws them; Open Season keeps them clear of the order tracker (late.css, .fk-os).

import type { SimEvent } from '../../sim';
import type { ViewHooks } from '../view';
import type { LateCtx, LatePart } from './ctx';

type Kind = Parameters<ViewHooks['toast']>[1];
interface Pending { text: string; kind: Kind; t: number }

const MAX_WAITING = 3;
const STALE = { area: 7, other: 4 };

export class ToastGate implements LatePart {
  private hooks: ViewHooks;
  private orig: ViewHooks['toast'];
  private pending: Pending[] = [];
  private nextAt = 0;
  private burst: { n: number; reward: number; t: number } | null = null;

  constructor(private ctx: LateCtx) {
    this.hooks = ctx.view['hooks'];
    this.orig = this.hooks.toast;
    this.hooks.toast = (text, kind) => this.push(text, kind);
  }

  private push(text: string, kind: Kind): void {
    const now = this.ctx.time;
    const same = this.pending.find((p) => p.text === text);
    if (same) {
      same.t = now;
      return;
    }
    this.pending.push({ text, kind, t: now });
    while (this.pending.length > MAX_WAITING) {
      const i = this.pending.findIndex((p) => p.kind !== 'area');
      this.pending.splice(i >= 0 ? i : 0, 1);
    }
  }

  /** How many are waiting (tests). */
  get waiting(): number {
    return this.pending.length;
  }

  handle(e: SimEvent): void {
    if (e.type !== 'orderComplete') return;
    const now = this.ctx.time;
    if (this.burst && now - this.burst.t < 1.5) {
      this.burst.n++;
      this.burst.reward += e.reward;
      this.burst.t = now;
    } else this.burst = { n: 1, reward: e.reward, t: now };
  }

  frame(): void {
    const now = this.ctx.time;
    if (this.burst && now - this.burst.t > 0.7) {
      const b = this.burst;
      this.burst = null;
      this.push(b.n === 1 ? `Order complete  +${b.reward}` : `${b.n} orders complete  +${b.reward}`, 'unlock');
    }
    this.pending = this.pending.filter((p) => now - p.t < (p.kind === 'area' ? STALE.area : STALE.other));
    if (this.pending.length && now >= this.nextAt) {
      const p = this.pending.shift()!;
      this.orig.call(this.hooks, p.text, p.kind);
      this.nextAt = now + (p.kind === 'area' ? 1.6 : 0.9);
    }
  }

  dispose(): void {
    this.hooks.toast = this.orig;
  }
}
