// Models for the five signature mechanics: plough, rescue, skating, crank, carried flame.
import * as THREE from 'three';
import { Builder, bevel, box, cone, cyl, dodec, ico, lathe, octa, prism, rng, sphere, torus } from '../geo';
import { PALETTE as P } from '../palette';
import { fishBody } from '../items';
import { coals, flame, logBetween, snowMound, type PropSpec } from './common';

const ACC = [P.coatRust, P.porter, P.mustard, P.cook, P.lumberjack, P.villager] as const;

// ================================================================ 1. snow plough
/** Hand-pushed plough. Origin at the handle grip (y = 0), blade forward along +Z, bottom edge at y = -gripHeight. */
export function plough(level = 1): PropSpec {
  const L2 = level >= 2;
  const b = new Builder();
  const W = L2 ? 2.4 : 1.6, G = 0.85; // blade width, grip height above the ground
  const bz = 1.05, by = -G; // blade bottom front
  // curved mouldboard: a thick quarter-arc slab, concave side facing forward-up, planked
  const arc = (R: number, a: number) => [R * Math.cos(a), 0.42 + R * Math.sin(a)] as [number, number];
  const outer: [number, number][] = [], inner: [number, number][] = [];
  for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 - (k / 6) * (Math.PI / 2) * 0.85; outer.push(arc(0.48, a)); inner.push(arc(0.42, a)); }
  b.add(prism([...outer, ...inner.reverse()], W), L2 ? P.iron : P.woodLight, { p: [0, by, bz], r: [0, -Math.PI / 2, 0], shade: 0.05, seed: 2 });
  for (let k = 1; k < 6; k += 1) {
    const a = -Math.PI / 2 - (k / 6) * (Math.PI / 2) * 0.85;
    const [u, y] = arc(0.415, a);
    b.add(box(W - 0.04, 0.012, 0.02), L2 ? P.steel : P.wood, { p: [0, by + y, bz + u], r: [a + Math.PI / 2, 0, 0] });
  }
  b.add(box(W + 0.06, 0.06, 0.08), L2 ? P.steel : P.iron, { p: [0, by + 0.03, bz - 0.02] }); // cutting edge
  b.add(box(W + 0.04, 0.07, 0.1), L2 ? P.iron : P.woodDark, { p: [0, by + 0.44, bz - 0.44] }); // top beam
  // side cheeks / runners
  for (const sx of [-1, 1]) {
    b.add(prism([[0, 0], [0.55, 0], [0.5, 0.42], [0.05, 0.42]], 0.05), P.woodDark, { p: [sx * (W / 2 + 0.03), by, bz - 0.55], r: [0, -Math.PI / 2, 0] });
    b.add(box(0.06, 0.04, 0.9), L2 ? P.copperDark : P.iron, { p: [sx * (W / 2 + 0.03), by + 0.02, bz - 0.5] });
    for (let k = 0; k < 2; k++) b.add(sphere(0.025, 4, 3), P.copper, { p: [sx * (W / 2 + 0.06), by + 0.12 + k * 0.2, bz - 0.3] });
  }
  // handles from the grip down to the blade frame, cross bar at the grip
  for (const sx of [-1, 1]) {
    logBetween(b, [sx * 0.28, 0, 0], [sx * 0.4, by + 0.4, bz - 0.5], 0.035, P.woodLight, P.woodPale, 6);
    b.add(cyl(0.045, 0.045, 0.16, 6), P.cream, { p: [sx * 0.22, 0, 0], r: [0, 0, Math.PI / 2] }); // wrapped grips
  }
  b.add(cyl(0.03, 0.03, 0.6, 6), P.woodDark, { p: [0, 0, 0], r: [0, 0, Math.PI / 2] });
  b.add(box(0.9, 0.05, 0.05), P.woodDark, { p: [0, by + 0.55, bz - 0.7] });
  // snow riding up the blade
  b.add(sphere(0.3, 7, 4), P.snow, { p: [0.15, by + 0.2, bz + 0.05], s: [W * 1.1, 0.6, 0.55], jitter: 0.03, seed: 4, bottom: P.snowShade, topY: 0.2 });
  b.add(prism([[0, 0.05], [0.04, 0], [0, -0.05], [-0.04, 0]], 0.02), P.ember, { p: [0, by + 0.3, bz - 0.25] });
  return {
    layers: [{ name: 'body', b }],
    markers: { blade: [0, by, bz + 0.1] },
    userData: { level: L2 ? 2 : 1, width: W, gripHeight: G, bladeForward: bz, attach: 'hands' },
  };
}

