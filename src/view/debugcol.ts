// Collision debug overlay (?debug=collision, or the button in the debug overlay): draws every sim
// solid (circles + boxes, including wall solids), and every walkable area rect, as lines over the scene.

import * as THREE from 'three';
import type { Sim } from '../sim';

export class CollisionDebug {
  private lines: THREE.LineSegments;
  private rects: THREE.LineSegments;
  private t = 1;

  constructor(parent: THREE.Object3D) {
    const mk = (color: number) => {
      const l = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }));
      l.renderOrder = 80;
      l.frustumCulled = false;
      parent.add(l);
      return l;
    };
    this.lines = mk(0xff3355);
    this.rects = mk(0x44ff88);
  }

  update(sim: Sim, dt: number): void {
    this.t += dt;
    if (this.t < 0.5) return;
    this.t = 0;
    const seg: number[] = [];
    const y = 0.25;
    for (const s of sim.allSolids()) {
      if (s.kind === 'circle') {
        for (let i = 0; i < 16; i++) {
          const a0 = (i / 16) * Math.PI * 2;
          const a1 = ((i + 1) / 16) * Math.PI * 2;
          seg.push(s.x + Math.cos(a0) * s.r, y, s.z + Math.sin(a0) * s.r, s.x + Math.cos(a1) * s.r, y, s.z + Math.sin(a1) * s.r);
        }
      } else {
        const x0 = s.x - s.hw, x1 = s.x + s.hw, z0 = s.z - s.hd, z1 = s.z + s.hd;
        seg.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
      }
    }
    this.lines.geometry.dispose();
    this.lines.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    const rs: number[] = [];
    const ry = 0.12;
    for (const r of sim.walkRects()) {
      rs.push(r.x0, ry, r.z0, r.x1, ry, r.z0, r.x1, ry, r.z0, r.x1, ry, r.z1, r.x1, ry, r.z1, r.x0, ry, r.z1, r.x0, ry, r.z1, r.x0, ry, r.z0);
    }
    this.rects.geometry.dispose();
    this.rects.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rs, 3));
  }

  dispose(): void {
    this.lines.removeFromParent();
    this.rects.removeFromParent();
  }
}
