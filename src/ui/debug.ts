// On-device diagnostics (?debug=1, or tap the population pill five times).
// Cheap: one small canvas redrawn ~8x/s, text updated twice a second.

import type { FrameStats } from '../platform/perf';
import type { View } from '../view/view';

const W = 180;
const H = 46;

export class DebugOverlay {
  private el: HTMLDivElement;
  private txt: HTMLPreElement;
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private acc = 0;
  private gacc = 0;
  private last = '';
  visible = true;

  constructor(root: HTMLElement, private stats: FrameStats, private extra: () => string) {
    this.el = document.createElement('div');
    this.el.setAttribute('data-ui', '');
    this.el.style.cssText =
      'position:absolute;left:calc(var(--safe-left,0px) + 6px);bottom:calc(var(--safe-bottom,0px) + 6px);z-index:50;' +
      'font:700 10.5px/1.35 ui-monospace,Menlo,monospace;color:#d8f0ff;background:rgba(4,8,18,.78);padding:5px 7px;' +
      'border-radius:8px;pointer-events:auto;max-width:240px';
    this.cv = document.createElement('canvas');
    this.cv.width = W * 2;
    this.cv.height = H * 2;
    this.cv.style.cssText = `width:${W}px;height:${H}px;display:block;margin-bottom:3px`;
    this.g = this.cv.getContext('2d')!;
    this.txt = document.createElement('pre');
    this.txt.style.cssText = 'margin:0;white-space:pre;font:inherit';
    const btn = document.createElement('button');
    btn.textContent = 'Copy report';
    btn.style.cssText = 'margin-top:4px;font:700 11px system-ui;padding:4px 8px;border-radius:6px;border:0;background:#ffb347;color:#3a1606';
    btn.addEventListener('click', async () => {
      const r = this.report();
      try {
        await navigator.clipboard.writeText(r);
        btn.textContent = 'Copied!';
      } catch {
        window.prompt('Copy this report:', r);
      }
      window.setTimeout(() => (btn.textContent = 'Copy report'), 1500);
    });
    this.el.append(this.cv, this.txt, btn);
    root.appendChild(this.el);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? '' : 'none';
  }

  /** One-line summary for bug reports. */
  report(): string {
    const s = this.stats.summary(600);
    return `FK perf | ${this.extra()} | fps ${s.fps.toFixed(1)} low1% ${s.low1.toFixed(1)} | dt avg ${s.dtAvg.toFixed(1)} max ${s.dtMax.toFixed(0)}ms long>25ms ${s.long}/600 | ` +
      `js sim ${s.sim.toFixed(2)} view ${s.view.toFixed(2)} hud ${s.hud.toFixed(2)} p95 ${s.js95.toFixed(2)} max ${s.jsMax.toFixed(1)}ms | ` +
      `steps avg ${s.stepsAvg.toFixed(2)} max ${s.stepsMax} | save ${this.stats.lastSaveMs.toFixed(1)}ms | ${navigator.userAgent}`;
  }

  update(dt: number, view: View): void {
    if (!this.visible) return;
    this.acc += dt;
    this.gacc += dt;
    if (this.gacc > 0.12) {
      this.gacc = 0;
      this.drawGraph();
    }
    if (this.acc < 0.5) return;
    this.acc = 0;
    const s = this.stats.summary(180);
    const v = view.stats();
    const c = view.renderer.domElement;
    const t =
      `${s.fps.toFixed(0)} fps  1%low ${s.low1.toFixed(0)}  steps ${s.stepsAvg.toFixed(1)}/${s.stepsMax}\n` +
      `js sim ${s.sim.toFixed(1)} view ${s.view.toFixed(1)} hud ${s.hud.toFixed(1)} ms\n` +
      `${v.calls} calls  ${(v.triangles / 1000).toFixed(0)}k tris  crowd ${v.crowd}\n` +
      `tier ${['Smooth', 'Balanced', 'Pretty'][v.quality]}  dpr ${view.dpr.toFixed(2)}  ${c.width}x${c.height}`;
    if (t !== this.last) {
      this.last = t;
      this.txt.textContent = t;
    }
  }

  private drawGraph(): void {
    const g = this.g;
    const st = this.stats;
    g.clearRect(0, 0, W * 2, H * 2);
    // 16.7 / 33.3 ms guides.
    const y = (ms: number) => H * 2 - Math.min(H * 2, (ms / 50) * H * 2);
    g.fillStyle = 'rgba(255,255,255,.15)';
    g.fillRect(0, y(16.7), W * 2, 1);
    g.fillRect(0, y(33.3), W * 2, 1);
    const n = Math.min(st.count, W);
    for (let k = 0; k < n; k++) {
      const i = (st.i - 1 - k + st.dt.length) % st.dt.length;
      const ms = st.dt[i];
      g.fillStyle = ms > 33.4 ? '#ff4d3a' : ms > 20 ? '#ffb347' : '#6fe39a';
      const x = (W - 1 - k) * 2;
      const yy = y(ms);
      g.fillRect(x, yy, 2, H * 2 - yy);
    }
  }
}
