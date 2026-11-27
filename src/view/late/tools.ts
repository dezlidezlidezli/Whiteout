// The Kettlekeeper's hand tools: while working a node the player holds the right tool for it
// (axe for trees, pick for ore, auger for lake ice), drawn in its current tier, so a toolUpgrade
// visibly changes what they swing. Upgrades get a held-aloft moment. Also picks the matching
// work animation ('mine' / 'fish') for the player and the miner/fisher helpers.

import * as THREE from 'three';
import type { NodeDef, ToolKind } from '../../data/types';
import type { SimEvent } from '../../sim';
import { animateCharacter, type CharacterRig } from '../models';
import { backOut, fxOf, hooksOf, sfxAt, type LateCtx, type LatePart } from './ctx';

type HandTool = 'axe' | 'pick' | 'auger';

const lam = (c: number, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
const MATS = {
  handle: lam(0xb07a44),
  handleDark: lam(0x6b4424),
  stone: lam(0x7d7f86),
  rust: lam(0x8a5a3a),
  steel: lam(0xe4ecf4, 0x2a3644),
  edge: lam(0xffffff, 0x50607a),
  copper: lam(0xd8844a, 0x3a1a08),
};

function buildTool(kind: HandTool, tier: number): THREE.Group {
  const g = new THREE.Group();
  const steel = tier > 0;
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  if (kind === 'axe') {
    add(new THREE.CylinderGeometry(0.024, 0.028, 0.66, 6), steel ? MATS.handleDark : MATS.handle, 0, -0.24, 0);
    const head = new THREE.BoxGeometry(0.05, 0.16, 0.2);
    add(head, steel ? MATS.steel : MATS.stone, 0, -0.5, 0.08);
    if (steel) add(new THREE.BoxGeometry(0.056, 0.17, 0.03), MATS.edge, 0, -0.5, 0.19);
    else add(new THREE.BoxGeometry(0.06, 0.05, 0.08), MATS.rust, 0, -0.5, -0.02);
  } else if (kind === 'pick') {
    add(new THREE.CylinderGeometry(0.024, 0.028, 0.64, 6), steel ? MATS.handleDark : MATS.handle, 0, -0.24, 0);
    const m = steel ? MATS.steel : MATS.stone;
    add(new THREE.ConeGeometry(0.04, steel ? 0.34 : 0.26, 5), m, 0, -0.52, 0.16, Math.PI / 2 + 0.25, 0, 0);
    add(new THREE.ConeGeometry(0.04, steel ? 0.34 : 0.26, 5), m, 0, -0.52, -0.16, -Math.PI / 2 - 0.25, 0, 0);
    add(new THREE.BoxGeometry(0.07, 0.08, 0.09), steel ? MATS.copper : MATS.rust, 0, -0.52, 0);
  } else {
    // Ice auger: T-handle and a long spiral bit.
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 6), MATS.handle, 0, -0.02, 0, 0, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.6, 6), steel ? MATS.steel : MATS.stone, 0, -0.32, 0);
    for (let i = 0; i < 5; i++) add(new THREE.TorusGeometry(0.05, 0.012, 4, 10), steel ? MATS.edge : MATS.stone, 0, -0.42 - i * 0.06, 0, Math.PI / 2 + 0.3, 0, i);
  }
  return g;
}

const TOOL_LABEL: Record<ToolKind, string> = { axe: 'Steel axe!', pick: 'Steel pick!', auger: 'Ice auger!', kettle: 'Steel kettles!' };

function toolFor(def: NodeDef): HandTool | null {
  const tag = `${def.tag ?? ''} ${def.model}`;
  if (/pine|tree/i.test(tag)) return 'axe';
  if (/ore|vein|rock/i.test(tag)) return 'pick';
  if (/iceHole/.test(tag)) return 'auger';
  return null;
}

function actionFor(def: NodeDef): 'mine' | 'fish' | null {
  const tag = `${def.tag ?? ''} ${def.model}`;
  if (/ore|vein/i.test(tag)) return 'mine';
  if (/ice|hole|fish/i.test(tag)) return 'fish';
  return null;
}

export class Tools implements LatePart {
  private hand = new THREE.Group();
  private handKey = '';
  private handArm: THREE.Object3D | null = null;
  private handS = 0;
  private aloft: { obj: THREE.Object3D; t: number } | null = null;

  constructor(private ctx: LateCtx) {
    this.hand.position.set(0, -0.39, 0.02);
    this.hand.rotation.x = -0.9;
  }

  private get player(): CharacterRig {
    return this.ctx.view['actors'].player;
  }

