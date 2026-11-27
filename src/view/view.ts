// The View: reads sim state every frame, drains sim events into effects + audio. It never mutates
// the sim (except through main's input API).

import * as THREE from 'three';
import { audio, ladderPitch } from '../audio';
import type { GameData, ItemKind, RenderKind } from '../data/types';
import type { SimEvent } from '../sim';
import type { Sim } from '../sim';
import { Actors, nodeAction } from './actors';
import { GuideArrow } from './arrow';
import { CameraRig } from './camera';
import { Crowd } from './crowd';
import { Effects, Footprints, Snowfall, Sparks } from './fx';
import { createGround, type GroundUniforms } from './ground';
import { ItemBatcher } from './items';
import { PALETTE } from './models';
import { PadVisual } from './pads';
import { WorldView } from './world';
import { DressingView, skipCampFloor } from './dressing';
import { SurfaceMap } from './surface';
import { CollisionDebug } from './debugcol';
import { wallSolids } from '../data';
import { ConveyorView } from './conveyors';
import { PloughView } from './plough';
import { RescueView } from './rescue';
import { SkateView } from './skate';
import { clearSeeSubject, setSeeSubject } from './occlude';
import { Sky } from './sky';

export type Quality = 0 | 1 | 2;

export interface ViewHooks {
  /** Floating "+N" style text at a world position. */
  float(text: string, world: THREE.Vector3, kind: 'ember' | 'info' | 'big'): void;
  toast(text: string, kind: 'unlock' | 'quest' | 'info' | 'area'): void;
  /** Ember wallet "bump" when embers land. */
  emberLand(n: number): void;
}

type Target =
  | { t: 'player' }
  | { t: 'helper'; id: string }
  | { t: 'station'; id: string; item: ItemKind | null; role: 'in' | 'out' }
  | { t: 'point'; x: number; y: number; z: number }
  | { t: 'customer'; id: number }
  | { t: 'pad'; id: string }
  | { t: 'wallet' };

interface Flyer {
  kind: RenderKind;
  from: THREE.Vector3;
  to: Target;
  t: number;
  dur: number;
  arc: number;
  hide: string | null;
  spin: number;
  scale: number;
  land?: () => void;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _size = new THREE.Vector2();

export class View {
  private lastCosyToast = -1e9;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  private sim: Sim;
  private data: GameData;
  private hooks: ViewHooks;
  quality: Quality;
  private ground: { mesh: THREE.Mesh; uniforms: GroundUniforms };
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private world: WorldView;
  private dressing: DressingView;
  readonly surface: SurfaceMap;
  private conveyors: ConveyorView;
  /** Mechanic presentations (constructed only when the mechanic is switched on in the data). */
  private plough: PloughView | null = null;
  private rescue: RescueView | null = null;
  private skate: SkateView | null = null;
  private pads = new Map<string, PadVisual>();
  private actors: Actors;
  private crowd: Crowd;
  private items: ItemBatcher;
  private fx: Effects;
  private snow: Snowfall;
  private sparks: Sparks;
  private prints: Footprints;
  private arrow: GuideArrow;
  private sky: Sky;
  private fuelBubble: THREE.Sprite;
  /** Soft warm ring under the player so they always stand out in a crowd. */
  private playerRing: THREE.Mesh;
  private heat = 1;
  private breathT = 0;
  private flyers: Flyer[] = [];
  private hidden = new Map<string, number>();
  private time = 0;
  private radius = 6;
  private waveR = -100;
  private stepT = 0;
  private emberCombo = 0;
  private emberComboT = 0;
  private sfxGate = new Map<string, number>();
  private music: 'calm' | 'cozy' | 'title' | 'whiteout' | null = null;
  /** Title screen showing: camera drifts, arrow hidden, title music. */
  title = false;
  /** Profiling: run all view logic but skip the GL submit. */
  skipRender = false;
  private lastPop = 0;
  frameMs = 16;
  /** Smoothed CPU time per frame (sim + view + render submit), ms. */
  cpuMs = 0;
  private tasks: { at: number; fn: () => void }[] = [];

  /** Run fn after `sec` seconds of view time (keeps effects in sync with slow frames). */
  private later(sec: number, fn: () => void): void {
    this.tasks.push({ at: this.time + sec, fn });
  }

