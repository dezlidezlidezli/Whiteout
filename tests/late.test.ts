// Unit tests for the late campaign (Frozen Lake, Ironridge, Beacon Peak), the finale, Open Season,
// sled-dog couriers, spare shelves, the soft-cap (never soft-lock) rule, dressing data and save migration.

import { describe, expect, it } from 'vitest';
import { GAME_DATA, ITEM_KINDS, wallSolids } from '../src/data';
import type { CounterDef, ItemKind, Vec2 } from '../src/data';
import { Sim } from '../src/sim';
import type { CounterState, NodeState, PileState, ProcState } from '../src/sim';
import { queueSlotPos } from '../src/sim/agents';
import { inRects } from '../src/sim/collision';
import { buildReach } from './reach';

const fresh = (seed = 1) => new Sim(GAME_DATA, { seed });
function tp(sim: Sim, x: number, z: number): void {
  const p = sim.state.player;
  p.x = p.px = x;
  p.z = p.pz = z;
  p.vx = p.vz = 0;
}
const stand = (sim: Sim, s: number) => {
  sim.setMove(0, 0);
  sim.advance(s);
};
/** Fast-forward through the campaign by completing pads (no walking). */
function unlockTo(sim: Sim, lastPad: string): void {
  for (const p of GAME_DATA.pads) {
    if (p.group) continue;
    sim.completePad(p.id);
    if (p.id === lastPad) break;
  }
}

/** Trail of Light lit, then carry a flame to the finished Beacon's crown (starts the finale). */
function lightBeacon(sim: Sim): void {
  for (const b of GAME_DATA.mech.braziers) if (b.kind === 'trail') sim.state.flame.lit[b.id] = true;
  sim.state.player.stack = [];
  sim.state.flame.held = true;
  sim.state.flame.level = 1;
  const m = GAME_DATA.mech.beacon;
  tp(sim, m.x, m.z + 2.8);
  sim.step();
}

describe('Kettle Yard stream fishing', () => {
  it('starts with a small crate stock and fishing holes that yield a couple per hit', () => {
    const sim = fresh();
    expect((sim.state.stations.crateA as PileState).count).toBe(6);
    expect(sim.questProgress().id).toBe('q_fish');
    const hole = sim.stationDefs.get('streamHole0')!;
    tp(sim, hole.x + 1.0, hole.z);
    stand(sim, 1);
    expect(sim.state.player.stack.filter((i) => i === 'fish').length).toBeGreaterThanOrEqual(4);
    // The crate never refills on its own.
    (sim.state.stations.crateA as PileState).count = 0;
    sim.advance(10);
    expect((sim.state.stations.crateA as PileState).count).toBe(0);
  });
  it('the yard fisher fishes the stream into the crate', () => {
    const sim = fresh();
    (sim.state.stations.crateA as PileState).count = 0;
    sim.applyEffect({ type: 'hire', helper: 'yardFisher' });
    tp(sim, 0, 0);
    sim.advance(30);
    expect((sim.state.stations.crateA as PileState).count).toBeGreaterThan(3);
  });
});

