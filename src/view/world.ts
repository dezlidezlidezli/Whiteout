// Builds and animates the static/dynamic world: stations, decor, trees, frost walls, tents,
// conveyors and the Hearth. Station props come from createProp; repeated props are instanced.

import * as THREE from 'three';
import type { DecorDef, GameData, ItemKind, StationDef } from '../data/types';
import type { NodeState, Sim } from '../sim';
import { PropInstancer, trs } from './instancer';
import { createProp } from './models';

export interface StationView {
  def: StationDef;
  obj: THREE.Object3D;
  ghost: THREE.Object3D | null;
  top: number;
  appear: number;
  shown: boolean;
  wobble: number;
}

interface NodeView {
  def: StationDef & { type: 'node' };
  alive: boolean;
  fall: number;
  fallDir: number;
  grow: number;
  shake: number;
  variant: number;
  index: number;
  key: string;
  occ: number;
}

interface WallView {
  id: string;
  area: string;
  inst: PropInstancer;
  pieces: { x: number; z: number; rot: number; s: number }[];
  state: 'up' | 'shatter' | 'gone';
  t: number;
}

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _m2 = new THREE.Matrix4();
/** Harvestable trees are drawn a little smaller than decor so the player stays readable. */
const NODE_SCALE = 0.82;
const ghostMat = new THREE.MeshStandardMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.28, emissive: 0x6aa8ff, emissiveIntensity: 0.25, depthWrite: false });

export class WorldView {
  readonly root = new THREE.Group();
  readonly stations = new Map<string, StationView>();
  private decor = new Map<string, { def: DecorDef; obj: THREE.Object3D; ghost: THREE.Object3D | null; appear: number; shown: boolean }>();
  private nodes: NodeView[] = [];
  private nodeInst = new Map<string, PropInstancer>();
  private nodeCount = new Map<string, number>();
  private stumpInst: PropInstancer;
  private tentInst: PropInstancer;
  private tentAppear: number[] = [];
  private walls: WallView[] = [];
  private beltInst = new Map<string, PropInstancer>();
  private hearthObj: THREE.Object3D | null = null;
  private hearthLevel = 0;
  readonly hearthLight: THREE.PointLight;
  private fireLights: { light: THREE.PointLight; id: string; base: number }[] = [];
  private data: GameData;
  /** Callbacks for juice. */
  onAppear: (x: number, z: number, size: number) => void = () => {};

