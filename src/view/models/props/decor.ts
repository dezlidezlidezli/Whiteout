// Endless-mode camp decor, ember piles, the trader's caravan and the aurora curtain.
import * as THREE from 'three';
import { Builder, bevel, box, cone, cyl, ico, lathe, octa, prism, rng, sphere, torus, type V3 } from '../geo';
import { PALETTE as P } from '../palette';
import { coals, flame, logBetween, snowMound, stoneRing, type PropSpec } from './common';

// ---------------------------------------------------------------- ember pile (1..4)
export function emberPile(level: number): PropSpec {
  const L = Math.max(1, Math.min(4, Math.round(level)));
  const b = new Builder(), g = new Builder();
  const r = rng(L * 17 + 3);
  const R = [0.35, 0.55, 0.8, 1.05][L - 1];
  const H = [0.22, 0.36, 0.52, 0.7][L - 1];
  const n = [7, 15, 26, 40][L - 1];
  // scorched snow ring + ash bed
  // thin melt ring of wet, dark snow and a small ash bed
  b.add(cyl(R + 0.12, R + 0.16, 0.02, 10), 0x9aa3b4, { p: [0, 0.01, 0], jitter: 0.03, seed: L });
  b.add(cyl(R * 0.7, R * 0.8, 0.04, 9), P.coal, { p: [0, 0.02, 0], jitter: 0.02, seed: L + 1 });
  // small hot core hidden under the shards
  g.add(sphere(R * 0.55, 7, 4), 0xa82a08, { p: [0, 0, 0], s: [1, (H * 0.7) / (R * 0.55), 1], jitter: R * 0.04, seed: L });
  const shardCols = [0xd8460a, 0xe0600e, 0xff9a1a, 0xc0300a, 0xffb020];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
    const y = H * (1 - (d / R) ** 2) * (0.75 + r() * 0.3);
    const s = 0.08 + r() * 0.07 + L * 0.012;
    g.add(i % 3 ? octa(s) : ico(s, 0), shardCols[i % shardCols.length], {
      p: [Math.cos(a) * d, y, Math.sin(a) * d], s: [1, 0.6 + r() * 0.8, 0.85], r: [r() * 3, r() * 3, r() * 3], top: 0xffc23a, topY: 0.6,
    });
  }
  const lightY = H + 0.25;
  return {
    layers: [{ name: 'body', b }, { name: 'glow', b: g, mat: 'ember', shadow: false }],
    markers: { light: [0, lightY, 0], top: [0, H, 0] },
    userData: { level: L, radius: R + 0.15, height: H, lightPos: [0, lightY, 0], lightColor: P.emberHot, lightIntensity: 0.4 + 0.25 * L, lightDistance: 3 + L },
  };
}

// ---------------------------------------------------------------- flag pole
const FLAG_COLS = [P.coatRust, P.mustard, P.porter, P.cook, P.lumberjack];
export function flagPole(seed = 0): PropSpec {
  const b = new Builder(), pen = new Builder();
  const col = FLAG_COLS[seed % FLAG_COLS.length];
  const alt = FLAG_COLS[(seed + 2) % FLAG_COLS.length];
  const H = 5.2;
  b.add(bevel(0.6, 0.35, 0.6, 0.06), P.stone, { p: [0, 0.17, 0], shade: 0.05, seed: 2 });
  b.add(bevel(0.4, 0.2, 0.4, 0.04), P.stoneWarm, { p: [0, 0.45, 0] });
  b.add(cyl(0.05, 0.08, H, 7), P.woodDark, { p: [0, H / 2 + 0.3, 0], shade: 0.05, seed: 3 });
  for (const y of [1.0, 2.6]) b.add(cyl(0.085, 0.085, 0.06, 7), P.copper, { p: [0, y, 0] });
  b.add(ico(0.1, 0), P.copperLight, { p: [0, H + 0.42, 0] });
  b.add(box(0.012, H - 0.6, 0.012), P.rope, { p: [0.07, H / 2 + 0.3, 0] });
  // long swallow-tailed pennant built as a slightly waving strip (node origin at the pole)
  const segs = 5, len = 2.2, h0 = 0.8;
  void segs; void alt;
  const hEnd = h0 * 0.45;
  pen.add(prism([[0, -h0 / 2], [len, -hEnd / 2], [len - 0.3, 0], [len, hEnd / 2], [0, h0 / 2]], 0.03), col, { shade: 0.03, seed: seed + 1 });
  pen.add(prism([[0, -0.05], [len - 0.25, -0.03], [len - 0.25, 0.03], [0, 0.05]], 0.034), P.cream, {});
  pen.add(box(0.06, h0, 0.04), P.cream, { p: [0.03, 0, 0] });
  pen.add(prism([[0, 0.12], [0.09, 0], [0, -0.12], [-0.09, 0]], 0.035), P.ember, { p: [0.4, 0, 0.0] });
  return {
    layers: [{ name: 'body', b }, { name: 'pennant', b: pen, pos: [0.06, H - 0.1, 0] }],
    userData: { radius: 0.4, height: H + 0.5, pennantLength: len },
  };
}

