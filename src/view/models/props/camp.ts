// Camp & kettle-yard props.
import { Builder, bevel, box, cone, cyl, ico, lathe, prism, rng, sphere, torus } from '../geo';
import { PALETTE as P } from '../palette';
import { fishBody } from '../items';
import { coals, flame, logBetween, snowMound, stoneRing, type PropSpec } from './common';

// ---------------------------------------------------------------- kettle
export function kettle(): PropSpec {
  const b = new Builder(), lid = new Builder(), fl = new Builder(), em = new Builder();
  // fire ring + coal bed
  stoneRing(b, 0.68, 9, 0.17, 21);
  b.add(cyl(0.58, 0.62, 0.05, 10), P.coal, { p: [0, 0.025, 0] });
  coals(em, 0.45, 7, 4, 0.06);
  // trivet legs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    b.add(box(0.05, 0.42, 0.05), P.iron, { p: [Math.cos(a) * 0.42, 0.2, Math.sin(a) * 0.42], r: [Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15] });
  }
  // copper belly
  const prof: [number, number][] = [[0, 0.3], [0.3, 0.3], [0.5, 0.38], [0.64, 0.56], [0.67, 0.72], [0.6, 0.92], [0.46, 1.04], [0.32, 1.08]];
  b.add(lathe(prof, 11), P.copper, { top: P.copperLight, topY: 0.55, shade: 0.04, seed: 3 });
  b.add(cyl(0.675, 0.675, 0.05, 12, true), P.copperDark, { p: [0, 0.72, 0] });
  b.add(cyl(0.34, 0.34, 0.05, 12), P.copperDark, { p: [0, 1.08, 0] }); // rim
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    b.add(box(0.04, 0.04, 0.04), P.copperLight, { p: [Math.cos(a) * 0.685, 0.72, Math.sin(a) * 0.685], r: [0, -a, 0] });
  }
  // spout (+X), curving up
  b.add(cyl(0.07, 0.13, 0.36, 7), P.copper, { p: [0.72, 0.68, 0], r: [0, 0, -1.05] });
  b.add(cyl(0.055, 0.075, 0.32, 7), P.copper, { p: [0.95, 0.92, 0], r: [0, 0, -0.55] });
  b.add(cyl(0.065, 0.065, 0.04, 7), P.copperDark, { p: [1.03, 1.06, 0], r: [0, 0, -0.55] });
  // handle (-X)
  b.add(torus(0.3, 0.045, 4, 9, Math.PI * 1.1), P.copperDark, { p: [-0.62, 0.78, 0], r: [0, 0, Math.PI / 2 - 0.1] });
  // ember emblem on the front
  b.add(prism([[0, 0.1], [0.06, 0], [0, -0.1], [-0.06, 0]], 0.03), P.ember, { p: [0, 0.68, 0.665] });
  // lid (separate node, hinge at the rim)
  lid.add(lathe([[0.33, 0], [0.32, 0.04], [0.2, 0.11], [0, 0.13]], 12), P.copper, { top: P.copperLight, topY: 0.4 });
  lid.add(cyl(0.035, 0.03, 0.08, 6), P.woodDark, { p: [0, 0.16, 0] });
  lid.add(sphere(0.06, 6, 4), P.woodDark, { p: [0, 0.22, 0] });
  // fire tongues peeking out around the belly
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.9;
    flame(fl, 0.45, 0.17, 10 + i, [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], 3);
  }
  return {
    layers: [
      { name: 'body', b },
      { name: 'lid', b: lid, pos: [0, 1.09, 0] },
      { name: 'coals', b: em, mat: 'ember', shadow: false },
      { name: 'flame', b: fl, mat: 'glow', pos: [0, 0.05, 0] },
    ],
    markers: { steamPoint: [1.05, 1.1, 0], lidSteamPoint: [0, 1.3, 0], light: [0, 0.4, 0], itemAnchor: [0, 1.3, 0] },
    userData: { radius: 0.85, size: [1.6, 1.4], lightPos: [0, 0.4, 0], lightColor: P.flame, lightIntensity: 1.2, lightDistance: 5 },
  };
}

