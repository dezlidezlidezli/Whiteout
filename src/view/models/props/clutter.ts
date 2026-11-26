// Yard clutter & density kit: small, specific, cosy props (3+ seed variants each).
import { Builder, bevel, box, cone, cyl, dodec, ico, lathe, octa, prism, rng, sphere, torus } from '../geo';
import { PALETTE as P } from '../palette';
import { fishBody } from '../items';
import { groundPath, sweep } from '../paths';
import * as THREE from 'three';
import { logBetween, snowMound, type PropSpec } from './common';

const pick = <T,>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length)];
const WOODS = [P.wood, P.woodLight, 0xb98a58, P.woodPale] as const;
const ACCENTS = [P.coatRust, P.porter, P.mustard, P.cook, P.lumberjack, P.villager] as const;

function crateAt(b: Builder, x: number, y: number, z: number, s: number, ry: number, c: number, snow = true) {
  const c2 = new Builder();
  c2.add(box(s - 0.05, s - 0.05, s - 0.05), P.woodDark, { p: [0, s / 2, 0] });
  for (let k = 0; k < 3; k++) {
    c2.add(box(s, s * 0.27, s + 0.01), k % 2 ? c : P.woodLight, { p: [0, s * (0.18 + k * 0.32), 0], shade: 0.05, seed: k });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c2.add(box(0.06, s, 0.06), P.woodDark, { p: [sx * (s / 2 - 0.01), s / 2, sz * (s / 2 - 0.01)] });
  c2.add(box(s - 0.02, 0.04, s - 0.02), P.woodPale, { p: [0, s, 0] });
  if (snow) c2.add(sphere(s * 0.25, 6, 3), P.snow, { p: [s * 0.12, s + 0.02, -s * 0.1], s: [1.3, 0.3, 1] });
  b.merge(c2, { p: [x, y, z], r: [0, ry, 0] });
}
function barrelAt(b: Builder, x: number, y: number, z: number, s: number, rot: [number, number, number] = [0, 0, 0], c: number = P.wood) {
  const bb = new Builder();
  bb.add(lathe([[0, 0], [0.26, 0], [0.31, 0.2], [0.32, 0.36], [0.29, 0.58], [0.25, 0.72], [0, 0.72]], 9), c, { shade: 0.05, seed: 3, top: 0xc49a6a, topY: 0.95 });
  for (const yy of [0.1, 0.36, 0.62]) bb.add(cyl(0.325 - Math.abs(yy - 0.36) * 0.2, 0.325 - Math.abs(yy - 0.36) * 0.2, 0.04, 9, true), P.iron, { p: [0, yy, 0] });
  b.merge(bb, { p: [x, y, z], r: rot, s });
}

// ---------------------------------------------------------------- stacks & piles
export function crateStack(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed * 11 + 1);
  const v = seed % 3;
  crateAt(b, 0, 0, 0, 0.75, r() * 0.3, pick(r, WOODS), v === 0);
  crateAt(b, 0.82, 0, 0.1, 0.65, -0.2 + r() * 0.3, pick(r, WOODS));
  if (v >= 1) crateAt(b, 0.05, 0.75, 0.02, 0.6, 0.3 + r() * 0.3, pick(r, WOODS));
  if (v === 2) { crateAt(b, -0.7, 0, -0.15, 0.55, 0.5, pick(r, WOODS)); crateAt(b, 0.8, 0.65, 0.12, 0.45, 0.8, pick(r, WOODS)); }
  // a canvas tarp over one corner + rope
  b.add(bevel(0.6, 0.04, 0.5, 0.015), P.canvasDark, { p: [0.0, v >= 1 ? 1.37 : 0.78, 0.05], r: [0.1, 0.4, 0.06] });
  return { layers: [{ name: 'body', b }], userData: { radius: v === 2 ? 1.1 : 0.85 } };
}

export function barrelCluster(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed * 5 + 2);
  const v = seed % 3;
  barrelAt(b, 0, 0, 0, 1, [0, r(), 0]);
  barrelAt(b, 0.62, 0, 0.2, 0.9, [0, r(), 0], 0x8a5a34);
  if (v >= 1) barrelAt(b, 0.25, 0, -0.55, 0.85, [0, r(), 0]);
  if (v === 2) barrelAt(b, -0.75, 0.3, 0.15, 0.9, [Math.PI / 2, 0.4, 0], 0x8a5a34); // tipped on its side
  if (v !== 2) b.add(sphere(0.22, 6, 3), P.snow, { p: [0, 0.74, 0], s: [1, 0.3, 1] });
  b.add(cyl(0.2, 0.2, 0.04, 8), P.woodPale, { p: [0.62, 0.66, 0.2] }); // a lid with a mug on it
  b.add(cyl(0.05, 0.045, 0.1, 7), P.copper, { p: [0.62, 0.73, 0.2] });
  return { layers: [{ name: 'body', b }], userData: { radius: v === 2 ? 1.0 : 0.75 } };
}