// ---------------------------------------------------------------- lantern string (4 m, tiles along X)
export function lanternString(): PropSpec {
  const b = new Builder(), g = new Builder();
  const half = 2.0, top = 2.6, sag = 0.45;
  for (const x of [-half, half]) {
    b.add(cyl(0.06, 0.08, top + 0.2, 6), P.woodDark, { p: [x, (top + 0.2) / 2, 0] });
    b.add(bevel(0.24, 0.16, 0.24, 0.03), P.stone, { p: [x, 0.08, 0] });
    b.add(box(0.14, 0.07, 0.14), P.snow, { p: [x, top + 0.24, 0] });
  }
  const yAt = (x: number) => top - sag * (1 - (x / half) ** 2);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const x0 = -half + (i / n) * 2 * half, x1 = -half + ((i + 1) / n) * 2 * half;
    const y0 = yAt(x0), y1 = yAt(x1);
    b.add(box(Math.hypot(x1 - x0, y1 - y0), 0.02, 0.02), P.rope, { p: [(x0 + x1) / 2, (y0 + y1) / 2, 0], r: [0, 0, Math.atan2(y1 - y0, x1 - x0)] });
  }
  const lights: V3[] = [];
  const cols = [P.windowGlow, 0xffb060, 0xffd88a];
  for (let i = 0; i < 6; i++) {
    const x = -half + ((i + 0.5) / 6) * 2 * half;
    const y = yAt(x) - 0.2;
    b.add(box(0.01, 0.12, 0.01), P.iron, { p: [x, y + 0.14, 0] });
    b.add(cone(0.1, 0.07, 6), P.copper, { p: [x, y + 0.11, 0] });
    b.add(cyl(0.08, 0.08, 0.02, 6), P.copperDark, { p: [x, y - 0.1, 0] });
    g.add(sphere(0.1, 6, 4), cols[i % 3], { p: [x, y, 0], s: [1, 1.2, 1] });
    lights.push([x, y, 0]);
  }
  return {
    layers: [{ name: 'body', b }, { name: 'glow', b: g, mat: 'glow' }],
    markers: { light: [0, yAt(0) - 0.2, 0] },
    userData: { size: [4, 0.3], width: 4, tileWidth: 4, lightPositions: lights, lightPos: [0, yAt(0) - 0.2, 0], lightColor: P.windowGlow, lightIntensity: 0.8, lightDistance: 6 },
  };
}

