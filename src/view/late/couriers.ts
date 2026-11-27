// Sled-dog couriers: every courier helper pulls a little sled (hitched at a swinging pivot so it
// trails round corners), its load rides on the sled instead of the dog's back, snow kicks up from
// the runners while it runs, and departures/arrivals get a small moment.

import * as THREE from 'three';
import type { SimEvent } from '../../sim';
import { itemName } from '../../ui/late/icons';
import type { CharacterRig } from '../models';
import { createProp, getItemMesh, type ItemKind } from '../models';
import { fxOf, hooksOf, sfxAt, type LateCtx, type LatePart } from './ctx';

const SLED_SCALE = 0.72;
/** Where the load sits on the sled bed (sled-local, metres before scaling). */
const BED = new THREE.Vector3(0, 0.34, -0.15);

interface Sled {
  id: string;
  rig: CharacterRig | null;
  pivot: THREE.Group;
  sled: THREE.Object3D;
  lastYaw: number;
  swing: number;
  lastX: number;
  lastZ: number;
  speed: number;
  kickT: number;
  load: Map<string, THREE.InstancedMesh>;
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3();

export class Couriers implements LatePart {
  private sleds = new Map<string, Sled>();

  constructor(private ctx: LateCtx) {}

  private courierIds(): string[] {
    return this.ctx.sim.data.helpers.filter((h) => h.role === 'courier').map((h) => h.id);
  }

  private rigFor(id: string): CharacterRig | null {
    const actors = this.ctx.view['actors'];
    const hv = (actors['helpers'] as Map<string, { rig: CharacterRig }>).get(id);
    return hv?.rig ?? null;
  }

  handle(e: SimEvent): void {
    if (e.type !== 'courierDepart' && e.type !== 'courierArrive') return;
    const v = this.ctx.view;
    const h = this.ctx.sim.state.helpers[e.helper];
    const sl = this.sleds.get(e.helper);
    if (!h || !sl) return;
    sl.sled.getWorldPosition(_v);
    if (e.type === 'courierDepart') {
      if (e.item && e.n > 0) {
        fxOf(v).puff(_v.x, 0.15, _v.z, 6, 0.6, 1.4, 0.7);
        hooksOf(v).float(`${e.n} ${itemName(e.item, e.n)} →`, new THREE.Vector3(h.x, 1.4, h.z), 'info');
        sfxAt(v, 'arrive', h, { volume: 0.5, pitch: 1.35 }, 0.2);
      }
    } else if (e.at === 'dest' && e.items > 0) {
      fxOf(v).glint(_v.x, 0.6, _v.z, 8, 1.4);
      fxOf(v).puff(_v.x, 0.1, _v.z, 5, 0.5, 1, 0.6);
      sfxAt(v, 'drop', h, { volume: 0.6, pitch: 0.85 }, 0.2);
    }
  }