// ---------------------------------------------------------------- counter
export function counter(): PropSpec {
  const b = new Builder();
  const W = 2.0, D = 0.75, H = 0.95;
  // body of vertical slats
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.1 + (i * (W - 0.2)) / (n - 1);
    b.add(box((W - 0.2) / (n - 1) - 0.015, H - 0.1, 0.06), i % 2 ? P.wood : P.woodLight, { p: [x, (H - 0.1) / 2, D / 2 - 0.05], shade: 0.04, seed: i });
  }
  b.add(box(W - 0.15, H - 0.1, D - 0.15), P.woodDark, { p: [0, (H - 0.1) / 2, -0.02] });
  // posts and top slab
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    b.add(bevel(0.14, H, 0.14, 0.03), P.woodDark, { p: [sx * (W / 2 - 0.05), H / 2, sz * (D / 2 - 0.05)] });
  b.add(bevel(W + 0.12, 0.1, D + 0.1, 0.03), P.woodPale, { p: [0, H, 0], shade: 0.03, seed: 2 });
  b.add(box(W - 0.1, 0.06, 0.04), P.copper, { p: [0, H - 0.15, D / 2 - 0.01] }); // copper trim
  // awning posts + striped awning (rust / cream)
  for (const sx of [-1, 1]) b.add(cyl(0.05, 0.06, 1.45, 6), P.woodDark, { p: [sx * (W / 2 - 0.05), H + 0.72, -D / 2 + 0.05] });
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    const w = (W + 0.3) / stripes;
    const x = -(W + 0.3) / 2 + w * (i + 0.5);
    b.add(box(w, 0.05, 0.8), i % 2 ? P.cream : P.coatRust, { p: [x, H + 1.2, -0.12], r: [0.38, 0, 0] });
    b.add(prism([[-w / 2, 0], [w / 2, 0], [0, -0.13]], 0.04), i % 2 ? P.cream : P.coatRust, { p: [x, H + 1.05, 0.26] });
  }
  // hanging bowl sign
  b.add(box(0.02, 0.16, 0.02), P.rope, { p: [W / 2 - 0.25, H + 0.96, 0.26] });
  b.add(bevel(0.36, 0.22, 0.05, 0.02), P.woodLight, { p: [W / 2 - 0.25, H + 0.78, 0.26] });
  b.add(sphere(0.08, 6, 3), P.stew, { p: [W / 2 - 0.25, H + 0.76, 0.29], s: [1, 0.5, 0.3] });
  // snow lump on one end of the awning
  snowMound(b, 0.25, 0.07, 0.22, [-(W / 2) + 0.3, H + 1.28, -0.3], 3);
  return {
    layers: [{ name: 'body', b }],
    markers: { itemAnchor: [0, H + 0.05, 0], queuePoint: [0, 0, D / 2 + 0.9] },
    userData: { size: [W + 0.12, D + 0.1], radius: 1.05, itemAnchor: [0, H + 0.05, 0] },
  };
}

