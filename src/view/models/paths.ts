// Ground paths: polylines with rounded (arc-filleted) corners, arc-length sampling and
// profile sweeping. Everything path-shaped (conveyors, fences, walls, strips) builds on this.
import * as THREE from 'three';

export type XZ = [number, number];
export interface PathSample { x: number; z: number; yaw: number }

type Piece =
  | { kind: 'line'; ax: number; az: number; bx: number; bz: number; len: number; d0: number }
  | { kind: 'arc'; cx: number; cz: number; r: number; a0: number; sign: number; sweep: number; len: number; d0: number };

export interface Station { x: number; z: number; dx: number; dz: number; d: number }

export interface GroundPath {
  /** total arc length in metres */
  length: number;
  /** position + yaw (rotation.y that faces along the path) at a distance along it (clamped) */
  sample(distance: number): PathSample;
  /** dense stations (corners tessellated) for sweeping */
  stations(maxStep?: number): Station[];
  /** true if first and last points coincide */
  closed: boolean;
}

/** Build a path through `points` with corners rounded to `radius` (auto-reduced where segments are short). */
export function groundPath(points: XZ[], radius = 1.0): GroundPath {
  // dedupe + drop collinear points
  const pts: XZ[] = [];
  for (const p of points) {
    const q = pts[pts.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) pts.push([p[0], p[1]]);
  }
  if (pts.length < 2) pts.push([pts[0]?.[0] ?? 0, (pts[0]?.[1] ?? 0) + 0.01]);
  const closed = pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-3;
  const pieces: Piece[] = [];
  let cur: XZ = pts[0];
  let d = 0;
  const pushLine = (b: XZ) => {
    const len = Math.hypot(b[0] - cur[0], b[1] - cur[1]);
    if (len > 1e-5) { pieces.push({ kind: 'line', ax: cur[0], az: cur[1], bx: b[0], bz: b[1], len, d0: d }); d += len; }
    cur = b;
  };
  for (let i = 1; i < pts.length - 1; i++) {
    const P0 = pts[i - 1], P1 = pts[i], P2 = pts[i + 1];
    let ax = P1[0] - P0[0], az = P1[1] - P0[1];
    let bx = P2[0] - P1[0], bz = P2[1] - P1[1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    ax /= la; az /= la; bx /= lb; bz /= lb;
    const cross = ax * bz - az * bx;
    const dot = Math.max(-1, Math.min(1, ax * bx + az * bz));
    const th = Math.acos(dot);
    if (th < 1e-3) continue; // straight through
    const half = Math.tan(th / 2);
    const maxT = Math.min(la * (i === 1 ? 1 : 0.5), lb * (i === pts.length - 2 ? 1 : 0.5)) * 0.999;
    const t = Math.min(radius * half, maxT);
    const r = t / half;
    const S: XZ = [P1[0] - ax * t, P1[1] - az * t];
    const E: XZ = [P1[0] + bx * t, P1[1] + bz * t];
    pushLine(S);
    if (r < 1e-4) { cur = E; continue; }
    const sign = cross > 0 ? 1 : -1;
    const nx = -az * sign, nz = ax * sign; // towards the centre
    const cx = S[0] + nx * r, cz = S[1] + nz * r;
    const a0 = Math.atan2(S[1] - cz, S[0] - cx);
    const len = r * th;
    pieces.push({ kind: 'arc', cx, cz, r, a0, sign, sweep: th, len, d0: d });
    d += len;
    cur = E;
  }
  pushLine(pts[pts.length - 1]);
  const total = d;

  const at = (pc: Piece, t: number): Station => {
    if (pc.kind === 'line') {
      const f = pc.len > 0 ? t / pc.len : 0;
      const dx = (pc.bx - pc.ax) / pc.len, dz = (pc.bz - pc.az) / pc.len;
      return { x: pc.ax + (pc.bx - pc.ax) * f, z: pc.az + (pc.bz - pc.az) * f, dx, dz, d: pc.d0 + t };
    }
    const a = pc.a0 + pc.sign * (t / pc.r);
    return { x: pc.cx + pc.r * Math.cos(a), z: pc.cz + pc.r * Math.sin(a), dx: -Math.sin(a) * pc.sign, dz: Math.cos(a) * pc.sign, d: pc.d0 + t };
  };
  const find = (dist: number): Station => {
    const dd = Math.max(0, Math.min(total, dist));
    let lo = 0, hi = pieces.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pieces[mid].d0 <= dd) lo = mid; else hi = mid - 1; }
    const pc = pieces[lo];
    return at(pc, Math.min(pc.len, dd - pc.d0));
  };
  return {
    length: total,
    closed,
    sample(distance: number): PathSample {
      const s = find(distance);
      return { x: s.x, z: s.z, yaw: Math.atan2(s.dx, s.dz) };
    },
    stations(maxStep = 1e9): Station[] {
      const out: Station[] = [];
      for (const pc of pieces) {
        const n = pc.kind === 'arc'
          ? Math.max(2, Math.min(32, Math.ceil(Math.max(pc.sweep / (Math.PI / 16), pc.len / 0.3))))
          : Math.max(1, Math.ceil(pc.len / maxStep));
        for (let k = out.length ? 1 : 0; k <= n; k++) out.push(at(pc, (pc.len * k) / n));
      }
      return out;
    },
  };
}

