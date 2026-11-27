// The finale, driven purely by sim state (state.finale {phase, t, progress}, state.beacon,
// sim.warmRadius()) and events — never by who or what lit the Beacon.
//
// Storyboard (T = seconds since the Beacon caught; lighting = 0..L, dawn = L..L+D, from the data):
//   0.0  camera glides to the foot of the Beacon, looking up; the flame catches, the storm swirls
//   1–4  the light pillar climbs into the clouds, embers stream up, wind howls
//   L    dawn: shockwave rings roll out, the storm tears open (snow stops, fog lifts), the sky
//        grades from night to a warm dawn with the sun glowing on the horizon behind the Beacon,
//        aurora fades; 'dawn' swell now, finale music ~2.5 s later
//   L+   the camera pulls up and glides over every area the player rebuilt (from the area data)
//        while the warm radius sweeps the valley green and every Icebound thaws in a rolling
//        cascade outward from the Beacon
//   ~+18 descends to the camp: everyone cheering round the Hearth; then the thank-you card
// Touch skips after 2 s. Resumes from state on load. Afterwards the world keeps its dawn look.

import * as THREE from 'three';
import type { MusicMood } from '../../audio';
import { audio } from '../../audio';
import type { SimEvent } from '../../sim';
import type { Credits } from '../../ui/late/credits';
import type { BeaconView } from './beacon';
import { clamp01, fxOf, glowSprite, rigOf, sfxAt, smooth, worldOf, type LateCtx, type LatePart } from './ctx';
import type { MoodSource } from './mood';

interface Key { T: number; pos: THREE.Vector3; look: THREE.Vector3 }

const C = (h: number) => new THREE.Color(h);
const NIGHT = {
  fog: C(0x1c2945), zenith: C(0x070c1c), glow: C(0x3a3a6a),
  hemiSky: C(0x9cb4e6), hemiGround: C(0x3a2f4a), hemiI: 1.0, sun: C(0xc4d4ff), sunI: 1.45, near: 26, far: 66,
};
const MORNING = {
  fog: C(0xcbd6e4), horizon: C(0xf6dcc0), zenith: C(0x4f86c8), glow: C(0xffc48a),
  hemiSky: C(0xfff1de), hemiGround: C(0x7c6c54), hemiI: 1.22, sun: C(0xffe4bc), sunI: 2.0, near: 34, far: 96,
};
const DAWN = { fog: C(0xf2c4a2), horizon: C(0xffc48e), glow: C(0xffb070), sun: C(0xffc490), hemiSky: C(0xffdcc0) };

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export interface FinaleDeps {
  credits: Credits;
  hudRoot: HTMLElement;
}

export class FinaleDirector implements LatePart, MoodSource {
  /** Seconds into the finale from the sim's own clock (resumes with the save). */
  private gradeT = -1;
  /** Camera timeline (can be skipped ahead). */
  private camT = -1;
  private active = false;
  private live = false;
  private cw = 0;
  private keys: Key[] = [];
  private lastPhase = 'none';
  private lastSimTime = 0;
  private cascade: { id: number; x: number; z: number; at: number; k: number }[] = [];
  private finaleMusicUntil = -1;
  private musicAt = -1;
  private sun: THREE.Sprite;
  private sunCore: THREE.Sprite;
  private skipEl: HTMLDivElement;
  private groundU = { uFkGreen: { value: 0 }, uFkPatches: { value: 0 } };
  private grade = 0;
  private orig: { exposure: number } | null = null;
  private onDown = (e: PointerEvent) => this.trySkip(e);
  private creditsDone = false;
  private beacon: BeaconView | null = null;

  constructor(private ctx: LateCtx, private deps: FinaleDeps) {
    const v = ctx.view;
    this.sun = glowSprite(46, 'rgba(255,226,180,0.85)', 'rgba(255,160,90,0.25)');
    this.sunCore = glowSprite(9, 'rgba(255,252,236,1)', 'rgba(255,214,150,0.7)');
    for (const s of [this.sun, this.sunCore]) {
      s.renderOrder = -9;
      s.visible = false;
      (s.material as THREE.SpriteMaterial).depthTest = true;
      v.scene.add(s);
    }
    this.skipEl = document.createElement('div');
    this.skipEl.className = 'fk-skip';
    this.skipEl.textContent = 'Tap to skip';
    deps.hudRoot.appendChild(this.skipEl);
    window.addEventListener('pointerdown', this.onDown, { capture: true });
    deps.credits.onClose = () => this.endCredits();
    this.patchGround();
    this.reset();
  }

