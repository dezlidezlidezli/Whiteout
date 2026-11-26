// MODEL CONTRACT — the signatures below are fixed; view code imports only from this file.
// Implementation lives in sibling files (props/, items.ts, characters.ts, crowd.ts, palette.ts).
// Unknown prop names return a visible magenta placeholder box and never throw.
//
// Conventions: 1 unit = 1 metre. Origin at ground centre (y = 0 is the floor). +Z is "forward".
// Y up. Meshes set castShadow/receiveShadow themselves. No external asset files.

import * as THREE from 'three';
import { buildProp } from './props/registry';
import { itemMesh } from './items';
import { animate, buildCharacter } from './characters';
import { crowdMesh } from './crowd';

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
  return buildProp(String(name), opts ?? {});
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
export function getItemMesh(kind: ItemKind): ItemMeshDef {
  return itemMesh(kind);
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
  return buildCharacter(role, opts ?? {});
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
  animate(rig, s);
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
  return crowdMesh(variant === 'frozen' ? 'frozen' : 'thawed');
}

/** Shared palette so view/UI effects match the models. */
export { PALETTE, FROZEN_TINTS } from './palette';
export type { PaletteKey } from './palette';
/** Shared materials (std, glow, ember, ice, crowd) for effects that should match the models. */
export { mats as getSharedMaterials } from './materials';
/** Every prop name the factory knows (for galleries/tests). */
export { PROP_NAMES } from './props/registry';
/** Central character style table (colours/hat/tool per role). */
export { CHARACTER_STYLES } from './characters';
