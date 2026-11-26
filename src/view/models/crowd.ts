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
  b.add(lathe([[0.27, 0.12], [0.29, 0.3], [0.24, 0.6], [0.08, 0.72]], 8), COAT_BASE, { mask: 1, p: [0, 0, 0] });
  b.add(cyl(0.27, 0.27, 0.05, 8, true), HAT_BASE, { mask: 1, p: [0, 0.14, 0] }); // hem band
  // arms (tinted)
  for (const sx of [-1, 1]) b.add(cyl(0.065, 0.075, 0.32, 4), COAT_BASE, { mask: 1, p: [sx * 0.29, 0.44, 0.02], r: [0, 0, sx * 0.35] });
  // scarf (fixed cream)
  b.add(cyl(0.17, 0.2, 0.09, 8, true), P.cream, { mask: 0, p: [0, 0.71, 0] });
  // boots
  for (const sx of [-1, 1]) b.add(box(0.15, 0.13, 0.22), P.boot, { mask: 0, p: [sx * 0.11, 0.065, 0.03] });
  // head
  b.add(sphere(0.24, 7, 5), P.skin, { mask: 0, p: [0, 0.95, 0] });
  for (const sx of [-1, 1]) b.add(box(0.045, 0.07, 0.03), P.eye, { mask: 0, p: [sx * 0.085, 0.98, 0.22] });
  // knitted hat (tinted, darker)
  b.add(lathe([[0.255, 0], [0.23, 0.12], [0.0, 0.26]], 8), HAT_BASE, { mask: 1, p: [0, 1.01, 0] });
  b.add(octa(0.07), P.cream, { mask: 0, p: [0, 1.29, 0] });
  return b.build();
}

function frozen(): THREE.BufferGeometry {
  const b = new Builder();
  const lean = 0.28;
  // hunched coat, frost-pale (tinted lightly if the view wants variety)
  b.add(lathe([[0.29, 0.1], [0.3, 0.28], [0.25, 0.52], [0.1, 0.64]], 8), P.frozenCoat, { mask: 1, r: [lean, 0, 0], p: [0, 0, 0], shade: 0.06, seed: 4 });
  // arms hugging the body
  for (const sx of [-1, 1]) b.add(cyl(0.065, 0.07, 0.3, 4), P.frozenCoat, { mask: 1, p: [sx * 0.15, 0.45, 0.22], r: [1.2, 0, sx * -0.9] });
  for (const sx of [-1, 1]) b.add(box(0.15, 0.12, 0.22), P.frozenDark, { mask: 0, p: [sx * 0.11, 0.06, 0.02] });
  // bowed head, bluish face
  b.add(sphere(0.23, 7, 5), P.frozenSkin, { mask: 0, p: [0, 0.8, 0.2] });
  for (const sx of [-1, 1]) b.add(box(0.06, 0.02, 0.03), P.frozenDark, { mask: 0, p: [sx * 0.08, 0.8, 0.42], r: [0.3, 0, 0] });
  // frosted hood
  b.add(lathe([[0.26, 0], [0.24, 0.12], [0.0, 0.25]], 8), P.frost, { mask: 1, p: [0, 0.84, 0.17], r: [lean + 0.1, 0, 0] });
  // icicles hanging from the hood brim and arms
  const ic: [number, number, number, number][] = [[0.18, 0.84, 0.3, 0.16], [-0.16, 0.85, 0.32, 0.12], [0.0, 0.92, 0.44, 0.1], [0.26, 0.4, 0.2, 0.14], [-0.27, 0.4, 0.2, 0.17], [0.1, 0.3, 0.33, 0.12]];
  for (const [x, y, z, h] of ic) b.add(cone(0.03, h, 3), P.iceTeal, { mask: 0, p: [x, y - h / 2, z], r: [Math.PI, 0, 0] });
  // ice crystals on shoulders & back
  b.add(octa(0.1), P.ice, { mask: 0, p: [0.2, 0.66, -0.05], s: [0.6, 1.4, 0.6], r: [0, 0, -0.4] });
  b.add(octa(0.08), P.iceTeal, { mask: 0, p: [-0.22, 0.6, -0.02], s: [0.6, 1.4, 0.6], r: [0, 0, 0.5] });
  b.add(octa(0.09), P.ice, { mask: 0, p: [0.0, 0.62, -0.25], s: [0.7, 1.3, 0.7], r: [-0.4, 0, 0] });
  return b.build();
}

export function crowdMesh(variant: 'frozen' | 'thawed'): CrowdMeshDef {
  let d = cache.get(variant);
  if (!d) {
    const geometry = variant === 'frozen' ? frozen() : thawed();
    geometry.name = `crowd:${variant}`;
    d = { geometry, material: mats().crowd, height: variant === 'frozen' ? 1.1 : 1.36 };
    cache.set(variant, d);
  }
  return d;
}