// ---------------------------------------------------------------- statue
export function statue(): PropSpec {
  const b = new Builder();
  const W1 = P.woodLight, W2 = P.wood, W3 = P.woodDark;
  // stone plinth with copper plaque
  b.add(bevel(1.3, 0.25, 1.3, 0.06), P.stoneDark, { p: [0, 0.125, 0] });
  b.add(bevel(1.05, 0.6, 1.05, 0.08), P.stone, { p: [0, 0.55, 0], shade: 0.04, seed: 2 });
  b.add(bevel(1.2, 0.12, 1.2, 0.04), P.stoneWarm, { p: [0, 0.9, 0] });
  b.add(bevel(0.5, 0.22, 0.03, 0.01), P.copper, { p: [0, 0.55, 0.53] });
  b.add(prism([[0, 0.07], [0.05, 0], [0, -0.07], [-0.05, 0]], 0.02), P.ember, { p: [0, 0.55, 0.55] });
  const y0 = 0.96;
  // carved Kettlekeeper: boots, quilted coat, scarf, bobble hat, ladle raised high
  for (const sx of [-1, 1]) b.add(bevel(0.2, 0.2, 0.3, 0.05), W3, { p: [sx * 0.13, y0 + 0.1, 0.03] });
  b.add(lathe([[0.0, 0], [0.34, 0], [0.38, 0.15], [0.38, 0.4], [0.33, 0.62], [0.2, 0.76], [0, 0.8]], 10), W1, { p: [0, y0 + 0.18, 0], shade: 0.05, seed: 3 });
  for (const y of [0.3, 0.52]) b.add(cyl(0.385, 0.385, 0.035, 10, true), W2, { p: [0, y0 + 0.18 + y, 0] });
  b.add(cyl(0.39, 0.39, 0.07, 10), W3, { p: [0, y0 + 0.24, 0] }); // belt
  b.add(torus(0.2, 0.08, 4, 10), W2, { p: [0, y0 + 0.95, 0], r: [Math.PI / 2, 0, 0] }); // scarf
  b.add(bevel(0.12, 0.3, 0.05, 0.02), W2, { p: [0.16, y0 + 0.75, 0.33], r: [-0.3, 0.3, 0.3] });
  b.add(sphere(0.3, 10, 7), W1, { p: [0, y0 + 1.25, 0.02] }); // head
  for (const sx of [-1, 1]) b.add(sphere(0.045, 5, 4), W3, { p: [sx * 0.11, y0 + 1.27, 0.29], s: [1, 1.2, 0.5] });
  b.add(sphere(0.05, 5, 4), W2, { p: [0, y0 + 1.21, 0.31] });
  b.add(lathe([[0.33, 0], [0.31, 0.13], [0.2, 0.28], [0, 0.33]], 10), W2, { p: [0, y0 + 1.36, -0.03], r: [-0.25, 0, 0] });
  b.add(cyl(0.335, 0.335, 0.1, 10), W3, { p: [0, y0 + 1.38, -0.03], r: [-0.25, 0, 0] });
  b.add(ico(0.1, 0), W3, { p: [0, y0 + 1.72, -0.13] });
  // left arm resting, right arm raising the ladle
  b.add(cyl(0.1, 0.09, 0.42, 7), W1, { p: [0.4, y0 + 0.6, 0.02], r: [0, 0, 0.25] });
  b.add(sphere(0.1, 6, 5), W2, { p: [0.46, y0 + 0.38, 0.03] });
  b.add(cyl(0.1, 0.09, 0.45, 7), W1, { p: [-0.42, y0 + 0.98, 0.02], r: [0, 0, 2.6] });
  b.add(sphere(0.1, 6, 5), W2, { p: [-0.55, y0 + 1.19, 0.03] });
  b.add(cyl(0.025, 0.03, 0.75, 6), P.copperDark, { p: [-0.6, y0 + 1.55, 0.03], r: [0, 0, 0.12] });
  b.add(lathe([[0, 0], [0.1, 0.02], [0.14, 0.1], [0.13, 0.12]], 8), P.copper, { p: [-0.65, y0 + 1.92, 0.03], r: [Math.PI, 0, 0], top: P.copperLight });
  // snow on the hat and shoulders, a little wreath at the base
  b.add(sphere(0.18, 6, 4), P.snow, { p: [0.05, y0 + 1.66, -0.08], s: [1.2, 0.35, 1] });
  b.add(torus(0.2, 0.06, 4, 10), P.pine, { p: [0.0, 1.0, 0.55], r: [0.2, 0, 0] });
  for (let i = 0; i < 3; i++) b.add(sphere(0.03, 4, 3), P.berry, { p: [-0.1 + i * 0.1, 0.84 + (i % 2) * 0.05, 0.6] });
  return { layers: [{ name: 'body', b }], userData: { radius: 0.75, height: y0 + 2.05 } };
}

