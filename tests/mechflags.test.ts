// Per-mechanic switches: the shipped data has every signature mechanic off (the view does not draw them yet);
// withMechanics() turns any of them on. Every configuration must be self-consistent and saves must move freely.
import { describe, expect, it } from 'vitest';
import { ALL_MECHANICS, GAME_DATA, MECHANIC_IDS, NO_MECHANICS, withMechanics } from '../src/data';

const OFF = withMechanics(GAME_DATA, NO_MECHANICS);
import type { GameData } from '../src/data';
import { Sim } from '../src/sim';

const ON = withMechanics(OFF, ALL_MECHANICS);
const configs: [string, GameData][] = [
  ['all off', OFF],
  ['shipped', GAME_DATA],
  ['all on', ON],
  ...MECHANIC_IDS.map((m): [string, GameData] => [`${m} only`, withMechanics(OFF, { [m]: true })]),
  ...MECHANIC_IDS.map((m): [string, GameData] => [`all but ${m}`, withMechanics(OFF, { ...ALL_MECHANICS, [m]: false })]),
];

function tp(sim: Sim, x: number, z: number): void {
  const p = sim.state.player;
  p.x = p.px = x;
  p.z = p.pz = z;
  p.vx = p.vz = 0;
}
function walk(sim: Sim, dx: number, dz: number, s: number): void {
  sim.setMove(dx, dz);
  sim.advance(s);
  sim.setMove(0, 0);
}