// ---------------------------------------------------------------- finds
export function emberCache(): PropSpec {
  const b = new Builder(), lid = new Builder(), glow = new Builder();
  const W = 0.9, D = 0.6, H = 0.45, tilt = 0.12;
  // chest, half buried and tipped forward
  const chest = new Builder();
  chest.add(bevel(W, H, D, 0.04), P.wood, { p: [0, H / 2, 0], shade: 0.05, seed: 2 });
  for (const x of [-W / 3, W / 3]) chest.add(box(0.07, H + 0.01, D + 0.02), P.iron, { p: [x, H / 2, 0] });
  chest.add(box(0.14, 0.14, 0.03), P.copper, { p: [0, H * 0.7, D / 2 + 0.01] });
  b.merge(chest, { p: [0, -0.12, 0], r: [tilt, 0.2, 0] });
  glow.add(box(W - 0.1, 0.05, D - 0.1), P.ember, { p: [0, H - 0.08, 0], r: [tilt, 0.2, 0] });
  coals(glow, 0.25, 6, 3, H - 0.06);
  // lid: hinged at the back edge (node origin at the hinge), slightly ajar
  lid.add(new THREE.CylinderGeometry(D / 2, D / 2, W, 8, 1, false, 0, Math.PI), P.wood, { p: [0, 0, D / 2], r: [0, 0, Math.PI / 2], s: [1, 1, 0.6], shade: 0.05, seed: 3 });
  for (const x of [-W / 3, W / 3]) lid.add(new THREE.CylinderGeometry(D / 2 + 0.01, D / 2 + 0.01, 0.07, 8, 1, false, 0, Math.PI), P.iron, { p: [x, 0, D / 2], r: [0, 0, Math.PI / 2], s: [1, 1, 0.6] });
  lid.add(sphere(0.18, 6, 3), P.snow, { p: [0.1, 0.17, D / 2], s: [1.6, 0.35, 1] });
  // snow drifted around and over it
  snowMound(b, 0.85, 0.32, 0.7, [0, 0, 0.05], 2);
  snowMound(b, 0.4, 0.2, 0.35, [-0.55, 0, -0.35], 3);
  for (let i = 0; i < 4; i++) b.add(octa(0.05), P.ember, { p: [-0.4 + i * 0.25, 0.08, 0.55], r: [i, i, 0] });
  return {
    layers: [{ name: 'body', b }, { name: 'glow', b: glow, mat: 'glow', shadow: false }, { name: 'lid', b: lid, pos: [0, H - 0.1, -D / 2 + 0.05] }],
    markers: { light: [0, 0.6, 0.2] },
    userData: { radius: 0.8, lightPos: [0, 0.6, 0.2], lightColor: P.emberHot, lightIntensity: 0.8, lightDistance: 4, lidOpenAngle: -1.6 },
  };
}

export function buriedCrate(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 5);
  const c = new Builder();
  const s = 0.75;
  c.add(box(s - 0.05, s - 0.05, s - 0.05), P.woodDark, { p: [0, s / 2, 0] });
  for (let k = 0; k < 3; k++) c.add(box(s, s * 0.27, s + 0.01), k % 2 ? P.wood : P.woodLight, { p: [0, s * (0.18 + k * 0.32), 0], shade: 0.05, seed: k });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(box(0.06, s, 0.06), P.woodDark, { p: [sx * (s / 2 - 0.01), s / 2, sz * (s / 2 - 0.01)] });
  c.add(prism([[0, 0.08], [0.06, 0], [0, -0.08], [-0.06, 0]], 0.01), ACC[seed % ACC.length], { p: [0, s / 2, s / 2 + 0.01] });
  b.merge(c, { p: [0.05, -0.32, 0], r: [0.35, 0.5 + r(), 0.25] });
  snowMound(b, 0.85, 0.35, 0.75, [0, 0, 0], seed + 1);
  b.add(sphere(0.2, 6, 3), P.snow, { p: [0.1, 0.42, -0.05], s: [1.5, 0.4, 1.2] });
  return { layers: [{ name: 'body', b }], userData: { radius: 0.85 } };
}

/** "Someone is under there": snow mound with a hat tip, scarf end and a mitten poking out. */
export function buriedVillager(seed = 0): PropSpec {
  const b = new Builder(), hand = new Builder();
  const r = rng(seed + 31);
  const hat = ACC[seed % ACC.length], scarf = [P.cream, P.mustard, P.coatRust][seed % 3];
  snowMound(b, 0.75, 0.5, 0.6, [0, 0, 0], seed + 2);
  snowMound(b, 0.45, 0.28, 0.4, [0.45, 0, -0.25], seed + 3);
  // knitted hat tip with bobble poking out of the top
  b.add(cone(0.2, 0.32, 8), hat, { p: [-0.12, 0.55, 0.05], r: [0.15, 0, 0.35] });
  b.add(cyl(0.2, 0.21, 0.07, 8), P.cream, { p: [-0.06, 0.42, 0.04], r: [0.15, 0, 0.35] });
  b.add(ico(0.075, 0), P.cream, { p: [-0.2, 0.72, 0.08] });
  b.add(sphere(0.12, 6, 3), P.snow, { p: [-0.02, 0.47, 0.1], s: [1.3, 0.4, 1] });
  // scarf end trailing out over the snow
  b.add(box(0.12, 0.03, 0.5), scarf, { p: [0.3, 0.2, 0.45], r: [-0.35, 0.4, 0] });
  for (let k = 0; k < 3; k++) b.add(box(0.12, 0.032, 0.03), hat, { p: [0.28 + k * 0.03, 0.18 - k * 0.05, 0.3 + k * 0.12], r: [-0.35, 0.4, 0] });
  for (let k = 0; k < 4; k++) b.add(box(0.015, 0.012, 0.06), scarf, { p: [0.43 - k * 0.025 + 0.05, 0.03, 0.73], r: [0, 0.4, 0] });
  // mittened hand reaching up from the side (node 'hand' can wave about its wrist)
  hand.add(cyl(0.06, 0.065, 0.28, 6), P.villager, { p: [0, 0.12, 0] });
  hand.add(cyl(0.07, 0.07, 0.05, 6), P.cream, { p: [0, 0.25, 0] });
  hand.add(sphere(0.085, 7, 5), P.mitten, { p: [0, 0.34, 0], s: [1, 1.15, 0.8] });
  hand.add(sphere(0.035, 5, 3), P.mitten, { p: [0.07, 0.31, 0.02] });
  // a couple of hopeful little puffs of breath-frost and footprints of whoever passed
  for (let i = 0; i < 3; i++) b.add(octa(0.03), P.frost, { p: [-0.35 + r() * 0.2, 0.62 + i * 0.08, 0.2] });
  return {
    layers: [{ name: 'mound', b }, { name: 'hand', b: hand, pos: [0.42, 0.25, 0.12] }],
    markers: { digPoint: [0, 0, 0.9] },
    userData: { radius: 0.8, hint: 'wave the hand: rotate z by sin(t*3)*0.4' },
  };
}