  constructor(canvas: HTMLCanvasElement, sim: Sim, quality: Quality, hooks: ViewHooks) {
    this.sim = sim;
    this.data = sim.data;
    this.hooks = hooks;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality >= 1, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = quality >= 1;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const fogC = new THREE.Color(0x1c2945);
    this.scene.background = fogC;
    this.scene.fog = new THREE.Fog(fogC, 26, 66);

    this.rig = new CameraRig(1);
    // Cold blue dusk + warm fires.
    this.hemi = new THREE.HemisphereLight(0x9cb4e6, 0x3a2f4a, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xc4d4ff, 1.45);
    this.sun.castShadow = quality >= 1;
    const sm0 = quality >= 2 ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm0, sm0);
    const sc = this.sun.shadow.camera;
    sc.left = -15;
    sc.right = 15;
    sc.top = 17;
    sc.bottom = -13;
    sc.near = 1;
    sc.far = 70;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.ground = createGround();
    this.scene.add(this.ground.mesh);
    this.world = new WorldView(this.scene, this.data, quality);
    this.surface = new SurfaceMap(this.data, skipCampFloor);
    this.dressing = new DressingView(this.scene, this.data, this.ground.uniforms, quality, this.surface);
    this.world.setSurface(this.surface);
    this.conveyors = new ConveyorView(this.scene, this.data);
    this.conveyors.onAppear = (x, z) => this.world.onAppear(x, z, 0.5);
    this.world.onAppear = (x, z, size) => {
      this.fx.puff(x, 0.1, z, Math.round(10 + size * 6), size, 1.8 + size);
      this.fx.ring(x, z, 1.6 + size, 0xffd9a0, 0.6);
    };
    this.world.onEmit = (kind, x, y, z) => this.fx.vapour(kind, x, y, z);
    this.fuelBubble = makeFuelBubble();
    this.scene.add(this.fuelBubble);
    for (const p of this.data.pads) {
      const pv = new PadVisual(p);
      // Seat the pad on the highest surface under its footprint (floors, paths, streams).
      let py = 0;
      for (const [ox, oz] of [[0, 0], [-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) py = Math.max(py, this.surface.heightAt(p.x + ox, p.z + oz));
      pv.root.position.y = py + 0.02;
      this.pads.set(p.id, pv);
      this.scene.add(pv.root);
    }
    this.items = new ItemBatcher(this.scene);
    this.actors = new Actors(this.scene, this.data);
    if (this.data.mechanics?.plough) {
      this.plough = new PloughView(this.scene, sim, {
        puff: (x, y, z, n, r, sp, sc) => this.fx.puff(x, y, z, n, r, sp, sc),
        ring: (x, z, size, color, dur) => this.fx.ring(x, z, size, color, dur),
        glint: (x, y, z, n, sp) => this.fx.glint(x, y, z, n, sp),
        float: (text, x, y, z, kind) => this.hooks.float(text, new THREE.Vector3(x, y, z), kind),
        toast: (text, kind) => this.hooks.toast(text, kind),
        sfx: (name, opts) => this.sfx(name, opts ?? {}, 0.08),
        groundAt: (x, z) => this.surface.heightAt(x, z),
      });
      this.plough.attach(this.actors.player.root);
    }
    if (this.data.mechanics?.rescue) {
      this.rescue = new RescueView(this.scene, sim, {
        puff: (x, y, z, n, r, sp, sc) => this.fx.puff(x, y, z, n, r, sp, sc),
        ring: (x, z, size, color, dur) => this.fx.ring(x, z, size, color, dur),
        glint: (x, y, z, n, sp) => this.fx.glint(x, y, z, n, sp),
        float: (text, x, y, z, kind) => this.hooks.float(text, new THREE.Vector3(x, y, z), kind),
        toast: (text, kind) => this.hooks.toast(text, kind),
        sfx: (name, opts) => this.sfx(name, opts ?? {}, 0.08),
        groundAt: (x, z) => this.surface.heightAt(x, z),
      });
      this.rescue.attach(this.actors.player.root);
    }
    if (this.data.mechanics?.skate) {
      // Rink beyond the dressed lake-ice floor (the east lot, skateable once ploughed).
      let floorX1 = -Infinity;
      for (const a of this.data.dressing) for (const f of a.floors) if (f.type === 'ice') floorX1 = Math.max(floorX1, f.x + f.w / 2);
      const extend: { x0: number; x1: number; z0: number; z1: number }[] = [];
      for (const r of this.data.mech.ice) {
        const x0 = Math.max(r.x0, floorX1);
        if (r.x1 - x0 > 0.5) extend.push({ x0, x1: r.x1, z0: r.z0, z1: r.z1 });
      }
      this.skate = new SkateView(this.scene, sim, {
        puff: (x, y, z, n, r, sp, sc) => this.fx.puff(x, y, z, n, r, sp, sc),
        ring: (x, z, size, color, dur) => this.fx.ring(x, z, size, color, dur),
        glint: (x, y, z, n, sp) => this.fx.glint(x, y, z, n, sp),
        float: (text, x, y, z, kind) => this.hooks.float(text, new THREE.Vector3(x, y, z), kind),
        sfx: (name, opts) => this.sfx(name, opts ?? {}, 0.05),
        groundAt: (x, z) => this.surface.heightAt(x, z),
      }, extend);
      this.skate.attach(this.actors.player.root);
    }
    this.crowd = new Crowd(this.scene, this.data);
    this.crowd.groundAt = (x, z) => this.surface.heightAt(x, z);
    this.crowd.residentCap = quality >= 1 ? 44 : 30;
    this.crowd.onEnterHome = (x, z) => {
      this.fx.puff(x, 0.3, z, 5, 0.5, 0.9);
      this.fx.glint(x, 0.9, z, 5, 1.2);
      const near = Math.hypot(x - this.sim.state.player.x, z - this.sim.state.player.z) < 14;
      if (near) this.hooks.float('+1', new THREE.Vector3(x, 1.8, z), 'info');
      this.sfx('arrive', { volume: 0.5, pitch: 0.9 + Math.random() * 0.2 }, 0.12, { x, z });
    };
    this.fx = new Effects(this.scene);
    this.snow = new Snowfall(this.scene, 900);
    this.sparks = new Sparks(this.scene, quality >= 1 ? 80 : 30);
    this.prints = new Footprints(this.scene);
    this.arrow = new GuideArrow(this.scene);
    this.sky = new Sky(this.scene, fogC);
    this.playerRing = makePlayerRing();
    this.scene.add(this.playerRing);
    this.setSim(sim);
    this.resize();
  }

  /** Swap in a (loaded/reset) sim and snap all visuals to it. */
  setSim(sim: Sim): void {
    this.sim = sim;
    this.world.sync(sim);
    this.conveyors.sync(sim);
    this.actors.reset();
    this.rescue?.reset();
    this.skate?.reset();
    this.flyers = [];
    this.hidden.clear();
    this.crowd.populate(sim.state.population, sim.warmRadius());
    this.lastPop = sim.state.population;
    this.radius = sim.warmRadius();
    const p = sim.state.player;
    this.rig.snap(p.x, p.z - 1.2);
    this.music = null;
  }

  setTitle(on: boolean, instant = false): void {
    this.title = on;
    this.rig.setTitle(on, instant);
  }

  /** Auto-quality resolution scale (0.6..1). Changing it never recompiles anything. */
  dprScale = 1;
  private lastSize = '';

  /** Effective device pixel ratio for the current tier and auto scale. */
  get dpr(): number {
    const cap = [1.5, 1.75, 2][this.quality];
    return Math.max(1, Math.min(window.devicePixelRatio || 1, cap) * this.dprScale);
  }

  resize(): void {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    const key = `${w}x${h}@${this.dpr.toFixed(3)}`;
    if (key === this.lastSize) return;
    this.lastSize = key;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.rig.resize(w / Math.max(1, h));
  }

  /** Change tier: Smooth (0), Balanced (1), Pretty (2). Only an explicit user choice calls this. */
  setQuality(q: Quality): void {
    if (q === this.quality) return;
    const hadShadows = this.quality >= 1;
    this.quality = q;
    const sm = q >= 2 ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== sm) {
      this.sun.shadow.mapSize.set(sm, sm);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.resize();
    if (hadShadows !== q >= 1) {
      this.renderer.shadowMap.enabled = q >= 1;
      this.sun.castShadow = q >= 1;
      this.renderer.shadowMap.needsUpdate = true;
      // Shadow on/off changes shader programs: recompile now, in one go.
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else if (m) m.needsUpdate = true;
      });
    }
  }

  /**
   * Follow the focus with the shadow camera, snapped to whole shadow-map texels in light space so
   * shadow edges do not crawl or shimmer while the camera glides.
   */
  private placeSun(x: number, z: number): void {
    const sc = this.sun.shadow.camera;
    const texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
    // Light basis (fixed direction).
    const dir = SUN_DIR;
    const right = SUN_RIGHT;
    const up = SUN_UP;
    _v.set(x, 0, z);
    const r = Math.round(_v.dot(right) / texel) * texel;
    const u = Math.round(_v.dot(up) / texel) * texel;
    const f = _v.dot(dir);
    _w.copy(right).multiplyScalar(r).addScaledVector(up, u).addScaledVector(dir, f);
    this.sun.target.position.copy(_w);
    this.sun.position.copy(_w).addScaledVector(dir, -25);
    this.sun.target.updateMatrixWorld();
  }

  /**
   * Compile every shader the game can show before play starts (during the splash): reveal all
   * hidden objects, fire one of each effect off-screen, render once, then restore.
   */
  warmup(): void {
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const far = 400;
    this.fx.ring(far, far, 1, 0xffffff, 0.05);
    this.fx.shatter(far, 0, far, 1);
    this.fx.puff(far, 0, far, 1);
    this.fx.glint(far, 0, far, 1);
    this.fx.vapour('steam', far, 0, far);
    this.fx.vapour('smoke', far, 0, far);
    this.fx.update(0.001);
    try {
      this.renderer.compile(this.scene, this.rig.camera);
      this.renderer.render(this.scene, this.rig.camera);
    } finally {
      for (const o of hidden) o.visible = false;
    }
  }

  private dwell = 0;
  private dwellRing: THREE.Mesh | null = null;

