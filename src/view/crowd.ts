// The crowd: frozen Icebound in queues, thawing/leaving customers, and the camp's villagers.
// All drawn with two InstancedMeshes (frozen + thawed) and per-instance transforms/colours.

import * as THREE from 'three';
import type { GameData } from '../data/types';
import type { CustomerState, Sim } from '../sim';
import { FROZEN_TINTS, getCrowdMesh, PALETTE } from './models';

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
  /** 'resident' wanders/sits; 'home' walks to a tent door then goes inside. */
  role: 'resident' | 'home';
  /** Fireside seat index (-1 = strolling). */
  seat: number;
  wave: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _coat = new THREE.Color();

export class Crowd {
  private frozen: THREE.InstancedMesh;
  /** One instanced soft disc under every crowd member. */
  private blobs: THREE.InstancedMesh;
  private nb = 0;
  private thawed: THREE.InstancedMesh;
  private villagers: Villager[] = [];
  private cheerT = 0;
  readonly maxVillagers: number;
  /** Per-customer view state (thaw start time, last pos for facing). */
  private cust = new Map<number, { yaw: number; seen: number }>();
  private data: GameData;

  constructor(parent: THREE.Object3D, data: GameData, maxVillagers = 400) {
    this.data = data;
    this.maxVillagers = maxVillagers;
    const f = getCrowdMesh('frozen');
    const t = getCrowdMesh('thawed');
    this.frozen = new THREE.InstancedMesh(f.geometry, f.material, 260);
    this.thawed = new THREE.InstancedMesh(t.geometry, t.material, maxVillagers + 200);
    for (const im of [this.frozen, this.thawed]) {
      im.count = 0;
      im.castShadow = false; // cheap blob shadows instead (see `blobs`)
      im.receiveShadow = true;
      im.frustumCulled = false;
      parent.add(im);
    }
    this.blobs = new THREE.InstancedMesh(blobGeometry(), blobMaterial(), 260 + maxVillagers + 200);
    this.blobs.count = 0;
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    parent.add(this.blobs);
    this.frozen.setColorAt(0, new THREE.Color(1, 1, 1));
    this.thawed.setColorAt(0, new THREE.Color(1, 1, 1));
  }

  /** Visible residents (the population itself is just a number). */
  residentCap = 48;
  /** Called when a villager steps into a tent/cabin. */
  onEnterHome: (x: number, z: number) => void = () => {};
  private homes: { x: number; z: number }[] = [];

  /** Rebuild residents for a loaded population (scattered around the camp). */
  populate(n: number, warm: number): void {
    this.villagers = [];
    for (let i = 0; i < Math.min(n, this.residentCap); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2.4 + Math.random() * Math.max(1, Math.min(warm, 8) - 3);
      this.addVillager(Math.cos(a) * r, Math.sin(a) * r, i);
    }
  }

  private residents(): number {
    let n = 0;
    for (const v of this.villagers) if (v.role === 'resident') n++;
    return n;
  }

