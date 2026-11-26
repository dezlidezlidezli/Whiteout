// Production stations: sawmill, smokehouse, forge, great kitchen, conveyor.
import { Builder, bevel, box, cone, cyl, lathe, prism, rng, sphere, torus } from '../geo';
import { PALETTE as P } from '../palette';
import { fishBody } from '../items';
import { coals, flame, logBetween, snowMound, stoneRing, type PropSpec } from './common';

/** Pitched plank roof with a snow layer, ridge along X. */
function roof(b: Builder, w: number, d: number, y: number, rise: number, wood: number = P.woodDark) {
  const slope = Math.atan2(rise, d / 2);
  const slab = Math.hypot(d / 2, rise) + 0.25;
  for (const sz of [-1, 1]) {
    b.add(bevel(w, 0.1, slab, 0.03), wood, { p: [0, y + rise / 2, sz * (d / 4 + 0.06)], r: [sz * slope, 0, 0] });
    b.add(bevel(w - 0.06, 0.12, slab - 0.06, 0.05), P.snow, { p: [0, y + rise / 2 + 0.1, sz * (d / 4 + 0.1)], r: [sz * slope, 0, 0], bottom: P.snowShade, topY: 0.3, jitter: 0.015, seed: sz + 3 });
  }
  b.add(box(w + 0.02, 0.16, 0.26), P.snow, { p: [0, y + rise + 0.1, 0] });
}

