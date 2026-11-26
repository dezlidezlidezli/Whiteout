// Animation continuity check: ramps speed 0 -> 5 -> 2 -> 5 -> 0 (and toggles carry/actions)
// at 60 fps and records the per-frame movement of each hand; reports the max delta and any spikes.
import * as THREE from 'three';
import { animateCharacter, createCharacter, type CharacterAnimState, type CharacterRole } from '../view/models';

export function runAnimTest(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const speedAt = (t: number) => {
    const keys = [[0, 0], [0.4, 5], [0.9, 2], [1.4, 5], [2.0, 0], [2.4, 0]];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
      if (t <= t1) return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
    }
    return 0;
  };
  for (const role of ['player', 'lumberjack', 'dog'] as CharacterRole[]) {
    for (const scenario of ['ramp', 'ramp+carry-toggle', 'ramp+action-toggle']) {
      const rig = createCharacter(role, { seed: 3 });
      const scene = new THREE.Scene();
      scene.add(rig.root);
      const hand = rig.root.getObjectByName(role === 'dog' ? 'legFL' : 'armR')!;
      const tip = new THREE.Object3D();
      tip.position.set(0, -0.4, 0);
      hand.add(tip);
      const v = new THREE.Vector3(), prev = new THREE.Vector3();
      let maxD = 0, spikes = 0;
      const deltas: number[] = [];
      for (let f = 0; f <= 150; f++) {
        const t = 10 + f / 60;
        const s: CharacterAnimState = { time: t, speed: speedAt(f / 60), carrying: false, action: 'none' };
        if (scenario === 'ramp+carry-toggle') s.carrying = Math.floor(f / 30) % 2 === 1;
        if (scenario === 'ramp+action-toggle') s.action = Math.floor(f / 40) % 2 === 1 ? 'chop' : 'none';
        animateCharacter(rig, s);
        rig.root.updateMatrixWorld(true);
        tip.getWorldPosition(v);
        if (f > 0) { const d = v.distanceTo(prev); deltas.push(d); maxD = Math.max(maxD, d); }
        prev.copy(v);
      }
      // a spike = a frame delta more than 3x the larger of its neighbours' average and > 2 cm
      for (let i = 1; i < deltas.length - 1; i++) {
        const ref = Math.max(0.004, (deltas[i - 1] + deltas[i + 1]) / 2);
        if (deltas[i] > 0.02 && deltas[i] > ref * 3) spikes++;
      }
      out[`${role}:${scenario}`] = { maxDeltaCm: +(maxD * 100).toFixed(2), spikes };
    }
  }
  return out;
}
