// Ice skating presentation (docs/MECHANICS.md §3). Only constructed when the skate mechanic is on.
// - Blades under the boots and the skate pose whenever the player glides on lake ice.
// - Carving trails: thin pale scratches dropped behind the blades, curving with the line, fading out.
// - Fish leaps: the sim's leaps are a telegraph splash, then a fish arcing out of the ice; skating
//   through one scoops it with a glint and a rising-pitch combo callout.
// - Gentle wall bounces spray ice; the blade hiss (skate ambience) follows speed.
// - The lake ice is extended over the east lot (mech.ice) where the dressing floor stops.

import * as THREE from 'three';
import { ladderPitch } from '../audio';
import type { SimEvent } from '../sim';
import type { Sim } from '../sim';
import { createIceSheet, createProp } from './models';

export interface SkateHooks {
  puff(x: number, y: number, z: number, n: number, radius: number, speed: number, scale?: number): void;
  ring(x: number, z: number, size: number, color: number, dur: number): void;
  glint(x: number, y: number, z: number, n: number, sp: number): void;
  float(text: string, x: number, y: number, z: number, kind: 'ember' | 'info' | 'big'): void;
  sfx(name: 'fishLeapSpawn' | 'fishLeapCatch' | 'skateBounce', opts?: { pitch?: number; volume?: number }): void;
  groundAt(x: number, z: number): number;
}

const TRAIL_MAX = 220;
const TRAIL_LIFE = 3.2;
/** Seconds of splash telegraph before the fish breaks the ice (sim leap life is 2.6 s). */
const TELEGRAPH = 0.7;
const LEAP_LIFE = 2.6;

