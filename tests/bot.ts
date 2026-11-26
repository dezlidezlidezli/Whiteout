// Headless bot: plays the campaign through the public sim API only and records time-to-milestone.

import { GAME_DATA } from '../src/data';
import { Autopilot, Sim, STEP } from '../src/sim';

export interface Milestone {
  t: number;
  what: string;
}

export interface BotResult {
  milestones: Milestone[];
  finished: boolean;
  time: number;
  sim: Sim;
  /** Longest gap between two consecutive unlock milestones (pads/quests), seconds. */
  longestGap: number;
  /** End times per area. */
  area1End: number;
  area2End: number;
}

export function runBot(opts: { seed?: number; maxMinutes?: number; verbose?: boolean } = {}): BotResult {
  const sim = new Sim(GAME_DATA, { seed: opts.seed ?? 1 });
  const bot = new Autopilot();
  const maxT = (opts.maxMinutes ?? 60) * 60;
  const milestones: Milestone[] = [];
  let area1End = -1;
  let area2End = -1;
  let finished = false;
  while (sim.state.time < maxT) {
    bot.update(sim, STEP);
    sim.step(STEP);
    for (const e of sim.drainEvents()) {
      if (e.type === 'padComplete') milestones.push({ t: sim.state.time, what: `pad ${e.pad}` });
      else if (e.type === 'questComplete') milestones.push({ t: sim.state.time, what: `quest ${e.quest}` });
      else if (e.type === 'hearthUp') {
        milestones.push({ t: sim.state.time, what: `HEARTH L${e.level}` });
        if (e.level === 2) area1End = sim.state.time;
        if (e.level === 3) area2End = sim.state.time;
      }
    }
    const q = sim.data.quests[sim.state.quest.index];
    if (!q || q.goal.type === 'never') {
      finished = true;
      break;
    }
  }
  let longestGap = 0;
  let last = 0;
  for (const m of milestones) {
    longestGap = Math.max(longestGap, m.t - last);
    last = m.t;
  }
  if (opts.verbose) {
    for (const m of milestones) console.log(`${fmt(m.t)}  ${m.what}`);
    console.log(`Area 1 (Kettle Yard) done at ${fmt(area1End)}, Area 2 (Pinewood) done at ${fmt(area2End)} ` +
      `(area 2 took ${fmt(area2End - area1End)}); longest gap ${longestGap.toFixed(0)} s; pop ${sim.state.population}`);
  }
  return { milestones, finished, time: sim.state.time, sim, longestGap, area1End, area2End };
}

export function fmt(t: number): string {
  if (t < 0) return '--:--';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
