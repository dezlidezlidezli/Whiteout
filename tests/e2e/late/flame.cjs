// Carry-the-flame browser test (Playwright, globally preinstalled — never `npm install playwright`).
//
//   FK_URL=http://localhost:5173/ node tests/e2e/late/flame.cjs      # FK_SHOTS=/some/dir for screenshots
//
// Runs with ?mech=flame (headless sim steps between screenshots so it is quick on software rendering):
// take the flame at the Hearth, light the Trail of Light in order, gutter in a wind gap, let it go out,
// relight at a brazier, carry it to the finished Beacon's crown and see the finale begin. Also checks
// the mechanic-off game shows none of it and that there are no console errors.

const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL = process.env.FK_URL || 'http://localhost:5173/';
const OUT = process.env.FK_SHOTS || path.join(os.tmpdir(), 'frostkettle-flame');
fs.mkdirSync(OUT, { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
  console.log('ok -', msg);
}

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const ready = () => page.waitForFunction(() => window.__fk && window.__fk.sim && window.__fk.cheat.lateArea, null, { timeout: 60000 });
  const fk = async (fn, arg) => {
    await ready();
    return page.evaluate(fn, arg);
  };
  const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 120000 });
  /** Stand at (x, z) for `sec` seconds of headless sim time (player still), optionally snapping the camera. */
  const standAt = (x, z, sec, snap = true) =>
    fk(
      ([x, z, sec, snap]) => {
        const sim = window.__fk.sim;
        const p = sim.state.player;
        if (snap) window.__fk.cheat.lateGo(x, z);
        for (let i = 0; i < Math.round(sec * 60); i++) {
          p.x = p.px = x;
          p.z = p.pz = z;
          p.vx = p.vz = 0;
          sim.setMove(0, 0);
          sim.step(1 / 60);
        }
        const f = sim.state.flame;
        return { held: f.held, level: f.level, lit: Object.keys(f.lit).length, beaconLit: f.beaconLit, phase: sim.state.finale.phase };
      },
      [x, z, sec, snap],
    );

  try {
    // ---------------------------------------------------------------- off
    await page.goto(URL + '?seed=51&fresh=1&skiptitle=1', { waitUntil: 'load' });
    await ready();
    assert((await fk(() => window.__fk.sim.data.mech.braziers.length)) === 0, 'shipped data: no flame braziers');
    assert(await page.evaluate(() => !document.querySelector('.fk-flame-meter.fk-on')), 'no flame meter');

    // ---------------------------------------------------------------- on
    await page.goto(URL + '?seed=51&fresh=1&skiptitle=1&mech=flame', { waitUntil: 'load' });
    await ready();
    await fk(() => {
      window.__fk.cheat.lateArea('beaconPeak', false, 2);
      window.__fk.cheat.timescale(0.0001);
      window.__fk.sim.state.player.stack = [];
    });
    const trail = await fk(() => window.__fk.sim.data.mech.braziers.filter((b) => b.kind === 'trail').sort((a, b) => a.order - b.order));
    assert(trail.length === 7, 'seven trail braziers');
    const H = await fk(() => window.__fk.sim.data.camp.hearth);
    let r = await standAt(H.x + 1.4, H.z + 0.8, 1.2);
    assert(r.held, 'flame taken at the Hearth');
    await page.waitForTimeout(1500);
    await shot('flame-taken');
    assert(await page.evaluate(() => !!document.querySelector('.fk-flame-meter.fk-on')), 'flame meter shows while carrying');

    // Light the first trail brazier.
    r = await standAt(trail[0].x, trail[0].z + 1.2, 0.3);
    assert(r.lit >= 1, 'first trail brazier lit');
    await page.waitForTimeout(900);
    await shot('flame-trail1-lit');

    // Gutter in a wind gap.
    const gap = await fk(() => window.__fk.sim.data.mech.windGaps[0]);
    await fk(() => (window.__fk.sim.state.flame.level = 1));
    r = await standAt((gap.x0 + gap.x1) / 2, (gap.z0 + gap.z1) / 2, 4);
    assert(r.held && r.level < 0.6, `the wind gap makes it gutter (level ${r.level.toFixed(2)})`);
    await page.waitForTimeout(1200);
    await shot('flame-windgap');

    // Light the rest of the trail in order (restoring at each lit brazier on the way).
    for (let i = 1; i < trail.length; i++) {
      await standAt(trail[i - 1].x + 1.0, trail[i - 1].z, 0.1, false);
      r = await standAt(trail[i].x + 0.9, trail[i].z, 0.2, false);
    }
    assert(r.lit >= 7, 'the whole Trail of Light is lit');
    await fk(() => window.__fk.cheat.lateGo(window.__fk.sim.data.mech.braziers.find((b) => b.order === 4).x + 3, -44));
    await page.waitForTimeout(1500);
    await shot('flame-trail-complete');

    // Let it go out in the cold: nothing lost, relight at a brazier.
    await fk(() => window.__fk.sim.drainEvents());
    const cold = await fk(() => {
      // A spot on the peak well away from every lit brazier (and outside the Hearth's warmth).
      const sim = window.__fk.sim;
      const m = sim.data.mech;
      const a = sim.data.areas.find((x) => x.id === 'beaconPeak').rects[0];
      let best = null;
      for (let x = a.x0 + 1; x <= a.x1 - 1; x += 0.5)
        for (let z = a.z0 + 1; z <= a.z1 - 1; z += 0.5) {
          let d = Infinity;
          for (const b of m.braziers) d = Math.min(d, Math.hypot(b.x - x, b.z - z));
          if (!best || d > best.d) best = { x, z, d };
        }
      return best;
    });
    r = await standAt(cold.x, cold.z, 22, false);
    assert(!r.held, 'the flame goes out in the cold');
    const t7 = trail[trail.length - 1];
    r = await standAt(t7.x + 1.0, t7.z, 1.2, false);
    assert(r.held, 'relit at a lit brazier');

    // The Beacon: built, but dark until the flame reaches its crown.
    await fk(() => window.__fk.cheat.lateBeacon(4));
    assert((await fk(() => window.__fk.sim.state.finale.phase)) === 'none', 'finished Beacon waits for the flame');
    r = await standAt(t7.x + 1.0, t7.z, 0.3, true);
    await page.waitForTimeout(1200);
    await shot('flame-to-beacon');
    const B = await fk(() => window.__fk.sim.data.mech.beacon);
    r = await standAt(B.x, B.z + B.reach - 0.5, 0.3, false);
    assert(r.beaconLit && r.phase === 'lighting', 'carrying the flame to the crown lights the Beacon and starts the finale');
    await page.waitForTimeout(1800);
    await shot('flame-beacon-lit');
    assert(await page.evaluate(() => !!document.querySelector('.fk-ui.fk-cinema')), 'finale cinematic runs');
    assert(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
    console.log('flame e2e: all good. Screenshots in', OUT);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
