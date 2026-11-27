// Open Season in the world: the notice board shows one paper per open order with a trader's
// caravan parked beside it, repeatable upgrade pads wear a level badge, decorations pop in with a
// flourish (and a short camera look), and order/season moments get their juice.

import * as THREE from 'three';
import type { PadDef } from '../../data/types';
import type { SimEvent } from '../../sim';
import { createProp } from '../models';
import { backOut, fxOf, hooksOf, rigOf, sfxAt, worldOf, type LateCtx, type LatePart } from './ctx';

interface Badge {
  def: PadDef;
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  key: string;
  pop: number;
}

export class Market implements LatePart {
  private caravan: THREE.Object3D;
  private caravanShown = 0;
  private caravanWant = false;
  private slots: (THREE.Object3D | null)[] = [];
  private slotS = [0, 0, 0];
  private slotPulse = [0, 0, 0];
  private badges: Badge[] = [];
  private boardObj: THREE.Object3D | null = null;
  private tasks: { at: number; fn: () => void }[] = [];
  private postedGate = -1;

  constructor(private ctx: LateCtx) {
    const v = ctx.view;
    this.caravan = createProp('caravan', { seed: 4 });
    this.caravan.visible = false;
    v.scene.add(this.caravan);
    for (const p of ctx.sim.data.pads) {
      if (p.group !== 'upgrade') continue;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 84;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
      sprite.scale.set(1.9, 0.62, 1);
      sprite.renderOrder = 21;
      sprite.visible = false;
      v.scene.add(sprite);
      this.badges.push({ def: p, sprite, canvas, tex, key: '', pop: 0 });
    }
    this.reset();
  }

  private get board() {
    return this.ctx.sim.stationDefs.get(this.ctx.sim.data.endless.board);
  }

  reset(): void {
    const b = this.board;
    this.boardObj = null;
    this.slots = [];
    this.caravanShown = this.open ? 1 : 0;
    this.slotS = [0, 0, 0];
    if (b) {
      // Park the caravan beside the board on whichever side is clearest of pads and stations.
      const rot = b.rot ?? 0;
      const sim = this.ctx.sim;
      const obstacles: { x: number; z: number }[] = [
        ...sim.data.pads.map((p) => ({ x: p.x, z: p.z })),
        ...sim.data.stations.filter((d) => d.id !== b.id).map((d) => ({ x: d.x, z: d.z })),
      ];
      let best = { x: b.x, z: b.z, score: -1, yaw: rot };
      for (const [lx, lz] of [[-2.7, -1.4], [2.7, -1.4], [-2.9, 0.2], [2.9, 0.2], [0, -2.8]]) {
        const x = b.x + lx * Math.cos(rot) + lz * Math.sin(rot);
        const z = b.z - lx * Math.sin(rot) + lz * Math.cos(rot);
        let score = Infinity;
        for (const o of obstacles) score = Math.min(score, Math.hypot(o.x - x, o.z - z));
        if (score > best.score + 0.3) best = { x, z, score, yaw: rot + (lx < 0 ? 0.35 : -0.35) };
      }
      this.caravan.position.set(best.x, 0, best.z);
      this.caravan.rotation.y = best.yaw;
    }
  }

  private get open(): boolean {
    return this.ctx.sim.state.finale.phase === 'done';
  }

  private later(sec: number, fn: () => void): void {
    this.tasks.push({ at: this.ctx.time + sec, fn });
  }

