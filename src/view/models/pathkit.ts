// Path-following models: conveyors, fences, palisade walls, ground strips, lantern strings.
import * as THREE from 'three';
import { Builder, bevel, box, cone, cyl, ico, rng, sphere } from './geo';
import { mats } from './materials';
import { PALETTE as P } from './palette';
import { groundPath, runs, spaced, sweep, type GroundPath, type PathSample, type XZ } from './paths';

const lin = (hex: number) => new THREE.Color(hex);

/** Thin box from A to B. */
export function segment(b: Builder, A: readonly number[], B: readonly number[], t: number, color: number) {
  const va = new THREE.Vector3(A[0], A[1], A[2]), vb = new THREE.Vector3(B[0], B[1], B[2]);
  const len = va.distanceTo(vb);
  if (len < 1e-5) return;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), vb.clone().sub(va).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  b.add(box(t, t, len), color, { p: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2], r: [e.x, e.y, e.z] });
}

function mesh(g: THREE.BufferGeometry, name: string, mat: THREE.Material, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}
function group(name: string, path: GroundPath): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.userData.length = path.length;
  return g;
}

// ---------------------------------------------------------------- conveyor
export interface ConveyorPathOpts { radius?: number; width?: number; height?: number }
export interface ConveyorPath {
  object: THREE.Object3D;
  length: number;
  sample(distance: number): PathSample;
  setOffset(metres: number): void;
}

const SLAT = 0.25;
let beltTex: THREE.DataTexture | null = null;
function beltTexture(): THREE.DataTexture {
  if (beltTex) return beltTex;
  const W = 8, H = 32;
  const data = new Uint8Array(W * H * 4);
  const rubber = [58, 46, 40], slat = [118, 92, 70], edge = [40, 32, 28], seam = [30, 24, 22];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = rubber;
    if (y >= 4 && y < 22) c = slat;
    if (y === 22 || y === 3) c = seam;
    if (x === 0 || x === W - 1) c = edge;
    const i = (y * W + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  beltTex = new THREE.DataTexture(data, W, H);
  beltTex.colorSpace = THREE.SRGBColorSpace;
  beltTex.wrapS = THREE.ClampToEdgeWrapping;
  beltTex.wrapT = THREE.RepeatWrapping;
  beltTex.magFilter = THREE.NearestFilter;
  beltTex.minFilter = THREE.LinearMipmapLinearFilter;
  beltTex.generateMipmaps = true;
  beltTex.needsUpdate = true;
  return beltTex;
}

/** A single continuous conveyor along `points` (rounded corners). Items ride at userData.beltY via sample(). */
export function conveyorPath(points: XZ[], o: ConveyorPathOpts = {}): ConveyorPath {
  const w = o.width ?? 0.7;
  const beltY = o.height ?? 0.65;
  const path = groundPath(points, o.radius ?? 1.2);
  const b = new Builder();
  const hw = w / 2;
  // side rails (with a raised lip), copper trim, under-frame
  for (const s of [-1, 1]) {
    const u0 = s * hw, u1 = s * (hw + 0.09);
    b.add(sweep(path, [[u0, beltY - 0.2], [u1, beltY - 0.2], [u1, beltY + 0.07], [u0, beltY + 0.07]], { closed: true }), P.wood, { shade: 0.03, seed: 2 });
    b.add(sweep(path, [[s * (hw + 0.025), beltY + 0.07], [s * (hw + 0.065), beltY + 0.07], [s * (hw + 0.065), beltY + 0.09], [s * (hw + 0.025), beltY + 0.09]], { closed: true }), P.copper);
  }
  b.add(sweep(path, [[-hw, beltY - 0.17], [hw, beltY - 0.17], [hw, beltY - 0.03], [-hw, beltY - 0.03]], { closed: true }), P.woodDark);
  // legs every ~1.3 m (curves included) with a cross brace and feet
  const legH = beltY - 0.2;
  for (const d of spaced(path.length, 1.3, [], true)) {
    const dd = Math.min(path.length - 0.15, Math.max(0.15, d));
    const p = path.sample(dd);
    const lx = Math.cos(p.yaw), lz = -Math.sin(p.yaw);
    for (const s of [-1, 1]) {
      const u = s * (hw + 0.045);
      b.add(box(0.08, legH, 0.08), P.woodDark, { p: [p.x + lx * u, legH / 2, p.z + lz * u], r: [0, p.yaw, 0] });
      b.add(box(0.14, 0.04, 0.14), P.iron, { p: [p.x + lx * u, 0.02, p.z + lz * u], r: [0, p.yaw, 0] });
    }
    b.add(box(w + 0.1, 0.06, 0.06), P.wood, { p: [p.x, 0.22, p.z], r: [0, p.yaw, 0] });
  }
  // end rollers
  for (const d of [0, path.length]) {
    const p = path.sample(d);
    const fx = Math.sin(p.yaw) * (d === 0 ? -0.02 : 0.02), fz = Math.cos(p.yaw) * (d === 0 ? -0.02 : 0.02);
    b.add(cyl(0.075, 0.075, w + 0.24, 8), P.iron, { p: [p.x + fx, beltY - 0.06, p.z + fz], r: [0, p.yaw, Math.PI / 2] });
    b.add(cyl(0.08, 0.08, 0.04, 8), P.copper, { p: [p.x + fx, beltY - 0.06, p.z + fz], r: [0, p.yaw, Math.PI / 2] });
  }
  // belt surface: textured, scrolling slats (uv.v = distance / slat spacing)
  const beltGeo = sweep(path, [[-hw, beltY], [hw, beltY]], { vScale: SLAT });
  beltGeo.deleteAttribute('color');
  const tex = beltTexture().clone();
  tex.needsUpdate = true;
  const beltMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0 });
  beltMat.name = 'fk-belt';
  const obj = group('conveyorPath', path);
  obj.add(mesh(b.build(), 'frame', mats().std));
  obj.add(mesh(beltGeo, 'belt', beltMat, false));
  obj.userData.beltY = beltY + 0.005;
  obj.userData.width = w;
  obj.userData.radius = o.radius ?? 1.2;
  obj.userData.slatSpacing = SLAT;
  return {
    object: obj,
    length: path.length,
    sample: (d) => path.sample(d),
    setOffset: (m) => { tex.offset.y = -m / SLAT; },
  };
}

