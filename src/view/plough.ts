// Snow plough presentation (docs/MECHANICS.md §1). Only constructed when the plough mechanic is on.
// Deep-snow zones are instanced 0.5 m cells (art kit getDeepSnowMesh), rebuilt per zone only when the
// sim's per-zone version changes; freshly cleared edges get curled snow banks (getSnowBankMesh). The
// player wades (sinks, shuffles) without the plough and pushes it — prop, pose, spray, rising scrape —
// with it. Finds pop out with a thump; cleared lots celebrate.

import * as THREE from 'three';
import type { SimEvent } from '../sim';
import type { Sim } from '../sim';
import { deepAt, deepSnowZones, forEachDeepCell } from '../sim/plough';
import { createProp, getDeepSnowMesh, getSnowBankMesh } from './models';

const VARIANTS = 4;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function h01(a: number, b: number): number {
  let x = Math.imul((a * 73856093) ^ (b * 19349663), 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export interface PloughHooks {
  puff(x: number, y: number, z: number, n: number, radius: number, speed: number, scale: number): void;
  ring(x: number, z: number, size: number, color: number, dur: number): void;
  glint(x: number, y: number, z: number, n: number, sp: number): void;
  float(text: string, x: number, y: number, z: number, kind: 'ember' | 'info' | 'big'): void;
  toast(text: string, kind: 'unlock' | 'quest' | 'info' | 'area'): void;
  sfx(name: 'ploughFind' | 'zoneCleared' | 'dig', opts?: { pitch?: number; volume?: number }): void;
  groundAt(x: number, z: number): number;
}

export class PloughView {
  private deep: THREE.InstancedMesh[] = [];
  private banks: THREE.InstancedMesh;
  private key = '';
  private prop: THREE.Object3D;
  private label: THREE.Sprite;
  private labelCanvas: HTMLCanvasElement;
  private labelKey = '';
  private pushHold = 0;
  private pushTime = 0;
  private sprayT = 0;
  /** 0..1 scrape level for the `plough` ambience bed. */
  level = 0;
  /** Player presentation overrides read by Actors. */
  action: 'plough' | 'shuffle' | null = null;
  sink = 0;

  constructor(parent: THREE.Object3D, sim: Sim, private hooks: PloughHooks) {
    const total = deepSnowZones(sim).reduce((a, z) => a + z.total, 0) || 1;
    for (let v = 0; v < VARIANTS; v++) {
      const d = getDeepSnowMesh({ seed: v });
      const im = new THREE.InstancedMesh(d.geometry, d.material, total);
      im.count = 0;
      im.castShadow = false;
      im.receiveShadow = true;
      parent.add(im);
      this.deep.push(im);
    }
    const b = getSnowBankMesh({ seed: 1 });
    this.banks = new THREE.InstancedMesh(b.geometry, b.material, total);
    this.banks.count = 0;
    this.banks.receiveShadow = true;
    parent.add(this.banks);
    this.prop = createProp('plough');
    this.prop.visible = false;
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 256;
    this.labelCanvas.height = 96;
    const tex = new THREE.CanvasTexture(this.labelCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false }));
    this.label.scale.set(3.4, 1.28, 1);
    this.label.renderOrder = 55;
    this.label.visible = false;
    parent.add(this.label);
  }

  /** The plough rides in front of the player's rig. */
  attach(playerRoot: THREE.Object3D): void {
    this.prop.removeFromParent();
    this.prop.position.set(0, 0, 0.85);
    playerRoot.add(this.prop);
  }

  /** Rebuild the cell instances of every zone whose version changed. */
  private rebuild(sim: Sim): void {
    const zones = deepSnowZones(sim);
    let key = '';
    for (const z of zones) key += `${z.id}:${z.ver}:${z.open ? 1 : 0}|`;
    if (key === this.key) return;
    this.key = key;
    const counts = new Array(VARIANTS).fill(0);
    let nb = 0;
    for (const z of zones) {
      if (!z.open) continue;
      // Which cells are still deep (for edge banks)?
      const deep = new Uint8Array(z.nx * z.nz);
      forEachDeepCell(sim, z.id, (x, zz) => {
        const i = Math.floor((x - z.x0) / z.cell);
        const j = Math.floor((zz - z.z0) / z.cell);
        deep[j * z.nx + i] = 1;
        const v = Math.floor(h01(i, j) * VARIANTS) % VARIANTS;
        _e.set(0, Math.floor(h01(j, i) * 4) * (Math.PI / 2), 0);
        _q.setFromEuler(_e);
        _p.set(x, this.hooks.groundAt(x, zz), zz);
        const k = 0.96 + h01(i + 7, j) * 0.1;
        _s.set(k, 0.9 + h01(i, j + 3) * 0.2, k);
        this.deep[v].setMatrixAt(counts[v]++, _m.compose(_p, _q, _s));
      });
      // Cleared cells that border deep snow get a low curled bank (the clean cut edge).
      for (let j = 0; j < z.nz; j++) {
        for (let i = 0; i < z.nx; i++) {
          if (deep[j * z.nx + i]) continue;
          const nbr = (i > 0 && deep[j * z.nx + i - 1]) || (i < z.nx - 1 && deep[j * z.nx + i + 1]) || (j > 0 && deep[(j - 1) * z.nx + i]) || (j < z.nz - 1 && deep[(j + 1) * z.nx + i]);
          if (!nbr || h01(i * 3, j * 5) > 0.55) continue;
          const x = z.x0 + (i + 0.5) * z.cell;
          const zz = z.z0 + (j + 0.5) * z.cell;
          _e.set(0, h01(i, j) * Math.PI * 2, 0);
          _q.setFromEuler(_e);
          _p.set(x, this.hooks.groundAt(x, zz), zz);
          _s.set(0.45, 0.5, 0.45);
          this.banks.setMatrixAt(nb++, _m.compose(_p, _q, _s));
        }
      }
    }
    for (let v = 0; v < VARIANTS; v++) {
      this.deep[v].count = counts[v];
      this.deep[v].instanceMatrix.needsUpdate = true;
      this.deep[v].computeBoundingSphere();
    }
    this.banks.count = nb;
    this.banks.instanceMatrix.needsUpdate = true;
    this.banks.computeBoundingSphere();
  }

  update(sim: Sim, dt: number, px: number, pz: number, facing: number): void {
    this.rebuild(sim);
    const st = sim.state.plough;
    const p = sim.state.player;
    const speed = Math.hypot(p.vx, p.vz);
    if (st.pushing) this.pushHold = 0.35;
    else this.pushHold = Math.max(0, this.pushHold - dt);
    const pushing = this.pushHold > 0 && speed > 0.3;
    // Deployed whenever the player has the plough and stands in (or at the edge of) a deep zone.
    let inZone = false;
    let near: ReturnType<typeof deepSnowZones>[number] | null = null;
    for (const z of deepSnowZones(sim)) {
      if (!z.open) continue;
      const x1 = z.x0 + z.nx * z.cell;
      const z1 = z.z0 + z.nz * z.cell;
      if (px > z.x0 - 1 && px < x1 + 1 && pz > z.z0 - 1 && pz < z1 + 1) inZone = true;
      if (px > z.x0 - 5 && px < x1 + 5 && pz > z.z0 - 5 && pz < z1 + 5) near = z;
    }
    const deepHere = !!deepAt(sim, px, pz);
    this.prop.visible = st.tier > 0 && (inZone || pushing);
    this.prop.scale.setScalar(st.tier >= 2 ? 1.25 : 1);
    this.action = st.tier > 0 && this.prop.visible ? (speed > 0.3 ? 'plough' : null) : deepHere ? 'shuffle' : null;
    // Wading without the plough: knee-deep.
    const sinkWant = st.tier === 0 && deepHere ? 0.22 : 0;
    this.sink += (sinkWant - this.sink) * Math.min(1, dt * 8);
    // Scrape level rises the longer the push lasts.
    this.pushTime = pushing ? this.pushTime + dt : 0;
    const want = pushing ? Math.min(1, 0.35 + this.pushTime / 3) : 0;
    this.level += (want - this.level) * Math.min(1, dt * 6);
    // Snow curls off both ends of the blade.
    if (pushing) {
      this.sprayT -= dt;
      if (this.sprayT <= 0) {
        this.sprayT = 0.07;
        const fx = Math.sin(facing);
        const fz = Math.cos(facing);
        const w = st.tier >= 2 ? 1.2 : 0.85;
        for (const side of [-1, 1]) {
          const sx = px + fx * 0.95 + fz * side * w;
          const sz = pz + fz * 0.95 - fx * side * w;
          this.hooks.puff(sx, 0.35, sz, 1, 0.3, 1.4, 0.55);
        }
      }
    }
    // Lot progress label while nearby.
    if (near) {
      const pct = Math.floor((near.cleared / near.total) * 100);
      const key = `${near.id}:${pct}`;
      if (key !== this.labelKey) {
        this.labelKey = key;
        const g = this.labelCanvas.getContext('2d')!;
        g.clearRect(0, 0, 256, 96);
        g.fillStyle = 'rgba(20,28,50,0.82)';
        g.beginPath();
        g.roundRect(6, 10, 244, 76, 26);
        g.fill();
        g.strokeStyle = 'rgba(200,230,255,0.85)';
        g.lineWidth = 4;
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(28, 64, 200, 10);
        g.fillStyle = '#9fd4f5';
        g.fillRect(28, 64, 2 * pct, 10);
        g.fillStyle = '#eef6ff';
        g.font = '800 30px system-ui, -apple-system, sans-serif';
        g.textAlign = 'center';
        g.fillText(st.tier > 0 ? `Deep snow ${pct}%` : 'Deep snow: need a plough', 128, 46, 230);
        (this.label.material.map as THREE.Texture).needsUpdate = true;
      }
      const cx = near.x0 + (near.nx * near.cell) / 2;
      const cz = near.z0 + 1.2;
      this.label.position.set(Math.max(near.x0 + 1.5, Math.min(near.x0 + near.nx * near.cell - 1.5, px)), 1.9, Math.max(cz, Math.min(near.z0 + near.nz * near.cell - 1, pz - 2.2)));
      void cx;
      this.label.visible = near.cleared < near.total;
    } else this.label.visible = false;
  }

  handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'findRevealed') {
        const y = this.hooks.groundAt(e.x, e.z);
        this.hooks.puff(e.x, y + 0.2, e.z, 14, 1.2, 2.2, 1);
        this.hooks.glint(e.x, y + 0.6, e.z, e.kind === 'embers' ? 22 : 10, 2.6);
        this.hooks.ring(e.x, e.z, 2.4, 0xfff0c0, 0.7);
        this.hooks.sfx('ploughFind');
        const text = e.kind === 'embers' ? 'Ember cache!' : e.kind === 'crate' ? 'Buried supplies!' : e.kind === 'villager' ? 'Someone is here!' : 'A landmark!';
        this.hooks.float(text, e.x, y + 2.2, e.z, 'big');
      } else if (e.type === 'zoneCleared') {
        this.hooks.sfx('zoneCleared');
        this.hooks.toast('Lot cleared!', 'unlock');
      }
    }
  }

  /** Debug/e2e. */
  debug(): { deepCells: number; banks: number; ploughVisible: boolean; level: number } {
    return { deepCells: this.deep.reduce((a, m) => a + m.count, 0), banks: this.banks.count, ploughVisible: this.prop.visible, level: this.level };
  }

  dispose(): void {
    for (const m of this.deep) m.removeFromParent();
    this.banks.removeFromParent();
    this.prop.removeFromParent();
    this.label.removeFromParent();
  }
}
