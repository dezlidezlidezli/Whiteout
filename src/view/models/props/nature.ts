// Trees, rocks, ice and other landscape props.
import { Builder, box, prism, cone, cyl, dodec, ico, octa, rng, sphere } from '../geo';
import { PALETTE as P } from '../palette';
import { snowMound, type PropSpec } from './common';

export function pine(seed = 0, snowy = false): PropSpec {
  const b = new Builder();
  const r = rng(seed * 7 + 1);
  const H = 4 + r() * 2;            // 4..6 m
  const tiers = 3 + Math.floor(r() * 2);
  const baseR = 1.15 + r() * 0.4;
  const trunkH = 0.7 + r() * 0.3;
  const lean = (r() - 0.5) * 0.06;
  const greens = [P.pine, P.pineDark, P.pineLight];
  const tips = [P.pineLight, P.pine, 0x5aa67a];
  const g0 = Math.floor(r() * 3);
  b.add(cyl(0.13, 0.2, trunkH + 0.4, 6), P.bark, { p: [0, (trunkH + 0.4) / 2, 0], shade: 0.08, seed });
  // root flare
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    b.add(cone(0.09, 0.4, 4), P.bark, { p: [Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2], r: [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25] });
  }
  const crownH = H - trunkH;
  let y = trunkH;
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const rad = baseR * (1 - f * 0.62);
    const th = (crownH / tiers) * 1.55;
    const col = greens[(g0 + i) % 3];
    const rot = r() * Math.PI;
    const p: [number, number, number] = [lean * y, y + th / 2, lean * y * 0.5];
    // drooping skirt (dark underside) + main tier
    b.add(cone(rad, th, 8), col, { p, r: [lean, rot, 0], jitter: rad * 0.08, seed: seed * 13 + i, shade: 0.06, bottom: P.pineDark, topY: 0.3 });
    // upper cap of the tier: snow, or a lighter fresh-needle tip
    const k = snowy ? 0.62 : 0.5;
    b.add(cone(rad * k * 1.05, th * k * 1.02, 8), snowy ? P.snow : tips[(g0 + i) % 3], {
      p: [lean * y, y + th - (th * k) / 2 + 0.03, lean * y * 0.5], r: [lean, rot + 0.2, 0], jitter: rad * 0.05, seed: seed * 13 + i + 50,
      bottom: snowy ? P.snowShade : col, shade: snowy ? 0 : 0.05,
    });
    y += (crownH / tiers) * (0.82 - f * 0.1);
  }
  if (snowy) snowMound(b, baseR * 0.8, 0.18, baseR * 0.8, [0, 0, 0], seed + 2);
  else {
    // a few fallen cones and a needle-strewn patch
    for (let i = 0; i < 3; i++) b.add(ico(0.06), P.bark, { p: [(r() - 0.5) * 1.4, 0.04, (r() - 0.5) * 1.4], s: [1, 1.4, 1] });
  }
  return {
    layers: [{ name: 'body', b }],
    userData: { radius: 0.45, canopyRadius: baseR, height: H, trunkRadius: 0.2 },
  };
}

