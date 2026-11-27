// Carry the flame (docs/MECHANICS.md §5). Everything here is driven by sim.data.mech (braziers, wind
// gaps, festival lamps) and state.flame, so with the mechanic switched off it draws nothing and leaves
// the world exactly as before.
//
//  - braziers (Trail of Light cairns, the optional yard braziers) and festival lamps show lit/unlit;
//    lighting one is a whoomph: the fire bursts up, snow melts in a ring, the next stretch of the
//    trail lights up on the ground and the camera glances along it
//  - the carried flame: a firepan held aloft in the 'carryFlame' pose, its fire sized by the flame
//    level, whipping in wind gaps, a warm light that walks with the player, a small friendly meter
//  - guttering: flameLow nudges, wind gust ambience; going out is a soft puff of smoke and a hint
//  - carrying it to the finished Beacon flows straight into the finale (the director takes over)

import * as THREE from 'three';
import { audio } from '../../audio';
import type { SimEvent } from '../../sim';
import { PropInstancer, trs } from '../instancer';
import { animateCharacter, createProp, type CharacterRig } from '../models';
import { backOut, clamp01, fxOf, glowSprite, hooksOf, rigOf, sfxAt, worldOf, type LateCtx, type LatePart } from './ctx';
import { WARM_SPOTS, type GroundFx } from './groundfx';

interface FlameStateLike {
  held: boolean;
  level: number;
  lit: Record<string, true>;
  beaconLit: boolean;
  lamps: Record<string, true>;
}

interface LightView {
  id: string;
  kind: 'trail' | 'yard' | 'lamp';
  order: number;
  area: string;
  x: number;
  z: number;
  obj: THREE.Object3D;
  fire: THREE.Object3D[];
  /** The prop's own unlit look (createProp(..., { unlit: true })): kindling, pale paper lamp… */
  dark: THREE.Object3D;
  scale: number;
  lit: boolean;
  pop: number;
  warm: number;
  flicker: number;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const FIRE_PARTS = new Set(['flame', 'coals', 'glow']);

export class Flame implements LatePart {
  private lights: LightView[] = [];
  private gaps: { obj: THREE.Object3D; streamer: THREE.Object3D | null; x: number; z: number; rect: { x0: number; x1: number; z0: number; z1: number } }[] = [];
  private staticBraziers: PropInstancer | null = null;
  private hidden = false;
  private held: THREE.Object3D;
  private heldFire: THREE.Object3D | null;
  private heldGlow: THREE.Sprite;
  private heldShown = 0;
  private shownHeld = false;
  private offT = 99;
  private downT = -99;
  private flare = 0;
  private meter: HTMLDivElement;
  private meterBar: HTMLElement;
  private dots: THREE.InstancedMesh;
  private dotKey = '';
  private dotNext: { x: number; z: number; next: boolean }[] = [];
  private warnT = -99;
  private outToastT = -99;
  private tookOnce = 0;
  private lastLevel = 1;
  private stoleLight = false;
  private gustK = 0;
  private ambOn = false;

  constructor(private ctx: LateCtx, private ground: GroundFx, hudRoot: HTMLElement) {
    const scene = ctx.view.scene;
    this.held = createProp('flameHeld', { seed: 1 });
    this.held.visible = false;
    scene.add(this.held);
    this.heldFire = this.held.getObjectByName('flame') ?? null;
    this.heldGlow = glowSprite(1.6, 'rgba(255,236,190,0.9)', 'rgba(255,150,60,0.4)');
    this.heldGlow.visible = false;
    this.heldGlow.renderOrder = 7;
    scene.add(this.heldGlow);
    this.meter = document.createElement('div');
    this.meter.className = 'fk-flame-meter';
    this.meter.innerHTML = '<i class="fk-fm-ico"></i><b><i></i></b>';
    this.meterBar = this.meter.querySelector('b > i') as HTMLElement;
    hudRoot.appendChild(this.meter);
    const dg = new THREE.CircleGeometry(0.13, 10).rotateX(-Math.PI / 2);
    this.dots = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 160);
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 4;
    scene.add(this.dots);
    this.build();
  }