export function sackPile(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed * 3 + 7);
  const n = 3 + (seed % 3) * 1 + 1;
  const cols = [P.canvas, P.canvasDark, 0xcdb88e, 0xbfa47a];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r(), d = i === n - 1 ? 0 : 0.35;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = i === n - 1 ? 0.35 : 0;
    const c = pick(r, cols);
    b.add(sphere(0.28, 7, 5), c, { p: [x, y + 0.24, z], s: [1, 0.85, 0.8], r: [0, a, (r() - 0.5) * 0.3], jitter: 0.03, seed: i, shade: 0.05 });
    b.add(cone(0.1, 0.16, 5), c, { p: [x, y + 0.5, z] });
    b.add(cyl(0.06, 0.06, 0.03, 5), P.rope, { p: [x, y + 0.46, z] });
    if (r() > 0.5) b.add(prism([[0, 0.06], [0.05, 0], [0, -0.06], [-0.05, 0]], 0.01), pick(r, ACCENTS), { p: [x + Math.cos(a) * 0.22, y + 0.25, z + Math.sin(a) * 0.22], r: [0, Math.PI / 2 - a, 0] });
  }
  if (seed % 3 === 1) for (let i = 0; i < 5; i++) b.add(sphere(0.06, 5, 4), 0xc89a5a, { p: [0.5 + r() * 0.2, 0.06, 0.3 + r() * 0.2] }); // spilled potatoes
  return { layers: [{ name: 'body', b }], userData: { radius: 0.7 } };
}

export function firewoodRack(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 9);
  const W = 1.8 + (seed % 3) * 0.4, H = 1.3;
  for (const sx of [-1, 1]) {
    b.add(box(0.1, H + 0.3, 0.1), P.woodDark, { p: [sx * W / 2, (H + 0.3) / 2, -0.3] });
    b.add(box(0.1, H, 0.1), P.woodDark, { p: [sx * W / 2, H / 2, 0.3] });
  }
  b.add(box(W + 0.2, 0.06, 0.7), P.woodDark, { p: [0, 0.08, 0] });
  const rows = seed % 3 === 2 ? 3 : 4;
  for (let row = 0; row < rows; row++) {
    const nLogs = Math.floor(W / 0.24);
    for (let i = 0; i < nLogs; i++) {
      const x = -W / 2 + 0.17 + i * 0.24 + (row % 2) * 0.1;
      if (x > W / 2 - 0.1) continue;
      b.add(cyl(0.11, 0.11, 0.62, 6), pick(r, [P.bark, 0x6e4a2e, P.wood]), { p: [x, 0.22 + row * 0.22, 0], r: [Math.PI / 2, 0, 0], top: P.woodPale, bottom: P.woodPale, topY: 2 });
      b.add(cyl(0.09, 0.09, 0.63, 6), P.woodPale, { p: [x, 0.22 + row * 0.22, 0], r: [Math.PI / 2, 0, 0], s: [1, 1.001, 1] });
    }
  }
  // lean-to roof with snow
  b.add(bevel(W + 0.5, 0.06, 1.0, 0.02), P.bark, { p: [0, H + 0.2, 0], r: [0.25, 0, 0] });
  b.add(bevel(W + 0.4, 0.08, 0.92, 0.03), P.snow, { p: [0, H + 0.27, -0.02], r: [0.25, 0, 0] });
  return { layers: [{ name: 'body', b }], userData: { size: [W + 0.4, 0.9], radius: W / 2 + 0.2 } };
}

export function dryingRack(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 4);
  const W = 2.2;
  for (const sx of [-1, 1]) {
    b.add(cyl(0.04, 0.05, 1.9, 5), P.woodDark, { p: [sx * W / 2, 0.9, 0.18], r: [0.2, 0, 0] });
    b.add(cyl(0.04, 0.05, 1.9, 5), P.woodDark, { p: [sx * W / 2, 0.9, -0.18], r: [-0.2, 0, 0] });
  }
  b.add(cyl(0.035, 0.035, W + 0.3, 6), P.woodLight, { p: [0, 1.75, 0], r: [0, 0, Math.PI / 2] });
  const n = 4 + (seed % 3);
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.3 + (i * (W - 0.6)) / (n - 1);
    const smoked = seed % 2 === 1 ? i % 2 === 0 : i % 3 === 0;
    const fb = new Builder();
    fishBody(fb, smoked ? P.smoked : P.fish, smoked ? P.smokedDark : P.fishDark, smoked ? 0xd89a4a : P.fishBelly, smoked ? P.smokedDark : P.fishDark, { y: 0, lod: true });
    b.merge(fb, { p: [x, 1.4 + r() * 0.05, 0], r: [Math.PI / 2, r() * 0.6, Math.PI / 2], s: 0.95 });
    b.add(box(0.01, 0.15, 0.01), P.rope, { p: [x, 1.66, 0] });
  }
  b.add(box(W + 0.2, 0.04, 0.12), P.snow, { p: [0, 1.8, 0], s: [0.6, 1, 1] });
  snowMound(b, 0.6, 0.12, 0.4, [0.3, 0, 0.3], seed);
  return { layers: [{ name: 'body', b }], userData: { size: [W + 0.3, 0.8], radius: 1.2 } };
}

