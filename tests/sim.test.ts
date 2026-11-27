import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data';
import type { GameData } from '../src/data';
import { decodeSaveCode, encodeSaveCode, Sim } from '../src/sim';
import type { CounterState, NodeState, PileState, ProcState } from '../src/sim';
import { moveCircle, navNext, pushOut } from '../src/sim/collision';

function fresh(seed = 1): Sim {
  return new Sim(GAME_DATA, { seed });
}

/** Walk the player to (x,z) by teleport-free stepping (uses setMove). */
function walkTo(sim: Sim, x: number, z: number, maxT = 20): void {
  for (let t = 0; t < maxT; t += 1 / 60) {
    const p = sim.state.player;
    const w = sim.navFromPlayer(x, z);
    const dx = w.x - p.x;
    const dz = w.z - p.z;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 0.3) break;
    const l = Math.hypot(dx, dz) || 1;
    sim.setMove(dx / l, dz / l);
    sim.step();
  }
  sim.setMove(0, 0);
  for (let i = 0; i < 20; i++) sim.step();
}

function stand(sim: Sim, seconds: number): void {
  sim.setMove(0, 0);
  sim.advance(seconds);
}

function tp(sim: Sim, x: number, z: number): void {
  const p = sim.state.player;
  p.x = p.px = x;
  p.z = p.pz = z;
  p.vx = p.vz = 0;
}

describe('collision', () => {
  it('pushes circles out of circles and boxes', () => {
    const p = { x: 0.1, z: 0 };
    pushOut(p, 0.5, [{ kind: 'circle', x: 0, z: 0, r: 1 }]);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(1.5, 3);
    const q = { x: 0, z: 0.2 };
    pushOut(q, 0.4, [{ kind: 'box', x: 0, z: 0, hw: 1, hd: 0.5 }]);
    expect(Math.abs(q.z)).toBeGreaterThanOrEqual(0.9 - 1e-6);
  });
  it('keeps movement inside walkable rects and slides along edges', () => {
    const p = { x: 0, z: 0 };
    const rects = [{ x0: -5, x1: 5, z0: -5, z1: 5 }];
    moveCircle(p, 10, 0.5, 0.5, [], rects);
    expect(p.x).toBeLessThanOrEqual(4.5);
    moveCircle(p, 1, 0.5, 0.5, [], rects);
    expect(p.z).toBeCloseTo(1.0, 3);
  });
  it('navigates through rect portals', () => {
    const rects = [
      { x0: 0, x1: 10, z0: 0, z1: 4 },
      { x0: 8, x1: 12, z0: 3, z1: 20 },
    ];
    const w = navNext(rects, 1, 2, 10, 18);
    expect(w.x).toBeGreaterThanOrEqual(8);
    expect(w.z).toBeLessThanOrEqual(4);
  });
  it('blocks the player at a closed frost wall', () => {
    const sim = fresh();
    tp(sim, -17, 0);
    sim.setMove(-1, 0);
    sim.advance(3);
    expect(sim.state.player.x).toBeGreaterThan(-19.5); // camp edge (Pinewood still closed)
  });
});

