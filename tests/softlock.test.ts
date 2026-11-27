// No soft-locks, in every combination of the five mechanics and in Open Season: from awkward random states
// (holding the flame with a full or empty pack, followers waiting in the cold, skating with a full pack,
// standing on a crank ring with a stack, next to a bin, ...) the autopilot, which follows only the guide,
// always finds a useful action and makes progress.
import { describe, expect, it } from 'vitest';
import { GAME_DATA, MECHANIC_IDS, withMechanics } from '../src/data';
import type { GameData, ItemKind, MechanicFlags } from '../src/data';
import { Autopilot, Sim } from '../src/sim';
import { inRects, pushOut } from '../src/sim/collision';
import { startFinale } from '../src/sim/finale';

const COMBOS: MechanicFlags[] = [];
for (let m = 0; m < 1 << MECHANIC_IDS.length; m++) {
  const f = {} as MechanicFlags;
  MECHANIC_IDS.forEach((id, i) => (f[id] = !!(m & (1 << i))));
  COMBOS.push(f);
}
const CHECKPOINTS = ['pad_woodbelt', 'pad_lakeCounterA', 'pad_forge', 'pad_beacon3', 'openSeason'] as const;

function rng(seed: number) {
  let r = seed * 7919 + 13;
  return () => (r = (r * 48271) % 2147483647) / 2147483647;
}

function setUp(d: GameData, at: (typeof CHECKPOINTS)[number], seed: number): Sim {
  const sim = new Sim(d, { seed });
  for (const p of d.pads) {
    if (p.group) continue;
    if (at !== 'openSeason' && p.id === at) {
      sim.completePad(p.id);
      break;
    }
    sim.completePad(p.id);
  }
  if (at === 'openSeason') {
    startFinale(sim);
    sim.advance(d.finale.lightingTime + d.finale.dawnTime + 0.5);
  }
  // Re-anchor the quest chain to the checkpoint (completing pads skips their quests).
  sim.advance(0.5);
  return sim;
}

function scramble(sim: Sim, rnd: () => number): string {
  const d = sim.data;
  const m = d.mech;
  const p = sim.state.player;
  // Teleport to the nearest walkable, unobstructed spot around (x, z) (never inside a wall or a building).
  const tp = (x: number, z: number) => {
    const rects = sim.walkRects();
    const solids = sim.allSolids();
    for (let ring = 0; ring < 12; ring++) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const q = { x: x + Math.cos(a) * ring * 0.5, z: z + Math.sin(a) * ring * 0.5 };
        const before = { ...q };
        pushOut(q, 0.45, solids);
        if (Math.hypot(q.x - before.x, q.z - before.z) < 1e-6 && inRects(q.x, q.z, 0.45, rects)) {
          p.x = p.px = q.x;
          p.z = p.pz = q.z;
          p.vx = p.vz = 0;
          return;
        }
        if (ring === 0) break;
      }
    }
  };
  const items: ItemKind[] = ['plank', 'ingot', 'fish', 'stew', 'log', 'ore', 'smokedFish', 'feast'];
  const fill = (n: number) => (p.stack = Array.from({ length: n }, () => items[Math.floor(rnd() * items.length)]));
  const opts: (() => string)[] = [
    () => (fill(p.capacity), 'full pack at the Hearth'),
    () => {
      const bins = d.stations.filter((s) => s.type === 'shelf' && sim.isUsable(s.id));
      const b = bins[Math.floor(rnd() * bins.length)];
      if (b) tp(b.x + 1.2, b.z);
      fill(Math.floor(rnd() * p.capacity));
      return 'by a bin with a random pack';
    },
  ];
  if (d.mechanics.flame) {
    opts.push(() => {
      sim.state.flame.held = true;
      sim.state.flame.level = 0.2 + rnd() * 0.8;
      fill(rnd() < 0.5 ? p.capacity : 0);
      const open = m.braziers.filter((x) => sim.state.areasOpen[x.area]);
      const b = open[Math.floor(rnd() * open.length)] ?? { x: d.camp.hearth.x + 2, z: d.camp.hearth.z };
      tp(b.x + 1.5, b.z + 1.5);
      return 'holding the flame';
    });
  }
  if (d.mechanics.rescue && m.villagers.length) {
    opts.push(() => {
      const r = sim.state.rescue;
      r.lantern = Math.max(1, r.lantern);
      const free = m.villagers.filter((v) => !r.status[v.id] && sim.state.areasOpen[v.area]);
      for (const v of free.slice(0, 2)) {
        r.status[v.id] = 'waiting';
        r.pos[v.id] = { x: v.x, z: v.z };
      }
      fill(Math.floor(rnd() * p.capacity));
      return 'followers waiting in the cold';
    });
  }
  if (d.mechanics.skate && m.skateLane.length && sim.state.areasOpen.frozenLake) {
    opts.push(() => {
      tp(m.skateLane[0].x, m.skateLane[0].z);
      p.vx = 4;
      fill(p.capacity);
      return 'skating with a full pack';
    });
  }
  if (d.mechanics.crank && m.cranks.length && sim.state.areasOpen.ironridge) {
    opts.push(() => {
      const c = m.cranks[Math.floor(rnd() * m.cranks.length)];
      tp(c.x + (c.inner + c.outer) / 2, c.z);
      fill(1 + Math.floor(rnd() * (p.capacity - 1)));
      return 'on a crank ring with a stack';
    });
  }
  const zones = m.deepSnow.filter((z) => sim.state.areasOpen[z.area]);
  if (d.mechanics.plough && zones.length) {
    opts.push(() => {
      const z = zones[Math.floor(rnd() * zones.length)];
      tp(z.x0 + 1, z.z0 + 1);
      fill(Math.floor(rnd() * p.capacity));
      return 'in deep snow';
    });
  }
  return opts[Math.floor(rnd() * opts.length)]();
}