  constructor(parent: THREE.Object3D, data: GameData, quality: number) {
    this.data = data;
    parent.add(this.root);
    // ---- stations
    for (const d of data.stations) {
      if (d.type === 'node') continue;
      if (d.id === 'hearth') continue;
      const obj = createProp(d.model, { seed: hashId(d.id) });
      obj.position.set(d.x, 0, d.z);
      obj.rotation.y = d.rot ?? 0;
      this.root.add(obj);
      const top = new THREE.Box3().setFromObject(obj).max.y;
      const ghost = d.unlockedBy ? makeGhost(d.model, d.x, d.z, d.rot ?? 0) : null;
      if (ghost) this.root.add(ghost);
      this.stations.set(d.id, { def: d, obj, ghost, top: Math.max(0.5, top), appear: 1, shown: !d.unlockedBy, wobble: 0 });
      obj.visible = !d.unlockedBy;
    }
    // Hearth + its light.
    const hd = data.stations.find((s) => s.id === 'hearth')!;
    this.hearthLight = new THREE.PointLight(0xff9a4a, 30, 16, 1.6);
    this.hearthLight.position.set(hd.x, 1.6, hd.z);
    this.hearthLight.castShadow = false;
    this.root.add(this.hearthLight);
    this.stations.set('hearth', { def: hd, obj: new THREE.Group(), ghost: null, top: 1, appear: 1, shown: true, wobble: 0 });
    // Kettle glows.
    if (quality >= 1) {
      for (const d of data.stations) {
        if (d.model !== 'kettle' && d.model !== 'sawmill') continue;
        const l = new THREE.PointLight(0xffa860, 0, 6, 1.8);
        l.position.set(d.x, 1.3, d.z + 0.3);
        this.root.add(l);
        this.fireLights.push({ light: l, id: d.id, base: d.model === 'kettle' ? 5 : 2 });
      }
    }

    // ---- decor: unlockables as objects, static ones instanced in chunks
    const groups = new Map<string, DecorDef[]>();
    for (const d of data.decor) {
      if (d.unlockedBy) {
        const obj = createProp(d.model, { seed: d.seed ?? hashId(d.id), level: d.level });
        obj.position.set(d.x, 0, d.z);
        obj.rotation.y = d.rot ?? 0;
        obj.scale.setScalar(d.scale ?? 1);
        obj.visible = false;
        this.root.add(obj);
        const ghost = makeGhost(d.model, d.x, d.z, d.rot ?? 0);
        this.root.add(ghost);
        this.decor.set(d.id, { def: d, obj, ghost, appear: 1, shown: false });
        continue;
      }
      const variant = d.model === 'pineSnowy' || d.model === 'rock' || d.model === 'snowDrift' ? (d.seed ?? 0) % 3 : 0;
      const cx = Math.floor(d.x / 40);
      const cz = Math.floor(d.z / 40);
      const key = `${d.model}|${variant}|${cx}|${cz}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    for (const [key, list] of groups) {
      const [model, variant] = key.split('|');
      const far = list.every((d) => d.id.startsWith('tree'));
      const inst = new PropInstancer(this.root, model, { seed: Number(variant) + 1 }, list.length, far ? { cast: false, receive: true } : null);
      list.forEach((d, i) => inst.set(i, trs(_m, d.x, 0, d.z, d.rot ?? 0, d.scale ?? 1)));
      inst.commit();
    }

    // ---- harvest nodes (trees) – instanced with per-tree animation
    const nodeDefs = data.stations.filter((s): s is StationDef & { type: 'node' } => s.type === 'node');
    const variants = 3;
    const perKey = new Map<string, number>();
    nodeDefs.forEach((d, i) => {
      const key = `${d.model}|${i % variants}`;
      const idx = perKey.get(key) ?? 0;
      perKey.set(key, idx + 1);
      this.nodes.push({ def: d, alive: true, fall: 0, fallDir: (hashId(d.id) % 628) / 100, grow: 1, shake: 0, variant: -1, index: idx, key, occ: 0 } as NodeView);
    });
    for (const [key, n] of perKey) {
      const [model, v] = key.split('|');
      this.nodeInst.set(key, new PropInstancer(this.root, model, { seed: Number(v) + 11 }, n));
    }
    this.stumpInst = new PropInstancer(this.root, 'stump', { seed: 1 }, Math.max(1, nodeDefs.length));

    // ---- tents
    this.tentInst = new PropInstancer(this.root, 'tent', { seed: 3 }, data.camp.tentSpots.length);

    // ---- frost walls
    for (const w of data.walls) {
      const pieces: WallView['pieces'] = [];
      for (let i = 0; i < w.points.length - 1; i++) {
        const a = w.points[i];
        const b = w.points[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const n = Math.max(1, Math.round(len / 1.9));
        const rot = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          pieces.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, rot: rot + ((k * 1.7) % 0.4) - 0.2, s: 0.9 + ((k * 0.37) % 0.35) });
        }
      }
      const inst = new PropInstancer(this.root, 'frostWall', { seed: hashId(w.id) % 5 }, pieces.length);
      pieces.forEach((p, i) => inst.set(i, trs(_m, p.x, 0, p.z, p.rot, p.s)));
      inst.commit();
      this.walls.push({ id: w.id, area: w.area, inst, pieces, state: 'up', t: 0 });
    }

    // ---- conveyors
    for (const l of data.links) {
      const segs: { x: number; z: number; rot: number }[] = [];
      for (let i = 0; i < l.path.length - 1; i++) {
        const a = l.path[i];
        const b = l.path[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const n = Math.max(1, Math.round(len / 1.0));
        const rot = Math.atan2(b.x - a.x, b.z - a.z);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          segs.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, rot });
        }
      }
      const inst = new PropInstancer(this.root, 'conveyor', { seed: 1 }, segs.length);
      segs.forEach((s, i) => inst.set(i, trs(_m, s.x, 0, s.z, s.rot, 1)));
      inst.commit();
      inst.setVisible(false);
      this.beltInst.set(l.id, inst);
      (inst as unknown as { segs: typeof segs }).segs = segs;
    }
  }

  /** Apply the current sim state instantly (on load). */
  sync(sim: Sim): void {
    for (const v of this.stations.values()) {
      const on = sim.isActive(v.def.id);
      v.shown = on;
      v.obj.visible = on;
      v.appear = 1;
      if (v.ghost) v.ghost.visible = false;
    }
    for (const v of this.decor.values()) {
      const on = !!sim.state.unlocked[v.def.id];
      v.shown = on;
      v.obj.visible = on;
      v.appear = 1;
    }
    for (const w of this.walls) {
      const open = !!sim.state.areasOpen[w.area];
      w.state = open ? 'gone' : 'up';
      w.inst.setVisible(!open);
    }
    for (const [id, inst] of this.beltInst) inst.setVisible(sim.isActive(id));
    this.tentAppear = [];
    for (let i = 0; i < sim.state.tents; i++) this.tentAppear[i] = 1;
    this.setHearthLevel(sim.state.hearth.level);
  }

  setHearthLevel(level: number): void {
    if (level === this.hearthLevel) return;
    this.hearthLevel = level;
    const hd = this.stations.get('hearth')!;
    if (this.hearthObj) this.hearthObj.removeFromParent();
    this.hearthObj = createProp('hearth', { level });
    this.hearthObj.position.set(hd.def.x, 0, hd.def.z);
    this.root.add(this.hearthObj);
    hd.obj = this.hearthObj;
    hd.top = Math.max(0.8, new THREE.Box3().setFromObject(this.hearthObj).max.y);
    hd.appear = 0;
  }

  unlock(id: string): void {
    const s = this.stations.get(id);
    if (s && !s.shown) {
      s.shown = true;
      s.obj.visible = true;
      s.appear = 0;
      if (s.ghost) s.ghost.visible = false;
      this.onAppear(s.def.x, s.def.z, 1.4);
    }
    const d = this.decor.get(id);
    if (d && !d.shown) {
      d.shown = true;
      d.obj.visible = true;
      d.appear = 0;
      if (d.ghost) d.ghost.visible = false;
      this.onAppear(d.def.x, d.def.z, 2);
    }
    const belt = this.beltInst.get(id);
    if (belt) {
      belt.setVisible(true);
      const segs = (belt as unknown as { segs: { x: number; z: number }[] }).segs;
      for (const sg of segs) this.onAppear(sg.x, sg.z, 0.5);
    }
  }

  shatterWall(area: string): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    for (const w of this.walls) {
      if (w.area !== area || w.state !== 'up') continue;
      w.state = 'shatter';
      w.t = 0;
      for (const p of w.pieces) out.push({ x: p.x, z: p.z });
    }
    return out;
  }

  /** Ghost previews for buildings whose pad is visible. */
  private updateGhosts(sim: Sim, time: number): void {
    const pending = new Set<string>();
    for (const p of this.data.pads) {
      const ps = sim.state.pads[p.id];
      if (!ps.visible || ps.done) continue;
      for (const e of p.effects) if (e.type === 'unlock') pending.add(e.id);
    }
    for (const v of this.stations.values()) {
      if (!v.ghost) continue;
      v.ghost.visible = !v.shown && pending.has(v.def.id);
      if (v.ghost.visible) v.ghost.position.y = 0.05 + Math.sin(time * 2) * 0.05;
    }
    for (const v of this.decor.values()) {
      if (!v.ghost) continue;
      v.ghost.visible = !v.shown && pending.has(v.def.id);
    }
  }

  update(sim: Sim, time: number, dt: number): void {
    this.updateGhosts(sim, time);
    // Scale-in with overshoot for anything newly built.
    for (const v of this.stations.values()) {
      if (v.appear < 1) {
        v.appear = Math.min(1, v.appear + dt / 0.65);
        const s = backOut(v.appear);
        v.obj.scale.set(s, s * (0.7 + 0.3 * Math.min(1, v.appear * 2)), s);
      }
      if (v.wobble > 0) {
        v.wobble = Math.max(0, v.wobble - dt * 4);
        const w = Math.sin(time * 40) * v.wobble * 0.06;
        v.obj.scale.set(1 + w, 1 - w, 1 + w);
      }
    }
    for (const v of this.decor.values()) {
      if (v.appear < 1) {
        v.appear = Math.min(1, v.appear + dt / 0.7);
        v.obj.scale.setScalar(backOut(v.appear) * (v.def.scale ?? 1));
      }
    }
    // Harvest nodes (trees fall and leave a stump; other nodes sink and regrow).
    this.nodeCount.clear();
    let stumps = 0;
    for (const n of this.nodes) {
      const st = sim.state.stations[n.def.id] as NodeState;
      const inst = this.nodeInst.get(n.key)!;
      const tree = /pine|tree/i.test(n.def.model);
      if (st.alive && !n.alive) {
        n.alive = true;
        n.grow = 0;
        n.fall = 0;
      } else if (!st.alive && n.alive) {
        n.alive = false;
        n.fall = 0.0001;
        n.fallDir = Math.atan2(n.def.x - sim.state.player.x, n.def.z - sim.state.player.z);
      }
      n.shake = Math.max(0, n.shake - dt * 3);
      const rot = n.def.rot ?? 0;
      // Duck trees that stand between the camera and the player so nobody gets lost in the grove.
      const p = sim.state.player;
      const ahead = n.def.z - p.z;
      const occluding = ahead > -0.2 && ahead < 7.5 && Math.abs(n.def.x - p.x) < 1.3 + ahead * 0.12;
      n.occ += ((occluding ? 1 : 0) - n.occ) * Math.min(1, dt * 7);
      if (n.alive) {
        n.grow = Math.min(1, n.grow + dt / 0.8);
        const s = backOut(n.grow) * NODE_SCALE;
        const sh = Math.sin(time * 45) * n.shake * 0.08;
        const o = n.occ;
        _m2.makeScale(1 + o * 0.15, 1 - o * 0.72, 1 + o * 0.15);
        trs(_m, n.def.x, 0, n.def.z, rot, Math.max(0.001, s), sh, sh * 0.6);
        inst.set(n.index, _m.multiply(_m2));
      } else if (tree) {
        n.fall = Math.min(1.6, n.fall + dt);
        const f = Math.min(1, n.fall / 0.75);
        const ang = f * f * (Math.PI / 2) * 0.96;
        const sink = n.fall > 1 ? (n.fall - 1) / 0.6 : 0;
        const ax = Math.cos(n.fallDir) * ang;
        const az = -Math.sin(n.fallDir) * ang;
        inst.set(n.index, trs(_m, n.def.x, -sink * 0.4, n.def.z, rot, Math.max(0.001, (1 - sink) * NODE_SCALE), ax, az));
        this.stumpInst.set(stumps++, trs(_m, n.def.x, 0, n.def.z, rot, 1));
      } else {
        n.fall = Math.min(1, n.fall + dt * 2);
        inst.set(n.index, trs(_m, n.def.x, -n.fall * 0.3, n.def.z, rot, Math.max(0.001, 1 - n.fall * 0.7)));
      }
      this.nodeCount.set(n.key, Math.max(this.nodeCount.get(n.key) ?? 0, n.index + 1));
    }
    for (const [key, inst] of this.nodeInst) {
      inst.setCount(this.nodeCount.get(key) ?? 0);
      inst.commit();
    }
    this.stumpInst.setCount(stumps);
    this.stumpInst.commit();

    // Tents pop in as the population grows.
    const spots = this.data.camp.tentSpots;
    const nt = Math.min(sim.state.tents, spots.length);
    for (let i = 0; i < nt; i++) {
      if (this.tentAppear[i] === undefined) {
        this.tentAppear[i] = 0;
        this.onAppear(spots[i].x, spots[i].z, 1.3);
      }
      this.tentAppear[i] = Math.min(1, this.tentAppear[i] + dt / 0.7);
      this.tentInst.set(i, trs(_m, spots[i].x, 0, spots[i].z, spots[i].rot, backOut(this.tentAppear[i])));
    }
    this.tentInst.setCount(nt);
    this.tentInst.commit(nt > 0);

    // Frost wall shatter: pieces burst up and shrink away.
    for (const w of this.walls) {
      if (w.state !== 'shatter') continue;
      w.t += dt;
      const t = Math.min(1, w.t / 0.9);
      w.pieces.forEach((p, i) => {
        const delay = (i % 7) * 0.04;
        const k = Math.max(0, Math.min(1, (w.t - delay) / 0.7));
        const s = p.s * (1 + k * 0.25) * (1 - k * k);
        w.inst.set(i, trs(_m, p.x, k * 1.2, p.z, p.rot + k * 2, Math.max(0.001, s), k * 0.6, -k * 0.4));
      });
      w.inst.commit(false);
      if (t >= 1 && w.t > 1.3) {
        w.state = 'gone';
        w.inst.setVisible(false);
      }
    }

    // Hearth glow: bigger with level, livelier when Cosy.
    const hd = this.stations.get('hearth')!;
    if (hd.appear < 1) {
      hd.appear = Math.min(1, hd.appear + dt / 0.7);
      const s = backOut(hd.appear);
      hd.obj.scale.set(s, s, s);
    }
    const lvl = sim.state.hearth.level;
    const flick = 0.85 + Math.sin(time * 13) * 0.06 + Math.sin(time * 7.3) * 0.08 + Math.sin(time * 23) * 0.04;
    this.hearthLight.intensity = (24 + lvl * 10) * flick * (sim.cosy ? 1.35 : 1);
    this.hearthLight.distance = 10 + lvl * 4;
    for (const f of this.fireLights) {
      const on = sim.isActive(f.id);
      const ps = sim.state.stations[f.id];
      const working = ps && ps.kind === 'processor' && ps.active;
      const want = on ? f.base * (working ? 1.4 : 0.8) : 0;
      f.light.intensity += (want * (0.9 + Math.sin(time * 17 + f.base) * 0.1) - f.light.intensity) * Math.min(1, dt * 6);
    }
  }

  bump(id: string): void {
    const s = this.stations.get(id);
    if (s && s.appear >= 1) s.wobble = 1;
  }

  shakeNode(id: string): void {
    const n = this.nodes.find((x) => x.def.id === id);
    if (n) n.shake = 1;
  }

  /** World-space spot where a station shows (and receives) items of `item`. */
  itemSpot(id: string, item: ItemKind | null, out: THREE.Vector3, role: 'in' | 'out' = 'in'): THREE.Vector3 {
    const v = this.stations.get(id);
    if (!v) {
      const n = this.nodes.find((x) => x.def.id === id);
      if (n) return out.set(n.def.x, 1.4, n.def.z);
      return out.set(0, 1, 0);
    }
    const d = v.def;
    const l = localSpot(d, item, role, v.top);
    const rot = d.rot ?? 0;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return out.set(d.x + l.x * c + l.z * s, l.y, d.z - l.x * s + l.z * c);
  }

  stationTop(id: string): number {
    return this.stations.get(id)?.top ?? 1;
  }
}

/** Local offsets for station buffers (before rotation). */
export function localSpot(d: StationDef, item: ItemKind | null, role: 'in' | 'out', top: number): THREE.Vector3 {
  switch (d.type) {
    case 'pile':
      return _v.set(0, 0, 1.05);
    case 'processor':
      return role === 'out' ? _v.set(1.15, 0, 0.55) : _v.set(-1.15, 0, 0.55);
    case 'counter':
      return _v.set(0, top, 0);
    case 'deposit':
      return _v.set(1.55, 0, 1.0);
    default:
      void item;
      return _v.set(0, 0, 0);
  }
}

function makeGhost(model: string, x: number, z: number, rot: number): THREE.Object3D {
  const g = createProp(model, { seed: 1 });
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.material = ghostMat;
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  g.visible = false;
  return g;
}

export function backOut(t: number): number {
  const c1 = 2.2;
  const c3 = c1 + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

export function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