// ---------------------------------------------------------------- fence
export interface FencePathOpts { radius?: number; spacing?: number; seed?: number; gaps?: { at: number; width: number }[] }
export function fencePath(points: XZ[], o: FencePathOpts = {}): THREE.Object3D {
  const path = groundPath(points, o.radius ?? 1.5);
  const b = new Builder();
  const r = rng((o.seed ?? 0) + 5);
  for (const d of spaced(path.length, o.spacing ?? 2.0, o.gaps)) {
    const p = path.sample(d);
    b.add(bevel(0.14, 1.1, 0.14, 0.03), P.woodDark, { p: [p.x, 0.55, p.z], r: [0, p.yaw, (r() - 0.5) * 0.06] });
    b.add(box(0.17, 0.08, 0.17), P.snow, { p: [p.x, 1.14, p.z], r: [0, p.yaw, 0] });
  }
  for (const [a, c] of runs(path.length, o.gaps)) {
    for (const [y, col] of [[0.45, P.woodLight], [0.85, P.wood]] as const)
      b.add(sweep(path, [[0.07, y - 0.05], [0.12, y - 0.05], [0.12, y + 0.05], [0.07, y + 0.05]], { closed: true, from: a, to: c }), col, { shade: 0.03, seed: 1 });
    b.add(sweep(path, [[0.065, 0.9], [0.125, 0.9], [0.125, 0.93], [0.065, 0.93]], { closed: true, from: a, to: c }), P.snow);
  }
  const g = group('fencePath', path);
  g.add(mesh(b.build(), 'body', mats().std));
  g.userData.height = 1.15;
  g.userData.thickness = 0.3;
  return g;
}

