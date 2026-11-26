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

/** A villager frozen mid-shiver: hugging itself, hat on, face dim under the frost. */
function frozen(): THREE.BufferGeometry {
  const b = new Builder();
  const lean = 0.18;
  // frosted coat (tintable for slight variety)
  b.add(lathe([[0.26, 0.1], [0.29, 0.3], [0.31, 0.52], [0.2, 0.66], [0.07, 0.7]], 8), P.frozenCoat, { mask: 1, r: [lean, 0, 0], shade: 0.06, seed: 4 });
  // arms crossed over the chest (hugging itself)
  b.add(cyl(0.075, 0.08, 0.5, 4), P.frozenArm, { mask: 1, p: [0.02, 0.52, 0.26], r: [0.2, 0, Math.PI / 2 - 0.3] });
  b.add(cyl(0.075, 0.08, 0.5, 4), P.frozenArm, { mask: 1, p: [-0.02, 0.42, 0.28], r: [-0.1, 0, Math.PI / 2 + 0.3] });
  // boots
  b.add(box(0.38, 0.12, 0.22), P.frozenDark, { mask: 0, p: [0, 0.06, 0.02] });
  // bowed head: dim, bluish face showing through the frost
  b.add(sphere(0.23, 6, 5), P.frozenSkin, { mask: 0, p: [0, 0.9, 0.1], front: P.frozenFace, frontZ: 0.2 });
  for (const sx of [-1, 1]) b.add(box(0.08, 0.03, 0.03), P.frozenDark, { mask: 0, p: [sx * 0.085, 0.9, 0.325], r: [0.2, 0, sx * 0.2] });
  // knitted hat with bobble, rimed with frost
  b.add(lathe([[0.24, 0], [0.2, 0.11], [0.0, 0.2]], 8), P.frozenHat, { mask: 1, p: [0, 1.0, 0.02], r: [-0.55, 0, 0] });
  b.add(octa(0.07), P.frost, { mask: 0, p: [0, 1.17, -0.1] });
  // icicles from the hat brim, elbows and hem
  const ic: [number, number, number, number][] = [[0.17, 1.0, 0.16, 0.16], [-0.15, 1.0, 0.17, 0.12], [0.3, 0.48, 0.24, 0.16], [-0.3, 0.42, 0.25, 0.14]];
  for (const [x, y, z, h] of ic) b.add(cone(0.035, h, 3), P.iceTeal, { mask: 0, p: [x, y - h / 2, z], r: [Math.PI, 0, 0] });
  // ice crystals on the shoulders
  b.add(octa(0.11), P.ice, { mask: 0, p: [0.22, 0.68, -0.08], s: [0.6, 1.5, 0.6], r: [0, 0, -0.5] });
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