export function supplySled(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 12);
  for (const sx of [-1, 1]) {
    b.add(box(0.05, 0.05, 1.5), P.copperDark, { p: [sx * 0.35, 0.03, 0] });
    b.add(torus(0.13, 0.025, 3, 6, Math.PI / 2), P.copperDark, { p: [sx * 0.35, 0.16, 0.75], r: [0, Math.PI / 2, 0] });
    for (const z of [-0.5, 0.0, 0.5]) b.add(box(0.05, 0.16, 0.05), P.woodDark, { p: [sx * 0.35, 0.12, z] });
  }
  b.add(bevel(0.85, 0.06, 1.4, 0.02), P.woodLight, { p: [0, 0.22, 0] });
  const v = seed % 3;
  if (v === 0) { crateAt(b, 0, 0.25, -0.3, 0.5, 0.1, P.wood, false); b.add(sphere(0.25, 7, 5), P.canvas, { p: [0.05, 0.42, 0.3], s: [1.2, 0.7, 0.9], jitter: 0.02, seed }); }
  else if (v === 1) { barrelAt(b, 0, 0.25, -0.25, 0.75); for (let i = 0; i < 3; i++) logBetween(b, [-0.3 + i * 0.25, 0.33, 0.1], [-0.3 + i * 0.25, 0.33, 0.6], 0.09, P.bark, P.woodPale, 5); }
  else { for (let i = 0; i < 3; i++) b.add(sphere(0.2, 6, 4), pick(r, [P.canvas, P.canvasDark]), { p: [-0.18 + (i % 2) * 0.36, 0.38 + (i === 2 ? 0.25 : 0), -0.2 + i * 0.25], s: [1, 0.8, 1.1] }); }
  b.add(box(0.9, 0.025, 0.03), P.rope, { p: [0, 0.6, 0] });
  b.add(cyl(0.012, 0.012, 0.8, 4), P.rope, { p: [0, 0.2, 1.05], r: [Math.PI / 2 - 0.25, 0, 0] });
  return { layers: [{ name: 'body', b }], userData: { size: [0.9, 1.7], radius: 0.85 } };
}

export function toolRack(seed = 0): PropSpec {
  const b = new Builder();
  const W = 1.6;
  for (const sx of [-1, 1]) b.add(bevel(0.1, 1.6, 0.1, 0.02), P.woodDark, { p: [sx * W / 2, 0.8, 0] });
  for (const y of [0.35, 1.35]) b.add(box(W + 0.15, 0.08, 0.08), P.wood, { p: [0, y, 0] });
  b.add(box(W + 0.25, 0.06, 0.2), P.snow, { p: [0, 1.62, 0] });
  b.add(bevel(W + 0.35, 0.05, 0.3, 0.015), P.bark, { p: [0, 1.6, 0] });
  const tools: ((t: Builder) => void)[] = [
    (t) => { t.add(cyl(0.02, 0.025, 1.15, 5), P.woodLight, { p: [0, 0.7, 0.08] }); t.add(prism([[0, -0.06], [0.16, -0.11], [0.18, 0.11], [0, 0.06]], 0.03), P.steel, { p: [0, 1.2, 0.08], r: [0, -Math.PI / 2, 0] }); }, // axe
    (t) => { t.add(cyl(0.02, 0.025, 1.2, 5), P.woodLight, { p: [0, 0.72, 0.08] }); t.add(bevel(0.24, 0.3, 0.03, 0.01), P.iron, { p: [0, 0.18, 0.1] }); }, // shovel
    (t) => { t.add(cyl(0.02, 0.025, 1.1, 5), P.woodLight, { p: [0, 0.68, 0.08] }); t.add(cone(0.03, 0.3, 4), P.steel, { p: [0.15, 1.2, 0.08], r: [0, 0, -Math.PI / 2] }); t.add(cone(0.03, 0.3, 4), P.steel, { p: [-0.15, 1.2, 0.08], r: [0, 0, Math.PI / 2] }); }, // pick
    (t) => { t.add(box(0.5, 0.12, 0.01), P.steel, { p: [0, 0.95, 0.07] }); t.add(bevel(0.12, 0.14, 0.04, 0.01), P.woodLight, { p: [0.3, 0.95, 0.07] }); }, // saw
    (t) => { t.add(cyl(0.02, 0.025, 1.2, 5), P.woodLight, { p: [0, 0.72, 0.08] }); for (let k = -2; k <= 2; k++) t.add(box(0.015, 0.14, 0.015), P.iron, { p: [k * 0.045, 0.1, 0.09] }); t.add(box(0.22, 0.03, 0.03), P.iron, { p: [0, 0.18, 0.09] }); }, // rake
  ];
  const order = [0, 1, 2, 3, 4].map((i) => (i + seed) % 5).slice(0, 4);
  order.forEach((ti, i) => {
    const t = new Builder();
    tools[ti](t);
    b.merge(t, { p: [-W / 2 + 0.3 + i * ((W - 0.6) / 3), 0, 0], r: [0, 0, (i % 2 ? 0.05 : -0.05)] });
  });
  return { layers: [{ name: 'body', b }], userData: { size: [W + 0.3, 0.4], radius: 0.9 } };
}