describe('Frozen Lake', () => {
  it('ice holes give fish in bulk, the smokehouse needs fish AND logs, smoked fish pays more', () => {
    const sim = fresh();
    unlockTo(sim, 'pad_smokehouseA');
    const hole = sim.stationDefs.get('hole4')!;
    tp(sim, hole.x + 1.0, hole.z);
    stand(sim, 0.6);
    expect(sim.state.player.stack.length).toBeGreaterThanOrEqual(3);
    const sh = sim.stationDefs.get('smokehouseA')!;
    sim.state.player.stack = ['fish', 'fish', 'fish', 'fish'];
    tp(sim, sh.x, sh.z - 1.6);
    stand(sim, 3);
    expect(sim.state.stats['craft.smokedFish'] ?? 0).toBe(0);
    sim.state.player.stack = ['log', 'log'];
    stand(sim, 6);
    expect(sim.state.stats['craft.smokedFish']).toBeGreaterThanOrEqual(2);
    expect(sim.dishPrice('smokedFish')).toBeGreaterThan(sim.dishPrice('stew'));
  });
  it('a crowd counter opens with a big standing crowd that snakes out beyond the palisade', () => {
    const sim = fresh();
    unlockTo(sim, 'pad_lakeCounterA');
    const c = sim.stationDefs.get('lakeCounterA') as CounterDef;
    expect((sim.state.stations.lakeCounterA as CounterState).queue.length).toBeGreaterThanOrEqual(c.startCrowd!);
    tp(sim, 0, 0);
    sim.advance(60);
    const q = (sim.state.stations.lakeCounterA as CounterState).queue.length;
    expect(q).toBeGreaterThanOrEqual(30);
    expect(q).toBeLessThanOrEqual(c.queueLen);
    // Every queue slot lies outside the walkable yard.
    for (let i = 0; i < c.queueLen; i++) {
      const pt = queueSlotPos(c, i);
      expect(inRects(pt.x, pt.z, 0, sim.walkRects())).toBe(false);
    }
  });
  it('the sled-dog courier runs logs from Pinewood to the lake along its trail', () => {
    const sim = fresh();
    unlockTo(sim, 'pad_courier');
    (sim.state.stations.woodpile as PileState).count = 30;
    tp(sim, 0, 0);
    sim.drainEvents();
    sim.advance(25);
    const ev = sim.drainEvents();
    expect(ev.some((e) => e.type === 'courierDepart' && e.helper === 'sledDog' && e.n > 0)).toBe(true);
    expect(ev.some((e) => e.type === 'courierArrive' && e.at === 'dest')).toBe(true);
    const got = (sim.state.stats['deliver.smokehouseA'] ?? 0) + (sim.state.stats['deliver.logRack'] ?? 0);
    expect(got).toBeGreaterThan(8);
  });
});

describe('Ironridge', () => {
  it('ore + log forge into ingots; tool pads emit toolUpgrade and speed up mining', () => {
    const sim = fresh();
    unlockTo(sim, 'pad_forge');
    const f = sim.stationDefs.get('forge')!;
    sim.state.player.stack = ['ore', 'ore', 'ore', 'ore', 'log', 'log'];
    tp(sim, f.x, f.z + 1.6);
    stand(sim, 7);
    expect(sim.state.stats['craft.ingot']).toBeGreaterThanOrEqual(2);
    sim.drainEvents();
    const before = sim.state.mods.mineSpeed;
    sim.completePad('pad_pick');
    expect(sim.state.mods.mineSpeed).toBeGreaterThan(before);
    expect(sim.state.tools.pick).toBe(1);
    expect(sim.drainEvents().some((e) => e.type === 'toolUpgrade' && e.tool === 'pick')).toBe(true);
  });
  it('the Great Kitchen turns stew + smoked fish into feasts, the priciest dish', () => {
    const sim = fresh();
    unlockTo(sim, 'pad_greatKitchen');
    (sim.state.stations.greatKitchen as ProcState).inputs = { stew: 3, smokedFish: 3 };
    tp(sim, 0, 0);
    sim.advance(6);
    expect(sim.state.stats['craft.feast']).toBeGreaterThanOrEqual(2);
    expect(sim.dishPrice('feast')).toBeGreaterThan(sim.dishPrice('smokedFish'));
  });
});

