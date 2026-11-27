// Mechanic presentation e2e (Playwright, globally preinstalled). Runs each mechanic behind ?mech=
// and asserts its visuals respond to play. Usage: node tests/e2e/mechanics.cjs [plough|rescue|skate]
//   FK_URL=http://localhost:5173/ FK_SHOTS=/some/dir

const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL = process.env.FK_URL || 'http://localhost:5173/';
const OUT = process.env.FK_SHOTS || path.join(os.tmpdir(), 'frostkettle-mech');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2];

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
  console.log('ok -', msg);
}

async function open(browser, mech) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + String(e.stack).split('\n').slice(1, 4).join(' <- ')));
  for (let a = 0; a < 5; a++) {
    try {
      await page.goto(URL + '?seed=4&fresh=1&skiptitle=1&mech=' + mech, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__fk && window.__fk.sim, null, { timeout: 30000 });
      break;
    } catch (e) { if (a === 4) throw e; }
  }
  return { page, errors };
}

async function plough(browser) {
  const { page, errors } = await open(browser, 'plough');
  const z = await page.evaluate(() => {
    __fk.cheat.hearth(2);
    __fk.cheat.quality(0);
    return __fk.sim.data.mech.deepSnow[0];
  });
  const before = await page.evaluate(() => __fk.view.debugPlough());
  assert(before && before.deepCells > 50, 'deep snow cells are drawn (' + (before && before.deepCells) + ')');
  // Without the plough the player wades (no clearing).
  await page.evaluate((z) => __fk.cheat.teleport((z.x0 + z.x1) / 2, z.z1 - 0.8), z);
  await page.keyboard.down('w');
  await page.waitForFunction(() => __fk.sim.state.tick > 0, null, { timeout: 5000 });
  await page.waitForTimeout(1500);
  await page.keyboard.up('w');
  const wade = await page.evaluate(() => Object.values(__fk.sim.state.plough.zones).reduce((a, v) => a + v.cleared, 0));
  assert(wade === 0, 'wading without a plough clears nothing');
  // With the plough: push north along the middle of the lot.
  await page.evaluate((z) => { __fk.sim.state.plough.tier = 1; __fk.cheat.teleport((z.x0 + z.x1) / 2, z.z1 - 0.8); }, z);
  await page.keyboard.down('w');
  await page.waitForFunction(() => Object.values(__fk.sim.state.plough.zones).reduce((a, v) => a + v.cleared, 0) > 30, null, { timeout: 30000 }).catch(() => {});
  const mid = await page.evaluate(() => __fk.view.debugPlough());
  await page.screenshot({ path: path.join(OUT, 'plough-pushing.png'), timeout: 90000 });
  await page.keyboard.up('w');
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ v: __fk.view.debugPlough(), cleared: Object.values(__fk.sim.state.plough.zones).reduce((a, v) => a + v.cleared, 0) }));
  assert(after.cleared > 30, 'pushing the plough clears snow (' + after.cleared + ' cells)');
  assert(after.v.deepCells < before.deepCells, 'cleared cells disappear from the drawn field (' + before.deepCells + ' -> ' + after.v.deepCells + ')');
  assert(after.v.banks > 0, 'the cut edge gets curled snow banks (' + after.v.banks + ')');
  assert(mid.ploughVisible, 'the plough is shown on the player while pushing');
  assert(mid.level > 0.2, 'the scrape ambience rises while pushing (' + mid.level.toFixed(2) + ')');
  const real = errors.filter((e) => !/GL Driver Message|GPU stall/i.test(e));
  assert(real.length === 0, 'no console errors (' + real.slice(0, 3).join(' | ') + ')');
  await page.close();
}