export function washTub(seed = 0): PropSpec {
  const b = new Builder();
  b.add(lathe([[0, 0], [0.42, 0], [0.5, 0.35], [0.52, 0.42], [0.46, 0.42], [0.4, 0.1], [0, 0.1]], 10), P.wood, { shade: 0.05, seed: 2 });
  for (const y of [0.1, 0.32]) b.add(cyl(0.47 + y * 0.12, 0.47 + y * 0.12, 0.04, 10, true), P.iron, { p: [0, y, 0] });
  b.add(cyl(0.45, 0.45, 0.02, 10), 0x7fb4d4, { p: [0, 0.34, 0] });
  for (let i = 0; i < 4; i++) b.add(sphere(0.05, 5, 3), 0xf4fbff, { p: [-0.15 + i * 0.1, 0.36, 0.1 * (i % 2)] });
  // washboard and a stool
  b.add(bevel(0.35, 0.55, 0.04, 0.015), P.woodLight, { p: [0.3, 0.45, -0.25], r: [-0.3, 0.4, 0] });
  for (let k = 0; k < 5; k++) b.add(box(0.28, 0.02, 0.02), P.steel, { p: [0.3, 0.32 + k * 0.07, -0.21 + k * 0.02], r: [-0.3, 0.4, 0] });
  b.add(cyl(0.18, 0.18, 0.05, 7), P.woodLight, { p: [-0.7, 0.35, 0.1] });
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.add(box(0.04, 0.34, 0.04), P.woodDark, { p: [-0.7 + Math.cos(a) * 0.12, 0.17, 0.1 + Math.sin(a) * 0.12] }); }
  if (seed % 3 !== 0) b.add(bevel(0.4, 0.05, 0.3, 0.015), pick(rng(seed), ACCENTS), { p: [-0.7, 0.4, 0.1], r: [0, 0.4, 0] }); // folded laundry
  if (seed % 3 === 2) b.add(lathe([[0, 0], [0.12, 0], [0.15, 0.22], [0.14, 0.24]], 8), P.woodLight, { p: [0.55, 0, 0.45] });
  return { layers: [{ name: 'body', b }], userData: { radius: 0.8 } };
}

export function basketPile(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 21);
  const fills = [[P.berry, 0xa82a3a], [0xc89a5a, 0xb08048], [0x7a5a34, 0x5e4228], [P.herb, 0x4f8a3a]];
  const n = 3 + (seed % 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r(), d = 0.35;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const s = 0.8 + r() * 0.35;
    b.add(lathe([[0, 0], [0.18, 0], [0.24, 0.1], [0.26, 0.24], [0.23, 0.24], [0, 0.2]], 8), 0xc8a060, { p: [x, 0, z], s, shade: 0.06, seed: i });
    b.add(cyl(0.265 * s, 0.265 * s, 0.03, 8, true), 0x9a7440, { p: [x, 0.12 * s, z] });
    const [c1, c2] = fills[(i + seed) % fills.length];
    for (let k = 0; k < 5; k++) b.add(sphere(0.06 * s, 5, 4), k % 2 ? c1 : c2, { p: [x + (r() - 0.5) * 0.25 * s, 0.24 * s, z + (r() - 0.5) * 0.25 * s] });
  }
  b.add(torus(0.18, 0.025, 3, 8, Math.PI), 0x9a7440, { p: [0, 0.32, 0], r: [0, 0.5, 0] });
  return { layers: [{ name: 'body', b }], userData: { radius: 0.65, decor: true } };
}

export function potShelf(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 33);
  const W = 1.5, H = 1.5;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(box(0.07, H, 0.07), P.woodDark, { p: [sx * W / 2, H / 2, sz * 0.18] });
  for (const y of [0.4, 0.9, 1.4]) b.add(box(W + 0.1, 0.05, 0.45), P.woodLight, { p: [0, y, 0] });
  b.add(box(W + 0.12, 0.06, 0.4), P.snow, { p: [0, 1.45, 0] });
  // pots, pans, bowls and jars
  let x = -W / 2 + 0.25;
  while (x < W / 2 - 0.15) {
    const k = Math.floor(r() * 3);
    if (k === 0) b.add(lathe([[0, 0], [0.12, 0], [0.15, 0.14], [0.13, 0.2]], 8), r() > 0.5 ? P.copper : P.iron, { p: [x, 0.425, 0], top: P.copperLight, topY: 0.95 });
    else if (k === 1) for (let j = 0; j < 3; j++) b.add(lathe([[0, 0], [0.09, 0], [0.13, 0.06], [0, 0.06]], 7), P.bowl, { p: [x, 0.425 + j * 0.05, 0] });
    else b.add(cyl(0.07, 0.08, 0.2, 7), pick(r, [0x8fa86a, 0xc8806a, 0xd8c09a]), { p: [x, 0.525, 0], top: P.woodDark, topY: 0.9 });
    x += 0.3;
  }
  for (let i = 0; i < 4; i++) b.add(lathe([[0, 0], [0.1 + r() * 0.04, 0], [0.13, 0.12], [0.11, 0.16]], 8), i % 2 ? P.copper : P.iron, { p: [-0.5 + i * 0.33, 0.925, 0] });
  // ladles hanging from the top shelf front
  for (let i = 0; i < 3; i++) {
    b.add(box(0.02, 0.3, 0.015), P.woodDark, { p: [-0.4 + i * 0.4, 1.22, 0.24] });
    b.add(sphere(0.05, 6, 3), P.copper, { p: [-0.4 + i * 0.4, 1.06, 0.24], s: [1, 0.6, 1] });
  }
  return { layers: [{ name: 'body', b }], userData: { size: [W + 0.1, 0.5], radius: 0.8 } };
}

