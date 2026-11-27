import { describe, expect, it } from 'vitest';
import { runBot } from './bot';
import { perturbed } from './perturb';

// Robustness (see robust-a): another seed on another perturbed layout.
describe('campaign robustness (b)', () => {
  it('completes for seed 3 on a randomly perturbed layout (tent plots dropped, decor solids moved/removed)', () => {
    const r = runBot({ seed: 3, maxMinutes: 150, endlessMinutes: 3, data: perturbed(3) });
    (globalThis as any).process?.stdout?.write?.('ROBUST b: ' + r.report.split('\n').slice(-3).join(' | ') + '\n');
    expect(r.finished).toBe(true);
    expect(r.finaleDone).toBeLessThan(130 * 60);
    expect(r.longestNoGuide).toBeLessThan(10);
    expect(r.ordersDone).toBeGreaterThan(0);
  }, 120_000);
});
