// Beacon, camp furniture and small decor props.
import { Builder, bevel, box, cone, cyl, ico, lathe, prism, rng, sphere, torus } from '../geo';
import { PALETTE as P } from '../palette';
import { coals, flame, logBetween, snowMound, type PropSpec } from './common';

// ---------------------------------------------------------------- beacon (0..4)
export function beacon(level: number): PropSpec {
  const L = Math.max(0, Math.min(4, Math.round(level)));
  const b = new Builder(), fl = new Builder(), em = new Builder();
  const stones = [P.stone, P.stoneWarm, 0x9aa0ab];
  // foundation (always)
  b.add(bevel(4.2, 0.4, 4.2, 0.1), P.stoneDark, { p: [0, 0.2, 0], shade: 0.04, seed: 1, top: P.stone, topY: 0.8 });
  b.add(bevel(3.2, 0.25, 3.2, 0.06), P.stone, { p: [0, 0.52, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(bevel(0.6, 0.5, 0.6, 0.08), P.stoneWarm, { p: [sx * 1.85, 0.5, sz * 1.85] });
  let top = 0.65;
  if (L === 0) {
    // building site: stakes, rope line, stone pile, plan sign
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(box(0.08, 0.9, 0.08), P.woodLight, { p: [sx * 1.3, 1.0, sz * 1.3] });
    for (const [x, z, ry] of [[0, 1.3, 0], [0, -1.3, 0], [1.3, 0, Math.PI / 2], [-1.3, 0, Math.PI / 2]] as const)
      b.add(box(2.6, 0.02, 0.02), P.coatRust, { p: [x, 1.3, z], r: [0, ry, 0] });
    const r = rng(3);
    for (let i = 0; i < 7; i++) b.add(ico(0.22), stones[i % 3], { p: [-0.5 + r() * 1.0, 0.75 + (i > 4 ? 0.25 : 0), -0.4 + r() * 0.8], s: [1.2, 0.8, 1], jitter: 0.03, seed: i });
    b.add(box(0.08, 1.2, 0.08), P.woodDark, { p: [2.4, 0.6, 1.8] });
    b.add(bevel(0.8, 0.5, 0.06, 0.02), P.woodPale, { p: [2.4, 1.1, 1.84] });
    b.add(prism([[0, 0.17], [0.1, 0], [0, -0.17], [-0.1, 0]], 0.02), P.ember, { p: [2.4, 1.1, 1.88] });
  }
  if (L >= 1) {
    // stone base storey, slightly tapered, with door arch
    const rows = 5;
    for (let i = 0; i < rows; i++) {
      const w = 3.0 - i * 0.08;
      b.add(bevel(w, 0.6, w, 0.06), stones[i % 3], { p: [0, top + 0.3 + i * 0.6, 0], shade: 0.04, seed: 10 + i });
    }
    b.add(bevel(1.0, 1.6, 0.1, 0.04), 0x3a2c24, { p: [0, top + 0.8, 1.48] });
    b.add(torus(0.5, 0.1, 3, 8, Math.PI), P.stoneDark, { p: [0, top + 1.6, 1.5] });
    top += rows * 0.6;
    b.add(bevel(3.0, 0.18, 3.0, 0.05), P.stoneDark, { p: [0, top + 0.09, 0] });
    top += 0.18;
    if (L === 1) b.add(box(2.3, 0.12, 2.3), P.snow, { p: [0, top + 0.06, 0] });
  }
  if (L >= 2) {
    // timber frame storey
    const h = 2.6, w = 2.4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(bevel(0.26, h, 0.26, 0.04), P.woodDark, { p: [sx * w / 2, top + h / 2, sz * w / 2] });
    for (const [x, z, ry] of [[0, w / 2, 0], [0, -w / 2, 0], [w / 2, 0, Math.PI / 2], [-w / 2, 0, Math.PI / 2]] as const) {
      b.add(box(w, 0.16, 0.16), P.wood, { p: [x, top + h - 0.1, z], r: [0, ry, 0] });
      b.add(box(Math.hypot(w, h - 0.3), 0.12, 0.12), P.wood, { p: [x, top + h / 2, z], r: [0, ry, Math.atan2(h - 0.3, w)] });
    }
    // inner stair core
    b.add(bevel(1.2, h, 1.2, 0.06), P.stone, { p: [0, top + h / 2, 0] });
    top += h;
    b.add(bevel(2.8, 0.18, 2.8, 0.04), P.woodLight, { p: [0, top + 0.09, 0] });
    top += 0.18;
    if (L === 2) b.add(box(2.2, 0.1, 2.2), P.snow, { p: [0, top + 0.05, 0] });
  }
  if (L >= 3) {
    // upper stone storey with a balcony rail and banners
    const rows = 3;
    for (let i = 0; i < rows; i++) b.add(bevel(2.1 - i * 0.06, 0.55, 2.1 - i * 0.06, 0.05), stones[(i + 1) % 3], { p: [0, top + 0.275 + i * 0.55, 0], shade: 0.04, seed: 20 + i });
    for (const sx of [-1, 1]) {
      b.add(box(0.7, 1.4, 0.03), sx < 0 ? P.coatRust : P.mustard, { p: [sx * 0.55, top + 0.8, 1.04] });
      b.add(prism([[-0.35, 0], [0.35, 0], [0, -0.25]], 0.03), sx < 0 ? P.coatRust : P.mustard, { p: [sx * 0.55, top + 0.1, 1.04] });
    }
    // balcony posts around the timber deck
    for (let i = 0; i < 12; i++) {
      const s = i % 3, side = Math.floor(i / 3);
      const t = -1.2 + s * 1.2;
      const [x, z] = side === 0 ? [t, 1.35] : side === 1 ? [1.35, -t] : side === 2 ? [-t, -1.35] : [-1.35, t];
      b.add(box(0.08, 0.6, 0.08), P.woodDark, { p: [x, top + 0.3, z] });
    }
    for (const [x, z, ry] of [[0, 1.35, 0], [0, -1.35, 0], [1.35, 0, Math.PI / 2], [-1.35, 0, Math.PI / 2]] as const)
      b.add(box(2.78, 0.08, 0.08), P.wood, { p: [x, top + 0.6, z], r: [0, ry, 0] });
    top += rows * 0.55;
    b.add(bevel(2.4, 0.2, 2.4, 0.05), P.stoneDark, { p: [0, top + 0.1, 0] });
    top += 0.2;
    if (L === 3) b.add(box(1.9, 0.1, 1.9), P.snow, { p: [0, top + 0.05, 0] });
  }
  let flameY = top;
  if (L >= 4) {
    // brazier crown: four copper-clad pillars holding a great bowl
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.add(bevel(0.28, 1.1, 0.28, 0.05), P.stone, { p: [sx * 0.85, top + 0.55, sz * 0.85] });
      b.add(cone(0.24, 0.4, 4), P.copper, { p: [sx * 0.85, top + 1.3, sz * 0.85], r: [0, Math.PI / 4, 0] });
    }
    b.add(lathe([[0, 0], [0.4, 0], [0.9, 0.35], [1.15, 0.75], [1.05, 0.8], [0.0, 0.6]], 10), P.copper, { p: [0, top + 0.5, 0], top: P.copperLight, topY: 0.5, shade: 0.04, seed: 9 });
    b.add(cyl(1.16, 1.16, 0.08, 10, true), P.copperDark, { p: [0, top + 1.2, 0] });
    b.add(cyl(0.95, 0.95, 0.05, 10), P.coal, { p: [0, top + 1.12, 0] });
    for (let i = 0; i < 5; i++) logBetween(b, [Math.cos(i * 1.25) * 0.7, top + 1.15, Math.sin(i * 1.25) * 0.7], [Math.cos(i * 1.25) * 0.1, top + 1.75, Math.sin(i * 1.25) * 0.1], 0.08);
    coals(em, 0.75, 10, 4, top + 1.17);
    flameY = top + 1.15;
    flame(fl, 2.6, 0.85, 7);
    top += 1.3;
  }
  const lightY = L >= 4 ? flameY + 1.2 : top + 0.5;
  const layers: PropSpec['layers'] = [{ name: 'body', b }];
  if (L >= 4) {
    layers.push({ name: 'coals', b: em, mat: 'ember', shadow: false });
    layers.push({ name: 'flame', b: fl, mat: 'glow', pos: [0, flameY, 0], visible: false });
  }
  return {
    layers,
    markers: { top: [0, top, 0], light: [0, lightY, 0], depositPoint: [0, 0, 2.6] },
    userData: { level: L, size: [4.2, 4.2], radius: 2.4, height: top, lightPos: [0, lightY, 0], lightColor: P.flame, lightIntensity: 4, lightDistance: 40 },
  };
}

// ---------------------------------------------------------------- fence (2 m along X)
export function fence(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 1);
  for (const x of [-1, 1]) {
    b.add(bevel(0.14, 1.1, 0.14, 0.03), P.woodDark, { p: [x, 0.55, 0], r: [0, 0, (r() - 0.5) * 0.06] });
    b.add(box(0.16, 0.08, 0.16), P.snow, { p: [x, 1.14, 0] });
  }
  for (const y of [0.45, 0.85]) b.add(box(2.0, 0.1, 0.06), y > 0.5 ? P.wood : P.woodLight, { p: [0, y + (r() - 0.5) * 0.04, 0.08], r: [0, 0, (r() - 0.5) * 0.04], shade: 0.04, seed });
  b.add(box(1.7, 0.05, 0.08), P.snow, { p: [(r() - 0.5) * 0.2, 0.92, 0.08] });
  snowMound(b, 0.5, 0.12, 0.25, [(r() - 0.5) * 1.2, 0, 0.05], seed);
  return { layers: [{ name: 'body', b }], userData: { size: [2, 0.3], width: 2, tileWidth: 2 } };
}

export function gate(): PropSpec {
  const b = new Builder(), glow = new Builder();
  const W = 3.2;
  for (const sx of [-1, 1]) {
    b.add(bevel(0.32, 3.0, 0.32, 0.05), P.woodDark, { p: [sx * W / 2, 1.5, 0] });
    b.add(bevel(0.5, 0.3, 0.5, 0.06), P.stone, { p: [sx * W / 2, 0.15, 0] });
    b.add(box(0.36, 0.1, 0.36), P.snow, { p: [sx * W / 2, 3.04, 0] });
    // open door halves
    b.add(bevel(1.3, 1.5, 0.08, 0.02), P.wood, { p: [sx * (W / 2 - 0.1), 0.95, 0.7], r: [0, sx * Math.PI / 2 * 0.9, 0], shade: 0.04, seed: sx + 4 });
    b.add(box(0.06, 0.12, 0.3), P.iron, { p: [sx * (W / 2 - 0.05), 1.4, 0.15] });
    // lanterns
    b.add(box(0.2, 0.26, 0.2), P.iron, { p: [sx * (W / 2 + 0.3), 2.2, 0.2] });
    glow.add(box(0.14, 0.18, 0.14), P.windowGlow, { p: [sx * (W / 2 + 0.3), 2.2, 0.2] });
    b.add(box(0.35, 0.05, 0.05), P.iron, { p: [sx * (W / 2 + 0.15), 2.45, 0.2] });
  }
  b.add(bevel(W + 0.7, 0.28, 0.3, 0.05), P.wood, { p: [0, 2.7, 0] });
  b.add(box(W + 0.6, 0.1, 0.3), P.snow, { p: [0, 2.88, 0] });
  b.add(bevel(1.4, 0.5, 0.08, 0.03), P.woodPale, { p: [0, 2.3, 0.16] });
  b.add(prism([[0, 0.17], [0.12, 0], [0, -0.17], [-0.12, 0]], 0.03), P.ember, { p: [0, 2.3, 0.21] });
  return { layers: [{ name: 'body', b }, { name: 'lamps', b: glow, mat: 'glow' }], userData: { size: [W + 0.8, 0.5], width: W, opening: W - 0.4 } };
}

// ---------------------------------------------------------------- fire & light
export function brazier(): PropSpec {
  const b = new Builder(), fl = new Builder(), em = new Builder();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.add(box(0.06, 1.0, 0.06), P.iron, { p: [Math.cos(a) * 0.25, 0.48, Math.sin(a) * 0.25], r: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25] });
  }
  b.add(lathe([[0, 0], [0.15, 0], [0.38, 0.2], [0.42, 0.3], [0, 0.22]], 8), P.iron, { p: [0, 0.85, 0], top: P.coal, topY: 0.8 });
  b.add(cyl(0.42, 0.42, 0.05, 8, true), P.copper, { p: [0, 1.13, 0] });
  coals(em, 0.28, 6, 2, 1.1);
  flame(fl, 0.75, 0.25, 5);
  return {
    layers: [{ name: 'body', b }, { name: 'coals', b: em, mat: 'ember', shadow: false }, { name: 'flame', b: fl, mat: 'glow', pos: [0, 1.08, 0] }],
    markers: { light: [0, 1.5, 0] },
    userData: { radius: 0.45, lightPos: [0, 1.5, 0], lightColor: P.flame, lightIntensity: 1, lightDistance: 5 },
  };
}

