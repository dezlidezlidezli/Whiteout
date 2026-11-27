// Housing made legible: homes used/capacity, the next home, throttled "build more homes", and the
// explanation for a long-time save whose population was re-housed by the v2 -> v3 migration.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data';
import { ackRehoused, housingInfo, HOMES_FULL_EVERY, Sim } from '../src/sim';

const fresh = () => new Sim(GAME_DATA, { seed: 1 });

describe('housing for the HUD', () => {
  it('reports homes used and capacity, and a free tent as the next home while tents are allowed', () => {
    const sim = fresh();
    const h = housingInfo(sim);
    expect(h.used).toBe(sim.state.population);
    expect(h.capacity).toBe(sim.housingCap());
    expect(h.free).toBe(h.capacity - h.used);
    expect(h.tentsMax).toBe(16);
    expect(h.next).toMatchObject({ kind: 'tent', free: true });
  });

  it('when the tents for this Hearth level are up, names the cabin or Hearth pad to build, with its cost', () => {
    const sim = fresh();
    const allowed = housingInfo(sim).tentsAllowed;
    sim.state.tents = allowed;
    const h = housingInfo(sim);
    expect(h.next && h.next.kind).not.toBe('tent');
    if (h.next && h.next.kind !== 'tent') {
      expect(GAME_DATA.pads.some((p) => p.id === (h.next as { pad: string }).pad)).toBe(true);
      expect(h.next.embers).toBeGreaterThan(0);
      expect(h.next.homes).toBeGreaterThan(0);
    }
  });

  it('turned-away villagers raise a throttled homesFull event and are counted for the lifetime totals', () => {
    const sim = fresh();
    sim.state.tents = housingInfo(sim).tentsAllowed;
    sim.state.population = sim.housingCap();
    sim.drainEvents();
    for (let i = 0; i < 5; i++) expect(sim.welcome()).toBe(false);
    let ev = sim.drainEvents().filter((e) => e.type === 'homesFull');
    expect(ev).toHaveLength(1);
    sim.advance(1);
    sim.welcome();
    expect(sim.drainEvents().filter((e) => e.type === 'homesFull')).toHaveLength(0);
    sim.state.time += HOMES_FULL_EVERY;
    sim.welcome();
    ev = sim.drainEvents().filter((e) => e.type === 'homesFull');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ turnedAway: 6 });
    expect(housingInfo(sim).passedThrough).toBeGreaterThanOrEqual(7);
  });

  it('a long-time v2 save capped by the migration keeps its lifetime total and explains the drop once', () => {
    const a = fresh();
    a.state.population = 4200;
    a.state.stats.thawed = 4300;
    const raw = JSON.parse(a.serialize());
    raw.v = 2;
    raw.state.version = 2;
    const b = new Sim(GAME_DATA, { save: JSON.stringify(raw) });
    const h = housingInfo(b);
    expect(h.used).toBeLessThan(4200);
    expect(h.rehoused).toEqual({ from: 4200, to: h.used });
    expect(h.lifetimeThawed).toBe(4300);
    expect(h.passedThrough).toBeGreaterThanOrEqual(4200 - h.used);
    ackRehoused(b);
    expect(housingInfo(b).rehoused).toBeNull();
    // Survives a save/load round trip without re-appearing.
    expect(housingInfo(new Sim(GAME_DATA, { save: b.serialize() })).rehoused).toBeNull();
  });
});

describe('housed never exceeds capacity', () => {
  it('a save that already houses more villagers than its homes keeps them, and capacity reads at least that', async () => {
    const { GAME_DATA } = await import('../src/data');
    const { Sim } = await import('../src/sim');
    const a = new Sim(GAME_DATA, { seed: 3 });
    for (let i = 0; i < 120; i++) a.step(1 / 60);
    const raw = JSON.parse(a.serialize());
    raw.state.population = 162; // more than any early camp can house
    const b = new Sim(GAME_DATA, { save: JSON.stringify(raw) });
    expect(b.state.population).toBe(162);
    expect(b.housingCap()).toBeGreaterThanOrEqual(162);
  });
});
