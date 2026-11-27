// The Great Beacon: drawn here (stage by stage) instead of the static decor instance. Each stage
// rises with a build-up of sparks, drops into place, settles with a squash and a dust/snow puff,
// with a camera beat. Once the finale starts it burns: flame, crown glow and a light pillar.

import * as THREE from 'three';
import type { DecorDef } from '../../data/types';
import type { SimEvent } from '../../sim';
import { createProp } from '../models';
import { clamp01, fxOf, glowSprite, hooksOf, rigOf, sfxAt, smooth, worldOf, type LateCtx, type LatePart } from './ctx';

const pillarMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0xffc070) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uAlpha; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float y = vUv.y;
        float side = pow(sin(vUv.x * 3.14159 * 2.0 * 3.0 + uTime * 1.3) * 0.5 + 0.5, 2.0) * 0.35 + 0.65;
        float a = (1.0 - smoothstep(0.0, 1.0, y)) * smoothstep(0.0, 0.03, y) * side;
        float streak = smoothstep(0.7, 1.0, sin(y * 40.0 - uTime * 6.0 + vUv.x * 12.0)) * 0.25 * (1.0 - y);
        gl_FragColor = vec4(uColor * (1.0 + streak), (a + streak) * uAlpha);
      }`,
  });

export class BeaconView implements LatePart {
  readonly root = new THREE.Group();
  private obj: THREE.Object3D | null = null;
  private level = -1;
  private def: DecorDef | null;
  private height = 4;
  private flame: THREE.Object3D | null = null;
  private pillar: THREE.Mesh;
  private crownGlow: THREE.Sprite;
  private haloGlow: THREE.Sprite;
  /** 0..1 how alight the Beacon is (eases). */
  lit = 0;
  private build: { t: number; from: number } | null = null;
  private hidOriginal = false;
  private sparkT = 0;

  constructor(private ctx: LateCtx) {
    this.def = ctx.sim.data.decor.find((d) => d.model === 'beacon') ?? null;
    ctx.view.scene.add(this.root);
    if (this.def) {
      this.root.position.set(this.def.x, 0, this.def.z);
      this.root.rotation.y = this.def.rot ?? 0;
      this.root.scale.setScalar(this.def.scale ?? 1);
    }
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, 70, 18, 1, true).translate(0, 35, 0), pillarMat());
    this.pillar.renderOrder = 8;
    this.pillar.frustumCulled = false;
    this.pillar.visible = false;
    this.root.add(this.pillar);
    this.crownGlow = glowSprite(7, 'rgba(255,248,220,1)', 'rgba(255,170,70,0.55)');
    this.crownGlow.visible = false;
    this.crownGlow.renderOrder = 9;
    this.root.add(this.crownGlow);
    this.haloGlow = glowSprite(26, 'rgba(255,200,130,0.55)', 'rgba(255,140,60,0.18)');
    this.haloGlow.visible = false;
    this.haloGlow.renderOrder = 7;
    this.root.add(this.haloGlow);
    this.reset();
  }

  /** World position of the crown (fire bowl), for the camera and effects. */
  crown(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.root.position.x, this.height, this.root.position.z);
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  reset(): void {
    this.setLevel(this.ctx.sim.state.beacon, false);
    this.lit = this.ctx.sim.state.finale.phase === 'none' ? 0 : 1;
    this.build = null;
  }

  private hideOriginal(): void {
    if (this.hidOriginal) return;
    let found = false;
    worldOf(this.ctx.view).root.traverse((o) => {
      if (o.name === 'beacon#inst') {
        o.visible = false;
        found = true;
      }
    });
    this.hidOriginal = found;
  }

  private setLevel(level: number, animate: boolean): void {
    if (!this.def || level === this.level) return;
    const from = this.level;
    this.level = level;
    if (this.obj) this.obj.removeFromParent();
    this.obj = createProp('beacon', { level, seed: 7 });
    this.root.add(this.obj);
    this.flame = this.obj.getObjectByName('flame') ?? null;
    this.height = (this.obj.userData.height as number | undefined) ?? new THREE.Box3().setFromObject(this.obj).max.y;
    this.crownGlow.position.set(0, this.height + 1.2, 0);
    this.haloGlow.position.set(0, this.height + 1.8, 0);
    this.pillar.position.set(0, this.height + 0.8, 0);
    if (animate) this.build = { t: 0, from };
  }

  handle(e: SimEvent): void {
    if (e.type !== 'beaconStage' || !this.def) return;
    const v = this.ctx.view;
    const fx = fxOf(v);
    const d = this.def;
    // Build-up: sparks spiral up the tower, then the new storey drops in.
    this.sparkT = 0.9;
    fx.puff(d.x, 0.2, d.z, 16, 2.6, 2.4);
    sfxAt(v, 'beaconStage', undefined, { volume: 1 });
    rigOf(v).startPan(d.x, d.z + 3, 3.4);
    rigOf(v).pulse(0.8);
    hooksOf(v).toast(e.stage >= 4 ? 'The Great Beacon is complete!' : `The Beacon rises: ${e.stage} / 4`, 'area');
    this.pendingLevel = e.stage;
    this.pendingT = 0.55;
  }

  private pendingLevel = -1;
  private pendingT = 0;

  frame(dt: number): void {
    this.hideOriginal();
    const v = this.ctx.view;
    const s = this.ctx.sim.state;
    const fx = fxOf(v);
    const t = this.ctx.time;
    if (this.pendingLevel >= 0) {
      this.pendingT -= dt;
      if (this.pendingT <= 0) {
        this.setLevel(this.pendingLevel, true);
        this.pendingLevel = -1;
      }
    } else if (s.beacon !== this.level && !this.build) this.setLevel(s.beacon, false);

    if (this.sparkT > 0 && this.def) {
      this.sparkT -= dt;
      const k = 1 - this.sparkT / 0.9;
      const a = t * 9;
      const r = 2.2 - k * 0.8;
      fx.glint(this.def.x + Math.cos(a) * r, 0.5 + k * this.height, this.def.z + Math.sin(a) * r, 2, 0.6);
    }

    // Drop + settle.
    if (this.obj) {
      if (this.build) {
        const b = this.build;
        b.t += dt;
        const fall = 0.32;
        if (b.t < fall) {
          const k = b.t / fall;
          this.obj.position.y = (1 - k * k) * 1.6;
          this.obj.scale.set(0.96, 1.06, 0.96);
        } else {
          const k = (b.t - fall) / 0.6;
          if (k < 0.02 && !(b as { landed?: boolean }).landed && this.def) {
            (b as { landed?: boolean }).landed = true;
            fx.puff(this.def.x, 0.15, this.def.z, 22, 3, 3.2, 1.2);
            fx.ring(this.def.x, this.def.z, 6, 0xfff0d0, 0.9);
            fx.shatter(this.def.x, 0.3, this.def.z, 10, 1.6);
            rigOf(v).shake(0.45, 0.5);
            sfxAt(v, 'hammer', undefined, { pitch: 0.7, volume: 1 });
          }
          this.obj.position.y = 0;
          const sq = Math.sin(clamp01(k) * Math.PI * 2.5) * (1 - clamp01(k)) * 0.07;
          this.obj.scale.set(1 + sq, 1 - sq, 1 + sq);
          if (k >= 1) {
            this.build = null;
            this.obj.scale.set(1, 1, 1);
          }
        }
      }
    }

    // Lit state: from the finale (whoever or whatever started it).
    const phase = s.finale.phase;
    const wantLit = phase === 'none' ? 0 : phase === 'lighting' ? smooth((s.finale.t - 0.3) / 2.2) : 1;
    this.lit += (wantLit - this.lit) * Math.min(1, dt * (wantLit > this.lit ? 3 : 1));
    const L = this.lit;
    const on = L > 0.01;
    if (this.flame) {
      this.flame.visible = on;
      const fl = 1 + Math.sin(t * 11) * 0.07 + Math.sin(t * 17.3) * 0.05;
      const k = Math.max(0.001, L * (phase === 'lighting' ? 1 + 0.4 * Math.sin(clamp01(s.finale.progress) * Math.PI) : 1));
      this.flame.scale.set(k * (1 + Math.sin(t * 9) * 0.04), k * fl, k * (1 + Math.cos(t * 8) * 0.04));
    }
    this.crownGlow.visible = on;
    this.haloGlow.visible = on;
    const pulse = 0.9 + Math.sin(t * 7) * 0.05 + Math.sin(t * 13) * 0.04;
    this.crownGlow.scale.setScalar(7 * L * pulse);
    (this.crownGlow.material as THREE.SpriteMaterial).opacity = L;
    this.haloGlow.scale.setScalar(26 * L);
    (this.haloGlow.material as THREE.SpriteMaterial).opacity = 0.75 * L;
    // Light pillar: rises during the lighting, then settles to a soft beam that stays.
    const pm = this.pillar.material as THREE.ShaderMaterial;
    const rise = phase === 'lighting' ? smooth((s.finale.t - 1.0) / 3.2) : on ? 1 : 0;
    const strength = phase === 'lighting' ? 0.9 * rise : phase === 'dawn' ? 0.9 - 0.55 * smooth(s.finale.progress) : 0.35;
    this.pillar.visible = on && rise > 0.01;
    this.pillar.scale.set(1 + (phase === 'lighting' ? Math.sin(t * 20) * 0.03 : 0), Math.max(0.001, rise), 1 + 0);
    pm.uniforms.uTime.value = t;
    pm.uniforms.uAlpha.value = strength * L;
    // Embers streaming up off the fire.
    if (on && Math.random() < dt * 14 * L && this.def) {
      fx.glint(this.def.x + (Math.random() - 0.5) * 1.2, this.height + 1.3, this.def.z + (Math.random() - 0.5) * 1.2, 1, 0.8);
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    (this.pillar.material as THREE.Material).dispose();
    this.pillar.geometry.dispose();
  }
}