  private get mech() {
    return this.ctx.sim.data.mech;
  }
  private get on(): boolean {
    const m = this.mech;
    return !!m && (m.braziers.length > 0 || m.festivalLamps.length > 0);
  }
  private get fs(): FlameStateLike {
    return ((this.ctx.sim.state as unknown as { flame?: FlameStateLike }).flame ?? { held: false, level: 0, lit: {}, beaconLit: false, lamps: {} });
  }

  private build(): void {
    if (!this.on) return;
    const scene = this.ctx.view.scene;
    const data = this.ctx.sim.data;
    const m = this.mech;
    const mechIds = new Set<string>([...m.braziers.map((b) => b.id), ...m.festivalLamps.map((l) => l.id)]);
    for (const b of m.braziers) {
      const d = data.decor.find((x) => x.id === b.id);
      const model = d?.model ?? (b.kind === 'trail' ? 'trailBrazier' : 'brazier');
      this.lights.push(this.makeLight(b.id, b.kind, b.order ?? 0, b.area, b.x, b.z, model, d?.rot ?? 0, d?.scale ?? 1));
    }
    m.festivalLamps.forEach((l, i) => {
      const d = data.decor.find((x) => x.id === l.id);
      this.lights.push(this.makeLight(l.id, 'lamp', i, 'camp', l.x, l.z, d?.model ?? 'festivalLamp', d?.rot ?? 0, d?.scale ?? 1, i));
    });
    // Ordinary (always-lit) braziers share the instanced group we hide: redraw them, instanced.
    const plain = data.decor.filter((d) => d.model === 'brazier' && !d.unlockedBy && !mechIds.has(d.id));
    if (plain.length) {
      this.staticBraziers = new PropInstancer(scene, 'brazier', { seed: 1 }, plain.length, { cast: false, receive: true });
      plain.forEach((d, i) => this.staticBraziers!.set(i, trs(_m, d.x, 0, d.z, d.rot ?? 0, d.scale ?? 1)));
      this.staticBraziers.commit();
    }
    for (const d of data.decor) {
      if (d.model !== 'windGap') continue;
      const obj = createProp('windGap', { seed: d.seed ?? 0 });
      obj.position.set(d.x, 0, d.z);
      obj.rotation.y = d.rot ?? 0;
      scene.add(obj);
      const rect = m.windGaps.find((r) => d.x >= r.x0 - 0.5 && d.x <= r.x1 + 0.5 && d.z >= r.z0 - 0.5 && d.z <= r.z1 + 0.5) ?? { x0: d.x - 1.6, x1: d.x + 1.6, z0: d.z - 1.4, z1: d.z + 1.4 };
      this.gaps.push({ obj, streamer: obj.getObjectByName('streamer') ?? null, x: d.x, z: d.z, rect });
    }
    this.sync(true);
  }

  private makeLight(id: string, kind: LightView['kind'], order: number, area: string, x: number, z: number, model: string, rot: number, scale: number, seed = 0): LightView {
    const obj = createProp(model, { seed });
    obj.position.set(x, 0, z);
    obj.rotation.y = rot;
    obj.scale.setScalar(scale);
    this.ctx.view.scene.add(obj);
    const dark = createProp(model, { seed, unlit: true });
    dark.position.copy(obj.position);
    dark.rotation.copy(obj.rotation);
    dark.scale.setScalar(scale);
    dark.visible = false;
    this.ctx.view.scene.add(dark);
    const fire: THREE.Object3D[] = [];
    obj.traverse((o) => {
      if (FIRE_PARTS.has(o.name)) fire.push(o);
    });
    return { id, kind, order, area, x, z, obj, fire, dark, scale, lit: true, pop: 1, warm: 0, flicker: Math.random() * 10 };
  }

  private showLook(l: LightView, lit: boolean): void {
    l.obj.visible = lit;
    l.dark.visible = !lit;
    l.obj.scale.setScalar(l.scale);
    l.dark.scale.setScalar(l.scale);
  }

  /** Hide the static instanced copies the world drew (they are always lit). */
  private hideOriginals(): void {
    if (this.hidden || !this.on) return;
    let n = 0;
    worldOf(this.ctx.view).root.traverse((o) => {
      if (o.name === 'trailBrazier#inst' || o.name === 'festivalLamp#inst' || o.name === 'brazier#inst' || o.name === 'windGap#inst') {
        o.visible = false;
        n++;
      }
    });
    this.hidden = n > 0;
  }

