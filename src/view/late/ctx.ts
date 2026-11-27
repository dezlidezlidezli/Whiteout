// Shared context for the late-game presentation modules. The view's internals are reached with
// element access (view['fx']) so the world-presentation files need no API changes.

import * as THREE from 'three';
import type { SfxName, SfxOpts } from '../../audio';
import type { Sim } from '../../sim';
import type { View } from '../view';

export interface LateCtx {
  view: View;
  sim: Sim;
  /** Seconds of presentation time (real time, like the view's clock). */
  time: number;
}

export interface LatePart {
  handle?(e: import('../../sim').SimEvent): void;
  /** Before view.frame (state → objects). */
  frame?(dt: number): void;
  /** Inside the render call, after the view has placed its camera and set its audio. */
  post?(): void;
  /** A different sim was loaded: snap to it. */
  reset?(): void;
  dispose?(): void;
}

export const fxOf = (v: View) => v['fx'];
export const rigOf = (v: View) => v['rig'];
export const worldOf = (v: View) => v['world'];
export const hooksOf = (v: View) => v['hooks'];

/** Positional sfx through the view's own gate + distance falloff. */
export function sfxAt(v: View, name: SfxName, at?: { x: number; z: number }, opts: SfxOpts = {}, gate = 0): void {
  v['sfx'](name, { ...opts }, gate, at);
}

export function smooth(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
export function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}
export function backOut(t: number): number {
  const c1 = 2.2;
  const c3 = c1 + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

/** Point-in-area test from the data's walkable rects. */
export function areaAt(sim: Sim, x: number, z: number): string | null {
  // Later areas first: rects of neighbours overlap at passages.
  const areas = sim.data.areas;
  for (let i = areas.length - 1; i >= 0; i--) {
    for (const r of areas[i].rects) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return areas[i].id;
  }
  return null;
}

/** A soft radial-gradient sprite texture (cached per colour). */
const glowCache = new Map<string, THREE.Texture>();
export function glowTexture(inner = 'rgba(255,240,200,1)', mid = 'rgba(255,170,80,0.45)'): THREE.Texture {
  const key = inner + mid;
  let t = glowCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.35, mid);
  gr.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  glowCache.set(key, t);
  return t;
}

export function glowSprite(scale: number, inner?: string, mid?: string): THREE.Sprite {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(inner, mid), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  }));
  sp.scale.setScalar(scale);
  return sp;
}