describe('Great Beacon + finale', () => {
  it('4 stages raise the beacon; stage 4 runs lighting → dawn → done and ends the Long Night for good', () => {
    const sim = fresh();
    unlockTo(sim, 'pad_beacon3');
    expect(sim.state.beacon).toBe(3);
    tp(sim, 0, 0);
    sim.advance(5);
    const queued = sim.state.customers.filter((c) => c.phase === 'queue').length;
    expect(queued).toBeGreaterThan(20);
    sim.drainEvents();
    sim.completePad('pad_beacon4');
    expect(sim.state.beacon).toBe(4);
    expect(sim.state.finale.phase).toBe('none'); // the finished Beacon stands dark until the flame arrives
    lightBeacon(sim);
    expect(sim.state.finale.phase).toBe('lighting');
    sim.advance(GAME_DATA.finale.lightingTime + 0.1);
    expect(sim.state.finale.phase).toBe('dawn');
    // Every queued Icebound thawed at once and a big reward piled at the beacon.
    expect(sim.state.customers.filter((c) => c.phase === 'queue').length).toBeLessThan(10);
    expect(sim.state.emberPiles.find((e) => e.id === 'embers_beacon')!.count).toBe(GAME_DATA.finale.reward);
    sim.advance(GAME_DATA.finale.dawnTime + 0.1);
    expect(sim.state.finale.phase).toBe('done');
    expect(sim.warmRadius()).toBe(GAME_DATA.finale.warmRadius);
    for (const a of GAME_DATA.areas) expect(sim.state.areasOpen[a.id]).toBe(true);
    const ev = sim.drainEvents();
    expect(ev.filter((e) => e.type === 'beaconStage').map((e) => (e as any).stage)).toEqual([4]);
    expect(ev.filter((e) => e.type === 'finale').map((e) => (e as any).phase)).toEqual(['lighting', 'dawn', 'done']);
    expect(ev.some((e) => e.type === 'longNightEnds')).toBe(true);
    expect(sim.state.orders.length).toBe(3);
  });
});

describe('Open Season', () => {
  const afterFinale = () => {
    const sim = fresh(7);
    unlockTo(sim, 'pad_beacon4');
    lightBeacon(sim);
    sim.advance(GAME_DATA.finale.lightingTime + GAME_DATA.finale.dawnTime + 0.5);
    sim.drainEvents();
    return sim;
  };
  it('a filled order pays out and is replaced at once (no waits); seasons scale gently', () => {
    const sim = afterFinale();
    const board = sim.stationDefs.get(GAME_DATA.endless.board)!;
    tp(sim, board.x - 1.2, board.z);
    sim.state.player.capacity = 64;
    let done = 0;
    for (let k = 0; k < 6; k++) {
      const o = sim.state.orders.find((x) => !x.festival)!;
      sim.state.player.stack = Array(o.n - o.got).fill(o.item);
      for (let i = 0; i < 2000 && sim.state.player.stack.length; i++) sim.step();
      expect(sim.state.orders.length).toBe(3);
      done++;
    }
    expect(sim.state.stats.ordersDone).toBe(done);
    expect(sim.state.season).toBeGreaterThan(1);
    const ev = sim.drainEvents();
    expect(ev.filter((e) => e.type === 'orderComplete').length).toBe(done);
    expect(ev.filter((e) => e.type === 'orderPosted').length).toBe(done);
    expect(ev.some((e) => e.type === 'seasonUp')).toBe(true);
    expect(new Set(sim.state.orders.map((o) => o.item)).size).toBe(3);
  });
  it('repeatable upgrades grow in cost, wait for the player to step off, and stay bounded', () => {
    const sim = afterFinale();
    sim.state.embers = 1e7;
    const pad = sim.padDefs.get('up_boots')!;
    const c0 = sim.padCost(pad.id);
    tp(sim, pad.x, pad.z);
    stand(sim, 4);
    expect(sim.padLevel(pad.id)).toBe(1);
    expect(sim.state.pads[pad.id].hold).toBe(true);
    expect(sim.padCost(pad.id)).toBeGreaterThan(c0);
    stand(sim, 4);
    expect(sim.padLevel(pad.id)).toBe(1); // no chain-buying while standing
    tp(sim, pad.x + 3, pad.z);
    stand(sim, 0.2);
    tp(sim, pad.x, pad.z);
    stand(sim, 4);
    expect(sim.padLevel(pad.id)).toBe(2);
    const base = sim.state.mods.moveSpeed;
    for (let i = 0; i < 60; i++) sim.completePad(pad.id);
    expect(sim.state.mods.moveSpeed).toBeLessThan(base * 1.5 + 1e-6);
    // Bigger pack caps out after its max levels.
    for (let i = 0; i < 40; i++) sim.completePad('up_pack');
    expect(sim.state.pads.up_pack.done).toBe(true);
    expect(sim.state.player.capacity).toBeLessThanOrEqual(GAME_DATA.balance.maxCapacity);
  });
  it('decoration pads place camp decorations and track lifetime stats', () => {
    const sim = afterFinale();
    sim.completePad('deco_lanterns');
    expect(sim.state.unlocked.decoLantern1).toBe(true);
    expect(sim.drainEvents().some((e) => e.type === 'decorate')).toBe(true);
    sim.setMove(1, 0);
    sim.advance(1);
    const t = sim.state.totals;
    expect(t.decorations).toBe(1);
    expect(t.distance).toBeGreaterThan(1);
    expect(t.playTime).toBeGreaterThan(1);
  });
});