// ================================================================ 2. rescue
/** Storm lantern on a short pole. Origin at the grip; pole rises along +Y. */
export function lanternHeld(): PropSpec {
  const b = new Builder(), g = new Builder();
  b.add(cyl(0.022, 0.025, 0.75, 6), P.woodDark, { p: [0, 0.3, 0] });
  b.add(cyl(0.03, 0.03, 0.12, 6), P.cream, { p: [0, 0, 0] }); // wrapped grip
  b.add(torus(0.1, 0.014, 4, 8, Math.PI), P.iron, { p: [0.1, 0.67, 0], r: [0, 0, 0] }); // hook
  b.add(box(0.01, 0.08, 0.01), P.iron, { p: [0.2, 0.62, 0] });
  const lx = 0.2, ly = 0.42;
  b.add(cyl(0.085, 0.1, 0.04, 8), P.copper, { p: [lx, ly - 0.14, 0] });
  b.add(cone(0.1, 0.1, 8), P.copper, { p: [lx, ly + 0.15, 0], top: P.copperLight });
  b.add(torus(0.05, 0.01, 3, 6, Math.PI), P.iron, { p: [lx, ly + 0.22, 0] });
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; b.add(box(0.012, 0.26, 0.012), P.iron, { p: [lx + Math.cos(a) * 0.085, ly, Math.sin(a) * 0.085] }); }
  g.add(cyl(0.075, 0.075, 0.24, 8), P.windowGlow, { p: [lx, ly, 0] });
  g.add(cone(0.03, 0.08, 5), 0xfff2c0, { p: [lx, ly, 0] });
  const lp: [number, number, number] = [lx, ly, 0];
  return {
    layers: [{ name: 'body', b }, { name: 'glow', b: g, mat: 'glow', shadow: false }],
    markers: { light: lp },
    userData: { attach: 'handR', lightPos: lp, lightColor: 0xffc070, lightIntensity: 2.4, lightDistance: 9, glowRadius: 6 },
  };
}

/** Camp board with 24 portrait frames (6 x 4); frame0..frame23 are the lit portraits (hidden until found). */
export function foundBoard(): PropSpec {
  const b = new Builder();
  const W = 4.2, H = 2.4, cols = 6, rows = 4;
  for (const sx of [-1, 1]) {
    b.add(cyl(0.1, 0.12, 3.6, 7), P.woodDark, { p: [sx * (W / 2 + 0.1), 1.8, 0] });
    b.add(bevel(0.4, 0.25, 0.4, 0.05), P.stone, { p: [sx * (W / 2 + 0.1), 0.12, 0] });
  }
  b.add(bevel(W + 0.1, H, 0.12, 0.04), P.wood, { p: [0, 0.8 + H / 2, 0], shade: 0.04, seed: 2 });
  b.add(bevel(W + 0.3, 0.12, 0.2, 0.03), P.woodDark, { p: [0, 0.8 + H + 0.06, 0] });
  b.add(bevel(W + 0.3, 0.12, 0.2, 0.03), P.woodDark, { p: [0, 0.74, 0] });
  // gable roof with snow + title plank with the ember mark
  for (const sz of [-1, 1]) {
    b.add(bevel(W + 0.8, 0.07, 0.75, 0.02), P.bark, { p: [0, 0.8 + H + 0.42, sz * 0.25], r: [sz * 0.6, 0, 0] });
    b.add(bevel(W + 0.7, 0.08, 0.68, 0.03), P.snow, { p: [0, 0.8 + H + 0.49, sz * 0.27], r: [sz * 0.6, 0, 0] });
  }
  b.add(bevel(1.8, 0.32, 0.06, 0.02), P.woodPale, { p: [0, 0.8 + H - 0.05, 0.1] });
  b.add(prism([[0, 0.11], [0.08, 0], [0, -0.11], [-0.08, 0]], 0.02), P.ember, { p: [-0.6, 0.8 + H - 0.05, 0.14] });
  for (let k = 0; k < 4; k++) b.add(box(0.18, 0.04, 0.01), P.woodDark, { p: [-0.25 + k * 0.25, 0.8 + H - 0.05, 0.135] });
  const frames: { name: string; b: Builder; pos: [number, number, number] }[] = [];
  const fw = 0.52, fh = 0.44;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const n = j * cols + i;
    const x = -((cols - 1) * 0.64) / 2 + i * 0.64, y = 0.8 + H - 0.5 - j * 0.52 - 0.05;
    // empty slot (always): dark frame with a pale silhouette
    b.add(bevel(fw, fh, 0.03, 0.01), P.woodDark, { p: [x, y, 0.07] });
    b.add(box(fw - 0.08, fh - 0.08, 0.01), 0x5a4a44, { p: [x, y, 0.09] });
    b.add(sphere(0.08, 6, 4), 0x6e5e58, { p: [x, y + 0.02, 0.095], s: [1, 1, 0.2] });
    // found portrait (hidden until found)
    const f = new Builder();
    const hat = ACC[n % ACC.length], coat = ACC[(n * 5 + 2) % ACC.length];
    f.add(box(fw - 0.08, fh - 0.08, 0.012), [0xf3e6c8, 0xfbe3a0, 0xdfe9f5][n % 3], { p: [0, 0, 0] });
    f.add(sphere(0.12, 6, 4), coat, { p: [0, -0.15, 0.01], s: [1.3, 0.8, 0.25] });
    f.add(sphere(0.085, 7, 5), P.skin, { p: [0, 0.0, 0.015], s: [1, 1, 0.3] });
    f.add(cone(0.09, 0.1, 6), hat, { p: [0, 0.09, 0.02], s: [1, 1, 0.3] });
    for (const sx of [-1, 1]) f.add(box(0.015, 0.02, 0.01), P.eye, { p: [sx * 0.03, 0.005, 0.045] });
    f.add(box(0.03, 0.01, 0.01), P.blush, { p: [0, -0.04, 0.045] });
    frames.push({ name: `frame${n}`, b: f, pos: [x, y, 0.1] });
  }
  return {
    layers: [{ name: 'body', b }, ...frames.map((f) => ({ name: f.name, b: f.b, pos: f.pos, visible: false, shadow: false }))],
    markers: { front: [0, 0, 1.2] },
    userData: { size: [W + 0.6, 0.6], radius: 2.4, frames: 24, decor: false },
  };
}

