// Visible cooking: every working processor shows what goes in, what it is doing to it and what comes out.
// - Kettle: a fish arcs from the buffer into the pot (lid lifts), the pot bubbles, a stew bowl is ladled out
//   onto the output stack with a little arc and a puff of steam.
// - Sawmill: a log rides the bed through the spinning blade (sawdust), comes out a plank and slides off.
// - Smokehouse: a fish hangs from the eave hook, turning in the smoke and darkening to smoked, then is lifted off.
// - Forge: ore sits in the furnace mouth glowing hotter, becomes an ingot and comes out still glowing.
// - Great Kitchen: stew and smoked fish go into the cauldron; a plated feast comes out.
// Idle processors show nothing here (and the world keeps them steam-less with a still lid).
// Uses the shared item instancer (no extra draw calls) plus a tiny pool of additive glow sprites.

import * as THREE from 'three';
import type { ItemKind, ProcessorDef } from '../data/types';
import type { Sim } from '../sim';
import type { ItemBatcher } from './items';
import type { StationView } from './world';

type V3 = [number, number, number];
type Mode = 'pot' | 'bed' | 'hook' | 'mouth';

interface Profile {
  mode: Mode;
  /** Where inputs enter / the item cooks, in the model's local space. */
  at: V3;
  /** 'bed' only: where the item leaves the blade. */
  end?: V3;
  /** Fraction of the cycle spent flying in from the buffer. */
  inEnd: number;
  /** Progress at which the cooking item turns into the output kind (hook/mouth/bed). */
  turn: number;
  /** Glow (furnace) while cooking. */
  glow?: boolean;
}

const PROFILES: Record<string, Profile> = {
  kettle: { mode: 'pot', at: [0, 1.12, 0], inEnd: 0.45, turn: 1 },
  greatKitchen: { mode: 'pot', at: [0, 1.4, 0.8], inEnd: 0.4, turn: 1 },
  sawmill: { mode: 'bed', at: [0.1, 1.0, -0.95], end: [0.1, 1.0, 0.95], inEnd: 0.25, turn: 0.55 },
  smokehouse: { mode: 'hook', at: [-0.12, 1.62, 1.2], inEnd: 0.2, turn: 0.55 },
  forge: { mode: 'mouth', at: [0, 0.72, 0.85], inEnd: 0.25, turn: 0.62, glow: true },
};

export interface CookHooks {
  fly(kind: ItemKind, from: THREE.Vector3, to: THREE.Vector3, dur: number, arc: number, hide: string, land: () => void): void;
  puff(x: number, y: number, z: number, n: number, radius: number, speed: number, scale?: number): void;
  steam(x: number, y: number, z: number): void;
  glint(x: number, y: number, z: number, n: number, sp: number): void;
}

