// Articulated low-poly characters + procedural animation.
import * as THREE from 'three';
import { Builder, bevel, box, cone, cyl, ico, lathe, octa, prism, sphere, torus } from './geo';
import { mats, RENDER_FLAGS } from './materials';
import { PALETTE as P } from './palette';
import type { CharacterAnimState, CharacterRig, CharacterRole, ModelOpts } from './index';

// ---------------------------------------------------------------- styles
type Hat = 'bobble' | 'headscarf' | 'trapper' | 'souwester' | 'helmet' | 'flatcap' | 'earmuffs';
type Tool = 'none' | 'axe' | 'pick' | 'rod' | 'spoon';
interface Style {
  coat: number; coatDark: number; trousers: number; boots: number; mitts: number;
  hat: Hat; hatColor: number; hatAccent: number;
  scarf?: number; apron?: boolean; beard?: boolean; backpack?: boolean; ladle?: boolean;
  tool: Tool; stout: number; hair: number;
}

/** Central character styling: adjust colours/proportions here. */
export const CHARACTER_STYLES: Record<Exclude<CharacterRole, 'dog'>, Style> = {
  player: {
    coat: P.coatRust, coatDark: P.coatRustDark, trousers: 0x4b4150, boots: P.boot, mitts: P.mitten,
    hat: 'bobble', hatColor: P.hatMustard, hatAccent: P.scarfCream, scarf: P.scarfCream, ladle: true,
    tool: 'none', stout: 1.08, hair: P.hair,
  },
  porter: {
    coat: P.porter, coatDark: 0x2c517a, trousers: 0x5a4a3a, boots: P.boot, mitts: 0x6b4528,
    hat: 'flatcap', hatColor: 0x6b5848, hatAccent: 0x4a3c30, scarf: 0xd9a53a, backpack: true,
    tool: 'none', stout: 1.0, hair: 0x3a2a20,
  },
  cook: {
    coat: P.mustard, coatDark: 0xa87a24, trousers: 0x6b4a3a, boots: P.boot, mitts: P.skin,
    hat: 'headscarf', hatColor: P.cook, hatAccent: 0xf7d6dc, apron: true,
    tool: 'spoon', stout: 1.12, hair: 0x8a4a2a,
  },
  lumberjack: {
    coat: P.lumberjack, coatDark: 0x22482a, trousers: 0x4a3a2c, boots: 0x3a2a1e, mitts: 0x8a5a2a,
    hat: 'trapper', hatColor: 0x7a5232, hatAccent: P.cream, beard: true,
    tool: 'axe', stout: 1.15, hair: 0x6b3a1e,
  },
  fisher: {
    coat: P.fisher, coatDark: 0xc49418, trousers: 0x3f5a66, boots: 0x2f4a3a, mitts: 0x3f5a66,
    hat: 'souwester', hatColor: P.fisher, hatAccent: 0xc49418, scarf: 0x3f72a8,
    tool: 'rod', stout: 1.0, hair: 0xb07a40,
  },
  miner: {
    coat: P.miner, coatDark: 0x3c4350, trousers: 0x4a3f38, boots: 0x2e2622, mitts: 0x8a6a3a,
    hat: 'helmet', hatColor: P.copper, hatAccent: P.minerLamp, scarf: 0xc4562a,
    tool: 'pick', stout: 1.1, hair: 0x2a2020,
  },
  villager: {
    coat: P.villager, coatDark: 0x5e3a5c, trousers: 0x4a4050, boots: P.boot, mitts: 0xe0a83a,
    hat: 'earmuffs', hatColor: 0xf3e6c8, hatAccent: 0xcc4f66, scarf: 0xe0a83a,
    tool: 'none', stout: 1.0, hair: 0x6a4a30,
  },
};

// ---------------------------------------------------------------- dimensions
const HIP = 0.42;       // hip pivot height
const SHOULDER = 0.47;  // relative to body pivot
const NECK = 0.6;       // relative to body pivot
const ARM_LEN = 0.36;

interface Parts {
  rig: THREE.Object3D; body: THREE.Object3D; head: THREE.Object3D;
  armL: THREE.Object3D; armR: THREE.Object3D; legL: THREE.Object3D; legR: THREE.Object3D;
  tail?: THREE.Object3D; legBL?: THREE.Object3D; legBR?: THREE.Object3D; tool?: THREE.Object3D;
  quad: boolean; phase: number;
  /** smoothed animation state (accumulated gait phase, blend weights) */
  st?: AnimState;
}
const partsMap = new WeakMap<THREE.Object3D, Parts>();
const geoCache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, f: () => Builder): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) { g = f().build(); geoCache.set(key, g); }
  return g;
}