export function signBoard(seed = 0): PropSpec {
  const b = new Builder();
  const c = ACCENTS[seed % ACCENTS.length];
  for (const sx of [-1, 1]) b.add(cyl(0.05, 0.06, 1.5, 6), P.woodDark, { p: [sx * 0.5, 0.75, 0] });
  b.add(bevel(1.2, 0.6, 0.07, 0.03), P.woodDark, { p: [0, 1.15, 0] });
  b.add(bevel(1.08, 0.48, 0.08, 0.02), c, { p: [0, 1.15, 0.0] });
  b.add(bevel(0.9, 0.3, 0.085, 0.015), P.cream, { p: [0, 1.15, 0.0] });
  b.add(box(1.24, 0.06, 0.1), P.snow, { p: [0, 1.48, 0] });
  b.add(prism([[0, 0.07], [0.05, 0], [0, -0.07], [-0.05, 0]], 0.09), c, { p: [-0.36, 1.15, 0] });
  return { layers: [{ name: 'body', b }], markers: { signFace: [0, 1.15, 0.05] }, userData: { radius: 0.6, decor: true } };
}

export function rugMat(seed = 0): PropSpec {
  const b = new Builder();
  const c1 = ACCENTS[seed % ACCENTS.length], c2 = ACCENTS[(seed + 2) % ACCENTS.length];
  const W = 1.8, D = 1.2;
  b.add(box(W, 0.02, D), c1, { p: [0, 0.012, 0] });
  b.add(box(W - 0.2, 0.022, D - 0.2), P.cream, { p: [0, 0.014, 0] });
  b.add(box(W - 0.36, 0.024, D - 0.36), c2, { p: [0, 0.016, 0] });
  for (let i = 0; i < 3; i++) b.add(prism([[0, 0.15], [0.12, 0], [0, -0.15], [-0.12, 0]], 0.01), P.cream, { p: [-0.45 + i * 0.45, 0.03, 0], r: [-Math.PI / 2, 0, 0] });
  for (const sx of [-1, 1]) for (let k = 0; k < 8; k++) b.add(box(0.06, 0.008, 0.02), P.cream, { p: [sx * (W / 2 + 0.03), 0.006, -D / 2 + 0.1 + k * ((D - 0.2) / 7)] });
  return { layers: [{ name: 'body', b }], userData: { size: [W, D], walkable: true, decor: true } };
}

// ---------------------------------------------------------------- landscape
/** Long ploughed snow bank along X (4 m, tiles end to end). */
export function snowBank(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 41);
  const path = groundPath([[-2.1, 0], [2.1, 0]], 0.1);
  const h = 0.55 + r() * 0.2;
  const cols = [P.snowShade, P.snow, P.snow, P.snow, P.snowShade];
  const prof: [number, number][] = [[-0.9, 0], [-0.45, h * 0.7], [0, h], [0.4, h * 0.75], [0.85, 0]];
  const geo = sweep(path, prof, { color: (k, s) => new THREE.Color(cols[k]).multiplyScalar(0.97 + 0.05 * Math.sin(s.d * 3 + k)) });
  b.add(geo, 0xffffff, { vcol: true, jitter: 0.06, seed });
  for (let i = 0; i < 5; i++) b.add(ico(0.18 + r() * 0.12, 0), P.snow, { p: [-1.8 + i * 0.9 + r() * 0.3, h * 0.6 + r() * 0.2, (r() - 0.5) * 0.6], s: [1.3, 0.6, 1], jitter: 0.03, seed: i, bottom: P.snowShade, topY: 0.3 });
  if (seed % 2) b.add(cyl(0.015, 0.02, 0.7, 4), P.bark, { p: [1.2, h, 0.2], r: [0.3, 0, -0.4] });
  return { layers: [{ name: 'body', b }], userData: { size: [4.2, 1.8], width: 4, tileWidth: 4, height: h, decor: true } };
}

export function bush(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 5);
  const n = 3 + (seed % 3);
  const greens = [P.pineDark, P.pine, 0x3d6a48, 0x5a7a4a];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r(), d = i === 0 ? 0 : 0.3 + r() * 0.15;
    const s = 0.35 + r() * 0.2;
    b.add(ico(s, 1), pick(r, greens), { p: [Math.cos(a) * d, s * 0.8, Math.sin(a) * d], s: [1, 0.8, 1], jitter: s * 0.15, seed: seed * 7 + i, top: P.snow, topY: 0.55, shade: 0.06 });
  }
  if (seed % 3 !== 2) for (let i = 0; i < 6; i++) b.add(sphere(0.035, 4, 3), P.berry, { p: [(r() - 0.5) * 0.8, 0.3 + r() * 0.35, (r() - 0.5) * 0.8] });
  return { layers: [{ name: 'body', b }], userData: { radius: 0.6, decor: true } };
}