// ---------------------------------------------------------------- sawmill
export function sawmill(): PropSpec {
  const b = new Builder(), blade = new Builder();
  const W = 3.0, D = 2.2;
  // plank deck
  for (let i = 0; i < 7; i++) b.add(box(W, 0.12, D / 7 - 0.02), i % 2 ? P.woodLight : P.wood, { p: [0, 0.06, -D / 2 + D / 14 + (i * D) / 7], shade: 0.03, seed: i });
  // saw bench along X with the log being cut
  b.add(bevel(2.2, 0.16, 0.7, 0.04), P.woodPale, { p: [0, 0.82, 0.1] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(box(0.12, 0.7, 0.12), P.woodDark, { p: [sx * 0.95, 0.47, 0.1 + sz * 0.25] });
  b.add(box(0.5, 0.5, 0.06), P.iron, { p: [0, 0.6, 0.1] }); // blade housing
  logBetween(b, [-1.05, 1.03, 0.1], [-0.15, 1.03, 0.1], 0.14);
  // circular blade (spins about X)
  blade.add(cyl(0.42, 0.42, 0.03, 14), P.steel, { r: [0, 0, Math.PI / 2], top: 0xdfe6ee });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    blade.add(box(0.03, 0.08, 0.06), P.steel, { p: [0, Math.cos(a) * 0.43, Math.sin(a) * 0.43], r: [a, 0, 0] });
  }
  blade.add(cyl(0.08, 0.08, 0.06, 8), P.copper, { r: [0, 0, Math.PI / 2] });
  // crank wheel + belt to the blade
  b.add(torus(0.42, 0.06, 4, 12), P.woodDark, { p: [1.35, 0.85, -0.55], r: [0, Math.PI / 2, 0] });
  for (let i = 0; i < 4; i++) b.add(box(0.05, 0.8, 0.05), P.wood, { p: [1.35, 0.85, -0.55], r: [(i * Math.PI) / 4, 0, 0] });
  b.add(box(0.1, 0.9, 0.1), P.woodDark, { p: [1.35, 0.45, -0.55] });
  b.add(cyl(0.04, 0.04, 0.35, 5), P.woodLight, { p: [1.55, 0.85, -0.55], r: [0, 0, Math.PI / 2] });
  // lean-to shelter
  for (const sx of [-1, 1]) {
    b.add(bevel(0.16, 2.6, 0.16, 0.03), P.woodDark, { p: [sx * 1.4, 1.3, -1.0] });
    b.add(bevel(0.16, 2.1, 0.16, 0.03), P.woodDark, { p: [sx * 1.4, 1.05, -0.2] });
  }
  b.add(bevel(3.3, 0.12, 1.4, 0.03), P.wood, { p: [0, 2.35, -0.6], r: [-0.3, 0, 0] });
  b.add(bevel(3.2, 0.14, 1.3, 0.05), P.snow, { p: [0, 2.47, -0.63], r: [-0.3, 0, 0], bottom: P.snowShade, jitter: 0.015, seed: 2 });
  b.add(box(3.0, 0.5, 0.06), P.wood, { p: [0, 0.4, -1.08] }); // back board
  // output: stack of planks + sawdust
  for (let i = 0; i < 5; i++) b.add(bevel(0.62, 0.07, 0.22, 0.015), P.woodPale, { p: [1.0 + (i % 2) * 0.05, 0.16 + i * 0.075, 0.8], r: [0, i % 2 ? 0.1 : -0.05, 0] });
  b.add(cone(0.35, 0.2, 6), 0xe8cf9a, { p: [-0.1, 0.22, 0.75], s: [1.2, 1, 0.8] });
  // input: logs waiting
  for (let i = 0; i < 3; i++) logBetween(b, [-1.4 + i * 0.3, 0.25, -0.75], [-1.4 + i * 0.3, 0.25, 0.15], 0.13);
  snowMound(b, 0.5, 0.2, 0.4, [-1.6, 0, 1.0], 5);
  return {
    layers: [{ name: 'body', b }, { name: 'blade', b: blade, pos: [0.1, 0.88, 0.1] }],
    markers: { inputPoint: [-1.1, 0, -0.2], outputPoint: [1.0, 0.5, 0.8], sawdustPoint: [0.1, 0.9, 0.3] },
    userData: { size: [W, D], radius: 1.7, spinAxis: 'x' },
  };
}

// ---------------------------------------------------------------- smokehouse
export function smokehouse(): PropSpec {
  const b = new Builder(), glow = new Builder();
  const W = 1.9, D = 1.8, H = 2.0;
  b.add(bevel(W + 0.2, 0.25, D + 0.2, 0.05), P.stone, { p: [0, 0.12, 0] });
  // vertical dark board walls
  const n = 8;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + W / n / 2 + (i * W) / n;
    b.add(box(W / n - 0.02, H, D), i % 2 ? P.woodDark : 0x5a3a22, { p: [x, 0.25 + H / 2, 0], shade: 0.04, seed: i });
  }
  b.add(prism([[-W / 2, 0], [W / 2, 0], [0, 1.0]], D - 0.05), 0x5a3a22, { p: [0, 0.25 + H, 0], r: [0, Math.PI / 2, 0] });
  // steep roof (ridge along Z)
  const slope = Math.atan2(1.0, W / 2), slab = Math.hypot(W / 2, 1.0) + 0.25;
  for (const sx of [-1, 1]) {
    b.add(bevel(slab, 0.1, D + 0.4, 0.03), P.bark, { p: [sx * (W / 4 + 0.06), 0.25 + H + 0.5, 0], r: [0, 0, -sx * slope] });
    b.add(bevel(slab - 0.1, 0.12, D + 0.3, 0.05), P.snow, { p: [sx * (W / 4 + 0.1), 0.25 + H + 0.6, 0], r: [0, 0, -sx * slope], bottom: P.snowShade, topY: 0.3, jitter: 0.015, seed: sx });
  }
  // smoke vent box on the ridge
  b.add(bevel(0.45, 0.4, 0.45, 0.04), P.woodDark, { p: [0, 0.25 + H + 1.15, 0] });
  b.add(cone(0.42, 0.25, 4), P.bark, { p: [0, 0.25 + H + 1.48, 0], r: [0, Math.PI / 4, 0] });
  // door (+Z) and fish hanging under the front eave
  b.add(bevel(0.75, 1.4, 0.08, 0.02), P.wood, { p: [-0.35, 0.25 + 0.7, D / 2 + 0.03] });
  b.add(box(0.06, 0.06, 0.12), P.iron, { p: [-0.05, 0.95, D / 2 + 0.08] });
  b.add(box(1.0, 0.05, 0.05), P.woodLight, { p: [0.45, 2.0, D / 2 + 0.3] });
  for (let i = 0; i < 3; i++) {
    const fb = new Builder();
    fishBody(fb, P.smoked, P.smokedDark, 0xd89a4a, P.smokedDark, { y: 0, lod: true });
    b.merge(fb, { p: [0.15 + i * 0.3, 1.72, D / 2 + 0.3], r: [Math.PI / 2, 0, Math.PI / 2], s: 0.9 });
    b.add(box(0.01, 0.12, 0.01), P.rope, { p: [0.15 + i * 0.3, 1.94, D / 2 + 0.3] });
  }
  // stone firebox on the side with glowing mouth
  b.add(bevel(0.7, 0.7, 0.9, 0.08), P.stoneDark, { p: [W / 2 + 0.3, 0.35, 0], shade: 0.06, seed: 9 });
  glow.add(box(0.05, 0.28, 0.36), P.emberHot, { p: [W / 2 + 0.66, 0.3, 0] });
  b.add(bevel(0.2, 0.9, 0.2, 0.03), P.stoneDark, { p: [W / 2 + 0.3, 1.0, -0.25] });
  // firewood
  for (let i = 0; i < 3; i++) logBetween(b, [-W / 2 - 0.35, 0.13 + (i === 2 ? 0.2 : 0), -0.5 + (i % 2) * 0.27 + (i === 2 ? 0.13 : 0)], [-W / 2 - 0.35, 0.13 + (i === 2 ? 0.2 : 0), 0.3 + (i % 2) * 0.27 + (i === 2 ? 0.13 : 0)], 0.12);
  return {
    layers: [{ name: 'body', b }, { name: 'flame', b: glow, mat: 'glow' }],
    markers: { smokePoint: [0, 0.25 + H + 1.6, 0], inputPoint: [0, 0, D / 2 + 0.6], light: [W / 2 + 0.9, 0.4, 0] },
    userData: { size: [W + 1.0, D + 0.4], radius: 1.5, lightPos: [W / 2 + 0.9, 0.4, 0], lightColor: P.emberHot },
  };
}