interface Leap { obj: THREE.Object3D; fish: THREE.Object3D | null; splash: THREE.Object3D | null; t: number; yaw: number; x: number; z: number }

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export class SkateView {
  private trail: THREE.InstancedMesh;
  private tx = new Float32Array(TRAIL_MAX);
  private tz = new Float32Array(TRAIL_MAX);
  private ty = new Float32Array(TRAIL_MAX);
  private tyaw = new Float32Array(TRAIL_MAX);
  private tlen = new Float32Array(TRAIL_MAX);
  private tage = new Float32Array(TRAIL_MAX).fill(TRAIL_LIFE);
  private tHead = 0;
  private last: [number, number][] = [[NaN, NaN], [NaN, NaN]];
  private leaps = new Map<number, Leap>();
  private pool: THREE.Object3D[] = [];
  private blades: THREE.Object3D[] = [];
  private sprayT = 0;
  /** Pose override for the player (null off the ice). */
  action: 'skate' | null = null;
  /** 0..1 blade hiss for the `skate` ambience bed. */
  level = 0;

  constructor(private parent: THREE.Object3D, sim: Sim, private hooks: SkateHooks, extendOver: { x0: number; x1: number; z0: number; z1: number }[]) {
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false });
    this.trail = new THREE.InstancedMesh(g, mat, TRAIL_MAX);
    this.trail.count = 0;
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 3;
    parent.add(this.trail);
    // Ice where the mechanic's rink goes beyond the dressed lake floor (the east lot once ploughed).
    for (const r of extendOver) {
      const ice = createIceSheet(r.x1 - r.x0, r.z1 - r.z0, { seed: 7, edge: true });
      ice.position.set((r.x0 + r.x1) / 2, this.hooks.groundAt((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2) + 0.005, (r.z0 + r.z1) / 2);
      ice.traverse((o) => { o.receiveShadow = true; });
      parent.add(ice);
    }
    void sim;
  }

  attach(playerRoot: THREE.Object3D): void {
    this.blades = ['skateL', 'skateR'].map((n) => playerRoot.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);
  }

  private leapObj(): THREE.Object3D {
    const o = this.pool.pop() ?? createProp('fishLeap');
    o.visible = true;
    this.parent.add(o);
    return o;
  }

  update(sim: Sim, dt: number, px: number, pz: number): void {
    const st = sim.state.skate;
    const p = sim.state.player;
    const speed = Math.hypot(p.vx, p.vz);
    const on = st.on;
    for (const b of this.blades) b.visible = on;
    this.action = on ? 'skate' : null;
    const top = 6;
    const want = on ? Math.min(1, speed / top) : 0;
    this.level += (want - this.level) * Math.min(1, dt * 6);

    // ---- carving trails: one scratch per blade every ~0.25 m travelled
    if (on && speed > 1.2) {
      const yaw = Math.atan2(p.vx, p.vz);
      const cx = Math.cos(yaw);
      const sx = Math.sin(yaw);
      for (let side = 0; side < 2; side++) {
        const off = side === 0 ? -0.13 : 0.13;
        const bx = px + cx * off;
        const bz = pz - sx * off;
        const [lx, lz] = this.last[side];
        const d = Math.hypot(bx - lx, bz - lz);
        if (!(d < 2)) {
          this.last[side] = [bx, bz];
          continue;
        }
        if (d < 0.25) continue;
        const i = this.tHead;
        this.tHead = (this.tHead + 1) % TRAIL_MAX;
        this.tx[i] = (bx + lx) / 2;
        this.tz[i] = (bz + lz) / 2;
        this.ty[i] = this.hooks.groundAt(bx, bz) + 0.045;
        this.tyaw[i] = Math.atan2(bx - lx, bz - lz);
        this.tlen[i] = d + 0.04;
        this.tage[i] = 0;
        this.last[side] = [bx, bz];
      }
    } else {
      this.last[0] = [NaN, NaN];
      this.last[1] = [NaN, NaN];
    }
    let n = 0;
    for (let i = 0; i < TRAIL_MAX; i++) {
      if (this.tage[i] >= TRAIL_LIFE) continue;
      this.tage[i] += dt;
      const k = 1 - this.tage[i] / TRAIL_LIFE;
      if (k <= 0) continue;
      _e.set(0, this.tyaw[i], 0);
      _q.setFromEuler(_e);
      _p.set(this.tx[i], this.ty[i], this.tz[i]);
      _s.set(0.06 * k + 0.012, 1, this.tlen[i]);
      this.trail.setMatrixAt(n++, _m.compose(_p, _q, _s));
    }
    this.trail.count = n;
    this.trail.instanceMatrix.needsUpdate = true;

    // Ice spray when braking hard or carving tight at speed.
    if (on && speed > 3.2) {
      this.sprayT -= dt;
      if (this.sprayT <= 0) {
        this.sprayT = 0.18;
        this.hooks.puff(px - p.vx * 0.08, 0.12, pz - p.vz * 0.08, 1, 0.2, 0.9, 0.35);
      }
    }

    // ---- fish leaps follow the sim's list
    const live = new Set<number>();
    for (const l of st.leaps) {
      live.add(l.id);
      let v = this.leaps.get(l.id);
      if (!v) {
        const obj = this.leapObj();
        const yaw = Math.atan2(p.vx, p.vz) + (l.id % 2 ? 0.5 : -0.5);
        obj.position.set(l.x, this.hooks.groundAt(l.x, l.z), l.z);
        obj.rotation.y = yaw;
        v = { obj, fish: obj.getObjectByName('fish') ?? null, splash: obj.getObjectByName('splash') ?? null, t: l.t, yaw, x: l.x, z: l.z };
        this.leaps.set(l.id, v);
      }
      v.t = l.t;
      const u = (v.t - TELEGRAPH) / (LEAP_LIFE - TELEGRAPH);
      // Telegraph: the hole opens and splash droplets pulse; then the fish arcs over and dives back.
      const open = Math.min(1, v.t / 0.25);
      v.obj.scale.setScalar(0.6 + 0.4 * open);
      if (v.splash) {
        const pulse = u < 0 ? 0.6 + 0.5 * Math.abs(Math.sin(v.t * 14)) : Math.max(0.2, 1 - u * 1.5);
        v.splash.scale.set(1, pulse, 1);
      }
      if (v.fish) {
        if (u < 0) {
          v.fish.visible = false;
        } else {
          v.fish.visible = true;
          // Repeated little hops over the hole, each a parabola, while it is catchable.
          const hop = (u * 2.2) % 1;
          v.fish.position.set(0, 0.07 + 1.1 * Math.sin(Math.PI * hop), (hop - 0.5) * 0.9);
          v.fish.rotation.set((hop - 0.5) * 2.2, 0, 0);
        }
      }
    }
    for (const [id, v] of this.leaps) {
      if (live.has(id)) continue;
      v.obj.removeFromParent();
      v.obj.visible = false;
      this.pool.push(v.obj);
      this.leaps.delete(id);
    }
  }

  handleEvents(sim: Sim, events: SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'fishLeapSpawn':
          this.hooks.ring(e.x, e.z, 1.3, 0xbfe8ff, 0.6);
          this.hooks.sfx('fishLeapSpawn', { volume: 0.6 });
          break;
        case 'fishLeapCatch': {
          const y = this.hooks.groundAt(e.x, e.z);
          this.hooks.glint(e.x, y + 1.0, e.z, 8 + Math.min(12, e.combo * 2), 2.2);
          this.hooks.puff(e.x, y + 0.2, e.z, 6, 0.5, 1.8, 0.6);
          this.hooks.ring(e.x, e.z, 1.6 + Math.min(1.4, e.combo * 0.2), 0xe8f8ff, 0.5);
          const text = e.combo >= 2 ? `Fish leap ×${e.combo}!` : e.kept ? 'Fish leap!' : 'Caught & released';
          this.hooks.float(text, e.x, y + 2.0, e.z, e.combo >= 3 ? 'big' : 'info');
          this.hooks.sfx('fishLeapCatch', { pitch: ladderPitch(e.combo) });
          break;
        }
        case 'skateBounce': {
          const p = sim.state.player;
          this.hooks.puff(p.x, 0.25, p.z, 6, 0.4, 1.6, 0.5);
          this.hooks.sfx('skateBounce');
          break;
        }
        default:
          break;
      }
    }
  }

  debug(): { on: boolean; blades: boolean; trail: number; leaps: number; fishUp: number; level: number; action: string | null } {
    let fishUp = 0;
    for (const v of this.leaps.values()) if (v.fish?.visible) fishUp++;
    return { on: this.action === 'skate', blades: this.blades.some((b) => b.visible), trail: this.trail.count, leaps: this.leaps.size, fishUp, level: this.level, action: this.action };
  }

  reset(): void {
    for (const v of this.leaps.values()) v.obj.removeFromParent();
    this.leaps.clear();
    this.tage.fill(TRAIL_LIFE);
  }
}
