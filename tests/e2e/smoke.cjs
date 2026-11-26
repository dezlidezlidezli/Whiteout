// Browser smoke test (Playwright, globally preinstalled — never `npm install playwright`).
//
//   npm run dev -- --port 5173 --strictPort &
//   node tests/e2e/smoke.cjs                 # FK_URL=http://localhost:5173/ FK_SHOTS=/some/dir
//
// iPhone viewport. Covers: title -> Begin, real touch joystick (dead zone, second finger ignored,
// touches on HUD buttons never move the player), autopilot play, Hearth level-up, Pinewood,
// save on `fk-before-update`, visibility pause, resize/orientation, WebGL context loss + restore,
// a big-crowd perf sample, screenshots, and zero console errors.

const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL = process.env.FK_URL || 'http://localhost:5173/';
const OUT = process.env.FK_SHOTS || path.join(os.tmpdir(), 'frostkettle-smoke');
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
  const cdp = await context.newCDPSession(page);
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
    await page.screenshot({ path: p, timeout: 60000 });
    console.log('screenshot', p);
  };
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const pos = () => fk(() => ({ x: __fk.sim.state.player.x, z: __fk.sim.state.player.z }));
  const moved = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // ---- title
  await page.goto(URL + '?seed=11&fresh=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__fk && window.__fk.sim, null, { timeout: 30000 });
  await page.waitForSelector('.fk-begin', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot('00-title');
  await page.tap('.fk-begin', { force: true });
  await page.waitForTimeout(1200);
  assert(await page.evaluate(() => !document.querySelector('.fk-title:not(.fk-leave)')), 'Begin leaves the title');
  await shot('01-start');

  // ---- joystick under real touch events
  let a = await pos();
  await touch('touchStart', [[200, 600, 1]]);
  await touch('touchMove', [[203, 602, 1]]); // inside the dead zone
  await page.waitForTimeout(400);
  let b = await pos();
  assert(moved(a, b) < 0.05, 'dead zone: tiny drag does not move');
  await touch('touchMove', [[140, 560, 1]]);
  await page.waitForTimeout(900);
  b = await pos();
  assert(moved(a, b) > 0.5, 'drag moves the player');
  // A second finger must not steal or re-centre the stick.
  const m1 = await fk(() => __fk.sim.getMove());
  await touch('touchMove', [[140, 560, 1], [330, 300, 2]]);
  await touch('touchMove', [[140, 560, 1], [380, 200, 2]]);
  await page.waitForTimeout(300);
  const m2 = await fk(() => __fk.sim.getMove());
  assert(Math.hypot(m1.x - m2.x, m1.z - m2.z) < 0.02 && Math.hypot(m2.x, m2.z) > 0.5, 'second finger ignored (stick vector unchanged)');
  await touch('touchEnd', [[380, 200, 2]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(400);
  // Touch that starts on a HUD button never moves the player.
  const gear = await page.$eval('.fk-btn', (e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  a = await pos();
  await touch('touchStart', [[gear[0], gear[1], 3]]);
  await touch('touchMove', [[gear[0] - 120, gear[1] + 200, 3]]);
  await page.waitForTimeout(500);
  await touch('touchEnd', []);
  b = await pos();
  assert(moved(a, b) < 0.05, 'touch starting on a HUD button does not move the player');
  await page.waitForTimeout(400);
  const sheetOpen = await page.$eval('.fk-sheet', (e) => e.classList.contains('fk-open'));
  if (sheetOpen) {
    await page.tap('.fk-close', { force: true });
    await page.waitForTimeout(400);
  }

  // ---- autopilot play
  await fk(() => {
    __fk.cheat.autoplay(true);
    __fk.cheat.timescale(6);
  });
  await page.waitForTimeout(6000);
  const prog = await fk(() => ({ q: __fk.sim.state.quest.index }));
  assert(prog.q >= 2, 'autopilot advances quests (got ' + prog.q + ')');
  await shot('02-playing');

  // ---- mid Area 1, Hearth level-up, Pinewood
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
  assert((await fk(() => __fk.sim.state.hearth.level)) === 2, 'hearth reached level 2');
  await fk(() => __fk.cheat.teleport(-17.5, 1.6));
  await page.waitForTimeout(2500);
  await shot('05-pinewood');

  // ---- saving
  await fk(() => localStorage.removeItem('frostkettle.save.seed11'));
  await fk(() => window.dispatchEvent(new Event('fk-before-update')));
  assert(await fk(() => !!localStorage.getItem('frostkettle.save.seed11')), 'fk-before-update saves the game');

  // ---- visibility pause
  const t0 = await fk(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    return __fk.sim.state.time;
  });
  await page.waitForTimeout(1200);
  const t1 = await fk(() => __fk.sim.state.time);
  assert(Math.abs(t1 - t0) < 0.05, 'sim pauses while hidden');
  await fk(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(800);
  assert((await fk(() => __fk.sim.state.time)) > t1, 'sim resumes when visible');

  // ---- resize / orientation
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(800);
  const land = await fk(() => ({ w: __fk.view.renderer.domElement.width, h: __fk.view.renderer.domElement.height }));
  assert(land.w > land.h, 'canvas follows landscape resize');
  await shot('06-landscape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);

  // ---- WebGL context loss + restore
  await fk(() => {
    window.__fkLose = __fk.view.renderer.getContext().getExtension('WEBGL_lose_context');
    window.__fkLose.loseContext();
  });
  await page.waitForTimeout(800);
  await fk(() => window.__fkLose.restoreContext());
  await page.waitForTimeout(2500);
  const after = await fk(() => ({ lost: __fk.view.renderer.getContext().isContextLost(), calls: __fk.view.stats().calls }));
  assert(!after.lost && after.calls > 10, 'rendering recovers after context restore (' + after.calls + ' calls)');
  await shot('07-after-context-restore');

  // ---- frame budget: steady-state never runs more than 4 sim steps in a frame, and the
  // per-frame JS (sim + view logic + HUD, GL submit excluded) stays well inside a 60 Hz frame.
  const perf = await fk(() => __fk.cheat.perf(120));
  assert(perf.stepsMax <= 4, 'at most 4 sim steps per frame (got ' + perf.stepsMax + ')');
  const bench = await fk(() => __fk.cheat.bench(240));
  console.log('js bench', JSON.stringify(bench));
  assert(bench.total.p95 < 8, 'per-frame JS p95 under 8 ms (got ' + bench.total.p95 + ')');

  // ---- big crowd perf sample
  await fk(() => {
    __fk.cheat.teleport(0, 4);
    __fk.cheat.crowd(150);
  });
  await page.waitForTimeout(3000);
  console.log('perf', JSON.stringify(await fk(() => __fk.view.stats())));

  const real = errors.filter((e) => !/GL Driver Message|GPU stall|CONTEXT_LOST_WEBGL/i.test(e));
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