export function lantern(): PropSpec {
  const b = new Builder(), glow = new Builder();
  b.add(cyl(0.06, 0.08, 2.1, 6), P.woodDark, { p: [0, 1.05, 0] });
  b.add(bevel(0.25, 0.2, 0.25, 0.04), P.stone, { p: [0, 0.1, 0] });
  b.add(box(0.6, 0.06, 0.06), P.woodDark, { p: [0.25, 2.0, 0] });
  b.add(box(0.015, 0.15, 0.015), P.iron, { p: [0.45, 1.9, 0] });
  b.add(bevel(0.24, 0.05, 0.24, 0.02), P.iron, { p: [0.45, 1.53, 0] });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.add(box(0.03, 0.26, 0.03), P.iron, { p: [0.45 + x * 0.1, 1.68, z * 0.1] });
  b.add(cone(0.19, 0.16, 4), P.copper, { p: [0.45, 1.89, 0], r: [0, Math.PI / 4, 0] });
  glow.add(box(0.16, 0.22, 0.16), P.windowGlow, { p: [0.45, 1.67, 0] });
  b.add(box(0.15, 0.06, 0.1), P.snow, { p: [0.1, 2.06, 0] });
  return {
    layers: [{ name: 'body', b }, { name: 'glow', b: glow, mat: 'glow' }],
    markers: { light: [0.45, 1.67, 0] },
    userData: { radius: 0.2, lightPos: [0.45, 1.67, 0], lightColor: P.windowGlow, lightIntensity: 0.8, lightDistance: 5 },
  };
}

