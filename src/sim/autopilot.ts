// Autopilot "brain": plays the game through the public sim API only (guide(), state, setMove()).
// Used by the headless bot test and by ?autoplay=1 in the browser.

import { inRects, steer } from './collision';
import type { Sim } from './sim';

export class Autopilot {
  private side = 1;
  private stuckT = 0;
  private lastX = 0;
  private lastZ = 0;
  private sideT = 0;
  private plainT = 0;
  private stuckN = 0;

  /** Call once per sim step before sim.step(). */
  update(sim: Sim, dt: number): void {
    const t = sim.guide();
    const p = sim.state.player;
    if (!t) {
      sim.setMove(0, 0);
      return;
    }
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    if (d <= Math.max(0.35, t.reach)) {
      sim.setMove(0, 0);
      this.stuckT = 0;
      this.lastX = p.x;
      this.lastZ = p.z;
      return;
    }
    const w = sim.navFromPlayer(t.x, t.z);
    // Give other stations a wide berth so we don't grab things we don't need on the way.
    const avoid = sim.allSolids().slice();
    for (const d of sim.data.stations) {
      if (d.id === t.id || d.type === 'node' || !sim.isUsable(d.id)) continue;
      avoid.push({ kind: 'circle', x: d.x, z: d.z, r: Math.max(0.5, d.reach - 0.45) });
    }
    const r = sim.data.balance.playerRadius;
    let dir = steer(p, w.x, w.z, r, avoid, this.sideT > 0 ? -this.side : this.side);
    // Avoidance must not push us into the edge of the walkable space, and is dropped while unsticking.
    const rects = sim.walkRects();
    if (this.plainT > 0 || !inRects(p.x + dir.x * 0.7, p.z + dir.z * 0.7, r, rects)) {
      const l = Math.hypot(w.x - p.x, w.z - p.z) || 1;
      dir = { x: (w.x - p.x) / l, z: (w.z - p.z) / l };
    }
    if (this.plainT > 0) this.plainT -= dt;
    // Ease off when nearly there so we don't orbit the target.
    const k = Math.min(1, d / 0.6);
    sim.setMove(dir.x * k, dir.z * k);
    this.stuckT += dt;
    if (this.sideT > 0) this.sideT -= dt;
    if (this.stuckT > 0.7) {
      if (Math.hypot(p.x - this.lastX, p.z - this.lastZ) < 0.5) {
        this.sideT = 1.0;
        this.side = -this.side;
        this.stuckN++;
        if (this.stuckN % 2 === 0) this.plainT = 1.0;
      }
      this.stuckT = 0;
      this.lastX = p.x;
      this.lastZ = p.z;
    }
  }
}
