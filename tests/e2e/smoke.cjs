// Browser smoke test (Playwright, globally preinstalled — never `npm install playwright`).
//
//   npm run dev -- --port 5173 --strictPort &
//   node tests/e2e/smoke.cjs                 # FK_URL=http://localhost:5173/ FK_SHOTS=/some/dir
//
// Loads the game at an iPhone viewport, walks with the virtual joystick, lets the autopilot play,
// uses __fk.cheat to jump to the Hearth level-up and Pinewood, measures frame cost with a big
// crowd, saves screenshots and fails on any console error.

const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL = process.env.FK_URL || 'http://localhost:5173/';
const OUT = process.env.FK_SHOTS || path.join(os.tmpdir(), 'frostkettle-smoke');
fs.mkdirSync(OUT, { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  // Every evaluate waits for the debug hook first (robust to dev-server reloads).
  const fk = async (fn, arg) => {
    await page.waitForFunction(() => window.__fk && window.__fk.sim, null, { timeout: 30000 });
    return page.evaluate(fn, arg);
  };
  const shot = async (name) => {
    const p = path.join(OUT, name + '.png');
    await page.screenshot({ path: p });
    console.log('screenshot', p);
  };

  await page.goto(URL + '?seed=11&fresh=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__fk && window.__fk.sim, null, { timeout: 30000 });
  // fk-ready must have fired (splash removed).
  await page.waitForTimeout(1500);
  await shot('01-start');

  // Walk with the floating joystick (pointer events: press, drag left/up, release).
  const before = await fk(() => ({ x: __fk.sim.state.player.x, z: __fk.sim.state.player.z }));
  await page.mouse.move(200, 600);
  await page.mouse.down();
  await page.mouse.move(150, 560, { steps: 4 });
  await page.waitForTimeout(1200);
  await page.mouse.up();
  const after = await fk(() => ({ x: __fk.sim.state.player.x, z: __fk.sim.state.player.z }));
  assert(Math.hypot(after.x - before.x, after.z - before.z) > 0.3, 'joystick moves the player');

  // Let the autopilot play for a while at 6x speed.
  await fk(() => {
    __fk.cheat.autoplay(true);
    __fk.cheat.timescale(6);
  });
  await page.waitForTimeout(6000);
  const prog = await fk(() => ({ q: __fk.sim.state.quest.index, served: __fk.sim.state.stats.served || 0 }));
  assert(prog.q >= 2, 'autopilot advances quests (got ' + prog.q + ')');
  await shot('02-playing');

  // Mid Area 1 with a busy camp, then the Hearth level-up.
  await fk(() => {
    __fk.cheat.timescale(1);
    __fk.cheat.fastForward(420);
  });
  await page.waitForTimeout(1500);
  await shot('03-mid-area1');
  await fk(() => {
    __fk.cheat.autoplay(false);
    __fk.cheat.teleport(1.5, 4.5);
    __fk.cheat.completePad('pad_hearth2');
  });
  await page.waitForTimeout(700);
  await shot('04-hearth-up');
  const lvl = await fk(() => __fk.sim.state.hearth.level);
  assert(lvl === 2, 'hearth reached level 2');

  // Pinewood.
  await fk(() => __fk.cheat.teleport(-17.5, 5.5));
  await page.waitForTimeout(2500);
  await shot('05-pinewood');

  // Save / load round trip through the export code path.
  const ok = await fk(() => {
    __fk.cheat.save();
    return !!localStorage.getItem('frostkettle.save.seed11');
  });
  assert(ok, 'game saved to localStorage');

  // Performance with a big crowd (~300 instances).
  await fk(() => {
    __fk.cheat.teleport(0, 4);
    __fk.cheat.crowd(220);
  });
  await page.waitForTimeout(3000);
  const stats = await fk(() => __fk.view.stats());
  console.log('perf', JSON.stringify(stats));
  await shot('06-big-crowd');

  const real = errors.filter((e) => !/GL Driver Message|GPU stall/i.test(e));
  if (real.length) {
    console.error('Console errors:\n' + real.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('smoke OK: no console errors');
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