function mesh(g: THREE.BufferGeometry, name: string, mat: THREE.Material = mats().std): THREE.Mesh {
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.castShadow = mat !== mats().glow;
  m.receiveShadow = true;
  return m;
}
function group(name: string, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

// ---------------------------------------------------------------- humanoid parts
function torsoGeo(role: string, st: Style): THREE.BufferGeometry {
  return cached(`torso:${role}`, () => {
    const b = new Builder();
    const w = st.stout;
    // coat: rounded barrel with a flared hem
    b.add(lathe([[0, -0.08], [0.3, -0.08], [0.33, 0.05], [0.33, 0.24], [0.3, 0.42], [0.22, 0.56], [0.1, 0.62], [0, 0.62]], 10),
      st.coat, { s: [w, 1, w * 0.92], shade: 0.04, seed: 3 });
    // quilting bands
    for (const y of [0.12, 0.3]) b.add(cyl(0.335, 0.335, 0.03, 10, true), st.coatDark, { p: [0, y, 0], s: [w, 1, w * 0.92] });
    // front seam + toggles
    b.add(box(0.035, 0.46, 0.03), st.coatDark, { p: [0, 0.24, 0.3 * w * 0.94], r: [-0.06, 0, 0] });
    for (const y of [0.2, 0.36]) b.add(box(0.08, 0.035, 0.04), P.cream, { p: [0, y, 0.31 * w * 0.94], r: [-0.08, 0, 0] });
    // belt
    b.add(cyl(0.34, 0.34, 0.07, 10), P.boot, { p: [0, 0.02, 0], s: [w, 1, w * 0.92] });
    b.add(bevel(0.09, 0.07, 0.03, 0.01), P.copper, { p: [0, 0.02, 0.33 * w * 0.92] });
    if (st.ladle) {
      // copper ladle hanging on the belt at the right hip
      b.add(box(0.03, 0.26, 0.02), P.copperDark, { p: [-0.34 * w, -0.06, 0.08], r: [0, 0, -0.15] });
      b.add(sphere(0.07, 6, 4), P.copper, { p: [-0.36 * w, -0.2, 0.08], s: [1, 0.7, 1] });
    }
    if (st.scarf !== undefined) {
      b.add(torus(0.17, 0.075, 4, 10), st.scarf, { p: [0, 0.6, 0], r: [Math.PI / 2, 0, 0], s: [1.1, 1, 1] });
      b.add(bevel(0.1, 0.24, 0.045, 0.02), st.scarf, { p: [0.15, 0.47, 0.28 * w], r: [-0.3, 0.3, 0.35] });
      b.add(box(0.1, 0.025, 0.05), st.hatColor, { p: [0.19, 0.38, 0.31 * w], r: [-0.3, 0.3, 0.35] });
    }
    if (st.apron) {
      // skirt wraps around the front of the coat, bib follows the chest curve
      b.add(new THREE.CylinderGeometry(0.345, 0.37, 0.46, 8, 1, true, -0.85, 1.7), P.cream, { p: [0, 0.1, 0], s: [w, 1, w * 0.94], shade: 0.03, seed: 6 });
      b.add(new THREE.CylinderGeometry(0.29, 0.335, 0.24, 6, 1, true, -0.5, 1.0), P.cream, { p: [0, 0.42, 0], s: [w, 1, w * 0.94] });
      b.add(new THREE.CylinderGeometry(0.375, 0.375, 0.035, 8, 1, true, -0.85, 1.7), P.cook, { p: [0, -0.12, 0], s: [w, 1, w * 0.94] }); // hem trim
      b.add(bevel(0.16, 0.08, 0.03, 0.01), P.cook, { p: [0.08, 0.05, 0.36 * w], r: [-0.05, 0.25, 0] }); // pocket
      for (const sx of [-1, 1]) b.add(box(0.035, 0.3, 0.03), P.cream, { p: [sx * 0.12, 0.5, 0.08], r: [-0.9, 0, 0] }); // straps
      for (const sx of [-1, 1]) b.add(sphere(0.05, 5, 4), P.cream, { p: [sx * 0.05, 0.05, -0.34 * w], s: [1.3, 0.8, 0.6] }); // tie bow
    }
    if (st.backpack) {
      b.add(bevel(0.46, 0.55, 0.26, 0.06), 0x7a5232, { p: [0, 0.32, -0.38], shade: 0.05, seed: 5 });
      b.add(bevel(0.48, 0.12, 0.28, 0.04), 0x5a3a20, { p: [0, 0.62, -0.38] });
      b.add(cyl(0.1, 0.1, 0.56, 7), P.canvas, { p: [0, 0.74, -0.38], r: [0, 0, Math.PI / 2] }); // bedroll
      b.add(box(0.04, 0.5, 0.04), P.woodDark, { p: [0.25, 0.4, -0.5] });
      b.add(box(0.04, 0.5, 0.04), P.woodDark, { p: [-0.25, 0.4, -0.5] });
    }
    return b;
  });
}

function headGeo(role: string, st: Style): THREE.BufferGeometry {
  return cached(`head:${role}`, () => {
    const b = new Builder();
    const R = 0.27;
    const cy = 0.24;
    b.add(sphere(R, 10, 8), P.skin, { p: [0, cy, 0] });
    // face: big friendly eyes with a highlight, rosy cheeks, button nose, little smile
    for (const sx of [-1, 1]) {
      b.add(sphere(0.048, 6, 5), P.eye, { p: [sx * 0.1, cy + 0.01, R - 0.025], s: [0.9, 1.25, 0.6] });
      b.add(sphere(0.015, 4, 3), 0xffffff, { p: [sx * 0.1 + 0.014, cy + 0.04, R + 0.0] });
      b.add(sphere(0.055, 6, 4), P.blush, { p: [sx * 0.165, cy - 0.075, R - 0.07], s: [1, 0.6, 0.5] });
    }
    b.add(sphere(0.045, 6, 4), P.nose, { p: [0, cy - 0.045, R + 0.0], s: [1.1, 0.85, 0.9] });
    b.add(torus(0.045, 0.011, 3, 6, Math.PI), 0x8a3a2a, { p: [0, cy - 0.1, R - 0.03], r: [0.25, 0, Math.PI] });
    // hair peeking out at the back and sides
    if (st.hat !== 'helmet') b.add(sphere(0.21, 8, 5), st.hair, { p: [0, cy + 0.06, -0.1], s: [1.25, 1.0, 1.05] });
    if (st.beard) {
      b.add(sphere(0.2, 8, 5), st.hair, { p: [0, cy - 0.17, 0.11], s: [1.15, 0.85, 0.85], jitter: 0.015, seed: 4 });
      b.add(sphere(0.06, 6, 4), st.hair, { p: [0.05, cy - 0.08, R - 0.02], s: [1.3, 0.6, 0.7] });
      b.add(sphere(0.06, 6, 4), st.hair, { p: [-0.05, cy - 0.08, R - 0.02], s: [1.3, 0.6, 0.7] });
    }
    const h = new Builder();
    hat(h, st, 0, R);
    const tilt = st.hat === 'headscarf' || st.hat === 'earmuffs' ? -0.1 : -0.32;
    const sc = st.hat === 'souwester' || st.hat === 'helmet' ? 0.95 : 0.9;
    b.merge(h, { p: [0, cy + 0.09, -0.04], r: [tilt, 0, 0], s: sc });
    return b;
  });
}

function hat(b: Builder, st: Style, cy: number, R: number) {
  const c = st.hatColor, a = st.hatAccent;
  switch (st.hat) {
    case 'bobble':
      b.add(lathe([[R + 0.03, 0], [R + 0.02, 0.12], [R - 0.04, 0.26], [0.1, 0.33], [0, 0.35]], 10), c,
        { p: [0, cy + 0.06, 0], shade: 0.05, seed: 2 });
      b.add(cyl(R + 0.045, R + 0.045, 0.1, 10), a, { p: [0, cy + 0.08, 0] });
      b.add(cyl(R + 0.025, R + 0.025, 0.04, 10, true), P.coatRust, { p: [0, cy + 0.22, 0] });
      b.add(ico(0.085, 0), a, { p: [0, cy + 0.43, 0] });
      break;
    case 'headscarf':
      b.add(lathe([[R + 0.025, 0], [R + 0.015, 0.1], [R - 0.05, 0.22], [0, 0.29]], 10), c, { p: [0, cy + 0.02, -0.02], r: [-0.25, 0, 0] });
      for (const [x, y, z] of [[0.05, 0.1, -0.29], [-0.05, 0.1, -0.29]] as const) b.add(ico(0.06), c, { p: [x, cy + y, z] });
      b.add(cone(0.08, 0.2, 4), c, { p: [0, cy - 0.04, -0.3], r: [Math.PI, 0, 0] });
      for (let i = 0; i < 5; i++) {
        const ang = -0.9 + i * 0.45;
        b.add(sphere(0.022, 4, 3), a, { p: [Math.sin(ang) * (R + 0.02), cy + 0.2, Math.cos(ang) * (R + 0.02) - 0.08] });
      }
      break;
    case 'trapper':
      b.add(lathe([[R + 0.02, 0], [R, 0.14], [0.12, 0.27], [0, 0.29]], 10), c, { p: [0, cy + 0.06, 0] });
      b.add(cyl(R + 0.05, R + 0.05, 0.08, 10), a, { p: [0, cy + 0.1, 0] });
      for (const sx of [-1, 1]) b.add(bevel(0.07, 0.22, 0.18, 0.03), a, { p: [sx * (R + 0.01), cy - 0.02, -0.02] });
      b.add(bevel(0.3, 0.1, 0.05, 0.02), a, { p: [0, cy + 0.2, R - 0.02], r: [-0.4, 0, 0] });
      break;
    case 'souwester':
      b.add(lathe([[R + 0.02, 0], [R - 0.02, 0.15], [0.1, 0.25], [0, 0.26]], 10), c, { p: [0, cy + 0.06, 0] });
      b.add(cyl(0.42, 0.46, 0.04, 12), a, { p: [0, cy + 0.07, -0.08], r: [-0.18, 0, 0] });
      break;
    case 'helmet':
      b.add(lathe([[R + 0.04, 0], [R + 0.03, 0.12], [0.18, 0.27], [0, 0.31]], 10), c, { p: [0, cy + 0.03, 0], shade: 0.04, seed: 9 });
      b.add(cyl(R + 0.08, R + 0.08, 0.03, 12), P.copperDark, { p: [0, cy + 0.04, 0.02] });
      b.add(cyl(0.035, 0.035, 0.3, 4), P.copperDark, { p: [0, cy + 0.24, 0], r: [Math.PI / 2, 0, 0] });
      b.add(cyl(0.07, 0.08, 0.06, 8), P.iron, { p: [0, cy + 0.17, R + 0.03], r: [Math.PI / 2, 0, 0] });
      break;
    case 'flatcap':
      b.add(lathe([[R + 0.02, 0], [R + 0.01, 0.08], [0.16, 0.17], [0, 0.19]], 10), c, { p: [0, cy + 0.09, -0.01], shade: 0.04, seed: 8 });
      b.add(cyl(0.18, 0.2, 0.03, 8, false), a, { p: [0, cy + 0.12, R - 0.02], s: [1, 1, 0.7], r: [0.15, 0, 0] });
      break;
    case 'earmuffs':
      b.add(torus(R + 0.02, 0.025, 3, 10, Math.PI), a, { p: [0, cy + 0.02, 0], r: [0, 0, 0] });
      for (const sx of [-1, 1]) b.add(sphere(0.1, 7, 5), c, { p: [sx * (R + 0.01), cy + 0.0, 0], s: [0.7, 1, 1] });
      break;
  }
}

function armGeo(role: string, st: Style, side: 1 | -1): THREE.BufferGeometry {
  return cached(`arm:${role}:${side}`, () => {
    const b = new Builder();
    b.add(sphere(0.1, 7, 5), st.coat, { p: [0, -0.02, 0] });
    b.add(cyl(0.09, 0.08, ARM_LEN - 0.06, 7), st.coat, { p: [0, -ARM_LEN / 2, 0] });
    b.add(cyl(0.088, 0.088, 0.05, 7), st.coatDark, { p: [0, -ARM_LEN + 0.04, 0] });
    b.add(sphere(0.085, 7, 5), st.mitts, { p: [0, -ARM_LEN - 0.03, 0.01], s: [1, 1.05, 1.05] });
    b.add(sphere(0.035, 4, 3), st.mitts, { p: [side * 0.07, -ARM_LEN + 0.0, 0.05] });
    return b;
  });
}

function legGeo(role: string, st: Style): THREE.BufferGeometry {
  return cached(`leg:${role}`, () => {
    const b = new Builder();
    b.add(cyl(0.1, 0.09, 0.28, 7), st.trousers, { p: [0, -0.15, 0] });
    b.add(bevel(0.18, 0.16, 0.27, 0.05), st.boots, { p: [0, -HIP + 0.08, 0.035] });
    b.add(cyl(0.105, 0.105, 0.05, 7), st.boots === P.boot ? 0xe8dcc8 : st.boots, { p: [0, -HIP + 0.17, 0] }); // boot cuff
    return b;
  });
}

function toolGeo(t: Tool): THREE.BufferGeometry | null {
  if (t === 'none') return null;
  return cached(`tool:${t}`, () => {
    const b = new Builder();
    if (t === 'axe') {
      b.add(cyl(0.022, 0.026, 0.62, 5), P.woodLight, { p: [0, -0.22, 0] });
      b.add(prismAxe(), P.steel, { p: [0, -0.48, 0.0] });
      b.add(box(0.05, 0.12, 0.06), P.iron, { p: [0, -0.48, -0.03] });
    } else if (t === 'pick') {
      b.add(cyl(0.022, 0.026, 0.6, 5), P.woodLight, { p: [0, -0.22, 0] });
      b.add(cone(0.035, 0.3, 4), P.steel, { p: [0, -0.5, 0.15], r: [Math.PI / 2 + 0.2, 0, 0] });
      b.add(cone(0.035, 0.3, 4), P.steel, { p: [0, -0.5, -0.15], r: [-Math.PI / 2 - 0.2, 0, 0] });
      b.add(box(0.06, 0.07, 0.08), P.iron, { p: [0, -0.5, 0] });
    } else if (t === 'rod') {
      b.add(cyl(0.012, 0.025, 1.3, 4), P.woodDark, { p: [0, -0.55, 0] });
      b.add(cyl(0.03, 0.03, 0.06, 6), P.steel, { p: [0.03, -0.08, 0], r: [0, 0, Math.PI / 2] });
      b.add(box(0.006, 0.5, 0.006), 0xf0f0f0, { p: [0, -1.2 + 0.0, -0.22], r: [1.1, 0, 0] });
      b.add(sphere(0.04, 5, 4), P.berry, { p: [0, -1.33, -0.44] });
    } else if (t === 'spoon') {
      b.add(cyl(0.018, 0.022, 0.38, 5), P.woodLight, { p: [0, -0.15, 0] });
      b.add(sphere(0.055, 6, 4), P.woodLight, { p: [0, -0.36, 0], s: [1, 1.2, 0.5] });
    }
    return b;
  });
}
function prismAxe(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.06); s.lineTo(0.16, -0.11); s.lineTo(0.18, 0.11); s.lineTo(0, 0.06); s.lineTo(0, -0.06);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false });
  g.translate(0, 0, -0.0175);
  g.rotateY(-Math.PI / 2);
  g.deleteAttribute('uv');
  return g;
}