  private isLit(l: LightView): boolean {
    const f = this.fs;
    return l.kind === 'lamp' ? !!f.lamps[l.id] : !!f.lit[l.id];
  }

  /** Snap lit/unlit looks to the state (load). */
  private sync(instant: boolean): void {
    for (const l of this.lights) {
      const lit = this.isLit(l);
      l.lit = lit;
      l.pop = 1;
      l.warm = lit && l.kind !== 'lamp' ? 1 : 0;
      this.showLook(l, lit);
    }
    void instant;
    this.dotKey = '';
  }

  reset(): void {
    this.sync(true);
    this.releaseLight();
  }

  handle(e: SimEvent): void {
    if (!this.on) return;
    const v = this.ctx.view;
    const fx = fxOf(v);
    const p = this.ctx.sim.state.player;
    switch (e.type) {
      case 'flameTaken': {
        // Set down and taken straight back (or vice versa): no effects, no flicker.
        if (this.ctx.time - this.downT < 0.6) {
          this.downT = -99;
          break;
        }
        sfxAt(v, 'flameTaken');
        fx.glint(p.x, 1.9, p.z, 14, 1.6);
        if (this.tookOnce++ < 2) hooksOf(v).float('Carry the flame!', new THREE.Vector3(p.x, 3.2, p.z), 'big');
        break;
      }
      case 'flameDown': {
        this.downT = this.ctx.time;
        const at = this.downT;
        // Effects only if it really stays down for a moment.
        window.setTimeout(() => {
          if (this.downT !== at || this.fs.held) return;
          sfxAt(v, 'drop', undefined, { pitch: 0.7 });
          fx.vapour('smoke', this.held.position.x, this.held.position.y + 1, this.held.position.z);
        }, 450);
        break;
      }
      case 'flameOut': {
        sfxAt(v, 'flameOut');
        _v.copy(this.held.position);
        for (let i = 0; i < 4; i++) fx.vapour('smoke', _v.x, _v.y + 0.4 + i * 0.1, _v.z);
        if (this.ctx.time - this.outToastT > 20) {
          this.outToastT = this.ctx.time;
          hooksOf(v).toast('The flame went out. Relight it at a lit brazier.', 'info');
        }
        break;
      }
      case 'flameLevel':
        if (e.v < 0.35 && this.ctx.time - this.warnT > 4.5) {
          this.warnT = this.ctx.time;
          sfxAt(v, 'flameLow', undefined, { volume: 0.7 });
          this.meter.classList.remove('fk-fm-warn');
          void this.meter.offsetWidth;
          this.meter.classList.add('fk-fm-warn');
        }
        break;
      case 'brazierLit': {
        const l = this.lights.find((x) => x.id === e.id);
        if (!l) break;
        l.lit = true;
        l.pop = 0;
        this.showLook(l, true);
        sfxAt(v, 'brazierLit', l, { volume: 1 });
        fx.glint(l.x, 1.8, l.z, l.kind === 'lamp' ? 10 : 26, l.kind === 'lamp' ? 1.4 : 2.6);
        if (l.kind !== 'lamp') {
          fx.ring(l.x, l.z, this.mech.brazierWarm * 1.15, 0xffb050, 1.2);
          for (let i = 0; i < 5; i++) fx.vapour('steam', l.x + Math.cos(i * 1.3) * 1.6, 0.2, l.z + Math.sin(i * 1.3) * 1.6);
          rigOf(v).shake(0.2, 0.3);
        }
        if (l.kind === 'trail') {
          const next = this.lights.filter((x) => x.kind === 'trail' && !this.isLit(x)).sort((a, b) => a.order - b.order)[0];
          if (next) {
            hooksOf(v).float(`${l.order} / ${this.lights.filter((x) => x.kind === 'trail').length}`, new THREE.Vector3(l.x, 2.8, l.z), 'big');
            // Glance along the newly revealed stretch.
            window.setTimeout(() => rigOf(v).startPan((l.x + next.x) / 2, (l.z + next.z) / 2, 2.0), 350);
          }
        } else if (l.kind === 'yard') {
          const a = this.ctx.sim.data.areas.find((x) => x.id === l.area);
          hooksOf(v).toast(`${a?.name ?? 'The yard'} is a little cosier`, 'unlock');
        } else {
          hooksOf(v).float('Lamp lit!', new THREE.Vector3(l.x, 2.4, l.z), 'info');
        }
        this.dotKey = '';
        break;
      }
      case 'trailComplete': {
        sfxAt(v, 'trailComplete');
        hooksOf(v).toast('The Trail of Light is lit! Carry the flame to the Beacon', 'area');
        const b = this.mech.beacon;
        window.setTimeout(() => rigOf(v).startPan(b.x, b.z + 2, 2.6), 700);
        break;
      }
      case 'beaconLit': {
        // The flame leaps from the firepan to the crown; the finale director takes it from here.
        const b = this.mech.beacon;
        _v.copy(this.held.position);
        for (let i = 0; i < 10; i++) {
          const f = _v.clone();
          window.setTimeout(() => fx.glint(f.x + (b.x - f.x) * (i / 10), f.y + i * 0.9, f.z + (b.z - f.z) * (i / 10), 6, 1.2), i * 60);
        }
        rigOf(v).shake(0.4, 0.5);
        break;
      }
      default:
        break;
    }
  }

