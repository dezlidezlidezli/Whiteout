// Gallery vignettes for the five signature mechanics (docs/MECHANICS.md).
import * as THREE from 'three';
import {
  animateCharacter, createCharacter, createIceSheet, createProp, createGroundPath, getDeepSnowMesh, getItemMesh, getSnowBankMesh,
  type CharacterAnimState, type CharacterRig,
} from '../view/models';

export interface MechEntry {
  label: string;
  sub?: string;
  obj: THREE.Object3D;
  update?: (t: number) => void;
  radius?: number;
  center?: THREE.Vector3;
}

function rigAt(role: Parameters<typeof createCharacter>[0], x: number, z: number, yaw: number, s: Partial<CharacterAnimState>, opts: Parameters<typeof createCharacter>[1] = {}) {
  const rig = createCharacter(role, opts);
  rig.root.position.set(x, 0, z);
  rig.root.rotation.y = yaw;
  const anim = (t: number) => animateCharacter(rig, { time: t, speed: s.speed ?? 0, carrying: !!s.carrying, action: s.action ?? 'none' });
  return { rig, anim };
}
function hold(rig: CharacterRig, prop: THREE.Object3D) {
  const hand = rig.root.getObjectByName('handR')!;
  prop.rotation.x = Math.PI; // the arm points up when raised: align the prop's +Y with the arm's -Y
  hand.add(prop);
}

/** Deep snow field on a 0.5 m grid with a ploughed swath along `path` (cleared cells removed, banks along the edges). */
function snowField(w: number, d: number, swath: [number, number][], half: number) {
  const g = new THREE.Group();
  const path = createGroundPath(swath, 1.5);
  const samples: { x: number; z: number; yaw: number }[] = [];
  for (let s = 0; s <= path.length; s += 0.25) samples.push(path.sample(s));
  const distTo = (x: number, z: number) => { let m = 1e9; for (const p of samples) m = Math.min(m, Math.hypot(x - p.x, z - p.z)); return m; };
  const kinds = [0, 1, 2, 3].map((v) => getDeepSnowMesh({ seed: v }));
  const lists: THREE.Matrix4[][] = [[], [], [], []];
  let h = 7;
  const rnd = () => { h = (h * 16807) % 2147483647; return h / 2147483647; };
  for (let x = -w / 2; x <= w / 2; x += 0.5) for (let z = -d / 2; z <= d / 2; z += 0.5) {
    if (distTo(x, z) < half) continue;
    const m = new THREE.Matrix4().makeRotationY(Math.floor(rnd() * 4) * Math.PI / 2);
    m.setPosition(x + (rnd() - 0.5) * 0.08, 0, z + (rnd() - 0.5) * 0.08);
    lists[Math.floor(rnd() * 4)].push(m);
  }
  kinds.forEach((k, i) => {
    const im = new THREE.InstancedMesh(k.geometry, k.material, Math.max(1, lists[i].length));
    lists[i].forEach((m, j) => im.setMatrixAt(j, m));
    im.count = lists[i].length; im.castShadow = true; im.receiveShadow = true;
    g.add(im);
  });
  // banks curled off each side of the swath
  const bank = [0, 1, 2].map((v) => getSnowBankMesh({ seed: v }));
  const bl: THREE.Matrix4[][] = [[], [], []];
  for (let s = 0.3; s < path.length - 0.2; s += 0.5) {
    const p = path.sample(s);
    for (const side of [-1, 1]) {
      const lx = Math.cos(p.yaw) * side, lz = -Math.sin(p.yaw) * side;
      const m = new THREE.Matrix4().makeRotationY(p.yaw + (side < 0 ? Math.PI : 0));
      m.setPosition(p.x + lx * (half - 0.1), 0, p.z + lz * (half - 0.1));
      bl[Math.floor(rnd() * 3)].push(m);
    }
  }
  bank.forEach((k, i) => {
    const im = new THREE.InstancedMesh(k.geometry, k.material, Math.max(1, bl[i].length));
    bl[i].forEach((m, j) => im.setMatrixAt(j, m));
    im.count = bl[i].length; im.castShadow = true; im.receiveShadow = true;
    g.add(im);
  });
  return { g, path };
}

