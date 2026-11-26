// Instanced crowd villagers: one merged geometry each, ≤ ~250 triangles.
//
// TINTING: the crowd material multiplies instanceColor ONLY where the per-vertex `tintMask`
// attribute is 1 (coat, hat, mittens). Those regions are near-white / light grey in the base
// geometry, so instanceColor sets the coat colour directly (a darker grey hat becomes a darker
// shade of the same tint). Face, eyes, scarf, boots and ice have tintMask = 0 and keep their
// colours. Without instanceColor (or with white) the villager shows its neutral base colours.
import * as THREE from 'three';
import { Builder, box, cone, cyl, lathe, octa, sphere } from './geo';
import { mats } from './materials';
import { PALETTE as P } from './palette';
import type { CrowdMeshDef } from './index';

const cache = new Map<string, CrowdMeshDef>();

/** Base colour of tintable regions (thawed). instanceColor multiplies this. */
const COAT_BASE = 0xf6f2ec;
const HAT_BASE = 0xc4bcb4;

function thawed(): THREE.BufferGeometry {
  const b = new Builder();
  // coat (tinted)
  b.add(lathe([[0.27, 0.12], [0.29, 0.3], [0.24, 0.6], [0.08, 0.72]], 8), COAT_BASE, { mask: 1 });
  // arms (tinted)
  for (const sx of [-1, 1]) b.add(cyl(0.065, 0.075, 0.32, 4), COAT_BASE, { mask: 1, p: [sx * 0.29, 0.44, 0.02], r: [0, 0, sx * 0.35] });
  // scarf (fixed cream)
  b.add(cyl(0.17, 0.2, 0.09, 8, true), P.cream, { mask: 0, p: [0, 0.71, 0] });
  // boots
  for (const sx of [-1, 1]) b.add(box(0.15, 0.13, 0.22), P.boot, { mask: 0, p: [sx * 0.11, 0.065, 0.03] });
  // head with rosy face front
  b.add(sphere(0.24, 7, 5), P.skin, { mask: 0, p: [0, 0.95, 0] });
  for (const sx of [-1, 1]) b.add(box(0.05, 0.075, 0.03), P.eye, { mask: 0, p: [sx * 0.085, 0.95, 0.225] });
  // knitted hat (tinted, darker), sits back on the head so the face reads from above
  b.add(lathe([[0.255, 0], [0.22, 0.12], [0.0, 0.24]], 8), HAT_BASE, { mask: 1, p: [0, 1.04, -0.03], r: [-0.25, 0, 0] });
  b.add(octa(0.07), P.cream, { mask: 0, p: [0, 1.29, -0.09] });
  return b.build();
}

/** A villager frozen mid-shiver, hugging themselves, feet locked in a block of ice.
 *  Under the frost the coat keeps a muted hint of colour; frost whitens upward faces. */
function frozen(): THREE.BufferGeometry {
  const b = new Builder();
  const lean = 0.16;
  const frostTop = { top: P.frost, topY: 0.82 };
  // hunched coat: broad shoulders, narrower hem
  b.add(lathe([[0.24, 0.12], [0.28, 0.3], [0.31, 0.5], [0.22, 0.65], [0.08, 0.7]], 8), P.frozenCoat, { mask: 1, r: [lean, 0, 0], ...frostTop, shade: 0.05, seed: 4 });
  // arms wrapped tightly across the chest, hands tucked under the armpits
  b.add(cyl(0.08, 0.085, 0.52, 4), P.frozenArm, { mask: 1, p: [0.01, 0.53, 0.25], r: [0.25, 0, Math.PI / 2 - 0.22], ...frostTop });
  b.add(cyl(0.08, 0.085, 0.52, 4), P.frozenArmDark, { mask: 1, p: [-0.01, 0.44, 0.27], r: [-0.05, 0, Math.PI / 2 + 0.22], ...frostTop });
  // head tucked down into the collar, face in frosty shadow, eyes squeezed shut
  b.add(sphere(0.23, 6, 5), P.frozenSkin, { mask: 0, p: [0, 0.89, 0.1], front: P.frozenFace, frontZ: 0.25, top: P.frost, topY: 0.8 });
  for (const sx of [-1, 1]) b.add(box(0.08, 0.025, 0.03), P.frozenDark, { mask: 0, p: [sx * 0.085, 0.89, 0.32], r: [0.2, 0, sx * 0.25] });
  // knitted hat (still a hint of colour) with frosted bobble
  b.add(lathe([[0.245, 0], [0.205, 0.11], [0.0, 0.2]], 8), P.frozenHat, { mask: 1, p: [0, 1.0, 0.02], r: [-0.5, 0, 0], ...frostTop });
  b.add(octa(0.075), P.frost, { mask: 0, p: [0, 1.17, -0.1] });
  // feet locked in a jagged ice block
  b.add(cyl(0.3, 0.38, 0.34, 6), P.ice, { mask: 0, p: [0, 0.17, 0.02], jitter: 0.05, seed: 3, top: P.frost, topY: 0.7 });
  // icicles from hat brim and elbows
  const ic: [number, number, number, number][] = [[0.17, 0.99, 0.17, 0.16], [-0.16, 0.99, 0.18, 0.13], [0.33, 0.5, 0.2, 0.17], [-0.33, 0.44, 0.22, 0.15]];
  for (const [x, y, z, h] of ic) b.add(cone(0.035, h, 3), P.iceTeal, { mask: 0, p: [x, y - h / 2, z], r: [Math.PI, 0, 0] });
  return b.build();
}

export function crowdMesh(variant: 'frozen' | 'thawed'): CrowdMeshDef {
  let d = cache.get(variant);
  if (!d) {
    const geometry = variant === 'frozen' ? frozen() : thawed();
    geometry.name = `crowd:${variant}`;
    d = { geometry, material: mats().crowd, height: variant === 'frozen' ? 1.25 : 1.36 };
    cache.set(variant, d);
  }
  return d;
}