  handle(e: SimEvent): void {
    const v = this.ctx.view;
    const sim = this.ctx.sim;
    const fx = fxOf(v);
    const b = this.board;
    switch (e.type) {
      case 'orderPosted': {
        if (e.slot >= 0 && e.slot < 3) this.slotS[e.slot] = Math.min(this.slotS[e.slot], 0.01);
        // Several posted on one step (Open Season opening): one chime.
        if (this.ctx.time - this.postedGate > 0.5) {
          this.postedGate = this.ctx.time;
          sfxAt(v, 'orderNew', undefined, { volume: 0.8 });
        }
        if (b) fx.puff(b.x, 1.4, b.z, 4, 0.5, 0.6, 0.6);
        break;
      }
      case 'orderProgress': {
        const k = sim.state.orders.findIndex((o) => o.id === e.order);
        if (k >= 0 && k < 3) this.slotPulse[k] = 1;
        if (b && e.got % 4 === 0) fx.glint(b.x, 1.6, b.z, 3, 1);
        break;
      }
      case 'orderComplete': {
        if (b) {
          fx.ring(b.x, b.z, 3.2, 0xffd27a, 0.8);
          fx.glint(b.x, 1.6, b.z, 22, 3);
          this.caravanBounce = 1;
        }
        sfxAt(v, 'order');
        rigOf(v).shake(0.15, 0.25);
        break;
      }
      case 'seasonUp':
        hooksOf(v).toast(`Season ${e.level}! Bigger caravans are coming`, 'area');
        sfxAt(v, 'unlock', undefined, { volume: 0.8 });
        if (b) fx.ring(b.x, b.z, 6, 0xffb347, 1.4);
        break;
      case 'upgrade': {
        const d = sim.padDefs.get(e.pad);
        if (!d) break;
        hooksOf(v).float(e.maxed ? 'MAX!' : `Level ${e.level}`, new THREE.Vector3(d.x, 2.2, d.z), 'big');
        fx.glint(d.x, 0.8, d.z, 14, 2.2);
        const bd = this.badges.find((x) => x.def.id === e.pad);
        if (bd) bd.pop = 1;
        break;
      }
      case 'decorate': {
        const ids = e.ids;
        let cx = 0;
        let cz = 0;
        let n = 0;
        ids.forEach((id, i) => {
          const d = sim.data.decor.find((x) => x.id === id);
          if (!d) return;
          cx += d.x;
          cz += d.z;
          n++;
          this.later(0.55 + i * 0.22, () => {
            worldOf(v).unlock(id);
            fx.glint(d.x, 1.0, d.z, 12, 2);
            fx.ring(d.x, d.z, 1.8, 0xffe0a0, 0.6);
            sfxAt(v, 'arrive', d, { volume: 0.7, pitch: 1 + i * 0.12 });
          });
        });
        if (n) {
          const fx0 = cx / n;
          const fz0 = cz / n;
          const p = sim.state.player;
          // Show the new decorations when they are out of view.
          if (Math.hypot(fx0 - p.x, fz0 - p.z) > 6) rigOf(v).startPan(fx0, fz0, 2.2 + ids.length * 0.22);
          this.later(0.5 + ids.length * 0.22 + 0.3, () => sfxAt(v, 'questComplete', undefined, { volume: 0.6 }));
        }
        break;
      }
      default:
        break;
    }
  }

  private caravanBounce = 0;

