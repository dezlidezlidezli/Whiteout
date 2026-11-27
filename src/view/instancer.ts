// Generic instancing of procedural props: builds one template with createProp, then one
// InstancedMesh per sub-mesh. Keeps draw calls flat however detailed the art gets.

import * as THREE from 'three';
import { createProp, type ModelOpts } from './models';

interface Part {
  mesh: THREE.InstancedMesh;
  local: THREE.Matrix4;
}

const tmp = new THREE.Matrix4();

export class PropInstancer {
  readonly parts: Part[] = [];
  readonly capacity: number;
  count = 0;
  private dirty = true;

  constructor(parent: THREE.Object3D, name: string, opts: ModelOpts, capacity: number, shadows: { cast: boolean; receive: boolean } | null = null) {
    this.capacity = capacity;
    const tpl = createProp(name, opts);
    tpl.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(tpl.matrixWorld).invert();
    tpl.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // Respect parts the model starts hidden (e.g. an unlit flame).
      let vis = true;
      for (let p: THREE.Object3D | null = m; p && p !== tpl; p = p.parent) if (!p.visible) vis = false;
      if (!vis) return;
      const im = new THREE.InstancedMesh(m.geometry, m.material, capacity);
      im.count = 0;
      im.castShadow = shadows ? shadows.cast : m.castShadow;
      im.receiveShadow = shadows ? shadows.receive : m.receiveShadow || true;
      im.name = `${name}#inst`;
      parent.add(im);
      this.parts.push({ mesh: im, local: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld) });
    });
  }

  set(i: number, m: THREE.Matrix4): void {
    for (const p of this.parts) {
      tmp.multiplyMatrices(m, p.local);
      p.mesh.setMatrixAt(i, tmp);
    }
    if (i >= this.count) this.count = i + 1;
    this.dirty = true;
  }

  setCount(n: number): void {
    if (n === this.count) return;
    this.count = n;
    this.dirty = true;
  }

  private boundedCount = -1;

  /** Push changes to the GPU and refresh culling bounds. */
  commit(recomputeBounds = true): void {
    if (!this.dirty) return;
    this.dirty = false;
    const bound = this.boundedCount;
    for (const p of this.parts) {
      p.mesh.count = this.count;
      p.mesh.instanceMatrix.needsUpdate = true;
      // Bounds only when the instance count changes (not every animated frame).
      if (recomputeBounds && this.count > 0 && bound !== this.count) p.mesh.computeBoundingSphere();
    }
    if (recomputeBounds) this.boundedCount = this.count;
  }

  setVisible(v: boolean): void {
    for (const p of this.parts) p.mesh.visible = v;
  }

  dispose(): void {
    for (const p of this.parts) p.mesh.removeFromParent();
  }
}

/** Helper to compose an instance matrix. */
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
export function trs(out: THREE.Matrix4, x: number, y: number, z: number, rotY: number, scale = 1, rotX = 0, rotZ = 0): THREE.Matrix4 {
  _p.set(x, y, z);
  _e.set(rotX, rotY, rotZ, 'YXZ');
  _q.setFromEuler(_e);
  _s.set(scale, scale, scale);
  return out.compose(_p, _q, _s);
}