export function signpost(): PropSpec {
  const b = new Builder();
  b.add(cyl(0.07, 0.08, 2.2, 6), P.woodDark, { p: [0, 1.1, 0] });
  const arrows: [number, number, number][] = [[1.7, 0.4, P.woodPale], [1.35, -0.7, P.mustard], [1.0, 2.2, P.porter]];
  for (const [y, ry, c] of arrows)
    b.add(prism([[-0.1, -0.1], [0.55, -0.1], [0.7, 0], [0.55, 0.1], [-0.1, 0.1]], 0.05), c, { p: [0, y, 0], r: [0, ry, 0], s: [1, 1.2, 1] });
  b.add(box(0.18, 0.08, 0.18), P.snow, { p: [0, 2.22, 0] });
  snowMound(b, 0.35, 0.12, 0.35, [0, 0, 0], 2);
  return { layers: [{ name: 'body', b }], userData: { radius: 0.3 } };
}

// ---------------------------------------------------------------- small decor
export function sled(): PropSpec {
  const b = new Builder();
  for (const sx of [-1, 1]) {
    b.add(box(0.05, 0.05, 1.6), P.copperDark, { p: [sx * 0.4, 0.04, -0.05] });
    b.add(torus(0.15, 0.025, 3, 6, Math.PI / 2), P.copperDark, { p: [sx * 0.4, 0.19, 0.75], r: [0, Math.PI / 2, 0] });
    for (const z of [-0.6, 0, 0.5]) b.add(box(0.05, 0.22, 0.05), P.woodDark, { p: [sx * 0.4, 0.15, z] });
  }
  for (let i = 0; i < 5; i++) b.add(box(0.95, 0.05, 0.27), i % 2 ? P.woodLight : P.wood, { p: [0, 0.28, -0.7 + i * 0.29] });
  b.add(bevel(0.55, 0.4, 0.5, 0.04), P.woodLight, { p: [-0.1, 0.5, -0.35], r: [0, 0.2, 0] });
  b.add(cyl(0.18, 0.18, 0.6, 7), P.canvas, { p: [0.15, 0.48, 0.3], r: [0, 0, Math.PI / 2] });
  b.add(box(0.98, 0.03, 0.04), P.rope, { p: [0, 0.68, -0.35] });
  b.add(cyl(0.015, 0.015, 0.8, 4), P.rope, { p: [0, 0.3, 1.0], r: [Math.PI / 2 - 0.3, 0, 0] });
  return { layers: [{ name: 'body', b }], userData: { size: [1.0, 1.8], radius: 0.95 } };
}