/** Grand stone-and-timber lantern monument (unlocked by finding all 24). */
export function monument(): PropSpec {
  const b = new Builder(), g = new Builder();
  // stepped octagonal base
  b.add(cyl(2.4, 2.5, 0.3, 8), P.stone, { p: [0, 0.15, 0], shade: 0.04, seed: 1 });
  b.add(cyl(1.8, 1.9, 0.3, 8), P.stoneWarm, { p: [0, 0.45, 0], shade: 0.04, seed: 2 });
  b.add(bevel(1.4, 1.6, 1.4, 0.1), P.stone, { p: [0, 1.4, 0], shade: 0.05, seed: 3 });
  b.add(bevel(1.6, 0.18, 1.6, 0.05), P.stoneDark, { p: [0, 2.25, 0] });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    b.add(bevel(0.7, 0.35, 0.04, 0.01), P.copper, { p: [Math.sin(a) * 0.71, 1.4, Math.cos(a) * 0.71], r: [0, a, 0] });
  }
  // timber lantern house
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(bevel(0.18, 2.0, 0.18, 0.03), P.woodDark, { p: [sx * 0.6, 3.35, sz * 0.6] });
  for (const y of [2.45, 4.25]) b.add(bevel(1.5, 0.14, 1.5, 0.03), P.wood, { p: [0, y, 0] });
  g.add(bevel(0.9, 1.4, 0.9, 0.08), P.windowGlow, { p: [0, 3.35, 0] });
  g.add(cone(0.25, 0.6, 6), P.flameCore, { p: [0, 3.35, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(box(0.05, 1.4, 0.05), P.iron, { p: [sx * 0.46, 3.35, sz * 0.46] });
  b.add(cone(1.25, 1.0, 4), P.copper, { p: [0, 4.8, 0], r: [0, Math.PI / 4, 0], top: P.copperLight, topY: 0.4 });
  b.add(cone(1.1, 0.85, 4), P.snow, { p: [0, 4.9, 0], r: [0, Math.PI / 4, 0], bottom: P.snowShade });
  b.add(ico(0.16, 0), P.gold, { p: [0, 5.45, 0] });
  // ring of 24 little lanterns around the base, one for every villager found
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = Math.cos(a) * 2.2, z = Math.sin(a) * 2.2;
    b.add(box(0.12, 0.06, 0.12), P.iron, { p: [x, 0.33, z], r: [0, -a, 0] });
    g.add(box(0.09, 0.12, 0.09), [P.windowGlow, 0xffb060, 0xffd88a][i % 3], { p: [x, 0.42, z], r: [0, -a, 0] });
    b.add(cone(0.08, 0.06, 4), P.copper, { p: [x, 0.51, z], r: [0, -a + Math.PI / 4, 0] });
  }
  const lp: [number, number, number] = [0, 3.35, 0];
  return {
    layers: [{ name: 'body', b }, { name: 'glow', b: g, mat: 'glow', shadow: false }],
    markers: { light: lp },
    userData: { radius: 2.5, height: 5.6, lightPos: lp, lightColor: P.windowGlow, lightIntensity: 3, lightDistance: 14 },
  };
}

// ================================================================ 3. skating
/** Boardwalk raft on the ice: "normal footing". 3 x 3 m. */
export function gripMat(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 3);
  const S = 3.0;
  for (const z of [-1.2, 0, 1.2]) b.add(box(S, 0.08, 0.14), P.woodDark, { p: [0, 0.04, z] });
  for (let i = 0; i < 10; i++) {
    const x = -S / 2 + 0.15 + i * 0.3;
    b.add(box(0.27, 0.05, S * (0.97 + r() * 0.05)), [P.woodLight, P.woodPale, 0xd2a870, P.wood][Math.floor(r() * 4)], { p: [x, 0.105, (r() - 0.5) * 0.06] });
  }
  // grit / ash scattered for grip + rope edge + a few snow drifts on the corners
  for (let i = 0; i < 30; i++) b.add(box(0.03, 0.01, 0.03), [0x5a4a44, 0x8a7a6a, 0x3a3030][i % 3], { p: [(r() - 0.5) * S * 0.9, 0.135, (r() - 0.5) * S * 0.9], r: [0, r() * 3, 0] });
  for (const sx of [-1, 1]) b.add(cyl(0.035, 0.035, S, 5), P.rope, { p: [sx * (S / 2 + 0.03), 0.1, 0], r: [Math.PI / 2, 0, 0] });
  for (const [x, z] of [[-1, -1], [1, 1]] as const) b.add(sphere(0.35, 6, 3), P.snow, { p: [x * S / 2.4, 0.1, z * S / 2.4], s: [1.3, 0.25, 1] });
  return { layers: [{ name: 'body', b }], userData: { size: [S, S], walkable: true, grip: true, decor: true, topY: 0.13 } };
}

