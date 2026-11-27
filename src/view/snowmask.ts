// Baked "press the snow flat" mask for the ground shader. Built from ALL floors, paths, streams,
// pads and station footprints of every open area (after layout placement), so it scales to any
// number of shapes. R = tight mask with a soft 0.3 m edge (colour), G = the same dilated by more
// than one ground-grid cell (displacement), so the coarse grid never lifts snow over a slab.

import * as THREE from 'three';
import type { GameData } from '../data';

const PX_PER_M = 3;
const SOFT = 0.3;
const MARGIN = 0.3;
/** Ground grid cell is ~2.5 m: dilate the height mask a little further than that. */
const DILATE = 2.8;

export interface MaskShape { x0: number; z0: number; x1: number; z1: number; area: string }

export class SnowMask {
  readonly tex: THREE.DataTexture;
  readonly rect: THREE.Vector4;
  private w: number;
  private h: number;
  private data: Uint8Array;
  private tight: Float32Array;
  private dil: Float32Array;

  constructor(gameData: GameData) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const a of gameData.areas) for (const r of a.rects) {
      x0 = Math.min(x0, r.x0); z0 = Math.min(z0, r.z0); x1 = Math.max(x1, r.x1); z1 = Math.max(z1, r.z1);
    }
    x0 -= 12; z0 -= 12; x1 += 12; z1 += 12;
    this.w = Math.ceil((x1 - x0) * PX_PER_M);
    this.h = Math.ceil((z1 - z0) * PX_PER_M);
    this.rect = new THREE.Vector4(x0, z0, this.w / PX_PER_M, this.h / PX_PER_M);
    this.data = new Uint8Array(this.w * this.h * 4);
    this.tight = new Float32Array(this.w * this.h);
    this.dil = new Float32Array(this.w * this.h);
    this.tex = new THREE.DataTexture(this.data, this.w, this.h, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;
  }

  /** Rebuild from the given shapes (world rects). */
  build(shapes: MaskShape[]): void {
    this.tight.fill(0);
    this.dil.fill(0);
    const ox = this.rect.x;
    const oz = this.rect.y;
    for (const s of shapes) {
      const pad = DILATE + 0.5;
      const i0 = Math.max(0, Math.floor((s.x0 - pad - ox) * PX_PER_M));
      const i1 = Math.min(this.w - 1, Math.ceil((s.x1 + pad - ox) * PX_PER_M));
      const j0 = Math.max(0, Math.floor((s.z0 - pad - oz) * PX_PER_M));
      const j1 = Math.min(this.h - 1, Math.ceil((s.z1 + pad - oz) * PX_PER_M));
      for (let j = j0; j <= j1; j++) {
        const z = oz + (j + 0.5) / PX_PER_M;
        const dz = Math.max(s.z0 - z, 0, z - s.z1);
        for (let i = i0; i <= i1; i++) {
          const x = ox + (i + 0.5) / PX_PER_M;
          const dx = Math.max(s.x0 - x, 0, x - s.x1);
          const d = Math.hypot(dx, dz);
          const k = j * this.w + i;
          const t = 1 - smooth(MARGIN, MARGIN + SOFT, d);
          if (t > this.tight[k]) this.tight[k] = t;
          const g = 1 - smooth(DILATE, DILATE + 0.6, d);
          if (g > this.dil[k]) this.dil[k] = g;
        }
      }
    }
    for (let k = 0; k < this.tight.length; k++) {
      this.data[k * 4] = Math.round(this.tight[k] * 255);
      this.data[k * 4 + 1] = Math.round(this.dil[k] * 255);
      this.data[k * 4 + 3] = 255;
    }
    this.tex.needsUpdate = true;
  }

  /** Height-mask value at a world point (1 = snow fully pressed flat). For tests/debug. */
  flatAt(x: number, z: number): number {
    const i = Math.floor((x - this.rect.x) * PX_PER_M);
    const j = Math.floor((z - this.rect.y) * PX_PER_M);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return 0;
    return this.dil[j * this.w + i];
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