// ---------------------------------------------------------------- palisade wall
export interface WallPathOpts { radius?: number; height?: number; seed?: number; gaps?: { at: number; width: number }[]; railSide?: 1 | -1; snowSide?: 1 | -1 }
/** Chunky log palisade (~1.6 m) with pointed, snow-capped tops; `gaps` are gateway openings (distance along the path + width). */
export function wallPath(points: XZ[], o: WallPathOpts = {}): THREE.Object3D {
  const path = groundPath(points, o.radius ?? 0.8);
  const H = o.height ?? 1.6;
  const b = new Builder();
  const r = rng((o.seed ?? 0) * 13 + 7);
  const rail = o.railSide ?? -1, snowS = o.snowSide ?? 1;
  const logs = spaced(path.length, 0.3, o.gaps);
  logs.forEach((d, i) => {
    const p = path.sample(d);
    const h = H * (0.9 + r() * 0.18);
    const col = i % 3 === 0 ? P.wood : i % 3 === 1 ? P.bark : 0x7a5434;
    b.add(cyl(0.15, 0.16, h, 6), col, { p: [p.x, h / 2, p.z], r: [0, p.yaw + r(), 0], shade: 0.05, seed: i });
    b.add(cone(0.15, 0.3, 6), col, { p: [p.x, h + 0.15, p.z], r: [0, p.yaw + r(), 0], top: P.snow, topY: 0.35 });
  });
  // binding rails on the inside, snow banked on the outside
  for (const [a, c] of runs(path.length, o.gaps)) {
    for (const y of [0.45, H - 0.45])
      b.add(sweep(path, [[rail * 0.14, y - 0.06], [rail * 0.24, y - 0.06], [rail * 0.24, y + 0.06], [rail * 0.14, y + 0.06]], { closed: true, from: a, to: c }), P.woodDark, { shade: 0.03, seed: 2 });
    const sn = (k: number) => lin([P.snowShade, P.snow, P.snow, P.snowShade][k]);
    b.add(sweep(path, [[snowS * 0.12, 0.42], [snowS * 0.4, 0.32], [snowS * 0.8, 0.12], [snowS * 1.15, 0.0]], { from: a, to: c, color: (k) => sn(k) }), 0xffffff, { vcol: true });
  }
  // stout gate posts either side of every gap, with lantern brackets
  for (const gp of o.gaps ?? []) for (const s of [-1, 1]) {
    const p = path.sample(gp.at + s * (gp.width / 2 + 0.05));
    b.add(cyl(0.22, 0.24, H + 0.6, 7), P.woodDark, { p: [p.x, (H + 0.6) / 2, p.z], r: [0, p.yaw, 0] });
    b.add(cyl(0.26, 0.26, 0.1, 7), P.snow, { p: [p.x, H + 0.65, p.z] });
  }
  const g = group('wallPath', path);
  g.add(mesh(b.build(), 'body', mats().std));
  g.userData.height = H;
  g.userData.thickness = 0.4;
  return g;
}

// ---------------------------------------------------------------- ground strips
export type StripType = 'trampled' | 'planks' | 'cobble' | 'ice';
export interface PathStripOpts { width?: number; type?: StripType; radius?: number; seed?: number }
export function pathStrip(points: XZ[], o: PathStripOpts = {}): THREE.Object3D {
  const w = o.width ?? 1.8, type = o.type ?? 'trampled';
  const path = groundPath(points, o.radius ?? 2.0);
  const b = new Builder();
  const r = rng((o.seed ?? 0) + 3);
  const hw = w / 2;
  if (type === 'trampled') {
    const cols = [P.snow, 0xb9c6da, 0x9fafc8, 0x93a4bf, 0x9fafc8, 0xb9c6da, P.snow];
    const prof: [number, number][] = [[-hw - 0.35, 0.004], [-hw, 0.025], [-hw * 0.4, 0.02], [0, 0.018], [hw * 0.4, 0.02], [hw, 0.025], [hw + 0.35, 0.004]];
    b.add(sweep(path, prof, { color: (k, s) => lin(cols[k]).multiplyScalar(0.97 + 0.06 * Math.sin(s.d * 2.3 + k)) }), 0xffffff, { vcol: true });
  } else if (type === 'planks') {
    for (const s of [-1, 1]) b.add(sweep(path, [[s * hw * 0.6 - 0.06, 0.0], [s * hw * 0.6 + 0.06, 0.0], [s * hw * 0.6 + 0.06, 0.06], [s * hw * 0.6 - 0.06, 0.06]], { closed: true }), P.woodDark);
    const step = 0.27;
    for (let d = step / 2; d < path.length; d += step) {
      const p = path.sample(d);
      const c = [P.woodLight, P.woodPale, P.wood, 0xd2a870][Math.floor(r() * 4)];
      b.add(box(w * (0.96 + r() * 0.08), 0.05, step - 0.035), c, { p: [p.x + (r() - 0.5) * 0.05, 0.085, p.z], r: [0, p.yaw + (r() - 0.5) * 0.04, 0] });
      if (r() > 0.7) b.add(box(0.03, 0.01, 0.03), P.iron, { p: [p.x + Math.cos(p.yaw) * hw * 0.6, 0.112, p.z - Math.sin(p.yaw) * hw * 0.6], r: [0, p.yaw, 0] });
    }
  } else if (type === 'cobble') {
    b.add(sweep(path, [[-hw - 0.1, 0.005], [-hw, 0.02], [hw, 0.02], [hw + 0.1, 0.005]], { color: () => lin(0x6c6560) }), 0xffffff, { vcol: true });
    const step = 0.3, cols = [P.stone, P.stoneWarm, 0x9aa0ab, P.stoneDark, 0xb0a596];
    let row = 0;
    for (let d = step / 2; d < path.length; d += step, row++) {
      const p = path.sample(d);
      const lx = Math.cos(p.yaw), lz = -Math.sin(p.yaw);
      for (let u = -hw + 0.15 + (row % 2) * 0.15; u < hw - 0.1; u += 0.3) {
        b.add(ico(0.15, 0), cols[Math.floor(r() * cols.length)], { p: [p.x + lx * u, 0.03, p.z + lz * u], s: [1, 0.3, 0.95], r: [0, r() * 3, 0], jitter: 0.02, seed: row });
      }
    }
  } else {
    const cols = [P.snow, 0xcfeaf6, P.ice, 0xb5def2, P.ice, 0xcfeaf6, P.snow];
    const prof: [number, number][] = [[-hw - 0.3, 0.004], [-hw, 0.03], [-hw * 0.4, 0.032], [0, 0.034], [hw * 0.4, 0.032], [hw, 0.03], [hw + 0.3, 0.004]];
    b.add(sweep(path, prof, { color: (k, s) => lin(cols[k]).multiplyScalar(0.95 + 0.1 * Math.sin(s.d * 1.7 + k * 2)) }), 0xffffff, { vcol: true });
    for (let d = 0.8; d < path.length; d += 1.3 + r()) {
      const p = path.sample(d);
      b.add(box(0.02, 0.005, 0.5 + r() * 0.6), 0x8fc4e0, { p: [p.x + (r() - 0.5) * hw, 0.037, p.z], r: [0, p.yaw + (r() - 0.5) * 1.5, 0] });
    }
  }
  const g = group('pathStrip', path);
  g.add(mesh(b.build(), 'body', mats().std, type === 'planks'));
  g.userData.width = w;
  g.userData.type = type;
  g.userData.walkable = true;
  g.userData.decor = true;
  return g;
}

