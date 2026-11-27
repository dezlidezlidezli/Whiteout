// Player and helper characters, with their springy carry stacks.

import * as THREE from 'three';
import type { GameData, ItemKind } from '../data/types';
import type { HelperState, Sim } from '../sim';
import type { ItemBatcher } from './items';
import { animateCharacter, createCharacter, type CharacterRig, type CharacterRole } from './models';
import { lerpAngle } from './crowd';

const ROLES: CharacterRole[] = ['player', 'porter', 'cook', 'lumberjack', 'fisher', 'miner', 'villager', 'dog'];

/** Damped spring that makes a stack lag and lean behind its carrier. */
export class StackSpring {
  x = 0;
  z = 0;
  private vx = 0;
  private vz = 0;
  private lvx = 0;
  private lvz = 0;
  private lyaw = 0;
  lean = 0;

  update(dt: number, velX: number, velZ: number, yaw: number, height: number): void {
    if (dt <= 0) return;
    const ax = (velX - this.lvx) / dt;
    const az = (velZ - this.lvz) / dt;
    this.lvx = velX;
    this.lvz = velZ;
    // Taller stacks are floppier.
    const k = 70 / (1 + height * 0.04);
    const damp = 7;
    const fx = -ax * 0.012 - this.x * k - this.vx * damp;
    const fz = -az * 0.012 - this.z * k - this.vz * damp;
    this.vx += fx * dt;
    this.vz += fz * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    const lim = 0.45;
    this.x = Math.max(-lim, Math.min(lim, this.x));
    this.z = Math.max(-lim, Math.min(lim, this.z));
    // Lean into turns.
    let dy = yaw - this.lyaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.lyaw = yaw;
    this.lean += (Math.max(-0.5, Math.min(0.5, (-dy / dt) * 0.03)) - this.lean) * Math.min(1, dt * 6);
  }
}

const _a = new THREE.Vector3();

/** Draw a carried stack. Returns the world-space top position in `top`. */
export function drawStack(items: ItemBatcher, stack: readonly ItemKind[], hidden: number, anchor: THREE.Object3D, yaw: number, spring: StackSpring, time: number, top: THREE.Vector3): void {
  anchor.getWorldPosition(_a);
  const n = Math.max(0, stack.length - hidden);
  let y = _a.y;
  const total = Math.max(1, stack.length);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  for (let i = 0; i < n; i++) {
    const kind = stack[i];
    const h = items.stackHeight(kind);
    const f = Math.pow((i + 1) / Math.max(6, total), 1.6);
    // Lateral offset from the spring (world) plus a sideways lean in the carrier's frame.
    const lean = spring.lean * f * 0.9;
    const ox = spring.x * f * 2.2 + c * lean;
    const oz = spring.z * f * 2.2 - s * lean;
    const wob = Math.sin(time * 2.1 + i * 0.6) * 0.012 * i * 0.15;
    items.add(kind, _a.x + ox + wob, y, _a.z + oz, yaw + Math.sin(i * 1.7) * 0.12, 1, -spring.z * f * 0.6, spring.x * f * 0.6 + lean * 0.3);
    y += h;
  }
  top.set(_a.x + spring.x * 2.2, y, _a.z + spring.z * 2.2);
}

interface HelperView {
  rig: CharacterRig;
  spring: StackSpring;
  yaw: number;
  top: THREE.Vector3;
  appear: number;
  speed: number;
}

export class Actors {
  readonly player: CharacterRig;
  readonly playerSpring = new StackSpring();
  readonly playerTop = new THREE.Vector3();
  private playerYaw = Math.PI;
  private animSpeed = 0;
  private helpers = new Map<string, HelperView>();
  private parent: THREE.Object3D;
  private data: GameData;
  /** Items currently mid-air towards a stack (hidden from its top). */
  readonly hidden = new Map<string, number>();
  cheerT = 0;

  constructor(parent: THREE.Object3D, data: GameData) {
    this.parent = parent;
    this.data = data;
    this.player = createCharacter('player');
    parent.add(this.player.root);
  }