describe('carry stack + Pile + Processor', () => {
  it('picks fish from the crate up to capacity, LIFO', () => {
    const sim = fresh();
    const crate = sim.stationDefs.get('crateA')!;
    tp(sim, crate.x + 1.2, crate.z);
    stand(sim, 2);
    expect(sim.state.player.stack.length).toBe(sim.state.player.capacity);
    expect(sim.state.player.stack.every((i) => i === 'fish')).toBe(true);
    expect((sim.state.stations.crateA as PileState).count).toBeLessThan(14);
  });
  it('transfers at the fixed cadence (~10 items/s)', () => {
    const sim = fresh();
    const crate = sim.stationDefs.get('crateA')!;
    tp(sim, crate.x + 1.2, crate.z);
    sim.state.player.capacity = 40;
    (sim.state.stations.crateA as PileState).count = 14;
    stand(sim, 0.5);
    const n = sim.state.player.stack.length;
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(7);
  });
  it('kettle cooks fish into stew and the player picks it up', () => {
    const sim = fresh();
    sim.state.player.stack = ['fish', 'fish', 'fish'];
    const k = sim.stationDefs.get('kettleA')!;
    tp(sim, k.x + 1.3, k.z);
    stand(sim, 4);
    expect(sim.state.stats['craft.stew']).toBe(3);
    expect(sim.state.player.stack).toEqual(['stew', 'stew', 'stew']);
  });
  it('multi-input recipes wait for every input', () => {
    const data: GameData = {
      ...GAME_DATA,
      stations: [
        ...GAME_DATA.stations,
        {
          id: 'smoke', type: 'processor', area: 'camp', name: 'Smokehouse', model: 'smokehouse', x: 5, z: -3, reach: 1.8,
          recipe: 'smokedFish', inputCap: 10, outputCap: 10, operator: 'none',
        },
      ],
    };
    const sim = new Sim(data, { seed: 1 });
    sim.state.player.stack = ['fish', 'fish'];
    tp(sim, 5 + 1.2, -3);
    stand(sim, 3);
    expect((sim.state.stations.smoke as ProcState).inputs.fish).toBe(2);
    expect(sim.state.stats['craft.smokedFish'] ?? 0).toBe(0);
    sim.state.player.stack = ['log'];
    stand(sim, 3);
    expect(sim.state.stats['craft.smokedFish']).toBe(2);
  });
  it('a required operator gates a processor', () => {
    const data: GameData = {
      ...GAME_DATA,
      stations: [
        ...GAME_DATA.stations,
        {
          id: 'op', type: 'processor', area: 'camp', name: 'Op', model: 'forge', x: 5, z: -3, reach: 1.8,
          recipe: 'stew', inputCap: 10, outputCap: 10, operator: 'required',
        },
      ],
    };
    const sim = new Sim(data, { seed: 1 });
    (sim.state.stations.op as ProcState).inputs.fish = 3;
    tp(sim, 0, 5);
    stand(sim, 3);
    expect((sim.state.stations.op as ProcState).output).toBe(0);
    tp(sim, 5 + 1.2, -3);
    stand(sim, 0.3);
    expect((sim.state.stations.op as ProcState).progress).toBeGreaterThan(0);
  });
  it('pausing hands a full pack of fish back to the crate', () => {
    const sim = fresh();
    const crate = sim.stationDefs.get('crateA')!;
    (sim.state.stations.crateA as PileState).count = 2;
    sim.state.player.stack = Array(6).fill('fish');
    tp(sim, crate.x + 1.2, crate.z);
    stand(sim, 2);
    expect(sim.state.player.stack.length).toBeLessThan(6);
  });
});

describe('Counter + Icebound', () => {
  it('serves queued Icebound, thaws them, spawns embers and grows the camp', () => {
    const sim = fresh();
    const c = sim.stationDefs.get('counterA')!;
    sim.state.player.stack = ['stew', 'stew', 'stew'];
    tp(sim, c.x, c.z - 1.2);
    stand(sim, 3);
    expect(sim.state.stats.served).toBeGreaterThanOrEqual(3);
    const ev = sim.drainEvents();
    expect(ev.some((e) => e.type === 'thaw')).toBe(true);
    expect(sim.state.emberPiles.length + (sim.state.embers > 0 ? 1 : 0)).toBeGreaterThan(0);
    // Walk-to-camp then population.
    tp(sim, -4, 3);
    sim.advance(20);
    expect(sim.state.population).toBeGreaterThanOrEqual(3);
    expect(sim.drainEvents().some((e) => e.type === 'arrive')).toBe(true);
  });
  it('collects embers by proximity', () => {
    const sim = fresh();
    sim.addEmbers({ x: -3, z: 12.2 }, 25, 'test');
    tp(sim, -3, 12.6);
    stand(sim, 1);
    expect(sim.state.embers).toBe(25);
    expect(sim.state.emberPiles.find((e) => e.id === 'test')).toBeUndefined();
  });
  it('queues respect queueLen', () => {
    const sim = fresh();
    sim.advance(120);
    const q = (sim.state.stations.counterA as CounterState).queue.length;
    expect(q).toBeLessThanOrEqual((sim.stationDefs.get('counterA') as any).queueLen);
    expect(q).toBeGreaterThan(3);
  });
});

