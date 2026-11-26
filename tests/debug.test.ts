import { it } from 'vitest';
import { GAME_DATA } from '../src/data';
import { Autopilot, Sim, STEP } from '../src/sim';
it('debug', () => {
  const sim = new Sim(GAME_DATA, { seed: 1 });
  const bot = new Autopilot();
  const out: string[] = [];
  let lastQ = 0, lastT = 0;
  while (sim.state.time < 3600) {
    bot.update(sim, STEP); sim.step(STEP); sim.drainEvents();
    if (sim.state.quest.index !== lastQ) { lastQ = sim.state.quest.index; lastT = sim.state.time; }
    const stall = sim.state.time - lastT;
    if (stall > 100 && sim.state.tick % 30 === 0) {
      const p = sim.state.player;
      out.push([sim.state.time.toFixed(1), 'q' + lastQ, p.x.toFixed(1), p.z.toFixed(1), 'emb', sim.state.embers, JSON.stringify(sim.guide()), p.stack.join(','), JSON.stringify(sim.getMove()), p.onPad].join(' '));
      if (stall > 130) break;
    }
  }
  require('fs').writeFileSync('/tmp/claude-0/-home-user-Whiteout/63908f3c-30c8-5472-9ceb-e9951c67ef65/scratchpad/dbg.txt', out.join('\n'));
});
