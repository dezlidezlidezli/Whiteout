// Model gallery: labelled contact sheets of every model, rendered with game-like lighting.
// URL params:
//   sheet=characters|props|props2|items|thumbs|crowd|actions   (default: characters)
//   focus=<substring>   only entries whose label contains it (case-insensitive) -> close-ups
//   cell=<px>           cell width in CSS px (default 320)   cols=<n> override columns
//   width=<px>          sheet width (default window width)
//   t=<sec>             freeze time (for screenshots); otherwise animates
//   role=<role>         for sheet=actions: which character (default player)
//   yaw=<deg> pitch=<deg> camera angles (default 35 / 50)
import * as THREE from 'three';
import {
  PROP_NAMES, animateCharacter, createCharacter, createProp, getCrowdMesh, getItemMesh,
  type CharacterAnimState, type CharacterRig, type CharacterRole, type ItemKind,
} from '../view/models';
import { triCount } from '../view/models/geo';

const q = new URLSearchParams(location.search);
const sheet = q.get('sheet') ?? 'characters';
const focus = (q.get('focus') ?? '').toLowerCase();
const fixedT = q.has('t') ? Number(q.get('t')) : null;
const yaw = THREE.MathUtils.degToRad(Number(q.get('yaw') ?? 35));
const pitch = THREE.MathUtils.degToRad(Number(q.get('pitch') ?? 50));

interface Entry {
  label: string;
  sub?: string;
  obj: THREE.Object3D;
  update?: (t: number) => void;
  /** fixed framing radius (otherwise from bounds) */
  radius?: number;
  center?: THREE.Vector3;
}

const ROLES: CharacterRole[] = ['player', 'porter', 'cook', 'lumberjack', 'fisher', 'miner', 'villager', 'dog'];
const ITEMS: ItemKind[] = ['fish', 'stew', 'log', 'plank', 'smokedFish', 'ore', 'ingot', 'feast', 'ember'];
const ACTIONS: NonNullable<CharacterAnimState['action']>[] = ['chop', 'mine', 'fish', 'cook', 'cheer', 'shiver'];
const COATS = [0xd0582a, 0x3f72a8, 0xd9a53a, 0x3d7a46, 0x8a5a86, 0xcc4f66, 0x2f8f8a, 0x7a5232];

function charEntry(role: CharacterRole, label: string, s: Partial<CharacterAnimState>, carry = 0): Entry {
  const rig = createCharacter(role, { seed: 0 });
  if (carry) addStack(rig, carry);
  return {
    label, sub: `${triCount(rig.root)} tris`, obj: rig.root, radius: 1.15, center: new THREE.Vector3(0, 0.85, 0),
    update: (t) => animateCharacter(rig, { time: t, speed: s.speed ?? 0, carrying: !!carry || !!s.carrying, action: s.action ?? 'none' }),
  };
}
function addStack(rig: CharacterRig, n: number) {
  const kinds: ItemKind[] = ['stew', 'stew', 'fish', 'log', 'plank', 'ember'];
  let y = 0;
  for (let i = 0; i < n; i++) {
    const d = getItemMesh(kinds[i % kinds.length]);
    const m = new THREE.Mesh(d.geometry, d.material);
    m.position.y = y;
    m.castShadow = true;
    y += d.stackHeight;
    rig.carryAnchor.add(m);
  }
}