export function crate(seed = 0): PropSpec {
  const b = new Builder();
  const one = (x: number, y: number, z: number, s: number, ry: number) => {
    b.add(box(s - 0.04, s - 0.04, s - 0.04), P.wood, { p: [x, y + s / 2, z], r: [0, ry, 0], shade: 0.05, seed: Math.round(y * 10) });
    for (const e of [-1, 1]) {
      b.add(box(s, 0.08, s + 0.01), P.woodDark, { p: [x, y + s / 2 + e * (s / 2 - 0.04), z], r: [0, ry, 0] });
    }
    b.add(box(s - 0.06, 0.08, s + 0.02), P.woodDark, { p: [x, y + s / 2, z], r: [0, ry, Math.PI / 4] });
    b.add(box(s - 0.12, 0.05, s - 0.12), P.snow, { p: [x, y + s + 0.02, z], r: [0, ry, 0] });
  };
  one(0, 0, 0, 0.8, 0);
  if (seed % 3 === 1) one(0.05, 0.8, 0.0, 0.6, 0.4);
  if (seed % 3 === 2) one(0.85, 0, 0.15, 0.65, -0.3);
  return { layers: [{ name: 'body', b }], userData: { radius: seed % 3 === 2 ? 0.9 : 0.55 } };
}

export function barrel(): PropSpec {
  const b = new Builder();
  b.add(lathe([[0, 0], [0.32, 0], [0.38, 0.25], [0.39, 0.45], [0.36, 0.75], [0.31, 0.9], [0, 0.9]], 10), P.wood, { shade: 0.05, seed: 3, top: P.snow, topY: 0.95 });
  for (const y of [0.12, 0.45, 0.78]) b.add(cyl(0.39 - Math.abs(y - 0.45) * 0.15, 0.39 - Math.abs(y - 0.45) * 0.15, 0.05, 10, true), P.iron, { p: [0, y, 0] });
  b.add(sphere(0.25, 7, 4), P.snow, { p: [0.03, 0.9, 0], s: [1, 0.35, 1], jitter: 0.02, seed: 2 });
  return { layers: [{ name: 'body', b }], userData: { radius: 0.4 } };
}