  helperTop(id: string): THREE.Vector3 | null {
    return this.helpers.get(id)?.top ?? null;
  }

  ensureHelper(id: string, h: HelperState): HelperView {
    let v = this.helpers.get(id);
    if (!v) {
      const def = this.data.helpers.find((d) => d.id === id);
      const role = (ROLES.includes(def?.model as CharacterRole) ? def!.model : 'porter') as CharacterRole;
      const rig = createCharacter(role, { seed: id.length });
      rig.root.position.set(h.x, 0, h.z);
      this.parent.add(rig.root);
      v = { rig, spring: new StackSpring(), yaw: h.facing, top: new THREE.Vector3(h.x, 1.5, h.z), appear: 0, speed: 0 };
      this.helpers.set(id, v);
    }
    return v;
  }

  update(sim: Sim, items: ItemBatcher, alpha: number, time: number, dt: number): void {
    const s = sim.state;
    const p = s.player;
    const x = p.px + (p.x - p.px) * alpha;
    const z = p.pz + (p.z - p.pz) * alpha;
    const rawSpeed = Math.hypot(p.vx, p.vz);
    // Smoothed speed for animation so analog changes and start/stop never snap the walk cycle.
    this.animSpeed += (rawSpeed - this.animSpeed) * (1 - Math.exp(-dt * 10));
    const speed = this.animSpeed < 0.05 ? 0 : this.animSpeed;
    if (rawSpeed > 0.3) this.playerYaw = lerpAngle(this.playerYaw, p.facing, 1 - Math.exp(-dt * 14));
    const r = this.player.root;
    r.position.set(x, 0, z);
    r.rotation.y = this.playerYaw;
    this.cheerT = Math.max(0, this.cheerT - dt);
    const action = p.working ? 'chop' : this.cheerT > 0 && speed < 0.5 ? 'cheer' : 'none';
    animateCharacter(this.player, { time, speed, carrying: p.stack.length > 0, action });
    r.updateMatrixWorld(true);
    this.playerSpring.update(dt, p.vx, p.vz, this.playerYaw, p.stack.length);
    drawStack(items, p.stack, this.hidden.get('player') ?? 0, this.player.carryAnchor, this.playerYaw, this.playerSpring, time, this.playerTop);

    for (const id in s.helpers) {
      const h = s.helpers[id];
      const v = this.ensureHelper(id, h);
      const hx = h.px + (h.x - h.px) * alpha;
      const hz = h.pz + (h.z - h.pz) * alpha;
      const hsRaw = h.moving ? Math.hypot(h.x - h.px, h.z - h.pz) / (1 / 60) : 0;
      v.speed += (hsRaw - v.speed) * (1 - Math.exp(-dt * 10));
      const hs = v.speed < 0.05 ? 0 : v.speed;
      v.yaw = lerpAngle(v.yaw, h.facing, 1 - Math.exp(-dt * 10));
      v.rig.root.position.set(hx, 0, hz);
      v.rig.root.rotation.y = v.yaw;
      v.appear = Math.min(1, v.appear + dt / 0.5);
      const sc = v.appear < 1 ? 0.2 + 0.8 * (1 + 2.2 * Math.pow(v.appear - 1, 3) + 1.2 * Math.pow(v.appear - 1, 2)) : 1;
      v.rig.root.scale.setScalar(sc);
      animateCharacter(v.rig, { time: time + id.length, speed: hs, carrying: h.stack.length > 0, action: h.action });
      v.rig.root.updateMatrixWorld(true);
      v.spring.update(dt, h.moving ? Math.sin(v.yaw) * hs : 0, h.moving ? Math.cos(v.yaw) * hs : 0, v.yaw, h.stack.length);
      drawStack(items, h.stack, this.hidden.get(`helper:${id}`) ?? 0, v.rig.carryAnchor, v.yaw, v.spring, time, v.top);
    }
  }

  /** Reset everything (load). */
  reset(): void {
    for (const v of this.helpers.values()) v.rig.root.removeFromParent();
    this.helpers.clear();
    this.hidden.clear();
  }
}