export function sapling(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 8);
  if (seed % 3 === 2) {
    // bare birch with forked twigs
    b.add(cyl(0.04, 0.06, 1.8, 5), 0xe8e4dc, { p: [0, 0.9, 0], shade: 0.05, seed });
    for (let i = 0; i < 4; i++) b.add(box(0.04, 0.012, 0.04), 0x3a3030, { p: [0.05, 0.4 + i * 0.35, 0.0], r: [0, i, 0] });
    for (let i = 0; i < 5; i++) {
      const a = r() * 6.28, y = 1.0 + r() * 0.7;
      b.add(cyl(0.012, 0.02, 0.6, 4), 0x6a4a3a, { p: [Math.cos(a) * 0.2, y + 0.15, Math.sin(a) * 0.2], r: [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8] });
    }
  } else {
    b.add(cyl(0.04, 0.06, 0.5, 5), P.bark, { p: [0, 0.25, 0] });
    const tiers = 2 + (seed % 2);
    for (let i = 0; i < tiers; i++) {
      const rad = 0.55 - i * 0.15, th = 0.7 - i * 0.1, y = 0.35 + i * 0.42;
      b.add(cone(rad, th, 7), i % 2 ? P.pine : P.pineLight, { p: [0, y + th / 2, 0], jitter: 0.03, seed: seed + i, bottom: P.pineDark, topY: 0.3 });
      b.add(cone(rad * 0.55, th * 0.55, 7), P.snow, { p: [0, y + th - th * 0.27 + 0.02, 0], bottom: P.snowShade });
    }
  }
  snowMound(b, 0.35, 0.08, 0.35, [0, 0, 0], seed);
  return { layers: [{ name: 'body', b }], userData: { radius: 0.3, decor: true } };
}

export function fallenLog(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 15);
  const L = 2.6 + (seed % 3) * 0.6;
  logBetween(b, [-L / 2, 0.24, 0], [L / 2, 0.22, 0.1], 0.24, P.bark, P.woodPale, 8);
  for (let i = 0; i < 3; i++) b.add(cone(0.06, 0.4, 4), P.bark, { p: [-L / 3 + i * (L / 3), 0.45, (r() - 0.5) * 0.2], r: [(r() - 0.5) * 0.8, 0, (r() - 0.5) * 1.2] });
  b.add(box(L * 0.8, 0.08, 0.26), P.snow, { p: [0, 0.47, 0.04], jitter: 0.02, seed });
  b.add(box(L * 0.4, 0.03, 0.3), 0x5a7a3a, { p: [L * 0.15, 0.3, 0.2], r: [0.9, 0, 0] }); // moss
  for (let i = 0; i < 2 + (seed % 2); i++) {
    const x = -L / 3 + r() * L * 0.6;
    b.add(cyl(0.015, 0.02, 0.08, 4), P.cream, { p: [x, 0.06, 0.3] });
    b.add(sphere(0.05, 6, 3), seed % 2 ? P.berry : 0xc8803a, { p: [x, 0.11, 0.3], s: [1, 0.55, 1] });
  }
  snowMound(b, L * 0.35, 0.12, 0.35, [0.2, 0, -0.25], seed);
  return { layers: [{ name: 'body', b }], userData: { size: [L, 0.6], radius: L / 2 } };
}

export function iceShards(seed = 0): PropSpec {
  const b = new Builder(), ice = new Builder();
  const r = rng(seed + 61);
  const n = 4 + (seed % 3) * 2;
  const cols = [P.ice, P.iceTeal, P.frost, P.iceDeep];
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = r() * 0.45;
    const h = 0.4 + r() * 0.7;
    ice.add(cone(0.1 + r() * 0.08, h, 4), pick(r, cols), { p: [Math.cos(a) * d, h / 2 - 0.05, Math.sin(a) * d], r: [(r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7], jitter: 0.02, seed: i });
  }
  ice.add(octa(0.2), P.ice, { p: [0.1, 0.1, 0.05], s: [1.2, 0.6, 1] });
  snowMound(b, 0.6, 0.15, 0.5, [0, 0, 0], seed);
  return { layers: [{ name: 'ice', b: ice, mat: 'ice', shadow: true }, { name: 'snow', b }], userData: { radius: 0.6, decor: true } };
}

export function footpathStones(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 71);
  const n = 5 + (seed % 3);
  for (let i = 0; i < n; i++) {
    const z = -((n - 1) * 0.55) / 2 + i * 0.55;
    const x = Math.sin(i * 1.3 + seed) * 0.25;
    b.add(dodec(0.22 + r() * 0.06), pick(r, [P.stone, P.stoneWarm, 0x9aa0ab]), { p: [x, 0.0, z], s: [1.2, 0.25, 1], r: [0, r() * 3, 0], jitter: 0.02, seed: i, top: 0xa8a49c, topY: 0.9 });
  }
  return { layers: [{ name: 'body', b }], userData: { size: [0.8, n * 0.55], walkable: true, decor: true } };
}

export function snowyBoulderCluster(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed * 19 + 3);
  const n = 3 + (seed % 3);
  const cols = [P.stoneDark, 0x7f7a74, 0x737a86];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r(), d = i === 0 ? 0 : 0.7 + r() * 0.4;
    const s = i === 0 ? 0.7 : 0.3 + r() * 0.3;
    b.add(ico(s, 1), cols[i % 3], { p: [Math.cos(a) * d, s * 0.5, Math.sin(a) * d], s: [1.15, 0.8, 1], r: [0, r() * 6, 0], jitter: s * 0.15, seed: seed * 5 + i, top: P.snow, topY: 0.72, shade: 0.1 });
  }
  snowMound(b, 1.0, 0.2, 0.7, [0.3, 0, 0.5], seed + 2);
  return { layers: [{ name: 'body', b }], userData: { radius: 1.5 } };
}