  /** A ring fills around the player while they stand at a bin with a full pack (it is about to take things). */
  private updateBinDwell(dt: number, px: number, pz: number): void {
    const p = this.sim.state.player;
    let bin: { x: number; z: number } | null = null;
    if (p.stack.length > 0 && Math.hypot(p.vx, p.vz) < 0.25) {
      for (const d of this.data.stations) {
        if (d.type === 'shelf' && this.sim.isUsable(d.id) && Math.hypot(d.x - px, d.z - pz) <= d.reach) {
          bin = d;
          break;
        }
      }
    }
    this.dwell = bin ? Math.min(1, this.dwell + dt / 0.8) : 0;
    if (!this.dwellRing) {
      const geo = new THREE.RingGeometry(0.62, 0.78, 48, 1, Math.PI / 2, -Math.PI * 2).rotateX(-Math.PI / 2);
      this.dwellRing = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff8a6a, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
      this.dwellRing.renderOrder = 4;
      this.scene.add(this.dwellRing);
    }
    const r = this.dwellRing;
    r.visible = this.dwell > 0.02 && !this.title;
    if (r.visible) {
      r.position.set(px, this.surface.heightAt(px, pz) + 0.05, pz);
      const idx = r.geometry.index!.count;
      r.geometry.setDrawRange(0, Math.floor((idx / 6) * this.dwell) * 6);
    }
  }

