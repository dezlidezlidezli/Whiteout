// Great Beacon stages and the finale state machine.
//
//   beacon stage 1..4 (pads at the summit) → stage 4 starts the finale:
//   'lighting' (finale.lightingTime s: the beacon flares, storm swirls)
//   → 'dawn'   (on entry: Long Night ends for good — all areas open, warm radius covers the map, every
//               queued Icebound thaws and pays, a big ember reward piles at the beacon; lasts dawnTime s)
//   → 'done'   (permanent; Open Season starts: orders are posted on the notice board).
// The sim never stops or locks input; the view drives its cinematic from state.finale.{phase,progress}.

import type { CounterDef } from '../data/types';
import { startOpenSeason } from './endless';
import type { Sim } from './sim';
import type { CounterState } from './state';

export function setBeaconStage(sim: Sim, stage: number): void {
  const s = sim.state;
  if (stage <= s.beacon) return;
  s.beacon = stage;
  sim.emit({ type: 'beaconStage', stage });
  // Stage 4 completes the Beacon, which then stands dark: carrying the flame to its crown starts the finale (flame.ts).
}

/** The finale's first phase (called when the carried flame lights the finished Beacon). */
export function startFinale(sim: Sim): void {
  const s = sim.state;
  if (s.finale.phase !== 'none') return;
  s.finale = { phase: 'lighting', t: 0, progress: 0 };
  sim.emit({ type: 'finale', phase: 'lighting' });
}

export function updateFinale(sim: Sim, dt: number): void {
  const s = sim.state;
  const f = s.finale;
  if (f.phase === 'none' || f.phase === 'done') return;
  const def = sim.data.finale;
  f.t += dt;
  const len = f.phase === 'lighting' ? def.lightingTime : def.dawnTime;
  f.progress = Math.min(1, f.t / len);
  if (f.t < len) return;
  if (f.phase === 'lighting') {
    s.finale = { phase: 'dawn', t: 0, progress: 0 };
    breakTheNight(sim);
    sim.emit({ type: 'finale', phase: 'dawn' });
  } else {
    s.finale = { phase: 'done', t: 0, progress: 1 };
    sim.addStat('finale', 1);
    sim.emit({ type: 'finale', phase: 'done' });
    startOpenSeason(sim);
  }
}

/** The permanent end of the Long Night. */
function breakTheNight(sim: Sim): void {
  const s = sim.state;
  for (const a of sim.data.areas) {
    if (!s.areasOpen[a.id]) {
      s.areasOpen[a.id] = true;
      sim.emit({ type: 'areaOpen', area: a.id });
    }
  }
  sim.invalidateRects();
  // Every queued Icebound thaws at once and pays for one dish (nothing is ever lost).
  let n = 0;
  for (const cu of s.customers) {
    if (cu.phase !== 'queue') continue;
    const c = sim.stationDefs.get(cu.counter) as CounterDef;
    const cs = s.stations[c.id] as CounterState;
    const qi = cs.queue.indexOf(cu.id);
    if (qi >= 0) cs.queue.splice(qi, 1);
    cu.phase = 'thaw';
    cu.t = 0;
    n++;
    sim.addStat('served', 1);
    sim.addStat('finaleThawed', 1);
    sim.emit({ type: 'thaw', customer: cu.id, x: cu.x, z: cu.z });
    sim.addEmbers(c.emberSpot, Math.round(sim.dishPrice(c.item)), `embers_${c.id}`);
  }
  const def = sim.data.finale;
  sim.addEmbers(def.rewardSpot, def.reward, 'embers_beacon');
  sim.emit({ type: 'longNightEnds', thawed: n, reward: def.reward });
}

/** Warm radius override once dawn breaks (lerps out from the Hearth's to the whole map). */
export function finaleWarmRadius(sim: Sim, base: number): number {
  const f = sim.state.finale;
  if (f.phase === 'none' || f.phase === 'lighting') return base;
  const full = sim.data.finale.warmRadius;
  if (f.phase === 'done') return full;
  const k = f.progress * f.progress * (3 - 2 * f.progress);
  return base + (full - base) * k;
}