function buildHumanoid(role: Exclude<CharacterRole, 'dog'>, opts: ModelOpts): CharacterRig {
  const st = CHARACTER_STYLES[role] ?? CHARACTER_STYLES.villager;
  const root = group(role);
  root.userData.role = role;
  const rig = group('rig');
  root.add(rig);
  const body = group('body', 0, HIP, 0);
  rig.add(body);
  body.add(mesh(torsoGeo(role, st), 'torso'));
  const head = group('head', 0, NECK, 0.01);
  body.add(head);
  head.add(mesh(headGeo(role, st), 'headMesh'));
  if (st.hat === 'helmet') {
    const lamp = mesh(cached('lamp', () => new Builder().add(cyl(0.05, 0.05, 0.02, 8), P.minerLamp, { r: [Math.PI / 2, 0, 0] })), 'lamp', mats().glow);
    lamp.position.set(0, 0.55, 0.22);
    lamp.rotation.x = -0.32;
    head.add(lamp);
  }
  const sx = 0.31 * st.stout;
  const armL = group('armL', sx, SHOULDER, 0);
  const armR = group('armR', -sx, SHOULDER, 0);
  body.add(armL, armR);
  const rescued = opts.variant === 'rescued';
  if (!rescued) {
    armL.add(mesh(armGeo(role, st, 1), 'armLMesh'));
    armR.add(mesh(armGeo(role, st, -1), 'armRMesh'));
  }
  const tg = toolGeo(st.tool);
  if (tg) {
    const tool = group('tool', 0, -ARM_LEN - 0.03, 0.02);
    tool.rotation.x = st.tool === 'rod' ? -1.6 : st.tool === 'spoon' ? 0 : -0.9;
    tool.add(mesh(tg, 'toolMesh'));
    armR.add(tool);
  }
  const legL = group('legL', 0.13, HIP, 0);
  const legR = group('legR', -0.13, HIP, 0);
  rig.add(legL, legR);
  legL.add(mesh(legGeo(role, st), 'legLMesh'));
  legR.add(mesh(legGeo(role, st), 'legRMesh'));

  const carryAnchor = group('carryAnchor', 0, 0.42, 0.42);
  body.add(carryAnchor);
  // grip anchors for held props (lanternHeld, flameHeld, plough handles...)
  armL.add(group('handL', 0, -ARM_LEN - 0.03, 0.02));
  armR.add(group('handR', 0, -ARM_LEN - 0.03, 0.02));
  // skate blades (hidden unless opts.skates; the view may toggle skateL / skateR)
  const blade = cached('skate', () => new Builder()
    .add(box(0.04, 0.03, 0.34), P.steel, { p: [0, -HIP - 0.04, 0.04], top: 0xe4ecf4 })
    .add(box(0.03, 0.06, 0.03), P.iron, { p: [0, -HIP - 0.01, -0.06] })
    .add(box(0.03, 0.06, 0.03), P.iron, { p: [0, -HIP - 0.01, 0.12] })
    .add(cyl(0.02, 0.02, 0.04, 6), P.steel, { p: [0, -HIP - 0.035, 0.22], r: [0, 0, Math.PI / 2] }));
  for (const [leg, n] of [[legL, 'skateL'], [legR, 'skateR']] as const) {
    const m = mesh(blade, n);
    m.visible = !!opts.skates;
    leg.add(m);
  }
  if (rescued) { addBlanket(body, opts.seed ?? 0); rig.scale.setScalar(0.9); }

  const phase = ((opts.seed ?? 0) * 0.6180339) % 1 * Math.PI * 2;
  partsMap.set(root, { rig, body, head, armL, armR, legL, legR, quad: false, phase, tool: armR.getObjectByName('tool') });
  if (opts.variant === 'rescued') root.userData.variant = 'rescued';
  root.userData.radius = 0.35;
  const height = HIP + NECK + 0.24 + 0.27 + (st.hat === 'bobble' ? 0.25 : 0.12);
  skinify(root, `h:${role}:${rescued ? 'r' + (Math.abs(opts.seed ?? 0) % BLANKETS.length) : 'n'}`);
  return { root, carryAnchor, height: rescued ? height * 0.9 : height };
}