  frame(dt: number): void {
    if (!this.on) {
      this.meter.classList.remove('fk-on');
      return;
    }
    this.hideOriginals();
    const t = this.ctx.time;
    const f = this.fs;
    // Braziers and lamps: flicker, the lighting pop, melted rings.
    let w = 0;
    const warmR = this.mech.brazierWarm;
    for (const l of this.lights) {
      const lit = this.isLit(l);
      if (lit !== l.lit) {
        l.lit = lit;
        this.showLook(l, lit);
        if (lit) l.pop = 0;
      }
      if (lit) {
        l.pop = Math.min(1, l.pop + dt / 0.7);
        const k = l.pop < 1 ? backOut(l.pop) * (1 + (1 - l.pop) * 0.6) : 1;
        // Pop between the two looks: the unlit one shrinks away as the lit one bounces in.
        if (l.pop < 1) {
          const out = Math.max(0, 1 - l.pop / 0.2);
          l.dark.visible = out > 0.01;
          l.dark.scale.setScalar(l.scale * Math.max(0.001, out));
          l.obj.scale.setScalar(l.scale * Math.max(0.001, 0.75 + 0.25 * backOut(l.pop)));
        } else if (l.dark.visible) {
          l.dark.visible = false;
          l.obj.scale.setScalar(l.scale);
        }
        const fl = 1 + Math.sin(t * 11 + l.flicker) * 0.07 + Math.sin(t * 17.3 + l.flicker) * 0.05;
        for (const o of l.fire) if (o.name === 'flame') o.scale.set(k, k * fl, k);
        if (l.kind !== 'lamp') l.warm = Math.min(1, l.warm + dt / 1.4);
      }
      if (l.kind !== 'lamp' && l.warm > 0 && w < WARM_SPOTS) {
        this.ground.uFkWarm.value[w++].set(l.x, l.z, warmR * (0.15 + 0.85 * backOut(Math.min(1, l.warm))));
      }
    }
    for (; w < WARM_SPOTS; w++) this.ground.uFkWarm.value[w].z = 0;

    // Wind gap streamers whip; snow skitters through the gap.
    const p = this.ctx.sim.state.player;
    let inGap = false;
    for (const g of this.gaps) {
      const r = g.rect;
      const here = p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
      if (here) inGap = true;
      const amp = here ? 0.45 : 0.25;
      if (g.streamer) {
        g.streamer.rotation.y = Math.sin(t * (here ? 14 : 9) + g.x) * amp;
        g.streamer.scale.x = 1 + Math.sin(t * 13 + g.z) * 0.1;
      }
      if (Math.random() < dt * (here ? 10 : 3) && Math.hypot(p.x - g.x, p.z - g.z) < 16) {
        fxOf(this.ctx.view).vapour('breath', g.x - 1.8, 0.4 + Math.random() * 1.2, g.z + (Math.random() - 0.5) * 2, 3.2, 0);
      }
    }
    this.gustK += ((inGap && f.held ? 1 : inGap ? 0.6 : 0) - this.gustK) * Math.min(1, dt * 4);

    // Held flame visibility (positioned in post, after the pose).
    // Hysteresis: a set-down that is picked straight back up never blinks the firepan or the meter.
    this.offT = f.held ? 0 : this.offT + dt;
    const want = f.held || this.offT < 0.45 ? 1 : 0;
    this.shownHeld = want > 0;
    this.heldShown += (want - this.heldShown) * Math.min(1, dt * (want ? 10 : 6));
    // A relieved flare when the flame tops up at a brazier (or the Hearth).
    if (f.held && f.level - this.lastLevel > 0.12) {
      this.flare = 1;
      fxOf(this.ctx.view).glint(this.held.position.x, this.held.position.y + 1.2, this.held.position.z, 10, 1.4);
      this.meter.classList.remove('fk-fm-flare');
      void this.meter.offsetWidth;
      this.meter.classList.add('fk-fm-flare');
    }
    this.flare = Math.max(0, this.flare - dt * 1.6);
    this.held.visible = this.heldShown > 0.02;
    this.heldGlow.visible = this.held.visible;
    if (!this.shownHeld && this.stoleLight) this.releaseLight();
    if (f.held) this.lastLevel = f.level;

    this.updateTrailDots(t);
  }