describe('mechanic switches', () => {
  it('ships with every mechanic off and nothing of them in the data the view iterates', () => {
    expect(OFF.mechanics).toEqual({ plough: false, rescue: false, skate: false, crank: false, flame: false });
    const models = new Set(OFF.decor.map((d) => d.model));
    for (const m of ['capstan', 'mineLift', 'trailBrazier', 'windGap', 'gripMat', 'festivalLamp', 'foundBoard', 'monument', 'statue', 'iceSculpture']) {
      expect(models.has(m), m).toBe(false);
    }
    expect(OFF.decor.some((d) => /^peakRock|^brazier/.test(d.id))).toBe(false);
    expect(OFF.stations.some((s) => ['shaftPile', 'crateFindPine', 'crateFindLake'].includes(s.id))).toBe(false);
    expect(OFF.pads.some((p) => p.effects.some((e) => e.type === 'grant'))).toBe(false);
    expect(OFF.helpers.some((h) => h.role === 'crank')).toBe(false);
    const m = OFF.mech;
    for (const a of [m.deepSnow, m.finds, m.villagers, m.ice, m.gripMats, m.cranks, m.braziers, m.windGaps, m.festivalLamps]) expect(a).toHaveLength(0);
    for (const q of ['q_plough', 'q_ploughLot', 'q_lantern', 'q_rescue', 'q_skate', 'q_pump', 'q_lift', 'q_trail', 'q_lightBeacon', 'q_bellows', 'q_mineLift', 'q_winder']) {
      expect(OFF.quests.some((x) => x.id === q), q).toBe(false);
    }
    // Widening again from the shipped data gives everything back.
    expect(ON.mechanics).toEqual(ALL_MECHANICS);
    expect(ON.pads.length).toBeGreaterThan(OFF.pads.length);
    expect(withMechanics(withMechanics(OFF, { skate: true }), ALL_MECHANICS).decor.length).toBe(ON.decor.length);
  });

  it('every configuration is self-consistent (requirements, unlocks, quest goals, guides, routes)', () => {
    for (const [name, d] of configs) {
      const pads = new Set(d.pads.map((p) => p.id));
      const ids = new Set([...d.stations.map((s) => s.id), ...d.decor.map((x) => x.id), ...d.helpers.map((h) => h.id), ...d.links.map((l) => l.id), ...pads]);
      for (const p of d.pads) {
        for (const r of p.requires ?? []) expect(pads.has(r), `${name}: ${p.id} requires ${r}`).toBe(true);
        for (const e of p.effects) if (e.type === 'unlock') expect(ids.has(e.id), `${name}: ${p.id} unlocks ${e.id}`).toBe(true);
      }
      for (const q of d.quests) {
        if (q.goal.type === 'pad') expect(pads.has(q.goal.pad), `${name}: ${q.id}`).toBe(true);
        const g = q.guide as { pad?: string } | undefined;
        if (g?.pad) expect(pads.has(g.pad), `${name}: ${q.id} guide`).toBe(true);
      }
      for (const l of d.links) expect(ids.has(l.from) && ids.has(l.to), `${name}: link ${l.id}`).toBe(true);
      for (const h of d.helpers) {
        for (const s of [...(h.from ?? []), ...(h.to ?? []), ...(h.station ? [h.station] : [])]) expect(ids.has(s), `${name}: ${h.id} -> ${s}`).toBe(true);
      }
      // Placement is shared, so tents and buildings never move between configurations.
      expect(d.camp.tentSpots, name).toEqual(ON.camp.tentSpots);
    }
  });

  it('a disabled mechanic is inert: no deep-snow slowdown, no ice momentum, the finished Beacon lights itself', () => {
    const sim = new Sim(OFF, { seed: 1 });
    for (const p of OFF.pads) if (!p.group) sim.completePad(p.id);
    const z = ON.mech.deepSnow.find((d) => d.id === 'dsPine')!;
    tp(sim, (z.x0 + z.x1) / 2, z.z0 + 1);
    walk(sim, 0, 1, 1);
    expect(sim.state.player.z - (z.z0 + 1)).toBeGreaterThan(OFF.balance.playerSpeed * 0.7);
    // On the lake ice the player stops just as on snow (no glide).
    const coast = (x: number, zz: number) => {
      tp(sim, x, zz);
      walk(sim, 1, 0, 1);
      const x0 = sim.state.player.x;
      sim.advance(1);
      return sim.state.player.x - x0;
    };
    const ice = ON.mech.ice[0];
    expect(coast(ice.x0 + 2, (ice.z0 + ice.z1) / 2)).toBeLessThan(0.6);
    expect(sim.state.skate.on).toBe(false);
    sim.advance(1);
    expect(sim.state.beacon).toBe(4);
    expect(sim.state.finale.phase).not.toBe('none');
  });

  it('with the flame on, the finished Beacon waits for the carried flame', () => {
    const sim = new Sim(ON, { seed: 1 });
    for (const p of ON.pads) if (!p.group) sim.completePad(p.id);
    sim.advance(1);
    expect(sim.state.beacon).toBe(4);
    expect(sim.state.finale.phase).toBe('none');
  });

  it('saves move freely between configurations', () => {
    // Made with everything on, stopped on a mechanic quest, carrying the flame and on skates...
    const on = new Sim(ON, { seed: 5 });
    for (const p of ON.pads) {
      if (p.group) continue;
      on.completePad(p.id);
      if (p.id === 'pad_lakeCounterA') break;
    }
    const qi = ON.quests.findIndex((q) => q.id === 'q_skate');
    on.state.quest.index = qi;
    on.state.quest.id = 'q_skate';
    on.state.flame.held = true;
    on.state.skate.on = true;
    // ...loads with everything off on the next quest that exists, empty-handed, and runs on.
    const off = new Sim(OFF, { save: on.serialize() });
    const next = ON.quests.slice(qi + 1).find((q) => OFF.quests.some((x) => x.id === q.id))!;
    expect(off.questProgress().id).toBe(next.id);
    expect(off.state.flame.held).toBe(false);
    expect(off.state.skate.on).toBe(false);
    off.advance(5);
    expect(off.guide()).not.toBeNull();
    // And back again: a save made with everything off loads with everything on.
    const back = new Sim(ON, { save: off.serialize() });
    expect(back.questProgress().id).toBe(next.id);
    back.advance(5);
    expect(back.guide()).not.toBeNull();
  });
});