// ---------------------------------------------------------------- well
export function well(): PropSpec {
  const b = new Builder();
  const R = 0.75, H = 0.75;
  for (let row = 0; row < 2; row++) for (let i = 0; i < 10; i++) {
    const a = ((i + row * 0.5) / 10) * Math.PI * 2;
    b.add(bevel(0.48, H / 2 - 0.02, 0.26, 0.04), (i + row) % 3 === 0 ? P.stoneWarm : (i + row) % 3 === 1 ? P.stone : 0x9aa0ab, {
      p: [Math.cos(a) * R, H / 4 + (row * H) / 2, Math.sin(a) * R], r: [0, -a + Math.PI / 2, 0], shade: 0.05, seed: i + row * 10,
    });
  }
  b.add(cyl(R + 0.14, R + 0.14, 0.08, 12, true), P.stoneDark, { p: [0, H + 0.02, 0] });
  b.add(cyl(R - 0.12, R - 0.12, 0.05, 12), P.water, { p: [0, H - 0.25, 0] });
  // posts, crank and gable roof
  for (const sx of [-1, 1]) b.add(bevel(0.14, 1.9, 0.14, 0.03), P.woodDark, { p: [sx * (R + 0.05), 0.95, 0] });
  b.add(cyl(0.05, 0.05, 2 * R + 0.4, 6), P.wood, { p: [0, 1.4, 0], r: [0, 0, Math.PI / 2] });
  b.add(box(0.05, 0.3, 0.05), P.iron, { p: [R + 0.25, 1.28, 0] });
  b.add(box(0.05, 0.05, 0.2), P.iron, { p: [R + 0.25, 1.15, 0.08] });
  b.add(cyl(0.09, 0.09, 0.3, 6), P.rope, { p: [0, 1.4, 0], r: [0, 0, Math.PI / 2] });
  b.add(box(0.015, 0.55, 0.015), P.rope, { p: [0, 1.1, 0] });
  b.add(lathe([[0, 0], [0.12, 0], [0.15, 0.22], [0.14, 0.24]], 8), P.wood, { p: [0, 0.6, 0] });
  b.add(cyl(0.15, 0.15, 0.03, 8, true), P.iron, { p: [0, 0.75, 0] });
  for (const sz of [-1, 1]) {
    b.add(bevel(2 * R + 0.5, 0.06, 0.75, 0.02), P.bark, { p: [0, 2.05, sz * 0.3], r: [sz * 0.55, 0, 0] });
    b.add(bevel(2 * R + 0.4, 0.08, 0.68, 0.03), P.snow, { p: [0, 2.11, sz * 0.32], r: [sz * 0.55, 0, 0], bottom: P.snowShade, topY: 0.3 });
  }
  b.add(prism([[-0.5, 0], [0.5, 0], [0, 0.33]], 0.06), P.woodLight, { p: [R + 0.05, 1.88, 0], r: [0, Math.PI / 2, 0] });
  b.add(prism([[-0.5, 0], [0.5, 0], [0, 0.33]], 0.06), P.woodLight, { p: [-R - 0.05, 1.88, 0], r: [0, Math.PI / 2, 0] });
  // spare bucket on the rim + snow
  b.add(lathe([[0, 0], [0.12, 0], [0.15, 0.22], [0.14, 0.24]], 8), P.woodLight, { p: [0.5, H + 0.06, 0.55] });
  b.add(cyl(0.15, 0.15, 0.03, 8, true), P.iron, { p: [0.5, H + 0.2, 0.55] });
  snowMound(b, 0.5, 0.15, 0.4, [-R - 0.2, 0, 0.5], 4);
  return { layers: [{ name: 'body', b }], markers: { bucket: [0, 0.6, 0] }, userData: { radius: R + 0.25 } };
}

// ---------------------------------------------------------------- sleigh-bell arch
export function sleighBell(): PropSpec {
  const b = new Builder(), g = new Builder();
  const W = 3.2, R = W / 2, postH = 2.4;
  for (const sx of [-1, 1]) {
    b.add(bevel(0.24, postH, 0.24, 0.04), P.woodDark, { p: [sx * R, postH / 2, 0] });
    b.add(bevel(0.42, 0.25, 0.42, 0.06), P.stone, { p: [sx * R, 0.12, 0] });
    // candy-twist ribbon on the posts
    for (let i = 0; i < 4; i++) b.add(box(0.26, 0.06, 0.26), P.berry, { p: [sx * R, 0.5 + i * 0.5, 0], r: [0, 0, 0.35] });
  }
  // timber arch with a pine garland
  b.add(torus(R, 0.1, 4, 14, Math.PI), P.wood, { p: [0, postH, 0], shade: 0.04, seed: 2 });
  const r = rng(9);
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    const p: V3 = [Math.cos(a) * R, postH + Math.sin(a) * R, 0.06];
    b.add(ico(0.16, 0), i % 2 ? P.pine : P.pineLight, { p, r: [r(), r(), r()], s: [1, 0.85, 1] });
    if (i % 3 === 0) b.add(sphere(0.045, 5, 4), P.berry, { p: [p[0], p[1] - 0.08, 0.2] });
  }
  b.add(box(0.9, 0.35, 0.06), P.woodPale, { p: [0, postH + R - 0.05, 0.16] });
  b.add(prism([[0, 0.12], [0.09, 0], [0, -0.12], [-0.09, 0]], 0.03), P.ember, { p: [0, postH + R - 0.05, 0.2] });
  // red bows and three brass bells hanging under the crown
  for (const sx of [-1, 1]) {
    b.add(cone(0.12, 0.2, 4), P.harness, { p: [sx * 0.65, postH + 1.32, 0.18], r: [0, 0, sx * Math.PI / 2] });
  }
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.42, y = postH + R - 0.45 - (i === 1 ? 0.15 : 0);
    b.add(box(0.012, 0.3, 0.012), P.harness, { p: [x, y + 0.2, 0.05] });
    b.add(lathe([[0, 0.2], [0.05, 0.18], [0.09, 0.05], [0.12, 0], [0, 0]], 8), P.gold, { p: [x, y - 0.1, 0.05], top: 0xffe08a, topY: 0.6 });
    b.add(sphere(0.03, 4, 3), P.copperDark, { p: [x, y - 0.12, 0.05] });
  }
  // little lanterns on top of the posts
  for (const sx of [-1, 1]) {
    b.add(cone(0.14, 0.12, 4), P.iron, { p: [sx * R, postH + 0.45, 0], r: [0, Math.PI / 4, 0] });
    g.add(box(0.13, 0.18, 0.13), P.windowGlow, { p: [sx * R, postH + 0.3, 0] });
  }
  b.add(box(W + 0.2, 0.08, 0.15), P.snow, { p: [0, postH + R + 0.08, 0], s: [0.25, 1, 1] });
  return {
    layers: [{ name: 'body', b }, { name: 'glow', b: g, mat: 'glow' }],
    userData: { size: [W + 0.5, 0.5], width: W, opening: W - 0.3, height: postH + R + 0.2, lightPos: [0, postH + 0.3, 0], lightColor: P.windowGlow },
  };
}

