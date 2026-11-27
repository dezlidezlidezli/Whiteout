// Instanced crowd villagers: one merged geometry each, ≤ ~250 triangles.
//
// TINTING: the crowd material multiplies instanceColor ONLY where the per-vertex `tintMask`
// attribute is 1 (coat, hat, mittens). Those regions are near-white / light grey in the base
// geometry, so instanceColor sets the coat colour directly (a darker grey hat becomes a darker
// shade of the same tint). Face, eyes, scarf, boots and ice have tintMask = 0 and keep their
// colours. Without instanceColor (or with white) the villager shows its neutral base colours.
import * as THREE from 'three';
import { Builder, box, cone, cyl, ico, lathe, octa, sphere } from './geo';
import { mats } from './materials';
import { PALETTE as P } from './palette';
import type { CrowdMeshDef } from './index';

const cache = new Map<string, CrowdMeshDef>();

/** Base colour of tintable regions (thawed). instanceColor multiplies this. */
const COAT_BASE = 0xf6f2ec;
const HAT_BASE = 0xc4bcb4;

function thawed(): THREE.BufferGeometry {
  const b = new Builder();
  // coat (tinted, saturated by instanceColor)
  b.add(lathe([[0.27, 0.12], [0.29, 0.3], [0.24, 0.6], [0.08, 0.72]], 8), COAT_BASE, { mask: 1 });
  // arms (tinted)
  for (const sx of [-1, 1]) b.add(cyl(0.065, 0.075, 0.32, 4), COAT_BASE, { mask: 1, p: [sx * 0.29, 0.44, 0.02], r: [0, 0, sx * 0.35] });
  // chunky cream scarf ring + tail down the back (reads from behind and above)
  b.add(cyl(0.19, 0.22, 0.1, 8, true), P.cream, { mask: 0, p: [0, 0.71, 0] });
  b.add(box(0.11, 0.3, 0.04), P.cream, { mask: 0, p: [0.07, 0.56, -0.24], r: [0.25, 0, 0.1] });
  // boots
  for (const sx of [-1, 1]) b.add(box(0.15, 0.13, 0.22), P.boot, { mask: 0, p: [sx * 0.11, 0.065, 0.03] });
  // head: rosy skin, hair at the back
  b.add(sphere(0.24, 7, 5), P.skin, { mask: 0, p: [0, 0.95, 0], back: P.hair, frontZ: 0.1 });
  for (const sx of [-1, 1]) b.add(box(0.05, 0.075, 0.03), P.eye, { mask: 0, p: [sx * 0.085, 0.95, 0.225] });
  // knitted hat (tinted, darker) sits back so the face reads from above; cream bobble
  b.add(lathe([[0.255, 0], [0.22, 0.12], [0.0, 0.24]], 8), HAT_BASE, { mask: 1, p: [0, 1.04, -0.03], r: [-0.25, 0, 0] });
  b.add(octa(0.075), P.cream, { mask: 0, p: [0, 1.29, -0.09] });
  return b.build();
}

/** A villager frozen mid-shiver, designed for the ~50° top-down read at ~65 px:
 *  pale frost on every upward face, cold grey-blue coat showing through on the sides,
 *  separate rounded shoulders, crossed arms with elbows poking out, a narrow slumped hat
 *  with a snow cap, bowed head, scarf tail down the back and an irregular ice block at the feet.
 *  Deliberately asymmetric so random yaw gives variety. Tint mask is 0.5 (takes half the tint). */
function frozen(): THREE.BufferGeometry {
  const b = new Builder();
  const lean = 0.2;
  const FROST = P.frostWhite;
  const ft = { top: FROST, topY: 0.45 };
  // coat: frost on top, cold coat colour showing on the sides
  b.add(lathe([[0.25, 0.14], [0.28, 0.34], [0.27, 0.54], [0.12, 0.68]], 7), P.frozenCoat, { mask: 0.5, r: [lean, 0, 0], ...ft, shade: 0.06, seed: 4 });
  // rounded shoulders, clearly separate bumps
  b.add(ico(0.135, 0), FROST, { mask: 0.5, p: [0.2, 0.62, 0.06], s: [1, 0.8, 1], bottom: P.frozenCoat, topY: 0.1 });
  b.add(ico(0.13, 0), FROST, { mask: 0.5, p: [-0.2, 0.6, 0.07], s: [1, 0.8, 1], bottom: P.frozenCoat, topY: 0.1 });
  // crossed arms with elbows sticking out past the body
  b.add(cyl(0.075, 0.08, 0.62, 4), P.frozenArm, { mask: 0.5, p: [0.02, 0.5, 0.25], r: [0.15, 0.2, Math.PI / 2 - 0.2], ...ft });
  b.add(cyl(0.075, 0.08, 0.6, 4), P.frozenArmDark, { mask: 0.5, p: [-0.02, 0.42, 0.27], r: [-0.05, -0.15, Math.PI / 2 + 0.22], ...ft });
  // scarf tail frozen stiff down the back (a hint of faded colour)
  b.add(box(0.1, 0.3, 0.04), P.frozenScarf, { mask: 0, p: [-0.08, 0.55, -0.24], r: [0.3, 0.1, -0.15], ...ft });
  // bowed head: cold grey face patch at the front, frosted hair at the back
  b.add(sphere(0.21, 6, 4), P.frozenSkin, { mask: 0, p: [0.02, 0.84, 0.13], front: P.frozenFace, back: P.frozenHair, frontZ: 0.15, bottom: P.frozenHair, topY: 0.5 });
  // narrow slumped hat, tipped forward and to one side, with a snow cap
  b.add(lathe([[0.2, 0], [0.16, 0.12], [0.0, 0.24]], 7), P.frozenHat, { mask: 0.5, p: [0.03, 0.96, 0.08], r: [0.35, 0, -0.3], top: FROST, topY: 0.6 });
  b.add(ico(0.1, 0), FROST, { mask: 0, p: [0.09, 1.14, 0.12], s: [1.2, 0.55, 1] });
  // icicles on the hat brim and one elbow
  const ic: [number, number, number, number][] = [[0.17, 0.94, 0.24, 0.17], [-0.12, 0.98, 0.25, 0.12], [-0.36, 0.44, 0.24, 0.16]];
  for (const [x, y, z, h] of ic) b.add(cone(0.035, h, 3), P.iceTeal, { mask: 0, p: [x, y - h / 2, z], r: [Math.PI, 0, 0] });
  // chunky irregular ice block locking the feet, plus one leaning shard
  b.add(cyl(0.31, 0.4, 0.36, 7), P.frozenIce, { mask: 0, p: [0.02, 0.18, 0.02], r: [0.06, 0, -0.05], jitter: 0.07, seed: 3, top: FROST, topY: 0.6 });
  b.add(octa(0.16), P.iceTeal, { mask: 0, p: [0.3, 0.3, -0.12], s: [0.7, 1.7, 0.6], r: [0.2, 0.4, -0.45] });
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