async function rescue(browser) {
  const { page, errors } = await open(browser, 'rescue');
  const shot = async (n, mid) => {
    // Teleports outrun the smoothed camera: snap it onto the player (or the player and their line) first.
    await page.evaluate((mid) => {
      const p = __fk.sim.state.player;
      let x = p.x, z = p.z;
      if (mid) { const f = Object.values(__fk.sim.state.rescue.pos); for (const q of f) { x += q.x; z += q.z; } x /= f.length + 1; z /= f.length + 1; }
      __fk.view.rig.snap(x, z - 1.2);
    }, !!mid);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, 'rescue-' + n + '.png'), timeout: 90000 });
  };
  const vs = await page.evaluate(() => {
    __fk.cheat.hearth(2);
    __fk.cheat.quality(0);
    __fk.sim.state.rescue.lantern = 1;
    const by = (id) => __fk.sim.data.mech.villagers.find((v) => v.id === id);
    return [by('lv_pine1'), by('lv_pine4'), by('lv_pine2')];
  });
  const dbg = () => page.evaluate(() => __fk.view.debugRescue());
  // Walk in small hops so the conga line keeps up (glow radius 6 m).
  const walkTo = async (x, z) => {
    for (let k = 0; k < 40; k++) {
      const at = await page.evaluate(([x, z]) => {
        const p = __fk.sim.state.player;
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < 0.05) return true;
        const s = Math.min(1, d);
        __fk.cheat.teleport(p.x + ((x - p.x) / d) * s, p.z + ((z - p.z) / d) * s);
        return false;
      }, [x, z]);
      if (at) return;
      await page.waitForTimeout(320);
    }
  };
  await page.evaluate(([x, z]) => __fk.cheat.teleport(x, z), [vs[0].x + 3.5, vs[0].z + 2]);
  await page.waitForFunction(() => __fk.sim.state.rescue.lit, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  let d = await dbg();
  assert(d && d.lantern, 'the lantern is held');
  assert(d.lamp > 0.5, 'the lantern is lit out in the cold (' + d.lamp.toFixed(2) + ')');
  assert(d.veil > 0.3, 'the whiteout veil closes in beyond the glow (' + d.veil.toFixed(2) + ')');
  assert(d.mounds >= 3, 'buried villagers are drawn (' + d.mounds + ')');
  await shot('fringe');
  // Dig out three villagers, walking between them.
  let sawDig = false;
  for (let i = 0; i < 3; i++) {
    await walkTo(vs[i].x + 0.7, vs[i].z);
    for (let k = 0; k < 40 && !(await page.evaluate((id) => !!__fk.sim.state.rescue.status[id], vs[i].id)); k++) {
      const dd = await dbg();
      if (dd.action === 'dig') sawDig = true;
      if (i === 0 && k === 3) await shot('dig');
      await page.waitForTimeout(150);
    }
  }
  const st = await page.evaluate(() => ({ ...__fk.sim.state.rescue.status }));
  assert(Object.keys(st).length === 3 && Object.values(st).every((s) => s === 'following'), 'three villagers dug out and following (' + JSON.stringify(st) + ')');
  assert(sawDig, 'the player digs while the sim digs');
  await walkTo(vs[2].x + 4, vs[2].z + 3);
  await page.waitForTimeout(700);
  d = await dbg();
  assert(d.followers === 3 && d.waiting === 0, 'three blanket-wrapped followers trail the player (' + d.followers + ')');
  assert(d.mounds === 0 || d.mounds < 3, 'dug-out mounds are gone (' + d.mounds + ' left in view)');
  await shot('conga');
  // Leave them outside the glow: they wait (with a bubble), safe.
  await page.evaluate(() => { const p = __fk.sim.state.player; __fk.cheat.teleport(p.x, p.z + 9); });
  await page.waitForFunction(() => Object.values(__fk.sim.state.rescue.status).some((s) => s === 'waiting'), null, { timeout: 10000 });
  await page.waitForTimeout(400);
  d = await dbg();
  assert(d.waiting >= 1, 'followers left outside the glow wait (' + d.waiting + ')');
  await page.evaluate(() => { const p = __fk.sim.state.player; __fk.cheat.teleport(p.x, p.z - 2.5); });
  await page.waitForTimeout(500);
  await shot('waiting', true);
  await page.evaluate(() => { const q = Object.values(__fk.sim.state.rescue.pos)[0]; __fk.cheat.teleport(q.x + 1, q.z + 1); });
  await page.waitForFunction(() => Object.values(__fk.sim.state.rescue.status).every((s) => s === 'following'), null, { timeout: 10000 });
  assert(true, 'waiting followers rejoin when the glow reaches them');
  // Lead them home: bring the line into the warmth (positions put at the camp edge, as if walked in).
  const pop0 = await page.evaluate(() => __fk.sim.state.population);
  await page.evaluate(() => {
    const h = __fk.sim.data.camp.hearth;
    const r = __fk.sim.state.rescue;
    __fk.cheat.teleport(h.x - 2, h.z + 2);
    for (const id in r.pos) r.pos[id] = { x: h.x - 2 + Math.random(), z: h.z + 2.5 + Math.random() };
  });
  await page.waitForFunction(() => Object.values(__fk.sim.state.rescue.status).every((s) => s === 'home'), null, { timeout: 10000 });
  await page.waitForTimeout(300);
  await shot('thaw');
  await page.waitForTimeout(2200);
  d = await dbg();
  const pop1 = await page.evaluate(() => __fk.sim.state.population);
  assert(pop1 >= pop0 + 3, 'the rescued join the population (' + pop0 + ' -> ' + pop1 + ')');
  assert(d.followers === 0, 'thawed followers leave the line (' + d.followers + ')');
  assert(d.veil < 0.15, 'no whiteout inside the warmth (' + d.veil.toFixed(2) + ')');
  const real = errors.filter((e) => !/GL Driver Message|GPU stall/i.test(e));
  assert(real.length === 0, 'no console errors (' + real.slice(0, 3).join(' | ') + ')');
  await page.close();
}

