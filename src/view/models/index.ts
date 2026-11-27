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
  | 'sled' | 'crate' | 'barrel' | 'snowman' | 'bridge' | 'noticeBoard' | 'bench' | 'woodPile'
  // endless-mode decor & extras
  | 'emberPile' // opts.level 1..4 (small -> large heap)
  | 'flagPole' | 'lanternString' | 'statue' | 'well' | 'sleighBell' | 'iceSculpture' | 'marketStall'
  | 'campfireRing' | 'caravan' | 'aurora'
  // density kit / yard clutter (opts.seed picks a variant)
  | 'crateStack' | 'barrelCluster' | 'sackPile' | 'firewoodRack' | 'dryingRack' | 'supplySled' | 'toolRack' | 'washTub' | 'basketPile' | 'potShelf' | 'signBoard' | 'rugMat' | 'snowBank' | 'bush' | 'sapling' | 'fallenLog' | 'iceShards' | 'footpathStones' | 'lampPost' | 'bannerLine' | 'woodenArch' | 'watchTower' | 'snowyBoulderCluster'
  // signature mechanics (docs/MECHANICS.md)
  | 'plough' // opts.level 1 | 2 (2.4 m iron-edged blade)
  | 'emberCache' | 'buriedCrate' | 'buriedVillager' | 'lanternHeld' | 'foundBoard' | 'monument'
  | 'gripMat' | 'fishLeap' | 'capstan' | 'bellows' | 'mineLift' | 'shaftPile'
  | 'flameHeld' | 'trailBrazier' | 'windGap' | 'festivalLamp';

export interface ModelOpts {
  level?: number;
  /** Deterministic variation seed. */
  seed?: number;
  /** Character look variant, e.g. 'rescued' (blanket-wrapped, frosty follower). */
  variant?: 'default' | 'rescued';
  /** Characters: show skate blades under the boots (named children skateL / skateR; the view may toggle them). */
  skates?: boolean;
  /** Props with a lit/unlit state (brazier, trailBrazier, festivalLamp): start unlit. */
  unlit?: boolean;
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
  action?: 'none' | 'chop' | 'mine' | 'fish' | 'cook' | 'cheer' | 'shiver'
    | 'plough' | 'skate' | 'crank' | 'carryFlame' | 'dig' | 'shuffle';
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

// ---------------------------------------------------------------- paths, floors, scatter (additive API)
export type { XZ, PathSample, GroundPath, Station, SweepOpts } from './paths';
export type { ConveyorPath, ConveyorPathOpts, FencePathOpts, WallPathOpts, PathStripOpts, StripType, LanternStringPathOpts } from './pathkit';
export type { FloorType, FloorOpts, ScatterKind } from './floor';
import { groundPath as _groundPath, sweep as _sweep, type XZ as _XZ, type GroundPath as _GroundPath, type SweepOpts as _SweepOpts } from './paths';
import {
  conveyorPath as _conveyorPath, fencePath as _fencePath, wallPath as _wallPath, pathStrip as _pathStrip, lanternStringPath as _lanternStringPath,
  type ConveyorPath as _ConveyorPath, type ConveyorPathOpts as _ConveyorPathOpts, type FencePathOpts as _FencePathOpts,
  type WallPathOpts as _WallPathOpts, type PathStripOpts as _PathStripOpts, type LanternStringPathOpts as _LanternStringPathOpts,
} from './pathkit';
import { floor as _floor, scatterMesh as _scatterMesh, type FloorType as _FloorType, type FloorOpts as _FloorOpts, type ScatterKind as _ScatterKind } from './floor';

/** Polyline on the ground with arc-filleted corners: `length` and `sample(distance) -> { x, z, yaw }`. */
export function createGroundPath(points: _XZ[], radius = 1.0): _GroundPath { return _groundPath(points, radius); }
/** Sweep a [lateral, height] cross-section along a ground path (vertex-coloured, non-indexed geometry). */
export function sweepPath(path: _GroundPath, profile: [number, number][], opts?: _SweepOpts): THREE.BufferGeometry { return _sweep(path, profile, opts); }
/** One continuous conveyor through `points` (rounded corners). Items ride at object.userData.beltY using sample(d). */
export function createConveyorPath(points: _XZ[], opts?: _ConveyorPathOpts): _ConveyorPath { return _conveyorPath(points, opts); }
/** Post-and-rail fence following a path; posts at even spacing (also through curves). */
export function createFencePath(points: _XZ[], opts?: _FencePathOpts): THREE.Object3D { return _fencePath(points, opts); }
/** Log palisade (~1.6 m) with snow caps; `gaps: [{ at: distanceAlongPath, width }]` make gateways. */
export function createWallPath(points: _XZ[], opts?: _WallPathOpts): THREE.Object3D { return _wallPath(points, opts); }
/** Ground strip just above y = 0: trampled snow, plank boardwalk, cobbles or ice. */
export function createPathStrip(points: _XZ[], opts?: _PathStripOpts): THREE.Object3D { return _pathStrip(points, opts); }
/** Posts every ~4 m with sagging strings of warm lanterns (userData.lightPositions). */
export function createLanternStringPath(points: _XZ[], opts?: _LanternStringPathOpts): THREE.Object3D { return _lanternStringPath(points, opts); }
/** Warm yard floor slab with a kerb (one draw call), centred on the origin. */
export function createFloor(type: _FloorType, width: number, depth: number, opts?: _FloorOpts): THREE.Object3D { return _floor(type, width, depth, opts); }
/** Tiny ground scatter for InstancedMesh (same shape as getItemMesh). */
export function getScatterMesh(kind: _ScatterKind): ItemMeshDef { return _scatterMesh(kind); }

// ---------------------------------------------------------------- mechanics helpers (additive API)
import { deepSnowCell as _deepSnowCell, snowBankCell as _snowBankCell, iceSheet as _iceSheet, type IceSheetOpts as _IceSheetOpts } from './snowcells';
export type { IceSheetOpts } from './snowcells';
/** Instancable deep-snow cell (0.5 m footprint, ~0.45 m tall); opts.seed % 4 picks a shape variant. */
export function getDeepSnowMesh(opts: ModelOpts = {}): CrowdMeshDef { return _deepSnowCell(opts.seed ?? 0); }
/** Curled-off plough bank cell (~0.55 m along Z, lip curls to +X); opts.seed % 3 picks a variant. */
export function getSnowBankMesh(opts: ModelOpts = {}): CrowdMeshDef { return _snowBankCell(opts.seed ?? 0); }
/** Lake-ice floor, one draw call, glossy; userData.surface = 'ice'. */
export function createIceSheet(width: number, depth: number, opts?: _IceSheetOpts): THREE.Object3D { return _iceSheet(width, depth, opts); }