export function snowman(seed = 0): PropSpec {
  const b = new Builder();
  const scarf = [P.coatRust, P.porter, P.cook][seed % 3];
  b.add(sphere(0.5, 10, 7), P.snow, { p: [0, 0.42, 0], bottom: P.snowShade, topY: 0.3, jitter: 0.02, seed });
  b.add(sphere(0.36, 9, 6), P.snow, { p: [0, 1.05, 0], jitter: 0.015, seed: seed + 1 });
  b.add(sphere(0.27, 9, 6), P.snow, { p: [0, 1.55, 0] });
  for (const sx of [-1, 1]) b.add(sphere(0.035, 5, 4), P.coal, { p: [sx * 0.09, 1.62, 0.24] });
  b.add(cone(0.05, 0.28, 5), P.carrot, { p: [0, 1.56, 0.38], r: [Math.PI / 2, 0, 0] });
  for (const y of [0.95, 1.12]) b.add(sphere(0.035, 5, 4), P.coal, { p: [0, y, 0.35] });
  b.add(torus(0.24, 0.06, 4, 10), scarf, { p: [0, 1.32, 0], r: [Math.PI / 2, 0, 0] });
  b.add(box(0.1, 0.32, 0.04), scarf, { p: [0.14, 1.15, 0.26], r: [-0.2, 0, 0.2] });
  for (const sx of [-1, 1]) b.add(cyl(0.02, 0.025, 0.65, 4), P.bark, { p: [sx * 0.55, 1.2, 0], r: [0, 0, sx * -1.0] });
  b.add(lathe([[0.17, 0], [0.2, 0.25], [0, 0.25]], 8), P.copper, { p: [0.02, 1.74, 0], r: [0, 0, 0.15] });
  return { layers: [{ name: 'body', b }], userData: { radius: 0.5 } };
}

