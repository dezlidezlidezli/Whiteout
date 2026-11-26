// Carryable items: one merged vertex-coloured geometry + one shared material each.
// Every item sits on y = 0, is roughly 0.5 m across and flat enough to stack 30+ high.
import * as THREE from 'three';
import { Builder, bevel, box, cone, cyl, dodec, ico, lathe, octa, prism, sphere } from './geo';
import { mats } from './materials';
import { PALETTE as P } from './palette';
import type { ItemKind, ItemMeshDef } from './index';

const cache = new Map<string, ItemMeshDef>();

export function fishBody(b: Builder, body: number, back: number, belly: number, fin: number, o: { stripes?: number; y?: number; lod?: boolean } = {}) {
  const y = o.y ?? 0.065;
  if (o.lod) {
    b.add(sphere(0.2, 6, 4), body, { p: [0.02, y, 0], s: [1.25, 0.34, 0.58], top: back, topY: 0.85 });
    b.add(prism([[0, 0], [0.12, 0.09], [0.09, 0], [0.12, -0.09]], 0.05), fin, { p: [-0.2, y, 0], r: [Math.PI / 2, 0, Math.PI] });
    b.add(box(0.03, 0.02, 0.03), 0x1a1a22, { p: [0.21, y + 0.06, -0.02] });
    return;
  }
  // lying on its side (profile visible from above), head at +X, back towards -Z
  b.add(sphere(0.2, 10, 6), body, { p: [0.02, y, 0], s: [1.25, 0.34, 0.58] });
  b.add(sphere(0.2, 8, 4), back, { p: [0.0, y + 0.005, -0.05], s: [1.05, 0.3, 0.33] });
  b.add(sphere(0.2, 8, 4), belly, { p: [0.04, y - 0.004, 0.06], s: [0.95, 0.3, 0.3] });
  // tail (flat, in XZ)
  b.add(prism([[0, 0], [0.12, 0.09], [0.09, 0], [0.12, -0.09]], 0.05), fin, { p: [-0.2, y, 0], r: [Math.PI / 2, 0, Math.PI] });
  // dorsal fin (small, tucked)
  b.add(prism([[-0.08, 0], [0.06, 0], [-0.06, 0.035]], 0.03), fin, { p: [-0.02, y, -0.1], r: [-Math.PI / 2, 0, 0] });
  // gill line + eye on the upward side
  b.add(box(0.015, 0.02, 0.15), back, { p: [0.15, y + 0.06, 0], r: [0, 0, 0.3] });
  b.add(sphere(0.03, 6, 4), 0xffffff, { p: [0.21, y + 0.05, -0.02], s: [1, 0.5, 1] });
  b.add(sphere(0.017, 5, 3), 0x1a1a22, { p: [0.215, y + 0.064, -0.02] });
  if (o.stripes !== undefined) {
    for (const x of [-0.1, 0.03, 0.15]) b.add(box(0.03, 0.14, 0.2), o.stripes, { p: [x, y, 0] });
  }
}

