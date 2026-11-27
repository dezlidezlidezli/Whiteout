// The campaign bot on the SHIPPED data: every signature mechanic switched off (what players get until the
// view draws them). Same pacing rules as the full-mechanics run in bot.test.ts; the areas are a little
// shorter without the mechanic quests.
import { describe, expect, it } from 'vitest';
import { GAME_DATA, SHIPPED_MECHANICS } from '../src/data';
import { runBot } from './bot';

const min = 60;

describe('headless campaign bot, shipped data (mechanics off)', () => {
  it('plays all five areas to the finale, then 20 minutes of Open Season', () => {
    expect(GAME_DATA.mechanics).toEqual(SHIPPED_MECHANICS);
    const r = runBot({ seed: 1, maxMinutes: 180, endlessMinutes: 20, data: GAME_DATA });
    (globalThis as any).process?.stdout?.write?.(r.report.split('\n').slice(-3).join('\n') + '\n');
    expect(r.finished).toBe(true);
    expect(r.firstThaw).toBeLessThan(40);
    expect(r.firstPad).toBeLessThan(90);
    expect(r.area1End).toBeGreaterThan(10 * min);
    expect(r.area1End).toBeLessThan(13 * min);
    expect(r.area2End - r.area1End).toBeGreaterThan(13 * min);
    expect(r.area2End - r.area1End).toBeLessThan(25 * min);
    expect(r.area3End - r.area2End).toBeGreaterThan(16 * min);
    expect(r.area3End - r.area2End).toBeLessThan(26 * min);
    expect(r.area4End - r.area3End).toBeGreaterThan(19 * min);
    expect(r.area4End - r.area3End).toBeLessThan(31 * min);
    expect(r.area5End - r.area4End).toBeGreaterThan(12 * min);
    expect(r.area5End - r.area4End).toBeLessThan(21 * min);
    expect(r.finaleDone).toBeGreaterThan(75 * min);
    expect(r.finaleDone).toBeLessThan(120 * min);
    expect(r.longestGap).toBeLessThan(200);
    expect(r.longestNoGuide).toBeLessThan(10);
    expect(r.ordersDone).toBeGreaterThanOrEqual(10);
    expect(r.upgradesBought).toBeGreaterThanOrEqual(3);
    // A mechanic that is switched off must leave no trace; one that is on must actually get used.
    const on = GAME_DATA.mechanics;
    if (!on.flame) expect(r.sim.state.orders.every((o) => !o.festival)).toBe(true);
    if (on.skate) expect(r.sim.state.stats.fishLeaps ?? 0).toBeGreaterThan(0);
    else expect(r.sim.state.stats.fishLeaps ?? 0).toBe(0);
    if (on.plough) expect(r.sim.state.stats.snowCells ?? 0).toBeGreaterThan(0);
    else expect(r.sim.state.stats.snowCells ?? 0).toBe(0);
    // The flame gates the finale: the whole Trail of Light was lit in order and carried to the Beacon.
    if (on.flame) {
      const trail = GAME_DATA.mech.braziers.filter((b) => b.kind === 'trail');
      expect(trail.length).toBe(7);
      for (const b of trail) expect(r.sim.state.flame.lit[b.id], b.id).toBe(true);
      expect(r.sim.state.stats.beaconLit ?? 0).toBe(1);
      expect(r.sim.state.flame.beaconLit).toBe(true);
    } else expect(r.sim.state.stats.trailLit ?? 0).toBe(0);
    if (on.crank) expect(r.sim.state.stats.crankTurns ?? 0).toBeGreaterThan(0);
    else expect(r.sim.state.stats.crankTurns ?? 0).toBe(0);
  }, 240_000);
});