const BLANKETS: [number, number][] = [[0x9a5a44, 0xd8c09a], [0x6e6a8a, 0xd6c49a], [0x7a7048, 0xdcc8a4], [0x8a5a5a, 0xe0caa0]];
/** Rescued-follower look: hunched under a lumpy, muted blanket with one stripe, mittens clutching it closed;
 *  the head (and hat) pokes out of a rolled collar. Arms are hidden under the blanket. */
function addBlanket(body: THREE.Object3D, seed: number) {
  const idx = Math.abs(seed) % BLANKETS.length;
  const [c1, c2] = BLANKETS[idx];
  const g = cached(`blanket:${idx}`, () => {
    const b = new Builder();
    // lumpy drape over shoulders and back, uneven hem around the hips
    b.add(ico(1, 1), c1, { p: [0, 0.36, -0.02], s: [0.44, 0.36, 0.4], jitter: 0.035, seed: idx + 3, top: 0xd8e6f2, topY: 0.88, shade: 0.06 });
    b.add(ico(1, 1), c1, { p: [0, 0.18, -0.03], s: [0.46, 0.2, 0.42], jitter: 0.04, seed: idx + 7, shade: 0.06 });
    // one simple stripe and a patch
    b.add(cyl(0.455, 0.47, 0.06, 10, true), c2, { p: [0, 0.2, -0.03], s: [1, 1, 0.92], jitter: 0.012, seed: idx });
    b.add(box(0.16, 0.14, 0.03), c2, { p: [-0.25, 0.4, -0.33], r: [0.4, -0.4, 0.1] });
    // rolled collar behind the head
    b.add(torus(0.17, 0.08, 4, 9), c1, { p: [0, 0.62, -0.02], r: [Math.PI / 2 + 0.2, 0, 0], s: [1.15, 1, 1] });
    // the two front edges pulled together, mittens clutching them at the chest
    for (const sx of [-1, 1]) b.add(box(0.2, 0.42, 0.05), c1, { p: [sx * 0.11, 0.32, 0.36], r: [-0.12, sx * 0.25, 0] });
    for (const sx of [-1, 1]) b.add(sphere(0.085, 6, 5), P.mitten, { p: [sx * 0.07, 0.42, 0.4], s: [1, 1.1, 0.9] });
    // frost crystals on the shoulders
    for (let k = 0; k < 4; k++) b.add(octa(0.035), P.frost, { p: [Math.sin(1.4 + k) * 0.32, 0.6 - k * 0.03, Math.cos(1.4 + k) * 0.25 - 0.08] });
    return b;
  });
  body.add(mesh(g, 'blanket'));
}

