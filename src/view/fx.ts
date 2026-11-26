// Particle-ish effects: snowfall, hearth sparks, ice shards, snow puffs, shockwave rings, footprints.

import * as THREE from 'three';
import { PALETTE } from './models';

// ------------------------------------------------------------------ snowfall (GPU-animated points)

export class Snowfall {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;

  constructor(parent: THREE.Object3D, count: number) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count);
    let s = 12345;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = r() * 40 - 20;
      pos[i * 3 + 1] = r() * 16;
      pos[i * 3 + 2] = r() * 40 - 20;
      rnd[i] = r();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uOrigin: { value: new THREE.Vector3() },
        uSize: { value: 1 },
        uWind: { value: 0.5 },
        uColor: { value: new THREE.Color(0xf4f8ff) },
      },
      vertexShader: /* glsl */ `
        attribute float aRnd;
        uniform float uTime; uniform vec3 uOrigin; uniform float uSize; uniform float uWind;
        varying float vA;
        void main() {
          vec3 p = position;
          float fall = 0.9 + aRnd * 0.9;
          p.y = mod(p.y - uTime * fall, 16.0);
          p.x += sin(uTime * (0.6 + aRnd) + aRnd * 30.0) * 0.6 + uTime * uWind * 1.4;
          p.z += cos(uTime * (0.5 + aRnd) + aRnd * 17.0) * 0.4 + uTime * uWind * 0.6;
          // Wrap around the camera target so the box follows the player.
          p.x = mod(p.x - uOrigin.x + 20.0, 40.0) - 20.0 + uOrigin.x;
          p.z = mod(p.z - uOrigin.z + 20.0, 40.0) - 20.0 + uOrigin.z;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (2.0 + aRnd * 3.0) * (30.0 / -mv.z);
          vA = 0.55 + aRnd * 0.45;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          gl_FragColor = vec4(uColor, smoothstep(0.5, 0.1, d) * vA * 0.85);
        }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    parent.add(this.points);
  }

  update(time: number, origin: THREE.Vector3, pixelRatio: number, wind: number): void {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uOrigin.value.copy(origin);
    this.mat.uniforms.uSize.value = pixelRatio;
    this.mat.uniforms.uWind.value = wind;
  }
}

// ------------------------------------------------------------------ rising sparks above fires

export class Sparks {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;

  constructor(parent: THREE.Object3D, count = 70) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      rnd[i] = (i * 0.618034) % 1;
      pos[i * 3] = Math.cos(i * 2.4) * 0.5 * rnd[i];
      pos[i * 3 + 2] = Math.sin(i * 2.4) * 0.5 * rnd[i];
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSize: { value: 1 }, uPower: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aRnd; uniform float uTime; uniform float uSize; uniform float uPower;
        varying float vLife;
        void main() {
          float t = fract(uTime * (0.35 + aRnd * 0.3) + aRnd * 7.0);
          vec3 p = position;
          p.y += 0.9 + t * (2.4 + aRnd * 2.0) * uPower;
          p.x += sin(t * 6.0 + aRnd * 20.0) * 0.35 * t;
          p.z += cos(t * 5.0 + aRnd * 13.0) * 0.35 * t;
          vLife = 1.0 - t;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (3.0 + aRnd * 3.0) * (24.0 / -mv.z) * vLife;
        }`,
      fragmentShader: /* glsl */ `
        varying float vLife;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          vec3 c = mix(vec3(1.0, 0.35, 0.1), vec3(1.0, 0.85, 0.4), vLife);
          gl_FragColor = vec4(c, smoothstep(0.5, 0.0, d) * vLife);
        }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    parent.add(this.points);
  }

  update(time: number, pr: number, power: number): void {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uSize.value = pr;
    this.mat.uniforms.uPower.value = power;
  }
}

// ------------------------------------------------------------------ pooled instanced particles

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  vr: number;
  life: number;
  max: number;
  size: number;
  grow: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private ps: Particle[] = [];
  private cap: number;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, private gravity: number, private drag: number) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }
  spawn(p: Particle): void {
    if (this.ps.length >= this.cap) this.ps.shift();
    this.ps.push(p);
  }
  update(dt: number): void {
    let n = 0;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.ps.splice(i, 1);
        continue;
      }
      p.vy -= this.gravity * dt;
      const k = Math.exp(-this.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy *= this.drag > 2 ? k : 1;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03 && this.gravity > 0) {
        p.y = 0.03;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
        p.vr *= 0.5;
      }
      p.rx += p.vr * dt;
      p.ry += p.vr * 0.7 * dt;
    }
    for (const p of this.ps) {
      const t = p.life / p.max;
      const sc = p.size * (p.grow > 0 ? 0.4 + t * p.grow : 1) * (t > 0.7 ? (1 - t) / 0.3 : 1);
      _e.set(p.rx, p.ry, 0);
      _q.setFromEuler(_e);
      _v.set(p.x, p.y, p.z);
      _s.set(sc, sc, sc);
      _m.compose(_v, _q, _s);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Effects {
  private shards: ParticlePool;
  private puffs: ParticlePool;
  private glints: ParticlePool;
  private steam: ParticlePool;
  private smokeP: ParticlePool;
  private rings: { mesh: THREE.Mesh; t: number; max: number; size: number }[] = [];
  private ringGeo = new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2);
  private parent: THREE.Object3D;

  constructor(parent: THREE.Object3D) {
    this.parent = parent;
    const shardMat = new THREE.MeshStandardMaterial({ color: PALETTE.ice, roughness: 0.2, metalness: 0.1, emissive: 0x3a6a8a, emissiveIntensity: 0.4, flatShading: true });
    this.shards = new ParticlePool(parent, new THREE.OctahedronGeometry(0.09, 0), shardMat, 260, 14, 0.6);
    const puffMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85, flatShading: true });
    this.puffs = new ParticlePool(parent, new THREE.IcosahedronGeometry(0.25, 0), puffMat, 220, -0.6, 3.2);
    const glintMat = new THREE.MeshBasicMaterial({ color: PALETTE.ember, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glints = new ParticlePool(parent, new THREE.OctahedronGeometry(0.07, 0), glintMat, 200, 2.5, 1.2);
    const steamMat = new THREE.MeshBasicMaterial({ color: 0xf2f6ff, transparent: true, opacity: 0.55, depthWrite: false, fog: true });
    this.steam = new ParticlePool(parent, new THREE.IcosahedronGeometry(0.2, 1), steamMat, 120, -0.9, 1.5);
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0x8a90a8, transparent: true, opacity: 0.45, depthWrite: false, fog: true });
    this.smokeP = new ParticlePool(parent, new THREE.IcosahedronGeometry(0.28, 1), smokeMat, 120, -0.5, 0.8);
  }

  /** The icy shell cracking off a thawing villager. */
  shatter(x: number, y: number, z: number, n = 16, spread = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.5 + Math.random() * 2.5) * spread;
      this.shards.spawn({
        x: x + Math.cos(a) * 0.2, y: y + Math.random() * 0.8, z: z + Math.sin(a) * 0.2,
        vx: Math.cos(a) * sp, vy: 2.5 + Math.random() * 3, vz: Math.sin(a) * sp,
        rx: Math.random() * 6, ry: Math.random() * 6, vr: 8 + Math.random() * 10,
        life: 0, max: 0.9 + Math.random() * 0.6, size: 0.7 + Math.random() * 1.1, grow: 0,
      });
    }
  }

  /** Soft snow puff (new building, footsteps on landing, tree fall). */
  puff(x: number, y: number, z: number, n = 10, radius = 1, speed = 1.6, scale = 1): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const r = radius * (0.6 + Math.random() * 0.5);
      this.puffs.spawn({
        x: x + Math.cos(a) * r * 0.5, y: y + Math.random() * 0.2, z: z + Math.sin(a) * r * 0.5,
        vx: Math.cos(a) * speed * (0.6 + Math.random()), vy: 0.4 + Math.random() * 0.9, vz: Math.sin(a) * speed * (0.6 + Math.random()),
        rx: Math.random() * 6, ry: Math.random() * 6, vr: 1 + Math.random() * 2,
        life: 0, max: 0.7 + Math.random() * 0.5, size: (0.6 + Math.random() * 0.9) * scale, grow: 1.6,
      });
    }
  }

  /** Soft rising steam (kettles, breath) or chimney smoke. */
  vapour(kind: 'steam' | 'smoke' | 'breath', x: number, y: number, z: number, dx = 0, dz = 0): void {
    const pool = kind === 'smoke' ? this.smokeP : this.steam;
    const small = kind === 'breath';
    pool.spawn({
      x: x + (Math.random() - 0.5) * 0.1, y, z: z + (Math.random() - 0.5) * 0.1,
      vx: dx + (Math.random() - 0.5) * 0.25 + (kind === 'smoke' ? 0.25 : 0), vy: small ? 0.25 : 0.6 + Math.random() * 0.4, vz: dz + (Math.random() - 0.5) * 0.25,
      rx: Math.random() * 6, ry: Math.random() * 6, vr: 0.6,
      life: 0, max: small ? 0.8 : kind === 'smoke' ? 2.6 : 1.4, size: small ? 0.45 : kind === 'smoke' ? 0.9 : 0.7, grow: small ? 1.8 : 2.6,
    });
  }

  /** Warm glints (pad complete, ember bursts). */
  glint(x: number, y: number, z: number, n = 12, sp = 2.5): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = sp * (0.5 + Math.random());
      this.glints.spawn({
        x, y, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s,
        rx: 0, ry: 0, vr: 6, life: 0, max: 0.6 + Math.random() * 0.5, size: 0.8 + Math.random() * 0.8, grow: 0,
      });
    }
  }

  /** Expanding ring on the ground (pad ka-chunk, hearth shockwave). */
  ring(x: number, z: number, size: number, color: number, dur = 0.8): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.set(x, 0.12, z);
    mesh.renderOrder = 5;
    this.parent.add(mesh);
    this.rings.push({ mesh, t: 0, max: dur, size });
  }

  update(dt: number): void {
    this.shards.update(dt);
    this.puffs.update(dt);
    this.glints.update(dt);
    this.steam.update(dt);
    this.smokeP.update(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const t = r.t / r.max;
      if (t >= 1) {
        r.mesh.removeFromParent();
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - t, 3);
      const s = 0.3 + e * r.size;
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
    }
  }
}

// ------------------------------------------------------------------ footprints in the snow

export class Footprints {
  private mesh: THREE.InstancedMesh;
  private prints: { x: number; z: number; yaw: number; t: number }[] = [];
  private cap = 70;
  private acc = 0;
  private side = 1;
  private lx = 0;
  private lz = 0;

  constructor(parent: THREE.Object3D) {
    const geo = new THREE.CircleGeometry(0.11, 10).rotateX(-Math.PI / 2).scale(0.8, 1, 1.3);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8ea6c8, transparent: true, opacity: 0.45, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    parent.add(this.mesh);
  }

  /** Call every frame with the player's position; `inSnow` false suppresses new prints. */
  update(dt: number, x: number, z: number, yaw: number, inSnow: boolean): void {
    const d = Math.hypot(x - this.lx, z - this.lz);
    this.lx = x;
    this.lz = z;
    this.acc += d;
    if (this.acc > 0.55 && inSnow) {
      this.acc = 0;
      this.side = -this.side;
      const ox = Math.cos(yaw) * 0.13 * this.side;
      const oz = -Math.sin(yaw) * 0.13 * this.side;
      this.prints.push({ x: x + ox, z: z + oz, yaw, t: 0 });
      if (this.prints.length > this.cap) this.prints.shift();
    }
    let n = 0;
    for (let i = this.prints.length - 1; i >= 0; i--) {
      const p = this.prints[i];
      p.t += dt;
      if (p.t > 9) {
        this.prints.splice(i, 1);
        continue;
      }
    }
    for (const p of this.prints) {
      const s = p.t > 6 ? 1 - (p.t - 6) / 3 : 1;
      _e.set(0, p.yaw, 0);
      _q.setFromEuler(_e);
      _v.set(p.x, 0.16, p.z);
      _s.set(s, 1, s);
      _m.compose(_v, _q, _s);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