  /**
   * Debug/e2e: render now and read back the pad rim at the middle of each of its four sides.
   * Returns which sides show the warm rim colour (a buried pad shows ground instead).
   */
  debugPadOutline(id: string): { sides: boolean[]; colors: number[][] } {
    const pv = this.pads.get(id);
    if (!pv) return { sides: [], colors: [] };
    // Deterministic probe: camera settled on the player, pad at full size.
    const pl = this.sim.state.player;
    this.rig.snap(pl.x, pl.z);
    for (let i = 0; i < 90; i++) this.rig.update(1 / 30, pl.x, pl.z, 0, 0, pl.stack.length);
    const oldScale = pv.root.scale.x;
    pv.root.scale.setScalar(1);
    pv.root.updateMatrixWorld(true);
    // Isolate: only ground/dressing and this pad's plate (no other pads, labels, ghosts or people).
    const hidden: THREE.Object3D[] = [];
    const hide = (o: THREE.Object3D) => {
      if (o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    };
    for (const other of this.pads.values()) if (other !== pv) hide(other.root);
    pv.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).material as THREE.Material).depthTest === false) hide(o);
      if ((o as THREE.Line).isLine) hide(o);
    });
    this.world.hideGhosts(hide);
    this.renderer.render(this.scene, this.rig.camera);
    for (const o of hidden) o.visible = true;
    pv.root.scale.setScalar(oldScale);
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const o = pv.root.position;
    const k = 1;
    const out: boolean[] = [];
    const colors: number[][] = [];
    const px = new Uint8Array(4);
    for (const [dx, dz] of [[0, -0.88], [0.88, 0], [0, 0.88], [-0.88, 0]]) { // middle of the rim (0.82..0.94 m)
      _tmp.set(o.x + dx * k, o.y + 0.12 * k, o.z + dz * k).project(this.rig.camera);
      const sx = Math.round((_tmp.x * 0.5 + 0.5) * w);
      const sy = Math.round((_tmp.y * 0.5 + 0.5) * h);
      gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      colors.push([px[0], px[1], px[2]]);
      // Rim is a warm cream/orange: bright red channel, clearly warmer than blue.
      out.push(px[0] > 150 && px[0] > px[2] + 30);
    }
    return { sides: out, colors };
  }

  /** Anchor pad labels; when two would overlap, lift the farther one by a label height (tethered). */
  private placeLabels(): void {
    const cam = this.rig.camera;
    const placed: { x: number; y: number; depth: number; pv: PadVisual }[] = [];
    for (const pv of this.pads.values()) {
      const r = pv.keepOnScreen(cam, 0);
      if (r) placed.push({ ...r, pv });
    }
    placed.sort((a, b) => a.depth - b.depth); // nearest first keeps its spot
    const taken: { x: number; y: number }[] = [];
    for (const q of placed) {
      let lift = 0;
      let y = q.y;
      for (let k = 0; k < 3 && taken.some((t) => Math.abs(t.x - q.x) < 0.55 && Math.abs(t.y - y) < 0.12); k++) {
        lift += 1.25;
        y += 0.13;
      }
      if (lift > 0) q.pv.keepOnScreen(cam, lift);
      taken.push({ x: q.x, y });
    }
  }

  private colDebug: CollisionDebug | null = null;

  /** Toggle the collision debug overlay (solids + walkable rects). */
  toggleCollisionDebug(on = !this.colDebug): void {
    if (on && !this.colDebug) this.colDebug = new CollisionDebug(this.scene);
    else if (!on && this.colDebug) {
      this.colDebug.dispose();
      this.colDebug = null;
    }
  }

  /**
   * Debug/e2e: every wall solid the sim collides with must have drawn wall geometry. Samples points
   * along each wall solid and ray-casts down onto the merged dressing; returns the misses.
   */
  debugWallCoverage(): { total: number; missing: { x: number; z: number }[] } {
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const meshes = this.dressing.solidMeshes;
    const missing: { x: number; z: number }[] = [];
    let total = 0;
    for (const w of wallSolids(this.data.dressing)) {
      const long = w.hw > w.hd;
      const len = (long ? w.hw : w.hd) - 0.35;
      for (const t of [-1, 0, 1]) {
        const x = w.x + (long ? t * Math.max(0, len) : 0);
        const z = w.z + (long ? 0 : t * Math.max(0, len));
        total++;
        let hit = false;
        // A small cluster along and across the line: rays can slip between pointed stakes.
        outer: for (const along of [0, 0.15, -0.15, 0.3, -0.3]) {
          for (const off of [0, 0.12, -0.12, 0.25, -0.25]) {
            ray.set(new THREE.Vector3(x + (long ? along : off), 10, z + (long ? off : along)), down);
            const h = ray.intersectObjects(meshes, false)[0];
            if (h && h.point.y > 0.35) {
              hit = true;
              break outer;
            }
          }
        }
        if (!hit) missing.push({ x: +x.toFixed(2), z: +z.toFixed(2) });
      }
    }
    return { total, missing };
  }

  /** Debug/e2e: the snow must be pressed flat at every point of every floor/path of every open area. */
  debugSnowUnderFloors(): { samples: number; bad: { area: string; x: number; z: number; v: number }[] } {
    const bad: { area: string; x: number; z: number; v: number }[] = [];
    let samples = 0;
    for (const a of this.data.dressing) {
      if (!this.sim.state.areasOpen[a.area as keyof typeof this.sim.state.areasOpen]) continue;
      const rects = a.floors.filter((f) => !skipCampFloor(a.area, f.type)).map((f) => ({ x0: f.x - f.w / 2, z0: f.z - f.d / 2, x1: f.x + f.w / 2, z1: f.z + f.d / 2 }));
      for (const r of rects) {
        for (let x = r.x0 + 0.1; x <= r.x1 - 0.1; x += 0.7) {
          for (let z = r.z0 + 0.1; z <= r.z1 - 0.1; z += 0.7) {
            samples++;
            const v = this.dressing.mask.flatAt(x, z);
            if (v < 0.99) bad.push({ area: a.area, x: +x.toFixed(1), z: +z.toFixed(1), v: +v.toFixed(2) });
          }
        }
      }
    }
    return { samples, bad };
  }

  /**
   * Debug: straight-down orthographic render of a world rect, with each floor's data rectangle
   * outlined (cyan) for comparison. Returns a PNG data URL.
   */
  debugTopDown(x0: number, z0: number, x1: number, z1: number, px = 600): string {
    const w = x1 - x0;
    const d = z1 - z0;
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 0.1, 100);
    cam.position.set((x0 + x1) / 2, 50, (z0 + z1) / 2);
    cam.up.set(0, 0, -1);
    cam.lookAt((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const seg: number[] = [];
    for (const a of this.data.dressing) for (const f of a.floors) {
      if (skipCampFloor(a.area, f.type)) continue;
      const fx0 = f.x - f.w / 2, fx1 = f.x + f.w / 2, fz0 = f.z - f.d / 2, fz1 = f.z + f.d / 2;
      seg.push(fx0, 3, fz0, fx1, 3, fz0, fx1, 3, fz0, fx1, 3, fz1, fx1, 3, fz1, fx0, 3, fz1, fx0, 3, fz1, fx0, 3, fz0);
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(seg, 3)), new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false }));
    lines.renderOrder = 99;
    this.scene.add(lines);
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(px, Math.round((px * d) / w), false);
    this.renderer.render(this.scene, cam);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(lines);
    lines.geometry.dispose();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(size.x, size.y, false);
    this.lastSize = '';
    return url;
  }

  /** Debug/e2e: CSS-pixel positions of the middle of each side of a pad's rim in the current frame. */
  padRimPoints(id: string): { x: number; y: number; on: boolean }[] {
    const pv = this.pads.get(id);
    if (!pv || !pv.root.visible) return [];
    const o = pv.root.position;
    const k = pv.root.scale.x;
    return [[0, -0.88], [0.88, 0], [0, 0.88], [-0.88, 0]].map(([dx, dz]) => this.project(new THREE.Vector3(o.x + dx * k, o.y + 0.12 * k, o.z + dz * k)));
  }

  /** Debug/e2e: skating presentation state (null when the mechanic is off). */
  debugSkate(): ReturnType<SkateView['debug']> | null {
    return this.skate ? this.skate.debug() : null;
  }

  /** Debug/e2e: rescue presentation state (null when the mechanic is off). */
  debugRescue(): ReturnType<RescueView['debug']> | null {
    return this.rescue ? this.rescue.debug() : null;
  }

  private areaAt(x: number, z: number): string | null {
    const areas = this.data.areas;
    for (let i = areas.length - 1; i >= 0; i--) for (const r of areas[i].rects) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return areas[i].id;
    return null;
  }

  /** Debug/e2e: plough presentation state (null when the mechanic is off). */
  debugPlough(): ReturnType<PloughView['debug']> | null {
    return this.plough ? this.plough.debug() : null;
  }

  /** Debug/e2e: arrow tip/tail and the current guide target. */
  arrowInfo(): { tip: { x: number; z: number }; tail: { x: number; z: number }; visible: boolean; target: { x: number; z: number } | null; next: { x: number; z: number } | null } {
    const g = this.sim.guide();
    const w = g ? this.sim.navFromPlayer(g.x, g.z) : null;
    return { ...this.arrow.tipTail(), target: g ? { x: g.x, z: g.z } : null, next: w };
  }

  setSnow(level: 0 | 1 | 2): void {
    this.snow.setLevel(level);
  }

  /** Auto-quality: lower the render resolution a notch (cheap, no recompiles). */
  lowerResolution(): boolean {
    if (this.dprScale <= 0.62) return false;
    this.dprScale = Math.max(0.6, this.dprScale - 0.15);
    this.resize();
    return true;
  }

  /** Project a world point to CSS pixels. */
  project(v: THREE.Vector3): { x: number; y: number; on: boolean } {
    _tmp.copy(v).project(this.rig.camera);
    const c = this.renderer.domElement;
    const w = c.clientWidth;
    const h = c.clientHeight;
    return { x: (_tmp.x * 0.5 + 0.5) * w, y: (-_tmp.y * 0.5 + 0.5) * h, on: _tmp.z < 1 && Math.abs(_tmp.x) < 1.2 && Math.abs(_tmp.y) < 1.2 };
  }

  // ------------------------------------------------------------------ events

  private sfx(name: Parameters<typeof audio.sfx>[0], opts: { pitch?: number; volume?: number } = {}, gate = 0, at?: { x: number; z: number }): void {
    if (at) {
      const p = this.sim.state.player;
      const d = Math.hypot(at.x - p.x, at.z - p.z);
      if (d > 16) return;
      opts.volume = (opts.volume ?? 1) * Math.max(0.15, 1 - d / 16);
    }
    if (gate > 0) {
      const last = this.sfxGate.get(name) ?? -1;
      if (this.time - last < gate) return;
      this.sfxGate.set(name, this.time);
    }
    audio.sfx(name, opts);
  }

  private addHidden(key: string, n: number): void {
    this.hidden.set(key, Math.max(0, (this.hidden.get(key) ?? 0) + n));
    if (key === 'player' || key.startsWith('helper:')) this.actors.hidden.set(key, this.hidden.get(key)!);
  }

  private fly(f: Omit<Flyer, 't' | 'spin' | 'scale'> & { spin?: number; scale?: number }): void {
    if (this.flyers.length > 400) {
      const old = this.flyers.shift()!;
      this.landFlyer(old);
    }
    if (f.hide) this.addHidden(f.hide, 1);
    this.flyers.push({ t: 0, spin: f.spin ?? (Math.random() - 0.5) * 8, scale: f.scale ?? 1, ...f });
  }

  private landFlyer(f: Flyer): void {
    if (f.hide) this.addHidden(f.hide, -1);
    f.land?.();
  }

  private placePos(place: { kind: string; id: string }, item: ItemKind, role: 'in' | 'out', out: THREE.Vector3): THREE.Vector3 {
    if (place.kind === 'pad') {
      const d = this.data.pads.find((p) => p.id === place.id)!;
      return out.set(d.x, 0.5, d.z);
    }
    if (place.kind === 'ground') {
      const d = this.sim.stationDefs.get(place.id)!;
      // Fish leap out of the water; logs and ore come from the top of the tree/vein.
      return out.set(d.x, nodeAction(d.model) === 'fish' ? 0.15 : 1.6, d.z);
    }
    this.world.itemSpot(place.id, item, out, role);
    const d = this.sim.stationDefs.get(place.id);
    if (d && (d.type === 'pile' || d.type === 'processor' || d.type === 'deposit')) out.y += 0.4;
    return out;
  }

  private actorPos(by: SimEvent & { by: unknown }, out: THREE.Vector3): THREE.Vector3 {
    const b = (by as { by: { kind: string; id?: string } }).by;
    if (b.kind === 'player') return out.copy(this.actors.playerTop);
    if (b.kind === 'helper') {
      const t = this.actors.helperTop(b.id!);
      if (t) return out.copy(t);
      const h = this.sim.state.helpers[b.id!];
      return out.set(h?.x ?? 0, 1.4, h?.z ?? 0);
    }
    return out.set(0, 1, 0);
  }

  handleEvents(events: SimEvent[]): void {
    this.plough?.handleEvents(events);
    this.rescue?.handleEvents(this.sim, events);
    this.skate?.handleEvents(this.sim, events);
    const s = this.sim.state;
    const p = s.player;
    let collectBudget = 24;
    for (const e of events) {
      switch (e.type) {
        case 'pickup': {
          const from = this.placePos(e.from, e.item, 'out', new THREE.Vector3());
          if (e.by.kind === 'link') break; // the belt itself shows it
          const to: Target = e.by.kind === 'player' ? { t: 'player' } : { t: 'helper', id: e.by.id };
          const hide = e.by.kind === 'player' ? 'player' : `helper:${e.by.id}`;
          this.fly({ kind: e.item, from, to, dur: 0.26, arc: 1.1, hide });
          if (e.from.kind === 'station') this.world.bump(e.from.id);
          if (e.by.kind === 'player') this.sfx('pickup', { pitch: ladderPitch(Math.max(0, e.height - 1)) }, 0.03);
          else this.sfx('pickup', { volume: 0.25, pitch: 1.1 }, 0.08, this.helperXZ(e.by.id));
          break;
        }
        case 'drop': {
          let from: THREE.Vector3;
          if (e.by.kind === 'link') {
            const lid = (e.by as { id: string }).id;
            from = new THREE.Vector3();
            if (!this.conveyors.endPos(lid, from)) {
              const l = this.data.links.find((x) => x.id === lid)!;
              const end = l.path[l.path.length - 1];
              from.set(end.x, 0.55, end.z);
            }
          } else from = this.actorPos(e, new THREE.Vector3());
          const to: Target = e.to.kind === 'pad' ? { t: 'pad', id: e.to.id } : { t: 'station', id: e.to.id, item: e.item, role: 'in' };
          const hide = e.to.kind === 'station' ? `st:${e.to.id}:${e.item}` : null;
          const id = e.to.id;
          this.fly({ kind: e.item, from, to, dur: e.by.kind === 'link' ? 0.2 : 0.24, arc: e.by.kind === 'link' ? 0.4 : 1.0, hide, land: () => this.world.bump(id) });
          if (e.by.kind === 'player') this.sfx('drop', { pitch: 0.9 + Math.random() * 0.2 }, 0.03);
          else this.sfx('drop', { volume: 0.25 }, 0.1, this.stationXZ(id));
          break;
        }
        case 'craft': {
          this.world.bump(e.station);
          const at = this.stationXZ(e.station);
          this.sfx('craft', { volume: 0.55 }, 0.12, at);
          const d = this.sim.stationDefs.get(e.station);
          if (d && Math.random() < 0.5) this.fx.puff(d.x + (Math.random() - 0.5) * 0.4, this.world.stationTop(d.id), d.z, 1, 0.2, 0.3, 0.35);
          break;
        }
        case 'serve': {
          const c = s.customers.find((x) => x.id === e.customer);
          const from = this.world.itemSpot(e.station, e.item, new THREE.Vector3(), 'in');
          this.fly({ kind: e.item, from, to: { t: 'customer', id: e.customer }, dur: 0.3, arc: 0.8, hide: null });
          this.sfx('serve', { volume: 0.7 }, 0.06, c ?? this.stationXZ(e.station));
          break;
        }
        case 'thaw': {
          this.fx.shatter(e.x, 0.2, e.z, this.quality >= 1 ? 18 : 10);
          this.fx.puff(e.x, 0.3, e.z, 5, 0.5, 1.2);
          this.sfx('thaw', {}, 0.05, e);
          break;
        }
        case 'emberSpawn': {
          const n = Math.min(10, e.n);
          const from = new THREE.Vector3(e.x, 1.2, e.z);
          if (e.pile) {
            // Burst from the thawed villager in the queue towards the pile.
            const cust = this.findNearestCustomer(e.x, e.z + 2.5);
            if (cust) from.set(cust.x, 1.2, cust.z);
            for (let i = 0; i < n; i++) {
              const tgt = { t: 'point' as const, x: e.x + (Math.random() - 0.5) * 0.7, y: 0.2, z: e.z + (Math.random() - 0.5) * 0.7 };
              this.fly({ kind: 'ember', from: from.clone(), to: tgt, dur: 0.45 + Math.random() * 0.25, arc: 1.6 + Math.random(), hide: `ember:${e.pile}`, scale: 0.9 });
            }
            const top = from.clone();
            top.y = 2.3;
            this.hooks.float(`+${e.n}`, top, 'ember');
          } else {
            // Quest reward: embers rain onto the player.
            for (let i = 0; i < n; i++) {
              const f2 = new THREE.Vector3(p.x + (Math.random() - 0.5) * 3, 4 + Math.random() * 2, p.z + (Math.random() - 0.5) * 3);
              this.fly({ kind: 'ember', from: f2, to: { t: 'player' }, dur: 0.5 + Math.random() * 0.4, arc: 0.5, hide: null, scale: 0.9, land: () => this.collectSound() });
            }
            this.hooks.float(`+${e.n}`, new THREE.Vector3(p.x, 2.8, p.z), 'big');
            this.hooks.emberLand(e.n);
          }
          break;
        }
        case 'emberCollect': {
          const n = Math.min(collectBudget, Math.min(6, e.n));
          collectBudget -= n;
          const per = e.n / Math.max(1, n);
          for (let i = 0; i < n; i++) {
            const from = new THREE.Vector3(e.x + (Math.random() - 0.5) * 0.6, 0.3, e.z + (Math.random() - 0.5) * 0.6);
            this.fly({ kind: 'ember', from, to: { t: 'player' }, dur: 0.3 + Math.random() * 0.2, arc: 1.2, hide: null, scale: 0.85, land: () => { this.collectSound(); this.hooks.emberLand(per); } });
          }
          if (n === 0) this.hooks.emberLand(e.n);
          break;
        }
        case 'padTick':
          this.sfx('padTick', { pitch: 0.8 + e.frac * 0.7, volume: 0.6 }, 0.06);
          break;
        case 'padComplete': {
          const d = this.data.pads.find((x) => x.id === e.pad)!;
          this.fx.ring(d.x, d.z, 3, 0xffc86a, 0.7);
          this.fx.glint(d.x, 0.4, d.z, 18, 3);
          this.rig.shake(0.25, 0.25);
          this.sfx(d.repeat ? 'upgrade' : 'padComplete'); // LATE-GAME HOOK: repeatable pads use the lighter sfx
          this.hooks.toast(d.label, 'unlock');
          break;
        }
        case 'padAppear': {
          const d = this.data.pads.find((x) => x.id === e.pad)!;
          this.fx.puff(d.x, 0.1, d.z, 6, 0.8, 1.2);
          break;
        }
        case 'unlock':
          this.world.unlock(e.id);
          this.conveyors.unlock(e.id);
          this.sfx('hammer', { volume: 0.8 });
          break;
        case 'hire': {
          const h = this.sim.state.helpers[e.helper];
          const def = this.data.helpers.find((x) => x.id === e.helper);
          if (h) {
            this.fx.puff(h.x, 0.1, h.z, 14, 1, 2);
            this.fx.glint(h.x, 1, h.z, 12, 2);
          }
          if (def) this.hooks.toast(`${def.name} hired!`, 'unlock');
          break;
        }
        case 'capacity':
          this.hooks.float(`Pack ${e.capacity}`, new THREE.Vector3(p.x, 2.6, p.z), 'info');
          break;
        case 'hearthUp':
          this.onHearthUp(e.level);
          break;
        case 'areaOpen': {
          const a = this.data.areas.find((x) => x.id === e.area)!;
          const pieces = this.world.shatterWall(e.area);
          for (let i = 0; i < pieces.length; i += 2) {
            const pc = pieces[i];
            this.fx.shatter(pc.x, 0.5, pc.z, this.quality >= 1 ? 10 : 5, 1.4);
            this.fx.puff(pc.x, 0.3, pc.z, 4, 1.2, 2);
          }
          this.sfx('iceCrack');
          this.later(0.4, () => this.sfx('unlock'));
          const wall = this.data.walls.find((w) => w.area === e.area);
          let fx = a.focus.x;
          let fz = a.focus.z;
          if (wall) {
            const cx = wall.points.reduce((m, q) => m + q.x, 0) / wall.points.length;
            const cz = wall.points.reduce((m, q) => m + q.z, 0) / wall.points.length;
            fx = cx + (a.focus.x - cx) * 0.45;
            fz = cz + (a.focus.z - cz) * 0.45;
          }
          this.later(1.1, () => this.rig.startPan(fx, fz, 2.6));
          this.rig.shake(0.5, 0.6);
          this.hooks.toast(`${a.name} is open!`, 'area');
          break;
        }
        case 'questComplete':
          this.sfx('questComplete', {}, 0.2);
          this.actors.cheerT = 0.9;
          break;
        case 'questStart': {
          const q = this.data.quests[e.index];
          if (q?.hint) this.hooks.toast(q.hint, 'info');
          break;
        }
        case 'nodeHit': {
          const d = this.sim.stationDefs.get(e.node)!;
          this.world.shakeNode(e.node);
          const tree = /pine|tree/i.test(d.model);
          const water = /ice|hole|lake|fish/i.test(d.model);
          this.sfx(tree ? 'chop' : water ? 'splash' : 'mine', { pitch: 0.9 + Math.random() * 0.2, volume: e.by.kind === 'player' ? 1 : 0.3 }, 0.05, d);
          if (tree) this.fx.puff(d.x, 1.6, d.z, 3, 0.5, 1.2);
          else if (water) {
            this.fx.shatter(d.x, 0.1, d.z, 5, 0.5);
            this.fx.vapour('steam', d.x, 0.2, d.z);
          } else this.fx.glint(d.x, 0.7, d.z, 6, 1.5);
          break;
        }
        case 'nodeDeplete': {
          const d = this.sim.stationDefs.get(e.node)!;
          if (/pine|tree/i.test(d.model)) {
            this.sfx('treeFall', {}, 0.1, d);
            this.later(0.6, () => this.fx.puff(d.x, 0.2, d.z, 12, 1.6, 2.2));
          } else {
            this.sfx(/ice|hole/i.test(d.model) ? 'iceCrack' : 'mine', { pitch: 0.8 }, 0.1, d);
            this.fx.puff(d.x, 0.2, d.z, 8, 1, 1.5);
          }
          break;
        }
        case 'nodeRegrow': {
          const d = this.sim.stationDefs.get(e.node)!;
          this.fx.puff(d.x, 0.1, d.z, 6, 0.6, 1);
          break;
        }
        case 'arrive':
          this.crowd.arrive(e.x, e.z, e.customer * 0.37);
          this.crowd.hopNear(e.x, e.z, 3);
          break;
        case 'tent':
          this.sfx('hammer', { volume: 0.6 }, 0.1);
          this.hooks.toast('A new tent goes up!', 'info');
          break;
        case 'binned': {
          // Toss-and-poof: the item vanishes into the bin with a little puff.
          const d = this.sim.stationDefs.get(e.bin);
          if (d) {
            const top = this.world.stationTop(e.bin);
            this.later(0.22, () => {
              this.fx.puff(d.x, top, d.z, 4, 0.35, 0.8, 0.5);
              this.fx.glint(d.x, top, d.z, 3, 1);
            });
            this.sfx('drop', { pitch: 0.7, volume: 0.6 }, 0.05);
          }
          break;
        }
        case 'cosy':
          // Announce Cosy at most once every few minutes; the HUD pill shows the state.
          if (e.on && performance.now() - this.lastCosyToast > 240000) {
            this.lastCosyToast = performance.now();
            this.hooks.toast('Camp is Cosy: embers ×2', 'info');
          }
          break;
        default:
          break;
      }
    }
  }

  private collectSound(): void {
    if (this.time - this.emberComboT > 0.7) this.emberCombo = 0;
    this.emberComboT = this.time;
    this.sfx('ember', { pitch: ladderPitch(Math.min(16, this.emberCombo++)), volume: 0.7 }, 0.035);
  }

  private onHearthUp(level: number): void {
    const hd = this.data.camp.hearth;
    this.world.setHearthLevel(level);
    this.waveR = 0.5;
    this.fx.ring(hd.x, hd.z, this.sim.warmRadius(level) * 1.05, 0xffa040, 2.4);
    this.fx.ring(hd.x, hd.z, this.sim.warmRadius(level) * 0.7, 0xffe0a0, 1.6);
    this.fx.glint(hd.x, 1.2, hd.z, 30, 5);
    this.rig.shake(0.6, 0.7);
    this.rig.pulse(1);
    this.crowd.cheer(1.5);
    this.actors.cheerT = 1.5;
    this.sfx('hearthUp');
    this.hooks.toast(`Hearth level ${level}!`, 'area');
  }

  private helperXZ(id: string): { x: number; z: number } | undefined {
    return this.sim.state.helpers[id];
  }

  private stationXZ(id: string): { x: number; z: number } {
    const d = this.sim.stationDefs.get(id);
    return d ? d : { x: 0, z: 0 };
  }

  private findNearestCustomer(x: number, z: number): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bd = 6;
    for (const c of this.sim.state.customers) {
      if (c.phase !== 'thaw') continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  private targetPos(t: Target, out: THREE.Vector3): THREE.Vector3 {
    switch (t.t) {
      case 'player':
        return out.copy(this.actors.playerTop);
      case 'helper':
        return out.copy(this.actors.helperTop(t.id) ?? out.set(0, 1, 0));
      case 'station': {
        this.world.itemSpot(t.id, t.item, out, t.role);
        const d = this.sim.stationDefs.get(t.id);
        if (d && d.type !== 'counter') {
          const st = this.sim.state.stations[t.id];
          const n = st.kind === 'processor' ? st.inputs[t.item as ItemKind] ?? 0 : st.kind === 'pile' || st.kind === 'deposit' ? st.count : 0;
          out.y += Math.min(6, n) * 0.18;
        } else out.y += 0.2;
        return out;
      }
      case 'pad': {
        const d = this.data.pads.find((p) => p.id === t.id)!;
        return out.set(d.x, 0.3, d.z);
      }
      case 'customer': {
        const c = this.sim.state.customers.find((x) => x.id === t.id);
        return c ? out.set(c.x, 1.1, c.z) : out;
      }
      case 'point':
        return out.set(t.x, t.y, t.z);
      default:
        return out.copy(this.actors.playerTop);
    }
  }

  // ------------------------------------------------------------------ frame

  frame(alpha: number, dt: number): void {
    const sim = this.sim;
    const s = sim.state;
    this.time += dt;
    const t = this.time;
    if (this.tasks.length) {
      const due = this.tasks.filter((k) => k.at <= t);
      this.tasks = this.tasks.filter((k) => k.at > t);
      for (const k of due) k.fn();
    }
    const p = s.player;
    const px = p.px + (p.x - p.px) * alpha;
    const pz = p.pz + (p.z - p.pz) * alpha;

    // Warm radius rolls outwards after a level-up.
    const targetR = sim.warmRadius();
    if (this.waveR > 0) {
      this.waveR += dt * 7;
      if (this.waveR > targetR + 4) this.waveR = -100;
    }
    this.radius += (targetR - this.radius) * Math.min(1, dt * (this.waveR > 0 ? 1.1 : 3));
    if (this.waveR > 0) this.radius = Math.min(targetR, Math.max(this.radius, this.waveR - 1.5));
    const gu = this.ground.uniforms;
    gu.uRadius.value = this.radius;
    gu.uTime.value = t;
    gu.uWave.value = this.waveR;

    this.items.begin();
    if (this.plough) {
      this.plough.update(sim, dt, px, pz, p.facing);
      this.actors.playerAction = this.plough.action;
      this.actors.playerSink = this.plough.sink;
    }
    if (this.skate) {
      this.skate.update(sim, dt, px, pz);
      if (this.skate.action) this.actors.playerAction = this.skate.action;
      else if (!this.plough) this.actors.playerAction = null;
    }
    this.actors.update(sim, this.items, alpha, t, dt);
    if (this.rescue) {
      // After the player rig is posed (the lantern stays upright in the hand); the dig pose applies next frame.
      this.rescue.update(sim, dt, t, px, pz, this.title);
      this.actors.playerAction = this.rescue.action ?? this.skate?.action ?? this.plough?.action ?? null;
    }
    this.crowd.update(sim, alpha, t, dt, px, pz);
    this.world.update(sim, t, dt);
    this.dressing.update(sim);
    this.conveyors.update(sim, dt);
    this.colDebug?.update(sim, dt);
    for (const pv of this.pads.values()) {
      pv.update(sim, t, dt, p.onPad === pv.def.id);
      if (this.title) pv.root.visible = false; // nothing in-world competes with the title buttons
    }
    this.placeLabels();
    this.drawBuffers(t);
    this.updateFlyers(dt, t);
    this.items.end();
    this.fx.update(dt);

    // Camera, lights, weather.
    this.rig.update(dt, px, pz, p.vx, p.vz, p.stack.length);
    const f = this.rig.focus;
    this.placeSun(f.x, f.z - 2);
    const distHearth = Math.hypot(px - this.data.camp.hearth.x, pz - this.data.camp.hearth.z);
    const wind = Math.max(0, Math.min(1, (distHearth - this.radius + 2) / 14));
    this.snow.update(t, dt, f, this.renderer.getPixelRatio(), 0.15 + wind * 0.35, Math.hypot(p.vx, p.vz));
    this.sparks.points.position.set(this.data.camp.hearth.x, 0, this.data.camp.hearth.z);
    this.sparks.update(t, this.renderer.getPixelRatio(), 0.8 + s.hearth.level * 0.25 + (sim.cosy ? 0.5 : 0));
    this.prints.update(dt, px, pz, p.facing, distHearth > this.radius + 0.5);

    this.playerRing.position.set(px, this.surface.heightAt(px, pz) + 0.03, pz);
    this.updateBinDwell(dt, px, pz);
    this.playerRing.visible = !this.title;
    const rs = 1 + Math.sin(t * 2.4) * 0.04;
    this.playerRing.scale.set(rs, 1, rs);

    // Hearth heat: dims visibly with no fuel (once logs exist), glows warmer when Cosy.
    const fuelGame = this.data.stations.some((d) => d.type === 'node' && d.item === 'log' && sim.isUsable(d.id));
    const empty = fuelGame && !sim.cosy && sim.fuelFraction() <= 0;
    const heatWant = !fuelGame ? 1 : sim.cosy ? 1.3 : empty ? 0.25 : 1;
    this.heat += (heatWant - this.heat) * Math.min(1, dt * 2);
    this.world.hearthHeat = this.heat;
    const hb = this.fuelBubble;
    const bubbleWant = empty && !this.title ? 1 : 0;
    const bs = hb.userData.s = (hb.userData.s ?? 0) + (bubbleWant - (hb.userData.s ?? 0)) * Math.min(1, dt * 5);
    hb.visible = bs > 0.02;
    if (hb.visible) {
      const hc = this.data.camp.hearth;
      hb.position.set(hc.x, this.world.stationTop('hearth') + 1.1 + Math.sin(t * 2.4) * 0.12, hc.z);
      hb.scale.set(1.3 * bs, 1.3 * bs, 1);
    }
    // Breath puffs in the cold.
    this.breathT -= dt;
    if (this.breathT <= 0) {
      this.breathT = 1.4 + Math.random() * 0.6;
      if (distHearth > this.radius - 1 && !this.title) {
        const fy = p.facing;
        this.fx.vapour('breath', px + Math.sin(fy) * 0.35, 1.25, pz + Math.cos(fy) * 0.35, Math.sin(fy) * 0.4, Math.cos(fy) * 0.4);
      }
    }

    // Guidance.
    const g = this.title ? null : sim.guide();
    if (g) {
      const w = sim.navFromPlayer(g.x, g.z);
      const my = g.kind === 'station' ? this.world.stationTop(g.id) : g.kind === 'node' ? 2.6 : 0.4;
      this.arrow.update(dt, t, px, pz, w.x, w.z, g.x, g.z, my);
    } else this.arrow.update(dt, t, px, pz, px, pz, null, 0, 0);

    // See-through bubbles: scenery in front of the player (and the guide target) dissolves.
    const cam = this.rig.camera;
    cam.updateMatrixWorld();
    this.renderer.getDrawingBufferSize(_size);
    const dprNow = this.renderer.getPixelRatio();
    if (this.title) {
      clearSeeSubject(0);
      clearSeeSubject(1);
    } else {
      setSeeSubject(0, cam, px, 0.9, pz, 72, _size, dprNow);
      if (g && Math.hypot(g.x - px, g.z - pz) > 2.5) setSeeSubject(1, cam, g.x, 0.6, g.z, 46, _size, dprNow);
      else clearSeeSubject(1);
    }

    // Audio: footsteps, ambience, music mood.
    const speed = Math.hypot(p.vx, p.vz);
    if (speed > 1) {
      this.stepT -= dt * (speed / 5);
      if (this.stepT <= 0) {
        this.stepT = 0.3;
        audio.sfx('footstep', { volume: 0.35, pitch: 0.9 + Math.random() * 0.2 });
      }
    }
    let fire = Math.max(0, 1 - distHearth / 9);
    for (const d of this.data.stations) {
      if (d.type !== 'processor' || !sim.isActive(d.id)) continue;
      const k = Math.max(0, 1 - Math.hypot(px - d.x, pz - d.z) / 4) * 0.6;
      if (k > fire) fire = k;
    }
    // Crowd murmur near a big Icebound queue; cosy camp life near a populated Hearth.
    let crowd = 0;
    for (const d of this.data.stations) {
      if (d.type !== 'counter' || !sim.isUsable(d.id)) continue;
      const q = (s.stations[d.id] as { queue: number[] }).queue.length;
      const k = Math.max(0, 1 - Math.hypot(px - d.queueStart.x, pz - (d.queueStart.z + 2)) / 12) * Math.min(1, q / 25);
      if (k > crowd) crowd = k;
    }
    const camp = Math.max(0, 1 - distHearth / 12) * Math.min(1, s.population / 30);
    const whiteout = this.rescue?.whiteout ?? 0;
    audio.ambience({ wind: Math.min(1, 0.2 + wind * 0.8 + whiteout * 0.35), fire, crowd, camp, plough: this.plough?.level ?? 0, skate: this.skate?.level ?? 0 });
    // Rescue walks: the whiteout mood deep in the fringe of Areas 1–2 (the late areas pick their own).
    const fringe = !!this.rescue?.music && s.finale.phase === 'none' && /^(pinewood|frozenLake)$/.test(this.areaAt(px, pz) ?? '');
    const mood = this.title ? 'title' : fringe ? 'whiteout' : sim.cosy ? 'cozy' : 'calm';
    if (mood !== this.music) {
      this.music = mood;
      audio.music(mood);
    }
    if (s.population !== this.lastPop) this.lastPop = s.population;

    this.sky.update(t, this.rig.camera.position);
    if (!this.skipRender) this.renderer.render(this.scene, this.rig.camera);
  }

  private drawBuffers(t: number): void {
    const sim = this.sim;
    const items = this.items;
    for (const d of this.data.stations) {
      const st = sim.state.stations[d.id];
      if (!st) continue;
      if (d.type === 'node') {
        const ns = st as { ground: number };
        if (ns.ground > 0) items.grid(d.item, ns.ground, d.x + 0.7, 0.05, d.z + 0.6, 0.4, 3, 2, 0.4);
        continue;
      }
      const v = this.world.stations.get(d.id);
      if (!v || !v.shown || v.appear < 0.5) continue;
      const yaw = d.rot ?? 0;
      if (st.kind === 'pile' && d.type === 'pile') {
        const n = st.count - (this.hidden.get(`st:${d.id}:${d.item}`) ?? 0);
        this.world.itemSpot(d.id, d.item, _v, 'out');
        items.grid(d.item, Math.max(0, n), _v.x, 0.02, _v.z, yaw, 5, 3, 0.42);
      } else if (st.kind === 'processor' && d.type === 'processor') {
        const r = this.data.recipes[d.recipe];
        const kinds = Object.keys(r.inputs) as ItemKind[];
        this.world.itemSpot(d.id, null, _v, 'in');
        kinds.forEach((k, i) => {
          const n = (st.inputs[k] ?? 0) - (this.hidden.get(`st:${d.id}:${k}`) ?? 0);
          const off = (i - (kinds.length - 1) / 2) * 0.55;
          items.grid(k, Math.max(0, n), _v.x + Math.cos(yaw) * off, 0.02, _v.z - Math.sin(yaw) * off, yaw, n > 12 ? 6 : 5, kinds.length > 1 ? 1 : n > 12 ? 3 : 2, 0.42);
        });
        this.world.itemSpot(d.id, r.output, _w, 'out');
        items.grid(r.output, st.output, _w.x, 0.02, _w.z, yaw, st.output > 12 ? 6 : 5, st.output > 12 ? 3 : 2, 0.42);
      } else if (st.kind === 'counter' && d.type === 'counter') {
        const n = st.stock - (this.hidden.get(`st:${d.id}:${d.item}`) ?? 0);
        this.world.itemSpot(d.id, d.item, _v, 'in');
        // Low, wide stacks along the counter lip (rows never spill off the front).
        items.grid(d.item, Math.min(Math.max(0, n), 25), _v.x, _v.y, _v.z, yaw, 5, 5, 0.4);
      } else if (st.kind === 'deposit' && d.type === 'deposit') {
        const k = d.accepts[0];
        const n = st.count - (this.hidden.get(`st:${d.id}:${k}`) ?? 0);
        this.world.itemSpot(d.id, k, _v, 'in');
        items.grid(k, Math.max(0, n), _v.x, 0.02, _v.z, yaw + 0.6, 4, 4, 0.36);
      }
    }
    // Conveyor belts.
    for (const l of this.data.links) {
      if (!sim.isActive(l.id)) continue;
      const ls = sim.state.links[l.id];
      for (const it of ls.belt) {
        if (!this.conveyors.itemPos(l.id, it.p, _v)) {
          pathPoint(l.path, it.p, _v);
          _v.y = 0.42;
        }
        items.add(it.item, _v.x, _v.y, _v.z, 0);
      }
    }
    // Ember piles: a glowing heap that bobs.
    for (const e of sim.state.emberPiles) {
      const n = Math.min(36, e.count - (this.hidden.get(`ember:${e.id}`) ?? 0));
      for (let i = 0; i < n; i++) {
        const a = i * 2.399;
        const r = 0.12 * Math.sqrt(i);
        const y = 0.12 + Math.floor(i / 9) * 0.1 + Math.sin(t * 3 + i) * 0.03;
        items.add('ember', e.x + Math.cos(a) * r, y, e.z + Math.sin(a) * r, t * 1.5 + i, 0.85);
      }
    }
  }

  private updateFlyers(dt: number, t: number): void {
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt / f.dur;
      if (f.t >= 1) {
        this.flyers.splice(i, 1);
        this.landFlyer(f);
        continue;
      }
      this.targetPos(f.to, _w);
      const k = f.t;
      const e = k * k * (3 - 2 * k);
      _v.lerpVectors(f.from, _w, e);
      _v.y += Math.sin(k * Math.PI) * f.arc;
      // Pop of scale mid-flight.
      const sc = f.scale * (1 + Math.sin(k * Math.PI) * 0.35);
      this.items.add(f.kind, _v.x, _v.y, _v.z, f.spin * k + t, sc, Math.sin(k * 6) * 0.4, 0);
    }
  }

  // ------------------------------------------------------------------ debug/perf

  stats(): { calls: number; triangles: number; crowd: number; frameMs: number; cpuMs: number; quality: number } {
    const info = this.renderer.info.render;
    return { calls: info.calls, triangles: info.triangles, crowd: this.crowd.count, frameMs: Math.round(this.frameMs * 10) / 10, cpuMs: Math.round(this.cpuMs * 100) / 100, quality: this.quality };
  }

  /** Debug: fill the camp with villagers (perf testing). */
  addCrowd(n: number): void {
    const r = this.sim.warmRadius();
    this.crowd.residentCap += n;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = 2.4 + Math.random() * Math.max(1, Math.min(8, r) - 3);
      this.crowd.addVillager(Math.cos(a) * rr, Math.sin(a) * rr);
    }
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

