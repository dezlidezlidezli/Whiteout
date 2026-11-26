// Shared prop plumbing: cached layered definitions -> cheap Object3D instances.
import * as THREE from 'three';
import { Builder, cone, cyl, ico, octa, rng, type V3 } from '../geo';
import { mats } from '../materials';
import { PALETTE as P } from '../palette';

export type MatKey = 'std' | 'glow' | 'ice' | 'ember' | 'aurora';

export interface LayerSpec {
  name: string;
  b: Builder;
  /** Prebuilt geometry instead of a builder (e.g. RGBA vertex colours). */
  geo?: THREE.BufferGeometry;
  mat?: MatKey;
  /** Node position: geometry is built relative to it (e.g. flame base, lid hinge). */
  pos?: V3;
  visible?: boolean;
  shadow?: boolean;
}

export interface PropSpec {
  layers: LayerSpec[];
  /** Empty marker nodes (steamPoint, itemAnchor, ...). */
  markers?: Record<string, V3>;
  userData?: Record<string, unknown>;
}

interface PropDef {
  layers: { name: string; geo: THREE.BufferGeometry; mat: MatKey; pos: V3; visible: boolean; shadow: boolean }[];
  markers: Record<string, V3>;
  userData: Record<string, unknown>;
  tris: number;
}

const defs = new Map<string, PropDef>();

export function define(key: string, make: () => PropSpec): PropDef {
  let d = defs.get(key);
  if (!d) {
    const spec = make();
    let tris = 0;
    const layers = spec.layers.filter((l) => l.geo || !l.b.empty).map((l) => {
      const geo = l.geo ?? l.b.build();
      tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      geo.name = `${key}:${l.name}`;
      return {
        name: l.name, geo, mat: l.mat ?? 'std', pos: l.pos ?? ([0, 0, 0] as V3),
        visible: l.visible ?? true, shadow: l.shadow ?? (l.mat !== 'glow' && l.mat !== 'ice' && l.mat !== 'aurora'),
      };
    });
    d = { layers, markers: spec.markers ?? {}, userData: { ...(spec.userData ?? {}), triangles: tris }, tris };
    defs.set(key, d);
  }
  return d;
}

export function instantiate(name: string, d: PropDef): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  const m = mats();
  for (const l of d.layers) {
    const mesh = new THREE.Mesh(l.geo, m[l.mat]);
    mesh.name = l.name;
    mesh.position.set(...l.pos);
    mesh.visible = l.visible;
    mesh.castShadow = l.shadow;
    mesh.receiveShadow = l.mat !== 'glow' && l.mat !== 'aurora';
    if (l.mat === 'aurora') { mesh.frustumCulled = false; mesh.renderOrder = -1; }
    g.add(mesh);
  }
  for (const [k, p] of Object.entries(d.markers)) {
    const o = new THREE.Object3D();
    o.name = k;
    o.position.set(...p);
    g.add(o);
  }
  g.userData = structuredClone(d.userData);
  return g;
}

// ---------------------------------------------------------------- shared bits

/** Stylised flame: yellow core tongue surrounded by orange tongues. Base at y = 0. */
export function flame(b: Builder, h: number, r: number, seed = 1, o: V3 = [0, 0, 0], n = 5): Builder {
  const R = rng(seed);
  b.add(cone(r * 0.55, h, 5), P.flameCore, { p: [o[0], o[1] + h / 2, o[2]], jitter: r * 0.06, seed });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R();
    const th = h * (0.5 + R() * 0.25);
    const d = r * 0.45;
    b.add(cone(r * 0.42, th, 4), i % 2 ? P.flame : P.emberHot, {
      p: [o[0] + Math.cos(a) * d, o[1] + th / 2, o[2] + Math.sin(a) * d],
      r: [Math.sin(a) * 0.35, R() * 2, -Math.cos(a) * 0.35],
    });
  }
  return b;
}

/** Ring of chunky stones. */
export function stoneRing(b: Builder, R: number, n: number, size: number, seed: number, o: V3 = [0, 0, 0], snow = false, colors: number[] = [P.stone, P.stoneWarm, P.stoneDark]) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.2;
    const s = size * (0.8 + r() * 0.4);
    b.add(ico(s, 0), colors[i % colors.length], {
      p: [o[0] + Math.cos(a) * R, o[1] + s * 0.55, o[2] + Math.sin(a) * R],
      s: [1.15, 0.8, 1], r: [0, -a, r()], jitter: s * 0.12, seed: seed + i, shade: 0.06,
      top: snow ? P.snow : undefined, topY: 0.7,
    });
  }
}

/** Small cluster of glowing coals (for the ember layer). */
export function coals(b: Builder, R: number, n: number, seed: number, y = 0.04, o: V3 = [0, 0, 0]) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
    b.add(octa(0.05 + r() * 0.05), i % 3 ? P.emberHot : P.ember, { p: [o[0] + Math.cos(a) * d, o[1] + y, o[2] + Math.sin(a) * d], s: [1, 0.6, 1], r: [r(), r(), r()] });
  }
}

/** A log lying/leaning: from point a to point b. */
export function logBetween(bd: Builder, a: V3, c: V3, rad: number, col: number = P.bark, end: number = P.woodPale, seg = 6) {
  const va = new THREE.Vector3(...a), vc = new THREE.Vector3(...c);
  const len = va.distanceTo(vc);
  const mid = va.clone().add(vc).multiplyScalar(0.5);
  const dir = vc.clone().sub(va).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const e = new THREE.Euler().setFromQuaternion(q);
  bd.add(cyl(rad, rad, len, seg), col, { p: [mid.x, mid.y, mid.z], r: [e.x, e.y, e.z], shade: 0.06, seed: Math.round(len * 100) });
  // end caps (lighter) slightly outside
  for (const [pt, sgn] of [[vc, 1], [va, -1]] as const) {
    const pp = pt.clone().addScaledVector(dir, sgn * 0.005);
    bd.add(cyl(rad * 0.85, rad * 0.85, 0.012, seg), end, { p: [pp.x, pp.y, pp.z], r: [e.x, e.y, e.z] });
  }
}

export const snowMound = (b: Builder, rx: number, h: number, rz: number, p: V3, seed = 1) =>
  b.add(ico(1, 1), P.snow, { p, s: [rx, h, rz], jitter: 0.04, seed, bottom: P.snowShade, topY: 0.2 });