export function stump(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 4);
  const h = 0.4 + r() * 0.15;
  b.add(cyl(0.27, 0.33, h, 9), P.bark, { p: [0, h / 2, 0], jitter: 0.02, seed, shade: 0.1 });
  // bark ridges
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.3;
    b.add(box(0.05, h * 0.85, 0.04), 0x4a3020, { p: [Math.cos(a) * 0.3, h * 0.45, Math.sin(a) * 0.3], r: [0, -a, Math.sin(a) * 0.06] });
  }
  // cut face with growth rings and an axe notch
  b.add(cyl(0.255, 0.255, 0.02, 9), P.woodPale, { p: [0, h + 0.005, 0] });
  b.add(cyl(0.17, 0.17, 0.022, 9), P.woodLight, { p: [0, h + 0.008, 0] });
  b.add(cyl(0.08, 0.08, 0.024, 7), P.woodPale, { p: [0, h + 0.011, 0] });
  b.add(cone(0.1, 0.12, 4), P.woodLight, { p: [0.2, h + 0.03, 0.05], r: [0, 0.4, Math.PI / 2] });
  // roots
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    b.add(cone(0.11, 0.45, 5), P.bark, { p: [Math.cos(a) * 0.33, 0.06, Math.sin(a) * 0.33], r: [Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3], shade: 0.08, seed: i });
  }
  // snow lump + a tiny mushroom cluster
  b.add(sphere(0.12, 6, 4), P.snow, { p: [-0.08, h + 0.03, -0.06], s: [1.3, 0.45, 1] });
  b.add(cyl(0.015, 0.02, 0.07, 4), P.cream, { p: [0.3, 0.06, 0.18] });
  b.add(sphere(0.045, 6, 3), P.berry, { p: [0.3, 0.1, 0.18], s: [1, 0.55, 1] });
  return { layers: [{ name: 'body', b }], userData: { radius: 0.4 } };
}

/** Rounded faceted boulder with a snow cap and small stones; 4 distinct seed shapes. */
export function rock(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed * 31 + 7);
  const v = seed % 4;
  const cols = [P.stoneDark, 0x7f7a74, 0x737a86];
  const boulder = (x: number, z: number, s: number, sy: number, sxz: [number, number], k: number) =>
    b.add(ico(s, 1), cols[k % 3], {
      p: [x, s * sy * 0.62, z], s: [sxz[0], sy, sxz[1]], r: [0, r() * 6, (r() - 0.5) * 0.2],
      jitter: s * 0.16, seed: seed * 7 + k, top: P.snow, topY: 0.62, shade: 0.1,
    });
  let radius = 1;
  if (v === 0) { boulder(0, 0, 0.75, 0.8, [1.15, 1], 0); radius = 0.95; }                         // round boulder
  else if (v === 1) { boulder(0, 0, 0.55, 1.5, [1, 0.85], 1); radius = 0.6; }                     // tall standing stone
  else if (v === 2) { boulder(0, 0, 0.9, 0.55, [1.3, 1.0], 2); boulder(0.9, 0.4, 0.45, 0.8, [1, 1], 3); radius = 1.3; } // wide slab + buddy
  else { boulder(-0.35, 0, 0.55, 0.85, [1, 1], 4); boulder(0.4, 0.2, 0.45, 0.9, [1, 1.1], 5); boulder(0.05, -0.45, 0.38, 0.8, [1.1, 1], 6); radius = 1.0; } // cluster
  // pebbles at the base
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2, d = radius * (0.95 + r() * 0.25);
    b.add(ico(0.1 + r() * 0.08, 0), cols[i % 3], { p: [Math.cos(a) * d, 0.06, Math.sin(a) * d], s: [1.2, 0.7, 1], r: [r(), r(), r()], jitter: 0.015, seed: i });
  }
  snowMound(b, radius * 0.7, 0.12, radius * 0.5, [radius * 0.35, 0, radius * 0.5], seed + 9);
  return { layers: [{ name: 'body', b }], userData: { radius, variant: v } };
}

export function snowDrift(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 17);
  for (let i = 0; i < 4; i++) snowMound(b, 0.7 + r() * 0.6, 0.22 + r() * 0.3, 0.55 + r() * 0.35, [(i - 1.5) * 0.65 + r() * 0.3, 0, (r() - 0.5) * 0.6], seed + i);
  // wind-carved cornice on the windward side
  b.add(sphere(0.6, 8, 4), P.snow, { p: [0.1, 0.32, -0.25], s: [1.6, 0.35, 0.7], r: [0.25, 0.2, 0], jitter: 0.03, seed, bottom: P.snowBlue, topY: 0.3 });
  // poking-out bits: a twig and an ice chunk
  b.add(cyl(0.015, 0.02, 0.6, 4), P.bark, { p: [-0.7, 0.35, 0.2], r: [0.3, 0, 0.5] });
  b.add(cyl(0.01, 0.012, 0.2, 3), P.bark, { p: [-0.62, 0.5, 0.26], r: [0.3, 0, -0.5] });
  b.add(octa(0.12), P.ice, { p: [0.9, 0.2, 0.35], s: [1, 1.4, 0.8], r: [0.3, 0.5, 0.2] });
  return { layers: [{ name: 'body', b }], userData: { radius: 1.6, walkable: true } };
}