/** Something the player did: quest moved on, a pad got paid, an order filled, or the pack changed. */
function progressKey(sim: Sim): string {
  const q = sim.questProgress();
  const paid = Object.values(sim.state.pads).reduce((a, p) => a + (p.paid ?? 0) + Object.values(p.mats ?? {}).reduce((x, y) => x + (y ?? 0), 0) + (p.done ? 1e6 : 0), 0);
  return `${q.index}:${q.cur}:${paid}:${sim.state.stats.ordersDone ?? 0}:${sim.state.stats.fuel ?? 0}`;
}

describe('never soft-locked, any mechanics, any stage', () => {
  it('from awkward random states the guide always has a target and the autopilot makes progress', () => {
    let runs = 0;
    COMBOS.forEach((flags, ci) => {
      const d = withMechanics(GAME_DATA, flags);
      const rnd = rng(ci + 1);
      // Each combination visits two of the checkpoints (all of them across the combinations).
      for (const at of [CHECKPOINTS[ci % CHECKPOINTS.length], CHECKPOINTS[(ci * 3 + 2) % CHECKPOINTS.length]]) {
        const sim = setUp(d, at, ci + 1);
        const what = scramble(sim, rnd);
        const bot = new Autopilot();
        const start = progressKey(sim);
        const packs = new Set<string>([sim.state.player.stack.join()]);
        let noGuide = 0;
        let worst = 0;
        for (let i = 0; i < 60 * 40; i++) {
          bot.update(sim, 1 / 60);
          sim.step();
          if (i % 30 === 0) {
            noGuide = !sim.guide() && !sim.questProgress().final ? noGuide + 0.5 : 0;
            worst = Math.max(worst, noGuide);
            packs.add(sim.state.player.stack.join());
          }
        }
        const label = `${JSON.stringify(flags)} at ${at}: ${what}`;
        const info = `q=${sim.questProgress().id} ${sim.questProgress().cur}/${sim.questProgress().max} stack=${sim.state.player.stack.join()} at ${sim.state.player.x.toFixed(1)},${sim.state.player.z.toFixed(1)} guide=${sim.guide()?.id}`;
        // Never more than a few seconds in a row without an arrow (the bot test's limit is 10 s).
        expect(worst, `${label}: no guide (${info})`).toBeLessThan(5);
        expect(progressKey(sim) !== start || packs.size >= 3, `${label}: no progress (${info})`).toBe(true);
        runs++;
      }
    });
    expect(runs).toBe(64);
  }, 120_000);
});
