// Rescue walks presentation (docs/MECHANICS.md §2). Only constructed when the rescue mechanic is on.
// - Whiteout fringe: three ground-hugging mist layers centred on the player. Each fragment is fogged by
//   where its view ray lands on the ground, so the layers agree; ground inside any warmth (Hearth, lit
//   braziers) and inside the lantern's glow stays clear. Purely atmosphere, never gameplay.
// - The lantern: held upright in the right hand, a warm halo and a soft glow pool on the snow whose
//   radius is the leash (sim glowRadius).
// - Buried villagers: mound props at every diggable spot (a mitten waves when you come near), a dig
//   pose with snow tossed out while the sim digs, a pop and their name when they come free.
// - Followers: blanket-wrapped rigs shuffling in a conga line at the sim's positions; ones left
//   outside the glow shiver and wait under a little bubble. In any warmth they thaw with a burst.

import * as THREE from 'three';
import type { SimEvent } from '../sim';
import type { Sim } from '../sim';
import { flameSources } from '../sim/flame';
import { diggable, followers, glowRadius } from '../sim/rescue';
import { animateCharacter, createCharacter, createProp, type CharacterRig } from './models';

export interface RescueHooks {
  puff(x: number, y: number, z: number, n: number, radius: number, speed: number, scale?: number): void;
  ring(x: number, z: number, size: number, color: number, dur: number): void;
  glint(x: number, y: number, z: number, n: number, sp: number): void;
  float(text: string, x: number, y: number, z: number, kind: 'ember' | 'info' | 'big'): void;
  toast(text: string, kind: 'unlock' | 'quest' | 'info' | 'area'): void;
  sfx(name: 'dig' | 'rescued' | 'followerWait' | 'followerHome' | 'lanternOn' | 'allFound', opts?: { pitch?: number; volume?: number }): void;
  groundAt(x: number, z: number): number;
}

interface Follower {
  rig: CharacterRig;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  /** >= 0 once home: seconds since the thaw (cheer, then shrink away). */
  home: number;
  waiting: boolean;
  bubble: THREE.Sprite;
  seed: number;
}

interface Mound {
  obj: THREE.Object3D;
  hand: THREE.Object3D | null;
  shown: boolean;
  /** 0..1 pop-in; < 0 while bursting out (rescued). */
  appear: number;
  gone: number;
}

const LAYERS = [0.25, 1.3, 2.7, 4.6];
const MAX_WARM = 4;

const veilVert = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const veilFrag = /* glsl */ `
uniform vec3 uCenter;     // player x, ground y, z
uniform vec2 uClear;      // clear radius, full-fog radius (around the player)
uniform float uAmt;       // overall strength 0..1
uniform float uLayerA;    // this layer's peak opacity
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uWarmTint;
uniform float uLamp;      // lantern lit 0..1 (warm tint at the pocket edge)
uniform vec3 uWarm[${MAX_WARM}]; // x, z, radius (radius 0 = unused)
varying vec3 vW;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec3 d = normalize(vW - cameraPosition);
  // Where this view ray reaches the ground: every layer fogs by the same ground point.
  vec2 g = vW.xz - d.xz * ((vW.y - uCenter.y) / min(d.y, -0.05));
  float r = distance(g, uCenter.xz);
  float f = smoothstep(uClear.x, uClear.y, r);
  for (int i = 0; i < ${MAX_WARM}; i++) {
    if (uWarm[i].z > 0.0) f *= smoothstep(uWarm[i].z - 0.5, uWarm[i].z + 3.5, distance(g, uWarm[i].xy));
  }
  // Wind-driven drifts: two octaves of value noise blowing across the valley.
  vec2 q = g * 0.16 + vec2(uTime * 0.21, uTime * 0.05);
  float n = vnoise(q) * 0.6 + vnoise(q * 2.7 + vec2(-uTime * 0.4, 0.0)) * 0.4;
  float a = uAmt * uLayerA * f * (0.6 + 0.65 * n);
  // The lantern warms the inner edge of the pocket.
  vec3 col = mix(uColor, uWarmTint, uLamp * (1.0 - smoothstep(uClear.x, uClear.x + 3.0, r)) * 0.7);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
}`;

function bubbleTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 112;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,248,236,0.95)';
  g.strokeStyle = 'rgba(60,70,110,0.9)';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(8, 8, 112, 72, 30);
  g.moveTo(52, 78);
  g.lineTo(64, 102);
  g.lineTo(76, 78);
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(255,248,236,1)';
  g.fillRect(50, 72, 28, 9);
  g.fillStyle = '#e8902e';
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(40 + i * 24, 44, 8, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function poolTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,200,120,0.9)');
  gr.addColorStop(0.45, 'rgba(255,170,90,0.45)');
  gr.addColorStop(0.85, 'rgba(255,150,70,0.12)');
  gr.addColorStop(1, 'rgba(255,150,70,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class RescueView {
  private veil: THREE.Mesh[] = [];
  private veilMats: THREE.ShaderMaterial[] = [];
  private lantern: THREE.Object3D;
  private lanternGlow: THREE.Object3D | null;
  private lanternLight: THREE.Object3D | null;
  private halo: THREE.Sprite;
  private pool: THREE.Mesh;
  private hand: THREE.Object3D | null = null;
  private mounds = new Map<string, Mound>();
  private flw = new Map<string, Follower>();
  private bubbleTex = bubbleTexture();
  private digT = 0;
  private lamp = 0;
  private amt = 0;
  private cx = 0;
  private cz = 0;
  private seedN = 0;
  private wantMusic = false;
  /** Player pose override read by the view (digging), else null. */
  action: 'dig' | null = null;
  /** 0..1 whiteout strength around the player (wind ambience, music). */
  whiteout = 0;
  /** True while the whiteout music mood should play. */
  music = false;

  constructor(private parent: THREE.Object3D, sim: Sim, private hooks: RescueHooks) {
    const geo = new THREE.PlaneGeometry(64, 64).rotateX(-Math.PI / 2);
    for (let i = 0; i < LAYERS.length; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: veilVert,
        fragmentShader: veilFrag,
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: {
          uCenter: { value: new THREE.Vector3() },
          uClear: { value: new THREE.Vector2(4, 11) },
          uAmt: { value: 0 },
          uLayerA: { value: [0.4, 0.32, 0.28, 0.3][i] },
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(0xdde6f2) },
          uWarmTint: { value: new THREE.Color(0xffd7a0) },
          uLamp: { value: 0 },
          uWarm: { value: Array.from({ length: MAX_WARM }, () => new THREE.Vector3()) },
        },
      });
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      m.renderOrder = 8 + i; // after the ground decals, before the guide arrow (15) and labels
      m.visible = false;
      m.name = `whiteout${i}`;
      parent.add(m);
      this.veil.push(m);
      this.veilMats.push(mat);
    }
    this.lantern = createProp('lanternHeld');
    this.lantern.visible = false;
    this.lanternGlow = this.lantern.getObjectByName('glow') ?? null;
    this.lanternLight = this.lantern.getObjectByName('light') ?? null;
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
    this.halo.scale.set(1.5, 1.5, 1);
    this.halo.renderOrder = 12;
    this.halo.visible = false;
    parent.add(this.halo);
    this.pool = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false, fog: false }),
    );
    this.pool.renderOrder = 3;
    this.pool.visible = false;
    parent.add(this.pool);
    void sim;
  }

  /** The lantern rides in the player's right hand. */
  attach(playerRoot: THREE.Object3D): void {
    this.hand = playerRoot.getObjectByName('handR') ?? playerRoot;
    this.lantern.removeFromParent();
    this.hand.add(this.lantern);
  }

  private mound(sim: Sim, id: string): Mound {
    let m = this.mounds.get(id);
    if (!m) {
      const v = sim.data.mech.villagers.find((x) => x.id === id)!;
      const seed = sim.data.mech.villagers.indexOf(v);
      const obj = createProp('buriedVillager', { seed });
      obj.position.set(v.x, this.hooks.groundAt(v.x, v.z), v.z);
      obj.rotation.y = ((seed * 2.39996) % (Math.PI * 2)) - Math.PI;
      obj.visible = false;
      this.parent.add(obj);
      m = { obj, hand: obj.getObjectByName('hand') ?? null, shown: false, appear: 0, gone: 0 };
      this.mounds.set(id, m);
    }
    return m;
  }

  private follower(id: string, x: number, z: number): Follower {
    let f = this.flw.get(id);
    if (!f) {
      const seed = this.seedN++;
      const rig = createCharacter('villager', { variant: 'rescued', seed });
      rig.root.position.set(x, this.hooks.groundAt(x, z), z);
      this.parent.add(rig.root);
      const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bubbleTex, depthTest: false, transparent: true, toneMapped: false, fog: false }));
      bubble.scale.set(0.86, 0.75, 1);
      bubble.renderOrder = 56;
      bubble.visible = false;
      this.parent.add(bubble);
      f = { rig, x, z, yaw: 0, speed: 0, home: -1, waiting: false, bubble, seed };
      this.flw.set(id, f);
    }
    return f;
  }

  update(sim: Sim, dt: number, t: number, px: number, pz: number, title: boolean): void {
    const r = sim.state.rescue;
    const p = sim.state.player;
    const glow = r.lantern > 0 ? glowRadius(sim) : 0;
    const lit = !!r.lit && r.lantern > 0 && !title;
    this.lamp += ((lit ? 1 : 0) - this.lamp) * Math.min(1, dt * 4);

    // ---- buried villagers
    for (const v of sim.data.mech.villagers) {
      const can = diggable(sim, v);
      if (!can && !this.mounds.has(v.id)) continue;
      const m = this.mound(sim, v.id);
      if (can && !m.shown) {
        m.shown = true;
        m.appear = 0;
        m.obj.visible = true;
      } else if (!can && m.shown && m.appear >= 0) {
        // Status set: rescued just now (burst handled by the event) or loaded already free.
        m.appear = -1e-6;
        m.gone = r.status[v.id] ? 0 : 1;
      }
      if (!m.obj.visible) continue;
      if (m.appear >= 0) {
        m.appear = Math.min(1, m.appear + dt / 0.5);
        const k = m.appear;
        const digging = r.dig?.id === v.id ? Math.min(1, r.dig.t / sim.data.mech.digTime) : 0;
        const s = 0.3 + 0.7 * (1 - Math.pow(1 - k, 3));
        m.obj.scale.set(s * (1 + digging * 0.08 * Math.sin(t * 30)), s * (1 - digging * 0.45), s);
        if (m.hand) {
          const near = Math.hypot(v.x - px, v.z - pz) < 8;
          m.hand.rotation.z = near ? Math.sin(t * 3 + v.x) * 0.45 : Math.sin(t * 0.8 + v.z) * 0.12;
        }
      } else {
        m.gone = Math.min(1, m.gone + dt / 0.35);
        const s = 1 - m.gone;
        m.obj.scale.set(1 + m.gone * 0.4, Math.max(0.01, s), 1 + m.gone * 0.4);
        if (m.gone >= 1) {
          m.obj.visible = false;
          m.shown = false;
        }
      }
    }

    // ---- digging: pose and snow tossed out of the hole
    const digV = r.dig ? sim.data.mech.villagers.find((x) => x.id === r.dig!.id) : undefined;
    const speed = Math.hypot(p.vx, p.vz);
    this.action = digV && speed < 1.2 ? 'dig' : null;
    if (digV) {
      this.digT -= dt;
      if (this.digT <= 0) {
        this.digT = 0.22;
        const a = t * 5.3;
        this.hooks.puff(digV.x + Math.cos(a) * 0.35, 0.45, digV.z + Math.sin(a) * 0.35, 2, 0.35, 1.8, 0.7);
      }
    }

    // ---- followers
    const live = followers(sim);
    const seen = new Set<string>();
    const k = 1 - Math.exp(-dt * 12);
    for (const q of live) {
      seen.add(q.id);
      const f = this.follower(q.id, q.x, q.z);
      const ox = f.x;
      const oz = f.z;
      f.x += (q.x - f.x) * k;
      f.z += (q.z - f.z) * k;
      const mv = Math.hypot(f.x - ox, f.z - oz) / Math.max(dt, 1e-3);
      f.speed += (mv - f.speed) * Math.min(1, dt * 8);
      if (mv > 0.2) {
        const want = Math.atan2(f.x - ox, f.z - oz);
        let d = want - f.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        f.yaw += d * Math.min(1, dt * 10);
      } else if (q.status === 'waiting') {
        // Waiting: turn to face the player.
        const want = Math.atan2(px - f.x, pz - f.z);
        let d = want - f.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        f.yaw += d * Math.min(1, dt * 2);
      }
      f.waiting = q.status === 'waiting';
      f.home = -1;
    }
    for (const [id, f] of this.flw) {
      if (!seen.has(id) && f.home < 0) f.home = 0; // went home (or the save reset): thaw out
      const root = f.rig.root;
      root.position.set(f.x, this.hooks.groundAt(f.x, f.z), f.z);
      root.rotation.y = f.yaw;
      let action: 'shuffle' | 'shiver' | 'cheer' = f.waiting ? 'shiver' : 'shuffle';
      if (f.home >= 0) {
        f.home += dt;
        action = 'cheer';
        const out = Math.max(0, (f.home - 1.0) / 0.4);
        root.scale.setScalar(Math.max(0.01, 1 - out));
        if (out >= 1) {
          root.removeFromParent();
          f.bubble.removeFromParent();
          (f.bubble.material as THREE.Material).dispose();
          this.flw.delete(id);
          this.hooks.puff(f.x, 0.4, f.z, 4, 0.4, 0.9);
          continue;
        }
      } else root.scale.setScalar(1);
      animateCharacter(f.rig, { time: t + f.seed * 0.37, speed: f.speed < 0.08 ? 0 : f.speed, carrying: false, action });
      f.bubble.visible = f.waiting && f.home < 0 && !title;
      if (f.bubble.visible) f.bubble.position.set(f.x, root.position.y + f.rig.height + 0.45 + Math.sin(t * 2.4 + f.seed) * 0.06, f.z);
    }

    // ---- the lantern, its halo and the glow pool on the snow
    const hasLantern = r.lantern > 0 && !title;
    this.lantern.visible = hasLantern;
    if (this.lanternGlow) this.lanternGlow.visible = this.lamp > 0.3;
    if (hasLantern && this.hand) {
      // Keep the pole upright whatever the arm is doing, with a little swing from walking.
      const root = this.hand.parent ? this.findRoot(this.hand) : null;
      if (root) {
        root.updateMatrixWorld(true);
        this.hand.getWorldQuaternion(_q).invert();
        root.getWorldQuaternion(_q2);
        _q.multiply(_q2);
        this.lantern.quaternion.copy(_q);
        this.lantern.rotateZ(Math.sin(t * 7) * Math.min(0.18, speed * 0.03));
        this.lantern.rotateX(Math.sin(t * 5.3) * Math.min(0.12, speed * 0.02));
        this.lantern.scale.setScalar(0.82);
      }
    }
    this.halo.visible = hasLantern && this.lamp > 0.05;
    this.pool.visible = hasLantern && this.lamp > 0.02;
    if (this.halo.visible && this.lanternLight) {
      this.lanternLight.getWorldPosition(_v);
      this.halo.position.copy(_v);
      const fl = 1 + Math.sin(t * 11) * 0.04 + Math.sin(t * 17.3) * 0.03;
      this.halo.scale.setScalar(1.5 * fl * this.lamp);
      (this.halo.material as THREE.SpriteMaterial).opacity = 0.85 * this.lamp;
    }
    if (this.pool.visible) {
      this.pool.position.set(px, this.hooks.groundAt(px, pz) + 0.04, pz);
      this.pool.scale.setScalar(Math.max(1, glow * 0.9));
      (this.pool.material as THREE.MeshBasicMaterial).opacity = 0.32 * this.lamp * (1 + Math.sin(t * 9) * 0.04);
    }

    // ---- the whiteout fringe
    this.cx += (px - this.cx) * Math.min(1, dt * 10);
    this.cz += (pz - this.cz) * Math.min(1, dt * 10);
    if (Math.hypot(px - this.cx, pz - this.cz) > 6) {
      this.cx = px;
      this.cz = pz;
    }
    const warm = flameSources(sim)
      .map((s) => ({ x: s.x, z: s.z, r: s.id === 'hearth' ? sim.warmRadius() : sim.data.mech.brazierWarm, d: Math.hypot(s.x - px, s.z - pz) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_WARM);
    let nearEdge = Infinity;
    for (const w of warm) nearEdge = Math.min(nearEdge, w.d - w.r);
    // Full strength a few metres out in the cold; nothing deep inside the warmth.
    const target = title ? 0 : Math.max(0, Math.min(1, (nearEdge + 6) / 10));
    this.amt += (target - this.amt) * Math.min(1, dt * 1.5);
    this.whiteout = Math.max(0, Math.min(1, (nearEdge - 1) / 6));
    const clearIn = 3.6 + (glow > 0 ? (glow - 3.6) * this.lamp : 0);
    const clearOut = clearIn + 6.5 + this.lamp * 1.5;
    const gy = this.hooks.groundAt(px, pz);
    const on = this.amt > 0.01;
    for (let i = 0; i < this.veil.length; i++) {
      const m = this.veil[i];
      m.visible = on;
      if (!on) continue;
      m.position.set(this.cx, gy + LAYERS[i], this.cz);
      const u = this.veilMats[i].uniforms;
      (u.uCenter.value as THREE.Vector3).set(this.cx, gy, this.cz);
      (u.uClear.value as THREE.Vector2).set(clearIn, clearOut);
      u.uAmt.value = this.amt;
      u.uTime.value = t;
      u.uLamp.value = this.lamp;
      const arr = u.uWarm.value as THREE.Vector3[];
      for (let j = 0; j < MAX_WARM; j++) {
        const w = warm[j];
        if (w) arr[j].set(w.x, w.z, w.r);
        else arr[j].set(0, 0, 0);
      }
    }
    // Whiteout music while lantern-walking deep in the fringe (with hysteresis).
    if (!this.wantMusic && lit && this.whiteout > 0.75) this.wantMusic = true;
    else if (this.wantMusic && (!lit || this.whiteout < 0.35)) this.wantMusic = false;
    this.music = this.wantMusic;
  }

  private findRoot(o: THREE.Object3D): THREE.Object3D {
    let r = o;
    while (r.parent && r.parent !== this.parent) r = r.parent;
    return r;
  }

  handleEvents(sim: Sim, events: SimEvent[]): void {
    const vill = (id: string) => sim.data.mech.villagers.find((v) => v.id === id);
    for (const e of events) {
      switch (e.type) {
        case 'lanternOn':
          this.hooks.sfx('lanternOn', { volume: 0.7 });
          break;
        case 'digStart': {
          const v = vill(e.id);
          if (v) this.hooks.puff(v.x, 0.4, v.z, 6, 0.5, 1.6, 0.8);
          this.hooks.sfx('dig', { volume: 0.8 });
          break;
        }
        case 'rescued': {
          const v = vill(e.id);
          if (!v) break;
          const m = this.mounds.get(e.id);
          if (m) {
            m.appear = -1e-6;
            m.gone = 0;
          }
          this.hooks.puff(v.x, 0.5, v.z, 12, 0.8, 2.4, 1);
          this.hooks.glint(v.x, 1.1, v.z, 8, 1.6);
          this.hooks.ring(v.x, v.z, 1.8, 0xffe0a8, 0.7);
          this.hooks.float(v.name, v.x, 2.3, v.z, 'big');
          this.hooks.toast(`${v.name}: “${v.line}”`, 'info');
          this.hooks.sfx('rescued');
          break;
        }
        case 'followerWait':
          this.hooks.sfx('followerWait', { volume: 0.55 });
          break;
        case 'followerHome': {
          const f = this.flw.get(e.id);
          const v = vill(e.id);
          const x = f?.x ?? v?.x ?? 0;
          const z = f?.z ?? v?.z ?? 0;
          if (f) {
            f.home = 0;
            f.waiting = false;
          }
          this.hooks.ring(x, z, 2.4, 0xffb060, 0.9);
          this.hooks.glint(x, 1.2, z, 12, 2);
          this.hooks.puff(x, 0.6, z, 8, 0.6, 1.4);
          if (v) this.hooks.float(`${v.name} is home`, x, 2.4, z, 'info');
          this.hooks.sfx('followerHome');
          break;
        }
        case 'areaAllFound': {
          const name = sim.data.areas.find((a) => a.id === e.area)?.name ?? e.area;
          this.hooks.toast(`Everyone lost in ${name} is home!`, 'area');
          this.hooks.sfx('allFound', { volume: 0.7 });
          break;
        }
        case 'allFound':
          this.hooks.toast('All 24 found — the valley is whole', 'area');
          this.hooks.sfx('allFound');
          break;
        default:
          break;
      }
    }
  }

  /** Debug/e2e snapshot. */
  debug(): { mounds: number; followers: number; waiting: number; lantern: boolean; lamp: number; veil: number; action: string | null; music: boolean } {
    let mounds = 0;
    for (const m of this.mounds.values()) if (m.obj.visible) mounds++;
    let waiting = 0;
    for (const f of this.flw.values()) if (f.waiting) waiting++;
    return { mounds, followers: this.flw.size, waiting, lantern: this.lantern.visible, lamp: this.lamp, veil: this.veil[0].visible ? this.amt : 0, action: this.action, music: this.music };
  }

  /** Load/reset: drop all followers and mounds (rebuilt lazily from the sim). */
  reset(): void {
    for (const f of this.flw.values()) {
      f.rig.root.removeFromParent();
      f.bubble.removeFromParent();
    }
    this.flw.clear();
    for (const m of this.mounds.values()) m.obj.removeFromParent();
    this.mounds.clear();
  }
}
