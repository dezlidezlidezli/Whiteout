// Geometry toolkit: build flat-shaded, vertex-coloured, merged geometry from primitives.
import * as THREE from 'three';

export type V3 = [number, number, number];

/** Deterministic RNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791) ^ Math.imul(seed | 0, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export interface PartOpts {
  /** position */
  p?: V3;
  /** euler rotation (radians, XYZ) */
  r?: V3;
  /** scale */
  s?: V3 | number;
  /** colour for faces pointing up (snow caps, food tops) */
  top?: number;
  /** normal.y threshold for `top` (default 0.6) */
  topY?: number;
  /** colour for faces pointing +Z (faces, fronts) */
  front?: number;
  frontZ?: number;
  /** colour for faces pointing -Z (back of heads etc.), threshold frontZ */
  back?: number;
  /** colour for faces pointing down */
  bottom?: number;
  /** random vertex displacement in metres (coincident vertices move together) */
  jitter?: number;
  seed?: number;
  /** per-face brightness variation (0..0.2) */
  shade?: number;
  /** use the geometry's own per-vertex `color` attribute (linear RGB) instead of `color` */
  vcol?: boolean;
  /** crowd tint mask (1 = takes instanceColor, 0 = keeps its colour) */
  mask?: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();

export class Builder {
  private pos: number[] = [];
  private col: number[] = [];
  private msk: number[] = [];
  private useMask = false;

  /** Add a primitive with a colour. The source geometry is disposed. */
  add(src: THREE.BufferGeometry, color: number, o: PartOpts = {}): this {
    const g = src.index ? src.toNonIndexed() : src;
    if (g !== src) src.dispose();
    const sc = o.s === undefined ? 1 : o.s;
    _s.set(...(typeof sc === 'number' ? ([sc, sc, sc] as V3) : sc));
    _q.setFromEuler(_e.set(...(o.r ?? [0, 0, 0])));
    _v.set(...(o.p ?? [0, 0, 0]));
    _m.compose(_v, _q, _s);
    const pa = g.attributes.position;
    const n = pa.count;
    const p: number[] = new Array(n * 3);
    for (let i = 0; i < n; i++) {
      _a.fromBufferAttribute(pa, i).applyMatrix4(_m);
      p[i * 3] = _a.x; p[i * 3 + 1] = _a.y; p[i * 3 + 2] = _a.z;
    }
    if (o.jitter) {
      const seed = o.seed ?? 1;
      const j = o.jitter;
      for (let i = 0; i < n; i++) {
        const qx = Math.round(p[i * 3] * 1000), qy = Math.round(p[i * 3 + 1] * 1000), qz = Math.round(p[i * 3 + 2] * 1000);
        p[i * 3] += (hash3(qx, qy, qz, seed) - 0.5) * 2 * j;
        p[i * 3 + 1] += (hash3(qx, qy, qz, seed + 17) - 0.5) * 2 * j;
        p[i * 3 + 2] += (hash3(qx, qy, qz, seed + 41) - 0.5) * 2 * j;
      }
    }
    g.dispose();
    const vc = o.vcol && g.attributes.color ? (g.attributes.color.array as ArrayLike<number>) : null;
    const vcs = g.attributes.color ? g.attributes.color.itemSize : 3;
    const base = _c.set(color);
    const topY = o.topY ?? 0.6;
    const shadeR = o.shade ? rng((o.seed ?? 7) * 31 + this.pos.length) : null;
    for (let t = 0; t < n; t += 3) {
      _a.set(p[t * 3 + 3] - p[t * 3], p[t * 3 + 4] - p[t * 3 + 1], p[t * 3 + 5] - p[t * 3 + 2]);
      _b.set(p[t * 3 + 6] - p[t * 3], p[t * 3 + 7] - p[t * 3 + 1], p[t * 3 + 8] - p[t * 3 + 2]);
      _n.crossVectors(_a, _b).normalize();
      _c2.copy(base);
      if (o.top !== undefined && _n.y > topY) _c2.set(o.top);
      else if (o.bottom !== undefined && _n.y < -topY) _c2.set(o.bottom);
      else if (o.front !== undefined && _n.z > (o.frontZ ?? 0.6)) _c2.set(o.front);
      else if (o.back !== undefined && _n.z < -(o.frontZ ?? 0.6)) _c2.set(o.back);
      if (shadeR) _c2.multiplyScalar(1 + (shadeR() - 0.5) * 2 * (o.shade ?? 0));
      for (let k = 0; k < 3; k++) {
        this.pos.push(p[(t + k) * 3], p[(t + k) * 3 + 1], p[(t + k) * 3 + 2]);
        if (vc) {
          const m = shadeR ? _c2.r / Math.max(1e-6, base.r) : 1;
          this.col.push(vc[(t + k) * vcs] * m, vc[(t + k) * vcs + 1] * m, vc[(t + k) * vcs + 2] * m);
        } else this.col.push(_c2.r, _c2.g, _c2.b);
        this.msk.push(o.mask ?? 0);
      }
    }
    if (o.mask !== undefined) this.useMask = true;
    return this;
  }

