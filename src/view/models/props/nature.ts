// Trees, rocks, ice and other landscape props.
import { Builder, bevel, box, cone, cyl, dodec, ico, octa, rng, sphere } from '../geo';
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
  const g0 = Math.floor(r() * 3);
  b.add(cyl(0.13, 0.2, trunkH + 0.4, 6), P.bark, { p: [0, (trunkH + 0.4) / 2, 0] });
  b.add(cyl(0.3, 0.38, 0.1, 6), P.bark, { p: [0, 0.05, 0], jitter: 0.03, seed }); // roots
  const crownH = H - trunkH;
  let y = trunkH;
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const rad = baseR * (1 - f * 0.62);
    const th = (crownH / tiers) * 1.55;
    const col = greens[(g0 + i) % 3];
    const rot = r() * Math.PI;
    const opts = { p: [lean * y, y + th / 2, lean * y * 0.5] as [number, number, number], r: [lean, rot, 0] as [number, number, number], jitter: rad * 0.07, seed: seed * 13 + i, shade: 0.05 };
    b.add(cone(rad, th, 7), col, opts);
    if (snowy) {
      // snow cap: a shorter cone of the same slope sitting on the upper part of the tier
      const k = 0.62;
      b.add(cone(rad * k * 1.04, th * k * 1.02, 7), P.snow, {
        p: [lean * y, y + th - (th * k) / 2 + 0.03, lean * y * 0.5], r: [lean, rot, 0], jitter: rad * 0.05, seed: seed * 13 + i + 50, bottom: P.snowShade,
      });
    }
    y += (crownH / tiers) * (0.82 - f * 0.1);
  }
  if (snowy) snowMound(b, baseR * 0.8, 0.18, baseR * 0.8, [0, 0, 0], seed + 2);
  return {
    layers: [{ name: 'body', b }],
    userData: { radius: 0.45, canopyRadius: baseR, height: H, trunkRadius: 0.2 },
  };
}

export function stump(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 4);
  const h = 0.35 + r() * 0.15;
  b.add(cyl(0.24, 0.3, h, 7), P.bark, { p: [0, h / 2, 0], jitter: 0.02, seed, shade: 0.06 });
  b.add(cyl(0.2, 0.2, 0.02, 7), P.woodPale, { p: [0, h + 0.005, 0] });
  b.add(cyl(0.1, 0.1, 0.022, 6), P.woodLight, { p: [0, h + 0.008, 0] });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + r();
    b.add(cone(0.1, 0.35, 4), P.bark, { p: [Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3], r: [Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3] });
  }
  b.add(box(0.06, 0.04, 0.06), P.snow, { p: [0.08, h + 0.03, -0.05] });
  return { layers: [{ name: 'body', b }], userData: { radius: 0.35 } };
}

export function rock(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 31);
  const s = 0.5 + r() * 0.7;
  b.add(dodec(s), r() > 0.5 ? P.stoneDark : 0x7f7a74, { p: [0, s * 0.45, 0], s: [1.2, 0.75, 1], r: [0, r() * 3, 0], jitter: s * 0.12, seed, top: P.snow, topY: 0.8, shade: 0.08 });
  if (r() > 0.4) b.add(dodec(s * 0.45), P.stoneDark, { p: [s * 0.9, s * 0.2, s * 0.3], jitter: s * 0.06, seed: seed + 1, top: P.snow, topY: 0.9 });
  return { layers: [{ name: 'body', b }], userData: { radius: s * 1.1 } };
}

export function snowDrift(seed = 0): PropSpec {
  const b = new Builder();
  const r = rng(seed + 17);
  for (let i = 0; i < 3; i++) snowMound(b, 0.8 + r() * 0.6, 0.25 + r() * 0.25, 0.6 + r() * 0.4, [(i - 1) * 0.8 + r() * 0.3, 0, (r() - 0.5) * 0.6], seed + i);
  return { layers: [{ name: 'body', b }], userData: { radius: 1.5, walkable: true } };
}

/** 4 m wide, ~3.4 m tall, ~1.5 m deep ice barrier along X (x in -2..2); tiles side by side. */
export function frostWall(seed = 0): PropSpec {
  const ice = new Builder(), b = new Builder();
  const r = rng(seed * 11 + 5);
  const cols = [P.ice, P.iceTeal, P.frost, P.iceDeep, P.ice];
  const col = () => cols[Math.floor(r() * cols.length)];
  // back row: tall chunky slabs with broken, slanted tops
  const n = 5;
  for (let i = 0; i < n; i++) {
    const x = -1.6 + (3.2 * i) / (n - 1) + (r() - 0.5) * 0.2;
    const h = 2.7 + r() * 0.8;
    const rb = 0.62 + r() * 0.15;
    ice.add(cyl(rb * 0.35, rb, h, 5), col(), {
      p: [x, h / 2 - 0.1, -0.3 + (r() - 0.5) * 0.2], r: [(r() - 0.5) * 0.15, r() * 3, (r() - 0.5) * 0.2], s: [1, 1, 0.8], jitter: 0.09, seed: seed + i,
      top: P.frost, topY: 0.5,
    });
    ice.add(cone(rb * 0.4, 0.7 + r() * 0.5, 4), P.iceTeal, { p: [x + (r() - 0.5) * 0.3, h + 0.15, -0.3], r: [(r() - 0.5) * 0.4, r() * 3, (r() - 0.5) * 0.4], jitter: 0.04, seed: seed + 9 + i });
  }
  // front row: shorter slabs leaning outwards
  for (let i = 0; i < 4; i++) {
    const x = -1.5 + i * 1.0 + (r() - 0.5) * 0.25;
    const h = 1.5 + r() * 0.8;
    ice.add(cyl(0.2, 0.55 + r() * 0.12, h, 5), col(), {
      p: [x, h / 2 - 0.05, 0.4 + (r() - 0.5) * 0.15], r: [0.18 + (r() - 0.5) * 0.15, r() * 3, (r() - 0.5) * 0.3], s: [1, 1, 0.85], jitter: 0.07, seed: seed + 20 + i,
      top: P.frost, topY: 0.5,
    });
  }
  // solid base blocks
  for (let i = 0; i < 4; i++) {
    const x = -1.5 + i + (r() - 0.5) * 0.15;
    ice.add(dodec(0.62), cols[i % 3], { p: [x, 0.4, 0], s: [1.0, 0.85, 1.15], r: [0, r() * 3, 0], jitter: 0.07, seed: seed + 40 + i });
  }
  // snow piled at the base on both sides
  for (let i = 0; i < 2; i++) {
    snowMound(b, 1.25, 0.45, 0.6, [-1.0 + i * 2, 0, 0.8], seed + 60 + i);
    snowMound(b, 1.2, 0.38, 0.55, [-0.8 + i * 2, 0, -0.85], seed + 70 + i);
  }
  return {
    layers: [{ name: 'ice', b: ice, mat: 'ice', shadow: true }, { name: 'snow', b }],
    userData: { size: [4, 1.6], width: 4, depth: 1.6, height: 3.5, tileWidth: 4 },
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
  void bevel;
  return { layers: [{ name: 'body', b }], userData: { radius: 1.35 } };
}