// ---------------------------------------------------------------- fish crate
export function fishCrate(): PropSpec {
  const b = new Builder();
  const W = 1.2, D = 0.8, H = 0.55;
  b.add(box(W - 0.06, H - 0.06, D - 0.06), P.woodDark, { p: [0, H / 2, 0] });
  for (const y of [0.1, 0.27, 0.44]) {
    b.add(box(W, 0.14, 0.05), P.woodLight, { p: [0, y, D / 2 - 0.02], shade: 0.05, seed: y * 100 });
    b.add(box(W, 0.14, 0.05), P.woodLight, { p: [0, y, -D / 2 + 0.02], shade: 0.05, seed: y * 90 });
    b.add(box(0.05, 0.14, D), P.wood, { p: [W / 2 - 0.02, y, 0] });
    b.add(box(0.05, 0.14, D), P.wood, { p: [-W / 2 + 0.02, y, 0] });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(box(0.08, H + 0.04, 0.08), P.woodDark, { p: [sx * (W / 2 - 0.02), (H + 0.04) / 2, sz * (D / 2 - 0.02)] });
  // stencilled fish on the front
  b.add(sphere(0.12, 6, 3), P.fishDark, { p: [0, 0.28, D / 2 + 0.005], s: [1.2, 0.6, 0.1] });
  b.add(prism([[0, 0], [0.09, 0.07], [0.09, -0.07]], 0.01), P.fishDark, { p: [-0.22, 0.28, D / 2 + 0.01], r: [0, 0, 0], s: [1, 1, 1] });
  // ice bed + fish poking out
  b.add(box(W - 0.1, 0.05, D - 0.1), P.frost, { p: [0, H - 0.04, 0] });
  const r = rng(5);
  for (let i = 0; i < 6; i++) {
    const fb = new Builder();
    fishBody(fb, P.fish, P.fishDark, P.fishBelly, P.fishDark, { y: 0, lod: true });
    const x = -0.3 + (i % 3) * 0.3 + (r() - 0.5) * 0.08, z = i < 3 ? -0.17 : 0.17;
    b.merge(fb, { p: [x, H + 0.02 + (i % 2) * 0.04, z], r: [(r() - 0.5) * 0.3, Math.PI / 2 + (r() - 0.5) * 0.8 + (i < 3 ? 0 : Math.PI), (r() - 0.5) * 0.3], s: 0.85 });
  }
  for (let i = 0; i < 5; i++) b.add(ico(0.07), P.ice, { p: [-0.45 + i * 0.22, H + 0.03, (r() - 0.5) * 0.5], r: [r(), r(), r()] });
  // rope handles
  for (const sx of [-1, 1]) b.add(torus(0.08, 0.018, 3, 6, Math.PI), P.rope, { p: [sx * (W / 2 + 0.02), 0.38, 0], r: [0, Math.PI / 2, Math.PI] });
  return {
    layers: [{ name: 'body', b }],
    markers: { itemAnchor: [0, H + 0.05, 0] },
    userData: { size: [W, D], radius: 0.72, itemAnchor: [0, H + 0.05, 0] },
  };
}

export function storageTable(): PropSpec {
  const b = new Builder();
  const W = 1.6, D = 0.9, H = 0.8;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(bevel(0.1, H, 0.1, 0.02), P.woodDark, { p: [sx * (W / 2 - 0.1), H / 2, sz * (D / 2 - 0.1)] });
  b.add(box(W - 0.2, 0.06, 0.06), P.woodDark, { p: [0, 0.25, D / 2 - 0.1] });
  b.add(box(W - 0.2, 0.06, 0.06), P.woodDark, { p: [0, 0.25, -D / 2 + 0.1] });
  for (let i = 0; i < 4; i++) b.add(box(W, 0.07, D / 4 - 0.015), i % 2 ? P.woodLight : P.woodPale, { p: [0, H, -D / 2 + D / 8 + (i * D) / 4], shade: 0.03, seed: i });
  return { layers: [{ name: 'body', b }], markers: { itemAnchor: [0, H + 0.04, 0] }, userData: { size: [W, D], radius: 0.92, itemAnchor: [0, H + 0.04, 0] } };
}

// ---------------------------------------------------------------- hearth (1..5)
export function hearth(level: number): PropSpec {
  const L = Math.max(1, Math.min(5, Math.round(level)));
  const b = new Builder(), fl = new Builder(), em = new Builder();
  let flameH = 0.9, flameR = 0.32, fireY = 0.02, radius = 1.0;
  const teepee = (y: number, R: number, h: number, n = 5) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      logBetween(b, [Math.cos(a) * R, y, Math.sin(a) * R], [Math.cos(a) * 0.06, y + h, Math.sin(a) * 0.06], 0.065);
    }
  };
  if (L === 1) {
    stoneRing(b, 0.7, 9, 0.17, 7);
    b.add(cyl(0.6, 0.6, 0.04, 9), P.coal, { p: [0, 0.02, 0] });
    teepee(0.02, 0.45, 0.6, 4);
    coals(em, 0.4, 8, 2, 0.05);
    flameH = 0.95; flameR = 0.3;
    radius = 0.95;
    // a seat log and a little wood stack
    logBetween(b, [-1.6, 0.15, 0.6], [-1.0, 0.15, 1.3], 0.15);
  }
  if (L === 2) {
    stoneRing(b, 0.95, 12, 0.2, 11);
    stoneRing(b, 0.72, 9, 0.12, 12, [0, 0.0, 0], false, [P.stoneDark, P.stone]);
    b.add(cyl(0.75, 0.75, 0.04, 10), P.coal, { p: [0, 0.02, 0] });
    teepee(0.02, 0.55, 0.85, 6);
    coals(em, 0.55, 12, 3, 0.05);
    flameH = 1.25; flameR = 0.4; radius = 1.2;
    for (const [x, z, a] of [[-1.7, 0.4, 0.4], [1.6, 0.6, -0.5]] as const)
      logBetween(b, [x - Math.cos(a) * 0.45, 0.16, z + Math.sin(a) * 0.45], [x + Math.cos(a) * 0.45, 0.16, z - Math.sin(a) * 0.45], 0.16);
  }
  if (L >= 3) {
    // raised round fire pit of dressed stone
    const pitR = L === 3 ? 1.05 : 1.15;
    const pitH = 0.45;
    const blocks = 11;
    for (let row = 0; row < 2; row++) for (let i = 0; i < blocks; i++) {
      const a = ((i + row * 0.5) / blocks) * Math.PI * 2;
      b.add(box(pitR * 0.6, pitH / 2 - 0.015, 0.3), (i + row) % 3 === 0 ? P.stoneWarm : (i + row) % 3 === 1 ? P.stone : 0x9aa0ab, {
        p: [Math.cos(a) * pitR, pitH / 4 + (row * pitH) / 2, Math.sin(a) * pitR], r: [0, -a + Math.PI / 2, 0], shade: 0.05, seed: i + row * 20,
      });
    }
    b.add(cyl(pitR + 0.12, pitR + 0.12, 0.08, 12), P.stoneDark, { p: [0, pitH + 0.03, 0] });
    b.add(cyl(pitR - 0.15, pitR - 0.15, 0.09, 12), P.coal, { p: [0, pitH + 0.06, 0] });
    fireY = pitH + 0.1;
    // ring of iron fire-dogs + a log teepee
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.add(box(0.06, 0.18, 0.06), P.iron, { p: [Math.cos(a) * (pitR - 0.2), fireY + 0.05, Math.sin(a) * (pitR - 0.2)] });
    }
    teepee(fireY, 0.6, 1.0, 6);
    coals(em, pitR - 0.3, 12, 5, fireY + 0.0);
    flameH = 1.5; flameR = 0.5; radius = pitR + 0.2;
    if (L === 3) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        b.add(bevel(0.22, 0.6, 0.22, 0.04), P.stone, { p: [Math.cos(a) * (pitR + 0.45), 0.3, Math.sin(a) * (pitR + 0.45)] });
        b.add(cyl(0.16, 0.08, 0.1, 6), P.copper, { p: [Math.cos(a) * (pitR + 0.45), 0.65, Math.sin(a) * (pitR + 0.45)] });
        coals(em, 0.08, 3, 30 + i, 0.7, [Math.cos(a) * (pitR + 0.45), 0, Math.sin(a) * (pitR + 0.45)]);
      }
      radius = pitR + 0.6;
    }
  }
  if (L >= 4) {
    // octagonal platform
    const platR = L === 4 ? 2.0 : 2.4;
    b.add(cyl(platR, platR + 0.08, 0.22, 8), P.stoneWarm, { p: [0, 0.11, 0], top: 0xb8ad9e, shade: 0.03, seed: 4 });
    if (L === 5) b.add(cyl(platR + 0.45, platR + 0.55, 0.16, 8), P.stone, { p: [0, 0.08, 0], shade: 0.03, seed: 5 });
    // back wall (-Z) with wing pillars and a wooden mantle
    const wallW = L === 4 ? 2.6 : 3.0;
    const wallH = L === 4 ? 1.9 : 2.3;
    for (let row = 0; row < 3; row++) {
      const cols = 3;
      for (let c = 0; c < cols; c++) {
        const bw = wallW / cols;
        const off = row % 2 ? bw / 2 : 0;
        const x = -wallW / 2 + bw / 2 + c * bw + off - (row % 2 ? bw / 4 : 0);
        const w = row % 2 && (c === 0 || c === cols - 1) ? bw * 0.75 : bw;
        b.add(bevel(w - 0.03, wallH / 3 - 0.03, 0.55, 0.05), (row + c) % 3 === 0 ? P.stoneWarm : (row + c) % 3 === 1 ? P.stone : 0x9aa0ab, {
          p: [x, 0.22 + wallH / 6 + (row * wallH) / 3, -1.45], shade: 0.04, seed: row * 7 + c,
        });
      }
    }
    for (const sx of [-1, 1]) {
      b.add(bevel(0.55, wallH + 0.35, 0.7, 0.07), P.stoneDark, { p: [sx * (wallW / 2 + 0.2), 0.22 + (wallH + 0.35) / 2, -1.35], shade: 0.04, seed: sx + 3 });
      b.add(bevel(0.68, 0.14, 0.82, 0.04), P.stone, { p: [sx * (wallW / 2 + 0.2), 0.22 + wallH + 0.42, -1.35] });
    }
    b.add(bevel(wallW + 0.6, 0.22, 0.42, 0.05), P.woodDark, { p: [0, 0.22 + wallH * 0.72, -1.05], shade: 0.04, seed: 9 });
    // copper pot hanging from a crane arm
    b.add(box(0.06, 0.06, 0.9), P.iron, { p: [0.75, 0.22 + wallH * 0.72 - 0.15, -0.65] });
    b.add(box(0.02, 0.35, 0.02), P.iron, { p: [0.75, 0.22 + wallH * 0.72 - 0.35, -0.22] });
    b.add(lathe([[0, 0], [0.16, 0.02], [0.22, 0.14], [0.2, 0.28], [0.17, 0.3]], 8), P.copper, { p: [0.75, 0.22 + wallH * 0.72 - 0.85, -0.22], top: P.copperLight });
    // firewood stacked by the hearth
    for (let i = 0; i < 5; i++) {
      const row = i < 3 ? 0 : 1;
      const x = -1.85 + (row ? (i - 3) * 0.26 + 0.13 : i * 0.26);
      logBetween(b, [x, 0.36 + row * 0.22, -0.2], [x, 0.36 + row * 0.22, 0.6], 0.12);
    }
    radius = platR;
  }
  if (L === 5) {
    // tall tapering chimney rising from the back wall
    const tiers = [[2.3, 0.8, 1.0], [1.9, 0.7, 1.1], [1.6, 0.64, 1.2], [1.35, 0.58, 1.1]];
    let y = 0.22 + 2.3 + 0.1;
    for (let i = 0; i < tiers.length; i++) {
      const [w, d, h] = tiers[i];
      b.add(bevel(w, h, d, 0.06), i % 2 ? P.stone : P.stoneWarm, { p: [0, y + h / 2, -1.45], shade: 0.05, seed: 40 + i });
      b.add(bevel(w + 0.1, 0.08, d + 0.1, 0.03), P.stoneDark, { p: [0, y + h, -1.45] });
      y += h;
    }
    // copper cap
    b.add(cyl(0.42, 0.5, 0.3, 8), P.copper, { p: [0, y + 0.15, -1.45], top: P.copperLight, topY: 0.5 });
    b.add(cone(0.6, 0.35, 8), P.copperDark, { p: [0, y + 0.6, -1.45] });
    b.add(cyl(0.36, 0.36, 0.06, 8), P.coal, { p: [0, y + 0.3, -1.45] });
    for (const sx of [-1, 1]) b.add(box(0.06, 0.35, 0.06), P.copperDark, { p: [sx * 0.3, y + 0.42, -1.45] });
    // glowing ember emblem on the chimney breast
    b.add(prism([[0, 0.3], [0.2, 0], [0, -0.3], [-0.2, 0]], 0.08), P.copper, { p: [0, 3.2, -1.1] });
    em.add(prism([[0, 0.2], [0.13, 0], [0, -0.2], [-0.13, 0]], 0.06), P.ember, { p: [0, 3.2, -1.05] });
    // banners on the wing pillars
    for (const sx of [-1, 1]) {
      const x = sx * 1.7;
      b.add(box(0.7, 0.05, 0.05), P.woodDark, { p: [x, 2.4, -0.98] });
      b.add(box(0.55, 1.1, 0.03), sx < 0 ? P.coatRust : P.mustard, { p: [x, 1.8, -0.97] });
      b.add(prism([[-0.275, 0], [0.275, 0], [0, -0.2]], 0.03), sx < 0 ? P.coatRust : P.mustard, { p: [x, 1.25, -0.97] });
      b.add(prism([[0, 0.12], [0.09, 0], [0, -0.12], [-0.09, 0]], 0.02), P.cream, { p: [x, 1.9, -0.95] });
    }
    // steps at the front
    b.add(bevel(1.6, 0.12, 0.5, 0.03), P.stone, { p: [0, 0.06, 2.75] });
    // stone benches on two sides
    for (const a of [Math.PI * 0.25, Math.PI * 0.75]) {
      const R = 3.3;
      b.add(bevel(1.4, 0.35, 0.45, 0.06), P.stoneWarm, { p: [Math.cos(a) * R, 0.18, Math.sin(a) * R], r: [0, -a + Math.PI / 2, 0] });
    }
    // lantern posts
    for (const sx of [-1, 1]) {
      b.add(cyl(0.05, 0.06, 1.6, 6), P.woodDark, { p: [sx * 2.05, 0.22 + 0.8, 1.1] });
      b.add(bevel(0.22, 0.28, 0.22, 0.04), P.iron, { p: [sx * 2.05, 1.95, 1.1] });
      em.add(box(0.15, 0.2, 0.15), P.windowGlow, { p: [sx * 2.05, 1.95, 1.1] });
      b.add(cone(0.18, 0.14, 4), P.iron, { p: [sx * 2.05, 2.16, 1.1], r: [0, Math.PI / 4, 0] });
    }
    flameH = 1.85; flameR = 0.6; radius = 3.0;
  } else if (L === 4) {
    flameH = 1.65; flameR = 0.55;
  }
  flame(fl, flameH, flameR, 99 + L);
  const lightY = fireY + flameH * 0.6;
  return {
    layers: [
      { name: 'body', b },
      { name: 'coals', b: em, mat: 'ember', shadow: false },
      { name: 'flame', b: fl, mat: 'glow', pos: [0, fireY, 0] },
    ],
    markers: { light: [0, lightY, 0], fuelPoint: [0, fireY + 0.3, 0] },
    userData: {
      level: L, radius, lightPos: [0, lightY, 0], lightColor: P.flame,
      lightIntensity: 1.2 + L * 0.35, lightDistance: 7 + L * 2.5, flameHeight: flameH,
    },
  };
}