  /** A thawed villager arrives in camp: join the visible residents, or head home to a tent. */
  arrive(x: number, z: number, seed: number): void {
    if (this.residents() < this.residentCap || this.homes.length === 0) {
      if (this.residents() >= this.residentCap) this.dropOldestResident();
      this.addVillager(x, z, seed);
      return;
    }
    const v = this.addVillager(x, z, seed, true);
    let best = this.homes[0];
    let bd = Infinity;
    for (const h of this.homes) {
      const d = Math.hypot(h.x - x, h.z - z) + Math.random() * 3;
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    // Door: the side of the tent facing the fire.
    const l = Math.hypot(best.x, best.z) || 1;
    v.tx = best.x - (best.x / l) * 0.9;
    v.tz = best.z - (best.z / l) * 0.9;
  }

  private dropOldestResident(): void {
    const i = this.villagers.findIndex((v) => v.role === 'resident');
    if (i >= 0) this.villagers.splice(i, 1);
  }

  addVillager(x: number, z: number, seed = Math.random() * 1000, home = false): Villager {
    if (this.villagers.length >= this.maxVillagers) this.villagers.shift();
    const col = new THREE.Color(COATS[Math.floor(Math.abs(seed * 7.13)) % COATS.length]);
    const v: Villager = {
      x, z, tx: x, tz: z, wait: Math.random() * 2, yaw: Math.random() * 6, color: col, hop: 0.5,
      speed: home ? 1.8 : 0.9 + Math.random() * 0.7, phase: Math.random() * 10, sit: false,
      role: home ? 'home' : 'resident', seat: -1, wave: 0,
    };
    this.villagers.push(v);
    return v;
  }

  cheer(intensity = 1): void {
    this.cheerT = Math.max(this.cheerT, 1.6 * intensity);
  }

  /** Make villagers near a point hop (e.g. when someone new arrives). */
  hopNear(x: number, z: number, r: number): void {
    for (const v of this.villagers) if (Math.hypot(v.x - x, v.z - z) < r) v.hop = Math.max(v.hop, 0.5 + Math.random() * 0.3);
  }

  update(sim: Sim, alpha: number, time: number, dt: number, px = 0, pz = 0): void {
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
      const coat = _coat.setHex(COATS[Math.floor(c.look * COATS.length) % COATS.length]);
      if (c.phase === 'queue') {
        const moving = dx * dx + dz * dz > 1e-6;
        // Per-person deterministic quirks so the huddle never looks like neat rows.
        const h1 = hash01(c.id * 3 + 1);
        const h2 = hash01(c.id * 7 + 2);
        const h3 = hash01(c.id * 11 + 3);
        const front = (s.stations[c.counter] as { queue?: number[] } | undefined)?.queue?.[0] === c.id;
        const jitter = front ? 0.05 : 0.32;
        const jx = (h1 - 0.5) * jitter + Math.sin(time * (0.5 + h2) + h3 * 9) * 0.06;
        const jz = (h2 - 0.5) * jitter + Math.cos(time * (0.4 + h1) + h1 * 7) * 0.05;
        const shiverX = moving ? 0 : Math.sin(time * (34 + h3 * 10) + c.id) * 0.018;
        const shiver = Math.sin(time * (40 + h1 * 12) + c.id) * 0.035;
        const waddle = moving ? Math.sin(time * 9 + c.id) * 0.12 : 0;
        // Mostly facing the counter, each with their own lean and glance.
        const yaw = moving ? st.yaw : Math.PI + (h3 - 0.5) * 0.9 + Math.sin(time * 0.3 + h2 * 6) * 0.15;
        const sc = 0.9 + h1 * 0.18;
        const y = moving ? Math.abs(Math.sin(time * 9 + c.id)) * 0.05 : 0;
        this.put(this.frozen, nf++, x + jx + shiverX, y, z + jz, yaw, waddle + shiver, sc, 1 - h2 * 0.06);
        this.frozen.setColorAt(nf - 1, _c.setHex(FROZEN_TINTS[Math.floor(h2 * FROZEN_TINTS.length) % FROZEN_TINTS.length]));
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

    // Homes: raised tents plus any built cabins.
    const spots = this.data.camp.tentSpots;
    const tents = spots.slice(0, Math.min(s.tents, spots.length));
    this.homes = tents.slice();
    for (const d of this.data.decor) if (d.model === 'cabin' && s.unlocked[d.id]) this.homes.push({ x: d.x, z: d.z });
    const obstacles = this.homes;
    const warm = sim.warmRadius();
    const minR = 3.0;
    const maxR = Math.max(minR + 1, Math.min(warm - 0.6, 8));
    // Fireside ring: up to 12 seats.
    const SEATS = 12;
    const seatTaken: boolean[] = [];
    for (const v of this.villagers) if (v.seat >= 0) seatTaken[v.seat] = true;
    const playerInCamp = Math.hypot(px, pz) < warm + 1;
    for (let vi = this.villagers.length - 1; vi >= 0; vi--) {
      const v = this.villagers[vi];
      const dx = v.tx - v.x;
      const dz = v.tz - v.z;
      const d = Math.hypot(dx, dz);
      let moving = false;
      if (d > 0.05) {
        const st = Math.min(d, v.speed * dt);
        v.x += (dx / d) * st;
        v.z += (dz / d) * st;
        if (v.role === 'resident') {
          for (const t of obstacles) {
            const ex = v.x - t.x;
            const ez = v.z - t.z;
            const el = Math.hypot(ex, ez);
            if (el < 1.2 && el > 1e-4) {
              v.x = t.x + (ex / el) * 1.2;
              v.z = t.z + (ez / el) * 1.2;
            }
          }
        }
        v.yaw = lerpAngle(v.yaw, Math.atan2(dx, dz), Math.min(1, dt * 6));
        moving = true;
      } else if (v.role === 'home') {
        // Pop inside with a puff and a warm window glow.
        this.onEnterHome(v.x, v.z);
        this.villagers.splice(vi, 1);
        continue;
      } else {
        v.wait -= dt;
        if (v.wait <= 0) {
          if (v.seat >= 0) {
            seatTaken[v.seat] = false;
            v.seat = -1;
          }
          // Half the time, take a free seat by the fire.
          let seat = -1;
          if (Math.random() < 0.5) for (let k = 0; k < SEATS; k++) if (!seatTaken[(k + vi) % SEATS]) { seat = (k + vi) % SEATS; break; }
          if (seat >= 0) {
            seatTaken[seat] = true;
            v.seat = seat;
            const a = (seat / SEATS) * Math.PI * 2 + 0.13;
            v.tx = Math.cos(a) * 2.25;
            v.tz = Math.sin(a) * 2.25;
            v.wait = 8 + Math.random() * 10;
          } else {
            for (let k = 0; k < 5; k++) {
              const a = Math.random() * Math.PI * 2;
              const r = minR + Math.random() * (maxR - minR);
              v.tx = Math.max(-8.2, Math.min(8.2, Math.cos(a) * r));
              v.tz = Math.max(-8.2, Math.min(5.4, Math.sin(a) * r));
              if (!blocked(v.tx, v.tz, obstacles)) break;
            }
            v.wait = 1.5 + Math.random() * 4;
          }
        } else {
          // Seated folk face the fire; others face the player now and then to wave.
          const near = playerInCamp && Math.hypot(px - v.x, pz - v.z) < 4.5;
          if (near && v.seat < 0) {
            v.wave = Math.min(1, v.wave + dt * 3);
            v.yaw = lerpAngle(v.yaw, Math.atan2(px - v.x, pz - v.z), Math.min(1, dt * 5));
          } else {
            v.wave = Math.max(0, v.wave - dt * 2);
            v.yaw = lerpAngle(v.yaw, Math.atan2(-v.x, -v.z), Math.min(1, dt * 3));
          }
        }
      }
      v.hop = Math.max(0, v.hop - dt);
      const cheer = this.cheerT > 0 ? Math.abs(Math.sin(time * 9 + v.phase)) * 0.35 * Math.min(1, this.cheerT) : 0;
      const hop = v.hop > 0 ? Math.abs(Math.sin(v.hop * 12)) * 0.3 : 0;
      const waveHop = v.wave > 0 ? Math.abs(Math.sin(time * 7 + v.phase)) * 0.12 * v.wave : 0;
      const bob = moving ? Math.abs(Math.sin(time * 9 * v.speed + v.phase)) * 0.06 : 0;
      const waddle = moving
        ? Math.sin(time * 9 * v.speed + v.phase) * 0.09
        : v.wave > 0
          ? Math.sin(time * 10 + v.phase) * 0.22 * v.wave
          : Math.sin(time * 1.3 + v.phase) * 0.03;
      const sitting = !moving && v.seat >= 0;
      this.put(this.thawed, nt++, v.x, bob + hop + cheer + waveHop - (sitting ? 0.12 : 0), v.z, v.yaw, waddle, 1, sitting ? 0.8 : 1);
      this.thawed.setColorAt(nt - 1, v.color);
    }
    this.frozen.count = nf;
    this.thawed.count = nt;
    this.blobs.count = this.nb;
    this.blobs.instanceMatrix.needsUpdate = true;
    this.nb = 0;
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
    if (this.nb < this.blobs.instanceMatrix.count) {
      const bs = scale * (1 - Math.min(0.5, y * 0.8));
      _m.makeScale(bs, 1, bs).setPosition(x, 0.03, z);
      this.blobs.setMatrixAt(this.nb++, _m);
    }
    _e.set(0, yaw, roll, 'YXZ');
    _q.setFromEuler(_e);
    _v.set(x, y, z);
    _s.set(scale, scale * squash, scale);
    _m.compose(_v, _q, _s);
    im.setMatrixAt(i, _m);
  }
}

function blobGeometry(): THREE.BufferGeometry {
  return new THREE.CircleGeometry(0.34, 14).rotateX(-Math.PI / 2);
}

function blobMaterial(): THREE.Material {
  // Radial falloff via vertex-free trick: a soft dark disc with low opacity.
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, 'rgba(10,18,40,0.55)');
  grd.addColorStop(1, 'rgba(10,18,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
}

function hash01(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function blocked(x: number, z: number, tents: { x: number; z: number }[]): boolean {
  for (const t of tents) if (Math.hypot(x - t.x, z - t.z) < 1.3) return true;
  return false;
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
