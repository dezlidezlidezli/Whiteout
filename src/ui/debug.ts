// Tiny optional perf overlay (?debug=1): FPS, draw calls, triangles, crowd, CPU ms.

import type { View } from '../view/view';

export class DebugOverlay {
  private el: HTMLDivElement;
  private acc = 0;
  private frames = 0;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:absolute;left:calc(var(--safe-left,0px) + 6px);bottom:calc(var(--safe-bottom,0px) + 6px);' +
      'font:700 11px/1.35 ui-monospace,Menlo,monospace;color:#cfe;background:rgba(0,0,0,.55);padding:4px 7px;' +
      'border-radius:6px;pointer-events:none;white-space:pre;z-index:5';
    root.appendChild(this.el);
  }

  update(dt: number, view: View): void {
    this.acc += dt;
    this.frames++;
    if (this.acc < 0.5) return;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    const s = view.stats();
    this.el.textContent =
      `${fps.toFixed(0)} fps  q${s.quality}\n${s.calls} calls  ${(s.triangles / 1000).toFixed(0)}k tris\n` +
      `crowd ${s.crowd}  cpu ${s.cpuMs.toFixed(1)}ms`;
  }
}
