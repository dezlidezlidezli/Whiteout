// Crank by circling (docs/MECHANICS.md §4), Ironridge. Everything here is driven by sim.data.mech.cranks
// and state.crank, so with the mechanic switched off (no cranks in the data) this part draws nothing.
//
//  - capstan: the 'rotor' push bars swing round with whoever walks the ring (player or the hired winder)
//  - a ground ring shows where to walk; chevrons run the way you are going; its rim fills as a gauge
//    (bellows: blast level; lift: progress to the next cage)
//  - a counter above the capstan: turns, plus blast % or cage progress
//  - bellows beside the forge: the 'bag' breathes with the blast, the forge fire and glow brighten
//  - mine lift: 'wheel' spins, 'cable'/'cage' rise from the pit as you circle; on liftArrive the cage
//    tips and ore tumbles onto the pit-head pile
//  - ratchet clicks per notch, a clunk per turn, the 'crank' pose for the player and the winder

import * as THREE from 'three';
import type { CrankDef } from '../../data/mechanics';
import type { SimEvent } from '../../sim';
import { animateCharacter, createProp, type CharacterRig } from '../models';
import { backOut, fxOf, glowSprite, hooksOf, sfxAt, worldOf, type LateCtx, type LatePart } from './ctx';

interface CrankOneState { angle: number; turns: number; blast: number; lift: number; dir: number }

