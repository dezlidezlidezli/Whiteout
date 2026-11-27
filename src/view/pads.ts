// Build pads: a chunky plate on the ground that fills like a liquid gauge, a cost label and a
// floating miniature of what you'll get.

import * as THREE from 'three';
import type { ItemKind, PadDef } from '../data/types';
import type { Sim } from '../sim';
import { createCharacter, createProp, getItemMesh, PALETTE, type CharacterRole } from './models';

const SIZE = 1.8;
const _lp = new THREE.Vector3();

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

let baseGeo: THREE.BufferGeometry | null = null;
let rimGeo: THREE.BufferGeometry | null = null;
let fillGeo: THREE.BufferGeometry | null = null;
const baseMat = new THREE.MeshStandardMaterial({ color: 0x2b3550, roughness: 0.7 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffa040, emissiveIntensity: 0.6, roughness: 0.5 });
const lockedRimMat = new THREE.MeshStandardMaterial({ color: 0x8090a8, roughness: 0.6 });

function geos() {
  if (!baseGeo) {
    baseGeo = new THREE.ExtrudeGeometry(roundedRect(SIZE, SIZE, 0.32), { depth: 0.08, bevelEnabled: false }).rotateX(-Math.PI / 2);
    const rim = roundedRect(SIZE + 0.08, SIZE + 0.08, 0.36);
    rim.holes.push(roundedRect(SIZE - 0.16, SIZE - 0.16, 0.26) as unknown as THREE.Path);
    rimGeo = new THREE.ExtrudeGeometry(rim, { depth: 0.13, bevelEnabled: false }).rotateX(-Math.PI / 2);
    fillGeo = new THREE.ShapeGeometry(roundedRect(SIZE - 0.2, SIZE - 0.2, 0.24)).rotateX(-Math.PI / 2);
  }
  return { baseGeo: baseGeo!, rimGeo: rimGeo!, fillGeo: fillGeo! };
}

function fillMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uFill: { value: 0 },
      uTime: { value: 0 },
      uHot: { value: 0 },
      uLocked: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() { vP = position.xz / ${(SIZE - 0.2).toFixed(2)} + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uFill; uniform float uTime; uniform float uHot; uniform float uLocked;
      varying vec2 vP;
      void main() {
        // Fill rises from the camera-facing edge (+z) to the back (-z).
        float h = 1.0 - vP.y;
        float wave = sin(vP.x * 9.0 + uTime * 4.0) * 0.025 + sin(vP.x * 17.0 - uTime * 6.0) * 0.012;
        float lvl = uFill + (uFill > 0.001 && uFill < 0.999 ? wave : 0.0);
        float inFill = step(h, lvl);
        vec3 empty = mix(vec3(0.20, 0.27, 0.42), vec3(0.32, 0.36, 0.44), uLocked);
        vec3 liquid = mix(vec3(1.0, 0.55, 0.16), vec3(1.0, 0.82, 0.38), h);
        float surf = smoothstep(0.035, 0.0, abs(h - lvl)) * step(0.001, uFill);
        vec3 c = mix(empty, liquid, inFill) + surf * vec3(1.0, 0.9, 0.6) * 0.8;
        // Pulsing inner glow when ready to pay.
        float edge = smoothstep(0.42, 0.5, max(abs(vP.x - 0.5), abs(vP.y - 0.5)));
        c += edge * vec3(1.0, 0.6, 0.25) * (0.25 + 0.25 * sin(uTime * 3.0)) * (1.0 - uLocked);
        c += uHot * 0.25;
        gl_FragColor = vec4(c, 0.96);
      }`,
  });
}

// --- label canvas -----------------------------------------------------------

const ITEM_COLORS: Record<string, string> = {
  plank: '#e0b070', log: '#a5703f', fish: '#8cc0e0', stew: '#e8904a', ingot: '#d0d6de', ore: '#8a8f99', smokedFish: '#c87a40', feast: '#f2c24e',
};

function drawEmber(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff2c0');
  g.addColorStop(0.5, '#ffb347');
  g.addColorStop(1, '#ff6a2b');
  ctx.fillStyle = g;
  ctx.beginPath();
  // Flame / ember drop shape.
  ctx.moveTo(x, y - r * 1.25);
  ctx.bezierCurveTo(x + r * 0.95, y - r * 0.3, x + r, y + r * 0.55, x, y + r);
  ctx.bezierCurveTo(x - r, y + r * 0.55, x - r * 0.95, y - r * 0.3, x, y - r * 1.25);
  ctx.fill();
}

function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.55, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.55, r * 0.7, r * 0.55, 0, Math.PI, 0);
  ctx.fill();
}

function drawItemChip(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, item: ItemKind): void {
  ctx.fillStyle = ITEM_COLORS[item] ?? '#ccc';
  ctx.strokeStyle = 'rgba(40,25,10,0.55)';
  ctx.lineWidth = 4;
  if (item === 'plank') {
    ctx.beginPath();
    ctx.roundRect(x - r * 1.1, y - r * 0.45, r * 2.2, r * 0.9, 6);
    ctx.fill();
    ctx.stroke();
  } else if (item === 'log') {
    ctx.beginPath();
    ctx.roundRect(x - r * 1.1, y - r * 0.5, r * 2.2, r, r * 0.5);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

class PadLabel {
  readonly canvas: HTMLCanvasElement;
  readonly tex: THREE.CanvasTexture;
  private key = '';
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 200;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
  }
  draw(title: string, embers: number, mats: [ItemKind, number, number][], lockedPop: number, level = 0): void {
    if (level > 0) title = `${title} · Lv ${level + 1}`;
    const key = `${title}|${embers}|${mats.map((m) => m.join(':')).join(',')}|${lockedPop}`;
    if (key === this.key) return;
    this.key = key;
    const c = this.canvas.getContext('2d')!;
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    // Bubble.
    const rows = (embers > 0 || lockedPop > 0 ? 1 : 0) + (mats.length ? 1 : 0);
    const bh = 50 + rows * 62;
    const by = H - bh - 6;
    c.fillStyle = 'rgba(22,30,52,0.82)';
    c.beginPath();
    c.roundRect(10, by, W - 20, bh, 30);
    c.fill();
    c.strokeStyle = lockedPop > 0 ? 'rgba(170,185,210,0.8)' : 'rgba(255,200,120,0.9)';
    c.lineWidth = 5;
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    // The cost is the most legible thing on a pad; the name sits small underneath.
    let y = by + 36;
    if (lockedPop > 0) {
      drawPerson(c, W / 2 - 78, y, 24, '#c9d6ea');
      c.fillStyle = '#c9d6ea';
      c.font = '900 48px system-ui, -apple-system, sans-serif';
      c.fillText(`needs ${lockedPop}`, W / 2 + 22, y + 2);
      y += 60;
    } else if (embers > 0) {
      c.font = '900 64px system-ui, -apple-system, sans-serif';
      const tw = c.measureText(String(embers)).width;
      drawEmber(c, W / 2 - tw / 2 - 26, y, 24);
      c.lineWidth = 8;
      c.strokeStyle = 'rgba(40,16,4,0.85)';
      c.strokeText(String(embers), W / 2 + 14, y + 3);
      c.fillStyle = '#ffd27a';
      c.fillText(String(embers), W / 2 + 14, y + 3);
      y += 60;
    }
    c.fillStyle = '#fff6e6';
    c.font = '800 28px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    c.fillText(title, W / 2, y - 4, W - 44);
    y += 50;
    if (mats.length) {
      const seg = (W - 40) / mats.length;
      mats.forEach(([it, have, need], i) => {
        const cx = 20 + seg * i + seg / 2;
        drawItemChip(c, cx - 56, y, 20, it);
        c.fillStyle = have >= need ? '#9fe39a' : '#ffffff';
        c.font = '900 40px system-ui, -apple-system, sans-serif';
        c.fillText(`${have}/${need}`, cx + 22, y + 2);
      });
    }
    this.tex.needsUpdate = true;
  }
}

// --- pad visual -------------------------------------------------------------

export class PadVisual {
  readonly root = new THREE.Group();
  readonly def: PadDef;
  private fillMat = fillMaterial();
  private rim: THREE.Mesh;
  private label = new PadLabel();
  private labelMesh: THREE.Mesh;
  private icon: THREE.Object3D;
  private shown = 0;
  private wasVisible = false;
  private fillShown = 0;
  private hot = 0;
  private labelT = -1;

  constructor(def: PadDef) {
    this.def = def;
    const g = geos();
    const base = new THREE.Mesh(g.baseGeo, baseMat);
    base.receiveShadow = true;
    this.root.add(base);
    this.rim = new THREE.Mesh(g.rimGeo, rimMat);
    this.rim.castShadow = false;
    this.root.add(this.rim);
    const fill = new THREE.Mesh(g.fillGeo, this.fillMat);
    fill.position.y = 0.095;
    fill.renderOrder = 2;
    this.root.add(fill);
    // Labels are always readable: drawn over roofs and scenery, never depth-tested.
    const lmat = new THREE.MeshBasicMaterial({ map: this.label.tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
    this.labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), lmat);
    this.labelMesh.position.set(0, 1.55, -0.55);
    this.labelMesh.rotation.x = -0.55;
    this.labelMesh.renderOrder = 60;
    this.root.add(this.labelMesh);
    this.icon = makeIcon(def);
    // Small and to the front corner, clear of the cost label.
    this.icon.scale.setScalar(0.75);
    this.icon.position.set(0.5, 0.3, 0.45);
    this.root.add(this.icon);
    this.root.position.set(def.x, 0.02, def.z);
    this.root.visible = false;
    this.root.scale.setScalar(0.001);
  }

  update(sim: Sim, time: number, dt: number, onPad: boolean): void {
    const ps = sim.state.pads[this.def.id];
    const visible = !!ps && ps.visible && !ps.done;
    if (visible && !this.wasVisible) this.shown = 0;
    this.wasVisible = visible;
    const target = visible ? 1 : 0;
    this.shown += (target - this.shown) * Math.min(1, dt * (visible ? 6 : 14));
    if (!visible && this.shown < 0.02) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    // Overshooty pop in.
    const s = visible ? elastic(Math.min(1, this.shown * 1.05)) : this.shown;
    this.root.scale.setScalar(Math.max(0.001, s));
    if (!ps) return;
    const def = this.def;
    const matsTotal = Object.values(def.materials ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    const matsHave = Object.entries(def.materials ?? {}).reduce((a, [k]) => a + Math.min(ps.mats[k as ItemKind] ?? 0, def.materials![k as ItemKind] ?? 0), 0);
    const frac = (ps.paid + matsHave) / Math.max(1, sim.padCost(def.id) + matsTotal); // repeatable pads grow in cost
    this.fillShown += (frac - this.fillShown) * Math.min(1, dt * 10);
    this.hot += ((onPad ? 1 : 0) - this.hot) * Math.min(1, dt * 8);
    const locked = sim.padLocked(def.id);
    this.fillMat.uniforms.uFill.value = this.fillShown;
    this.fillMat.uniforms.uTime.value = time;
    this.fillMat.uniforms.uHot.value = this.hot * 0.6;
    this.fillMat.uniforms.uLocked.value = locked ? 1 : 0;
    this.rim.material = locked ? lockedRimMat : rimMat;
    const rem = sim.padRemaining(def.id);
    const mats: [ItemKind, number, number][] = Object.entries(def.materials ?? {}).map(([k, n]) => [k as ItemKind, Math.min(ps.mats[k as ItemKind] ?? 0, n ?? 0), n ?? 0]);
    // Canvas redraw + texture upload is costly on phones: at most ~10x/s while the number ticks.
    if (time - this.labelT > 0.1) {
      this.labelT = time;
      this.label.draw(def.label, rem.embers, mats, locked ? def.requiresPop ?? 0 : 0, sim.padLevel(def.id));
    }
    // Pulse when the player can afford it right now.
    const affordable = !locked && rem.embers > 0 && sim.state.embers >= rem.embers;
    const pulse = affordable ? 1 + Math.max(0, Math.sin(time * 5)) * 0.08 : 1;
    this.labelMesh.scale.setScalar(pulse);
    if (affordable) this.fillMat.uniforms.uHot.value = Math.max(this.fillMat.uniforms.uHot.value, 0.25 + Math.sin(time * 5) * 0.15);
    this.icon.rotation.y = time * 0.9;
    this.icon.position.y = 0.32 + Math.sin(time * 2.2) * 0.05 + this.hot * 0.15;
    this.labelMesh.position.y = 1.55 + this.hot * 0.15;
  }

  /** Nudge the label sideways so it never clips the screen edge. */
  keepOnScreen(cam: THREE.Camera): void {
    if (!this.root.visible) return;
    _lp.set(this.def.x, 1.6, this.def.z).project(cam);
    const lim = 0.62;
    const over = _lp.x > lim ? _lp.x - lim : _lp.x < -lim ? _lp.x + lim : 0;
    // ~4.8 m of world per half-screen at the default zoom.
    const want = -over * 4.8;
    this.labelMesh.position.x += (want - this.labelMesh.position.x) * 0.25;
  }
}

function elastic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -9 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
}

function makeIcon(def: PadDef): THREE.Object3D {
  const g = new THREE.Group();
  const ic = def.icon;
  let o: THREE.Object3D;
  if ('prop' in ic) {
    o = createProp(ic.prop, { level: ic.level });
    fitTo(o, 0.75);
  } else if ('item' in ic) {
    const d = getItemMesh(ic.item);
    o = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(d.geometry, d.material);
      m.position.y = i * d.stackHeight;
      m.rotation.y = i * 0.4;
      o.add(m);
    }
    fitTo(o, 0.55);
  } else {
    o = createCharacter(ic.character as CharacterRole).root;
    fitTo(o, 0.7);
  }
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  g.add(o);
  void PALETTE;
  return g;
}

/** Uniformly scale an object so its largest dimension is `size`, resting on y=0. */
export function fitTo(o: THREE.Object3D, size: number): void {
  const box = new THREE.Box3().setFromObject(o);
  const dim = box.getSize(new THREE.Vector3());
  const m = Math.max(dim.x, dim.y, dim.z) || 1;
  const s = size / m;
  o.scale.multiplyScalar(s);
  o.position.y -= box.min.y * s;
}