/** 4 m wide, ~3.5 m tall, ~1.8 m deep massive ice wall along X (x in -2..2); tiles side by side. */
export function frostWall(seed = 0): PropSpec {
  const ice = new Builder(), b = new Builder();
  const r = rng(seed * 11 + 5);
  const cols = [P.ice, P.iceTeal, P.frost, P.iceDeep, P.ice, 0x8cc8ec];
  const col = () => cols[Math.floor(r() * cols.length)];
  /** broken ice sheet: irregular polygon outline, extruded thick */
  const slab = (x: number, z: number, w: number, h: number, d: number, tilt: number) => {
    const pts: [number, number][] = [
      [-w / 2, 0], [w / 2, 0], [w / 2 + (r() - 0.5) * 0.2, h * (0.55 + r() * 0.2)],
      [w * (0.1 + r() * 0.25), h * (0.85 + r() * 0.15)], [-w * (0.1 + r() * 0.2), h], [-w / 2 + (r() - 0.5) * 0.2, h * (0.6 + r() * 0.2)],
    ];
    ice.add(prism(pts, d), col(), { p: [x, -0.05, z], r: [tilt, (r() - 0.5) * 0.5, (r() - 0.5) * 0.12], jitter: 0.05, seed: Math.floor(r() * 1e4), top: P.frost, topY: 0.55, shade: 0.06 });
  };
  // three overlapping layers of slabs, staggered
  for (let i = 0; i < 4; i++) slab(-1.5 + i * 1.0 + (r() - 0.5) * 0.2, -0.55, 1.2 + r() * 0.3, 3.0 + r() * 0.5, 0.6, -0.05);
  for (let i = 0; i < 4; i++) slab(-1.95 + i * 1.3 + (r() - 0.5) * 0.2, 0.0, 1.25 + r() * 0.3, 2.5 + r() * 0.6, 0.65, 0.04);
  for (let i = 0; i < 3; i++) slab(-1.3 + i * 1.3 + (r() - 0.5) * 0.25, 0.55, 1.1 + r() * 0.3, 1.5 + r() * 0.6, 0.55, 0.14);
  // only a couple of spires
  for (let i = 0; i < 2; i++) ice.add(cone(0.3, 1.1 + r() * 0.5, 4), P.iceTeal, { p: [-0.9 + i * 1.7 + (r() - 0.5) * 0.4, 3.2 + r() * 0.2, -0.45], r: [(r() - 0.5) * 0.3, r() * 3, (r() - 0.5) * 0.3], jitter: 0.04, seed: seed + 9 + i });
  // massive base blocks
  for (let i = 0; i < 4; i++) ice.add(dodec(0.7), cols[i % 3], { p: [-1.5 + i + (r() - 0.5) * 0.15, 0.45, 0], s: [1.0, 0.8, 1.3], r: [0, r() * 3, 0], jitter: 0.08, seed: seed + 40 + i });
  // heavy snow banks on both sides + snow lying on ledges
  for (let i = 0; i < 2; i++) {
    snowMound(b, 1.4, 0.65, 0.75, [-1.0 + i * 2, 0, 0.95], seed + 60 + i);
    snowMound(b, 1.35, 0.55, 0.7, [-0.9 + i * 2, 0, -1.0], seed + 70 + i);
  }
  snowMound(b, 0.9, 0.3, 0.5, [r() - 0.5, 1.75, 0.4], seed + 80);
  return {
    layers: [{ name: 'ice', b: ice, mat: 'ice', shadow: true }, { name: 'snow', b }],
    userData: { size: [4, 1.8], width: 4, depth: 1.8, height: 3.5, tileWidth: 4 },
  };
}

