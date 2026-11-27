// The five signature mechanics (docs/MECHANICS.md), housing, the kettle slide, and save v3.
import { describe, expect, it } from 'vitest';
import { ALL_MECHANICS, GAME_DATA as SHIPPED_DATA, withMechanics } from '../src/data';
import { Sim } from '../src/sim';
import type { PileState, ProcState } from '../src/sim';
import { crankInfo, procBoost } from '../src/sim/crank';
import { isWarm } from '../src/sim/flame';
import { deepSnowZones, forEachDeepCell } from '../src/sim/plough';
import { followers } from '../src/sim/rescue';
import { isIce } from '../src/sim/skate';

/** Every signature mechanic on (the shipped data has them off until the view draws them). */
const GAME_DATA = withMechanics(SHIPPED_DATA, ALL_MECHANICS);

const M = GAME_DATA.mech;
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
function unlockTo(sim: Sim, lastPad: string): void {
  for (const p of GAME_DATA.pads) {
    if (p.group) continue;
    sim.completePad(p.id);
    if (p.id === lastPad) break;
  }
}
function walk(sim: Sim, dx: number, dz: number, s: number): void {
  sim.setMove(dx, dz);
  sim.advance(s);
  sim.setMove(0, 0);
}

describe('snow plough', () => {
  it('wades slowly without the plough; with it, carves a swath, reveals finds and pays a cleared zone', () => {
    const sim = fresh();
    unlockTo(sim, 'pad_woodbelt');
    const z = M.deepSnow.find((d) => d.id === 'dsPine')!;
    const zx = (z.x0 + z.x1) / 2;
    tp(sim, zx, z.z0 + 1);
    walk(sim, 0, 1, 1);
    const slow = sim.state.player.z - (z.z0 + 1);
    expect(slow).toBeLessThan(GAME_DATA.balance.playerSpeed * 0.6);
    expect(deepSnowZones(sim).find((d) => d.id === 'dsPine')!.cleared).toBe(0);
    sim.completePad('pad_plough');
    sim.drainEvents();
    tp(sim, zx, z.z0 + 1);
    walk(sim, 0, 1, 2);
    const zs = deepSnowZones(sim).find((d) => d.id === 'dsPine')!;
    expect(zs.cleared).toBeGreaterThan(20);
    expect(zs.ver).toBeGreaterThan(0);
    const ev = sim.drainEvents();
    expect(ev.some((e) => e.type === 'ploughStart')).toBe(true);
    expect(ev.some((e) => e.type === 'snowCleared')).toBe(true);
    // Clear the whole zone: every find is revealed and the reward is paid.
    let cells = 0;
    forEachDeepCell(sim, 'dsPine', () => cells++);
    expect(cells).toBe(zs.total - zs.cleared);
    for (let x = z.x0 + 0.4; x < z.x1; x += 1.2) {
      tp(sim, x, z.z0 + 0.4);
      walk(sim, 0, 1, (z.z1 - z.z0) / 4);
    }
    for (let x = z.x0 + 0.2; x < z.x1; x += 0.5) for (let zz = z.z0 + 0.2; zz < z.z1; zz += 0.5) {
      tp(sim, x, zz);
      sim.state.player.vx = 1;
      sim.step();
    }
    expect(deepSnowZones(sim).find((d) => d.id === 'dsPine')!.cleared).toBe(zs.total);
    const ev2 = sim.drainEvents();
    expect(ev2.some((e) => e.type === 'zoneCleared')).toBe(true);
    expect(ev2.some((e) => e.type === 'findRevealed')).toBe(true);
    for (const f of M.finds.filter((x) => x.zone === 'dsPine')) expect(sim.state.plough.revealed[f.id], f.id).toBe(true);
    expect(sim.state.unlocked.crateFindPine).toBe(true);
    expect(sim.state.rescue.revealed.lv_pine5).toBe(true);
  });
  it('one ploughStart / ploughStop per push, even over half-cleared ground', () => {
    const sim = fresh();
    unlockTo(sim, 'pad_woodbelt');
    sim.completePad('pad_plough');
    const z = M.deepSnow.find((d) => d.id === 'dsPine')!;
    const zx = (z.x0 + z.x1) / 2;
    // Clear every other lane first, so the push below crosses cleared and deep cells in turn.
    for (let x = z.x0 + 0.4; x < z.x1; x += 2.4) {
      tp(sim, x, z.z0 + 0.4);
      walk(sim, 0, 1, (z.z1 - z.z0) / 5);
    }
    stand(sim, 1);
    sim.drainEvents();
    // Zig-zag across the cleared lanes (deep, clear, deep, ...) and turn round, all inside the zone.
    tp(sim, zx - 1.5, z.z0 + 2);
    sim.setMove(0.5, 1);
    sim.advance(1.2);
    sim.setMove(0.5, -1);
    sim.advance(1.0);
    sim.setMove(0, 0);
    sim.advance(1);
    const ev = sim.drainEvents().filter((e) => e.type === 'ploughStart' || e.type === 'ploughStop').map((e) => e.type);
    expect(ev).toEqual(['ploughStart', 'ploughStop']);
    expect(sim.state.plough.pushing).toBe(false);
  });
  it('deep snow never lies on a helper home or courier trail', () => {
    for (const z of M.deepSnow) {
      for (const h of GAME_DATA.helpers) {
        for (const q of [h.home, ...(h.route ?? [])]) expect(q.x > z.x0 && q.x < z.x1 && q.z > z.z0 && q.z < z.z1, `${h.id} in ${z.id}`).toBe(false);
      }
    }
  });
});