export interface SweepOpts {
  /** profile is a closed loop (adds the closing edge and end caps) */
  closed?: boolean;
  /** end caps for closed profiles (default true) */
  caps?: boolean;
  /** per-vertex colour (linear RGB written to `color`): profile index, station */
  color?: (k: number, s: Station) => THREE.Color;
  /** add uv: u = profile index / (n-1), v = distance / vScale */
  vScale?: number;
  /** restrict to [from, to] along the path */
  from?: number;
  to?: number;
}

/** Sweep a cross-section `profile` of [lateral, height] pairs along the path.
 *  Lateral is positive to the path's +X side when travelling along +Z. Returns non-indexed geometry
 *  with outward-facing triangles (winding auto-corrected). */
export function sweep(path: GroundPath, profile: [number, number][], o: SweepOpts = {}): THREE.BufferGeometry {
  let st = path.stations(2.0);
  if (o.from !== undefined || o.to !== undefined) {
    const a = o.from ?? 0, b = o.to ?? path.length;
    const inner = st.filter((s) => s.d > a + 1e-4 && s.d < b - 1e-4);
    const ends = [a, b].map((dd) => { const p = path.sample(dd); return { x: p.x, z: p.z, dx: Math.sin(p.yaw), dz: Math.cos(p.yaw), d: dd }; });
    st = [ends[0], ...inner, ends[1]];
  }
  const P = profile.length;
  const cu = profile.reduce((s, p) => s + p[0], 0) / P, cy = profile.reduce((s, p) => s + p[1], 0) / P;
  const pos: number[] = [], col: number[] = [], uv: number[] = [];
  const v3 = (s: Station, k: number) => {
    const [u, y] = profile[k];
    return [s.x + s.dz * u, y, s.z - s.dx * u] as const;
  };
  const tmpC = new THREE.Color();
  const pushV = (s: Station, k: number) => {
    const p = v3(s, k);
    pos.push(p[0], p[1], p[2]);
    if (o.color) { const c = o.color(k, s); col.push(c.r, c.g, c.b); } else col.push(1, 1, 1);
    if (o.vScale) uv.push(P > 1 ? k / (P - 1) : 0, s.d / o.vScale);
  };
  const tri = (a: [Station, number], b: [Station, number], c: [Station, number], out: [number, number, number]) => {
    const A = v3(a[0], a[1]), B = v3(b[0], b[1]), C = v3(c[0], c[1]);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const flip = nx * out[0] + ny * out[1] + nz * out[2] < 0;
    if (flip) { pushV(...a); pushV(...c); pushV(...b); } else { pushV(...a); pushV(...b); pushV(...c); }
  };
  const edges = o.closed ? P : P - 1;
  for (let i = 0; i < st.length - 1; i++) {
    const s0 = st[i], s1 = st[i + 1];
    for (let k = 0; k < edges; k++) {
      const k1 = (k + 1) % P;
      // outward: open strips face up; closed profiles face away from the centroid
      let out: [number, number, number];
      if (!o.closed) out = [0, 1, 0];
      else {
        const mu = (profile[k][0] + profile[k1][0]) / 2 - cu, my = (profile[k][1] + profile[k1][1]) / 2 - cy;
        out = [s0.dz * mu, my, -s0.dx * mu];
      }
      tri([s0, k], [s1, k], [s1, k1], out);
      tri([s0, k], [s1, k1], [s0, k1], out);
    }
  }
  if (o.closed && (o.caps ?? true) && P >= 3) {
    for (const [s, sgn] of [[st[0], -1], [st[st.length - 1], 1]] as const) {
      for (let k = 1; k < P - 1; k++) tri([s, 0], [s, k], [s, k + 1], [s.dx * sgn, 0, s.dz * sgn]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (o.vScale) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Evenly spaced distances along a path (inclusive of both ends), skipping gaps. */
export function spaced(length: number, step: number, gaps: { at: number; width: number }[] = [], ends = true): number[] {
  const n = Math.max(1, Math.round(length / step));
  const out: number[] = [];
  for (let i = ends ? 0 : 1; i <= (ends ? n : n - 1); i++) {
    const d = (i / n) * length;
    if (!gaps.some((g) => Math.abs(d - g.at) < g.width / 2)) out.push(d);
  }
  return out;
}

/** Split [0, length] into runs that avoid the gaps. */
export function runs(length: number, gaps: { at: number; width: number }[] = []): [number, number][] {
  const cuts = gaps.map((g) => [Math.max(0, g.at - g.width / 2), Math.min(length, g.at + g.width / 2)] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let s = 0;
  for (const [a, b] of cuts) { if (a > s + 0.05) out.push([s, a]); s = Math.max(s, b); }
  if (length > s + 0.05) out.push([s, length]);
  return out;
}