export function iceHole(seed = 0): PropSpec {
  const b = new Builder(), ice = new Builder();
  const r = rng(seed + 2);
  ice.add(cyl(1.25, 1.3, 0.06, 12), P.ice, { p: [0, 0.03, 0], jitter: 0.04, seed });
  b.add(cyl(0.48, 0.5, 0.07, 10), P.water, { p: [0, 0.035, 0], jitter: 0.02, seed: seed + 1 });
  // crushed ice chunks around the hole
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.3;
    b.add(ico(0.08 + r() * 0.06), i % 2 ? P.frost : P.snow, { p: [Math.cos(a) * 0.6, 0.06, Math.sin(a) * 0.6], s: [1, 0.6, 1], r: [r(), r(), r()] });
  }
  // little flag (a tip-up) to show it's a fishing spot
  b.add(box(0.5, 0.03, 0.04), P.woodLight, { p: [0.75, 0.07, 0.3], r: [0, 0.5, 0] });
  b.add(cyl(0.015, 0.015, 0.6, 4), P.woodDark, { p: [0.75, 0.37, 0.3] });
  b.add(box(0.2, 0.14, 0.01), P.coatRust, { p: [0.85, 0.58, 0.3] });
  for (let i = 0; i < 4; i++) {
    const a = r() * 6.28;
    b.add(box(0.12, 0.012, 0.03), P.snowShade, { p: [Math.cos(a) * 1.0, 0.065, Math.sin(a) * 1.0], r: [0, a, 0] });
  }
  return {
    layers: [{ name: 'ice', b: ice, mat: 'ice', shadow: false }, { name: 'body', b }],
    markers: { water: [0, 0.07, 0] },
    userData: { radius: 1.3, walkable: true },
  };
}

export function oreVein(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 61);
  b.add(dodec(1.0), P.stoneDark, { p: [0, 0.55, 0], s: [1.3, 0.85, 1.05], jitter: 0.12, seed, top: P.snow, topY: 0.8, shade: 0.08 });
  b.add(dodec(0.6), P.stone, { p: [0.95, 0.35, 0.3], jitter: 0.08, seed: seed + 1, top: P.snow, topY: 0.8, shade: 0.06 });
  b.add(dodec(0.45), P.ore, { p: [-0.9, 0.3, 0.4], jitter: 0.06, seed: seed + 2, shade: 0.06 });
  // rusty ore seams + steel glints
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 1.2 - 0.1;
    const y = 0.25 + r() * 0.7;
    b.add(octa(0.1 + r() * 0.08), i % 3 ? P.oreRust : 0xd67a3a, { p: [Math.cos(a) * 1.15, y, Math.sin(a) * 0.95], r: [r(), r(), r()], s: [1, 0.6, 1] });
  }
  for (let i = 0; i < 4; i++) b.add(octa(0.07), P.steel, { p: [(r() - 0.5) * 1.6, 0.4 + r() * 0.5, 0.75 + r() * 0.2], r: [r(), r(), r()] });
  // a couple of loose chunks on the ground
  for (let i = 0; i < 3; i++) b.add(dodec(0.12), P.ore, { p: [-0.4 + i * 0.45, 0.08, 1.05 + r() * 0.2], jitter: 0.02, seed: i });
  b.add(sphere(0.3, 6, 4), P.snow, { p: [-0.3, 1.12, -0.1], s: [1.4, 0.4, 1.1] });
  return { layers: [{ name: 'body', b }], userData: { radius: 1.35 } };
}
