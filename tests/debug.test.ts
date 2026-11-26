import { it } from 'vitest';
import { GAME_DATA } from '../src/data';
import { Autopilot, Sim, STEP } from '../src/sim';
it('debug', () => {
  const sim = new Sim(GAME_DATA, { seed: 1 });
  const bot = new Autopilot();
  const out: string[] = [];
  while (sim.state.time < 860) {
    bot.update(sim, STEP); sim.step(STEP);
    for (const e of sim.drainEvents()) {
      if (sim.state.time > 780 && e.type === 'pickup' && e.by.kind === 'player') {
        const p = sim.state.player;
        out.push([sim.state.time.toFixed(1), e.item, JSON.stringify(e.from), p.x.toFixed(1), p.z.toFixed(1), sim.state.quest.index, JSON.stringify(sim.guide()), p.stack.length].join(' '));
      }
    }
  }
  require('fs').writeFileSync('/tmp/claude-0/-home-user-Whiteout/63908f3c-30c8-5472-9ceb-e9951c67ef65/scratchpad/dbg.txt', out.join('\n'));
});