describe('Pads', () => {
  it('pays embers with acceleration and applies effects', () => {
    const sim = fresh();
    sim.state.embers = 100;
    const pad = sim.padDefs.get('pad_pack1')!;
    tp(sim, pad.x, pad.z);
    stand(sim, 3);
    expect(sim.state.pads.pad_pack1.done).toBe(true);
    expect(sim.state.player.capacity).toBe(9);
    expect(sim.state.embers).toBe(100 - pad.cost);
    expect(sim.state.pads.pad_kettleB.visible).toBe(true);
  });
  it('material pads need both embers and items', () => {
    const sim = fresh();
    sim.completePad('pad_hearth2');
    sim.completePad('pad_sawmill');
    sim.state.embers = 1000;
    const pad = sim.padDefs.get('pad_cabin1')!;
    tp(sim, pad.x + 0.5, pad.z + 0.5);
    stand(sim, 3);
    expect(sim.state.pads.pad_cabin1.done).toBe(false);
    expect(sim.state.pads.pad_cabin1.paid).toBe(pad.cost);
    sim.state.player.stack = Array(8).fill('plank');
    stand(sim, 2);
    expect(sim.state.pads.pad_cabin1.done).toBe(true);
    expect(sim.state.unlocked.cabin1).toBe(true);
  });
  it('population-gated pads do not take payment', () => {
    const sim = fresh();
    for (const id of ['pad_pack1', 'pad_kettleB', 'pad_counterB', 'pad_fisherYard']) sim.completePad(id);
    sim.state.embers = 1000;
    const pad = sim.padDefs.get('pad_porter')!;
    tp(sim, pad.x, pad.z);
    stand(sim, 2);
    expect(sim.state.pads.pad_porter.paid).toBe(0);
    sim.addPopulation(10);
    stand(sim, 3);
    expect(sim.state.pads.pad_porter.done).toBe(true);
    expect(sim.state.helpers.porter).toBeDefined();
  });
});

describe('Helpers + Links', () => {
  it('porter hauls fish from the crate into kettles', () => {
    const sim = fresh();
    sim.completePad('pad_kettleB');
    sim.applyEffect({ type: 'hire', helper: 'porter' });
    tp(sim, 0, 0);
    sim.advance(20);
    expect(sim.state.stats['deliver.kettleA'] ?? 0).toBeGreaterThan(3);
  });
  it('cook operates kettle B (boost)', () => {
    const sim = fresh();
    sim.applyEffect({ type: 'unlock', id: 'kettleB' });
    sim.applyEffect({ type: 'hire', helper: 'cook' });
    sim.advance(8);
    expect(sim.state.helpers.cook.phase).toBe('work');
    (sim.state.stations.kettleB as ProcState).inputs.fish = 8;
    tp(sim, 0, 0);
    sim.advance(1.5);
    expect((sim.state.stations.kettleB as ProcState).output).toBeGreaterThanOrEqual(3);
  });
  it('lumberjack chops pines and fills the woodpile', () => {
    const sim = fresh();
    sim.setHearth(2);
    sim.applyEffect({ type: 'unlock', id: 'woodpile' });
    sim.applyEffect({ type: 'hire', helper: 'lumberjack' });
    tp(sim, 0, 0);
    sim.advance(40);
    expect((sim.state.stations.woodpile as PileState).count).toBeGreaterThan(3);
  });
  it('conveyor moves stew from kettle to counter', () => {
    const sim = fresh();
    sim.applyEffect({ type: 'unlock', id: 'beltA' });
    (sim.state.stations.kettleA as ProcState).output = 5;
    tp(sim, 0, 0);
    sim.advance(8);
    expect(sim.state.stats['deliver.counterA'] ?? 0).toBeGreaterThanOrEqual(5);
  });
});

describe('Nodes, Hearth, warmth', () => {
  it('trees yield logs, fall, and regrow', () => {
    const sim = fresh();
    sim.setHearth(2);
    const pine = sim.data.stations.find((d) => d.type === 'node' && d.tag === 'pine')!;
    tp(sim, pine.x + 1.0, pine.z);
    stand(sim, 2);
    expect(sim.state.player.stack.filter((i) => i === 'log').length).toBe(3);
    expect((sim.state.stations[pine.id] as NodeState).alive).toBe(false);
    tp(sim, 0, 0);
    sim.advance(20);
    expect((sim.state.stations[pine.id] as NodeState).alive).toBe(true);
  });
  it('hearth levels open areas and logs make camp Cosy (double pay)', () => {
    const sim = fresh();
    expect(sim.state.areasOpen.pinewood).toBeFalsy();
    sim.completePad('pad_hearth2');
    expect(sim.state.hearth.level).toBe(2);
    expect(sim.state.areasOpen.pinewood).toBe(true);
    expect(sim.warmRadius()).toBeGreaterThan(sim.warmRadius(1));
    sim.state.player.stack = ['log', 'log'];
    tp(sim, 0, 2.2);
    stand(sim, 1);
    expect(sim.state.hearth.cosy).toBe(true);
    expect(sim.state.stats.fuel).toBe(2);
    // Cosy doubles pay.
    const before = sim.state.stats.embersEarned ?? 0;
    sim.state.player.stack = ['stew'];
    const c = sim.stationDefs.get('counterA')!;
    tp(sim, c.x, c.z - 1.2);
    stand(sim, 1.5);
    expect((sim.state.stats.embersEarned ?? 0) - before).toBe(2 * GAME_DATA.items.stew.price);
  });
});