  /** The Beacon view (for the crown position); set by the orchestrator. */
  setBeacon(b: BeaconView): void {
    this.beacon = b;
    if (this.active) this.buildKeys();
  }

  /** True while the cinematic owns the screen (HUD steps aside). */
  get cinematic(): boolean {
    return this.active && this.cw > 0.05;
  }

  private get L(): number {
    return this.ctx.sim.data.finale.lightingTime;
  }
  private get D(): number {
    return this.ctx.sim.data.finale.dawnTime;
  }
  private get creditsKey(): string {
    return `fk-credits-seen-${this.ctx.sim.state.seed}`;
  }
  private creditsSeen(): boolean {
    try {
      return localStorage.getItem(this.creditsKey) === '1';
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------ ground: greener thaw + lingering snow

  private patchGround(): void {
    const mat = this.ctx.view['ground'].mesh.material as THREE.Material;
    const prev = mat.onBeforeCompile;
    const u = this.groundU;
    mat.onBeforeCompile = function (sh, r) {
      prev.call(this, sh, r);
      const fs = sh.fragmentShader;
      // Only extend the shader we know (falls back to the plain thaw if the ground shader changes).
      if (!fs.includes('fkMelt') || !fs.includes('vFkWorld') || !fs.includes('uSnow') || !fs.includes('#include <alphamap_fragment>')) return;
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = fs
        .replace('uniform vec3 uSnow;', 'uniform vec3 uSnow; uniform float uFkGreen; uniform float uFkPatches;')
        .replace(
          '#include <alphamap_fragment>',
          `#include <alphamap_fragment>
{
  vec2 fxz = vFkWorld.xz;
  float fm = fkMelt(fxz);
  float tuft = fkNoise(fxz * 1.3);
  vec3 lush = diffuseColor.rgb * vec3(0.74, 1.16, 0.58) + vec3(0.015, 0.05, 0.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, lush, fm * uFkGreen * (0.55 + 0.45 * tuft));
  float pn = fkFbm(fxz * 0.16 + vec2(5.0, 2.0));
  float patchK = smoothstep(0.71, 0.75, pn + tuft * 0.05) * uFkPatches;
  diffuseColor.rgb = mix(diffuseColor.rgb, uSnow * (0.9 + 0.1 * tuft), patchK);
}`,
        );
    };
    const prevKey = mat.customProgramCacheKey.bind(mat);
    mat.customProgramCacheKey = () => `${prevKey()}|fk-late-ground`;
    mat.needsUpdate = true;
  }

  // ------------------------------------------------------------------ state

  reset(): void {
    const s = this.ctx.sim.state;
    const f = s.finale;
    this.cascade = [];
    this.lastSimTime = s.time;
    this.lastPhase = f.phase;
    this.creditsDone = false;
    this.deps.credits.dispose();
    if (f.phase === 'lighting' || f.phase === 'dawn') {
      // Resumed mid-finale: pick the show up where the sim is.
      this.gradeT = f.phase === 'lighting' ? f.t : this.L + f.t;
      this.camT = this.gradeT;
      this.start(false);
    } else if (f.phase === 'done') {
      this.gradeT = 1e6;
      if (!this.creditsSeen()) {
        // Closed the app before the thank-you card: go straight to the celebrating camp.
        this.camT = this.L + this.D + 6;
        this.start(false);
        this.cw = 1;
      } else this.stop(true);
    } else {
      this.gradeT = -1;
      this.stop(true);
    }
    this.applyGrade(true);
  }

  private start(fromEvent: boolean): void {
    this.active = true;
    this.live = fromEvent;
    this.buildKeys();
    this.deps.hudRoot.classList.add('fk-cinema');
  }

  private stop(instant: boolean): void {
    this.active = false;
    if (instant) this.cw = 0;
    this.deps.hudRoot.classList.remove('fk-cinema');
    this.skipEl.classList.remove('fk-on');
  }

  private endCredits(): void {
    this.creditsDone = true;
    try {
      localStorage.setItem(this.creditsKey, '1');
    } catch {
      /* ignore */
    }
    this.finaleMusicUntil = this.ctx.time + 75;
    this.stop(false);
  }

  private trySkip(e: PointerEvent): void {
    if (!this.active || this.deps.credits.open) return;
    const t = e.target as HTMLElement | null;
    if (t && t.closest('.fk-sheet, .fk-sheet-back')) return;
    if (this.camT < 2) return;
    const end = this.L + this.D + 6;
    if (this.camT < end - 1) this.camT = end - 1;
    this.showCredits();
  }

  private showCredits(): void {
    if (this.deps.credits.open || this.creditsDone) return;
    this.deps.credits.show(this.ctx.sim);
    this.skipEl.classList.remove('fk-on');
  }

  musicWant(): MusicMood | null | undefined {
    const s = this.ctx.sim.state;
    if (this.active && this.live) {
      if (s.finale.phase === 'lighting') return null;
      if (this.musicAt < 0 || this.ctx.time < this.musicAt) return null;
      return 'finale';
    }
    if (this.active || this.ctx.time < this.finaleMusicUntil) return 'finale';
    return undefined;
  }

  ambienceWant(): Parameters<typeof audio.ambience>[0] | null {
    const f = this.ctx.sim.state.finale;
    if (f.phase === 'none') return null;
    if (f.phase === 'lighting') {
      const k = clamp01(f.progress);
      return { wind: 0.55 + 0.45 * k, gust: 0.6 * k, crowd: 0 };
    }
    const calm = f.phase === 'dawn' ? smooth(f.progress * 1.6) : 1;
    return { wind: 0.9 - 0.84 * calm, gust: 0, camp: this.active ? 0.8 * calm : undefined };
  }

  handle(e: SimEvent): void {
    const v = this.ctx.view;
    if (e.type === 'finale') {
      if (e.phase === 'lighting') {
        this.gradeT = 0;
        this.camT = 0;
        this.musicAt = -1;
        this.start(true);
        sfxAt(v, 'brazierLit', undefined, { volume: 1 });
        this.tasks.push({ at: this.ctx.time + 1.1, fn: () => audio.sfx('fanfare') });
      } else if (e.phase === 'dawn') {
        const b = this.beaconPos();
        audio.sfx('dawn');
        this.musicAt = this.ctx.time + 2.6;
        const fx = fxOf(v);
        fx.ring(b.x, b.z, 30, 0xffd9a0, 2.6);
        fx.ring(b.x, b.z, 70, 0xffa860, 4.2);
        fx.glint(b.x, 10, b.z, 40, 6);
        rigOf(v).shake(0.7, 0.9);
        this.dawnAt = this.ctx.time;
      } else if (e.phase === 'done') {
        this.gradeT = Math.max(this.gradeT, this.L + this.D);
      }
    } else if (e.type === 'thaw' && this.ctx.sim.state.finale.phase !== 'none') {
      // Rolling thaw cascade outward from the Beacon.
      const b = this.beaconPos();
      const d = Math.hypot(e.x - b.x, e.z - b.z);
      if (this.cascade.length < 160) this.cascade.push({ id: e.customer, x: e.x, z: e.z, at: this.ctx.time + 0.4 + d / 7 + Math.random() * 0.5, k: this.cascade.length });
    } else if (e.type === 'longNightEnds') {
      this.tasks.push({ at: this.ctx.time + 1.2, fn: () => this.ctx.view['hooks'].toast('The Long Night is over!', 'area') });
    }
  }

  private tasks: { at: number; fn: () => void }[] = [];
  private dawnAt = -1;

  private beaconPos(): THREE.Vector3 {
    const d = this.ctx.sim.data.decor.find((x) => x.model === 'beacon');
    if (d) return _w.set(d.x, 0, d.z);
    const a = this.ctx.sim.data.areas[this.ctx.sim.data.areas.length - 1];
    return _w.set(a.focus.x, 0, a.focus.z);
  }

  // ------------------------------------------------------------------ camera path (all from data)

  private buildKeys(): void {
    const data = this.ctx.sim.data;
    const B = this.beaconPos().clone();
    const crownY = this.beacon ? this.beacon.crown(_v).y : 9;
    const hd = data.camp.hearth;
    const H = new THREE.Vector3(hd.x, 0, hd.z);
    // Direction from the camp to the Beacon ("north" in today's layout); the camera looks along it.
    const fwd = new THREE.Vector3(B.x - H.x, 0, B.z - H.z);
    if (fwd.lengthSq() < 1) fwd.set(0, 0, -1);
    fwd.normalize();
    const back = fwd.clone().multiplyScalar(-1);
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const at = (base: THREE.Vector3, b: number, up: number, s = 0) => base.clone().addScaledVector(back, b).addScaledVector(side, s).setY(up);
    const L = this.L;
    const D = this.D;
    const keys: Key[] = [
      { T: 0, pos: at(B, 29, 4.5), look: B.clone().setY(crownY * 0.6) },
      { T: L - 0.4, pos: at(B, 23, 6.5, 3.4), look: B.clone().setY(crownY * 0.8 + 1) },
      { T: L + 3.2, pos: at(B, 34, 21, 1), look: at(B, -18, crownY + 4) },
    ];
    // Glide over every area the player rebuilt, last-opened first, ending at the camp.
    const areas = data.areas
      .filter((a) => a.id !== data.areas[data.areas.length - 1].id && a.hearth > 1)
      .sort((a, b) => b.hearth - a.hearth || a.focus.x - b.focus.x);
    const t0 = L + 5.2;
    const t1 = L + D + 4.4;
    areas.forEach((a, i) => {
      const T = t0 + ((t1 - t0) * (i + 0.5)) / Math.max(1, areas.length);
      const f = new THREE.Vector3(a.focus.x, 0, a.focus.z);
      keys.push({ T, pos: at(f, 21, 25), look: at(f, -2, 0.5) });
    });
    keys.push({ T: L + D + 6.6, pos: at(H, 17, 13, 1.5), look: H.clone().setY(1.0) });
    keys.push({ T: L + D + 9, pos: at(H, 10.5, 6.2, 2.5), look: H.clone().setY(1.2) });
    this.keys = keys;
    this.camp = H;
    this.campBack = back;
  }

  private camp = new THREE.Vector3();
  private campBack = new THREE.Vector3(0, 0, 1);

  private pose(T: number, pos: THREE.Vector3, look: THREE.Vector3): void {
    const k = this.keys;
    const last = k[k.length - 1];
    if (T >= last.T) {
      // Slow orbit round the celebrating camp.
      const a = (T - last.T) * 0.07;
      const off = last.pos.clone().sub(this.camp);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      pos.copy(this.camp).add(off);
      look.copy(last.look);
      return;
    }
    let i = 0;
    while (i < k.length - 2 && T >= k[i + 1].T) i++;
    const a = k[Math.max(0, i - 1)];
    const b = k[i];
    const c = k[i + 1];
    const d = k[Math.min(k.length - 1, i + 2)];
    const u = smoothish(clamp01((T - b.T) / Math.max(0.001, c.T - b.T)), i === 0, i + 1 === k.length - 1);
    catmull(a.pos, b.pos, c.pos, d.pos, u, pos);
    catmull(a.look, b.look, c.look, d.look, u, look);
  }

  // ------------------------------------------------------------------ per frame

  frame(dt: number): void {
    const v = this.ctx.view;
    const s = this.ctx.sim.state;
    const f = s.finale;
    if (this.tasks.length) {
      const due = this.tasks.filter((k) => k.at <= this.ctx.time);
      this.tasks = this.tasks.filter((k) => k.at > this.ctx.time);
      for (const k of due) k.fn();
    }
    // Time advances with the sim (respects pause and debug time scale).
    const sdt = Math.max(0, Math.min(0.5, s.time - this.lastSimTime));
    this.lastSimTime = s.time;
    if (f.phase === 'lighting') this.gradeT = f.t;
    else if (f.phase === 'dawn') this.gradeT = this.L + f.t;
    else if (f.phase === 'done') this.gradeT = Math.max(this.gradeT, this.L + this.D) + sdt;
    if (f.phase === 'none' && this.lastPhase !== 'none') this.reset(); // new game
    this.lastPhase = f.phase;

    if (this.active) {
      this.camT += sdt;
      if (this.camT > 2 && !this.deps.credits.open && !this.creditsDone) this.skipEl.classList.add('fk-on');
      if (this.camT >= this.L + this.D + 8.6 && f.phase === 'done') this.showCredits();
    }
    const want = this.active ? 1 : 0;
    this.cw += (want - this.cw) * Math.min(1, dt * (want ? 1.6 : 1.1));
    if (!this.active && this.cw < 0.002) this.cw = 0;

    // Rolling thaw cascade: sparkle, a hop and a cheer where each villager stands now.
    const now = this.ctx.time;
    if (this.cascade.length) {
      const fx = fxOf(v);
      const crowd = v['crowd'];
      let n = 0;
      for (let i = this.cascade.length - 1; i >= 0; i--) {
        const c = this.cascade[i];
        if (c.at > now) continue;
        this.cascade.splice(i, 1);
        const cu = s.customers.find((x) => x.id === c.id);
        const x = cu ? cu.x : c.x;
        const z = cu ? cu.z : c.z;
        fx.glint(x, 1.3, z, 6, 1.6);
        if (n++ < 3) fx.ring(x, z, 1.4, 0xffd9a0, 0.6);
        crowd.hopNear(x, z, 1.4);
        if (c.k % 3 === 0) sfxAt(v, 'thaw', undefined, { volume: 0.45, pitch: 0.9 + (c.k % 12) * 0.05 }, 0.08);
      }
    }
    // Everyone cheers when the camera reaches the camp.
    if (this.active && this.camT > this.L + this.D + 5.5 && this.camT < this.L + this.D + 5.5 + sdt + 1e-6) {
      v['crowd'].cheer(5);
      v['actors'].cheerT = 4;
      sfxAt(v, 'questComplete', undefined, { volume: 0.7 });
    }
    this.applyGrade(false);
  }

  /** Night → dawn → morning, from the finale clock (or the permanent end state). */
  private applyGrade(instant: boolean): void {
    const v = this.ctx.view;
    const s = this.ctx.sim.state;
    const phase = s.finale.phase;
    const T = this.gradeT;
    const L = this.L;
    const g = phase === 'none' ? 0 : phase === 'done' && T > 1e5 ? 1 : smooth((T - L) / (this.D * 0.85));
    const peak = phase === 'none' ? 0 : phase === 'done' && T > 1e5 ? 0.18 : Math.sin(Math.PI * clamp01((T - L + 0.5) / (this.D + 8))) * 0.85 + 0.18 * g;
    this.grade = instant ? g : g;
    const sky = v['sky'];
    const su = sky['mat'].uniforms;
    // Storm swirl during the lighting: the dusk darkens slightly and the snow thickens.
    const storm = phase === 'lighting' ? smooth(s.finale.progress) : 0;
    _c.copy(NIGHT.fog).lerp(MORNING.fog, g).lerp(DAWN.fog, peak * 0.55 * (1 - g * 0.6));
    if (storm) _c.multiplyScalar(1 - storm * 0.25);
    const fog = v.scene.fog as THREE.Fog;
    fog.color.copy(_c);
    (v.scene.background as THREE.Color).copy(_c);
    const cin = this.cw;
    fog.near = THREE.MathUtils.lerp(NIGHT.near, MORNING.near, g) + cin * 14;
    fog.far = THREE.MathUtils.lerp(NIGHT.far, MORNING.far, g) + cin * (60 + 30 * g);
    su.uHorizon.value.copy(NIGHT.fog).lerp(MORNING.horizon, g).lerp(DAWN.horizon, peak * 0.7);
    su.uZenith.value.copy(NIGHT.zenith).lerp(MORNING.zenith, smooth(g * 1.7));
    su.uGlow.value.copy(NIGHT.glow).lerp(MORNING.glow, g).lerp(DAWN.glow, peak * 0.6);
    su.uAurora.value = 1 - g;
    const aurora = sky['aurora'] as THREE.Object3D | null;
    if (aurora) aurora.visible = g < 0.98;
    const hemi = v['hemi'];
    hemi.color.copy(NIGHT.hemiSky).lerp(MORNING.hemiSky, g).lerp(DAWN.hemiSky, peak * 0.4);
    hemi.groundColor.copy(NIGHT.hemiGround).lerp(MORNING.hemiGround, g);
    hemi.intensity = THREE.MathUtils.lerp(NIGHT.hemiI, MORNING.hemiI, g);
    const sun = v['sun'];
    sun.color.copy(NIGHT.sun).lerp(MORNING.sun, g).lerp(DAWN.sun, peak * 0.5);
    sun.intensity = THREE.MathUtils.lerp(NIGHT.sunI, MORNING.sunI, g) * (1 - storm * 0.3);
    if (!this.orig) this.orig = { exposure: v.renderer.toneMappingExposure };
    v.renderer.toneMappingExposure = this.orig.exposure * (1 + 0.04 * g);
    this.groundU.uFkGreen.value = g;
    this.groundU.uFkPatches.value = g;
    this.snowK = phase === 'lighting' ? 1 + storm * 0.8 : 1 - smooth((T - L) / 2.2);
    if (phase === 'done') this.snowK = 0;
    if (phase === 'none') this.snowK = 1;
    this.windK = storm;
    this.sunK = g;
  }

  private snowK = 1;
  private windK = 0;
  private sunK = 0;

  /** After the view has placed its camera: cinematic camera, sun glow, snow and thaw band. */
  post(): void {
    const v = this.ctx.view;
    const cam = v.rig.camera;
    const s = this.ctx.sim.state;
    // Snow: thick in the swirling storm, gone for good at dawn.
    const snow = v['snow'];
    const su = snow['mat'].uniforms;
    su.uAlpha.value *= Math.min(1.6, this.snowK);
    su.uWind.value += this.windK * 1.6;
    snow.points.visible = this.snowK > 0.01 && snow['geo'].drawRange.count > 0;
    // The thaw front glows warm as it sweeps the valley.
    const gu = v['ground'].uniforms;
    if (s.finale.phase === 'dawn') gu.uWave.value = gu.uRadius.value + 0.6;

    if (this.cw > 0.0005 && this.keys.length) {
      const T = Math.max(0, this.camT);
      const pos = _v.set(0, 0, 0);
      const look = _w.clone();
      this.pose(T, pos, look);
      // Blend from the gameplay camera (already placed by the rig this frame).
      const w = smooth(this.cw);
      _m.lookAt(pos, look, cam.up);
      _q.setFromRotationMatrix(_m);
      cam.position.lerp(pos, w);
      cam.quaternion.slerp(_q, w);
      cam.updateMatrixWorld();
      v['sky'].mesh.position.copy(cam.position);
      v['sky'].mesh.updateMatrixWorld();
    }
    // Sun glowing low on the horizon beyond the Beacon.
    const on = this.sunK > 0.01;
    this.sun.visible = this.sunCore.visible = on;
    if (on) {
      const b = this.beaconPos();
      const hd = this.ctx.sim.data.camp.hearth;
      _v.set(b.x - hd.x, 0, b.z - hd.z);
      if (_v.lengthSq() < 1) _v.set(0, 0, -1);
      _v.normalize();
      _v.set(_v.x + _v.z * -0.35, 0.07, _v.z + _v.x * 0.35).normalize();
      this.sun.position.copy(cam.position).addScaledVector(_v, 140);
      this.sunCore.position.copy(cam.position).addScaledVector(_v, 139);
      (this.sun.material as THREE.SpriteMaterial).opacity = this.sunK;
      (this.sunCore.material as THREE.SpriteMaterial).opacity = this.sunK;
      this.sun.updateMatrixWorld();
      this.sunCore.updateMatrixWorld();
    }
    void worldOf;
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.onDown, { capture: true });
    this.sun.removeFromParent();
    this.sunCore.removeFromParent();
    this.skipEl.remove();
    this.deps.hudRoot.classList.remove('fk-cinema');
  }
}

function smoothish(u: number, first: boolean, last: boolean): number {
  return first || last ? u * u * (3 - 2 * u) : u;
}

function catmull(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return out.set(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z));
}