function makePlayerRing(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 20, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,200,120,0)');
  grd.addColorStop(0.62, 'rgba(255,190,100,0.10)');
  grd.addColorStop(0.8, 'rgba(255,214,150,0.55)');
  grd.addColorStop(0.9, 'rgba(255,190,100,0.25)');
  grd.addColorStop(1, 'rgba(255,190,100,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
  );
  m.renderOrder = 3;
  return m;
}

/** Friendly "needs a log" bubble that floats over a cold Hearth (no popups, no nagging). */
function makeFuelBubble(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,248,236,0.95)';
  g.strokeStyle = 'rgba(120,70,30,0.9)';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 56, 44, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(52, 96);
  g.lineTo(64, 120);
  g.lineTo(76, 96);
  g.closePath();
  g.fill();
  // Log icon.
  g.fillStyle = '#a8703c';
  g.strokeStyle = '#4a2a12';
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(30, 42, 60, 28, 14);
  g.fill();
  g.stroke();
  g.fillStyle = '#e7c08a';
  g.beginPath();
  g.ellipse(90, 56, 10, 14, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, toneMapped: false }));
  sp.renderOrder = 30;
  sp.visible = false;
  return sp;
}

const SUN_DIR = new THREE.Vector3(9, -22, -7).normalize();
const SUN_RIGHT = new THREE.Vector3().crossVectors(SUN_DIR, new THREE.Vector3(0, 1, 0)).normalize();
const SUN_UP = new THREE.Vector3().crossVectors(SUN_RIGHT, SUN_DIR).normalize();

function pathPoint(path: { x: number; z: number }[], p: number, out: THREE.Vector3): THREE.Vector3 {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
  let d = Math.max(0, Math.min(1, p)) * total;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= l || i === path.length - 2) {
      const k = l > 0 ? Math.min(1, d / l) : 0;
      return out.set(a.x + (b.x - a.x) * k, 0, a.z + (b.z - a.z) * k);
    }
    d -= l;
  }
  return out.set(path[0].x, 0, path[0].z);
}

export { PALETTE };