// ---------------------------------------------------------------- tent
/** Round canvas bell tent with a striped skirt, open door flap and pennant. */
export function tent(seed = 0): PropSpec {
  const b = new Builder();
  const R = 1.25, wallH = 0.55, H = 2.3, seg = 8;
  const stripe = [P.coatRust, P.porter, P.mustard][seed % 3];
  // skirt wall with alternating stripes
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    if (i === 2) continue; // door gap (faces +Z-ish)
    const am = (a0 + a1) / 2;
    const w = 2 * R * Math.sin(Math.PI / seg);
    b.add(box(w + 0.01, wallH, 0.05), i % 2 ? P.canvas : stripe, { p: [Math.cos(am) * R * 0.96, wallH / 2, Math.sin(am) * R * 0.96], r: [0, -am + Math.PI / 2, 0] });
  }
  // dark interior visible through the door + door flap tied back
  b.add(cyl(R * 0.9, R * 0.9, wallH, seg), 0x3a2c24, { p: [0, wallH / 2, 0] });
  // conical roof
  b.add(cone(R + 0.12, H - wallH, seg), P.canvas, { p: [0, wallH + (H - wallH) / 2, 0], r: [0, Math.PI / seg, 0], shade: 0.04, seed: 3 });
  b.add(cone((R + 0.12) * 0.42, (H - wallH) * 0.42, seg), P.snow, { p: [0, H - (H - wallH) * 0.21 + 0.02, 0], r: [0, Math.PI / seg, 0], bottom: P.snowShade, jitter: 0.02, seed });
  b.add(cyl(R + 0.14, R + 0.14, 0.08, seg, true), stripe, { p: [0, wallH + 0.02, 0], r: [0, Math.PI / seg, 0] });
  const da = (2.5 / seg) * Math.PI * 2;
  b.add(prism([[0, 0], [0.55, 0], [0.1, 0.9]], 0.04), P.canvasDark, { p: [Math.cos(da) * R + 0.35, 0, Math.sin(da) * R + 0.12], r: [0, -da - 0.3, 0] });
  // pole + pennant
  b.add(cyl(0.035, 0.035, 0.5, 5), P.woodDark, { p: [0, H + 0.2, 0] });
  b.add(prism([[0, 0], [0.4, 0.08], [0, 0.18]], 0.02), stripe, { p: [0.02, H + 0.27, 0] });
  // guy ropes + pegs
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x0 = Math.cos(a) * (R + 0.05), z0 = Math.sin(a) * (R + 0.05);
    const x1 = Math.cos(a) * (R + 0.75), z1 = Math.sin(a) * (R + 0.75);
    const len = Math.hypot(0.75, wallH + 0.05);
    b.add(box(0.015, len, 0.015), P.rope, { p: [(x0 + x1) / 2, (wallH + 0.05) / 2, (z0 + z1) / 2], r: [0, -a, Math.atan2(0.75, wallH + 0.05)] });
    b.add(box(0.05, 0.14, 0.05), P.woodDark, { p: [x1, 0.05, z1] });
  }
  // lantern by the door + snow
  b.add(box(0.14, 0.18, 0.14), P.windowGlow, { p: [Math.cos(da) * (R + 0.35), 0.09, Math.sin(da) * (R + 0.35)] });
  snowMound(b, 0.55, 0.16, 0.45, [-R - 0.1, 0, -0.5], seed + 1);
  return { layers: [{ name: 'body', b }], markers: { door: [Math.cos(da) * (R + 0.6), 0, Math.sin(da) * (R + 0.6)] }, userData: { radius: R + 0.3, size: [2 * R + 0.6, 2 * R + 0.6] } };
}