// ---------------------------------------------------------------- skinning: one draw call per character
const skinCache = new Map<string, { geo: THREE.BufferGeometry }>();
/** Merge every static vertex-coloured part into ONE SkinnedMesh whose bones are the existing named nodes
 *  (rigid binding: each vertex follows exactly one node). Named nodes stay Object3Ds for the view. */
function skinify(root: THREE.Object3D, key: string): void {
  if (RENDER_FLAGS.unskinnedCharacters) return;
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material === mats().std && m.visible) meshes.push(m); });
  const bones: THREE.Object3D[] = [];
  const parts = meshes.map((m) => {
    let i = bones.indexOf(m.parent!);
    if (i < 0) { bones.push(m.parent!); i = bones.length - 1; }
    return { m, bi: i };
  });
  let entry = skinCache.get(key);
  if (!entry) {
    let n = 0;
    for (const { m } of parts) n += m.geometry.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    let o = 0;
    for (const { m, bi } of parts) {
      const g = m.geometry;
      const P2 = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
      nm.getNormalMatrix(m.matrixWorld);
      for (let k = 0; k < P2.count; k++, o++) {
        v.fromBufferAttribute(P2, k).applyMatrix4(m.matrixWorld); pos.set([v.x, v.y, v.z], o * 3);
        v.fromBufferAttribute(N, k).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], o * 3);
        col.set([C.getX(k), C.getY(k), C.getZ(k)], o * 3);
        si[o * 4] = bi; sw[o * 4] = 1;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    geo.computeBoundingSphere();
    entry = { geo };
    skinCache.set(key, entry);
  }
  for (const { m } of parts) m.removeFromParent();
  const sm = new THREE.SkinnedMesh(entry.geo, mats().std);
  sm.name = 'skin';
  sm.castShadow = true;
  sm.receiveShadow = true;
  sm.frustumCulled = false;
  root.add(sm);
  sm.bind(new THREE.Skeleton(bones as THREE.Bone[]));
}

// ---------------------------------------------------------------- dog
function buildDog(opts: ModelOpts): CharacterRig {
  const root = group('dog');
  root.userData.role = 'dog';
  const rig = group('rig');
  root.add(rig);
  const LEG = 0.36;
  const body = group('body', 0, LEG, 0);
  rig.add(body);
  body.add(mesh(cached('dog:body', () => {
    const b = new Builder();
    b.add(bevel(0.34, 0.3, 0.7, 0.1), P.dogFur, { p: [0, 0.13, -0.02], bottom: P.dogBelly, topY: 0.5, shade: 0.04, seed: 3 });
    b.add(bevel(0.36, 0.32, 0.3, 0.1), P.dogBelly, { p: [0, 0.16, 0.24] }); // chest ruff
    // harness
    b.add(bevel(0.37, 0.08, 0.06, 0.02), P.harness, { p: [0, 0.18, 0.08], r: [0.2, 0, 0], s: [1, 1, 1] });
    b.add(box(0.06, 0.03, 0.55), P.harness, { p: [0, 0.29, -0.05] });
    b.add(bevel(0.38, 0.07, 0.06, 0.02), P.harness, { p: [0, 0.15, -0.22] });
    b.add(cyl(0.03, 0.03, 0.03, 6), P.copper, { p: [0, 0.31, -0.3] });
    return b;
  }), 'bodyMesh'));
  const head = group('head', 0, 0.28, 0.36);
  body.add(head);
  head.add(mesh(cached('dog:head', () => {
    const b = new Builder();
    b.add(sphere(0.2, 8, 6), P.dogFur, { p: [0, 0.14, 0.06], s: [1.05, 0.95, 1], front: P.dogBelly, frontZ: 0.55 });
    b.add(sphere(0.12, 7, 5), P.dogBelly, { p: [0, 0.06, 0.25], s: [1, 0.75, 1.15] }); // muzzle
    b.add(sphere(0.045, 6, 4), P.eye, { p: [0, 0.1, 0.38], s: [1.2, 0.9, 1] }); // nose
    for (const sx of [-1, 1]) {
      b.add(cone(0.085, 0.2, 4), P.dogFur, { p: [sx * 0.12, 0.34, 0.0], r: [-0.1, Math.PI / 4, sx * -0.25] });
      b.add(cone(0.045, 0.12, 4), 0xe8b0a8, { p: [sx * 0.118, 0.325, 0.025], r: [-0.1, Math.PI / 4, sx * -0.25] });
      b.add(sphere(0.035, 6, 5), P.eye, { p: [sx * 0.085, 0.2, 0.22], s: [1, 1.15, 0.6] });
      b.add(sphere(0.011, 4, 3), 0xffffff, { p: [sx * 0.085 + 0.01, 0.215, 0.24] });
      b.add(sphere(0.04, 5, 3), P.dogBelly, { p: [sx * 0.09, 0.26, 0.18], s: [1.2, 0.5, 0.6] }); // brow spot
    }
    b.add(box(0.07, 0.02, 0.08), 0xe86a7a, { p: [0, -0.01, 0.32], r: [0.3, 0, 0] }); // tongue
    return b;
  }), 'headMesh'));
  const tail = group('tail', 0, 0.2, -0.36);
  body.add(tail);
  tail.add(mesh(cached('dog:tail', () => new Builder()
    .add(torus(0.1, 0.055, 4, 7, Math.PI * 1.3), P.dogFur, { p: [0, 0.1, -0.02], r: [0, Math.PI / 2, 0] })
    .add(ico(0.06), P.dogBelly, { p: [0, 0.18, 0.06] })), 'tailMesh'));
  const legG = cached('dog:leg', () => new Builder()
    .add(cyl(0.06, 0.05, LEG - 0.04, 6), P.dogFur, { p: [0, -LEG / 2 + 0.02, 0] })
    .add(bevel(0.1, 0.06, 0.13, 0.025), P.dogBelly, { p: [0, -LEG + 0.03, 0.02] }));
  const mk = (n: string, x: number, z: number) => { const g = group(n, x, LEG + 0.02, z); g.add(mesh(legG, n + 'Mesh')); rig.add(g); return g; };
  const legL = mk('legFL', 0.11, 0.22), legR = mk('legFR', -0.11, 0.22);
  const legBL = mk('legBL', 0.11, -0.26), legBR = mk('legBR', -0.11, -0.26);
  const carryAnchor = group('carryAnchor', 0, 0.34, -0.05);
  body.add(carryAnchor);
  const phase = ((opts.seed ?? 0) * 0.6180339) % 1 * Math.PI * 2;
  partsMap.set(root, { rig, body, head, armL: legL, armR: legR, legL, legR, legBL, legBR, tail, quad: true, phase });
  root.userData.radius = 0.4;
  skinify(root, 'dog');
  return { root, carryAnchor, height: 0.85 };
}