const ringMat = (inner: number, outer: number) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uPhase: { value: 0 }, uDir: { value: 1 }, uFill: { value: 0 }, uNear: { value: 0 },
      uOn: { value: 0 }, uInner: { value: inner }, uOuter: { value: outer }, uGauge: { value: new THREE.Color(0xffa040) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uPhase; uniform float uDir; uniform float uFill; uniform float uNear; uniform float uOn;
      uniform float uInner; uniform float uOuter; uniform vec3 uGauge;
      varying vec2 vP;
      const float TAU = 6.2831853;
      void main() {
        float r = length(vP);
        float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
        float ang = atan(vP.y, vP.x);
        float edge = smoothstep(0.0, 0.07, t) * smoothstep(1.0, 0.93, t);
        float rim = smoothstep(0.12, 0.0, abs(t - 0.04)) + smoothstep(0.12, 0.0, abs(t - 0.96));
        // Chevrons (">") pointing the way round, scrolling with the capstan.
        float u = ang / TAU * 10.0 - uPhase * 10.0 / TAU;
        float v = fract(u * uDir + abs(t - 0.5) * 0.9);
        float chev = smoothstep(0.0, 0.06, v) * smoothstep(0.34, 0.26, v) * smoothstep(0.9, 0.6, abs(t - 0.5) * 2.0);
        // Gauge: fills clockwise from the far side (-z, the top of the screen) along the outer band.
        float g = fract((ang + 1.5707963) / TAU);
        float gauge = step(g, uFill) * step(0.62, t) * step(t, 0.9) * step(0.001, uFill);
        vec3 c = vec3(1.0, 0.93, 0.8) * (0.35 * rim);
        c = mix(c, vec3(1.0, 0.82, 0.5), chev * (0.35 + 0.5 * uNear));
        c = mix(c, uGauge * (1.15 + 0.25 * sin(uTime * 6.0)), gauge);
        float a = (0.16 * rim + chev * (0.18 + 0.5 * uNear) + gauge * 0.85 + 0.07) * edge * uOn;
        gl_FragColor = vec4(c, a);
      }`,
  });

interface CrankView {
  def: CrankDef;
  ring: THREE.Mesh;
  label: THREE.Sprite;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  labelKey: string;
  labelShow: number;
  bump: number;
  lastTurnT: number;
  rotorAngle: number;
  lastAngle: number;
  shown: number;
  // bellows
  bellows?: THREE.Object3D;
  bag?: THREE.Object3D | null;
  breath: number;
  glow?: THREE.Sprite;
  forgeLabel?: THREE.Sprite;
  forgeCanvas?: HTMLCanvasElement;
  forgeTex?: THREE.CanvasTexture;
  forgeKey: string;
  // lift
  liftVis: number;
  hold: number;
  tipT: number;
}

const _v = new THREE.Vector3();

export class Crank implements LatePart {
  private views: CrankView[] = [];

  constructor(private ctx: LateCtx) {
    this.build();
  }

  private get cranks(): CrankDef[] {
    return this.ctx.sim.data.mech?.cranks ?? [];
  }

  private st(id: string): CrankOneState {
    const all = (this.ctx.sim.state as unknown as { crank?: Record<string, CrankOneState> }).crank ?? {};
    return all[id] ?? { angle: 0, turns: 0, blast: 0, lift: 0, dir: 0 };
  }

  private active(c: CrankDef): boolean {
    const s = this.ctx.sim.state;
    return !!s.unlocked[c.unlockedBy] && !!s.areasOpen[c.area];
  }

  private build(): void {
    const scene = this.ctx.view.scene;
    for (const c of this.cranks) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(c.inner, c.outer, 72, 1).rotateX(-Math.PI / 2), ringMat(c.inner, c.outer));
      ring.position.set(c.x, 0.09, c.z);
      ring.renderOrder = 3;
      ring.visible = false;
      scene.add(ring);
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 96;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
      label.renderOrder = 24;
      label.scale.set(2.2, 0.66, 1);
      label.position.set(c.x, 2.6, c.z);
      label.visible = false;
      scene.add(label);
      const st = this.st(c.id);
      const v: CrankView = {
        def: c, ring, label, canvas, tex, labelKey: '', labelShow: 0, bump: 0, lastTurnT: -99, rotorAngle: -st.angle, lastAngle: st.angle,
        shown: this.active(c) ? 1 : 0, breath: 0, forgeKey: '', liftVis: st.lift / 2, hold: 0, tipT: 0,
      };
      if (c.use === 'bellows') {
        const f = this.ctx.sim.stationDefs.get(c.target);
        if (f) {
          // Bellows beside the forge, on the side facing its capstan, nozzle into the fire.
          const dx = c.x - f.x;
          const dz = c.z - f.z;
          const l = Math.hypot(dx, dz) || 1;
          const b = createProp('bellows', { seed: 3 });
          b.position.set(f.x + (dx / l) * 1.75, 0, f.z + (dz / l) * 1.75);
          b.rotation.y = Math.atan2(-dx / l, -dz / l);
          b.visible = false;
          scene.add(b);
          v.bellows = b;
          v.bag = b.getObjectByName('bag') ?? null;
          v.glow = glowSprite(2.4, 'rgba(255,230,170,0.95)', 'rgba(255,120,40,0.5)');
          v.glow.visible = false;
          v.glow.renderOrder = 6;
          scene.add(v.glow);
          v.forgeCanvas = document.createElement('canvas');
          v.forgeCanvas.width = 200;
          v.forgeCanvas.height = 90;
          v.forgeTex = new THREE.CanvasTexture(v.forgeCanvas);
          v.forgeTex.colorSpace = THREE.SRGBColorSpace;
          v.forgeLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: v.forgeTex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
          v.forgeLabel.scale.set(1.25, 0.56, 1);
          v.forgeLabel.renderOrder = 24;
          v.forgeLabel.visible = false;
          scene.add(v.forgeLabel);
        }
      }
      this.views.push(v);
    }
  }

  private capstanObj(c: CrankDef): THREE.Object3D | null {
    const d = (worldOf(this.ctx.view)['decor'] as Map<string, { obj: THREE.Object3D }>).get(c.unlockedBy);
    return d?.obj ?? null;
  }

  private liftObj(c: CrankDef): THREE.Object3D | null {
    const decor = worldOf(this.ctx.view)['decor'] as Map<string, { def: { model: string; x: number; z: number }; obj: THREE.Object3D }>;
    let best: THREE.Object3D | null = null;
    let bd = Infinity;
    for (const d of decor.values()) {
      if (d.def.model !== 'mineLift') continue;
      const dist = Math.hypot(d.def.x - c.x, d.def.z - c.z);
      if (dist < bd) {
        bd = dist;
        best = d.obj;
      }
    }
    return best;
  }

  private winderFor(c: CrankDef): { id: string; x: number; z: number; moving: boolean } | null {
    const s = this.ctx.sim.state;
    for (const def of this.ctx.sim.data.helpers) {
      if (def.role !== 'crank' || def.station !== c.id) continue;
      const h = s.helpers[def.id];
      if (h) return { id: def.id, x: h.x, z: h.z, moving: h.moving };
    }
    return null;
  }

  handle(e: SimEvent): void {
    if (e.type !== 'crankNotch' && e.type !== 'crankTurn' && e.type !== 'liftArrive' && e.type !== 'blast') return;
    const v = this.views.find((x) => x.def.id === (e as { id: string }).id);
    if (!v) return;
    const view = this.ctx.view;
    const c = v.def;
    const p = this.ctx.sim.state.player;
    const near = Math.hypot(p.x - c.x, p.z - c.z) < 9;
    if (e.type === 'crankNotch') {
      if (near) sfxAt(view, 'crankNotch', c, { volume: 0.55, pitch: 0.95 + Math.random() * 0.1 }, 0.045);
    } else if (e.type === 'crankTurn') {
      v.bump = 1;
      v.lastTurnT = this.ctx.time;
      if (near) sfxAt(view, 'crankTurn', c, { volume: 0.8 });
      fxOf(view).puff(c.x, 0.2, c.z, 4, 1.6, 1.2, 0.6);
    } else if (e.type === 'liftArrive') {
      v.hold = 1.1;
      v.tipT = 0;
      v.liftVis = 1;
      sfxAt(view, 'liftArrive', c, { volume: 1 });
      this.dumpOre(c, e.n);
    }
  }

  private dumpOre(c: CrankDef, n: number): void {
    const view = this.ctx.view;
    const lift = this.liftObj(c);
    const pileId = c.target;
    const from = new THREE.Vector3(c.x, 1.2, c.z);
    if (lift) {
      const cage = lift.getObjectByName('cage');
      cage?.getWorldPosition(from);
      from.y -= 0.6;
    }
    for (let i = 0; i < Math.min(8, n); i++) {
      const f = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5));
      window.setTimeout(() => {
        view['fly']({ kind: 'ore', from: f, to: { t: 'station', id: pileId, item: 'ore', role: 'out' }, dur: 0.5 + Math.random() * 0.2, arc: 1.3, hide: `st:${pileId}:ore`, land: () => worldOf(view).bump(pileId) });
      }, 250 + i * 70);
    }
    hooksOf(view).float(`+${n} ore`, new THREE.Vector3(from.x, from.y + 1.6, from.z), 'info');
    fxOf(view).puff(from.x, from.y, from.z, 6, 0.6, 1.2, 0.6);
  }

  frame(dt: number): void {
    const sim = this.ctx.sim;
    const s = sim.state;
    const p = s.player;
    const t = this.ctx.time;
    const title = this.ctx.view.title;
    for (const v of this.views) {
      const c = v.def;
      const on = this.active(c);
      const st = this.st(c.id);
      v.shown = Math.max(0, Math.min(1, v.shown + (on ? dt / 0.6 : -dt * 3)));
      const pd = Math.hypot(p.x - c.x, p.z - c.z);
      const inRing = pd >= c.inner && pd <= c.outer;
      const winder = this.winderFor(c);
      // Rotor: follows the crank's angle; a bar always rests against whoever is pushing.
      const dA = st.angle - v.lastAngle;
      v.lastAngle = st.angle;
      v.rotorAngle -= dA;
      const pusher = on && inRing ? p : winder && Math.abs(Math.hypot(winder.x - c.x, winder.z - c.z) - (c.inner + c.outer) / 2) < 0.5 ? winder : null;
      if (pusher) {
        // Nearest of the four bars to the pusher (bars at multiples of 90° in the rotor's frame).
        const want = -Math.atan2(pusher.z - c.z, pusher.x - c.x);
        const q = Math.PI / 2;
        let d = want - v.rotorAngle;
        d = ((((d + q / 2) % q) + q) % q) - q / 2;
        v.rotorAngle += d * Math.min(1, dt * 10);
      }
      const cap = this.capstanObj(c);
      const rotor = cap?.getObjectByName('rotor');
      if (rotor) rotor.rotation.y = v.rotorAngle;

      // Ring + gauge.
      const rm = v.ring.material as THREE.ShaderMaterial;
      v.ring.visible = v.shown > 0.01 && !title;
      const u = rm.uniforms;
      u.uTime.value = t;
      u.uPhase.value = st.angle;
      u.uDir.value = st.dir >= 0 ? 1 : -1;
      u.uNear.value += ((inRing ? 1 : pd < c.outer + 3 ? 0.4 : 0) - u.uNear.value) * Math.min(1, dt * 5);
      u.uOn.value = backOut(v.shown) * (0.75 + 0.25 * u.uNear.value);
      const fill = c.use === 'bellows' ? st.blast : st.lift / 2;
      u.uFill.value += (fill - u.uFill.value) * Math.min(1, dt * 8);

      // Counter label: while someone winds it or soon after a turn.
      const recent = t - v.lastTurnT < 3 || inRing || (c.use === 'bellows' && st.blast > 0.02 && pd < 8);
      v.labelShow += ((recent && on && !title ? 1 : 0) - v.labelShow) * Math.min(1, dt * 6);
      v.bump = Math.max(0, v.bump - dt * 3);
      v.label.visible = v.labelShow > 0.02;
      if (v.label.visible) {
        const turns = Math.floor(st.turns);
        const sub = c.use === 'bellows' ? `blast ${Math.round(st.blast * 100)}%` : `cage ${Math.round(Math.min(1, st.lift / 2) * 100)}%`;
        const key = `${turns}|${sub}`;
        if (key !== v.labelKey) {
          v.labelKey = key;
          drawCounter(v.canvas, turns, sub, c.use === 'bellows' ? st.blast : st.lift / 2);
          v.tex.needsUpdate = true;
        }
        const k = v.labelShow * (1 + v.bump * 0.25);
        v.label.scale.set(2.2 * k, 0.66 * k, 1);
        v.label.position.set(c.x, 2.75 + v.bump * 0.15, c.z);
      }

      // Bellows: breathe with the blast.
      if (v.bellows) {
        v.bellows.visible = v.shown > 0.01;
        v.bellows.scale.setScalar(Math.max(0.001, backOut(v.shown)));
        const rate = 0.6 + st.blast * 2.6;
        const prev = v.breath;
        v.breath += dt * rate;
        if (v.bag) {
          const ph = Math.sin(v.breath * Math.PI * 2);
          v.bag.scale.y = 0.78 + 0.22 * ph * (0.25 + 0.75 * Math.min(1, st.blast * 1.5));
        }
        const f = sim.stationDefs.get(c.target);
        if (f && Math.floor(v.breath) !== Math.floor(prev) && st.blast > 0.05) {
          // A puff of sparks out of the forge each time the bellows blow.
          fxOf(this.ctx.view).glint(f.x, 1.3, f.z, 3 + Math.round(st.blast * 6), 1 + st.blast);
          if (Math.hypot(p.x - f.x, p.z - f.z) < 10) sfxAt(this.ctx.view, 'bellows', f, { volume: 0.35 + st.blast * 0.5 }, 0.3);
        }
        if (v.glow && f) {
          const top = worldOf(this.ctx.view).stationTop(f.id);
          v.glow.visible = st.blast > 0.01 && on;
          v.glow.position.set(f.x, Math.min(top, 1.6) + 0.1, f.z);
          v.glow.scale.setScalar((1.6 + st.blast * 3.2) * (0.92 + Math.sin(t * 11) * 0.05 + Math.sin(t * 7.3) * 0.04));
          (v.glow.material as THREE.SpriteMaterial).opacity = Math.min(1, st.blast * 1.4);
        }
        if (v.forgeLabel && v.forgeCanvas && v.forgeTex && f) {
          const mul = 1 + 2 * st.blast;
          v.forgeLabel.visible = on && st.blast > 0.03 && !title;
          const key = mul.toFixed(1);
          if (v.forgeLabel.visible && key !== v.forgeKey) {
            v.forgeKey = key;
            drawMul(v.forgeCanvas, `×${key}`);
            v.forgeTex.needsUpdate = true;
          }
          v.forgeLabel.position.set(f.x, worldOf(this.ctx.view).stationTop(f.id) + 0.7, f.z);
        }
      }

      // Mine lift: cage rises from the pit as you wind; tips its ore at the top.
      if (c.use === 'lift') {
        const lift = this.liftObj(c);
        if (lift && lift.visible) {
          const ud = lift.userData as { cageTravel?: number; cageRestY?: number; cableTopY?: number };
          const travel = ud.cageTravel ?? 4;
          const rest = ud.cageRestY ?? 1.4;
          const cableTop = ud.cableTopY ?? 3.95;
          const target = Math.min(1, st.lift / 2);
          if (v.hold > 0) {
            v.hold -= dt;
            v.tipT += dt;
          } else v.liftVis += (target - v.liftVis) * Math.min(1, dt * (target < v.liftVis ? 1.8 : 8));
          const cage = lift.getObjectByName('cage');
          const cable = lift.getObjectByName('cable');
          const wheel = lift.getObjectByName('wheel');
          const y = rest - travel * (1 - v.liftVis);
          if (cage) {
            cage.position.y = y;
            cage.rotation.z = v.hold > 0 ? Math.sin(Math.min(1, v.tipT / 0.35) * Math.PI * 0.5) * 0.35 * Math.min(1, v.hold * 3) : 0;
          }
          if (cable) cable.scale.y = Math.max(0.05, cableTop - y);
          if (wheel) wheel.rotation.x = -st.angle * 1.6;
        }
      }
    }
  }

  /** After the view: the push pose for player/winder, a hotter forge fire. */
  post(): void {
    const view = this.ctx.view;
    const sim = this.ctx.sim;
    const s = sim.state;
    const p = s.player;
    const time = view['time'];
    for (const v of this.views) {
      const c = v.def;
      if (!this.active(c)) continue;
      const pd = Math.hypot(p.x - c.x, p.z - c.z);
      if (pd >= c.inner && pd <= c.outer) {
        const rig = view['actors'].player as CharacterRig;
        const speed = Math.hypot(p.vx, p.vz);
        animateCharacter(rig, { time, speed, carrying: p.stack.length > 0, action: 'crank' });
        rig.root.updateMatrixWorld(true);
      }
      const w = this.winderFor(c);
      if (w && w.moving) {
        const hv = (view['actors']['helpers'] as Map<string, { rig: CharacterRig }>).get(w.id);
        if (hv) {
          animateCharacter(hv.rig, { time: time + w.id.length, speed: 2, carrying: false, action: 'crank' });
          hv.rig.root.updateMatrixWorld(true);
        }
      }
      if (c.use === 'bellows') {
        const st = this.st(c.id);
        const sv = worldOf(view).stations.get(c.target);
        const flames = sv?.parts?.flames ?? [];
        for (const f of flames) f.scale.multiplyScalar(1 + st.blast * 0.7);
      }
    }
  }

  reset(): void {
    for (const v of this.views) {
      const st = this.st(v.def.id);
      v.lastAngle = st.angle;
      v.liftVis = st.lift / 2;
      v.hold = 0;
      v.shown = this.active(v.def) ? 1 : 0;
    }
  }

  dispose(): void {
    for (const v of this.views) {
      v.ring.removeFromParent();
      v.label.removeFromParent();
      v.bellows?.removeFromParent();
      v.glow?.removeFromParent();
      v.forgeLabel?.removeFromParent();
    }
    this.views = [];
  }
}

function drawCounter(c: HTMLCanvasElement, turns: number, sub: string, frac: number): void {
  const g = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(22,30,52,0.86)';
  g.beginPath();
  g.roundRect(6, 8, W - 12, H - 16, 34);
  g.fill();
  g.strokeStyle = 'rgba(255,200,120,0.9)';
  g.lineWidth = 4;
  g.stroke();
  // Circular arrow icon with a progress arc.
  const cx = 50;
  const cy = H / 2;
  g.lineWidth = 7;
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.arc(cx, cy, 22, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = '#ffb347';
  g.lineCap = 'round';
  g.beginPath();
  g.arc(cx, cy, 22, -Math.PI / 2, -Math.PI / 2 + Math.max(0.05, frac) * Math.PI * 2);
  g.stroke();
  g.fillStyle = '#fff3d6';
  g.beginPath();
  g.moveTo(cx + 22, cy - 12);
  g.lineTo(cx + 31, cy + 1);
  g.lineTo(cx + 13, cy + 1);
  g.closePath();
  g.fill();
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd27a';
  g.font = '900 40px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  g.fillText(String(turns), 88, cy - 9);
  g.fillStyle = '#dfe8f8';
  g.font = '800 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  g.fillText(sub, 88, cy + 22, W - 100);
  const tw = g.measureText(String(turns)).width;
  void tw;
}

function drawMul(c: HTMLCanvasElement, txt: string): void {
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, '#ffe7a6');
  grd.addColorStop(1, '#ff8a3a');
  g.fillStyle = 'rgba(90,30,8,0.9)';
  g.beginPath();
  g.roundRect(8, 14, c.width - 16, c.height - 20, 30);
  g.fill();
  g.fillStyle = grd;
  g.beginPath();
  g.roundRect(8, 8, c.width - 16, c.height - 22, 30);
  g.fill();
  g.fillStyle = '#3a1406';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 44px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  g.fillText(txt, c.width / 2, c.height / 2 - 4);
}
