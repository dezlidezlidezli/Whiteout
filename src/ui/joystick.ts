// Floating virtual joystick (touch anywhere + drag) plus WASD/arrow keys.
// Pointer-event based and multi-touch safe: only the first active pointer steers.

export class Joystick {
  private el: HTMLDivElement;
  private knob: HTMLDivElement;
  private pid: number | null = null;
  private ox = 0;
  private oy = 0;
  private vx = 0;
  private vy = 0;
  private keys = new Set<string>();
  private radius = 56;
  /** Fires on every new touch (first-gesture audio unlock, skipping pans, etc.). */
  onTouch: () => void = () => {};

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'fk-stick';
    this.knob = document.createElement('div');
    this.knob.className = 'fk-knob';
    this.el.appendChild(this.knob);
    root.appendChild(this.el);
    window.addEventListener('pointerdown', this.down, { passive: false });
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('blur', () => {
      this.release();
      this.keys.clear();
    });
    window.addEventListener('keydown', (e) => {
      if (isEditable(e.target)) return;
      const k = keyName(e.key);
      if (k) {
        this.keys.add(k);
        this.onTouch();
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      const k = keyName(e.key);
      if (k) this.keys.delete(k);
    });
  }

  private down = (e: PointerEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && t.closest('[data-ui]')) return;
    this.onTouch();
    if (this.pid !== null) return;
    this.pid = e.pointerId;
    this.ox = e.clientX;
    this.oy = e.clientY;
    this.vx = 0;
    this.vy = 0;
    this.el.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
    this.knob.style.transform = '';
    this.el.classList.add('fk-on');
    e.preventDefault();
  };

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pid) return;
    let dx = e.clientX - this.ox;
    let dy = e.clientY - this.oy;
    const d = Math.hypot(dx, dy);
    // Floating: drag the base along when the thumb overshoots.
    if (d > this.radius * 1.35) {
      const k = (d - this.radius * 1.35) / d;
      this.ox += dx * k;
      this.oy += dy * k;
      dx = e.clientX - this.ox;
      dy = e.clientY - this.oy;
      this.el.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
    }
    const l = Math.hypot(dx, dy);
    const cl = Math.min(l, this.radius);
    const kx = l > 0 ? (dx / l) * cl : 0;
    const ky = l > 0 ? (dy / l) * cl : 0;
    this.knob.style.transform = `translate(${kx}px, ${ky}px)`;
    const mag = cl / this.radius;
    const dead = 0.12;
    const m = mag < dead ? 0 : Math.min(1, (mag - dead) / (1 - dead) * 1.15);
    this.vx = l > 0 ? (dx / l) * m : 0;
    this.vy = l > 0 ? (dy / l) * m : 0;
    e.preventDefault();
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pid) return;
    this.release();
  };

  private release(): void {
    this.pid = null;
    this.vx = 0;
    this.vy = 0;
    this.el.classList.remove('fk-on');
  }

  get active(): boolean {
    return this.pid !== null || this.keys.size > 0;
  }

  /** Movement on the ground plane: x = screen right, z = screen down (world +Z towards camera). */
  vector(): { x: number; z: number } {
    let x = this.vx;
    let z = this.vy;
    if (this.keys.size) {
      let kx = 0;
      let kz = 0;
      if (this.keys.has('left')) kx -= 1;
      if (this.keys.has('right')) kx += 1;
      if (this.keys.has('up')) kz -= 1;
      if (this.keys.has('down')) kz += 1;
      const l = Math.hypot(kx, kz) || 1;
      x = kx / l;
      z = kz / l;
    }
    return { x, z };
  }
}

function keyName(k: string): string | null {
  switch (k) {
    case 'w': case 'W': case 'ArrowUp': return 'up';
    case 's': case 'S': case 'ArrowDown': return 'down';
    case 'a': case 'A': case 'ArrowLeft': return 'left';
    case 'd': case 'D': case 'ArrowRight': return 'right';
    default: return null;
  }
}

function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
}