function itemStack(kind: ItemKind, n: number): THREE.Object3D {
  const d = getItemMesh(kind);
  const im = new THREE.InstancedMesh(d.geometry, d.material, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    m.makeRotationY((i % 2) * 0.12 - 0.06 + Math.sin(i * 1.7) * 0.05);
    m.setPosition(Math.sin(i * 2.3) * 0.015, i * d.stackHeight, Math.cos(i * 1.9) * 0.015);
    im.setMatrixAt(i, m);
  }
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

function crowdBlock(variant: 'frozen' | 'thawed', n: number, tint: boolean): THREE.Object3D {
  const d = getCrowdMesh(variant);
  const im = new THREE.InstancedMesh(d.geometry, d.material, n);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  const side = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const x = (i % side) - (side - 1) / 2, z = Math.floor(i / side) - (side - 1) / 2;
    m.makeRotationY(Math.sin(i * 3.1) * 0.5);
    m.setPosition(x * 0.85 + Math.sin(i) * 0.12, 0, z * 0.85 + Math.cos(i * 1.3) * 0.12);
    im.setMatrixAt(i, m);
    if (tint) im.setColorAt(i, c.set(COATS[i % COATS.length]));
  }
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

function propEntry(name: string, opts: { level?: number; seed?: number } = {}, label = name): Entry {
  const o = createProp(name, opts);
  if (opts.seed === undefined) o.rotation.y = 0;
  if (name === 'beacon' && opts.level === 4) { const f = o.getObjectByName('flame'); if (f) f.visible = true; }
  return { label, sub: `${triCount(o)} tris`, obj: o };
}

function buildEntries(): Entry[] {
  const E: Entry[] = [];
  if (sheet === 'characters') {
    for (const r of ROLES) E.push(charEntry(r, r, {}));
    E.push(charEntry('player', 'player · walk', { speed: 2.5 }));
    E.push(charEntry('player', 'player · run', { speed: 6 }));
    E.push(charEntry('player', 'player · carry 6', {}, 6));
    for (const a of ACTIONS) E.push(charEntry('player', `player · ${a}`, { action: a }));
    E.push(charEntry('dog', 'dog · trot', { speed: 5 }));
    for (const v of ['frozen', 'thawed'] as const) {
      const d = getCrowdMesh(v);
      const grp = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const im = new THREE.InstancedMesh(d.geometry, d.material, 1);
        im.setMatrixAt(0, new THREE.Matrix4().makeTranslation((i - 1) * 0.8, 0, 0));
        if (v === 'thawed') im.setColorAt(0, new THREE.Color(COATS[i * 2]));
        im.castShadow = true;
        grp.add(im);
      }
      E.push({ label: `crowd · ${v}`, sub: `${d.geometry.attributes.position.count / 3} tris each`, obj: grp, radius: 1.5, center: new THREE.Vector3(0, 0.6, 0) });
    }
  } else if (sheet === 'actions') {
    const role = (q.get('role') ?? 'player') as CharacterRole;
    E.push(charEntry(role, `${role} · idle`, {}));
    E.push(charEntry(role, `${role} · walk`, { speed: 2.5 }));
    E.push(charEntry(role, `${role} · run`, { speed: 6 }));
    E.push(charEntry(role, `${role} · carry walk`, { speed: 3 }, 8));
    for (const a of ACTIONS) E.push(charEntry(role, `${role} · ${a}`, { action: a }));
  } else if (sheet === 'props' || sheet === 'props2' || sheet === 'allprops' || sheet === 'hero') {
    const list: Entry[] = [];
    const names = sheet === 'hero' ? ['kettle', 'counter', 'fishCrate', 'hearth', 'pine', 'pineSnowy', 'tent', 'cabin', 'frostWall'] : (q.get('names')?.split(',') ?? PROP_NAMES);
    const levels = q.get('levels')?.split(',').map(Number);
    for (const name of names) {
      if (name === 'hearth') for (let l = 1; l <= 5; l++) { if (!levels || levels.includes(l)) list.push(propEntry('hearth', { level: l }, `hearth L${l}`)); }
      else if (name === 'beacon') for (let l = 0; l <= 4; l++) list.push(propEntry('beacon', { level: l }, `beacon L${l}${l === 4 ? ' (lit)' : ''}`));
      else if (name === 'frostWall') {
        const g = new THREE.Group();
        for (let i = 0; i < 3; i++) { const w = createProp('frostWall', { seed: i }); w.position.x = (i - 1) * 4; g.add(w); }
        list.push({ label: 'frostWall ×3 tiled', sub: `${Math.round(triCount(g) / 3)} tris each`, obj: g });
      } else if (name === 'conveyor') {
        const g = new THREE.Group();
        for (let i = 0; i < 4; i++) { const w = createProp('conveyor'); w.position.z = (i - 1.5); g.add(w); }
        list.push({ label: 'conveyor ×4', sub: `${triCount(g) / 4} tris each`, obj: g });
      } else if (name === 'fence') {
        const g = new THREE.Group();
        for (let i = 0; i < 3; i++) { const w = createProp('fence', { seed: i }); w.position.x = (i - 1) * 2; g.add(w); }
        list.push({ label: 'fence ×3', sub: `${Math.round(triCount(g) / 3)} tris each`, obj: g });
      } else if (name === 'rock') {
        const g = new THREE.Group();
        for (let i = 0; i < 4; i++) { const w = createProp('rock', { seed: i }); w.rotation.y = 0; w.scale.setScalar(1); w.position.set((i % 2) * 2.6 - 1.3, 0, Math.floor(i / 2) * 2.4 - 1.2); g.add(w); }
        list.push({ label: 'rock ×4 variants', sub: `~${Math.round(triCount(g) / 4)} tris`, obj: g });
      } else if (name === 'pine' || name === 'pineSnowy') {
        const g = new THREE.Group();
        for (let i = 0; i < 3; i++) { const w = createProp(name, { seed: i }); w.position.x = (i - 1) * 2.6; w.position.z = i === 1 ? -1 : 0; g.add(w); }
        list.push({ label: `${name} ×3 seeds`, sub: `~${Math.round(triCount(g) / 3)} tris`, obj: g });
      } else list.push(propEntry(name, {}));
    }
    if (sheet !== 'hero' && !q.has('names')) list.push(propEntry('notARealProp', {}, 'unknown → placeholder'));
    const half = Math.ceil(list.length / 2);
    E.push(...(sheet === 'props' ? list.slice(0, half) : sheet === 'props2' ? list.slice(half) : list));
  } else if (sheet === 'items') {
    for (const k of ITEMS) {
      const d = getItemMesh(k);
      const o = new THREE.Mesh(d.geometry, d.material); o.castShadow = true; o.receiveShadow = true;
      E.push({ label: k, sub: `${d.geometry.attributes.position.count / 3} tris · h ${d.stackHeight}`, obj: o, radius: 0.42, center: new THREE.Vector3(0, 0.08, 0) });
    }
    for (const k of ITEMS) E.push({ label: `${k} ×20`, obj: itemStack(k, 20) });
  } else if (sheet === 'thumbs') {
    for (const k of ITEMS) {
      const d = getItemMesh(k);
      const o = new THREE.Mesh(d.geometry, d.material);
      E.push({ label: '', obj: o, radius: 0.36, center: new THREE.Vector3(0, 0.08, 0) });
    }
  } else if (sheet === 'crowd') {
    E.push({ label: 'frozen ×100', obj: crowdBlock('frozen', 100, false) });
    E.push({ label: 'thawed ×100 tinted', obj: crowdBlock('thawed', 100, true) });
    E.push({ label: 'thawed ×100 untinted', obj: crowdBlock('thawed', 100, false) });
  }
  return focus ? E.filter((e) => e.label.toLowerCase().includes(focus)) : E;
}

