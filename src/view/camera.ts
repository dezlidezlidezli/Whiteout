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
  private bias = -1.2;
  private vx = 0;
  private vz = 0;
  /** 1 = title drift, 0 = gameplay; eases between. */
  private titleBlend = 0;
  private titleWant = 0;
  private titleT = 0;
  private gamePos = new THREE.Vector3();
  private gameLook = new THREE.Vector3();

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

  setTitle(on: boolean, instant = false): void {
    this.titleWant = on ? 1 : 0;
    if (instant) this.titleBlend = this.titleWant;
  }

  get inTitle(): boolean {
    return this.titleBlend > 0.001;
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
    // In the yard, lean the view towards the counters so the hungry crowd stays on screen.
    const bias = Math.max(-1.2, Math.min(2.4, (pz - 7) * 0.45));
    this.bias += (bias - this.bias) * (1 - Math.exp(-dt * 2));
    // Look-ahead from a smoothed velocity so starting/stopping never lurches the view.
    const kv = 1 - Math.exp(-dt * 3);
    this.vx += (vx - this.vx) * kv;
    this.vz += (vz - this.vz) * kv;
    const ax = px + this.vx * 0.32;
    const az = pz + this.vz * 0.32 + this.bias;
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
    this.gamePos.set(this.target.x + sx, this.target.y + this.dist * Math.sin(PITCH) + sy, this.target.z + this.dist * Math.cos(PITCH));
    this.gameLook.set(this.target.x + sx * 0.5, 0.6, this.target.z);
    // Title: a slow, low drift around the camp with the aurora sky above.
    const tb = this.titleWant > this.titleBlend ? 1.2 : 0.75;
    this.titleBlend += Math.sign(this.titleWant - this.titleBlend) * Math.min(Math.abs(this.titleWant - this.titleBlend), dt * tb);
    if (this.titleBlend > 0.001) {
      this.titleT += dt;
      const a = Math.sin(this.titleT * 0.06) * 0.55 + 0.25;
      const r = 19 + Math.sin(this.titleT * 0.09) * 2;
      const tx = Math.sin(a) * r;
      const tz = 4 + Math.cos(a) * r;
      const k = this.titleBlend * this.titleBlend * (3 - 2 * this.titleBlend);
      c.position.set(tx, 6.5 + Math.sin(this.titleT * 0.13) * 0.8, tz).lerp(this.gamePos, 1 - k);
      this.look.set(0, 3.2, 1).lerp(this.gameLook, 1 - k);
    } else {
      c.position.copy(this.gamePos);
      this.look.copy(this.gameLook);
    }
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