// ---------------------------------------------------------------- structures
export function lampPost(seed = 0): PropSpec {
  const b = new Builder(), g = new Builder();
  const H = 3.2;
  b.add(bevel(0.36, 0.25, 0.36, 0.05), P.stone, { p: [0, 0.12, 0] });
  b.add(cyl(0.07, 0.1, H, 7), seed % 2 ? P.iron : P.woodDark, { p: [0, H / 2 + 0.2, 0], shade: 0.04, seed });
  for (const y of [0.9, H - 0.3]) b.add(cyl(0.11, 0.11, 0.06, 7), P.copper, { p: [0, y, 0] });
  // curled bracket and hanging lantern
  b.add(box(0.7, 0.06, 0.06), seed % 2 ? P.iron : P.woodDark, { p: [0.33, H + 0.1, 0] });
  b.add(torus(0.18, 0.025, 3, 7, Math.PI), P.iron, { p: [0.18, H - 0.08, 0], r: [0, 0, Math.PI] });
  b.add(box(0.015, 0.16, 0.015), P.iron, { p: [0.62, H, 0] });
  b.add(bevel(0.3, 0.05, 0.3, 0.02), P.iron, { p: [0.62, H - 0.5, 0] });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.add(box(0.03, 0.34, 0.03), P.iron, { p: [0.62 + x * 0.12, H - 0.31, z * 0.12] });
  b.add(cone(0.24, 0.2, 4), P.copper, { p: [0.62, H - 0.04, 0], r: [0, Math.PI / 4, 0] });
  g.add(box(0.2, 0.28, 0.2), P.windowGlow, { p: [0.62, H - 0.31, 0] });
  b.add(box(0.16, 0.07, 0.16), P.snow, { p: [0, H + 0.24, 0] });
  b.add(box(0.5, 0.05, 0.1), P.snow, { p: [0.35, H + 0.16, 0] });
  const lp: [number, number, number] = [0.62, H - 0.31, 0];
  return {
    layers: [{ name: 'body', b }, { name: 'glow', b: g, mat: 'glow' }],
    markers: { light: lp },
    userData: { radius: 0.25, lightPos: lp, lightColor: P.windowGlow, lightIntensity: 1.0, lightDistance: 7 },
  };
}

/** Bunting between two posts 4 m apart along X (tiles end to end). */
export function bannerLine(seed = 0): PropSpec {
  const b = new Builder();
  const half = 2.0, top = 2.7, sag = 0.4;
  for (const x of [-half, half]) {
    b.add(cyl(0.06, 0.08, top + 0.2, 6), P.woodDark, { p: [x, (top + 0.2) / 2, 0] });
    b.add(box(0.14, 0.07, 0.14), P.snow, { p: [x, top + 0.24, 0] });
  }
  const yAt = (x: number) => top - sag * (1 - (x / half) ** 2);
  for (let i = 0; i < 10; i++) {
    const x0 = -half + i * 0.4, x1 = x0 + 0.4;
    b.add(box(0.41, 0.02, 0.02), P.rope, { p: [(x0 + x1) / 2, (yAt(x0) + yAt(x1)) / 2, 0], r: [0, 0, Math.atan2(yAt(x1) - yAt(x0), 0.4)] });
  }
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = -half + ((i + 0.5) / n) * 2 * half;
    const c = ACCENTS[(i + seed) % ACCENTS.length];
    b.add(prism([[-0.15, 0], [0.15, 0], [0, -0.32]], 0.015), i % 2 ? P.cream : c, { p: [x, yAt(x) - 0.01, 0] });
  }
  return { layers: [{ name: 'body', b }], userData: { size: [4, 0.2], width: 4, tileWidth: 4, decor: true } };
}