export function bridge(): PropSpec {
  const b = new Builder();
  const L = 4.2, W = 2.0;
  for (const sx of [-1, 1]) b.add(box(0.2, 0.25, L), P.woodDark, { p: [sx * (W / 2 - 0.15), 0.2, 0] });
  const n = 14;
  for (let i = 0; i < n; i++) b.add(box(W, 0.08, L / n - 0.03), i % 2 ? P.wood : P.woodLight, { p: [0, 0.36, -L / 2 + L / n / 2 + (i * L) / n], r: [0, 0, (i % 3 - 1) * 0.01], shade: 0.04, seed: i });
  for (const sx of [-1, 1]) {
    for (const z of [-L / 2 + 0.1, 0, L / 2 - 0.1]) {
      b.add(box(0.12, 0.9, 0.12), P.woodDark, { p: [sx * W / 2, 0.8, z] });
      b.add(box(0.14, 0.07, 0.14), P.snow, { p: [sx * W / 2, 1.28, z] });
    }
    b.add(box(0.1, 0.1, L), P.wood, { p: [sx * W / 2, 1.15, 0] });
    b.add(box(0.06, 0.06, L), P.rope, { p: [sx * W / 2, 0.75, 0] });
  }
  b.add(box(W - 0.4, 0.04, L - 0.6), P.snow, { p: [0.15, 0.41, 0.1], jitter: 0.01 });
  return { layers: [{ name: 'body', b }], userData: { size: [W + 0.2, L], length: L, deckHeight: 0.4, axis: 'z', walkable: true } };
}