  private tier(kind: HandTool): number {
    return this.ctx.sim.state.tools[kind] ?? 0;
  }

  handle(e: SimEvent): void {
    if (e.type !== 'toolUpgrade') return;
    const v = this.ctx.view;
    const s = this.ctx.sim.state;
    const p = s.player;
    hooksOf(v).float(TOOL_LABEL[e.tool] ?? 'Upgrade!', new THREE.Vector3(p.x, 3.1, p.z), 'big');
    v['actors'].cheerT = 1.6;
    if (e.tool === 'kettle') {
      for (const d of this.ctx.sim.data.stations) {
        if (d.type !== 'processor' || !/kettle/i.test(d.model) || !this.ctx.sim.isActive(d.id)) continue;
        fxOf(v).glint(d.x, 1.2, d.z, 12, 2);
        fxOf(v).ring(d.x, d.z, 1.6, 0xcfe4ff, 0.7);
      }
      sfxAt(v, 'craft', undefined, { pitch: 1.4 });
      return;
    }
    // Held aloft over the head, spinning, with a sparkle.
    if (this.aloft) this.aloft.obj.removeFromParent();
    const obj = buildTool(e.tool as HandTool, e.level);
    obj.rotation.x = Math.PI; // head up
    v.scene.add(obj);
    this.aloft = { obj, t: 0 };
    fxOf(v).glint(p.x, 2.4, p.z, 20, 2.5);
    sfxAt(v, 'hammer', undefined, { pitch: 1.3, volume: 0.8 });
  }

  frame(dt: number): void {
    const sim = this.ctx.sim;
    const s = sim.state;
    const p = s.player;
    const rig = this.player;
    // Re-attach after a rig rebuild.
    const arm = rig.root.getObjectByName('armR') ?? null;
    if (arm !== this.handArm) {
      this.hand.removeFromParent();
      arm?.add(this.hand);
      this.handArm = arm;
    }
    const node = p.working ? (sim.stationDefs.get(p.working) as NodeDef | undefined) : undefined;
    let kind = node && node.type === 'node' ? toolFor(node) : null;
    if (kind === 'auger' && this.tier('auger') < 1) kind = null; // bare-handed line fishing until the auger exists
    const key = kind ? `${kind}:${this.tier(kind)}` : this.handKey;
    if (key !== this.handKey && kind) {
      this.hand.clear();
      this.hand.add(buildTool(kind, this.tier(kind)));
      this.handKey = key;
    }
    this.handS += ((kind ? 1 : 0) - this.handS) * Math.min(1, dt * 12);
    this.hand.visible = this.handS > 0.02;
    this.hand.scale.setScalar(Math.max(0.001, this.handS));

    if (this.aloft) {
      const a = this.aloft;
      a.t += dt;
      const k = Math.min(1, a.t / 0.5);
      const out = a.t > 1.8 ? Math.max(0, 1 - (a.t - 1.8) / 0.35) : 1;
      a.obj.position.set(p.x, 2.35 + backOut(k) * 0.5, p.z);
      a.obj.rotation.y = a.t * 5;
      a.obj.scale.setScalar(Math.max(0.001, backOut(k) * 1.5 * out));
      if (a.t > 2.2) {
        a.obj.removeFromParent();
        this.aloft = null;
      }
    }
  }

  /** After the view animated everyone: swap generic 'chop' for the work that fits the node. */
  post(): void {
    const v = this.ctx.view;
    const sim = this.ctx.sim;
    const s = sim.state;
    const time = v['time'];
    const p = s.player;
    if (p.working) {
      const d = sim.stationDefs.get(p.working) as NodeDef | undefined;
      const act = d && d.type === 'node' ? actionFor(d) : null;
      if (act) {
        animateCharacter(this.player, { time, speed: 0, carrying: p.stack.length > 0, action: act });
        this.player.root.updateMatrixWorld(true);
      }
    }
    const helpers = v['actors']['helpers'] as Map<string, { rig: CharacterRig }>;
    for (const id in s.helpers) {
      const h = s.helpers[id];
      if (h.action !== 'chop' || !h.target || h.moving) continue;
      const d = sim.stationDefs.get(h.target) as NodeDef | undefined;
      const act = d && d.type === 'node' ? actionFor(d) : null;
      const hv = helpers.get(id);
      if (!act || !hv) continue;
      animateCharacter(hv.rig, { time: time + id.length, speed: 0, carrying: h.stack.length > 0, action: act });
      hv.rig.root.updateMatrixWorld(true);
    }
  }

  dispose(): void {
    this.hand.removeFromParent();
    this.aloft?.obj.removeFromParent();
  }
}