describe('rescue walks', () => {
  it('digs a lost villager out, leads them in a line, waits safely outside the glow, thaws them home', () => {
    const sim = fresh();
    unlockTo(sim, 'pad_lantern');
    expect(sim.state.rescue.lantern).toBe(1);
    const v = M.villagers.find((x) => x.id === 'lv_pine1')!;
    sim.drainEvents();
    tp(sim, v.x + 0.8, v.z);
    stand(sim, 2);
    expect(sim.drainEvents().some((e) => e.type === 'lanternOn')).toBe(true);
    expect(sim.state.rescue.lit).toBe(true);
    expect(sim.state.rescue.status.lv_pine1).toBe('following');
    expect(followers(sim)).toHaveLength(1);
    // Walk away fast (teleport): outside the glow they stop and wait.
    tp(sim, v.x + 12, v.z);
    sim.step();
    expect(sim.state.rescue.status.lv_pine1).toBe('waiting');
    // Come back; lead them into the Hearth's warmth.
    tp(sim, v.x - 1.5, v.z);
    sim.step();
    expect(sim.state.rescue.status.lv_pine1).toBe('following');
    const pop = sim.state.population;
    const h = GAME_DATA.camp.hearth;
    for (let i = 0; i < 60 * 30 && sim.state.rescue.status.lv_pine1 !== 'home'; i++) {
      const p = sim.state.player;
      const w = sim.navFromPlayer(h.x, h.z);
      const l = Math.hypot(w.x - p.x, w.z - p.z) || 1;
      sim.setMove((w.x - p.x) / l, (w.z - p.z) / l);
      sim.step();
    }
    const fp = followers(sim)[0];
    expect(sim.state.rescue.status.lv_pine1, `player ${sim.state.player.x.toFixed(1)},${sim.state.player.z.toFixed(1)} follower ${fp?.x.toFixed(1)},${fp?.z.toFixed(1)} warm ${sim.warmRadius()}`).toBe('home');
    expect(sim.state.population).toBe(pop + 1);
    expect(sim.state.stats.rescued).toBe(1);
    expect(isWarm(sim, h.x + 1, h.z)).toBe(true);
    tp(sim, h.x + 1, h.z);
    sim.step();
    expect(sim.state.rescue.lit).toBe(false);
  });
  it('24 named lost villagers, each with a line of flavour', () => {
    expect(M.villagers).toHaveLength(24);
    expect(new Set(M.villagers.map((v) => v.name)).size).toBe(24);
    for (const v of M.villagers) expect(v.line.length).toBeGreaterThan(10);
  });
});

describe('ice skating', () => {
  it('momentum on the ice, normal footing on grip mats, fish leaps scooped at speed', () => {
    const sim = fresh();
    unlockTo(sim, 'pad_hearth3');
    const [a, b] = M.skateLane;
    expect(isIce(sim, a.x, a.z)).toBe(true);
    const g = M.gripMats[0];
    expect(isIce(sim, g.x, g.z)).toBe(false);
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / l;
    const uz = (b.z - a.z) / l;
    tp(sim, a.x, a.z);
    walk(sim, ux, uz, 0.6);
    expect(sim.state.skate.on).toBe(true);
    const v0 = Math.hypot(sim.state.player.vx, sim.state.player.vz);
    expect(v0).toBeGreaterThan(3);
    // Released: still gliding a moment later (no instant stop).
    sim.advance(0.3);
    expect(Math.hypot(sim.state.player.vx, sim.state.player.vz)).toBeGreaterThan(1);
    // A leap right ahead is scooped while skating through it.
    tp(sim, a.x, a.z);
    sim.state.player.stack = [];
    sim.setMove(ux, uz);
    sim.advance(0.6);
    const p = sim.state.player;
    sim.state.skate.leaps.push({ id: 99, x: p.x + ux * 1.5, z: p.z + uz * 1.5, t: 0 });
    sim.drainEvents();
    sim.advance(0.6);
    expect(sim.drainEvents().some((e) => e.type === 'fishLeapCatch')).toBe(true);
    expect(sim.state.player.stack).toContain('fish');
  });
});