interface Slot {
  obj: THREE.Object3D;
  def: ProcessorDef;
  prof: Profile;
  lid: THREE.Object3D | null;
  lidY: number;
  glow: THREE.Sprite | null;
  lastU: number;
  dustT: number;
  /** Seconds a freshly made glowing item stays hot on the output stack (forge). */
  hot: number;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _o = new THREE.Vector3();

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,236,170,1)');
  gr.addColorStop(0.35, 'rgba(255,150,60,0.7)');
  gr.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CookingView {
  private slots = new Map<string, Slot>();
  private glowTex: THREE.Texture | null = null;
  /** Input pile tops and the output landing spot per processor, written by the view's buffer drawing. */
  readonly tops = new Map<string, { in: Partial<Record<ItemKind, THREE.Vector3>>; out: THREE.Vector3 }>();

  constructor(private parent: THREE.Object3D, private hooks: CookHooks) {}

  private slot(v: StationView): Slot | null {
    const d = v.def;
    if (d.type !== 'processor') return null;
    let s = this.slots.get(d.id);
    if (s && s.obj !== v.obj) {
      // The prop was swapped (e.g. the steel kettle): find its parts again.
      s.glow?.removeFromParent();
      s = undefined;
    }
    if (!s) {
      const prof = PROFILES[d.model];
      if (!prof) return null;
      const lid = v.obj.getObjectByName('lid') ?? null;
      let glow: THREE.Sprite | null = null;
      if (prof.glow) {
        this.glowTex ??= glowTexture();
        glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
        glow.visible = false;
        glow.renderOrder = 6;
        this.parent.add(glow);
      }
      s = { obj: v.obj, def: d, prof, lid, lidY: lid ? lid.position.y : 0, glow, lastU: 0, dustT: 0, hot: 0 };
      this.slots.set(d.id, s);
    }
    return s;
  }

  /** How many of each input kind are "in the machine" (drawn by us, not on the buffer stack). */
  inMachine(sim: Sim, id: string): number {
    const st = sim.state.stations[id];
    return st && st.kind === 'processor' && st.active && this.slots.has(id) ? 1 : 0;
  }

  private local(v: StationView, p: V3, out: THREE.Vector3): THREE.Vector3 {
    return v.obj.localToWorld(out.set(p[0], p[1], p[2]));
  }

  update(sim: Sim, stations: Map<string, StationView>, items: ItemBatcher, t: number, dt: number, px: number, pz: number): void {
    for (const v of stations.values()) {
      if (!v.shown || v.appear < 0.5 || v.def.type !== 'processor') continue;
      const s = this.slot(v);
      if (!s) continue;
      const d = s.def;
      const st = sim.state.stations[d.id];
      if (!st || st.kind !== 'processor') continue;
      const near = Math.hypot(d.x - px, d.z - pz) < 26;
      const r = sim.data.recipes[d.recipe];
      const active = st.active && near;
      const u = active ? Math.min(1, st.progress / r.time) : 0;
      const prof = s.prof;
      const kinds = Object.keys(r.inputs) as ItemKind[];
      const tops = this.tops.get(d.id);
      v.obj.updateMatrixWorld();
      const at = this.local(v, prof.at, _a);
      const yaw = (d.rot ?? 0);
      if (s.lid) {
        // The lid opens as the ingredient goes in; idle it rests still (the world's bob only runs when working).
        const open = active && u < prof.inEnd + 0.08 ? Math.sin(Math.min(1, u / (prof.inEnd + 0.08)) * Math.PI) : 0;
        s.lid.rotation.z = -open * 0.55;
        if (open > 0) s.lid.position.y = s.lidY + open * 0.1;
      }
      if (s.glow) s.glow.visible = false;
      s.hot = Math.max(0, s.hot - dt);
      if (active) {
        // 1) Ingredients arc in from the buffer (staggered when there are two).
        kinds.forEach((k, i) => {
          const a0 = (i * prof.inEnd) / (kinds.length + 1);
          const a1 = a0 + (prof.inEnd * 2) / (kinds.length + 1);
          if (u < a0 || u > a1) return;
          const k01 = (u - a0) / (a1 - a0);
          const from = tops?.in[k] ?? at;
          const to = prof.mode === 'bed' || prof.mode === 'hook' || prof.mode === 'mouth' ? at : _c.copy(at).setY(at.y + 0.15);
          const e = k01 * k01 * (3 - 2 * k01);
          _b.lerpVectors(from, to, e);
          _b.y += Math.sin(k01 * Math.PI) * (prof.mode === 'pot' ? 0.9 : 0.45);
          const sc = prof.mode === 'pot' ? 1 - Math.max(0, k01 - 0.75) * 3.2 : 1;
          items.add(k, _b.x, _b.y, _b.z, t * 4 + i, Math.max(0.05, sc), k01 * 2.4, 0);
        });
        // 2) The work itself.
        const w = Math.max(0, (u - prof.inEnd) / (1 - prof.inEnd));
        const kind: ItemKind = u >= prof.turn ? r.output : kinds[0];
        if (prof.mode === 'bed' && u >= prof.inEnd) {
          const end = this.local(v, prof.end!, _b);
          _c.lerpVectors(at, end, w);
          items.add(kind, _c.x, _c.y, _c.z, yaw, 1, 0, 0);
          // Sawdust while the blade bites.
          if (w > 0.3 && w < 0.75) {
            s.dustT -= dt;
            if (s.dustT <= 0) {
              s.dustT = 0.12;
              this.hooks.puff(_c.x, _c.y + 0.1, _c.z, 1, 0.15, 0.9, 0.3);
            }
          }
        } else if (prof.mode === 'hook' && u >= prof.inEnd) {
          // Hanging from the hook, turning slowly in the smoke.
          const sway = Math.sin(t * 2.1 + d.x) * 0.12;
          items.add(kind, at.x + sway * 0.1, at.y, at.z, t * 0.9, 1.05, Math.PI / 2, sway);
          if (Math.abs(u - prof.turn) < 0.03 && s.lastU < prof.turn) this.hooks.puff(at.x, at.y + 0.15, at.z, 3, 0.2, 0.6, 0.45);
        } else if (prof.mode === 'mouth' && u >= prof.inEnd) {
          items.add(kind, at.x, at.y, at.z, t * 0.6, 1, 0, 0);
          if (s.glow) {
            const heat = 0.35 + 0.65 * w;
            s.glow.visible = true;
            s.glow.position.set(at.x, at.y + 0.1, at.z);
            s.glow.scale.setScalar(0.5 + heat * 0.7 + Math.sin(t * 13) * 0.04);
            (s.glow.material as THREE.SpriteMaterial).opacity = heat;
          }
        } else if (prof.mode === 'pot' && u >= prof.inEnd && u > 0.82) {
          // The ladle lifts the finished dish out of the pot.
          const k01 = (u - 0.82) / 0.18;
          items.add(r.output, at.x, at.y + 0.05 + k01 * 0.35, at.z, t * 2, 0.35 + 0.65 * k01, 0, 0);
        }
      }
      // A freshly made glowing ingot keeps glowing on the output stack for a moment.
      if (s.glow && s.hot > 0 && tops) {
        s.glow.visible = true;
        s.glow.position.copy(tops.out).y += 0.05;
        s.glow.scale.setScalar(0.55 * (s.hot / 1.4) + 0.2);
        (s.glow.material as THREE.SpriteMaterial).opacity = Math.min(1, s.hot / 1.4);
      }
      s.lastU = u;
    }
  }

  /** A processor finished an item: lift it out and send it onto the output stack. */
  craft(sim: Sim, stations: Map<string, StationView>, id: string, item: ItemKind): boolean {
    const v = stations.get(id);
    if (!v || !v.shown) return false;
    const s = this.slot(v);
    if (!s) return false;
    const tops = this.tops.get(id);
    if (!tops) return false;
    const p = sim.state.player;
    if (Math.hypot(v.def.x - p.x, v.def.z - p.z) > 26) return false;
    v.obj.updateMatrixWorld();
    const prof = s.prof;
    const from = this.local(v, prof.mode === 'bed' ? prof.end! : prof.at, new THREE.Vector3());
    if (prof.mode === 'pot') from.y += 0.4;
    const to = tops.out.clone();
    const dur = prof.mode === 'bed' ? 0.32 : 0.42;
    const arc = prof.mode === 'bed' ? 0.25 : prof.mode === 'pot' ? 0.7 : 0.5;
    if (prof.mode === 'pot') this.hooks.steam(from.x, from.y + 0.2, from.z);
    this.hooks.fly(item, from, to, dur, arc, `st:${id}:${item}`, () => {
      if (prof.mode === 'pot') this.hooks.steam(to.x, to.y + 0.1, to.z);
      else this.hooks.puff(to.x, to.y + 0.05, to.z, 2, 0.2, 0.7, 0.35);
      if (prof.glow) {
        s.hot = 1.4;
        this.hooks.glint(to.x, to.y + 0.2, to.z, 5, 1.2);
      }
    });
    return true;
  }

  dispose(): void {
    for (const s of this.slots.values()) s.glow?.removeFromParent();
    this.slots.clear();
  }
}
