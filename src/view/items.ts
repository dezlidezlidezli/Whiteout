// One InstancedMesh per item kind; everything item-shaped (stacks, piles, flyers, belts, embers)
// is batched into these each frame.

import * as THREE from 'three';
import type { RenderKind } from '../data/types';
import { getItemMesh, type ItemMeshDef } from './models';

const RENDER_KINDS: RenderKind[] = ['fish', 'stew', 'log', 'plank', 'smokedFish', 'ore', 'ingot', 'feast', 'ember'];

interface Batch {
  mesh: THREE.InstancedMesh;
  def: ItemMeshDef;
  n: number;
  cap: number;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export class ItemBatcher {
  private batches = new Map<RenderKind, Batch>();

  constructor(parent: THREE.Object3D, cap = 1500) {
    for (const k of RENDER_KINDS) {
      const def = getItemMesh(k);
      const c = k === 'ember' ? 900 : cap;
      const mesh = new THREE.InstancedMesh(def.geometry, def.material, c);
      mesh.count = 0;
      mesh.castShadow = k !== 'ember';
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.name = `items:${k}`;
      parent.add(mesh);
      this.batches.set(k, { mesh, def, n: 0, cap: c });
    }
  }

  def(kind: RenderKind): ItemMeshDef {
    return this.batches.get(kind)!.def;
  }

  stackHeight(kind: RenderKind): number {
    return this.batches.get(kind)!.def.stackHeight;
  }

  begin(): void {
    for (const b of this.batches.values()) b.n = 0;
  }

  add(kind: RenderKind, x: number, y: number, z: number, rotY = 0, scale = 1, rotX = 0, rotZ = 0): void {
    const b = this.batches.get(kind)!;
    if (b.n >= b.cap) return;
    _p.set(x, y, z);
    _e.set(rotX, rotY, rotZ, 'YXZ');
    _q.setFromEuler(_e);
    _s.set(scale, scale, scale);
    _m.compose(_p, _q, _s);
    b.mesh.setMatrixAt(b.n++, _m);
  }

  end(): void {
    for (const b of this.batches.values()) {
      b.mesh.count = b.n;
      b.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Lay out `count` items as tidy columns on the ground (or a surface) around a local origin.
   * cols x rows grid of columns, each up to `perCol` high. Returns the top position of the last item.
   */
  grid(kind: RenderKind, count: number, ox: number, oy: number, oz: number, yaw: number, perCol: number, cols: number, spacing = 0.42, out?: THREE.Vector3): void {
    const h = this.stackHeight(kind);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const perLayer = cols;
    for (let i = 0; i < count; i++) {
      const col = Math.floor(i / perCol) % perLayer;
      const lvl = i % perCol;
      const row = Math.floor(i / (perCol * perLayer));
      const lx = (col - (Math.min(perLayer, Math.ceil(count / perCol)) - 1) / 2) * spacing;
      const lz = row * spacing;
      const x = ox + lx * c + lz * s;
      const z = oz - lx * s + lz * c;
      this.add(kind, x, oy + lvl * h, z, yaw + ((i * 0.37) % 0.3) - 0.15);
    }
    if (out && count > 0) {
      const i = count - 1;
      const col = Math.floor(i / perCol) % perLayer;
      const lx = (col - (Math.min(perLayer, Math.ceil(count / perCol)) - 1) / 2) * spacing;
      const lz = Math.floor(i / (perCol * perLayer)) * spacing;
      out.set(ox + lx * c + lz * s, oy + (i % perCol) * h + h, oz - lx * s + lz * c);
    }
  }
}