// ---------------------------------------------------------------- cabin
export function cabin(seed = 0): PropSpec {
  const b = new Builder(), glow = new Builder();
  const W = 4.0, D = 3.4, H = 2.2;
  const r = rng(seed + 9);
  // stone footing
  b.add(bevel(W + 0.2, 0.3, D + 0.2, 0.06), P.stone, { p: [0, 0.15, 0], shade: 0.05, seed: 3 });
  // log walls (horizontal courses)
  const rows = 5, rh = H / rows;
  for (let i = 0; i < rows; i++) {
    const y = 0.3 + rh * (i + 0.5);
    const c = i % 2 ? P.wood : P.woodLight;
    b.add(bevel(W, rh - 0.02, D, 0.06), c, { p: [0, y, 0], shade: 0.03, seed: i });
  }
  // corner posts with log ends
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add(bevel(0.3, H, 0.3, 0.05), P.woodDark, { p: [sx * W / 2, 0.3 + H / 2, sz * D / 2] });
  }
  // gable roof
  const roofY = 0.3 + H, rise = 1.4;
  b.add(prism([[-W / 2, 0], [W / 2, 0], [0, rise]], D - 0.02), P.woodLight, { p: [0, roofY, 0], shade: 0.03, seed: 7 });
  const slope = Math.atan2(rise, W / 2);
  const slab = Math.hypot(W / 2, rise) + 0.35;
  for (const sx of [-1, 1]) {
    b.add(bevel(slab, 0.14, D + 0.6, 0.04), P.woodDark, { p: [sx * (W / 4 + 0.08), roofY + rise / 2 - 0.02, 0], r: [0, 0, -sx * slope] });
    b.add(bevel(slab - 0.05, 0.16, D + 0.55, 0.06), P.snow, { p: [sx * (W / 4 + 0.13), roofY + rise / 2 + 0.11, 0], r: [0, 0, -sx * slope], bottom: P.snowShade, topY: 0.4, jitter: 0.02, seed: sx + 5 });
  }
  b.add(box(0.3, 0.2, D + 0.62), P.snow, { p: [0, roofY + rise + 0.12, 0] });
  // door (front, +Z) with frame
  b.add(bevel(0.95, 1.65, 0.12, 0.03), P.woodDark, { p: [-0.9, 0.3 + 0.82, D / 2 + 0.04] });
  b.add(bevel(0.8, 1.55, 0.1, 0.03), 0x7a4a2c, { p: [-0.9, 0.3 + 0.78, D / 2 + 0.08] });
  b.add(sphere(0.05, 5, 4), P.copper, { p: [-0.65, 1.05, D / 2 + 0.15] });
  b.add(bevel(1.2, 0.12, 0.5, 0.03), P.stone, { p: [-0.9, 0.06, D / 2 + 0.35] });
  // window with warm glow + mustard shutters
  b.add(bevel(1.0, 0.85, 0.12, 0.03), P.woodDark, { p: [0.85, 1.4, D / 2 + 0.04] });
  glow.add(box(0.8, 0.65, 0.04), P.windowGlow, { p: [0.85, 1.4, D / 2 + 0.1] });
  b.add(box(0.04, 0.65, 0.05), P.woodDark, { p: [0.85, 1.4, D / 2 + 0.12] });
  b.add(box(0.8, 0.04, 0.05), P.woodDark, { p: [0.85, 1.4, D / 2 + 0.12] });
  const shutter = seed % 3 === 0 ? P.mustard : seed % 3 === 1 ? P.porter : P.cook;
  for (const sx of [-1, 1]) b.add(bevel(0.32, 0.85, 0.06, 0.02), shutter, { p: [0.85 + sx * 0.68, 1.4, D / 2 + 0.06] });
  b.add(bevel(1.1, 0.1, 0.25, 0.03), P.snow, { p: [0.85, 0.94, D / 2 + 0.12] }); // snowy sill
  // side window glow
  glow.add(box(0.04, 0.55, 0.7), P.windowGlow, { p: [W / 2 + 0.03, 1.45, 0] });
  b.add(bevel(0.1, 0.72, 0.88, 0.03), P.woodDark, { p: [W / 2 + 0.0, 1.45, 0] });
  // chimney
  b.add(bevel(0.6, 2.2, 0.6, 0.06), P.stone, { p: [-W / 2 + 0.75, roofY + 0.6, -0.6], shade: 0.06, seed: 11 });
  b.add(bevel(0.7, 0.12, 0.7, 0.03), P.stoneDark, { p: [-W / 2 + 0.75, roofY + 1.72, -0.6] });
  b.add(box(0.5, 0.1, 0.5), P.snow, { p: [-W / 2 + 0.75, roofY + 1.82, -0.6] });
  // wreath or lantern detail by the door
  if (r() > 0.4) b.add(torus(0.16, 0.05, 4, 8), P.pine, { p: [-0.9, 1.6, D / 2 + 0.15] });
  snowMound(b, 0.8, 0.25, 0.6, [W / 2 + 0.2, 0, D / 2 - 0.2], seed + 3);
  return {
    layers: [{ name: 'body', b }, { name: 'windows', b: glow, mat: 'glow' }],
    markers: { door: [-0.9, 0, D / 2 + 0.6], chimneyTop: [-W / 2 + 0.75, roofY + 1.9, -0.6], light: [0.85, 1.4, D / 2 + 0.6] },
    userData: { size: [W + 0.4, D + 0.6], radius: 2.6, lightPos: [0.85, 1.4, D / 2 + 0.6], lightColor: P.windowGlow },
  };
}