// ---------------------------------------------------------------- ice sculpture (swan)
export function iceSculpture(): PropSpec {
  const b = new Builder(), ice = new Builder();
  // packed-snow plinth
  b.add(bevel(1.2, 0.55, 0.9, 0.12), P.snow, { p: [0, 0.27, 0], bottom: P.snowShade, topY: 0.5, jitter: 0.02, seed: 2 });
  b.add(bevel(1.3, 0.08, 1.0, 0.03), P.snowShade, { p: [0, 0.04, 0] });
  // swan: body, curved neck, head, beak, raised wings
  const y = 0.55;
  ice.add(sphere(0.38, 10, 7), P.ice, { p: [0, y + 0.28, 0], s: [1.35, 0.7, 0.85], shade: 0.06, seed: 3 });
  ice.add(cone(0.18, 0.5, 6), P.frost, { p: [-0.55, y + 0.42, 0], r: [0, 0, 1.0] }); // tail
  ice.add(torus(0.28, 0.07, 6, 10, Math.PI * 1.15), P.iceTeal, { p: [0.32, y + 0.7, 0], r: [0, 0, -0.35] });
  ice.add(sphere(0.12, 8, 6), P.ice, { p: [0.36, y + 1.0, 0], s: [1.1, 0.9, 0.85] });
  ice.add(cone(0.05, 0.2, 5), P.iceDeep, { p: [0.53, y + 0.96, 0], r: [0, 0, -Math.PI / 2 - 0.3] });
  for (const sz of [-1, 1]) {
    ice.add(prism([[-0.45, 0], [0.3, 0.05], [0.1, 0.42], [-0.3, 0.55]], 0.06), sz < 0 ? P.frost : P.ice, {
      p: [-0.05, y + 0.3, sz * 0.3], r: [sz * 0.45, 0, 0], jitter: 0.02, seed: sz + 5,
    });
  }
  // crystal sparkles around the base
  for (let i = 0; i < 4; i++) ice.add(octa(0.08), P.iceTeal, { p: [-0.45 + i * 0.3, 0.62, 0.35 * (i % 2 ? 1 : -1)], s: [0.6, 1.4, 0.6] });
  return {
    layers: [{ name: 'body', b }, { name: 'ice', b: ice, mat: 'ice', shadow: true }],
    userData: { radius: 0.75, height: 1.7 },
  };
}

