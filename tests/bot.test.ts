import { describe, expect, it } from 'vitest';
import { runBot } from './bot';

describe('headless campaign bot', () => {
  it('plays Kettle Yard and Pinewood to the end of the available content', () => {
    const r = runBot({ seed: 1, maxMinutes: 60, verbose: !!(globalThis as any).process?.env?.BOT_VERBOSE });
    (globalThis as any).process?.stdout?.write?.(r.report + '\n');
    expect(r.finished).toBe(true);
    // Area 1 ≈ 10–15 min, Area 2 ≈ 20–25 min of (efficient) play.
    expect(r.area1End).toBeGreaterThan(7 * 60);
    expect(r.area1End).toBeLessThan(16 * 60);
    expect(r.area2End - r.area1End).toBeGreaterThan(14 * 60);
    expect(r.area2End - r.area1End).toBeLessThan(27 * 60);
    // Never a dead stretch: an unlock or quest at least every ~2.5 minutes (bot pace).
    expect(r.longestGap).toBeLessThan(170);
  }, 120_000);

  it('is deterministic for a seed', () => {
    const a = runBot({ seed: 3, maxMinutes: 4 });
    const b = runBot({ seed: 3, maxMinutes: 4 });
    expect(a.sim.serialize()).toBe(b.sim.serialize());
  }, 60_000);
});
