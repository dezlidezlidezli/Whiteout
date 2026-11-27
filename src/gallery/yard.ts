// Composed "yard vignette": proof that the density kit makes a lived-in work compound.
// gallery.html?sheet=yard  (portrait, game camera ~50° pitch, dusk lighting)
//   &dist=<m> camera distance, &tx= &tz= look-at target, &noclutter=1 to compare
import * as THREE from 'three';
import {
  animateCharacter, createCharacter, createConveyorPath, createFloor, createLanternStringPath, createPathStrip, createProp,
  createWallPath, getCrowdMesh, getItemMesh, getScatterMesh, FROZEN_TINTS,
  type ScatterKind, type XZ,
} from '../view/models';

export function buildYard(): void {
  const q = new URLSearchParams(location.search);
  const W = window.innerWidth, H = window.innerHeight;
  const bare = q.has('noclutter');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.getElementById('nav')?.remove();
  document.getElementById('wrap')!.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b3a5c);
  scene.fog = new THREE.Fog(0x41507a, 30, 70);
  scene.add(new THREE.HemisphereLight(0x8fa8dc, 0x6f8fc9, 1.9));
  const key = new THREE.DirectionalLight(0xffc890, 1.5);
  key.position.set(-14, 16, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.03;
  scene.add(key);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xeef4fb, roughness: 0.95 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const add = (name: string, x: number, z: number, ry = 0, opts: { level?: number; seed?: number } = {}) => {
    const o = createProp(name, opts);
    o.position.set(x, 0, z);
    o.rotation.y = ry;
    scene.add(o);
    const lp = o.userData.lightPos as number[] | undefined;
    if (lp && (o.userData.lightIntensity ?? 0.8) > 0) {
      const l = new THREE.PointLight(o.userData.lightColor ?? 0xffb060, 6 * (o.userData.lightIntensity ?? 0.8), o.userData.lightDistance ?? 6, 1.6);
      const v = new THREE.Vector3(...lp).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      l.position.set(x + v.x, v.y, z + v.z);
      scene.add(l);
    }
    return o;
  };

  // ---- the yard: plank floor, palisade with a gate, arch
  const YW = 12, YD = 16;
  const floor = createFloor('planks', YW, YD, { seed: 2 });
  scene.add(floor);
  const wx = YW / 2 + 0.35, wz = YD / 2 + 0.35;
  const loop: XZ[] = [[-wx, wz], [-wx, -wz], [wx, -wz], [wx, wz], [-wx, wz]];
    const cornerLoss = 0.6 * (2 - Math.PI / 2); // each filleted corner shortens the path
const gateAt = 4 * wz + 3 * wx - 3 * cornerLoss; // centre of the front edge
  scene.add(createWallPath(loop, { radius: 0.6, gaps: [{ at: gateAt, width: 3.8 }], seed: 3, railSide: -1, snowSide: 1 }));
  add('woodenArch', 0, wz, 0, { seed: 0 });

  // ---- stations
  add('kettle', -3.6, -5.2, 0);
  add('kettle', -3.6, -1.4, 0);
  add('fishCrate', -4.9, -7.0, 0);
  add('counter', 2.6, 4.6, 0);
  add('counter', -1.9, 4.6, 0);
  const L = createConveyorPath([[-2.55, -5.2], [2.6, -5.2], [2.6, 4.0]], { radius: 1.2 });
  const S = createConveyorPath([[-2.55, -1.4], [-0.3, -1.4], [-0.3, 1.7], [-1.9, 1.7], [-1.9, 4.0]], { radius: 0.9 });
  scene.add(L.object, S.object);
  L.setOffset(0.1); S.setOffset(0.1);
  const stew = getItemMesh('stew');
  for (const c of [L, S]) for (let d = 0.6; d < c.length - 0.3; d += 1.1) {
    const p = c.sample(d);
    const m = new THREE.Mesh(stew.geometry, stew.material);
    m.position.set(p.x, c.object.userData.beltY, p.z); m.rotation.y = p.yaw; m.castShadow = true;
    scene.add(m);
  }

  if (!bare) {
    // ---- clutter along the walls
    add('firewoodRack', -0.6, -wz + 0.8, 0, { seed: 1 });
    add('dryingRack', 2.6, -wz + 0.9, 0, { seed: 1 });
    add('crateStack', 5.0, -7.0, 0.3, { seed: 1 });
    add('barrelCluster', 5.1, -4.6, 0, { seed: 2 });
    add('sackPile', 4.9, -2.4, 0, { seed: 0 });
    add('toolRack', wx - 0.55, 0.4, -Math.PI / 2, { seed: 0 });
    add('washTub', 4.8, 2.0, 0, { seed: 1 });
    add('potShelf', -wx + 0.55, 0.7, Math.PI / 2, { seed: 1 });
    add('basketPile', -5.0, 2.8, 0, { seed: 0 });
    add('storageTable', -5.0, -3.4, Math.PI / 2);
    add('rugMat', 0.4, 6.4, 0, { seed: 0 });
    add('lampPost', -wx + 0.6, wz - 0.7, 0, { seed: 0 });
    add('lampPost', wx - 0.6, wz - 0.7, Math.PI, { seed: 1 });
    add('lampPost', wx - 0.6, -wz + 0.7, Math.PI, { seed: 1 });
    add('signBoard', 4.7, 6.8, -0.4, { seed: 2 });
    add('emberPile', 1.0, 6.2, 0, { level: 2 });
    scene.add(createLanternStringPath([[-wx + 0.4, -2.5], [-wx + 0.4, 6.5], [wx - 0.4, 6.5]], { spacing: 4.5 }));

    // ---- outside: trampled path from the gate, banks, bushes, trees, boulders, a sled
    scene.add(createPathStrip([[0, wz - 0.3], [0, wz + 4], [-3, wz + 8], [-3, wz + 18]], { type: 'trampled', width: 2.4, radius: 3 }));
    for (const [x, z, ry, s] of [[-4.2, wz + 1.6, 0, 0], [4.4, wz + 1.6, 0, 1], [wx + 1.6, 2, Math.PI / 2, 2], [wx + 1.6, -4, Math.PI / 2, 0], [-wx - 1.6, -1, Math.PI / 2, 1], [-wx - 1.6, 5, Math.PI / 2, 2]] as const)
      add('snowBank', x, z, ry, { seed: s });
    add('bush', -2.2, wz + 1.7, 0, { seed: 0 });
    add('bush', 2.6, wz + 2.6, 0, { seed: 1 });
    add('bush', -5.6, wz + 9.5, 0, { seed: 2 });
    add('sapling', 5.0, wz + 4.4, 0, { seed: 0 });
    add('sapling', -5.6, wz + 3.2, 0, { seed: 2 });
    add('sapling', 1.8, wz + 11.5, 0, { seed: 1 });
    add('supplySled', 2.9, wz + 6.0, 0.5, { seed: 1 });
    add('snowyBoulderCluster', -5.8, wz + 6.5, 0, { seed: 1 });
    add('fallenLog', 4.6, wz + 9.5, 0.6, { seed: 0 });
    add('iceShards', -6.5, wz + 12.5, 0, { seed: 1 });
    add('footpathStones', -1.2, wz + 13.5, 0.2, { seed: 0 });
    add('signpost', -1.4, wz + 7.5, 0.3);
    add('lampPost', 1.6, wz + 4.0, 0, { seed: 1 });
    add('bannerLine', 0, -wz - 1.6, 0, { seed: 2 });
    for (const [x, z, s] of [[-7.6, -wz - 2.2, 1], [-3.5, -wz - 3.2, 2], [2.4, -wz - 2.6, 3], [7.4, -wz - 3.4, 4], [-8.0, wz + 13, 5], [7.6, wz + 14.5, 6], [-7.8, 3, 7], [8.2, -2.5, 0]] as const) add('pineSnowy', x, z, 0, { seed: s });
    add('watchTower', 6.2, wz + 6.8, -0.3, { seed: 0 });
    add('campfireRing', -4.2, wz + 16, 0);

    // ---- instanced scatter outside the walls
    const rnd = (() => { let a = 12345; return () => { a = (a * 1103515245 + 12345) >>> 0; return a / 4294967296; }; })();
    const scatter = (kind: ScatterKind, n: number, pos: () => [number, number] | null) => {
      const d = getScatterMesh(kind);
      const im = new THREE.InstancedMesh(d.geometry, d.material, n);
      const m = new THREE.Matrix4();
      let c = 0;
      for (let i = 0; i < n * 3 && c < n; i++) {
        const p = pos(); if (!p) continue;
        m.makeRotationY(rnd() * 6.28).scale(new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + rnd() * 0.6));
        m.setPosition(p[0], 0, p[1]);
        im.setMatrixAt(c++, m);
      }
      im.count = c; im.receiveShadow = true; im.castShadow = kind !== 'footprint';
      scene.add(im);
    };
    const outside = (): [number, number] | null => {
      const x = (rnd() - 0.5) * 20, z = (rnd() - 0.5) * 44 + 4;
      return Math.abs(x) < wx + 0.8 && Math.abs(z) < wz + 0.8 ? null : [x, z];
    };
    scatter('tuft', 110, outside);
    scatter('pebble', 50, outside);
    scatter('snowClump', 90, outside);
    scatter('twig', 25, outside);
    scatter('footprint', 40, () => { const t = rnd(); return [(-3) * Math.max(0, (t - 0.3) / 0.7) + (rnd() - 0.5) * 1.2, wz + 0.5 + t * 16]; });
    scatter('woodChip', 40, () => [-0.6 + (rnd() - 0.5) * 3, -wz + 1.8 + rnd() * 1.6]);
  }

  // ---- people: player at the kettle, a cook, frozen visitors queuing outside, thawed ones inside
  const player = createCharacter('player', { seed: 1 });
  player.root.position.set(-2.4, 0, -3.3); player.root.rotation.y = -2.4;
  scene.add(player.root);
  const cook = createCharacter('cook', { seed: 2 });
  cook.root.position.set(-4.7, 0, -4.2); cook.root.rotation.y = 0.9;
  scene.add(cook.root);
  const stack = getItemMesh('stew');
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(stack.geometry, stack.material); m.position.y = i * stack.stackHeight; m.castShadow = true; player.carryAnchor.add(m); }
  animateCharacter(player, { time: 1.2, speed: 0, carrying: true });
  animateCharacter(cook, { time: 1.2, speed: 0, carrying: false, action: 'cook' });
  const fr = getCrowdMesh('frozen'), th = getCrowdMesh('thawed');
  const fim = new THREE.InstancedMesh(fr.geometry, fr.material, 14), tim = new THREE.InstancedMesh(th.geometry, th.material, 6);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < 14; i++) {
    m.makeRotationY(Math.PI + Math.sin(i) * 0.3);
    m.setPosition((i % 2) * 0.9 - 0.45 + Math.sin(i * 2) * 0.1, 0, wz + 1.4 + Math.floor(i / 2) * 0.95);
    fim.setMatrixAt(i, m); fim.setColorAt(i, col.set(FROZEN_TINTS[i % FROZEN_TINTS.length]));
  }
  const coats = [0xd9534f, 0xe8a33d, 0x4f9d69, 0x3f7cc4, 0x9a5fb5, 0x2f9c9c];
  const tpos = [[2.6, 5.9], [-1.9, 5.9], [-1.3, 7.0], [3.4, 7.1], [-4.6, 6.3], [1.7, 7.6]];
  tpos.forEach(([x, z], i) => { m.makeRotationY(Math.PI + i); m.setPosition(x, 0, z); tim.setMatrixAt(i, m); tim.setColorAt(i, col.set(coats[i])); });
  for (const im of [fim, tim]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }

  // ---- stress: 8 helpers walking about + a 100-strong crowd (for draw-call / triangle measurements)
  if (q.has('stress')) {
    const roles = ['porter', 'cook', 'lumberjack', 'fisher', 'miner', 'villager', 'porter', 'dog'] as const;
    roles.forEach((r, i) => {
      const h = createCharacter(r, { seed: i });
      h.root.position.set(-4 + (i % 4) * 2.6, 0, -2 + Math.floor(i / 4) * 3);
      animateCharacter(h, { time: 1 + i, speed: 2, carrying: i % 2 === 0 });
      scene.add(h.root);
    });
    const n = 100;
    const fim2 = new THREE.InstancedMesh(fr.geometry, fr.material, n / 2), tim2 = new THREE.InstancedMesh(th.geometry, th.material, n / 2);
    for (let i = 0; i < n / 2; i++) {
      m.makeRotationY(Math.PI); m.setPosition(-5 + (i % 10) * 1.1, 0, wz + 6 + Math.floor(i / 10) * 1.0); fim2.setMatrixAt(i, m); fim2.setColorAt(i, col.set(FROZEN_TINTS[i % 6]));
      m.setPosition(-5 + (i % 10) * 1.1, 0, -wz - 4 - Math.floor(i / 10) * 1.0); tim2.setMatrixAt(i, m); tim2.setColorAt(i, col.set(coats[i % 6]));
    }
    for (const im of [fim2, tim2]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
  }

  // ---- game camera
  const pitch = THREE.MathUtils.degToRad(Number(q.get('pitch') ?? 50));
  const dist = Number(q.get('dist') ?? 27);
  const target = new THREE.Vector3(Number(q.get('tx') ?? 0), 0, Number(q.get('tz') ?? 2.5));
  const camera = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 40), W / H, 0.5, 200);
  camera.position.set(target.x, target.y + Math.sin(pitch) * dist, target.z + Math.cos(pitch) * dist);
  camera.lookAt(target);
  renderer.render(scene, camera);
  renderer.info.autoReset = false;
  renderer.info.reset();
  renderer.render(scene, camera);
  let meshes = 0;
  scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) meshes++; });
  (window as unknown as { __stats: unknown }).__stats = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, meshes, shadowIncluded: true };
  (window as unknown as { __ready: boolean }).__ready = true;
}
