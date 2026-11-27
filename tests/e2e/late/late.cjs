// Late-game browser test (Playwright, globally preinstalled — never `npm install playwright`).
//
//   FK_URL=http://localhost:5173/ node tests/e2e/late/late.cjs      # FK_SHOTS=/some/dir for screenshots
//
// iPhone viewport. Covers: Open Season HUD (three order cards, progress, completion), upgrade pad
// badge, decorations, Journal (button, tabs, Found page only once rescue state exists), the finale
// (Beacon lit, skip by touch, credits card, continue into Open Season), resume mid-finale after a
// reload, the permanent dawn end state, and zero console errors.

const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL = process.env.FK_URL || 'http://localhost:5173/';
const OUT = process.env.FK_SHOTS || path.join(os.tmpdir(), 'frostkettle-late');
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
  const ready = () => page.waitForFunction(() => window.__fk && window.__fk.sim && window.__fk.cheat.lateOpenSeason, null, { timeout: 60000 });
  const fk = async (fn, arg) => {
    await ready();
    return page.evaluate(fn, arg);
  };
  const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 120000 });
  const until = async (fn, ms, what) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await fk(fn)) return true;
      await page.waitForTimeout(250);
    }
    throw new Error('timeout: ' + what);
  };

  try {
    // ---------------------------------------------------------------- before the late game: nothing shows
    await page.goto(URL + '?seed=31&fresh=1&skiptitle=1', { waitUntil: 'load' });
    await ready();
    await page.waitForTimeout(800);
    assert(await page.evaluate(() => !document.querySelector('.fk-orders:not(.fk-hidden)')), 'no orders tracker before Open Season');
    assert(await page.evaluate(() => !!document.querySelector('.fk-journal-btn.fk-hidden')), 'Journal button hidden early on');

    // ---------------------------------------------------------------- finale: start, skip, credits
    await fk(() => window.__fk.cheat.lateReady());
    await page.waitForTimeout(600);
    assert(await page.evaluate(() => !document.querySelector('.fk-journal-btn.fk-hidden')), 'Journal button appears once the Beacon is under way');
    await fk(() => window.__fk.cheat.lateFinale());
    assert((await fk(() => window.__fk.sim.state.finale.phase)) === 'lighting', 'last Beacon stage starts the finale');
    await until(() => document.querySelector('.fk-ui.fk-cinema') !== null, 10000, 'cinema mode');
    await until(() => window.__fk.sim.state.finale.t > 2.5 || window.__fk.sim.state.finale.phase !== 'lighting', 60000, 'finale runs');
    await shot('finale-lighting');
    // Close the app mid-finale: the save resumes the sequence.
    await fk(() => window.__fk.cheat.save());
    await page.goto(URL + '?seed=31&skiptitle=1', { waitUntil: 'load' });
    await ready();
    const ph = await fk(() => window.__fk.sim.state.finale.phase);
    assert(ph === 'lighting' || ph === 'dawn', 'reload keeps the finale going (' + ph + ')');
    await until(() => document.querySelector('.fk-ui.fk-cinema') !== null, 10000, 'cinema resumes after reload');
    await page.waitForTimeout(2500);
    await page.touchscreen.tap(195, 600);
    await until(() => !!document.querySelector('.fk-credits'), 15000, 'touch skips to the credits');
    await page.waitForTimeout(2500);
    await shot('finale-credits');
    assert(await page.evaluate(() => /Long Night/.test(document.querySelector('.fk-credits').textContent)), 'credits card shows');
    await page.click('.fk-cr-go', { force: true });
    await until(() => !document.querySelector('.fk-credits'), 5000, 'credits close');
    await fk(() => window.__fk.cheat.lateAdvance(20));
    assert((await fk(() => window.__fk.sim.state.finale.phase)) === 'done', 'finale done');
    await page.waitForTimeout(1500);

    // ---------------------------------------------------------------- Open Season HUD
    await until(() => document.querySelectorAll('.fk-orders:not(.fk-hidden) .fk-ord').length === 3, 10000, 'three order cards');
    const o = await fk(() => window.__fk.sim.state.orders[0]);
    await fk(() => {
      const s = window.__fk.sim;
      const b = s.stationDefs.get(s.data.endless.board);
      const r = (b.rot || 0);
      window.__fk.cheat.lateGo(b.x + Math.sin(r) * 1.3, b.z + Math.cos(r) * 1.3);
    });
    await fk((o) => window.__fk.cheat.stack(o.item, o.n), o);
    await until(() => window.__fk.sim.state.totals.ordersDone >= 1, 20000, 'an order completes at the board');
    await shot('open-season-order');
    await until(() => document.querySelectorAll('.fk-ord:not(.fk-ord-done)').length === 3, 8000, 'a fresh order replaces it');
    const up = await fk(() => {
      const s = window.__fk.sim;
      const p = s.data.pads.find((x) => x.group === 'upgrade');
      s.completePad(p.id);
      window.__fk.cheat.lateGo(p.x, p.z + 1.2);
      return { id: p.id, lv: s.padLevel(p.id) };
    });
    assert(up.lv === 1, 'upgrade pad levels up');
    const deco = await fk(() => {
      const s = window.__fk.sim;
      const p = s.data.pads.find((x) => x.group === 'decor');
      s.completePad(p.id);
      return p.effects[0].ids[0];
    });
    await page.waitForTimeout(1500);
    assert(await fk((id) => !!window.__fk.sim.state.unlocked[id], deco), 'decoration unlocked');

    // ---------------------------------------------------------------- Journal
    const viaHud = await page.evaluate(() => {
      const b = document.querySelector('.fk-journal-btn');
      return b && getComputedStyle(b).display !== 'none';
    });
    if (viaHud) await page.tap('.fk-journal-btn', { force: true });
    else {
      await page.tap('button[aria-label="Settings"]', { force: true });
      await page.waitForTimeout(500);
      await page.click('.fk-jsettings', { force: true });
    }
    await until(() => !!document.querySelector('.fk-journal.fk-open'), 5000, 'Journal opens');
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.fk-jtabs button')].filter((b) => b.style.display !== 'none').map((b) => b.textContent));
    assert(tabs.join() === 'Stats,Valley', 'Found page hidden until the rescue mechanic exists (' + tabs.join() + ')');
    await page.evaluate(() => [...document.querySelectorAll('.fk-jtabs button')].find((b) => b.textContent === 'Valley').click());
    assert(await page.evaluate(() => document.querySelectorAll('.fk-jarea').length >= 5), 'Valley page lists the areas');
    await page.click('.fk-journal .fk-close', { force: true });
    await page.waitForTimeout(400);

    // ---------------------------------------------------------------- dawn end state survives a reload
    await fk(() => window.__fk.cheat.save());
    await page.goto(URL + '?seed=31&skiptitle=1', { waitUntil: 'load' });
    await ready();
    await page.waitForTimeout(1500);
    assert(await page.evaluate(() => !document.querySelector('.fk-credits')), 'credits do not come back once seen');
    assert(await page.evaluate(() => !document.querySelector('.fk-ui.fk-cinema')), 'no cinematic after the finale');
    await shot('open-season-reloaded');
    assert(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
    console.log('late e2e: all good. Screenshots in', OUT);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
