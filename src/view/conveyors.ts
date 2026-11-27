// Curved conveyors: one continuous belt per Link (art kit `createConveyorPath`), flush with its
// stations, belt texture scrolling, items riding at the belt height evenly spaced along the curve.

import * as THREE from 'three';
import type { GameData, LinkDef } from '../data/types';
import type { Sim } from '../sim';
import { createConveyorPath, type ConveyorPath, type XZ } from './models';
import { makeSeeThrough } from './occlude';

interface Belt {
  def: LinkDef;
  cp: ConveyorPath;
  obj: THREE.Object3D;
  shown: boolean;
  appear: number;
  offset: number;
  beltY: number;
}

/** Keep the last bit of belt empty so items hop off rather than overlap the station. */
const END_GAP = 0.3;

export class ConveyorView {
  private belts = new Map<string, Belt>();
  onAppear: (x: number, z: number) => void = () => {};

  constructor(private parent: THREE.Object3D, data: GameData) {
    for (const l of data.links) {
      const pts: XZ[] = (l.path && l.path.length >= 2 ? l.path : []).map((p) => [p.x, p.z] as XZ);
      if (pts.length < 2) continue;
      const cp = createConveyorPath(pts, { radius: 1.0 });
      makeSeeThrough(cp.object);
      cp.object.visible = false;
      parent.add(cp.object);
      this.belts.set(l.id, { def: l, cp, obj: cp.object, shown: false, appear: 1, offset: 0, beltY: (cp.object.userData.beltY as number) ?? 0.65 });
    }
  }

  sync(sim: Sim): void {
    for (const b of this.belts.values()) {
      b.shown = sim.isActive(b.def.id);
      b.obj.visible = b.shown;
      b.appear = 1;
      b.obj.scale.set(1, 1, 1);
    }
  }

  unlock(id: string): void {
    const b = this.belts.get(id);
    if (!b || b.shown) return;
    b.shown = true;
    b.obj.visible = true;
    b.appear = 0;
    const step = Math.max(1, b.cp.length / 4);
    for (let d = 0; d <= b.cp.length; d += step) {
      const s = b.cp.sample(d);
      this.onAppear(s.x, s.z);
    }
  }

  update(sim: Sim, dt: number): void {
    for (const b of this.belts.values()) {
      if (!b.shown) continue;
      if (b.appear < 1) {
        b.appear = Math.min(1, b.appear + dt / 0.6);
        const k = b.appear;
        const s = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
        b.obj.scale.set(1, Math.max(0.01, s), 1);
      }
      const ls = sim.state.links[b.def.id];
      // Scroll while anything can still move along the belt.
      const moving = !ls || ls.belt.length === 0 || ls.belt[0].p < 1 || ls.belt.length < b.def.maxOnBelt;
      if (moving) {
        b.offset += dt * ((b.cp.length - END_GAP) / Math.max(0.2, b.def.travel));
        b.cp.setOffset(b.offset);
      }
    }
  }

  /** World position of an item at belt progress p (0..1). Returns false if the link has no belt mesh. */
  itemPos(id: string, p: number, out: THREE.Vector3): boolean {
    const b = this.belts.get(id);
    if (!b) return false;
    const s = b.cp.sample(Math.max(0, Math.min(1, p)) * Math.max(0.1, b.cp.length - END_GAP));
    out.set(s.x, b.beltY, s.z);
    return true;
  }

  /** End of the belt (items hop off from here into the destination). */
  endPos(id: string, out: THREE.Vector3): boolean {
    const b = this.belts.get(id);
    if (!b) return false;
    const s = b.cp.sample(Math.max(0.1, b.cp.length - END_GAP));
    out.set(s.x, b.beltY, s.z);
    return true;
  }

  dispose(): void {
    for (const b of this.belts.values()) {
      b.obj.removeFromParent();
      b.obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat && mat.name === 'fk-belt') {
          mat.map?.dispose();
          mat.dispose();
        }
      });
    }
    this.belts.clear();
  }
}