// ---------------------------------------------------------------- market stall
const STALL = [[P.porter, P.cream], [P.mustard, 0x7a4a6e], [P.lumberjack, P.cream]] as const;
export function marketStall(seed = 0): PropSpec {
  const b = new Builder(), g = new Builder();
  const [c1, c2] = STALL[seed % STALL.length];
  const W = 2.2, D = 0.9, H = 0.9;
  b.add(bevel(W, H - 0.1, D - 0.15, 0.04), P.wood, { p: [0, (H - 0.1) / 2, -0.05], shade: 0.04, seed: 4 });
  for (let i = 0; i < 5; i++) b.add(box(W / 5 - 0.03, H - 0.2, 0.04), i % 2 ? P.woodLight : c1, { p: [-W / 2 + W / 10 + (i * W) / 5, (H - 0.1) / 2, D / 2 - 0.1] });
  b.add(bevel(W + 0.1, 0.08, D, 0.03), P.woodPale, { p: [0, H, 0] });
  for (const sx of [-1, 1]) b.add(cyl(0.05, 0.06, 1.55, 6), P.woodDark, { p: [sx * (W / 2 - 0.02), H + 0.75, -D / 2 + 0.05] });
  // scalloped striped awning, sloping forward
  const stripes = 7;
  for (let i = 0; i < stripes; i++) {
    const w = (W + 0.3) / stripes, x = -(W + 0.3) / 2 + w * (i + 0.5);
    const c = i % 2 ? c2 : c1;
    b.add(box(w, 0.05, 0.85), c, { p: [x, H + 1.32, -0.08], r: [0.4, 0, 0] });
    b.add(cyl(w / 2, w / 2, 0.04, 6, false), c, { p: [x, H + 1.13, 0.32], r: [Math.PI / 2, 0, 0], s: [1, 1, 1] });
  }
  b.add(sphere(0.25, 6, 4), P.snow, { p: [-0.5, H + 1.45, -0.25], s: [1.6, 0.25, 0.8] });
  // goods: crates of apples, cabbages and fish on the counter and the ground
  const crateAt = (x: number, y: number, z: number, fill: number, kind: 'round' | 'leaf' | 'fish') => {
    b.add(box(0.5, 0.22, 0.38), P.woodLight, { p: [x, y + 0.11, z], shade: 0.05, seed: Math.round(x * 10) });
    b.add(box(0.52, 0.04, 0.4), P.woodDark, { p: [x, y + 0.2, z] });
    for (let i = 0; i < 6; i++) {
      const px = x - 0.16 + (i % 3) * 0.16, pz = z - 0.08 + Math.floor(i / 3) * 0.16;
      if (kind === 'fish') b.add(sphere(0.12, 6, 3), fill, { p: [px, y + 0.25, pz], s: [0.5, 0.35, 1.0], r: [0, 0.3, 0] });
      else b.add(kind === 'leaf' ? ico(0.08, 0) : sphere(0.065, 6, 4), fill, { p: [px, y + 0.26, pz] });
    }
  };
  crateAt(-0.6, H + 0.04, 0.05, P.berry, 'round');
  crateAt(0.05, H + 0.04, 0.05, P.herb, 'leaf');
  crateAt(0.9, 0, D / 2 + 0.35, P.fish, 'fish');
  b.add(lathe([[0, 0], [0.3, 0], [0.34, 0.35], [0.3, 0.7], [0, 0.7]], 8), P.wood, { p: [-1.0, 0, D / 2 + 0.3] });
  // hanging lantern + garlands of sausages / dried herbs under the awning
  b.add(box(0.01, 0.25, 0.01), P.iron, { p: [0.75, H + 1.05, 0.2] });
  b.add(cone(0.1, 0.08, 4), P.copper, { p: [0.75, H + 0.92, 0.2], r: [0, Math.PI / 4, 0] });
  g.add(box(0.12, 0.16, 0.12), P.windowGlow, { p: [0.75, H + 0.8, 0.2] });
  for (let i = 0; i < 4; i++) b.add(sphere(0.05, 5, 4), 0xa0482a, { p: [-0.9 + i * 0.16, H + 1.0 - (i % 2) * 0.05, 0.15], s: [0.8, 1.5, 0.8] });
  return {
    layers: [{ name: 'body', b }, { name: 'glow', b: g, mat: 'glow' }],
    markers: { itemAnchor: [0, H + 0.06, 0], queuePoint: [0, 0, D / 2 + 1.0] },
    userData: { size: [W + 0.2, D + 0.5], radius: 1.2, lightPos: [0.75, H + 0.8, 0.5], lightColor: P.windowGlow },
  };
}

