// End-of-campaign thank-you card: warm, short, with the player's own numbers and one button into
// Open Season. The camp keeps celebrating behind it (the overlay is translucent at the top).

import type { Sim } from '../../sim';
import { ICON_SUN } from './icons';
import { fmt } from './orders';
import { playTime } from './journal';

export class Credits {
  private el: HTMLDivElement | null = null;
  onClose: () => void = () => {};

  constructor(private root: HTMLElement, private tap: () => void) {}

  get open(): boolean {
    return !!this.el;
  }

  show(sim: Sim): void {
    if (this.el) return;
    const s = sim.state;
    const t = s.totals;
    const helpers = Object.keys(s.helpers).length;
    const km = t.distance / 1000;
    const stat = (n: string, label: string, k: number) => `<div class="fk-cr-stat" style="--k:${k}"><b>${n}</b><span>${label}</span></div>`;
    const el = document.createElement('div');
    el.className = 'fk-credits';
    el.setAttribute('data-ui', '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'The Long Night is over');
    el.innerHTML = `
      <div class="fk-cr-card">
        <div class="fk-cr-sun">${ICON_SUN}</div>
        <h1 class="fk-cr-l" style="--k:0">The Long Night is over</h1>
        <p class="fk-cr-l" style="--k:1">It started with one small kettle and a fire that would not go out.
          Bowl by bowl, you warmed a whole valley back to life.</p>
        <div class="fk-cr-stats">
          ${stat(fmt(t.thawed), 'villagers thawed', 2)}
          ${stat(fmt(t.served), 'dishes served', 3)}
          ${stat(fmt(t.embersEarned), 'embers earned', 4)}
          ${stat(fmt(s.population), 'friends at camp', 5)}
          ${stat(String(helpers), 'helpers hired', 6)}
          ${stat(km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(t.distance)} m`, 'walked in the snow', 7)}
        </div>
        <p class="fk-cr-l fk-cr-time" style="--k:8">${playTime(t.playTime)} by the fire</p>
        <p class="fk-cr-l fk-cr-thanks" style="--k:9">Thank you for keeping the kettle warm.</p>
        <p class="fk-cr-l fk-cr-next" style="--k:10">The caravans have heard. Open Season begins.</p>
        <button type="button" class="fk-cr-go fk-cr-l" style="--k:11">Into Open Season</button>
        <div class="fk-cr-l fk-cr-made" style="--k:12">Frostkettle — made with warmth</div>
      </div>`;
    this.root.appendChild(el);
    this.el = el;
    el.querySelector('.fk-cr-go')!.addEventListener('click', () => {
      this.tap();
      this.hide();
    });
    requestAnimationFrame(() => el.classList.add('fk-in'));
  }

  hide(): void {
    const el = this.el;
    if (!el) return;
    this.el = null;
    el.classList.remove('fk-in');
    el.classList.add('fk-leave');
    window.setTimeout(() => el.remove(), 700);
    this.onClose();
  }

  dispose(): void {
    this.el?.remove();
    this.el = null;
  }
}