// ---------------------------------------------------------------- lantern string
export interface LanternStringPathOpts { radius?: number; spacing?: number; height?: number }
export function lanternStringPath(points: XZ[], o: LanternStringPathOpts = {}): THREE.Object3D {
  const path = groundPath(points, o.radius ?? 1.5);
  const H = o.height ?? 2.6, sag = 0.4;
  const b = new Builder(), glow = new Builder();
  const posts = spaced(path.length, o.spacing ?? 4).map((d) => path.sample(d));
  const lights: [number, number, number][] = [];
  const cols = [P.windowGlow, 0xffb060, 0xffd88a];
  posts.forEach((p, i) => {
    b.add(cyl(0.06, 0.08, H + 0.2, 6), P.woodDark, { p: [p.x, (H + 0.2) / 2, p.z] });
    b.add(bevel(0.24, 0.16, 0.24, 0.03), P.stone, { p: [p.x, 0.08, p.z], r: [0, p.yaw, 0] });
    b.add(box(0.14, 0.07, 0.14), P.snow, { p: [p.x, H + 0.24, p.z] });
    const q = posts[i + 1];
    if (!q) return;
    const n = 8, span = Math.hypot(q.x - p.x, q.z - p.z);
    const at = (t: number) => [p.x + (q.x - p.x) * t, H - sag * 4 * t * (1 - t) * Math.min(1, span / 4), p.z + (q.z - p.z) * t] as const;
    for (let k = 0; k < n; k++) {
      const A = at(k / n), B = at((k + 1) / n);
      segment(b, A, B, 0.02, P.rope);
    }
    for (let k = 0; k < 3; k++) {
      const L = at((k + 1) / 4);
      const y = L[1] - 0.2;
      b.add(box(0.01, 0.12, 0.01), P.iron, { p: [L[0], y + 0.14, L[2]] });
      b.add(cone(0.1, 0.07, 6), P.copper, { p: [L[0], y + 0.11, L[2]] });
      glow.add(sphere(0.1, 6, 4), cols[(i + k) % 3], { p: [L[0], y, L[2]], s: [1, 1.2, 1] });
      lights.push([L[0], y, L[2]]);
    }
  });
  const g = group('lanternStringPath', path);
  g.add(mesh(b.build(), 'body', mats().std));
  g.add(mesh(glow.build(), 'glow', mats().glow, false));
  g.userData.lightPositions = lights;
  g.userData.lightColor = P.windowGlow;
  g.userData.decor = true;
  return g;
}

export { groundPath };