  private releaseLight(): void {
    const pool = worldOf(this.ctx.view)['firePool'] as { light: THREE.PointLight; id: string; want: number }[];
    if (pool[0]) pool[0].id = ''; // the world re-places it at the nearest fire next frame
    this.stoleLight = false;
  }

  /** Glowing stepping stones: lit legs of the trail glow steady, the next leg pulses. */
  private updateTrailDots(t: number): void {
    const trail = this.lights.filter((l) => l.kind === 'trail').sort((a, b) => a.order - b.order);
    if (!trail.length) {
      this.dots.count = 0;
      return;
    }
    const s = this.ctx.sim.state;
    const open = !!s.areasOpen[trail[0].area];
    const key = trail.map((l) => (this.isLit(l) ? 1 : 0)).join('') + (open ? 'o' : 'c') + (s.beacon >= 4 ? 'b' : '') + (this.fs.beaconLit ? 'L' : '');
    if (key !== this.dotKey) {
      this.dotKey = key;
      const pts: { x: number; z: number; next: boolean }[] = [];
      const seg = (a: { x: number; z: number }, b: { x: number; z: number }, next: boolean) => {
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        const n = Math.max(1, Math.floor((d - 1.6) / 0.85));
        for (let i = 0; i < n; i++) {
          const k = (0.8 + (i + 0.5) * ((d - 1.6) / n)) / d;
          pts.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, next });
        }
      };
      if (open) {
        let i = 0;
        while (i < trail.length - 1 && this.isLit(trail[i]) && this.isLit(trail[i + 1])) {
          seg(trail[i], trail[i + 1], false);
          i++;
        }
        const lastLit = trail.filter((l) => this.isLit(l)).pop();
        const next = trail.find((l) => !this.isLit(l));
        if (lastLit && next) seg(lastLit, next, true);
        else if (!next && lastLit && s.beacon >= 4 && !this.fs.beaconLit) seg(lastLit, this.mech.beacon, true);
      }
      this.dotNext = pts.filter((q) => q.next);
      const steady = pts.filter((q) => !q.next);
      const all = [...steady, ...this.dotNext].slice(0, 160);
      const col = new THREE.Color();
      all.forEach((q, i) => {
        this.dots.setMatrixAt(i, trs(_m, q.x, 0.12, q.z, 0, 1));
        col.setHex(q.next ? 0xffd27a : 0xff9a40);
        this.dots.setColorAt(i, col);
      });
      this.dots.count = all.length;
      this.dots.userData.steady = steady.length;
      this.dots.instanceMatrix.needsUpdate = true;
      if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
    }
    // The next leg pulses forward, inviting the walk.
    const base = (this.dots.userData.steady as number) ?? 0;
    this.dotNext.forEach((q, i) => {
      const ph = clamp01(0.5 + 0.5 * Math.sin(t * 4 - i * 0.7));
      this.dots.setMatrixAt(base + i, trs(_m, q.x, 0.12, q.z, 0, 0.7 + ph * 0.7));
    });
    if (this.dotNext.length) this.dots.instanceMatrix.needsUpdate = true;
  }

  /** After the view posed everyone: flame-bearer pose, firepan in the raised hand, light and meter. */
  post(): void {
    if (!this.on) return;
    const v = this.ctx.view;
    const s = this.ctx.sim.state;
    const f = this.fs;
    const p = s.player;
    const t = this.ctx.time;
    const rig = v['actors'].player as CharacterRig;
    if (f.held) {
      const speed = (v['actors']['animSpeed'] as number) ?? Math.hypot(p.vx, p.vz);
      animateCharacter(rig, { time: v['time'], speed: speed < 0.05 ? 0 : speed, carrying: false, action: 'carryFlame' });
      rig.root.updateMatrixWorld(true);
    }
    if (this.held.visible) {
      const hand = rig.root.getObjectByName('handR');
      if (hand) hand.getWorldPosition(_v);
      else _v.set(p.x, 1.7, p.z);
      this.held.position.copy(_v);
      rig.root.getWorldQuaternion(_q);
      this.held.quaternion.copy(_q);
      const lvl = f.held ? f.level : this.lastLevel;
      const k = Math.max(0.001, this.heldShown);
      this.held.scale.setScalar(k);
      if (this.heldFire) {
        const low = lvl < 0.3;
        const fl = 1 + Math.sin(t * (low ? 23 : 13)) * (low ? 0.16 : 0.07) + Math.sin(t * 29) * 0.05 * (1 + this.gustK);
        // The fire visibly shrinks through a leg; a top-up flares it big for a moment.
        const size = (0.22 + 0.78 * clamp01(lvl)) * (1 + this.flare * 0.45);
        this.heldFire.scale.set(size, size * fl * (1 + this.gustK * 0.25), size);
        this.heldFire.rotation.z = this.gustK * (0.45 + Math.sin(t * 17) * 0.15);
      }
      this.held.updateMatrixWorld(true);
      this.heldFire?.getWorldPosition(_v);
      this.heldGlow.position.copy(_v).setY(_v.y + 0.25);
      this.heldGlow.scale.setScalar((0.9 + 1.4 * clamp01(lvl)) * k * (0.94 + Math.sin(t * 15) * 0.06));
      (this.heldGlow.material as THREE.SpriteMaterial).opacity = 0.5 + 0.5 * clamp01(lvl);
      this.heldGlow.updateMatrixWorld();
      // A warm light that walks with the player: borrow the world's roaming fire light.
      const pool = worldOf(v)['firePool'] as { light: THREE.PointLight; id: string; want: number }[];
      if (pool[0] && f.held) {
        const L = pool[0].light;
        pool[0].id = '__flame';
        L.position.copy(_v).setY(_v.y + 0.3);
        L.color.setHex(0xffa860);
        L.intensity = (2.5 + 4 * clamp01(lvl)) * (0.92 + Math.sin(t * 17) * 0.06);
        L.distance = 7;
        this.stoleLight = true;
      }
    }
    // Ambience: the carried flame's crackle, wind whistling through gaps.
    if (f.held || this.ambOn || this.gustK > 0.01) {
      audio.ambience({ flame: f.held ? clamp01(f.level) : 0, gust: this.gustK * 0.9 });
      this.ambOn = f.held || this.gustK > 0.01;
    }
    // The flame meter: a small pill above the player while carrying.
    const show = this.shownHeld && !v.title;
    this.meter.classList.toggle('fk-on', show);
    if (show) {
      const pr = v.project(_v.set(p.x, 3.05, p.z));
      this.meter.style.transform = `translate(${pr.x.toFixed(1)}px, ${pr.y.toFixed(1)}px) translate(-50%, -50%)`;
      const lv = f.held ? f.level : this.lastLevel;
      this.meterBar.style.width = `${Math.round(clamp01(lv) * 100)}%`;
      this.meter.classList.toggle('fk-fm-low', lv < 0.3);
      this.meter.classList.toggle('fk-fm-wind', this.gustK > 0.3);
    }
  }

  dispose(): void {
    for (const l of this.lights) {
      l.obj.removeFromParent();
      l.dark.removeFromParent();
    }
    for (const g of this.gaps) g.obj.removeFromParent();
    this.staticBraziers?.dispose();
    this.held.removeFromParent();
    this.heldGlow.removeFromParent();
    this.dots.removeFromParent();
    this.meter.remove();
    for (const u of this.ground.uFkWarm.value) u.z = 0;
  }
}
