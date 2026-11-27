// Mechanic presentation e2e (Playwright, globally preinstalled). Runs each mechanic behind ?mech=
// and asserts its visuals respond to play. Usage: node tests/e2e/mechanics.cjs [plough]
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
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
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

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    if (!only || only === 'plough') await plough(browser);
    console.log('mechanics OK');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