export function buildCharacter(role: CharacterRole, opts: ModelOpts = {}): CharacterRig {
  if (role === 'dog') return buildDog(opts);
  return buildHumanoid((role in CHARACTER_STYLES ? role : 'villager') as Exclude<CharacterRole, 'dog'>, opts);
}

// ---------------------------------------------------------------- animation
function getParts(rig: CharacterRig): Parts | undefined {
  let p = partsMap.get(rig.root);
  if (!p) {
    const f = (n: string) => rig.root.getObjectByName(n);
    const body = f('body'), head = f('head'), armL = f('armL'), armR = f('armR'), legL = f('legL'), legR = f('legR');
    if (!body || !head || !armL || !armR || !legL || !legR) return undefined;
    p = { rig: f('rig') ?? rig.root.children[0], body, head, armL, armR, legL, legR, quad: false, phase: 0 };
    partsMap.set(rig.root, p);
  }
  return p;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (x: number) => x * x * (3 - 2 * x);

interface AnimState {
  last: number;
  gait: number;          // accumulated gait phase (radians)
  speed: number;         // smoothed ground speed
  carry: number;         // 0..1
  act: Record<string, number>; // 0..1 per action
}
const ACTIONS = ['chop', 'mine', 'fish', 'cook', 'cheer', 'shiver', 'plough', 'skate', 'crank', 'carryFlame', 'dig', 'shuffle'] as const;
/** frame-rate independent exponential approach */
const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const mix = (a: number, b: number, w: number) => a + (b - a) * w;

function stepState(p: Parts, s: CharacterAnimState): { st: AnimState; dt: number } {
  let st = p.st;
  const time = s.time;
  if (!st) {
    st = { last: time, gait: 0, speed: Math.max(0, s.speed || 0), carry: s.carrying ? 1 : 0, act: {} };
    for (const a of ACTIONS) st.act[a] = s.action === a ? 1 : 0;
    p.st = st;
  }
  // clamp dt: tolerate pauses, time resets and huge frame gaps
  let dt = time - st.last;
  if (!(dt >= 0) || dt > 0.25) dt = dt > 0.25 ? 0.1 : 0;
  st.last = time;
  const target = Math.max(0, s.speed || 0);
  st.speed = approach(st.speed, target, 9, dt);
  st.carry = approach(st.carry, s.carrying ? 1 : 0, 10, dt);
  for (const a of ACTIONS) st.act[a] = approach(st.act[a], s.action === a ? 1 : 0, 9, dt);
  return { st, dt };
}

export function animate(rigDef: CharacterRig, s: CharacterAnimState): void {
  const p = getParts(rigDef);
  if (!p) return;
  if (p.quad) return animateDog(p, s);
  const { st, dt } = stepState(p, s);
  const t = s.time + p.phase;
  const sp = st.speed;
  const k = clamp(sp / 5, 0, 1.3);
  // walk weight ramps in continuously from zero speed (no threshold snap)
  const walkW = clamp(sp / 1.2, 0, 1);
  const gaitRate = (7 + sp * 1.5) * (1 - 0.35 * (st.act.shuffle ?? 0)) * (1 - 0.5 * (st.act.skate ?? 0));
  st.gait = (st.gait + dt * gaitRate) % (Math.PI * 200);
  const ph = st.gait + p.phase;
  const sw = Math.sin(ph);

  // ---- locomotion + idle
  const amp = (0.3 + 0.55 * Math.min(k, 1)) * walkW;
  const br = Math.sin(t * 2.1) * (1 - walkW);
  let rigY = Math.abs(Math.cos(ph)) * (0.03 + 0.07 * k) * walkW;
  let lean = (0.05 + 0.12 * k) * walkW;
  let bodyRy = sw * 0.1 * walkW, bodyRz = sw * 0.06 * walkW, bodyX = 0;
  const sq = Math.cos(ph * 2) * 0.03 * (0.5 + k) * walkW;
  let sx = 1 - sq * 0.5 - br * 0.008, sy = 1 + sq + br * 0.018;
  let headRx = -0.04 * k * walkW + Math.sin(t * 0.7) * 0.04 * (1 - walkW);
  let headRy = -sw * 0.08 * walkW + Math.sin(t * 0.45) * 0.18 * (1 - walkW);
  let headRz = 0;
  let aLx = -sw * amp * 0.9, aRx = sw * amp * 0.9;
  let aLz = 0.12 + br * 0.03 + (0.03 + 0.1 * k) * walkW, aRz = -aLz;
  let lLx = sw * amp, lRx = -sw * amp, lLz = 0, lRz = 0;

  // ---- carrying pose (blended)
  const cw = st.carry;
  if (cw > 1e-3) {
    const bob = Math.sin(ph * 2) * 0.05 * walkW + Math.sin(t * 2.1) * 0.02 * (1 - walkW);
    aLx = mix(aLx, -1.4 + bob, cw); aRx = mix(aRx, -1.4 + bob, cw);
    aLz = mix(aLz, -0.18, cw); aRz = mix(aRz, 0.18, cw);
    lean -= 0.16 * cw;
  }
  if (p.tool) p.tool.scale.setScalar(cw < 0.5 ? 1 : 1e-4); // tool is skinned: stow it by scaling its node

  // ---- actions (each blended by its own smoothed weight)
  for (const a of ACTIONS) {
    const w = st.act[a];
    if (w < 1e-3) continue;
    switch (a) {
      case 'chop':
      case 'mine': {
        const per = a === 'chop' ? 0.75 : 0.85;
        const u = (t % per) / per;
        let ar: number, bx: number;
        if (u < 0.55) { const e = ease(u / 0.55); ar = -0.5 - 2.3 * e; bx = -0.15 * e; }
        else if (u < 0.7) { const e = (u - 0.55) / 0.15; ar = -2.8 + 2.3 * e * e; bx = -0.15 + 0.5 * e; }
        else { const e = ease((u - 0.7) / 0.3); ar = -0.5; bx = 0.35 - 0.35 * e; }
        const tw = a === 'chop' ? 0.35 * (u < 0.55 ? ease(u / 0.55) : 1 - ease(clamp((u - 0.55) / 0.3, 0, 1))) : 0;
        aLx = mix(aLx, ar, w); aRx = mix(aRx, ar, w); aLz = mix(aLz, -0.35, w); aRz = mix(aRz, 0.35, w);
        lean += bx * (a === 'mine' ? 1.3 : 1) * w;
        bodyRy = mix(bodyRy, tw, w);
        lLx = mix(lLx, -0.15, w); lRx = mix(lRx, 0.2, w);
        break;
      }
      case 'fish': {
        const jerk = (t % 3.2) < 0.25 ? Math.sin(((t % 3.2) / 0.25) * Math.PI) : 0;
        aRx = mix(aRx, -0.8 - jerk * 0.6 + Math.sin(t * 1.3) * 0.05, w); aRz = mix(aRz, 0.25, w);
        aLx = mix(aLx, -0.7 - jerk * 0.5, w); aLz = mix(aLz, -0.35, w);
        lean += (-0.05 - jerk * 0.1) * w;
        headRx = mix(headRx, 0.15, w);
        break;
      }
      case 'cook': {
        const wv = t * 6;
        aRx = mix(aRx, -1.0 + Math.sin(wv) * 0.25, w); aRz = mix(aRz, 0.35 + Math.cos(wv) * 0.25, w);
        aLx = mix(aLx, -0.5, w); aLz = mix(aLz, -0.1, w);
        bodyRz = mix(bodyRz, Math.sin(wv) * 0.05, w); bodyRy = mix(bodyRy, Math.cos(wv) * 0.08, w);
        lean += 0.12 * w;
        headRx = mix(headRx, 0.2, w);
        break;
      }
      case 'cheer': {
        const h = Math.abs(Math.sin(t * 5.5));
        rigY = mix(rigY, h * 0.28, w);
        const wave = Math.sin(t * 14) * 0.25;
        aLx = mix(aLx, -2.7, w); aRx = mix(aRx, -2.7, w);
        aLz = mix(aLz, 0.45 + wave, w); aRz = mix(aRz, -0.45 - wave, w);
        lLx = mix(lLx, -0.3 * h, w); lRx = mix(lRx, -0.3 * h, w);
        lLz = mix(lLz, 0.12 * h, w); lRz = mix(lRz, -0.12 * h, w);
        const sq2 = (1 - h) * 0.08;
        sx = mix(sx, 1 + sq2 * 0.6, w); sy = mix(sy, 1 - sq2, w);
        headRx = mix(headRx, -0.25, w);
        lean = mix(lean, -0.05, w);
        break;
      }
      case 'plough': {
        // leaning into the handles, both hands forward and low, short powerful steps
        aLx = mix(aLx, -0.95 + sw * 0.04 * walkW, w); aRx = mix(aRx, -0.95 - sw * 0.04 * walkW, w);
        aLz = mix(aLz, -0.12, w); aRz = mix(aRz, 0.12, w);
        lean += 0.32 * w;
        headRx = mix(headRx, -0.15, w);
        bodyRy = mix(bodyRy, sw * 0.05 * walkW, w);
        break;
      }
      case 'skate': {
        // long gliding pushes: legs stroke out sideways, big counter arm swing, low lean
        const g = Math.sin(ph * 0.55);
        lLx = mix(lLx, Math.max(0, g) * 0.35, w); lRx = mix(lRx, Math.max(0, -g) * 0.35, w);
        lLz = mix(lLz, Math.max(0, g) * 0.45, w); lRz = mix(lRz, -Math.max(0, -g) * 0.45, w);
        aLx = mix(aLx, -g * 0.9, w); aRx = mix(aRx, g * 0.9, w);
        aLz = mix(aLz, 0.35, w); aRz = mix(aRz, -0.35, w);
        bodyRz = mix(bodyRz, -g * 0.12, w); bodyRy = mix(bodyRy, g * 0.15, w);
        rigY = mix(rigY, Math.abs(g) * 0.03 * walkW, w);
        lean += 0.25 * w;
        break;
      }
      case 'crank': {
        // pushing a bar at chest height, braced forward
        aLx = mix(aLx, -1.45, w); aRx = mix(aRx, -1.45, w);
        aLz = mix(aLz, -0.25, w); aRz = mix(aRz, 0.25, w);
        lean += 0.38 * w;
        headRx = mix(headRx, -0.25, w);
        break;
      }
      case 'carryFlame': {
        // right arm holds the staff high, left arm out for balance, careful short steps
        aRx = mix(aRx, -2.85 + Math.sin(t * 1.7) * 0.04, w); aRz = mix(aRz, 0.12, w);
        aLx = mix(aLx, -0.35 + sw * 0.1 * walkW, w); aLz = mix(aLz, 0.55, w);
        lLx = mix(lLx, lLx * 0.6, w); lRx = mix(lRx, lRx * 0.6, w);
        rigY = mix(rigY, rigY * 0.4, w);
        lean = mix(lean, 0.02, w);
        headRx = mix(headRx, -0.2, w);
        break;
      }
      case 'dig': {
        // scoop low, lift, toss over the shoulder
        const u = (t % 0.9) / 0.9;
        const scoop = u < 0.5 ? ease(u / 0.5) : 1 - ease((u - 0.5) / 0.5);
        const ax = mix(-0.6, -2.3, scoop);
        aLx = mix(aLx, ax, w); aRx = mix(aRx, ax, w);
        aLz = mix(aLz, -0.25, w); aRz = mix(aRz, 0.25, w);
        lean += (0.5 - scoop * 0.55) * w;
        bodyRy = mix(bodyRy, scoop * 0.4, w);
        lLx = mix(lLx, -0.25, w); lRx = mix(lRx, 0.3, w);
        break;
      }
      case 'shuffle': {
        // tired, cold shuffle: tiny steps, hunched, arms hugging the blanket closed
        lLx = mix(lLx, lLx * 0.35, w); lRx = mix(lRx, lRx * 0.35, w);
        rigY = mix(rigY, rigY * 0.3, w);
        aLx = mix(aLx, -0.95, w); aRx = mix(aRx, -0.95, w);
        aLz = mix(aLz, -0.6, w); aRz = mix(aRz, 0.6, w);
        bodyRz = mix(bodyRz, sw * 0.09 * walkW, w);
        headRx = mix(headRx, 0.3, w);
        sx = mix(sx, 1.02, w); sy = mix(sy, 0.95, w);
        lean += 0.28 * w;
        break;
      }
      case 'shiver': {
        const j = Math.sin(t * 48);
        bodyRz = mix(bodyRz, j * 0.04, w); bodyX = mix(bodyX, j * 0.01, w);
        aLx = mix(aLx, -0.9 + j * 0.05, w); aRx = mix(aRx, -0.9 - j * 0.05, w);
        aLz = mix(aLz, -0.75, w); aRz = mix(aRz, 0.75, w);
        headRx = mix(headRx, 0.2, w); headRz = mix(headRz, j * 0.05, w);
        sx = mix(sx, 1.03, w); sy = mix(sy, 0.95, w);
        lean += 0.18 * w;
        break;
      }
    }
  }

  p.rig.position.set(0, rigY, 0);
  p.rig.rotation.set(0, 0, 0);
  p.body.position.set(bodyX, HIP, 0);
  p.body.rotation.set(lean, bodyRy, bodyRz);
  p.body.scale.set(sx, sy, sx);
  p.head.rotation.set(headRx, headRy, headRz);
  p.armL.rotation.set(aLx, 0, aLz);
  p.armR.rotation.set(aRx, 0, aRz);
  p.legL.rotation.set(lLx, 0, lLz);
  p.legR.rotation.set(lRx, 0, lRz);
}

function animateDog(p: Parts, s: CharacterAnimState) {
  const { st, dt } = stepState(p, s);
  const t = s.time + p.phase;
  const sp = st.speed;
  const k = clamp(sp / 6, 0, 1.3);
  const walkW = clamp(sp / 1.2, 0, 1);
  st.gait = (st.gait + dt * (9 + sp * 1.8)) % (Math.PI * 200);
  const ph = st.gait + p.phase;
  const sw = Math.sin(ph);
  const amp = (0.35 + 0.45 * Math.min(k, 1)) * walkW;
  const LEG = 0.38;
  let rigY = Math.abs(Math.cos(ph)) * (0.02 + 0.05 * k) * walkW;
  let bodyRx = Math.cos(ph) * 0.05 * walkW, bodyRz = 0, bodyX = 0;
  const br = Math.sin(t * 2.6) * 0.015 * (1 - walkW);
  let headRx = (-Math.cos(ph) * 0.08 - 0.05) * walkW;
  const headRy = Math.sin(t * 0.6) * 0.4 * (1 - walkW);
  const headRz = Math.sin(t * 0.37) * 0.1 * (1 - walkW);
  let fl = sw * amp, fr = -sw * amp, bl = -sw * amp, brr = sw * amp;
  let wag = mix(Math.sin(t * 6) * 0.35, Math.sin(t * 14) * 0.5, walkW);
  const wc = st.act.cheer, ws = st.act.shiver;
  if (wc > 1e-3) {
    const h = Math.abs(Math.sin(t * 6));
    rigY = mix(rigY, h * 0.22, wc);
    bodyRx = mix(bodyRx, -0.25 * h, wc);
    fl = mix(fl, -0.6 * h, wc); fr = mix(fr, -0.6 * h, wc);
    wag = mix(wag, Math.sin(t * 20) * 0.7, wc);
  }
  if (ws > 1e-3) {
    const j = Math.sin(t * 50);
    bodyX = mix(bodyX, j * 0.01, ws); bodyRz = mix(bodyRz, j * 0.03, ws);
    headRx = mix(headRx, 0.2, ws);
    wag = mix(wag, 0, ws);
  }
  p.rig.position.set(0, rigY, 0);
  p.body.position.set(bodyX, 0.36, 0);
  p.body.rotation.set(bodyRx, 0, bodyRz);
  p.body.scale.set(1 + br, 1 + br, 1);
  p.head.rotation.set(headRx, headRy, headRz);
  const legs = [p.legL, p.legR, p.legBL!, p.legBR!];
  const ang = [fl, fr, bl, brr];
  legs.forEach((l, i) => { l.rotation.set(ang[i], 0, 0); l.position.y = LEG; });
  if (p.tail) p.tail.rotation.set(0, wag, 0);
}