describe('bin', () => {
  it('standing still at it throws the pack away one item at a time; walking past never does', () => {
    const sim = fresh();
    const bin = sim.stationDefs.get('shelfYard')!;
    expect(bin.name).toBe('Bin');
    // Walk straight through the bin's zone carrying things: nothing is lost.
    sim.state.player.stack = ['fish', 'stew', 'stew'];
    tp(sim, bin.x - 2.5, bin.z - 0.4);
    sim.setMove(1, 0);
    sim.advance(1.0);
    expect(sim.state.player.stack).toEqual(['fish', 'stew', 'stew']);
    // Stand still in it: after a moment it starts taking the pack, top first, until empty.
    tp(sim, bin.x - 0.9, bin.z);
    sim.drainEvents();
    stand(sim, 0.5);
    expect(sim.state.player.stack.length).toBe(3);
    stand(sim, 1.5);
    expect(sim.state.player.stack).toEqual([]);
    expect(sim.drainEvents().filter((e) => e.type === 'binned').map((e) => (e as any).item)).toEqual(['stew', 'stew', 'fish']);
    // Nothing comes back out, and helpers/links ignore it.
    stand(sim, 1);
    expect(sim.state.player.stack).toEqual([]);
    expect(sim.takeable('shelfYard')).toBeNull();
    expect(sim.room('shelfYard', 'fish', true)).toBe(0);
  });
  it('every yard has one', () => {
    const areas = new Set(GAME_DATA.stations.filter((d) => d.type === 'shelf').map((d) => d.area));
    for (const a of ['kettleYard', 'pinewood', 'frozenLake', 'ironridge', 'beaconPeak']) expect(areas.has(a as any)).toBe(true);
  });
});

describe('never soft-locked (deadlock regression)', () => {
  it('a full pack of any kind can always be set down somewhere, even with every buffer at cap', () => {
    const sim = fresh();
    unlockTo(sim, 'pad_beacon3');
    for (const d of GAME_DATA.stations) {
      const st = sim.state.stations[d.id];
      if (st.kind === 'pile') st.count = d.type === 'pile' ? d.cap : 0;
      if (st.kind === 'processor' && d.type === 'processor') {
        for (const k in GAME_DATA.recipes[d.recipe].inputs) st.inputs[k as ItemKind] = d.inputCap;
        st.output = 60;
      }
      if (st.kind === 'counter' && d.type === 'counter') st.stock = d.cap;
      if (st.kind === 'deposit' && d.type === 'deposit') st.count = d.cap;
    }
    for (const it of ITEM_KINDS) {
      const outlet = GAME_DATA.stations.some((d) => sim.isUsable(d.id) && (
        sim.room(d.id, it) > 0 || d.type === 'shelf' || (d.type === 'pile' && d.item === it)
        || (d.type === 'processor' && GAME_DATA.recipes[d.recipe].output === it)));
      expect(outlet, it).toBe(true);
    }
    // Behaviour: a full pack of fish at a full kettle still goes in (player drops are never refused).
    const k = sim.stationDefs.get('kettleA')!;
    sim.state.player.stack = Array(sim.state.player.capacity).fill('fish');
    tp(sim, k.x, k.z + 1.4);
    stand(sim, 1);
    expect(sim.state.player.stack.length).toBeLessThan(sim.state.player.capacity);
    // Holding only one input of a two-input recipe: the smokehouse takes it.
    const sh = sim.stationDefs.get('smokehouseA')!;
    sim.state.player.stack = Array(sim.state.player.capacity).fill('log');
    tp(sim, sh.x, sh.z - 1.6);
    stand(sim, 1);
    expect(sim.state.player.stack.length).toBeLessThan(sim.state.player.capacity);
  });
  it('helpers and links still respect soft caps', () => {
    const sim = fresh();
    (sim.state.stations.kettleA as ProcState).inputs.fish = 10;
    expect(sim.room('kettleA', 'fish', true)).toBe(0);
    expect(sim.room('kettleA', 'fish')).toBeGreaterThan(0);
  });
});