describe('Quests + guidance', () => {
  it('starts at the tutorial and points at the crate', () => {
    const sim = fresh();
    expect(sim.questProgress().id).toBe('q_fish');
    const g = sim.guide()!;
    expect(g.id).toBe('crateA');
  });
  it('the guide arrow leads through the tutorial loop', () => {
    const sim = fresh();
    for (let i = 0; i < 60 * 40 && sim.state.quest.index < 3; i++) {
      const g = sim.guide();
      if (g) {
        const p = sim.state.player;
        const w = sim.navFromPlayer(g.x, g.z);
        const d = Math.hypot(g.x - p.x, g.z - p.z);
        if (d > g.reach) {
          const l = Math.hypot(w.x - p.x, w.z - p.z) || 1;
          sim.setMove((w.x - p.x) / l, (w.z - p.z) / l);
        } else sim.setMove(0, 0);
      }
      sim.step();
    }
    expect(sim.state.quest.index).toBeGreaterThanOrEqual(3);
  });
  it('quest rewards are paid', () => {
    const sim = fresh();
    sim.skipQuest();
    sim.skipQuest();
    sim.skipQuest();
    const before = sim.state.embers;
    sim.skipQuest(); // q_serve3 has a reward
    expect(sim.state.embers).toBeGreaterThan(before);
  });
});

describe('save / load', () => {
  it('round-trips state exactly and keeps simulating identically', () => {
    const a = fresh(5);
    a.setMove(0.5, -0.5);
    a.advance(10);
    const json = a.serialize();
    const b = new Sim(GAME_DATA, { save: json });
    expect(b.serialize()).toBe(json);
    a.advance(5);
    b.setMove(0.5, -0.5);
    b.advance(5);
    expect(b.serialize()).toBe(a.serialize());
  });
  it('save codes encode/decode', () => {
    const a = fresh();
    a.advance(3);
    const code = encodeSaveCode(a.serialize());
    expect(code.startsWith('FK1:')).toBe(true);
    expect(decodeSaveCode(code)).toBe(a.serialize());
  });
  it('fills in state for content added after the save was made', () => {
    const a = fresh();
    const raw = JSON.parse(a.serialize());
    delete raw.state.stations.sawmill;
    delete raw.state.pads.pad_hearth3;
    const b = new Sim(GAME_DATA, { save: JSON.stringify(raw) });
    expect(b.state.stations.sawmill).toBeDefined();
    expect(b.state.pads.pad_hearth3).toBeDefined();
  });
  it('rejects garbage and newer versions', () => {
    expect(() => new Sim(GAME_DATA, { save: '{"nope":1}' })).toThrow();
    const a = fresh();
    const raw = JSON.parse(a.serialize());
    raw.v = 999;
    expect(() => new Sim(GAME_DATA, { save: JSON.stringify(raw) })).toThrow();
  });
});

void walkTo;