// ---------------------------------------------------------------- campfire ring
export function campfireRing(): PropSpec {
  const b = new Builder(), fl = new Builder(), em = new Builder();
  stoneRing(b, 0.55, 9, 0.13, 41);
  b.add(cyl(0.45, 0.45, 0.04, 9), P.coal, { p: [0, 0.02, 0] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    logBetween(b, [Math.cos(a) * 0.38, 0.03, Math.sin(a) * 0.38], [Math.cos(a) * 0.05, 0.5, Math.sin(a) * 0.05], 0.05, P.bark, P.woodPale, 5);
  }
  coals(em, 0.3, 6, 7, 0.05);
  flame(fl, 0.75, 0.24, 21, [0, 0, 0], 5);
  // log seats around, each a split log on two little stumps
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4, R = 1.35;
    const cx = Math.cos(a) * R, cz = Math.sin(a) * R;
    const tx = -Math.sin(a) * 0.55, tz = Math.cos(a) * 0.55;
    logBetween(b, [cx - tx, 0.24, cz - tz], [cx + tx, 0.24, cz + tz], 0.15, P.bark, P.woodPale, 7);
    b.add(box(1.0, 0.03, 0.2), P.woodLight, { p: [cx, 0.385, cz], r: [0, -a + Math.PI / 2, 0] });
  }
  // a kettle-shaped tin mug and a blanket on one seat
  b.add(cyl(0.06, 0.05, 0.12, 7), P.copper, { p: [Math.cos(Math.PI / 4) * 1.35, 0.46, Math.sin(Math.PI / 4) * 1.35] });
  b.add(bevel(0.45, 0.06, 0.3, 0.02), P.coatRust, { p: [Math.cos(Math.PI * 1.25) * 1.35, 0.43, Math.sin(Math.PI * 1.25) * 1.35], r: [0, 0.8, 0] });
  return {
    layers: [{ name: 'body', b }, { name: 'coals', b: em, mat: 'ember', shadow: false }, { name: 'flame', b: fl, mat: 'glow', pos: [0, 0.04, 0] }],
    markers: { light: [0, 0.7, 0] },
    userData: { radius: 1.8, seatRadius: 1.35, seats: 4, lightPos: [0, 0.7, 0], lightColor: P.flame, lightIntensity: 1.0, lightDistance: 6 },
  };
}

// ---------------------------------------------------------------- caravan (trader's covered sled)
export function caravan(): PropSpec {
  const b = new Builder(), g = new Builder();
  const L = 3.4, W = 1.6;
  // runners with curled fronts
  for (const sx of [-1, 1]) {
    b.add(box(0.07, 0.07, L), P.copperDark, { p: [sx * (W / 2 - 0.05), 0.04, 0] });
    b.add(torus(0.2, 0.035, 3, 6, Math.PI / 2), P.copperDark, { p: [sx * (W / 2 - 0.05), 0.24, L / 2], r: [0, Math.PI / 2, 0] });
    for (const z of [-1.2, 0, 1.2]) b.add(box(0.07, 0.3, 0.07), P.woodDark, { p: [sx * (W / 2 - 0.05), 0.2, z] });
  }
  // wagon bed + painted side panels
  b.add(bevel(W, 0.55, L - 0.3, 0.05), P.wood, { p: [0, 0.6, -0.1], shade: 0.04, seed: 3 });
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
    b.add(box(0.03, 0.32, 0.6), i % 2 ? P.mustard : P.porter, { p: [sx * (W / 2 + 0.005), 0.6, -1.35 + i * 0.75] });
    b.add(prism([[0, 0.1], [0.08, 0], [0, -0.1], [-0.08, 0]], 0.02), P.cream, { p: [sx * (W / 2 + 0.02), 0.6, -1.35 + i * 0.75], r: [0, Math.PI / 2, 0] });
  }
  // canvas cover: hoop segments with patterned stripes
  const segs = 6, cl = L - 0.6;
  for (let i = 0; i < segs; i++) {
    const z = -cl / 2 - 0.1 + ((i + 0.5) * cl) / segs;
    const cover = new THREE.CylinderGeometry(W / 2 + 0.05, W / 2 + 0.05, cl / segs + 0.01, 10, 1, true, -Math.PI / 2, Math.PI);
    b.add(cover, i % 2 ? P.canvas : P.coatRust, { p: [0, 0.88, z], r: [-Math.PI / 2, 0, 0], s: [1, 1, 1.25], shade: 0.03, seed: i });
    if (i % 2 === 0) b.add(prism([[0, 0.16], [0.13, 0], [0, -0.16], [-0.13, 0]], 0.02), P.mustard, { p: [0, 1.88, z], r: [-Math.PI / 2, 0, 0] });
  }
  for (const z of [-cl / 2 - 0.1, cl / 2 - 0.1]) b.add(torus(W / 2 + 0.07, 0.04, 3, 10, Math.PI), P.woodDark, { p: [0, 0.88, z], s: [1, 1.25, 1] });
  b.add(sphere(0.5, 7, 4), P.snow, { p: [0.1, 1.8, 0.2], s: [1.1, 0.25, 1.4] });
  // driver's bench, shafts, lantern on a pole
  b.add(bevel(W, 0.1, 0.4, 0.03), P.woodDark, { p: [0, 0.95, L / 2 - 0.2] });
  for (const sx of [-1, 1]) b.add(box(0.06, 0.06, 1.2), P.woodLight, { p: [sx * 0.45, 0.35, L / 2 + 0.5], r: [-0.15, 0, 0] });
  b.add(cyl(0.035, 0.04, 1.3, 5), P.woodDark, { p: [W / 2 - 0.1, 1.6, L / 2 - 0.1] });
  b.add(box(0.3, 0.04, 0.04), P.iron, { p: [W / 2 + 0.03, 2.2, L / 2 - 0.1] });
  b.add(cone(0.13, 0.12, 4), P.copper, { p: [W / 2 + 0.15, 2.07, L / 2 - 0.1], r: [0, Math.PI / 4, 0] });
  g.add(box(0.13, 0.18, 0.13), P.windowGlow, { p: [W / 2 + 0.15, 1.92, L / 2 - 0.1] });
  // goods strapped at the back: crates and a barrel
  b.add(bevel(0.5, 0.45, 0.45, 0.04), P.woodLight, { p: [-0.35, 0.3, -L / 2 - 0.1] });
  b.add(bevel(0.4, 0.35, 0.4, 0.04), P.wood, { p: [-0.3, 0.7, -L / 2 - 0.1], r: [0, 0.3, 0] });
  b.add(lathe([[0, 0], [0.22, 0], [0.26, 0.28], [0.22, 0.55], [0, 0.55]], 8), P.wood, { p: [0.35, 0.08, -L / 2 - 0.1] });
  b.add(cyl(0.27, 0.27, 0.04, 8, true), P.iron, { p: [0.35, 0.36, -L / 2 - 0.1] });
  b.add(box(1.1, 0.03, 0.04), P.rope, { p: [0, 0.6, -L / 2 + 0.12] });
  return {
    layers: [{ name: 'body', b }, { name: 'glow', b: g, mat: 'glow' }],
    markers: { light: [W / 2 + 0.15, 1.92, L / 2 - 0.1], front: [0, 0, L / 2 + 1.2] },
    userData: { size: [W + 0.4, L + 1.0], radius: 2.1, lightPos: [W / 2 + 0.15, 1.92, L / 2 - 0.1], lightColor: P.windowGlow, lightIntensity: 0.8, lightDistance: 5 },
  };
}