function make(kind: ItemKind): ItemMeshDef {
  const b = new Builder();
  let stackHeight = 0.16;
  let radius = 0.26;
  let material: THREE.Material = mats().std;
  switch (kind) {
    case 'fish':
      fishBody(b, P.fish, P.fishDark, P.fishBelly, P.fishDark);
      stackHeight = 0.13;
      break;
    case 'smokedFish':
      // golden-brown smoked fish with twine ties, on a flat stick
      fishBody(b, P.smoked, P.smokedDark, 0xd89a4a, P.smokedDark, { stripes: P.rope });
      b.add(box(0.5, 0.025, 0.05), P.woodDark, { p: [0.0, 0.015, 0] });
      stackHeight = 0.14;
      break;
    case 'stew': {
      // ceramic bowl brimming with orange stew + carrot coins + herbs
      b.add(lathe([[0.0, 0], [0.13, 0], [0.2, 0.04], [0.24, 0.13], [0.255, 0.15], [0.23, 0.15], [0.0, 0.15]], 10), P.bowl, { shade: 0.03, seed: 1 });
      b.add(cyl(0.255, 0.255, 0.03, 10, true), P.copper, { p: [0, 0.1, 0] }); // glaze band
      b.add(cyl(0.225, 0.225, 0.02, 10), P.stew, { p: [0, 0.155, 0] });
      for (const [x, z] of [[0.08, 0.05], [-0.1, 0.03], [0.0, -0.11], [-0.04, 0.12]] as const)
        b.add(cyl(0.04, 0.04, 0.03, 6), P.carrot, { p: [x, 0.17, z] });
      for (const [x, z] of [[0.11, -0.07], [-0.08, -0.08], [0.03, 0.1]] as const)
        b.add(box(0.05, 0.02, 0.03), P.herb, { p: [x, 0.17, z], r: [0, x * 10, 0] });
      b.add(sphere(0.045, 5, 4), 0xe0c090, { p: [-0.02, 0.165, 0.0], s: [1, 0.5, 1] }); // potato
      stackHeight = 0.17;
      radius = 0.26;
      break;
    }
    case 'log':
      b.add(cyl(0.13, 0.13, 0.56, 8), P.bark, { p: [0, 0.13, 0], r: [0, 0, Math.PI / 2], shade: 0.08, seed: 5 });
      for (const sx of [-1, 1]) {
        b.add(cyl(0.105, 0.105, 0.02, 8), P.woodPale, { p: [sx * 0.285, 0.13, 0], r: [0, 0, Math.PI / 2] });
        b.add(cyl(0.05, 0.05, 0.022, 6), P.woodLight, { p: [sx * 0.29, 0.13, 0], r: [0, 0, Math.PI / 2] });
      }
      b.add(cone(0.035, 0.08, 4), P.bark, { p: [0.05, 0.24, 0.05], r: [-0.4, 0, 0] }); // twig stub
      stackHeight = 0.24;
      radius = 0.3;
      break;
    case 'plank':
      b.add(bevel(0.62, 0.07, 0.22, 0.015), P.woodPale, { p: [0, 0.035, 0], shade: 0.03, seed: 3 });
      for (const z of [-0.05, 0.045]) b.add(box(0.5, 0.004, 0.012), P.woodLight, { p: [0.02, 0.071, z] });
      b.add(sphere(0.02, 4, 3), P.woodDark, { p: [-0.18, 0.07, -0.02], s: [1.5, 0.3, 1] });
      stackHeight = 0.075;
      radius = 0.32;
      break;
    case 'ore':
      b.add(dodec(0.17), P.ore, { p: [0, 0.12, 0], s: [1.3, 0.75, 1.1], jitter: 0.025, seed: 11, shade: 0.18, top: 0x8a8290, topY: 0.75 });
      for (const [x, y, z, r] of [[0.08, 0.2, 0.06, 0.05], [-0.12, 0.17, -0.04, 0.045], [0.02, 0.22, -0.09, 0.04], [-0.05, 0.12, 0.14, 0.04]] as const)
        b.add(octa(r * 1.15), P.oreRust, { p: [x, y, z], jitter: 0.008, seed: 3, top: 0xe0884a, topY: 0.4 });
      b.add(octa(0.045), 0xdfe8f2, { p: [0.12, 0.15, -0.08] });
      b.add(octa(0.04), 0xdfe8f2, { p: [-0.13, 0.12, 0.1] });
      stackHeight = 0.2;
      radius = 0.24;
      break;
    case 'ingot':
      // classic trapezoid bar
      // chamfered trapezoid bar: side profile extruded with a small bevel
      {
        const sh = new THREE.Shape();
        sh.moveTo(-0.22, 0.012); sh.lineTo(0.22, 0.012); sh.lineTo(0.17, 0.088); sh.lineTo(-0.17, 0.088); sh.lineTo(-0.22, 0.012);
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.012, bevelSegments: 1 });
        g.translate(0, 0, -0.08); g.deleteAttribute('uv');
        b.add(g, P.ingot, { top: 0xe4ecf4, topY: 0.8, shade: 0.06, seed: 2 });
      }
      b.add(prism([[0, 0.05], [0.035, 0], [0, -0.05], [-0.035, 0]], 0.006), P.copper, { p: [0, 0.103, 0], r: [-Math.PI / 2, 0, 0] }); // ember stamp
      for (const x of [-0.1, 0.1]) b.add(box(0.012, 0.004, 0.12), 0x7f8b9c, { p: [x, 0.102, 0] });
      stackHeight = 0.1;
      radius = 0.26;
      break;
    case 'feast':
      // big platter with a lattice pie, berries and a drumstick
      b.add(cyl(0.29, 0.25, 0.04, 12), P.plate, { p: [0, 0.02, 0] });
      b.add(cyl(0.3, 0.3, 0.015, 12, true), P.copper, { p: [0, 0.035, 0] });
      b.add(cyl(0.2, 0.22, 0.09, 10), P.pie, { p: [0, 0.085, 0], top: 0xf0be62 });
      for (const o of [-0.08, 0, 0.08]) {
        b.add(box(0.36, 0.02, 0.03), 0xc4822e, { p: [0, 0.135, o] });
        b.add(box(0.03, 0.021, 0.36), 0xc4822e, { p: [o, 0.136, 0] });
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        b.add(sphere(0.03, 5, 4), i % 2 ? P.berry : P.herb, { p: [Math.cos(a) * 0.25, 0.055, Math.sin(a) * 0.25] });
      }
      b.add(sphere(0.06, 6, 4), 0xb5652a, { p: [0.17, 0.16, 0.12], s: [1.3, 0.8, 1] });
      b.add(cyl(0.015, 0.015, 0.1, 4), P.cream, { p: [0.25, 0.17, 0.18], r: [0, 0, 1.2] });
      stackHeight = 0.17;
      radius = 0.3;
      break;
    case 'ember':
      // glowing amber shard cluster
      b.add(ico(0.15, 0), 0xd8460a, { p: [0, 0.1, 0], s: [1.1, 0.75, 0.9], r: [0, 0.4, 0], top: 0xff9a1a, topY: 0.55, jitter: 0.012, seed: 1, shade: 0.12 });
      b.add(octa(0.085), 0xc0300a, { p: [0.12, 0.06, 0.06], s: [1, 0.8, 1], r: [0.3, 0, 0.2], top: 0xff8a12, topY: 0.5 });
      b.add(octa(0.075), 0xe0600e, { p: [-0.11, 0.055, -0.06], s: [1, 0.9, 1], r: [0, 0, 0.4], top: 0xffc23a, topY: 0.5 });
      b.add(octa(0.05), 0xffb020, { p: [-0.03, 0.04, 0.12], r: [0.5, 0.2, 0] });
      material = mats().ember;
      stackHeight = 0.14;
      radius = 0.2;
      break;
    default:
      b.add(bevel(0.4, 0.18, 0.4), 0xff00ff, { p: [0, 0.09, 0] });
  }
  const geometry = b.build();
  geometry.name = `item:${kind}`;
  return { geometry, material, stackHeight, radius };
}

function trapezoid(lb: number, lt: number, wb: number, wt: number, h: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setXYZ(i, p.getX(i) * (top ? lt : lb), top ? h : 0, p.getZ(i) * (top ? wt : wb));
  }
  return g;
}

export function itemMesh(kind: ItemKind): ItemMeshDef {
  let d = cache.get(kind);
  if (!d) { d = make(kind); cache.set(kind, d); }
  return d;
}