describe('no soft-locks', () => {
  /** Build the reported deadlock: pack full of fish, kettles full in and out, crate full. */
  function deadlock(): Sim {
    const sim = fresh();
    sim.completePad('pad_pack1');
    sim.completePad('pad_kettleB');
    for (const id of ['kettleA', 'kettleB']) {
      const st = sim.state.stations[id] as ProcState;
      st.inputs.fish = 10;
      st.output = 60;
    }
    (sim.state.stations.crateA as PileState).count = 14;
    sim.state.player.stack = Array(sim.state.player.capacity).fill('fish');
    return sim;
  }

  it('the player can always drop fish into a full kettle', () => {
    const sim = deadlock();
    const k = sim.stationDefs.get('kettleA')!;
    tp(sim, k.x + 1.3, k.z);
    stand(sim, 2);
    expect(sim.state.player.stack.filter((i) => i === 'fish').length).toBe(0);
    expect((sim.state.stations.kettleA as ProcState).inputs.fish).toBeGreaterThan(10);
  });

  it('a full pack of fish can always be handed back to a full crate', () => {
    const sim = deadlock();
    const c = sim.stationDefs.get('crateA')!;
    tp(sim, c.x + 1.2, c.z);
    stand(sim, 2);
    expect(sim.state.player.stack.length).toBe(0);
    expect((sim.state.stations.crateA as PileState).count).toBeGreaterThan(14);
  });

  it('the guide arrow points somewhere the fish can actually go', () => {
    const sim = deadlock();
    tp(sim, 0, 14);
    const g = sim.guide()!;
    expect(g).toBeTruthy();
    expect(sim.room(g.id, 'fish') > 0 || sim.stationDefs.get(g.id)?.type === 'pile').toBe(true);
  });

  it('helpers still respect soft caps', () => {
    const sim = deadlock();
    expect(sim.room('kettleA', 'fish', true)).toBe(0);
    expect(sim.room('kettleA', 'fish')).toBeGreaterThan(0);
  });

  it('property: random play in Area 1 always leaves a useful action', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const sim = fresh(seed);
      sim.completePad('pad_pack1');
      sim.completePad('pad_kettleB');
      sim.completePad('pad_counterB');
      const ids = ['crateA', 'kettleA', 'kettleB', 'counterA', 'counterB'];
      let r = seed * 7919;
      const rnd = () => ((r = (r * 48271) % 2147483647) / 2147483647);
      for (let k = 0; k < 120; k++) {
        const d = sim.stationDefs.get(ids[Math.floor(rnd() * ids.length)])!;
        tp(sim, d.x + (rnd() - 0.5) * 2.4, d.z + (d.type === 'counter' ? -1.3 : 1.3));
        stand(sim, 0.2 + rnd() * 1.5);
        const p = sim.state.player;
        // Useful action: some carried item can be dropped somewhere, or something can be picked up.
        const canDrop = p.stack.some((it) => sim.data.stations.some((s) => sim.isUsable(s.id) && sim.room(s.id, it) > 0));
        const canPick = p.stack.length < p.capacity && sim.data.stations.some((s) => sim.isUsable(s.id) && !!sim.takeable(s.id));
        expect(canDrop || canPick || p.stack.length === 0).toBe(true);
      }
    }
  }, 30_000);
});

describe('hearth fuel', () => {
  it('stays Cosy without flicker while logs are queued', () => {
    const sim = new Sim(GAME_DATA, { seed: 1 });
    const st = sim.state.stations['hearth'] as unknown as { count: number };
    st.count = 3;
    sim.drainEvents();
    let toggles = 0;
    const dt = 1 / 60;
    const total = Math.ceil((GAME_DATA.balance.fuelPerLog * 3 + 2) / dt);
    for (let i = 0; i < total; i++) {
      sim.step(dt);
      for (const e of sim.drainEvents()) if (e.type === 'cosy') toggles++;
    }
    // One switch on when the first log catches, one off when the last burns out.
    expect(toggles).toBe(2);
  });
});

describe('save code import is forgiving', () => {
  const sim = new Sim(GAME_DATA, { seed: 5 });
  for (let i = 0; i < 600; i++) sim.step(1 / 60);
  const json = sim.serialize();
  const code = encodeSaveCode(json);
  const body = code.slice(4);
  const cases: Record<string, string> = {
    'as exported': code,
    'wrapped in line breaks and spaces': code.replace(/(.{40})/g, '$1\n  '),
    'with non-breaking and zero-width spaces': '\u00a0' + code.replace(/(.{25})/g, '$1\u200b') + '\u00a0\ufeff',
    'without the prefix': body,
    'without trailing padding': code.replace(/=+$/, ''),
    'url-safe alphabet': 'FK1:' + body.replace(/\+/g, '-').replace(/\//g, '_'),
    'with text around it': 'My save code: ' + code + '\n',
    'with smart quotes around it': '\u201c' + code + '\u201d',
  };
  for (const [name, input] of Object.entries(cases)) {
    it(name, () => {
      expect(decodeSaveCode(input)).toBe(json);
      expect(() => new Sim(GAME_DATA, { save: decodeSaveCode(input) })).not.toThrow();
    });
  }
  it('rejects junk with a friendly message', () => {
    expect(() => decodeSaveCode('hello')).toThrow(/save code/);
    expect(() => decodeSaveCode('FK1:!!!!')).toThrow(/save code/);
  });
});
