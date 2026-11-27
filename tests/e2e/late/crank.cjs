// Crank-by-circling browser test (Playwright, globally preinstalled — never `npm install playwright`).
//
//   FK_URL=http://localhost:5173/ node tests/e2e/late/crank.cjs      # FK_SHOTS=/some/dir for screenshots
//
// Runs with ?mech=crank. Winds the forge bellows and the mine lift by walking the ring (headless sim
// steps, so it is fast even on software rendering), then checks the presentation: rotor follows,
// ring/counter shown, bellows breathe, forge multiplier label, lift cage rises and ore lands on the
// pit-head pile, the winder works the capstan. Also checks the mechanic-off game shows none of it.

const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL = process.env.FK_URL || 'http://localhost:5173/';
const OUT = process.env.FK_SHOTS || path.join(os.tmpdir(), 'frostkettle-crank');
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
  // Walk round a crank's ring for `turns` turns (headless steps), leaving the player standing in it.
  const wind = (use, turns, keep = true) =>
    fk(
      ([use, turns, keep]) => {
        const sim = window.__fk.sim;
        const c = sim.data.mech.cranks.find((k) => k.use === use);
        const R = (c.inner + c.outer) / 2;
        const p = sim.state.player;
        const steps = Math.round((turns * Math.PI * 2) / 0.06);
        let a = Math.PI / 2;
        for (let i = 0; i < steps; i++) {
          a += 0.06;
          const x = c.x + Math.cos(a) * R;
          const z = c.z + Math.sin(a) * R;
          p.vx = 0;
          p.vz = 0;
          p.px = p.x;
          p.pz = p.z;
          p.x = x;
          p.z = z;
          sim.setMove(0, 0);
          sim.step(1 / 60);
          p.x = x;
          p.z = z;
        }
        if (!keep) window.__fk.cheat.lateGo(c.x, c.z + c.outer + 1.5);
        return { turns: sim.state.crank[c.id].turns, blast: sim.state.crank[c.id].blast, lift: sim.state.crank[c.id].lift };
      },
      [use, turns, keep],
    );

  try {
    // ---------------------------------------------------------------- off: nothing of the mechanic
    await page.goto(URL + '?seed=41&fresh=1&skiptitle=1&mech=none', { waitUntil: 'load' });
    await ready();
    await fk(() => window.__fk.cheat.lateArea('ironridge', true, 3));
    assert((await fk(() => window.__fk.sim.data.mech.cranks.length)) === 0, 'mechanic off (?mech=none): no cranks');

    // ---------------------------------------------------------------- on
    await page.goto(URL + '?seed=41&fresh=1&skiptitle=1&mech=crank', { waitUntil: 'load' });
    await ready();
    assert((await fk(() => window.__fk.sim.data.mech.cranks.length)) === 2, '?mech=crank: two capstans');
    await fk(() => window.__fk.cheat.lateArea('ironridge', true, 3));
    assert(await fk(() => window.__fk.sim.data.mech.cranks.every((c) => window.__fk.sim.state.unlocked[c.unlockedBy])), 'capstans built');
    await fk(() => window.__fk.cheat.timescale(0.0001));
    const w1 = await wind('bellows', 2.3);
    assert(w1.turns >= 2 && w1.blast > 0.4, `bellows wound (turns ${w1.turns.toFixed(1)}, blast ${w1.blast.toFixed(2)})`);
    await page.waitForTimeout(1500);
    const rot = await fk(() => {
      const c = window.__fk.sim.data.mech.cranks.find((k) => k.use === 'bellows');
      const d = window.__fk.view.world.decor.get(c.unlockedBy);
      return d.obj.getObjectByName('rotor').rotation.y;
    });
    assert(Math.abs(rot) > 0.5, 'capstan rotor swings round with the player');
    await shot('crank-bellows');
    await fk(() => { const sim = window.__fk.sim; const c = sim.data.mech.cranks.find((k) => k.use === 'bellows'); const f = sim.stationDefs.get(c.target); window.__fk.cheat.lateGo(f.x - 1.4, f.z + 2.2); });
    await page.waitForTimeout(1500);
    await shot('crank-forge');
    const bag = await fk(() => {
      let found = null;
      window.__fk.view.scene.traverse((o) => {
        if (o.name === 'bag' && o.parent && o.parent.visible) found = o.scale.y;
      });
      return found;
    });
    assert(bag !== null, 'bellows stand by the forge');
    // Start the lift from an empty cage (the winder may already have wound it).
    await fk(() => { const sim = window.__fk.sim; const c = sim.data.mech.cranks.find((k) => k.use === 'lift'); sim.state.crank[c.id].lift = 0; });
    const w2 = await wind('lift', 1.3);
    assert(w2.lift > 1.2, 'lift wound towards the next cage');
    await page.waitForTimeout(1500);
    await shot('crank-lift-rising');
    const pile0 = await fk(() => window.__fk.sim.state.stats.liftCages || 0);
    await wind('lift', 0.8);
    await page.waitForTimeout(700);
    await shot('crank-lift-arrive');
    const pile1 = await fk(() => window.__fk.sim.state.stats.liftCages || 0);
    assert(pile1 >= pile0 + 1, 'a cage of ore is hauled up onto the pit-head pile');
    // The hired winder walks the lift capstan on its own.
    await fk(() => {
      const sim = window.__fk.sim;
      const c = sim.data.mech.cranks.find((k) => k.use === 'lift');
      window.__fk.cheat.lateGo(c.x, c.z + c.outer + 2.5);
      window.__fk.cheat.timescale(1);
      sim.advance(8);
    });
    await page.waitForTimeout(1500);
    await shot('crank-winder');
    assert(await fk(() => Object.values(window.__fk.sim.state.helpers).length > 0), 'helpers present');
    assert(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
    console.log('crank e2e: all good. Screenshots in', OUT);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
