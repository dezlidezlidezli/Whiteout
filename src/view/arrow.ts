// Guidance: a chunky chevron circling the player's feet towards the quest target, and a bouncing
// marker over the target itself.

import * as THREE from 'three';

function chevronShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0.5);
  s.lineTo(0.42, -0.05);
  s.lineTo(0.22, -0.05);
  s.lineTo(0.22, -0.42);
  s.lineTo(-0.22, -0.42);
  s.lineTo(-0.22, -0.05);
  s.lineTo(-0.42, -0.05);
  s.closePath();
  return s;
}

export class GuideArrow {
  readonly root = new THREE.Group();
  private arrow: THREE.Mesh;
  private marker: THREE.Group;
  private ring: THREE.Mesh;
  private shown = 0;
  private markShown = 0;
  private yaw = 0;

  constructor(parent: THREE.Object3D) {
    const geo = new THREE.ExtrudeGeometry(chevronShape(), { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc35a, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
    this.arrow = new THREE.Mesh(geo, mat);
    this.arrow.renderOrder = 15;
    this.root.add(this.arrow);
    // Target marker: floating down-pointing chevron + pulsing ground ring.
    this.marker = new THREE.Group();
    const down = new THREE.Mesh(new THREE.ExtrudeGeometry(chevronShape(), { depth: 0.12, bevelEnabled: false }), mat);
    down.rotation.z = Math.PI;
    down.position.z = -0.06;
    down.scale.setScalar(0.9);
    this.marker.add(down);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc35a, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2), ringMat);
    this.ring.renderOrder = 4;
    this.root.add(this.marker, this.ring);
    parent.add(this.root);
  }

  /**
   * px,pz: player; wx,wz: next waypoint; tx,tz: final target (null hides). camYaw unused (fixed camera).
   */
  update(dt: number, time: number, px: number, pz: number, wx: number, wz: number, tx: number | null, tz: number, markerY: number): void {
    const has = tx !== null;
    const dist = has ? Math.hypot(tx - px, tz - pz) : 0;
    const want = has && dist > 2.2 ? 1 : 0;
    this.shown += (want - this.shown) * Math.min(1, dt * 8);
    const ang = Math.atan2(wx - px, wz - pz);
    let d = ang - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 10);
    const r = 1.35 + Math.sin(time * 6) * 0.1;
    this.arrow.position.set(px + Math.sin(this.yaw) * r, 0.18, pz + Math.cos(this.yaw) * r);
    this.arrow.rotation.y = this.yaw;
    this.arrow.scale.setScalar(Math.max(0.001, this.shown) * 0.9);
    this.arrow.visible = this.shown > 0.02;
    const mWant = has ? 1 : 0;
    this.markShown += (mWant - this.markShown) * Math.min(1, dt * 6);
    this.marker.visible = this.ring.visible = this.markShown > 0.02 && has;
    if (has) {
      this.marker.position.set(tx, markerY + 0.6 + Math.abs(Math.sin(time * 3.2)) * 0.35, tz);
      this.marker.rotation.y = time * 1.5;
      this.marker.scale.setScalar(this.markShown * (dist < 2.2 ? 0.6 : 1));
      const pulse = (time * 0.9) % 1;
      this.ring.position.set(tx, 0.14, tz);
      this.ring.scale.setScalar(0.6 + pulse * 0.9);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - pulse) * this.markShown;
    }
  }
}
