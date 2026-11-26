// Fixed-angle perspective follow camera with look-ahead, stack pull-back and cinematic pans.

import * as THREE from 'three';

const PITCH = (50 * Math.PI) / 180;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private target = new THREE.Vector3();
  private look = new THREE.Vector3();
  private dist = 18;
  private pan: { x: number; z: number; t: number; dur: number } | null = null;
  private shakeT = 0;
  private shakeAmp = 0;
  /** Extra zoom-out (0..1) e.g. for big moments. */
  private punch = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.5, 160);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Base distance so ~11.5 m of ground is visible across a portrait screen. */
  private baseDistance(): number {
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const want = 11.5;
    const d = want / 2 / Math.tan(hfov / 2);
    return Math.min(30, Math.max(17, d));
  }

  startPan(x: number, z: number, dur = 3): void {
    this.pan = { x, z, t: 0, dur };
  }

  skipPan(): void {
    if (this.pan && this.pan.t < this.pan.dur - 0.6) this.pan.t = this.pan.dur - 0.6;
  }

  get panning(): boolean {
    return !!this.pan;
  }

  shake(amp: number, dur = 0.4): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  pulse(amount: number): void {
    this.punch = Math.max(this.punch, amount);
  }

  snap(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.look.copy(this.target);
  }

  update(dt: number, px: number, pz: number, vx: number, vz: number, stackLen: number): void {
    // Look-ahead in the direction of travel; keep the player a little below centre.
    const ax = px + vx * 0.32;
    const az = pz + vz * 0.32 - 1.2;
    let tx = ax;
    let tz = az;
    if (this.pan) {
      this.pan.t += dt;
      const p = this.pan;
      const k = p.t < 0.8 ? smooth(p.t / 0.8) : p.t > p.dur - 0.6 ? smooth((p.dur - p.t) / 0.6) : 1;
      tx = ax + (p.x - ax) * k;
      tz = az + (p.z - az) * k;
      if (p.t >= p.dur) this.pan = null;
    }
    const f = 1 - Math.exp(-dt * (this.pan ? 3.5 : 5.5));
    this.target.x += (tx - this.target.x) * f;
    this.target.z += (tz - this.target.z) * f;
    this.punch = Math.max(0, this.punch - dt * 0.6);
    const want = this.baseDistance() + Math.min(9, stackLen * 0.16) + (this.pan ? 5 : 0) + this.punch * 4;
    this.dist += (want - this.dist) * (1 - Math.exp(-dt * 2.2));
    const c = this.camera;
    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT) * 2.5;
      sx = (Math.random() - 0.5) * a;
      sy = (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    c.position.set(this.target.x + sx, this.target.y + this.dist * Math.sin(PITCH) + sy, this.target.z + this.dist * Math.cos(PITCH));
    this.look.set(this.target.x + sx * 0.5, 0.6, this.target.z);
    c.lookAt(this.look);
  }

  get focus(): THREE.Vector3 {
    return this.target;
  }
}

function smooth(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