export function noticeBoard(): PropSpec {
  const b = new Builder();
  for (const sx of [-1, 1]) b.add(cyl(0.07, 0.08, 2.3, 6), P.woodDark, { p: [sx * 0.85, 1.15, 0] });
  b.add(bevel(1.8, 1.1, 0.1, 0.03), P.woodLight, { p: [0, 1.35, 0] });
  b.add(bevel(1.9, 0.08, 0.14, 0.02), P.woodDark, { p: [0, 1.93, 0] });
  const notes: [number, number, number, number][] = [[-0.55, 1.5, P.cream, 0.1], [-0.1, 1.55, 0xf7d6dc, -0.08], [0.4, 1.45, P.cream, 0.05], [-0.4, 1.05, 0xdfe9f5, -0.05], [0.25, 1.05, P.cream, 0.12], [0.65, 1.15, 0xfbe3a0, -0.1]];
  for (const [x, y, c, rz] of notes) {
    b.add(box(0.32, 0.36, 0.02), c, { p: [x, y, 0.06], r: [0, 0, rz] });
    b.add(box(0.2, 0.025, 0.01), 0x6b5a4a, { p: [x, y + 0.06, 0.075], r: [0, 0, rz] });
    b.add(sphere(0.022, 4, 3), P.berry, { p: [x, y + 0.15, 0.08] });
  }
  roofSmall(b, 2.2, 0.7, 2.25);
  return { layers: [{ name: 'body', b }], markers: { front: [0, 0, 1.0] }, userData: { size: [2.0, 0.6], radius: 1.1 } };
}
function roofSmall(b: Builder, w: number, d: number, y: number) {
  for (const sz of [-1, 1]) {
    b.add(bevel(w, 0.07, d * 0.62, 0.02), P.bark, { p: [0, y + 0.12, sz * d * 0.25], r: [sz * 0.5, 0, 0] });
    b.add(bevel(w - 0.06, 0.08, d * 0.55, 0.03), P.snow, { p: [0, y + 0.19, sz * d * 0.26], r: [sz * 0.5, 0, 0] });
  }
}

export function bench(): PropSpec {
  const b = new Builder();
  for (const sx of [-1, 1]) {
    b.add(cyl(0.18, 0.2, 0.4, 7), P.bark, { p: [sx * 0.6, 0.2, 0] });
    b.add(cyl(0.15, 0.15, 0.02, 7), P.woodPale, { p: [sx * 0.6, 0.405, 0] });
  }
  b.add(cyl(0.2, 0.2, 1.7, 7, false), P.bark, { p: [0, 0.48, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.75], top: P.woodPale, topY: 0.9 });
  for (const sx of [-1, 1]) b.add(cyl(0.18, 0.18, 0.02, 7), P.woodPale, { p: [sx * 0.86, 0.48, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.75] });
  b.add(box(0.5, 0.04, 0.2), P.snow, { p: [0.45, 0.61, -0.02] });
  return { layers: [{ name: 'body', b }], userData: { size: [1.8, 0.5], radius: 0.95, seatHeight: 0.6 } };
}

export function woodPile(): PropSpec {
  const b = new Builder();
  const rows = [5, 4, 3, 2];
  let y = 0.15;
  rows.forEach((n, ri) => {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.3;
      logBetween(b, [x, y, -0.55], [x, y, 0.55], 0.14, P.bark, P.woodPale, 5);
    }
    y += 0.25;
  });
  b.add(box(1.0, 0.1, 1.0), P.snow, { p: [0, y - 0.05, 0], s: [0.5, 1, 1.0] });
  // chopping stump with axe
  b.add(cyl(0.25, 0.28, 0.45, 7), P.bark, { p: [1.1, 0.22, 0.3] });
  b.add(cyl(0.22, 0.22, 0.02, 7), P.woodPale, { p: [1.1, 0.455, 0.3] });
  b.add(cyl(0.022, 0.026, 0.6, 5), P.woodLight, { p: [1.15, 0.7, 0.3], r: [0, 0, -0.5] });
  b.add(box(0.03, 0.16, 0.2), P.steel, { p: [1.05, 0.5, 0.3], r: [0, Math.PI / 2, 0.5] });
  return { layers: [{ name: 'body', b }], markers: { itemAnchor: [0, y, 0] }, userData: { size: [1.6, 1.2], radius: 1.0 } };
}