// ---------------------------------------------------------------- forge
export function forge(): PropSpec {
  const b = new Builder(), glow = new Builder(), em = new Builder();
  // stone furnace
  b.add(bevel(1.7, 1.3, 1.5, 0.12), P.stone, { p: [0, 0.65, -0.3], shade: 0.06, seed: 3, top: P.stoneWarm, topY: 0.8 });
  for (let i = 0; i < 4; i++) b.add(box(1.72, 0.04, 1.52), P.stoneDark, { p: [0, 0.3 + i * 0.3, -0.3] });
  // arched glowing mouth (+Z)
  b.add(bevel(0.9, 0.75, 0.2, 0.06), P.stoneDark, { p: [0, 0.6, 0.45] });
  glow.add(prism([[-0.3, 0], [0.3, 0], [0.3, 0.35], [0.15, 0.5], [-0.15, 0.5], [-0.3, 0.35]], 0.05), P.emberHot, { p: [0, 0.3, 0.55] });
  glow.add(prism([[-0.2, 0], [0.2, 0], [0.2, 0.25], [0, 0.38], [-0.2, 0.25]], 0.05), P.flameCore, { p: [0, 0.3, 0.57] });
  // chimney
  b.add(bevel(0.9, 1.4, 0.9, 0.08), P.stoneWarm, { p: [0, 2.0, -0.45], shade: 0.06, seed: 4 });
  b.add(bevel(0.7, 1.1, 0.7, 0.06), P.stone, { p: [0, 3.2, -0.45], shade: 0.06, seed: 5 });
  b.add(bevel(0.85, 0.12, 0.85, 0.03), P.stoneDark, { p: [0, 3.8, -0.45] });
  em.add(cyl(0.22, 0.22, 0.04, 6), P.emberHot, { p: [0, 3.86, -0.45] });
  // bellows (left)
  b.add(prism([[0, 0], [0.7, 0.08], [0.7, -0.08]], 0.45), 0x6b4a32, { p: [-1.25, 0.6, 0.1], r: [0, 0, 0.1] });
  b.add(bevel(0.75, 0.05, 0.5, 0.02), P.woodDark, { p: [-1.0, 0.7, 0.1], r: [0, 0, 0.18] });
  b.add(cyl(0.05, 0.05, 0.4, 5), P.copper, { p: [-0.8, 0.55, 0.1], r: [0, 0, Math.PI / 2] });
  b.add(box(0.5, 0.5, 0.5), P.woodDark, { p: [-1.2, 0.25, 0.1] });
  // anvil on a stump (right front)
  b.add(cyl(0.3, 0.34, 0.5, 7), P.bark, { p: [1.2, 0.25, 0.6] });
  b.add(cyl(0.26, 0.26, 0.02, 7), P.woodPale, { p: [1.2, 0.505, 0.6] });
  b.add(bevel(0.6, 0.14, 0.26, 0.03), P.iron, { p: [1.2, 0.72, 0.6] });
  b.add(box(0.3, 0.12, 0.18), P.iron, { p: [1.2, 0.58, 0.6] });
  b.add(cone(0.11, 0.3, 4), P.iron, { p: [1.62, 0.73, 0.6], r: [0, 0, -Math.PI / 2], s: [1, 1, 0.8] });
  b.add(cyl(0.025, 0.025, 0.35, 4), P.woodLight, { p: [1.05, 0.83, 0.72], r: [0, 0.4, Math.PI / 2] }); // hammer
  b.add(box(0.12, 0.08, 0.08), P.iron, { p: [0.9, 0.83, 0.65] });
  // quench barrel + ingots
  b.add(lathe([[0, 0], [0.26, 0], [0.3, 0.3], [0.27, 0.6], [0, 0.6]], 8), P.wood, { p: [1.25, 0, -0.5] });
  b.add(cyl(0.25, 0.25, 0.02, 8), P.water, { p: [1.25, 0.59, -0.5] });
  for (const y of [0.12, 0.48]) b.add(cyl(0.3, 0.3, 0.04, 8, true), P.iron, { p: [1.25, y, -0.5] });
  coals(em, 0.4, 6, 3, 1.31, [0, 0, -0.3]);
  return {
    layers: [{ name: 'body', b }, { name: 'coals', b: em, mat: 'ember', shadow: false }, { name: 'flame', b: glow, mat: 'glow' }],
    markers: { light: [0, 0.6, 1.0], smokePoint: [0, 3.95, -0.45], inputPoint: [-0.6, 0, 1.0], outputPoint: [1.2, 0.8, 0.6] },
    userData: { size: [3.2, 2.2], radius: 1.7, lightPos: [0, 0.6, 1.0], lightColor: P.emberHot, lightIntensity: 1.5, lightDistance: 6 },
  };
}