// ---------------------------------------------------------------- renderer & layout
const entries = buildEntries();
const width = Number(q.get('width') ?? window.innerWidth);
const cellW0 = Number(q.get('cell') ?? (focus ? width : 320));
const cols = Number(q.get('cols') ?? Math.max(1, Math.min(entries.length, Math.floor(width / cellW0))));
const cellW = Math.floor(width / cols);
const cellH = Math.floor(cellW * (q.has('cell') && Number(q.get('cell')) < 100 ? 1 : 0.92));
const rows = Math.ceil(entries.length / cols);
const H = rows * cellH;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(width, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setScissorTest(true);
const wrap = document.getElementById('wrap')!;
wrap.appendChild(renderer.domElement);
const nav = document.getElementById('nav')!;
nav.innerHTML = ['characters', 'actions', 'props', 'props2', 'items', 'thumbs', 'crowd'].map((s) => `<a href="?sheet=${s}">${s}</a>`).join('');
if (q.has('nonav')) nav.remove();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6f86aa);
scene.fog = new THREE.Fog(0x6f86aa, 30, 80);
const hemi = new THREE.HemisphereLight(0xb8cff0, 0x56607a, 1.35);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffd9b0, 2.4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0008;
key.shadow.normalBias = 0.02;
key.shadow.radius = 3;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0x9ec4ff, 0.6);
scene.add(rim);
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0xeef4fb, roughness: 0.95 }),
);
ground.receiveShadow = true;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(32, cellW / cellH, 0.05, 300);

for (const e of entries) { e.obj.visible = false; scene.add(e.obj); }

// per-entry framing
const box3 = new THREE.Box3(), sph = new THREE.Sphere();
for (const e of entries) {
  e.update?.(1);
  e.obj.visible = true;
  e.obj.updateMatrixWorld(true);
  box3.setFromObject(e.obj);
  box3.getBoundingSphere(sph);
  e.center ??= sph.center.clone();
  e.radius ??= sph.radius;
  e.obj.visible = false;
}

entries.forEach((e, i) => {
  if (!e.label) return;
  const d = document.createElement('div');
  d.className = 'lbl';
  d.style.left = `${(i % cols) * cellW}px`;
  d.style.top = `${Math.floor(i / cols) * cellH + cellH - 44}px`;
  d.style.width = `${cellW}px`;
  d.innerHTML = `<div><b>${e.label}</b><span>${e.sub ?? ''}</span></div>`;
  wrap.appendChild(d);
});

const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
function frame(t: number) {
  entries.forEach((e, i) => {
    const x = (i % cols) * cellW, yTop = Math.floor(i / cols) * cellH;
    const y = H - yTop - cellH;
    renderer.setViewport(x, y, cellW, cellH);
    renderer.setScissor(x, y, cellW, cellH);
    e.update?.(t);
    e.obj.visible = true;
    const r = e.radius!;
    const c = e.center!;
    const dist = (r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * (e.label ? 0.98 : 0.9);
    camera.position.copy(c).addScaledVector(dir, dist);
    if (e.label) camera.position.y += r * 0.05;
    camera.lookAt(c.x, c.y - (e.label ? r * 0.08 : 0), c.z);
    camera.near = dist * 0.05; camera.far = dist * 4;
    camera.updateProjectionMatrix();
    key.position.set(c.x - r * 1.2, c.y + r * 2.2, c.z + r * 1.4);
    key.target.position.copy(c);
    const sc = key.shadow.camera;
    sc.left = -r * 1.6; sc.right = r * 1.6; sc.top = r * 1.6; sc.bottom = -r * 1.6; sc.near = 0.1; sc.far = r * 6;
    sc.updateProjectionMatrix();
    rim.position.set(c.x + r * 2, c.y + r, c.z - r * 2);
    renderer.render(scene, camera);
    e.obj.visible = false;
  });
}

const t0 = performance.now();
function loop() {
  frame(fixedT ?? (performance.now() - t0) / 1000);
  if (fixedT === null) requestAnimationFrame(loop);
  else (window as unknown as { __ready: boolean }).__ready = true;
}
loop();
(window as unknown as { __ready: boolean }).__ready = true;