// ---------------------------------------------------------------- aurora curtain
/** ~60 m wide ribbon of vertical quads, base at y = 0, green -> teal -> violet with alpha falloff.
 *  Additive material; the view places it in the sky and waves it by scaling/offsetting. */
export function aurora(): PropSpec {
  const cols = 48, W = 60;
  const rows: [number, number, number, number, number][] = [
    // [heightFraction, r, g, b, alpha]
    [0.0, 0.2, 1.0, 0.55, 0.0],
    [0.12, 0.3, 1.0, 0.6, 0.75],
    [0.45, 0.2, 0.85, 0.8, 0.45],
    [0.75, 0.55, 0.35, 1.0, 0.22],
    [1.0, 0.6, 0.3, 1.0, 0.0],
  ];
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i <= cols; i++) {
    const u = i / cols;
    const x = (u - 0.5) * W;
    const z = Math.sin(u * Math.PI * 3.2) * 4 + Math.sin(u * Math.PI * 7.1) * 1.2;
    const h = 14 + Math.sin(u * Math.PI * 5.3 + 1) * 4 + Math.sin(u * Math.PI * 11) * 1.5;
    const edge = Math.min(1, u / 0.15, (1 - u) / 0.15);
    const flick = 0.75 + 0.25 * Math.sin(u * 37.0);
    for (const [f, r, g, bl, a] of rows) {
      pos.push(x, f * h, z + f * 1.5);
      col.push(r, g, bl, a * edge * flick);
    }
  }
  const R = rows.length;
  for (let i = 0; i < cols; i++) for (let k = 0; k < R - 1; k++) {
    const a = i * R + k, bb = (i + 1) * R + k;
    idx.push(a, bb, a + 1, bb, bb + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return {
    layers: [{ name: 'curtain', b: new Builder(), geo, mat: 'aurora', shadow: false }],
    userData: { width: W, height: 20, sky: true, note: 'Place ~60-120 m away at y 25-40; animate by scaling Y (0.8-1.2) and offsetting X.' },
  };
}