/** Splash ring in the ice where a fish will leap. Child 'fish' sits at water level (head +X) for the view to arc. */
export function fishLeap(): PropSpec {
  const b = new Builder(), f = new Builder(), splash = new Builder();
  b.add(cyl(0.38, 0.42, 0.04, 10), P.water, { p: [0, 0.02, 0], jitter: 0.02, seed: 1 });
  b.add(torus(0.42, 0.06, 4, 12), 0xcfeaf6, { p: [0, 0.03, 0], r: [Math.PI / 2, 0, 0], jitter: 0.015, seed: 2 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.add(ico(0.06, 0), i % 2 ? P.frost : P.ice, { p: [Math.cos(a) * 0.55, 0.04, Math.sin(a) * 0.55], s: [1, 0.6, 1], r: [a, a, 0] });
  }
  // splash droplets ring (node 'splash' can pop/scale)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    splash.add(cone(0.03, 0.18, 4), 0xe8f6ff, { p: [Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] });
  }
  fishBody(f, P.fish, P.fishDark, P.fishBelly, P.fishDark, { y: 0, lod: true });
  return {
    layers: [{ name: 'body', b }, { name: 'splash', b: splash, shadow: false }, { name: 'fish', b: f, pos: [0, 0.05, 0] }],
    userData: { radius: 0.6, decor: true, hint: 'arc fish: y = 1.2*sin(pi*u), rotate z along the arc' },
  };
}

// ================================================================ 4. crank
/** Timber capstan: child 'rotor' (drum + four push bars) spins about Y. */
export function capstan(): PropSpec {
  const b = new Builder(), rot = new Builder();
  const BR = 2.0; // bar tip radius
  // walking ring of packed boards
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.add(box(0.85, 0.05, 0.55), i % 2 ? P.woodLight : P.wood, { p: [Math.cos(a) * 2.0, 0.025, Math.sin(a) * 2.0], r: [0, -a + Math.PI / 2, 0] });
  }
  b.add(cyl(0.8, 0.9, 0.3, 10), P.stone, { p: [0, 0.15, 0], shade: 0.05, seed: 1 });
  b.add(cyl(0.18, 0.18, 0.4, 8), P.iron, { p: [0, 0.45, 0] });
  // rotor: rope drum, cap and four long bars at chest height
  rot.add(cyl(0.45, 0.45, 0.8, 10), P.woodDark, { p: [0, 0.75, 0], shade: 0.04, seed: 2 });
  for (let i = 0; i < 5; i++) rot.add(torus(0.47, 0.035, 4, 12), P.rope, { p: [0, 0.45 + i * 0.12, 0], r: [Math.PI / 2, 0, 0] });
  rot.add(cyl(0.55, 0.5, 0.18, 10), P.wood, { p: [0, 1.24, 0] });
  rot.add(cyl(0.3, 0.55, 0.15, 10), P.copper, { p: [0, 1.4, 0], top: P.copperLight });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    rot.add(box(BR - 0.4, 0.1, 0.1), P.woodLight, { p: [Math.cos(a) * (BR / 2 + 0.2), 1.1, -Math.sin(a) * (BR / 2 + 0.2)], r: [0, a, 0] });
    rot.add(cyl(0.065, 0.065, 0.2, 6), P.cream, { p: [Math.cos(a) * (BR - 0.15), 1.1, -Math.sin(a) * (BR - 0.15)], r: [0, a, Math.PI / 2] });
  }
  // rope leading away to the machine (+X)
  b.add(box(1.5, 0.04, 0.04), P.rope, { p: [1.2, 0.6, 0.47] });
  b.add(sphere(0.18, 6, 4), P.snow, { p: [0.4, 0.33, -0.6], s: [1.4, 0.3, 1] });
  return {
    layers: [{ name: 'body', b }, { name: 'rotor', b: rot }],
    markers: { ropeOut: [1.95, 0.6, 0.47] },
    userData: { radius: 0.95, barRadius: BR, barHeight: 1.1, ringInner: 1.2, ringOuter: 2.8 },
  };
}

/** Big forge bellows on a frame: child 'bag' (leather + top board) squashes/stretches in Y about its hinge. Nozzle points +Z. */
export function bellows(): PropSpec {
  const b = new Builder(), bag = new Builder();
  // frame
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(box(0.12, 0.8, 0.12), P.woodDark, { p: [sx * 0.6, 0.4, sz * 0.75] });
  b.add(box(1.35, 0.08, 1.7), P.wood, { p: [0, 0.8, 0] });
  // bottom board (static)
  b.add(prism([[-0.7, -0.55], [0.55, -0.3], [0.55, 0.3], [-0.7, 0.55]], 0.06), P.woodLight, { p: [0, 0.87, 0], r: [-Math.PI / 2, 0, -Math.PI / 2] });
  b.add(cyl(0.06, 0.09, 0.5, 8), P.copper, { p: [0, 0.9, 0.85], r: [Math.PI / 2, 0, 0] }); // nozzle
  b.add(cyl(0.04, 0.04, 0.1, 6), P.copperDark, { p: [0, 0.9, 1.12], r: [Math.PI / 2, 0, 0] });
  // bag: pleated leather wedge + top board + handle (origin at the hinge near the nozzle)
  for (let k = 0; k < 4; k++) {
    const h = 0.08 + k * 0.08;
    bag.add(prism([[-0.65, 0], [0.5, 0], [0.5, h], [-0.65, h]], 1.0 - k * 0.04), k % 2 ? 0x7a4a32 : 0x6a3e2a, { p: [0, 0, -0.1 * k], r: [0, Math.PI / 2, 0], s: [1, 1, 1] });
  }
  bag.add(prism([[-0.7, -0.55], [0.55, -0.3], [0.55, 0.3], [-0.7, 0.55]], 0.06), P.woodLight, { p: [0, 0.4, -0.15], r: [-Math.PI / 2 + 0.2, 0, -Math.PI / 2] });
  bag.add(cyl(0.035, 0.035, 0.7, 6), P.woodDark, { p: [0, 0.48, -0.8], r: [0, 0, Math.PI / 2] });
  for (const sx of [-1, 1]) bag.add(box(0.05, 0.15, 0.05), P.iron, { p: [sx * 0.3, 0.45, -0.75] });
  bag.add(prism([[0, 0.1], [0.07, 0], [0, -0.1], [-0.07, 0]], 0.02), P.ember, { p: [0, 0.47, -0.1], r: [-Math.PI / 2 + 0.2, 0, 0] });
  return {
    layers: [{ name: 'body', b }, { name: 'bag', b: bag, pos: [0, 0.9, 0.35] }],
    markers: { nozzle: [0, 0.9, 1.15] },
    userData: { size: [1.4, 2.0], radius: 1.0, hint: 'pump: bag.scale.y = 0.55..1.0' },
  };
}