/** Yard entrance arch ~3.6 m wide with a hanging sign; walk through along Z. */
export function woodenArch(seed = 0): PropSpec {
  const b = new Builder(), g = new Builder();
  const W = 3.6, H = 3.2;
  for (const sx of [-1, 1]) {
    b.add(cyl(0.2, 0.24, H, 7), P.woodDark, { p: [sx * W / 2, H / 2, 0], shade: 0.05, seed: sx + 3 });
    b.add(bevel(0.6, 0.3, 0.6, 0.06), P.stone, { p: [sx * W / 2, 0.15, 0] });
    b.add(cyl(0.25, 0.25, 0.1, 7), P.snow, { p: [sx * W / 2, H + 0.05, 0] });
    b.add(box(0.06, 0.6, 0.06), P.wood, { p: [sx * (W / 2 - 0.35), H - 0.65, 0], r: [0, 0, sx * 0.8] }); // knee braces
    g.add(box(0.14, 0.2, 0.14), P.windowGlow, { p: [sx * (W / 2 + 0.3), H - 0.9, 0.15] });
    b.add(cone(0.15, 0.13, 4), P.iron, { p: [sx * (W / 2 + 0.3), H - 0.73, 0.15], r: [0, Math.PI / 4, 0] });
    b.add(box(0.35, 0.04, 0.04), P.iron, { p: [sx * (W / 2 + 0.15), H - 0.62, 0.15] });
  }
  b.add(cyl(0.17, 0.17, W + 0.9, 7), P.bark, { p: [0, H - 0.25, 0], r: [0, 0, Math.PI / 2] });
  b.add(cyl(0.13, 0.13, W + 0.5, 7), P.wood, { p: [0, H + 0.12, 0], r: [0, 0, Math.PI / 2] });
  b.add(box(W + 0.7, 0.1, 0.3), P.snow, { p: [0, H + 0.26, 0] });
  // hanging sign on chains
  for (const sx of [-1, 1]) b.add(box(0.015, 0.3, 0.015), P.iron, { p: [sx * 0.6, H - 0.55, 0.05] });
  b.add(bevel(1.6, 0.55, 0.08, 0.03), P.woodLight, { p: [0, H - 0.95, 0.05] });
  b.add(bevel(1.4, 0.4, 0.09, 0.02), ACCENTS[seed % ACCENTS.length], { p: [0, H - 0.95, 0.05] });
  b.add(prism([[0, 0.14], [0.1, 0], [0, -0.14], [-0.1, 0]], 0.1), P.ember, { p: [0, H - 0.95, 0.05] });
  if (seed % 3 !== 1) {
    // pine garland across the beam
    for (let i = 0; i <= 8; i++) b.add(ico(0.14, 0), i % 2 ? P.pine : P.pineLight, { p: [-W / 2 + (i * W) / 8, H - 0.38 - Math.sin((i / 8) * Math.PI) * 0.15, 0.17], s: [1, 0.8, 1] });
  }
  return {
    layers: [{ name: 'body', b }, { name: 'glow', b: g, mat: 'glow' }],
    markers: { sign: [0, H - 0.95, 0.1] },
    userData: { size: [W + 0.6, 0.6], width: W, opening: W - 0.4, height: H + 0.3, lightPos: [0, H - 0.9, 0.6], lightColor: P.windowGlow },
  };
}

export function watchTower(seed = 0): PropSpec {
  const b = new Builder(), g = new Builder();
  const S = 1.6, PH = 3.0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add(cyl(0.1, 0.13, PH + 1.4, 6), P.woodDark, { p: [sx * S / 2, (PH + 1.4) / 2, sz * S / 2], r: [-sz * 0.04, 0, sx * 0.04] });
    b.add(bevel(0.36, 0.2, 0.36, 0.04), P.stone, { p: [sx * S / 2 * 1.08, 0.1, sz * S / 2 * 1.08] });
  }
  for (const y of [1.0, 2.0]) for (const [x, z, ry] of [[0, S / 2, 0], [0, -S / 2, 0], [S / 2, 0, Math.PI / 2], [-S / 2, 0, Math.PI / 2]] as const)
    b.add(box(Math.hypot(S, 1.0), 0.07, 0.07), P.wood, { p: [x, y - 0.5 + 0.5, z], r: [0, ry, Math.atan2(1.0, S) * (y === 1 ? 1 : -1)] });
  b.add(bevel(S + 0.5, 0.12, S + 0.5, 0.03), P.woodLight, { p: [0, PH, 0] });
  for (const [x, z, ry] of [[0, S / 2 + 0.22, 0], [0, -S / 2 - 0.22, 0], [S / 2 + 0.22, 0, Math.PI / 2], [-S / 2 - 0.22, 0, Math.PI / 2]] as const) {
    b.add(box(S + 0.5, 0.07, 0.07), P.wood, { p: [x, PH + 0.75, z], r: [0, ry, 0] });
    for (let k = -2; k <= 2; k++) b.add(box(0.05, 0.75, 0.05), P.woodDark, { p: [x + (ry ? 0 : k * 0.38), PH + 0.38, z + (ry ? k * 0.38 : 0)] });
  }
  // pyramid roof with snow, lantern, little banner
  b.add(cone(S * 0.95, 0.8, 4), P.bark, { p: [0, PH + 1.8, 0], r: [0, Math.PI / 4, 0] });
  b.add(cone(S * 0.8, 0.68, 4), P.snow, { p: [0, PH + 1.88, 0], r: [0, Math.PI / 4, 0], bottom: P.snowShade });
  g.add(box(0.16, 0.22, 0.16), P.windowGlow, { p: [0, PH + 1.1, 0] });
  b.add(cyl(0.02, 0.02, 0.7, 4), P.woodDark, { p: [0, PH + 2.5, 0] });
  b.add(prism([[0, 0], [0.45, 0.1], [0, 0.22]], 0.02), ACCENTS[seed % ACCENTS.length], { p: [0.02, PH + 2.6, 0] });
  // ladder
  for (const sx of [-1, 1]) b.add(box(0.05, PH + 0.2, 0.05), P.woodLight, { p: [sx * 0.2, (PH + 0.2) / 2, S / 2 + 0.35], r: [-0.12, 0, 0] });
  for (let k = 0; k < 8; k++) b.add(box(0.4, 0.04, 0.04), P.woodLight, { p: [0, 0.35 + k * 0.36, S / 2 + 0.35 - (0.35 + k * 0.36) * 0.12 + 0.18] });
  return {
    layers: [{ name: 'body', b }, { name: 'glow', b: g, mat: 'glow' }],
    markers: { light: [0, PH + 1.1, 0] },
    userData: { size: [S + 0.6, S + 0.9], radius: 1.3, height: PH + 2.6, lightPos: [0, PH + 1.1, 0], lightColor: P.windowGlow },
  };
}