describe('crank by circling', () => {
  it('walking round the bellows builds a decaying blast that speeds the forge (never required)', () => {
    const sim = fresh();
    unlockTo(sim, 'pad_hearth4');
    sim.completePad('pad_forge');
    sim.completePad('pad_bellows');
    const c = M.cranks.find((k) => k.use === 'bellows')!;
    expect(procBoost(sim, 'forge')).toBe(1);
    for (let i = 0; i < 60 * 8; i++) {
      const t = (i / 60) * 2.2;
      tp(sim, c.x + Math.cos(t) * 2, c.z + Math.sin(t) * 2);
      sim.step();
    }
    expect(crankInfo(sim, c.id).turns).toBeGreaterThan(2);
    expect(procBoost(sim, 'forge')).toBeGreaterThan(1.5);
    tp(sim, c.x + 8, c.z);
    sim.advance(30);
    expect(procBoost(sim, 'forge')).toBeLessThan(1.3);
  });
  it('the mine lift brings up a cage of ore every two turns; a hired winder walks it for you', () => {
    const sim = fresh();
    unlockTo(sim, 'pad_hearth4');
    sim.completePad('pad_mineLift');
    const c = M.cranks.find((k) => k.use === 'lift')!;
    for (let i = 0; i < 60 * 14; i++) {
      const t = (i / 60) * 2.2;
      tp(sim, c.x + Math.cos(t) * 2, c.z + Math.sin(t) * 2);
      sim.step();
    }
    // (the player standing by the pit-head scoops some of it straight away)
    expect(sim.state.stats.liftCages).toBeGreaterThanOrEqual(2);
    const before = sim.state.stats.liftCages ?? 0;
    sim.completePad('pad_winder');
    tp(sim, 0, 0);
    sim.advance(40);
    expect((sim.state.stats.liftCages ?? 0) - before).toBeGreaterThan(0);
  });
});

describe('carry the flame', () => {
  it('needs empty hands; gutters in the cold; lights the trail in order; lights the Beacon for the finale', () => {
    const sim = fresh();
    unlockTo(sim, 'pad_hearth5');
    const h = GAME_DATA.camp.hearth;
    sim.state.player.stack = ['fish'];
    tp(sim, h.x + 1.8, h.z);
    stand(sim, 1.5);
    expect(sim.state.flame.held).toBe(false);
    sim.state.player.stack = [];
    stand(sim, 1.0);
    expect(sim.state.flame.held).toBe(true);
    // Holding it: nothing can be picked up.
    sim.state.player.capacity = 20;
    // The trail lights only in order.
    const t2 = M.braziers.find((b) => b.id === 'trail2')!;
    tp(sim, t2.x + 1.0, t2.z);
    sim.step();
    expect(sim.state.flame.lit.trail2).toBeUndefined();
    for (const id of ['trail1', 'trail2', 'trail3', 'trail4', 'trail5', 'trail6', 'trail7']) {
      const b = M.braziers.find((x) => x.id === id)!;
      sim.state.flame.held = true;
      sim.state.flame.level = 1;
      tp(sim, b.x + 1.0, b.z);
      sim.step();
      expect(sim.state.flame.lit[id]).toBe(true);
    }
    // Out in the cold it gutters and goes out.
    sim.state.flame.held = true;
    sim.state.flame.level = 0.2;
    const far = M.braziers.find((x) => x.id === 'trail4')!;
    tp(sim, far.x + 5.5, far.z - 3.0);
    sim.advance(6);
    expect(sim.state.flame.held).toBe(false);
    // The finished Beacon stands dark until the flame reaches its crown.
    for (const id of ['pad_beacon1', 'pad_beacon2', 'pad_beacon3', 'pad_beacon4']) sim.completePad(id);
    expect(sim.state.finale.phase).toBe('none');
    sim.state.flame.held = true;
    sim.state.flame.level = 1;
    tp(sim, M.beacon.x, M.beacon.z + 2.8);
    sim.step();
    expect(sim.state.flame.beaconLit).toBe(true);
    expect(sim.state.finale.phase).toBe('lighting');
  });
});