// ---------------------------------------------------------------- great kitchen
export function greatKitchen(): PropSpec {
  const b = new Builder(), fl = new Builder(), em = new Builder(), glow = new Builder();
  const W = 6.0, D = 4.4;
  const r = rng(77);
  // stone floor platform + step
  b.add(bevel(W + 0.4, 0.3, D + 0.4, 0.08), P.stoneWarm, { p: [0, 0.15, 0], shade: 0.03, seed: 1, top: 0xb8ad9e });
  b.add(bevel(2.0, 0.15, 0.5, 0.04), P.stone, { p: [0, 0.075, D / 2 + 0.4] });
  // timber posts + beams
  // timber lean-to over the back half (kitchen work area); the cauldron stands in the open front
  const backZ = -D / 2 + 0.2, midZ = -0.35;
  for (const x of [-W / 2 + 0.2, -W / 6, W / 6, W / 2 - 0.2]) {
    b.add(bevel(0.24, 3.2, 0.24, 0.04), P.woodDark, { p: [x, 0.3 + 1.6, backZ] });
    b.add(bevel(0.24, 2.5, 0.24, 0.04), P.woodDark, { p: [x, 0.3 + 1.25, midZ] });
    b.add(bevel(0.36, 0.2, 0.36, 0.05), P.stone, { p: [x, 0.4, midZ] });
  }
  b.add(bevel(W + 0.2, 0.22, 0.26, 0.04), P.wood, { p: [0, 3.45, backZ] });
  b.add(bevel(W + 0.2, 0.22, 0.26, 0.04), P.wood, { p: [0, 2.8, midZ] });
  const rl = Math.hypot(midZ - backZ + 0.8, 0.75);
  const ra = Math.atan2(0.75, midZ - backZ);
  b.add(bevel(W + 0.6, 0.12, rl, 0.03), P.wood, { p: [0, 3.2, (backZ + midZ) / 2 + 0.25], r: [ra, 0, 0] });
  b.add(bevel(W + 0.5, 0.14, rl - 0.1, 0.05), P.snow, { p: [0, 3.32, (backZ + midZ) / 2 + 0.25], r: [ra, 0, 0], bottom: P.snowShade, jitter: 0.015, seed: 12 });
  b.add(box(W, 1.2, 0.1), P.woodLight, { p: [0, 0.9, backZ - 0.05], shade: 0.03, seed: 4 }); // back wall
  // hanging sign over the front of the lean-to
  b.add(bevel(1.6, 0.5, 0.08, 0.03), P.woodLight, { p: [0, 2.45, midZ + 0.15] });
  b.add(lathe([[0, 0], [0.16, 0.0], [0.22, 0.12], [0.2, 0.2]], 8), P.copper, { p: [0, 2.33, midZ + 0.2], r: [Math.PI / 2, 0, 0], s: [1, 0.4, 1] });
  // low stone wall with copper lamps framing the open front
  for (const sx of [-1, 1]) {
    b.add(bevel(1.6, 0.5, 0.35, 0.06), P.stone, { p: [sx * 2.2, 0.55, D / 2 - 0.1], shade: 0.05, seed: sx + 20 });
    b.add(cyl(0.16, 0.1, 0.12, 6), P.copper, { p: [sx * 2.8, 0.86, D / 2 - 0.1] });
    em.add(cone(0.1, 0.2, 5), P.ember, { p: [sx * 2.8, 1.0, D / 2 - 0.1] });
  }
  // giant cauldron on a fire ring (centre)
  stoneRing(b, 0.95, 10, 0.2, 31, [0, 0.3, 0.8]);
  b.add(cyl(0.85, 0.85, 0.05, 10), P.coal, { p: [0, 0.33, 0.8] });
  coals(em, 0.7, 8, 8, 0.36, [0, 0, 0.8]);
  b.add(lathe([[0, 0.25], [0.45, 0.28], [0.75, 0.5], [0.82, 0.8], [0.78, 1.05], [0.82, 1.1]], 12), P.copper, { p: [0, 0.3, 0.8], top: P.copperLight, topY: 0.5, shade: 0.04, seed: 2 });
  b.add(cyl(0.76, 0.76, 0.04, 12), P.stew, { p: [0, 1.36, 0.8] });
  for (let i = 0; i < 5; i++) b.add(cyl(0.07, 0.07, 0.04, 6), P.carrot, { p: [Math.cos(i * 1.3) * 0.45, 1.38, 0.8 + Math.sin(i * 1.3) * 0.45] });
  b.add(cyl(0.04, 0.04, 1.3, 5), P.woodLight, { p: [0.3, 1.7, 0.8], r: [0, 0, 0.45] }); // big paddle
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.6;
    flame(fl, 0.5, 0.2, 40 + i, [Math.cos(a) * 0.65, 0, Math.sin(a) * 0.65], 3);
  }
  // brick oven at the back right with glowing mouth + chimney through the roof
  b.add(lathe([[0, 0], [0.9, 0], [0.9, 0.5], [0.75, 1.0], [0.4, 1.35], [0, 1.45]], 9), 0xb5674a, { p: [1.8, 0.3, -1.3], shade: 0.06, seed: 5 });
  glow.add(prism([[-0.3, 0], [0.3, 0], [0.3, 0.25], [0, 0.45], [-0.3, 0.25]], 0.05), P.emberHot, { p: [1.8, 0.35, -0.42] });
  b.add(bevel(0.5, 3.6, 0.5, 0.05), P.stone, { p: [1.8, 2.7, -1.75], shade: 0.06, seed: 6 });
  b.add(bevel(0.62, 0.12, 0.62, 0.03), P.stoneDark, { p: [1.8, 4.52, -1.75] });
  // long prep table on the left with bowls, pies and fish
  b.add(bevel(2.0, 0.1, 0.8, 0.03), P.woodPale, { p: [-1.75, 1.15, -1.1] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(box(0.1, 0.85, 0.1), P.woodDark, { p: [-1.75 + sx * 0.85, 0.72, -1.1 + sz * 0.3] });
  for (let i = 0; i < 4; i++) b.add(lathe([[0, 0], [0.12, 0], [0.17, 0.1], [0, 0.1]], 7), P.bowl, { p: [-2.5 + i * 0.3, 1.2, -0.9] });
  b.add(cyl(0.22, 0.24, 0.1, 8), P.pie, { p: [-1.2, 1.25, -1.15], top: 0xf0be62 });
  b.add(cyl(0.2, 0.22, 0.1, 8), P.pie, { p: [-1.65, 1.25, -1.3], top: 0xf0be62 });
  const fb = new Builder();
  fishBody(fb, P.smoked, P.smokedDark, 0xd89a4a, P.smokedDark, { y: 0, lod: true });
  b.merge(fb, { p: [-2.2, 1.25, -1.3], s: 0.9 });
  // hanging pots on the back beam
  for (let i = 0; i < 4; i++) {
    const x = -2.2 + i * 0.5;
    b.add(box(0.015, 0.3, 0.015), P.iron, { p: [x, 2.7, -D / 2 + 0.25] });
    b.add(lathe([[0, 0], [0.1 + r() * 0.04, 0.0], [0.14, 0.12], [0.12, 0.18]], 7), i % 2 ? P.copper : P.iron, { p: [x, 2.35, -D / 2 + 0.25] });
  }
  // sacks + barrel on the right front
  for (let i = 0; i < 2; i++) b.add(sphere(0.3, 7, 5), P.canvas, { p: [2.4 - i * 0.55, 0.55, 1.4], s: [1, 0.85, 0.9], jitter: 0.03, seed: i });
  b.add(lathe([[0, 0], [0.3, 0], [0.34, 0.35], [0.3, 0.7], [0, 0.7]], 8), P.wood, { p: [2.45, 0.3, 0.6] });
  b.add(cyl(0.34, 0.34, 0.04, 8, true), P.iron, { p: [2.45, 0.55, 0.6] });
  return {
    layers: [
      { name: 'body', b },
      { name: 'coals', b: em, mat: 'ember', shadow: false },
      { name: 'flame', b: fl, mat: 'glow', pos: [0, 0.33, 0.8] },
      { name: 'ovenGlow', b: glow, mat: 'glow' },
    ],
    markers: { steamPoint: [0, 1.6, 0.8], smokePoint: [1.8, 4.7, -1.75], light: [0, 1.0, 1.3], inputPoint: [-1.5, 0, D / 2 + 0.6], outputPoint: [1.5, 0, D / 2 + 0.6] },
    userData: { size: [W + 0.4, D + 0.9], radius: 3.4, lightPos: [0, 1.0, 1.3], lightColor: P.flame, lightIntensity: 1.6, lightDistance: 8 },
  };
}

// ---------------------------------------------------------------- conveyor (1 m segment along Z)
export function conveyor(): PropSpec {
  const b = new Builder(), belt = new Builder();
  const L = 1.0, Wd = 0.7, Hh = 0.55;
  for (const sx of [-1, 1]) {
    b.add(box(0.08, 0.14, L), P.wood, { p: [sx * (Wd / 2 + 0.04), Hh, 0], shade: 0.04, seed: sx + 2 });
    b.add(box(0.09, Hh - 0.05, 0.09), P.woodDark, { p: [sx * (Wd / 2 + 0.04), (Hh - 0.05) / 2, 0] });
    b.add(box(0.06, 0.06, 0.06), P.copper, { p: [sx * (Wd / 2 + 0.09), Hh, 0] });
  }
  b.add(box(0.06, 0.06, Wd + 0.1), P.woodDark, { p: [0, 0.2, 0], r: [0, Math.PI / 2, 0] });
  b.add(cyl(0.06, 0.06, Wd, 6), P.iron, { p: [0, Hh - 0.02, 0], r: [0, 0, Math.PI / 2] });
  // belt surface with slats (slats scroll in the view if it wants: move the 'belt' node along Z mod 0.25)
  belt.add(box(Wd, 0.03, L), 0x4a3a30, { p: [0, 0, 0] });
  for (let i = 0; i < 4; i++) belt.add(box(Wd - 0.04, 0.02, 0.06), 0x6b5444, { p: [0, 0.022, -L / 2 + 0.125 + i * 0.25] });
  return {
    layers: [{ name: 'body', b }, { name: 'belt', b: belt, pos: [0, Hh + 0.07, 0] }],
    markers: { itemAnchor: [0, Hh + 0.1, 0] },
    userData: { size: [Wd + 0.2, L], length: L, beltHeight: Hh + 0.1, axis: 'z', slatSpacing: 0.25 },
  };
}