export function mechanicsEntries(): MechEntry[] {
  const E: MechEntry[] = [];

  // ---- 1. plough cutting a swath through deep snow, a find revealed
  {
    const g = new THREE.Group();
    const { g: field, path } = snowField(9, 7, [[-4.5, -1.5], [-1, -1.5], [1.5, 1.0], [4.5, 1.0]], 0.85);
    g.add(field);
    const p = path.sample(path.length * 0.62);
    const { rig, anim } = rigAt('player', p.x, p.z, p.yaw, { speed: 3, action: 'plough' });
    const pl = createProp('plough');
    pl.position.set(0, 0.85, 0.25);
    rig.root.add(pl);
    g.add(rig.root);
    const find = createProp('emberCache'); find.position.set(-2.2, 0, -1.4); find.rotation.y = 0.4; g.add(find);
    const lid = find.getObjectByName('lid'); if (lid) lid.rotation.x = -0.9;
    const bv = createProp('buriedVillager', { seed: 1 }); bv.position.set(2.6, 0, -1.8); g.add(bv);
    E.push({ label: 'plough · swath through deep snow + ember cache', obj: g, update: anim, radius: 5.2, center: new THREE.Vector3(0, 0.3, 0) });
  }
  // ---- 2. rescue: lantern leading three blanket-wrapped followers
  {
    const g = new THREE.Group();
    const lead = rigAt('player', 1.8, 0.6, -1.9, { speed: 2, action: 'carryFlame' });
    hold(lead.rig, createProp('lanternHeld'));
    g.add(lead.rig.root);
    const anims = [lead.anim];
    for (let i = 0; i < 3; i++) {
      const f = rigAt('villager', 1.8 + (i + 1) * 1.05, 0.6 + Math.sin(i * 1.7) * 0.35, -1.75, { speed: 1.8, action: 'shuffle' }, { variant: 'rescued', seed: i });
      g.add(f.rig.root); anims.push(f.anim);
    }
    const bv = createProp('buriedVillager', { seed: 3 }); bv.position.set(-1.8, 0, -0.8); g.add(bv);
    const bc = createProp('buriedCrate', { seed: 1 }); bc.position.set(-2.8, 0, 1.2); g.add(bc);
    E.push({ label: 'rescue · lantern + 3 rescued followers', obj: g, update: (t) => anims.forEach((a) => a(t)), radius: 4.2, center: new THREE.Vector3(0.8, 0.6, 0) });
  }
  // ---- 3. skating: lake ice, grip mat with a counter, fish leap, player gliding with a stack
  {
    const g = new THREE.Group();
    g.add(createIceSheet(12, 9, { seed: 2 }));
    const mat = createProp('gripMat', { seed: 0 }); mat.position.set(-3.5, 0, -2); g.add(mat);
    const ct = createProp('counter'); ct.position.set(-3.5, 0.13, -2.4); g.add(ct);
    const fl = createProp('fishLeap'); fl.position.set(2.5, 0, -1.5); g.add(fl);
    const fish = fl.getObjectByName('fish'); if (fish) { fish.position.y = 0.9; fish.rotation.z = 0.6; }
    const sk = rigAt('player', 0.5, 1.2, 0.9, { speed: 6, action: 'skate', carrying: true }, { skates: true });
    const fishItem = getItemMesh('fish');
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(fishItem.geometry, fishItem.material); m.position.y = i * fishItem.stackHeight; m.castShadow = true; sk.rig.carryAnchor.add(m); }
    g.add(sk.rig.root);
    E.push({ label: 'skating · ice sheet, grip mat, fish leap', obj: g, update: sk.anim, radius: 5.8, center: new THREE.Vector3(0, 0.3, 0) });
  }
  // ---- 4. crank: capstan driving bellows at the forge, and the mine lift
  {
    const g = new THREE.Group();
    const cap = createProp('capstan'); cap.position.set(-1.5, 0, 0); g.add(cap);
    const rotor = cap.getObjectByName('rotor'); if (rotor) rotor.rotation.y = 0.35;
    const bel = createProp('bellows'); bel.position.set(1.6, 0, -0.4); bel.rotation.y = 0; g.add(bel);
    const bag = bel.getObjectByName('bag'); if (bag) bag.scale.y = 0.75;
    const fo = createProp('forge'); fo.position.set(1.6, 0, -2.6); g.add(fo);
    const a = 0.35 + Math.PI / 2;
    const br = cap.userData.barRadius as number;
    const cr = rigAt('player', -1.5 + Math.cos(a) * br * 0.92, -Math.sin(a) * br * 0.92 + 0.0, a + Math.PI, { speed: 2.5, action: 'crank' });
    g.add(cr.rig.root);
    E.push({ label: 'crank · capstan + bellows + forge', obj: g, update: cr.anim, radius: 4.4, center: new THREE.Vector3(0, 0.8, -0.6) });
  }
  {
    const g = new THREE.Group();
    const ml = createProp('mineLift'); g.add(ml);
    const cage = ml.getObjectByName('cage'); const cable = ml.getObjectByName('cable');
    if (cage && cable) { cage.position.y = 2.6; cable.scale.y = (ml.userData.cableTopY as number) - 2.6; }
    const sp = createProp('shaftPile', { seed: 1 }); sp.position.set(2.6, 0, 0.3); g.add(sp);
    const cap = createProp('capstan'); cap.position.set(-3.4, 0, 0.6); g.add(cap);
    E.push({ label: 'crank · mine lift + shaft pile + capstan', obj: g, radius: 5.0, center: new THREE.Vector3(-0.2, 1.8, 0) });
  }
  // ---- 5. carried flame: lit + unlit trail braziers, wind gap, player with the firepan
  {
    const g = new THREE.Group();
    const a = createProp('trailBrazier'); a.position.set(-2.6, 0, -1.0); g.add(a);
    const b = createProp('trailBrazier', { unlit: true }); b.position.set(2.8, 0, -1.2); g.add(b);
    const wg = createProp('windGap', { seed: 0 }); wg.position.set(0.2, 0, -3.2); g.add(wg);
    const pf = rigAt('player', 0.3, 0.6, 1.2, { speed: 1.6, action: 'carryFlame' });
    hold(pf.rig, createProp('flameHeld'));
    g.add(pf.rig.root);
    E.push({ label: 'flame · lit + unlit trail brazier, wind gap', obj: g, update: pf.anim, radius: 4.6, center: new THREE.Vector3(0, 0.9, -0.9) });
  }
  // ---- individual models
  const one = (name: string, opts: Parameters<typeof createProp>[1] = {}, label = name, ry = 0.0) => {
    const o = createProp(name, opts); o.rotation.y = ry; o.scale.setScalar(1);
    E.push({ label, obj: o });
  };
  one('plough', { level: 1 }, 'plough L1 (grip origin)', 0.6);
  one('plough', { level: 2 }, 'plough L2 · 2.4 m iron edge', 0.6);
  {
    const g = new THREE.Group();
    for (let v = 0; v < 4; v++) { const d = getDeepSnowMesh({ seed: v }); const m = new THREE.Mesh(d.geometry, d.material); m.position.x = (v - 1.5) * 0.7; m.castShadow = true; g.add(m); }
    for (let v = 0; v < 3; v++) { const d = getSnowBankMesh({ seed: v }); const m = new THREE.Mesh(d.geometry, d.material); m.position.set((v - 1) * 0.7, 0, 0.9); m.castShadow = true; g.add(m); }
    E.push({ label: 'deep snow cells ×4 · banks ×3', obj: g });
  }
  one('emberCache', {}, 'emberCache', 0.3);
  one('buriedCrate', { seed: 0 });
  one('buriedVillager', { seed: 0 });
  one('lanternHeld');
  one('flameHeld');
  {
    const g = new THREE.Group();
    const fb = createProp('foundBoard'); g.add(fb);
    for (let i = 0; i < 24; i++) if ([0, 1, 2, 5, 7, 8, 13, 14, 20].includes(i)) { const f = fb.getObjectByName(`frame${i}`); if (f) f.visible = true; }
    E.push({ label: 'foundBoard (9 / 24 found)', obj: g });
  }
  one('monument');
  {
    const r = rigAt('villager', 0, 0, 0.5, { speed: 0, action: 'shuffle' }, { variant: 'rescued', seed: 2 });
    E.push({ label: 'villager · rescued variant', obj: r.rig.root, update: r.anim, radius: 1.2, center: new THREE.Vector3(0, 0.8, 0) });
  }
  {
    const g = new THREE.Group();
    const l = createProp('brazier'); l.position.x = -0.8; g.add(l);
    const u = createProp('brazier', { unlit: true }); u.position.x = 0.8; g.add(u);
    E.push({ label: 'brazier lit / unlit', obj: g });
  }
  {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) { const f = createProp('festivalLamp', { seed: i, unlit: i === 3 }); f.position.x = (i - 1.5) * 0.9; g.add(f); }
    E.push({ label: 'festivalLamp ×4 (last unlit)', obj: g });
  }
  return E;
}