describe('housing', () => {
  it('population counts housed villagers; the rest pass through; homes rise with the Hearth', () => {
    const sim = fresh();
    const h = GAME_DATA.camp.housing!;
    for (let i = 0; i < 100; i++) sim.welcome();
    expect(sim.state.tents).toBe(h.tentsPerLevel[0]);
    expect(sim.state.population).toBe(h.base + h.perTent * h.tentsPerLevel[0]);
    expect(sim.state.stats.passedThrough).toBeGreaterThan(0);
    sim.completePad('pad_hearth2');
    sim.applyEffect({ type: 'unlock', id: 'cabin1' });
    for (let i = 0; i < 100; i++) sim.welcome();
    expect(sim.state.population).toBe(h.base + h.perTent * h.tentsPerLevel[1] + h.perCabin);
  });
});

describe('collision', () => {
  it('walking straight into a kettle slides round it instead of snagging', () => {
    const sim = fresh();
    const k = sim.stationDefs.get('kettleA')!;
    tp(sim, k.x, k.z + 2.5);
    walk(sim, 0, -1, 1.2);
    expect(sim.state.player.z).toBeLessThan(k.z);
  });
  it('the glide keeps full stride: no frame slower than 80 % once up to speed, dead centre or glancing', () => {
    for (const off of [0, 0.05, 0.3, 0.9]) {
      const sim = fresh();
      const k = sim.stationDefs.get('kettleA')!;
      tp(sim, k.x + off, k.z + 2.5);
      sim.setMove(0, -1);
      const p = sim.state.player;
      for (let i = 0; i < 72; i++) {
        const x0 = p.x;
        const z0 = p.z;
        sim.step();
        if (i > 10) expect(Math.hypot(p.x - x0, p.z - z0) * 60, `offset ${off} frame ${i}`).toBeGreaterThan(GAME_DATA.balance.playerSpeed * 0.8);
      }
    }
  });
  it('pushing head-on into a flat wall stops (no sideways drift)', () => {
    const sim = fresh();
    const yard = GAME_DATA.areas.find((a) => a.id === 'kettleYard')!.rects[0];
    tp(sim, (yard.x0 + yard.x1) / 2 + 2, yard.z1 - 1.0);
    walk(sim, 0, 1, 1.5);
    expect(Math.abs(sim.state.player.x - ((yard.x0 + yard.x1) / 2 + 2))).toBeLessThan(0.3);
  });
});

describe('save v3', () => {
  it('a v2 save that already finished the finale keeps the Trail of Light and Beacon lit', () => {
    const a = fresh(3);
    unlockTo(a, 'pad_beacon4');
    a.state.finale = { phase: 'done', t: 0, progress: 1 };
    a.state.population = 5000;
    const raw = JSON.parse(a.serialize());
    raw.v = 2;
    raw.state.version = 2;
    for (const k of ['plough', 'rescue', 'skate', 'crank', 'flame']) delete raw.state[k];
    const b = new Sim(GAME_DATA, { save: JSON.stringify(raw) });
    expect(b.state.version).toBe(3);
    expect(b.state.flame.beaconLit).toBe(true);
    expect(M.braziers.filter((x) => x.kind === 'trail').every((x) => b.state.flame.lit[x.id])).toBe(true);
    expect(b.state.population).toBeLessThanOrEqual(b.housingCap());
    expect(b.state.plough.tier).toBe(0);
    b.advance(2);
  });
});

describe('never soft-locked with the mechanics', () => {
  it('property: random states (full packs, held flame, mid-ring, on ice, in deep snow) always leave a useful action', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const sim = fresh(seed);
      unlockTo(sim, 'pad_beacon3');
      let r = seed * 7919;
      const rnd = () => ((r = (r * 48271) % 2147483647) / 2147483647);
      const spots = [...M.cranks, ...M.braziers, M.skateLane[0], { x: M.deepSnow[1].x0 + 1, z: M.deepSnow[1].z0 + 1 }, GAME_DATA.camp.hearth];
      for (let k = 0; k < 60; k++) {
        const s = spots[Math.floor(rnd() * spots.length)];
        tp(sim, s.x + (rnd() - 0.5) * 3, s.z + (rnd() - 0.5) * 3);
        if (rnd() < 0.3) sim.state.player.stack = Array(sim.state.player.capacity).fill(rnd() < 0.5 ? 'plank' : 'ingot');
        if (rnd() < 0.3) {
          sim.state.flame.held = true;
          sim.state.flame.level = rnd();
        }
        stand(sim, 0.3);
        const p = sim.state.player;
        const canDrop = p.stack.some((it) => sim.data.stations.some((d) => sim.isUsable(d.id) && (sim.room(d.id, it) > 0 || d.type === 'shelf'
          || (d.type === 'processor' && sim.data.recipes[d.recipe].output === it))));
        // Holding the flame there is always a source to set it down at (or it gutters out in the cold).
        expect(canDrop || p.stack.length === 0, `stack ${p.stack[0]}`).toBe(true);
        expect(sim.guide()).not.toBeNull();
      }
    }
  });
});
