// Headless bot: plays the campaign through the public sim API only and records time-to-milestone.
// It plays all five areas to the finale, then `endlessMinutes` of Open Season.

import { GAME_DATA } from '../src/data';
import { Autopilot, Sim, STEP } from '../src/sim';

export interface Milestone {
  t: number;
  what: string;
}

export interface BotResult {
  milestones: Milestone[];
  /** Reached the finale ('done') and played the requested endless time (or ran out of content for short runs). */
  finished: boolean;
  time: number;
  sim: Sim;
  /** Longest gap between two consecutive campaign milestones (pads/quests), seconds, up to the finale. */
  longestGap: number;
  /** Where the longest gap ended. */
  longestGapAt: string;
  /** Longest stretch (s) with no guidance target while the campaign wanted one. */
  longestNoGuide: number;
  /** Human-readable timing report. */
  report: string;
  /** End times per area (Hearth level-ups; area 5 ends when the finale starts). */
  area1End: number;
  area2End: number;
  area3End: number;
  area4End: number;
  area5End: number;
  /** Finale reached 'done' (Open Season begins). */
  finaleDone: number;
  ordersDone: number;
  upgradesBought: number;
  decorations: number;
  /** First Icebound thawed / first pad bought (s). */
  firstThaw: number;
  firstPad: number;
}

export function runBot(opts: { seed?: number; maxMinutes?: number; endlessMinutes?: number; verbose?: boolean } = {}): BotResult {
  const sim = new Sim(GAME_DATA, { seed: opts.seed ?? 1 });
  const bot = new Autopilot();
  const maxT = (opts.maxMinutes ?? 240) * 60;
  const endlessT = (opts.endlessMinutes ?? 20) * 60;
  const milestones: Milestone[] = [];
  const ends: Record<number, number> = {};
  let area5End = -1;
  let finaleDone = -1;
  let finished = false;
  let noGuide = 0;
  let firstThaw = -1;
  let firstPad = -1;
  let longestNoGuide = 0;
  while (sim.state.time < maxT) {
    bot.update(sim, STEP);
    sim.step(STEP);
    const t = sim.state.time;
    for (const e of sim.drainEvents()) {
      if (e.type === 'thaw' && firstThaw < 0) firstThaw = t;
      if (e.type === 'padComplete' && firstPad < 0) firstPad = t;
      if (e.type === 'padComplete') milestones.push({ t, what: `pad ${e.pad}` });
      else if (e.type === 'questComplete') milestones.push({ t, what: `quest ${e.quest}` });
      else if (e.type === 'hearthUp') {
        milestones.push({ t, what: `HEARTH L${e.level}` });
        ends[e.level - 1] = t;
      } else if (e.type === 'beaconStage') milestones.push({ t, what: `BEACON stage ${e.stage}` });
      else if (e.type === 'finale') {
        milestones.push({ t, what: `FINALE ${e.phase}` });
        if (e.phase === 'lighting') area5End = t;
        if (e.phase === 'done') finaleDone = t;
      } else if (e.type === 'orderComplete') milestones.push({ t, what: `order ${e.item} +${e.reward}` });
      else if (e.type === 'upgrade') milestones.push({ t, what: `upgrade ${e.pad} L${e.level}` });
      else if (e.type === 'decorate') milestones.push({ t, what: `decorate ${e.ids[0]}` });
    }
    const q = sim.data.quests[sim.state.quest.index];
    const wants = q && q.goal.type !== 'never' && q.guide?.type !== 'none';
    if (sim.state.tick % 30 === 0) {
      if (wants && !sim.guide()) {
        noGuide += 30 * STEP;
        longestNoGuide = Math.max(longestNoGuide, noGuide);
      } else noGuide = 0;
    }
    if (finaleDone >= 0 && t >= finaleDone + endlessT) {
      finished = true;
      break;
    }
    if (!q) break;
  }
  let longestGap = 0;
  let longestGapAt = '';
  let last = 0;
  for (const m of milestones) {
    if (finaleDone >= 0 && m.t > finaleDone) break;
    if (m.t - last > longestGap) {
      longestGap = m.t - last;
      longestGapAt = `${fmt(m.t)} ${m.what}`;
    }
    last = m.t;
  }
  const st = sim.state.stats;
  const r: BotResult = {
    milestones, finished, time: sim.state.time, sim, longestGap, longestGapAt, longestNoGuide,
    area1End: ends[1] ?? -1, area2End: ends[2] ?? -1, area3End: ends[3] ?? -1, area4End: ends[4] ?? -1, area5End, finaleDone,
    ordersDone: st.ordersDone ?? 0, upgradesBought: st.upgrades ?? 0, decorations: st.decorations ?? 0, report: '', firstThaw, firstPad,
  };
  const lines = milestones
    .filter((m) => !m.what.startsWith('quest') && !m.what.startsWith('order'))
    .map((m) => `${fmt(m.t)}  ${m.what}`);
  const span = (a: number, b: number) => (a >= 0 && b >= 0 ? fmt(b - a) : '--:--');
  lines.push(
    `Area 1 Kettle Yard ${fmt(r.area1End)} | Area 2 Pinewood +${span(r.area1End, r.area2End)} | ` +
      `Area 3 Frozen Lake +${span(r.area2End, r.area3End)} | Area 4 Ironridge +${span(r.area3End, r.area4End)} | ` +
      `Area 5 Beacon Peak +${span(r.area4End, r.area5End)} | finale done ${fmt(finaleDone)}`,
    `Open Season (${fmt(finaleDone >= 0 ? sim.state.time - finaleDone : 0)}): ${r.ordersDone} orders, ` +
      `${r.upgradesBought} upgrades, ${r.decorations} decorations, season ${sim.state.season}`,
    `first thaw ${fmt(firstThaw)}, first purchase ${fmt(firstPad)}; longest campaign gap ${longestGap.toFixed(0)} s (ending ${longestGapAt}); longest no-guide ${longestNoGuide.toFixed(1)} s; ` +
      `pop ${sim.state.population}; embers earned ${st.embersEarned ?? 0}`,
  );
  r.report = lines.join('\n');
  if (opts.verbose) for (const m of milestones) console.log(`${fmt(m.t)}  ${m.what}`);
  return r;
}

export function fmt(t: number): string {
  if (t < 0) return '--:--';
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
}