  frame(dt: number): void {
    const s = this.ctx.sim.state;
    const fx = fxOf(this.ctx.view);
    for (const id of this.courierIds()) {
      const h = s.helpers[id];
      let sl = this.sleds.get(id);
      if (!h) {
        if (sl) sl.pivot.visible = false;
        continue;
      }
      const rig = this.rigFor(id);
      if (!rig) continue;
      if (!sl) {
        const pivot = new THREE.Group();
        const sled = createProp('sled', { seed: id.length });
        sled.scale.setScalar(SLED_SCALE);
        sled.position.set(0, 0, -0.72);
        pivot.add(sled);
        pivot.position.set(0, 0, -0.3);
        sl = { id, rig: null, pivot, sled, lastYaw: rig.root.rotation.y, swing: 0, lastX: h.x, lastZ: h.z, speed: 0, kickT: 0, load: new Map() };
        this.sleds.set(id, sl);
      }
      if (sl.rig !== rig) {
        // New rig (sim reloaded): hitch the sled to it.
        rig.root.add(sl.pivot);
        sl.rig = rig;
        sl.lastYaw = rig.root.rotation.y;
      }
      sl.pivot.visible = true;
      if (dt > 0) {
        let dy = rig.root.rotation.y - sl.lastYaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        sl.lastYaw = rig.root.rotation.y;
        const want = Math.max(-0.7, Math.min(0.7, (-dy / dt) * 0.22));
        sl.swing += (want - sl.swing) * Math.min(1, dt * 5);
        sl.pivot.rotation.y = sl.swing;
        const sp = Math.hypot(h.x - sl.lastX, h.z - sl.lastZ) / dt;
        sl.lastX = h.x;
        sl.lastZ = h.z;
        sl.speed += (Math.min(12, sp) - sl.speed) * Math.min(1, dt * 6);
      }
      // A bump of the runners while running.
      sl.sled.position.y = sl.speed > 2 ? Math.abs(Math.sin(this.ctx.time * 14 + id.length)) * 0.025 : 0;
      sl.sled.rotation.z = sl.speed > 2 ? Math.sin(this.ctx.time * 9) * 0.03 : 0;
      // The load rides on the sled: move the dog's carry anchor onto the bed.
      const anchor = rig.carryAnchor;
      const parent = anchor.parent;
      if (parent) {
        rig.root.updateMatrixWorld();
        _m.copy(rig.root.matrixWorld).invert().multiply(parent.matrixWorld); // parent in root space
        sl.pivot.updateMatrix();
        sl.sled.updateMatrix();
        _v.copy(BED).applyMatrix4(sl.sled.matrix).applyMatrix4(sl.pivot.matrix);
        _m2.copy(_m).invert();
        anchor.position.copy(_v.applyMatrix4(_m2));
      }
      // The load is packed flat on the sled (the generic stack would tower over a dog), so hide
      // the carried stack and draw a neat pile on the bed instead.
      (this.ctx.view['actors'].hidden as Map<string, number>).set(`helper:${id}`, h.stack.length);
      this.drawLoad(sl, h.stack);
      // Snow kicked up by the runners.
      sl.kickT -= dt;
      if (sl.speed > 3 && sl.kickT <= 0) {
        sl.kickT = 0.11;
        const p = s.player;
        if (Math.hypot(h.x - p.x, h.z - p.z) < 20) {
          sl.sled.localToWorld(_v.set(0, 0.05, -0.7));
          fx.puff(_v.x, 0.08, _v.z, 1, 0.25, 0.5, 0.45);
        }
      }
    }
  }

  private drawLoad(sl: Sled, stack: readonly ItemKind[]): void {
    const counts = new Map<string, number>();
    for (const it of stack) counts.set(it, (counts.get(it) ?? 0) + 1);
    for (const [kind, im] of sl.load) if (!counts.has(kind)) im.count = 0;
    let slot = 0;
    for (const [kind, n] of counts) {
      let im = sl.load.get(kind);
      if (!im) {
        const d = getItemMesh(kind as ItemKind);
        im = new THREE.InstancedMesh(d.geometry, d.material, 32);
        im.castShadow = true;
        im.frustumCulled = false;
        im.userData.h = d.stackHeight;
        sl.sled.add(im);
        sl.load.set(kind, im);
      }
      const hgt = im.userData.h as number;
      const k = Math.min(32, n);
      for (let i = 0; i < k; i++, slot++) {
        // 2 across × 3 along, then the next layer up; a little jitter so it looks hand-packed.
        const layer = Math.floor(slot / 6);
        const c = slot % 6;
        const x = (c % 2 ? 0.2 : -0.2) / SLED_SCALE;
        const z = (-0.45 + Math.floor(c / 2) * 0.42) / SLED_SCALE;
        const y = 0.34 / SLED_SCALE + (layer * hgt + hgt * 0.5) / SLED_SCALE;
        _m.makeRotationY((c % 3) * 0.2 - 0.2 + layer * 0.3);
        _m.setPosition(x, y, z);
        _m2.makeScale(1 / SLED_SCALE, 1 / SLED_SCALE, 1 / SLED_SCALE);
        im.setMatrixAt(i, _m.multiply(_m2));
      }
      im.count = k;
      im.instanceMatrix.needsUpdate = true;
    }
  }

  reset(): void {
    for (const sl of this.sleds.values()) sl.rig = null;
  }

  dispose(): void {
    for (const sl of this.sleds.values()) sl.pivot.removeFromParent();
    this.sleds.clear();
  }
}