describe('world layout + dressing', () => {
  const reach = buildReach(GAME_DATA);
  it('every station, pad spot and area focus is reachable on foot with everything built', () => {
    for (const s of GAME_DATA.stations) expect(reach.near(s.x, s.z, s.reach - 0.3), s.id).toBe(true);
    const under = new Set(GAME_DATA.pads.filter((p) => p.effects.some((e) => e.type === 'unlock' || e.type === 'hire')).map((p) => p.id));
    for (const p of GAME_DATA.pads) if (!under.has(p.id)) expect(reach.near(p.x, p.z, 0.5), p.id).toBe(true);
    for (const a of GAME_DATA.areas) expect(reach.near(a.focus.x, a.focus.z, 3), a.id).toBe(true);
  });
  it('conveyors run in axis-aligned legs of at least 2.5 m', () => {
    for (const l of GAME_DATA.links) {
      for (let i = 1; i < l.path.length; i++) {
        const a = l.path[i - 1];
        const b = l.path[i];
        expect(a.x === b.x || a.z === b.z, l.id).toBe(true);
        expect(Math.hypot(b.x - a.x, b.z - a.z), l.id).toBeGreaterThanOrEqual(2.5);
      }
    }
  });
  it('compact yards: Kettle Yard loop stations are a few metres apart and the Hearth is close', () => {
    const d = (a: string, b: string) => {
      const p = GAME_DATA.stations.find((s) => s.id === a)!;
      const q = GAME_DATA.stations.find((s) => s.id === b)!;
      return Math.hypot(p.x - q.x, p.z - q.z);
    };
    expect(d('streamHole0', 'kettleA')).toBeLessThan(5);
    expect(d('kettleA', 'counterA')).toBeLessThan(6);
    expect(d('kettleA', 'hearth')).toBeLessThan(15);
    expect(d('smokehouseA', 'lakeCounterA')).toBeLessThan(6);
    expect(d('forge', 'oreBin')).toBeLessThan(6);
  });
  it('counters sit in palisade gaps; walls never overlap a station', () => {
    const solids = wallSolids(GAME_DATA.dressing);
    for (const s of GAME_DATA.stations) {
      for (const w of solids) {
        const inside = Math.abs(s.x - w.x) < w.hw && Math.abs(s.z - w.z) < w.hd;
        expect(inside, `${s.id} inside a wall`).toBe(false);
      }
    }
  });
  it('clutter zones and landmarks keep clear of stations, pads, belts, queues, homes and trails', () => {
    const blockers: { x: number; z: number; r: number; id: string }[] = [];
    for (const s of GAME_DATA.stations) {
      const r = !s.solid ? 0.6 : 'r' in s.solid ? s.solid.r : Math.hypot(s.solid.hw, s.solid.hd);
      blockers.push({ x: s.x, z: s.z, r: r + 0.3, id: s.id });
    }
    for (const p of GAME_DATA.pads) blockers.push({ x: p.x, z: p.z, r: 1.15, id: p.id });
    for (const h of GAME_DATA.helpers) blockers.push({ x: h.home.x, z: h.home.z, r: 0.6, id: `home ${h.id}` });
    const line = (pts: Vec2[], r: number, id: string) => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.3);
        for (let k = 0; k <= n; k++) blockers.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n, r, id });
      }
    };
    for (const l of GAME_DATA.links) line(l.path, 0.6, l.id);
    for (const h of GAME_DATA.helpers) if (h.route) line(h.route, 0.6, `trail ${h.id}`);
    for (const c of GAME_DATA.stations) if (c.type === 'counter' && c.queuePath) line(c.queuePath, 0.6, `queue ${c.id}`);
    for (const a of GAME_DATA.dressing) {
      for (const z of a.clutterZones) {
        for (const b of blockers) {
          const dx = Math.max(Math.abs(b.x - z.x) - z.w / 2, 0);
          const dz = Math.max(Math.abs(b.z - z.z) - z.d / 2, 0);
          expect(Math.hypot(dx, dz) >= b.r, `${a.area} clutter vs ${b.id}`).toBe(true);
        }
      }
    }
  });
  it('every quest guides somewhere (or explicitly nowhere)', () => {
    for (const q of GAME_DATA.quests) {
      if (q.goal.type === 'pad') expect(GAME_DATA.pads.some((p) => p.id === (q.goal as any).pad), q.id).toBe(true);
      if (q.guide?.type === 'pad') expect(GAME_DATA.pads.some((p) => p.id === (q.guide as any).pad), q.id).toBe(true);
      if (q.guide?.type === 'station') expect(GAME_DATA.stations.some((s) => s.id === (q.guide as any).id), q.id).toBe(true);
      if (q.guide?.type === 'harvest') expect(GAME_DATA.stations.some((s) => s.type === 'node' && s.tag === (q.guide as any).tag), q.id).toBe(true);
    }
  });
});

