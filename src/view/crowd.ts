// The crowd: frozen Icebound in queues, thawing/leaving customers, and the camp's villagers.
// All drawn with two InstancedMeshes (frozen + thawed) and per-instance transforms/colours.

import * as THREE from 'three';
import type { GameData } from '../data/types';
import type { CustomerState, Sim } from '../sim';
import { getCrowdMesh, PALETTE } from './models';

const COATS = [0xd9534f, 0xe8a33d, 0x4f9d69, 0x3f7cc4, 0x9a5fb5, 0xe0784e, 0x2f9c9c, 0xc94f7c, 0x7a8f3a, 0xb8643a];
const ICE = new THREE.Color(PALETTE.ice);

interface Villager {
  x: number;
  z: number;
  tx: number;
  tz: number;
  wait: number;
  yaw: number;
  color: THREE.Color;
  hop: number;
  speed: number;
  phase: number;
  sit: boolean;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class Crowd {
  private frozen: THREE.InstancedMesh;
  private thawed: THREE.InstancedMesh;
  private villagers: Villager[] = [];
  private cheerT = 0;
  readonly maxVillagers: number;
  /** Per-customer view state (thaw start time, last pos for facing). */
  private cust = new Map<number, { yaw: number; seen: number }>();
  private data: GameData;

  constructor(parent: THREE.Object3D, data: GameData, maxVillagers = 320) {
    this.data = data;
    this.maxVillagers = maxVillagers;
    const f = getCrowdMesh('frozen');
    const t = getCrowdMesh('thawed');
    this.frozen = new THREE.InstancedMesh(f.geometry, f.material, 160);
    this.thawed = new THREE.InstancedMesh(t.geometry, t.material, maxVillagers + 160);
    for (const im of [this.frozen, this.thawed]) {
      im.count = 0;
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      parent.add(im);
    }
    this.frozen.setColorAt(0, new THREE.Color(1, 1, 1));
    this.thawed.setColorAt(0, new THREE.Color(1, 1, 1));
  }

  /** Rebuild villagers for a loaded population (scattered around the camp). */
  populate(n: number, warm: number): void {
    this.villagers = [];
    for (let i = 0; i < Math.min(n, this.maxVillagers); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2.4 + Math.random() * Math.max(1, warm - 3);
      this.addVillager(Math.cos(a) * r, Math.sin(a) * r, i);
    }
  }

  addVillager(x: number, z: number, seed = Math.random() * 1000): void {
    if (this.villagers.length >= this.maxVillagers) {
      // Recycle the oldest so the newest arrival is always visible.
      this.villagers.shift();
    }
    const col = new THREE.Color(COATS[Math.floor(Math.abs(seed * 7.13)) % COATS.length]);
    this.villagers.push({
      x, z, tx: x, tz: z, wait: Math.random() * 2, yaw: Math.random() * 6, color: col, hop: 0.5,
      speed: 0.9 + Math.random() * 0.7, phase: Math.random() * 10, sit: false,
    });
  }

  cheer(intensity = 1): void {
    this.cheerT = Math.max(this.cheerT, 1.6 * intensity);
  }

  /** Make villagers near a point hop (e.g. when someone new arrives). */
  hopNear(x: number, z: number, r: number): void {
    for (const v of this.villagers) if (Math.hypot(v.x - x, v.z - z) < r) v.hop = Math.max(v.hop, 0.5 + Math.random() * 0.3);
  }

  update(sim: Sim, alpha: number, time: number, dt: number): void {
    const s = sim.state;
    const b = this.data.balance;
    let nf = 0;
    let nt = 0;
    this.cheerT = Math.max(0, this.cheerT - dt);
    const seen = s.tick;
    for (const c of s.customers) {
      const x = c.px + (c.x - c.px) * alpha;
      const z = c.pz + (c.z - c.pz) * alpha;
      let st = this.cust.get(c.id);
      if (!st) {
        st = { yaw: Math.PI, seen };
        this.cust.set(c.id, st);
      }
      st.seen = seen;
      const dx = c.x - c.px;
      const dz = c.z - c.pz;
      if (dx * dx + dz * dz > 1e-6) st.yaw = lerpAngle(st.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
      const coat = _c.setHex(COATS[Math.floor(c.look * COATS.length) % COATS.length]);
      if (c.phase === 'queue') {
        const moving = dx * dx + dz * dz > 1e-6;
        const shiver = Math.sin(time * 38 + c.id) * 0.03;
        const waddle = moving ? Math.sin(time * 9 + c.id) * 0.12 : 0;
        // Face the counter when waiting.
        const yaw = moving ? st.yaw : Math.PI;
        this.put(this.frozen, nf++, x, moving ? Math.abs(Math.sin(time * 9 + c.id)) * 0.05 : 0, z, yaw, waddle + shiver, 1);
        this.frozen.setColorAt(nf - 1, _c.copy(ICE).lerp(coat, 0.18));
      } else {
        // Thaw: colour floods in, a little hop, then a happy trot to camp.
        const t = c.phase === 'thaw' ? Math.min(1, c.t / b.thawTime) : 1;
        const hop = c.phase === 'thaw' ? Math.max(0, Math.sin(Math.min(1, c.t / 0.55) * Math.PI)) * 0.55 : Math.abs(Math.sin(time * 11 + c.id)) * 0.12;
        const spin = c.phase === 'thaw' ? smooth(t) * Math.PI * 2 : 0;
        const yaw = c.phase === 'thaw' ? Math.PI + spin : st.yaw;
        const waddle = c.phase === 'leave' ? Math.sin(time * 11 + c.id) * 0.1 : 0;
        const sc = c.phase === 'thaw' ? 1 + Math.sin(t * Math.PI) * 0.12 : 1;
        this.put(this.thawed, nt++, x, hop, z, yaw, waddle, sc);
        this.thawed.setColorAt(nt - 1, _c.copy(ICE).lerp(coat, smooth(t)));
      }
    }
    if (s.tick % 120 === 0) for (const [id, st] of this.cust) if (st.seen !== seen) this.cust.delete(id);

    // Villagers wander the warm camp.
    const warm = sim.warmRadius();
    const minR = 2.3;
    const maxR = Math.max(minR + 1, Math.min(warm - 0.6, 8.2));
    for (const v of this.villagers) {
      const dx = v.tx - v.x;
      const dz = v.tz - v.z;
      const d = Math.hypot(dx, dz);
      let moving = false;
      if (d > 0.05) {
        const st = Math.min(d, v.speed * dt);
        v.x += (dx / d) * st;
        v.z += (dz / d) * st;
        v.yaw = lerpAngle(v.yaw, Math.atan2(dx, dz), Math.min(1, dt * 6));
        moving = true;
      } else {
        v.wait -= dt;
        if (v.wait <= 0) {
          const a = Math.random() * Math.PI * 2;
          const r = minR + Math.random() * (maxR - minR);
          v.tx = Math.cos(a) * r;
          v.tz = Math.sin(a) * r;
          v.wait = 2 + Math.random() * 6;
          v.sit = Math.random() < 0.3;
        } else {
          // Face the fire while idle.
          v.yaw = lerpAngle(v.yaw, Math.atan2(-v.x, -v.z), Math.min(1, dt * 3));
        }
      }
      v.hop = Math.max(0, v.hop - dt);
      const cheer = this.cheerT > 0 ? Math.abs(Math.sin(time * 9 + v.phase)) * 0.35 * Math.min(1, this.cheerT) : 0;
      const hop = v.hop > 0 ? Math.abs(Math.sin(v.hop * 12)) * 0.3 : 0;
      const bob = moving ? Math.abs(Math.sin(time * 9 * v.speed + v.phase)) * 0.06 : 0;
      const waddle = moving ? Math.sin(time * 9 * v.speed + v.phase) * 0.09 : Math.sin(time * 1.3 + v.phase) * 0.03;
      const squash = !moving && v.sit ? 0.86 : 1;
      this.put(this.thawed, nt++, v.x, bob + hop + cheer, v.z, v.yaw, waddle, 1, squash);
      this.thawed.setColorAt(nt - 1, v.color);
    }
    this.frozen.count = nf;
    this.thawed.count = nt;
    this.frozen.instanceMatrix.needsUpdate = true;
    this.thawed.instanceMatrix.needsUpdate = true;
    if (this.frozen.instanceColor) this.frozen.instanceColor.needsUpdate = true;
    if (this.thawed.instanceColor) this.thawed.instanceColor.needsUpdate = true;
  }

  get count(): number {
    return this.frozen.count + this.thawed.count;
  }

  private put(im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, roll: number, scale: number, squash = 1): void {
    if (i >= im.instanceMatrix.count) return;
    _e.set(0, yaw, roll, 'YXZ');
    _q.setFromEuler(_e);
    _v.set(x, y, z);
    _s.set(scale, scale * squash, scale);
    _m.compose(_v, _q, _s);
    im.setMatrixAt(i, _m);
  }
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function smooth(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export type { CustomerState };
