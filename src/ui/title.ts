// Title overlay: wordmark + one big button ("Begin" / "Continue") and a small "New game".

import './title.css';
import { VERSION_LABEL } from '../platform/version';

const KETTLE_SVG = `<svg class="fk-kettle" viewBox="0 0 96 96" aria-hidden="true">
  <path class="fk-steam" d="M40 26c-6-6 6-10 0-18" fill="none" stroke="#f4f8ff" stroke-width="4" stroke-linecap="round" opacity=".8"/>
  <path class="fk-steam fk-s2" d="M54 24c-6-6 6-10 0-18" fill="none" stroke="#f4f8ff" stroke-width="4" stroke-linecap="round" opacity=".8"/>
  <ellipse cx="48" cy="84" rx="30" ry="6" fill="#000" opacity=".25"/>
  <path d="M16 56c0-14 14-24 32-24s32 10 32 24-12 26-32 26S16 70 16 56z" fill="#e0873a" stroke="#6a2a0c" stroke-width="3"/>
  <path d="M80 50c8-4 12 2 10 8l-6 4" fill="none" stroke="#6a2a0c" stroke-width="5" stroke-linecap="round"/>
  <path d="M26 46c6-6 14-8 22-8" fill="none" stroke="#ffd9a0" stroke-width="4" stroke-linecap="round" opacity=".8"/>
  <rect x="34" y="28" width="28" height="8" rx="4" fill="#b8642a" stroke="#6a2a0c" stroke-width="3"/>
  <circle cx="48" cy="25" r="4" fill="#ffd27a" stroke="#6a2a0c" stroke-width="2"/>
  <path d="M38 62c4 4 16 4 20 0" fill="none" stroke="#ffcf80" stroke-width="3" stroke-linecap="round" opacity=".8"/>
</svg>`;

export interface TitleOptions {
  hasSave: boolean;
  onBegin: () => void;
  onNewGame: () => void;
  onFirstTouch: () => void;
}

export class TitleScreen {
  private el: HTMLDivElement;
  private armed = 0;
  private done = false;

  constructor(root: HTMLElement, private opts: TitleOptions) {
    this.el = document.createElement('div');
    this.el.className = 'fk-title';
    this.el.setAttribute('data-ui', '');
    this.el.innerHTML = `
      <div class="fk-mark">${KETTLE_SVG}
        <div class="fk-word"><span class="fk-frost">Frost</span><span class="fk-kettleword">kettle</span></div>
        <div class="fk-tag">Keep the kettle warm. Thaw the valley.</div>
      </div>
      <div class="fk-actions">
        <button class="fk-begin" type="button">${opts.hasSave ? 'Continue' : 'Begin'}</button>
        ${opts.hasSave ? '<button class="fk-newgame" type="button">New game</button>' : ''}
      </div>
      <div class="fk-version">${VERSION_LABEL}</div>`;
    root.appendChild(this.el);
    root.classList.add('fk-titling');
    this.el.addEventListener('pointerdown', () => opts.onFirstTouch());
    this.el.querySelector('.fk-begin')!.addEventListener('click', () => this.finish(false));
    const ng = this.el.querySelector('.fk-newgame') as HTMLButtonElement | null;
    ng?.addEventListener('click', () => {
      if (this.armed > performance.now()) {
        this.finish(true);
        return;
      }
      this.armed = performance.now() + 4000;
      ng.textContent = 'Tap again to start over';
      ng.classList.add('fk-armed');
      window.setTimeout(() => {
        ng.textContent = 'New game';
        ng.classList.remove('fk-armed');
      }, 4000);
    });
  }

  get active(): boolean {
    return !this.done;
  }

  finish(newGame: boolean): void {
    if (this.done) return;
    this.done = true;
    if (newGame) this.opts.onNewGame();
    this.opts.onBegin();
    this.el.classList.add('fk-leave');
    this.el.parentElement?.classList.remove('fk-titling');
    window.setTimeout(() => this.el.remove(), 700);
  }
}