  frame(dt: number): void {
    const t = this.ctx.time;
    if (this.tasks.length) {
      const due = this.tasks.filter((k) => k.at <= t);
      this.tasks = this.tasks.filter((k) => k.at > t);
      for (const k of due) k.fn();
    }
    const sim = this.ctx.sim;
    const s = sim.state;
    const v = this.ctx.view;
    const open = this.open;
    const title = v.title;

    // Caravan rolls in with Open Season.
    if (open && !this.caravanWant && this.caravanShown < 0.01) fxOf(v).puff(this.caravan.position.x, 0.2, this.caravan.position.z, 14, 1.6, 2);
    this.caravanWant = open;
    this.caravanShown = Math.max(0, Math.min(1, this.caravanShown + (open ? dt / 0.8 : -dt * 3)));
    this.caravan.visible = this.caravanShown > 0.001;
    if (this.caravan.visible) {
      this.caravanBounce = Math.max(0, this.caravanBounce - dt * 2.5);
      const sq = Math.sin(this.caravanBounce * Math.PI * 3) * this.caravanBounce * 0.06;
      const k = backOut(this.caravanShown);
      this.caravan.scale.set(k * (1 + sq), k * (1 - sq), k * (1 + sq));
    }

    // Board papers: one per open order.
    const b = this.board;
    if (b && !this.boardObj) {
      const sv = worldOf(v).stations.get(b.id);
      if (sv) {
        this.boardObj = sv.obj;
        this.slots = [0, 1, 2].map((k) => sv.obj.getObjectByName(`slot${k}`) ?? null);
      }
    }
    for (let k = 0; k < this.slots.length; k++) {
      const o = this.slots[k];
      if (!o) continue;
      const want = open && k < s.orders.length ? 1 : 0;
      this.slotS[k] += (want - this.slotS[k]) * Math.min(1, dt * (want ? 7 : 12));
      this.slotPulse[k] = Math.max(0, this.slotPulse[k] - dt * 5);
      o.visible = this.slotS[k] > 0.02;
      const sc = backOut(Math.min(1, this.slotS[k])) * (1 + this.slotPulse[k] * 0.08);
      o.scale.setScalar(Math.max(0.001, sc));
      o.rotation.z = this.slotPulse[k] * 0.08 * Math.sin(t * 30);
    }

    // Upgrade pad badge: only over the pad the player stands at (the market grid is dense).
    let nearest: Badge | null = null;
    let nd = 2.0;
    for (const bd of this.badges) {
      const d = Math.hypot(s.player.x - bd.def.x, s.player.z - bd.def.z);
      if (d < nd) {
        nd = d;
        nearest = bd;
      }
    }
    for (const bd of this.badges) {
      const ps = s.pads[bd.def.id];
      // Level badge once bought at least once (or while standing on it): the pad label already shows the price.
      const show = !title && !!ps && ps.visible && !ps.done && bd === nearest;
      bd.sprite.visible = show;
      if (!show) continue;
      bd.pop = Math.max(0, bd.pop - dt * 2.5);
      const lv = sim.padLevel(bd.def.id);
      const max = bd.def.repeat?.max;
      const key = `${lv}|${ps.hold ? 1 : 0}|${max ?? ''}`;
      if (key !== bd.key) {
        bd.key = key;
        drawBadge(bd.canvas, lv, max, !!ps.hold);
        bd.tex.needsUpdate = true;
      }
      const on = s.player.onPad === bd.def.id ? 0.15 : 0;
      const sc = 1 + bd.pop * 0.35 + on;
      bd.sprite.scale.set(1.9 * sc, 0.62 * sc, 1);
      bd.sprite.position.set(bd.def.x, 2.5 + on * 0.5 + Math.sin(t * 2 + bd.def.x) * 0.03, bd.def.z - 0.9);
    }
  }

  dispose(): void {
    this.caravan.removeFromParent();
    for (const b of this.badges) {
      b.sprite.removeFromParent();
      b.tex.dispose();
      (b.sprite.material as THREE.Material).dispose();
    }
  }
}

function drawBadge(c: HTMLCanvasElement, lv: number, max: number | undefined, hold: boolean): void {
  const g = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  g.clearRect(0, 0, W, H);
  const txt = hold ? `Level ${lv} ✓  step off to buy again` : lv === 0 ? 'Level 1: buy again and again' : max ? `Level ${lv} → ${lv + 1} of ${max}` : `Level ${lv} → ${lv + 1}`;
  g.font = '900 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const w = Math.min(W - 8, g.measureText(txt).width + 44);
  const x = (W - w) / 2;
  const grd = g.createLinearGradient(0, 8, 0, H - 8);
  if (hold) {
    grd.addColorStop(0, '#b8f0b0');
    grd.addColorStop(1, '#4caf6a');
  } else {
    grd.addColorStop(0, '#ffe7a6');
    grd.addColorStop(1, '#ffb347');
  }
  g.fillStyle = 'rgba(90,40,12,0.9)';
  g.beginPath();
  g.roundRect(x, 14, w, H - 22, 26);
  g.fill();
  g.fillStyle = grd;
  g.beginPath();
  g.roundRect(x, 8, w, H - 24, 26);
  g.fill();
  g.fillStyle = hold ? '#123a18' : '#3a1a08';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(txt, W / 2, H / 2 - 6, w - 24);
}