  /** Append another builder's triangles (keeping their colours), transformed. */
  merge(other: Builder, o: { p?: V3; r?: V3; s?: V3 | number } = {}): this {
    const sc = o.s === undefined ? 1 : o.s;
    _s.set(...(typeof sc === 'number' ? ([sc, sc, sc] as V3) : sc));
    _q.setFromEuler(_e.set(...(o.r ?? [0, 0, 0])));
    _v.set(...(o.p ?? [0, 0, 0]));
    _m.compose(_v, _q, _s);
    for (let i = 0; i < other.pos.length; i += 3) {
      _a.set(other.pos[i], other.pos[i + 1], other.pos[i + 2]).applyMatrix4(_m);
      this.pos.push(_a.x, _a.y, _a.z);
    }
    for (const c of other.col) this.col.push(c);
    for (const m of other.msk) this.msk.push(m);
    if (other.useMask) this.useMask = true;
    return this;
  }

  get triangles(): number { return this.pos.length / 9; }
  get empty(): boolean { return this.pos.length === 0; }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.useMask) g.setAttribute('tintMask', new THREE.Float32BufferAttribute(this.msk, 1));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

// ---------- primitive shapes (all centred on origin unless noted) ----------

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Chamfered box: soft, toy-like edges. */
export function bevel(w: number, h: number, d: number, b = Math.min(w, h, d) * 0.18): THREE.BufferGeometry {
  b = Math.min(b, w / 2.01, h / 2.01, d / 2.01);
  const iw = w / 2 - b, ih = h / 2 - b;
  const s = new THREE.Shape();
  s.moveTo(-iw, -ih); s.lineTo(iw, -ih); s.lineTo(iw, ih); s.lineTo(-iw, ih); s.lineTo(-iw, -ih);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.0001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1,
  });
  g.translate(0, 0, -(d - 2 * b) / 2);
  g.deleteAttribute('uv');
  return g;
}

export const cyl = (rt: number, rb: number, h: number, seg = 8, open = false) =>
  new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg, 1);
export const sphere = (r: number, ws = 8, hs = 6) => new THREE.SphereGeometry(r, ws, hs);
export const ico = (r: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail);
export const dodec = (r: number) => new THREE.DodecahedronGeometry(r, 0);
export const octa = (r: number) => new THREE.OctahedronGeometry(r, 0);
export const torus = (R: number, r: number, rs = 4, ts = 10, arc = Math.PI * 2) =>
  new THREE.TorusGeometry(R, r, rs, ts, arc);
/** Lathe around Y from [radius, y] pairs. */
export const lathe = (pts: [number, number][], seg = 10) =>
  new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

/** Extruded 2D polygon (XY plane) of given depth along Z, centred in Z. */
export function prism(pts: [number, number][], depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  g.deleteAttribute('uv');
  return g;
}

export function triCount(o: THREE.Object3D): number {
  let t = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      const g = m.geometry;
      t += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  return t;
}