describe('save v2 + migration', () => {
  it('a v1 save from the end of Pinewood loads into the new content', () => {
    const a = fresh();
    unlockTo(a, 'pad_hearth3');
    const raw = JSON.parse(a.serialize());
    // Turn it into what v1 wrote: no v2 fields, quest index pointing at v1's final placeholder (index 32).
    raw.v = 1;
    raw.state.version = 1;
    for (const k of ['beacon', 'finale', 'tools', 'orders', 'nextOrderId', 'season', 'totals']) delete raw.state[k];
    raw.state.quest = { index: 32, base: 0 };
    for (const k of ['fishSpeed', 'mineSpeed', 'priceMul']) delete raw.state.mods[k];
    delete raw.state.stations.smokehouseA;
    delete raw.state.player.shelf;
    const b = new Sim(GAME_DATA, { save: JSON.stringify(raw) });
    expect(b.state.version).toBe(3);
    expect(b.questProgress().id).toBe('q_lakefish');
    expect(b.state.beacon).toBe(0);
    expect(b.state.finale.phase).toBe('none');
    expect(b.state.mods.fishSpeed).toBe(1);
    expect(b.state.totals.served).toBe(raw.state.stats.served ?? 0);
    expect(b.state.stations.smokehouseA).toBeDefined();
    expect(b.state.pads.pad_smokehouseA.visible).toBe(true);
    b.advance(2);
    expect(b.serialize()).toContain('"version":3');
  });
  it('round-trips late-game state (orders, finale, shelves, courier waypoints)', () => {
    const a = fresh(4);
    unlockTo(a, 'pad_beacon4');
    a.advance(20);
    const b = new Sim(GAME_DATA, { save: a.serialize() });
    expect(b.serialize()).toBe(a.serialize());
    a.advance(5);
    b.advance(5);
    expect(b.serialize()).toBe(a.serialize());
  });
});

void (null as unknown as NodeState);
