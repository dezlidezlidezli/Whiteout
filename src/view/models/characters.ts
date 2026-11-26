// Articulated low-poly characters + procedural animation.
import * as THREE from 'three';
import { Builder, bevel, box, cone, cyl, ico, lathe, sphere, torus } from './geo';
import { mats } from './materials';
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
  tail?: THREE.Object3D; legBL?: THREE.Object3D; legBR?: THREE.Object3D;
  quad: boolean; phase: number;
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
    b.add(box(0.04, 0.5, 0.03), st.coatDark, { p: [0, 0.22, 0.3 * w * 0.92], r: [-0.08, 0, 0] });
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
      b.add(bevel(0.12, 0.3, 0.05, 0.02), st.scarf, { p: [0.11, 0.42, 0.29 * w], r: [-0.25, 0, 0.12] });
      b.add(box(0.12, 0.03, 0.052), st.coatDark === P.coatRustDark ? P.coatRust : st.coatDark, { p: [0.12, 0.31, 0.32 * w], r: [-0.25, 0, 0.12] });
    }
    if (st.apron) {
      b.add(bevel(0.42, 0.5, 0.04, 0.015), P.cream, { p: [0, 0.08, 0.31 * w], r: [-0.06, 0, 0] });
      b.add(bevel(0.28, 0.2, 0.04, 0.015), P.cream, { p: [0, 0.4, 0.3 * w], r: [-0.2, 0, 0] });
      b.add(box(0.2, 0.09, 0.05), P.cook, { p: [0, 0.0, 0.34 * w] }); // pocket
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
    // face
    for (const sx of [-1, 1]) {
      b.add(bevel(0.05, 0.075, 0.03, 0.012), P.eye, { p: [sx * 0.095, cy + 0.03, R - 0.02] });
      b.add(sphere(0.05, 6, 4), P.blush, { p: [sx * 0.15, cy - 0.06, R - 0.06], s: [1, 0.6, 0.5] });
    }
    b.add(sphere(0.045, 6, 4), P.skinDark, { p: [0, cy - 0.03, R + 0.005] });
    // hair fringe peeking out
    if (st.hat !== 'helmet') b.add(sphere(0.2, 8, 4), st.hair, { p: [0, cy + 0.1, -0.08], s: [1.25, 0.9, 1.1] });
    if (st.beard) {
      b.add(sphere(0.2, 8, 5), st.hair, { p: [0, cy - 0.14, 0.1], s: [1.15, 0.9, 0.9], jitter: 0.015, seed: 4 });
      b.add(box(0.12, 0.03, 0.03), 0x8a3a2a, { p: [0, cy - 0.08, R - 0.0] }); // mouth line under moustache
    }
    hat(b, st, cy, R);
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
    lamp.position.set(0, 0.41, 0.33);
    head.add(lamp);
  }
  const sx = 0.31 * st.stout;
  const armL = group('armL', sx, SHOULDER, 0);
  const armR = group('armR', -sx, SHOULDER, 0);
  body.add(armL, armR);
  armL.add(mesh(armGeo(role, st, 1), 'armLMesh'));
  armR.add(mesh(armGeo(role, st, -1), 'armRMesh'));
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

  const phase = ((opts.seed ?? 0) * 0.6180339) % 1 * Math.PI * 2;
  partsMap.set(root, { rig, body, head, armL, armR, legL, legR, quad: false, phase });
  root.userData.radius = 0.35;
  const height = HIP + NECK + 0.24 + 0.27 + (st.hat === 'bobble' ? 0.25 : 0.12);
  return { root, carryAnchor, height };
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
  const head = group('head', 0, 0.3, 0.34);
  body.add(head);
  head.add(mesh(cached('dog:head', () => {
    const b = new Builder();
    b.add(bevel(0.28, 0.25, 0.26, 0.08), P.dogFur, { p: [0, 0.1, 0.06] });
    b.add(bevel(0.2, 0.12, 0.18, 0.04), P.dogBelly, { p: [0, 0.03, 0.22] }); // muzzle
    b.add(sphere(0.035, 5, 4), P.eye, { p: [0, 0.08, 0.32] }); // nose
    b.add(bevel(0.18, 0.06, 0.04, 0.02), P.dogBelly, { p: [0, 0.18, 0.18] }); // mask
    for (const sx of [-1, 1]) {
      b.add(cone(0.065, 0.15, 4), P.dogFur, { p: [sx * 0.09, 0.28, 0.02], r: [0, Math.PI / 4, sx * -0.2] });
      b.add(box(0.04, 0.045, 0.02), P.eye, { p: [sx * 0.07, 0.15, 0.19] });
      b.add(sphere(0.025, 4, 3), 0x8a5a3a, { p: [sx * 0.08, 0.2, 0.17] }); // eyebrow
    }
    b.add(box(0.06, 0.02, 0.06), 0xe86a7a, { p: [0, -0.03, 0.27] }); // tongue
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

export function animate(rigDef: CharacterRig, s: CharacterAnimState): void {
  const p = getParts(rigDef);
  if (!p) return;
  if (p.quad) return animateDog(p, s);
  const t = s.time + p.phase;
  const speed = Math.max(0, s.speed || 0);
  const moving = speed > 0.08;
  const k = clamp(speed / 5, 0, 1.3);
  const action = s.action ?? 'none';

  // reset
  p.rig.position.set(0, 0, 0);
  p.rig.rotation.set(0, 0, 0);
  p.body.position.set(0, HIP, 0);
  p.body.rotation.set(0, 0, 0);
  p.body.scale.set(1, 1, 1);
  p.head.rotation.set(0, 0, 0);
  p.armL.rotation.set(0, 0, 0.1);
  p.armR.rotation.set(0, 0, -0.1);
  p.legL.rotation.set(0, 0, 0);
  p.legR.rotation.set(0, 0, 0);

  let lean = 0;
  if (moving) {
    const ph = t * (7 + speed * 1.5);
    const sw = Math.sin(ph);
    const amp = 0.3 + 0.55 * Math.min(k, 1);
    p.legL.rotation.x = sw * amp;
    p.legR.rotation.x = -sw * amp;
    p.rig.position.y = Math.abs(Math.cos(ph)) * (0.03 + 0.07 * k);
    p.body.rotation.z = sw * 0.06;
    p.body.rotation.y = sw * 0.1;
    p.head.rotation.y = -sw * 0.08;
    p.head.rotation.x = -0.04 * k;
    lean = 0.05 + 0.12 * k;
    p.armL.rotation.x = -sw * amp * 0.9;
    p.armR.rotation.x = sw * amp * 0.9;
    p.armL.rotation.z = 0.15 + 0.1 * k;
    p.armR.rotation.z = -0.15 - 0.1 * k;
    // squash & stretch on footfall
    const sq = Math.cos(ph * 2) * 0.03 * (0.5 + k);
    p.body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
  } else {
    const br = Math.sin(t * 2.1);
    p.body.scale.set(1 - br * 0.008, 1 + br * 0.018, 1 - br * 0.008);
    p.armL.rotation.z = 0.12 + br * 0.03;
    p.armR.rotation.z = -0.12 - br * 0.03;
    p.head.rotation.y = Math.sin(t * 0.45) * 0.18;
    p.head.rotation.x = Math.sin(t * 0.7) * 0.04;
  }

  if (s.carrying) {
    const bob = moving ? Math.sin(t * (7 + speed * 1.5) * 2) * 0.05 : Math.sin(t * 2.1) * 0.02;
    p.armL.rotation.set(-1.4 + bob, 0, -0.18);
    p.armR.rotation.set(-1.4 + bob, 0, 0.18);
    lean -= 0.16;
  }

  switch (action) {
    case 'chop':
    case 'mine': {
      const per = action === 'chop' ? 0.75 : 0.85;
      const u = (t % per) / per;
      let a: number;
      let bodyX: number;
      if (u < 0.55) { const e = ease(u / 0.55); a = -0.5 - 2.3 * e; bodyX = -0.15 * e; }
      else if (u < 0.7) { const e = (u - 0.55) / 0.15; a = -2.8 + 2.3 * e * e; bodyX = -0.15 + 0.5 * e; }
      else { const e = ease((u - 0.7) / 0.3); a = -0.5; bodyX = 0.35 - 0.35 * e; }
      const tw = action === 'chop' ? 0.35 : 0;
      p.armL.rotation.set(a, 0, -0.35);
      p.armR.rotation.set(a, 0, 0.35);
      lean += bodyX * (action === 'mine' ? 1.3 : 1);
      p.body.rotation.y = tw * (u < 0.55 ? ease(u / 0.55) : 1 - ease(clamp((u - 0.55) / 0.3, 0, 1)));
      if (u > 0.55 && u < 0.75) p.rig.position.y = 0;
      p.legL.rotation.x = -0.15; p.legR.rotation.x = 0.2;
      break;
    }
    case 'fish': {
      const jerk = (t % 3.2) < 0.25 ? Math.sin(((t % 3.2) / 0.25) * Math.PI) : 0;
      p.armR.rotation.set(-0.8 - jerk * 0.6 + Math.sin(t * 1.3) * 0.05, 0, 0.25);
      p.armL.rotation.set(-0.7 - jerk * 0.5, 0, -0.35);
      lean += -0.05 - jerk * 0.1;
      p.head.rotation.x = 0.15;
      break;
    }
    case 'cook': {
      const w = t * 6;
      p.armR.rotation.set(-1.0 + Math.sin(w) * 0.25, 0, 0.35 + Math.cos(w) * 0.25);
      p.armL.rotation.set(-0.5, 0, -0.1);
      p.body.rotation.z = Math.sin(w) * 0.05;
      p.body.rotation.y = Math.cos(w) * 0.08;
      lean += 0.12;
      p.head.rotation.x = 0.2;
      break;
    }
    case 'cheer': {
      const h = Math.abs(Math.sin(t * 5.5));
      p.rig.position.y = h * 0.28;
      const wave = Math.sin(t * 14) * 0.25;
      p.armL.rotation.set(-2.7, 0, 0.45 + wave);
      p.armR.rotation.set(-2.7, 0, -0.45 - wave);
      p.legL.rotation.x = -0.3 * h; p.legR.rotation.x = -0.3 * h;
      p.legL.rotation.z = 0.12 * h; p.legR.rotation.z = -0.12 * h;
      const sq = (1 - h) * 0.08;
      p.body.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
      p.head.rotation.x = -0.25;
      lean = -0.05;
      break;
    }
    case 'shiver': {
      const j = Math.sin(t * 48);
      p.body.rotation.z = j * 0.04;
      p.body.position.x = j * 0.01;
      p.armL.rotation.set(-0.9 + j * 0.05, 0, -0.75);
      p.armR.rotation.set(-0.9 - j * 0.05, 0, 0.75);
      p.head.rotation.x = 0.2;
      p.head.rotation.z = j * 0.05;
      p.body.scale.set(1.03, 0.95, 1.03);
      lean += 0.18;
      break;
    }
  }
  p.body.rotation.x = lean;
}

function animateDog(p: Parts, s: CharacterAnimState) {
  const t = s.time + p.phase;
  const speed = Math.max(0, s.speed || 0);
  const moving = speed > 0.08;
  const k = clamp(speed / 6, 0, 1.3);
  const LEG = 0.38;
  p.rig.position.set(0, 0, 0);
  p.body.rotation.set(0, 0, 0);
  p.body.position.set(0, 0.36, 0);
  p.head.rotation.set(0, 0, 0);
  p.body.scale.set(1, 1, 1);
  for (const l of [p.legL, p.legR, p.legBL!, p.legBR!]) { l.rotation.set(0, 0, 0); l.position.y = LEG; }
  let wag = Math.sin(t * 6) * 0.35;
  if (moving) {
    const ph = t * (9 + speed * 1.8);
    const sw = Math.sin(ph);
    const amp = 0.35 + 0.45 * Math.min(k, 1);
    p.legL.rotation.x = sw * amp; p.legBR!.rotation.x = sw * amp;
    p.legR.rotation.x = -sw * amp; p.legBL!.rotation.x = -sw * amp;
    p.rig.position.y = Math.abs(Math.cos(ph)) * (0.02 + 0.05 * k);
    p.body.rotation.x = Math.cos(ph) * 0.05;
    p.head.rotation.x = -Math.cos(ph) * 0.08 - 0.05;
    wag = Math.sin(t * 14) * 0.5;
  } else {
    const br = Math.sin(t * 2.6);
    p.body.scale.set(1 + br * 0.015, 1 + br * 0.015, 1);
    p.head.rotation.y = Math.sin(t * 0.6) * 0.4;
    p.head.rotation.z = Math.sin(t * 0.37) * 0.1;
  }
  if (s.action === 'cheer') {
    const h = Math.abs(Math.sin(t * 6));
    p.rig.position.y = h * 0.22;
    p.body.rotation.x = -0.25 * h;
    p.legL.rotation.x = -0.6 * h; p.legR.rotation.x = -0.6 * h;
    wag = Math.sin(t * 20) * 0.7;
  } else if (s.action === 'shiver') {
    const j = Math.sin(t * 50);
    p.body.position.x = j * 0.01;
    p.body.rotation.z = j * 0.03;
    p.head.rotation.x = 0.2;
    wag = 0;
  }
  if (p.tail) p.tail.rotation.set(0, wag, 0);
}
