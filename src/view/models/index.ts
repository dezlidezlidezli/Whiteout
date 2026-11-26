// MODEL CONTRACT — the signatures below are fixed; view code imports only from this file.
// Stub implementation (coloured boxes). The art agent replaces the internals with
// procedural low-poly models. Unknown names must keep returning a visible placeholder.
//
// Conventions: 1 unit = 1 metre. Origin at ground centre (y = 0 is the floor). +Z is "forward".
// Y up. Meshes set castShadow/receiveShadow themselves. No external asset files.

import * as THREE from 'three';

/** Carryable item kinds. Must match ItemKind in src/data. */
export type ItemKind = 'fish' | 'stew' | 'log' | 'plank' | 'smokedFish' | 'ore' | 'ingot' | 'feast' | 'ember';

export type PropName =
  | 'kettle' | 'counter' | 'fishCrate' | 'storageTable'
  | 'hearth' // opts.level 1..5
  | 'tent' | 'cabin' | 'pine' | 'pineSnowy' | 'stump' | 'rock' | 'snowDrift'
  | 'sawmill' | 'smokehouse' | 'iceHole' | 'oreVein' | 'forge' | 'greatKitchen'
  | 'beacon' // opts.level 0..4 (0 = foundation, 4 = complete, lit handled by view)
  | 'fence' | 'gate' | 'frostWall' | 'conveyor' | 'brazier' | 'lantern' | 'signpost'
  | 'sled' | 'crate' | 'barrel' | 'snowman' | 'bridge' | 'noticeBoard' | 'bench' | 'woodPile';

export interface ModelOpts {
  level?: number;
  /** Deterministic variation seed. */
  seed?: number;
}

/** Static prop. Unknown names return a placeholder box, never throw. */
export function createProp(name: PropName | (string & {}), opts: ModelOpts = {}): THREE.Object3D {
  void opts;
  const h = 1;
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(1, h, 1),
    new THREE.MeshStandardMaterial({ color: hashColor(name) }),
  );
  m.position.y = h / 2;
  m.castShadow = true;
  const g = new THREE.Group();
  g.name = name;
  g.add(m);
  return g;
}

/** One geometry + one material per item kind, for InstancedMesh stacks and piles. */
export interface ItemMeshDef {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Vertical spacing when stacked, metres. */
  stackHeight: number;
  /** Rough footprint radius, metres. */
  radius: number;
}
const itemCache = new Map<string, ItemMeshDef>();
export function getItemMesh(kind: ItemKind): ItemMeshDef {
  let d = itemCache.get(kind);
  if (!d) {
    d = {
      geometry: new THREE.BoxGeometry(0.4, 0.18, 0.4).translate(0, 0.09, 0),
      material: new THREE.MeshStandardMaterial({ color: hashColor(kind) }),
      stackHeight: 0.2,
      radius: 0.25,
    };
    itemCache.set(kind, d);
  }
  return d;
}

export type CharacterRole = 'player' | 'porter' | 'cook' | 'lumberjack' | 'fisher' | 'miner' | 'villager' | 'dog';

/** Articulated character for the player and helpers (few on screen). */
export interface CharacterRig {
  root: THREE.Object3D;
  /** Empty node at the top of the back/arms where a carried stack is attached. */
  carryAnchor: THREE.Object3D;
  /** Approximate height in metres. */
  height: number;
}
export function createCharacter(role: CharacterRole, opts: ModelOpts = {}): CharacterRig {
  void opts;
  const root = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 0.7, 4, 8),
    new THREE.MeshStandardMaterial({ color: hashColor(role) }),
  );
  body.position.y = 0.65;
  body.castShadow = true;
  root.add(body);
  const carryAnchor = new THREE.Object3D();
  carryAnchor.position.set(0, 0.9, 0.45);
  root.add(carryAnchor);
  return { root, carryAnchor, height: 1.3 };
}

export interface CharacterAnimState {
  /** Seconds, monotonically increasing. */
  time: number;
  /** Ground speed in m/s (0 = idle). */
  speed: number;
  /** True when holding a stack (arms forward). */
  carrying: boolean;
  /** Optional one-shot/looping action. */
  action?: 'none' | 'chop' | 'mine' | 'fish' | 'cook' | 'cheer' | 'shiver';
}
/** Procedural animation: call every frame for each visible rig. */
export function animateCharacter(rig: CharacterRig, s: CharacterAnimState): void {
  rig.root.children[0].position.y = 0.65 + (s.speed > 0.1 ? Math.abs(Math.sin(s.time * 10)) * 0.06 : 0);
}

/** Crowd villagers are drawn with InstancedMesh (hundreds on screen): one merged geometry,
 *  vertex colours, white-ish base so instanceColor can tint coats. Animation is done by the
 *  view via per-instance transforms (hop / waddle / shiver), not bones. */
export interface CrowdMeshDef {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  height: number;
}
export function getCrowdMesh(variant: 'frozen' | 'thawed'): CrowdMeshDef {
  return {
    geometry: new THREE.CapsuleGeometry(0.25, 0.6, 4, 8).translate(0, 0.55, 0),
    material: new THREE.MeshStandardMaterial({ color: variant === 'frozen' ? 0xbfe3ff : 0xffffff }),
    height: 1.1,
  };
}

/** Shared palette so view/UI effects match the models. */
export const PALETTE = {
  snow: 0xeef4fb,
  snowShade: 0xc9d8ec,
  thawedGround: 0x8a9a5b,
  ice: 0x9fd4f5,
  frost: 0xcfe9ff,
  ember: 0xffb347,
  emberHot: 0xff6a2b,
  wood: 0x9a6b3f,
  night: 0x0e1626,
} as const;

function hashColor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.55, 0.55).getHex();
}