/** Pit-head frame over a shaft: 'wheel' (spins about X), 'cage' (moves down by up to cageTravel), 'cable' (scale Y = rope length). */
export function mineLift(): PropSpec {
  const b = new Builder(), wheel = new Builder(), cage = new Builder(), cable = new Builder();
  const S = 1.5, H = 5.0;
  // shaft collar + dark pit
  b.add(box(S, 0.06, S), 0x15121a, { p: [0, 0.01, 0] });
  for (const [x, z, w, d] of [[0, S / 2 + 0.15, S + 0.6, 0.3], [0, -S / 2 - 0.15, S + 0.6, 0.3], [S / 2 + 0.15, 0, 0.3, S], [-S / 2 - 0.15, 0, 0.3, S]] as const)
    b.add(box(w, 0.3, d), P.woodDark, { p: [x, 0.15, z], shade: 0.05, seed: 2 });
  // A-frame headframe
  for (const sz of [-1, 1]) for (const sx of [-1, 1])
    logBetween(b, [sx * (S / 2 + 0.3), 0.3, sz * (S / 2 + 0.1)], [sx * 0.25, H, sz * 0.25], 0.09, P.wood, P.woodPale, 6);
  for (const y of [1.6, 3.2]) b.add(box(S + 0.5 - y * 0.15, 0.1, 0.1), P.woodDark, { p: [0, y, S / 2 - y * 0.06] });
  for (const y of [1.6, 3.2]) b.add(box(S + 0.5 - y * 0.15, 0.1, 0.1), P.woodDark, { p: [0, y, -S / 2 + y * 0.06] });
  b.add(box(0.7, 0.15, 0.7), P.iron, { p: [0, H + 0.02, 0] });
  b.add(cone(0.5, 0.35, 4), P.bark, { p: [0, H + 0.6, 0], r: [0, Math.PI / 4, 0] });
  b.add(cone(0.4, 0.28, 4), P.snow, { p: [0, H + 0.66, 0], r: [0, Math.PI / 4, 0] });
  // rope wheel (spins about X; node origin at the axle)
  wheel.add(torus(0.5, 0.06, 4, 16), P.iron, { r: [0, Math.PI / 2, 0] });
  for (let i = 0; i < 6; i++) wheel.add(box(0.05, 0.95, 0.05), P.wood, { r: [(i * Math.PI) / 6, 0, 0] });
  wheel.add(cyl(0.1, 0.1, 0.25, 8), P.copper, { r: [0, 0, Math.PI / 2] });
  // cable: origin at the wheel's front edge, 1 m long downwards (view scales Y to the cage)
  cable.add(box(0.03, 1, 0.03), P.rope, { p: [0, -0.5, 0] });
  // ore cage (origin at its top hook)
  cage.add(box(0.9, 0.06, 0.9), P.woodDark, { p: [0, -1.0, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cage.add(box(0.06, 1.0, 0.06), P.iron, { p: [sx * 0.42, -0.5, sz * 0.42] });
  for (const y of [-0.05, -0.55]) for (const [x, z, w, d] of [[0, 0.42, 0.9, 0.04], [0, -0.42, 0.9, 0.04], [0.42, 0, 0.04, 0.9], [-0.42, 0, 0.04, 0.9]] as const)
    cage.add(box(w, 0.05, d), P.iron, { p: [x, y, z] });
  for (let i = 0; i < 7; i++) cage.add(dodec(0.13), i % 3 ? P.ore : P.oreRust, { p: [-0.25 + (i % 3) * 0.25, -0.85 + Math.floor(i / 3) * 0.15, -0.2 + (i % 2) * 0.35], jitter: 0.02, seed: i });
  cage.add(cone(0.12, 0.2, 4), P.iron, { p: [0, -0.02, 0], r: [Math.PI, 0, 0] });
  const wy = H - 0.55;
  return {
    layers: [
      { name: 'body', b },
      { name: 'wheel', b: wheel, pos: [0, wy, 0] },
      { name: 'cable', b: cable, pos: [0, wy - 0.5, 0], shadow: false },
      { name: 'cage', b: cage, pos: [0, 1.4, 0] },
    ],
    markers: { cageTop: [0, 1.4, 0], unload: [1.4, 0, 0] },
    userData: { size: [S + 1.0, S + 0.6], radius: 1.4, cageTravel: 4.0, cageRestY: 1.4, wheelY: wy, cableTopY: wy - 0.5, wheelAxis: 'x' },
  };
}

/** Pit-head ore pile platform. */
export function shaftPile(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 9);
  b.add(box(2.4, 0.3, 2.0), P.woodDark, { p: [0, 0.15, 0], shade: 0.04, seed: 1 });
  for (let i = 0; i < 8; i++) b.add(box(0.28, 0.05, 2.0), i % 2 ? P.woodLight : P.wood, { p: [-1.05 + i * 0.3, 0.32, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(box(0.12, 0.6, 0.12), P.woodDark, { p: [sx * 1.15, 0.5, sz * 0.95] });
  for (let i = 0; i < 22; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * 0.8;
    b.add(dodec(0.12 + r() * 0.08), i % 4 === 0 ? P.oreRust : P.ore, { p: [Math.cos(a) * d, 0.42 + (0.8 - d) * 0.5 * r(), Math.sin(a) * d * 0.8], jitter: 0.02, seed: i, shade: 0.12 });
  }
  for (let i = 0; i < 3; i++) b.add(octa(0.05), 0xdfe8f2, { p: [(r() - 0.5) * 0.8, 0.75, (r() - 0.5) * 0.6] });
  b.add(cyl(0.2, 0.2, 0.05, 6), P.iron, { p: [0.9, 0.5, 0.7], r: [Math.PI / 2, 0, 0] }); // shovel blade
  b.add(cyl(0.02, 0.02, 1.0, 4), P.woodLight, { p: [0.75, 0.75, 0.5], r: [0.6, 0, 0.3] });
  return { layers: [{ name: 'body', b }], markers: { itemAnchor: [0, 0.6, 0] }, userData: { size: [2.4, 2.0], radius: 1.3 } };
}

// ================================================================ 5. carried flame & trail
/** Firepan on a short staff. Origin at the grip; 'flame' base sits in the pan (scale 0..1). */
export function flameHeld(): PropSpec {
  const b = new Builder(), fl = new Builder(), g = new Builder();
  b.add(cyl(0.025, 0.03, 0.85, 6), P.woodDark, { p: [0, 0.35, 0] });
  b.add(cyl(0.035, 0.035, 0.14, 6), P.cream, { p: [0, 0, 0] });
  for (const y of [0.25, 0.55]) b.add(cyl(0.032, 0.032, 0.03, 6), P.copper, { p: [0, y, 0] });
  const py = 0.8;
  b.add(lathe([[0, 0], [0.08, 0], [0.18, 0.05], [0.2, 0.09], [0.17, 0.09], [0.0, 0.05]], 10), P.iron, { p: [0, py, 0] });
  b.add(torus(0.19, 0.012, 3, 10), P.copper, { p: [0, py + 0.09, 0], r: [Math.PI / 2, 0, 0] });
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; b.add(box(0.012, 0.12, 0.012), P.iron, { p: [Math.cos(a) * 0.05, py - 0.05, Math.sin(a) * 0.05], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] }); }
  coals(g, 0.12, 5, 9, py + 0.06);
  flame(fl, 0.42, 0.13, 17, [0, 0, 0], 4);
  const lp: [number, number, number] = [0, py + 0.3, 0];
  return {
    layers: [{ name: 'body', b }, { name: 'glow', b: g, mat: 'ember', shadow: false }, { name: 'flame', b: fl, mat: 'glow', pos: [0, py + 0.07, 0], shadow: false }],
    markers: { light: lp },
    userData: { attach: 'handR', lightPos: lp, lightColor: P.flame, lightIntensity: 1.6, lightDistance: 6 },
  };
}

/** Stone cairn brazier for the Trail of Light: 'flame' + 'coals' (lit) / 'kindling' (unlit). */
export function trailBrazier(): PropSpec {
  const b = new Builder(), fl = new Builder(), em = new Builder(), kin = new Builder();
  const r = rng(77);
  // tapering cairn of stacked stones with snow on the ledges
  for (let row = 0; row < 5; row++) {
    const R = 0.75 - row * 0.1, y = 0.18 + row * 0.3, n = 7 - row;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + row * 0.4;
      b.add(dodec(0.2 + r() * 0.05), [P.stone, P.stoneWarm, P.stoneDark][(i + row) % 3], { p: [Math.cos(a) * R * 0.75, y, Math.sin(a) * R * 0.75], s: [1.3, 0.75, 1.1], r: [0, -a, 0], jitter: 0.03, seed: row * 9 + i, top: P.snow, topY: 0.85 });
    }
  }
  b.add(cyl(0.3, 0.45, 1.5, 7), P.stoneDark, { p: [0, 0.75, 0] });
  // iron bowl on top
  const by = 1.62;
  b.add(lathe([[0, 0], [0.15, 0], [0.38, 0.12], [0.46, 0.28], [0.42, 0.3], [0.32, 0.17], [0, 0.12]], 10), P.iron, { p: [0, by, 0], shade: 0.05, seed: 4 });
  b.add(torus(0.45, 0.03, 3, 12), P.copper, { p: [0, by + 0.29, 0], r: [Math.PI / 2, 0, 0] });
  // lit: coals + flame; unlit: neat stack of kindling with a bit of straw
  coals(em, 0.28, 8, 3, by + 0.2);
  em.add(sphere(0.3, 8, 3), P.emberHot, { p: [0, by + 0.17, 0], s: [1, 0.25, 1] });
  flame(fl, 1.0, 0.3, 23, [0, 0, 0], 6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    logBetween(kin, [Math.cos(a) * 0.3, by + 0.18, Math.sin(a) * 0.3], [Math.cos(a) * 0.04, by + 0.55, Math.sin(a) * 0.04], 0.04, P.woodLight, P.woodPale, 5);
  }
  kin.add(cone(0.18, 0.12, 6), 0xe8cf9a, { p: [0, by + 0.22, 0] });
  // marker flag on a stick so the trail reads from afar
  b.add(cyl(0.02, 0.02, 1.4, 4), P.woodDark, { p: [0.55, 1.5, -0.2], r: [0, 0, -0.1] });
  b.add(prism([[0, 0], [0.4, 0.08], [0, 0.18]], 0.02), P.coatRust, { p: [0.6, 2.05, -0.2] });
  const lp: [number, number, number] = [0, by + 0.8, 0];
  return {
    layers: [
      { name: 'body', b },
      { name: 'coals', b: em, mat: 'ember', shadow: false },
      { name: 'flame', b: fl, mat: 'glow', pos: [0, by + 0.18, 0], shadow: false },
      { name: 'kindling', b: kin, visible: false },
    ],
    markers: { light: lp },
    userData: { radius: 0.9, height: by + 0.4, lightPos: lp, lightColor: P.flame, lightIntensity: 1.6, lightDistance: 8, warmRadius: 4 },
  };
}

/** Wind gap: two wind-carved rock fins with rag streamers ('streamer' extends +X from its knot). */
export function windGap(seed = 0): PropSpec {
  const b = new Builder(), st = new Builder();
  const r = rng(seed + 13);
  for (const sx of [-1, 1]) {
    // a tall, leaning fin sculpted by the wind, snow streaks on the lee side
    const fin: [number, number][] = [[-0.7, 0], [0.6, 0], [0.45, 1.2], [0.15, 2.6 + r() * 0.5], [-0.25, 2.2], [-0.55, 1.0]];
    b.add(prism(fin, 0.55), sx < 0 ? P.stoneDark : 0x737a86, { p: [sx * 1.7, 0, 0], r: [0, Math.PI / 2 + sx * 0.2, sx * 0.08], jitter: 0.06, seed: seed + sx + 3, top: P.snow, topY: 0.55, shade: 0.08 });
    b.add(box(0.1, 1.6, 0.9), P.snow, { p: [sx * 1.45, 0.9, 0.3], r: [0, 0, -sx * 0.1], s: [0.3, 1, 1] });
    snowMound(b, 0.8, 0.3, 0.7, [sx * 1.7, 0, 0.5], seed + sx + 7);
  }
  // marker pole between with streamers
  b.add(cyl(0.035, 0.04, 2.2, 5), P.woodDark, { p: [-1.05, 1.1, 0.6] });
  b.add(sphere(0.06, 5, 4), P.rope, { p: [-1.05, 2.1, 0.6] });
  const cols = [P.coatRust, P.mustard, P.cream];
  for (let i = 0; i < 3; i++) {
    st.add(prism([[0, 0], [0.9 - i * 0.15, -0.05], [1.0 - i * 0.15, 0.02], [0, 0.1]], 0.015), cols[i], { p: [0, -i * 0.14, 0.01 * i] });
  }
  return {
    layers: [{ name: 'body', b }, { name: 'streamer', b: st, pos: [-1.02, 2.08, 0.6], shadow: false }],
    userData: { size: [4.4, 1.2], gapWidth: 2.2, windAxis: 'z', hint: 'flutter streamer: rotation.y = sin(t*9)*0.25, scale.x 0.9..1.1' },
  };
}

const LAMP_COLS = [0xff8a5a, 0xffc46b, 0x7fe0c8, 0xff9ab0];
/** Paper festival lamp on a post; 'flame' (lit paper glow) covers the pale paper when visible. */
export function festivalLamp(seed = 0): PropSpec {
  const b = new Builder(), fl = new Builder();
  const c = LAMP_COLS[seed % LAMP_COLS.length];
  b.add(cyl(0.04, 0.05, 1.5, 6), P.woodDark, { p: [0, 0.75, 0] });
  b.add(bevel(0.2, 0.12, 0.2, 0.03), P.stone, { p: [0, 0.06, 0] });
  b.add(box(0.4, 0.04, 0.04), P.woodDark, { p: [0.18, 1.48, 0] });
  b.add(box(0.01, 0.12, 0.01), P.rope, { p: [0.33, 1.4, 0] });
  const ly = 1.13;
  // paper lantern: pale paper (unlit) + ribs + caps
  b.add(sphere(0.17, 8, 6), 0xf0e6d4, { p: [0.33, ly, 0], s: [1, 1.25, 1] });
  for (let k = 0; k < 3; k++) b.add(torus(0.165 - Math.abs(k - 1) * 0.04, 0.008, 3, 10), P.woodDark, { p: [0.33, ly - 0.12 + k * 0.12, 0], r: [Math.PI / 2, 0, 0] });
  for (const y of [ly + 0.21, ly - 0.21]) b.add(cyl(0.07, 0.07, 0.04, 8), P.woodDark, { p: [0.33, y, 0] });
  b.add(box(0.015, 0.14, 0.015), c, { p: [0.33, ly - 0.32, 0] });
  // lit paper glow (slightly larger shell) + candle tongue
  fl.add(sphere(0.175, 8, 6), c, { p: [0, 0, 0], s: [1, 1.25, 1] });
  fl.add(cone(0.03, 0.08, 5), 0xfff2c0, { p: [0, -0.05, 0] });
  b.add(box(0.12, 0.05, 0.12), P.snow, { p: [0, 1.52, 0] });
  const lp: [number, number, number] = [0.33, ly, 0];
  return {
    layers: [{ name: 'body', b }, { name: 'flame', b: fl, mat: 'glow', pos: lp, shadow: false }],
    markers: { light: lp },
    userData: { radius: 0.3, decor: true, lightPos: lp, lightColor: c, lightIntensity: 0.6, lightDistance: 4 },
  };
}
