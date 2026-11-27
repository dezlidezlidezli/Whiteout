import { describe, expect, it } from 'vitest';
import { runBot, type BotResult } from './bot';

let full: BotResult | null = null;
const campaign = () => (full ??= runBot({ seed: 1, maxMinutes: 180, endlessMinutes: 20, verbose: !!(globalThis as any).process?.env?.BOT_VERBOSE }));
const min = 60;

describe('headless campaign bot', () => {
  it('plays all five areas to the finale, then 20 minutes of Open Season', () => {
    const r = campaign();
    (globalThis as any).process?.stdout?.write?.(r.report + '\n');
    expect(r.finished).toBe(true);
    // Fast start: the opening loop (crate → stream → kettle → counter) thaws someone quickly.
    expect(r.firstThaw).toBeLessThan(40);
    expect(r.firstPad).toBeLessThan(90);
    // Area targets (bot pace; humans land at 2–3 h overall).
    expect(r.area1End).toBeGreaterThan(10 * min);
    expect(r.area1End).toBeLessThan(13 * min);
    expect(r.area2End - r.area1End).toBeGreaterThan(13 * min);
    expect(r.area2End - r.area1End).toBeLessThan(25 * min);
    expect(r.area3End - r.area2End).toBeGreaterThan(18 * min);
    expect(r.area3End - r.area2End).toBeLessThan(26 * min);
    expect(r.area4End - r.area3End).toBeGreaterThan(23 * min);
    expect(r.area4End - r.area3End).toBeLessThan(31 * min);
    expect(r.area5End - r.area4End).toBeGreaterThan(13 * min);
    expect(r.area5End - r.area4End).toBeLessThan(21 * min);
    expect(r.finaleDone).toBeGreaterThan(80 * min);
    expect(r.finaleDone).toBeLessThan(120 * min);
    // Never a dead stretch: an unlock or quest at least every ~3 minutes, and the arrow always has a target.
    expect(r.longestGap).toBeLessThan(200);
    expect(r.longestNoGuide).toBeLessThan(10);
  }, 120_000);

  it('keeps Open Season busy: orders, upgrades and decorations', () => {
    const r = campaign();
    expect(r.ordersDone).toBeGreaterThanOrEqual(10);
    expect(r.upgradesBought).toBeGreaterThanOrEqual(3);
    expect(r.decorations).toBeGreaterThanOrEqual(1);
    expect(r.sim.state.season).toBeGreaterThan(1);
    expect(r.sim.state.orders.length).toBe(3);
    expect(r.sim.state.totals.distance).toBeGreaterThan(1000);
  }, 120_000);

  it('is deterministic for a seed', () => {
    const a = runBot({ seed: 3, maxMinutes: 4 });
    const b = runBot({ seed: 3, maxMinutes: 4 });
    expect(a.sim.serialize()).toBe(b.sim.serialize());
  }, 60_000);
});
