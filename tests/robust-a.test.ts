import { describe, expect, it } from 'vitest';
import { runBot } from './bot';
import { perturbed } from './perturb';

// Robustness: the campaign must not depend on one exact layout or seed (a stall here is a stall for a player).
// Split over two files so they run in parallel with the main bot test.
describe('campaign robustness (a)', () => {
  it('completes for seed 2 on a randomly perturbed layout (tent plots dropped, decor solids moved/removed)', () => {
    const r = runBot({ seed: 2, maxMinutes: 150, endlessMinutes: 3, data: perturbed(2) });
    (globalThis as any).process?.stdout?.write?.('ROBUST a: ' + r.report.split('\n').slice(-3).join(' | ') + '\n');
    expect(r.finished).toBe(true);
    expect(r.finaleDone).toBeLessThan(130 * 60);
    expect(r.longestNoGuide).toBeLessThan(10);
    expect(r.longestGap).toBeLessThan(300);
    expect(r.ordersDone).toBeGreaterThan(0);
  }, 120_000);
});