async function skate(browser) {
  const { page, errors } = await open(browser, 'skate');
  const shot = async (n) => {
    await page.evaluate(() => { const p = __fk.sim.state.player; __fk.view.rig.snap(p.x, p.z - 1.2); });
    await page.screenshot({ path: path.join(OUT, 'skate-' + n + '.png'), timeout: 90000 });
  };
  await page.evaluate(() => { __fk.cheat.hearth(3); __fk.cheat.quality(0); const q = __fk.sim.data.mech.skateLane[0]; __fk.cheat.teleport(q.x + 0.4, q.z - 0.2); });
  await page.waitForTimeout(800);
  // Glide south down the open lane and through a fish leap placed on the line.
  await page.keyboard.down('s');
  await page.waitForFunction(() => { const p = __fk.sim.state.player; return __fk.sim.state.skate.on && Math.hypot(p.vx, p.vz) > 3.2; }, null, { timeout: 8000 });
  await page.evaluate(() => {
    const p = __fk.sim.state.player;
    const st = __fk.sim.state.skate;
    st.leaps.push({ id: 9001, x: p.x + 0.2, z: p.z + 2.4, t: 1.0 });
  });
  await page.waitForTimeout(60);
  const mid = await page.evaluate(() => __fk.view.debugSkate());
  await shot('glide');
  await page.waitForFunction(() => (__fk.sim.state.stats.fishLeaps ?? 0) >= 1, null, { timeout: 6000 }).catch(() => {});
  await page.keyboard.up('s');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({ d: __fk.view.debugSkate(), leaps: __fk.sim.state.stats.fishLeaps ?? 0 }));
  await shot('after');
  assert(mid && mid.on && mid.blades, 'blades and skate pose on the ice (' + JSON.stringify(mid) + ')');
  assert(mid.fishUp >= 1, 'a fish arcs out of the leap hole');
  assert(after.leaps >= 1, 'skating through the leap scoops the fish');
  assert(after.d.trail > 6, 'the blades carve trails (' + after.d.trail + ')');
  assert(mid.level > 0.3, 'the blade hiss follows speed (' + mid.level.toFixed(2) + ')');
  // A grip mat: normal footing, blades away.
  await page.evaluate(() => { const g = __fk.sim.data.mech.gripMats[4]; __fk.cheat.teleport(g.x, g.z); });
  await page.keyboard.down('a');
  await page.waitForTimeout(150);
  await page.keyboard.up('a');
  await page.waitForTimeout(400);
  const mat = await page.evaluate(() => __fk.view.debugSkate());
  assert(!mat.on && !mat.blades, 'no skating on a grip mat');
  const real = errors.filter((e) => !/GL Driver Message|GPU stall/i.test(e));
  assert(real.length === 0, 'no console errors (' + real.slice(0, 3).join(' | ') + ')');
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    // The dev server reloads the page when files change under it: retry a test on a lost context.
    const run = async (fn) => {
      for (let a = 0; ; a++) {
        try { return await fn(browser); } catch (e) {
          if (a < 2 && /context was destroyed|navigation|Target closed/i.test(String(e))) { console.log('(page reloaded, retrying)'); continue; }
          throw e;
        }
      }
    };
    if (!only || only === 'plough') await run(plough);
    if (!only || only === 'rescue') await run(rescue);
    if (!only || only === 'skate') await run(skate);
    console.log('mechanics OK');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
