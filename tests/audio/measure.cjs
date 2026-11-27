// Objective audio checks: renders every sfx, streaks and music moods offline in Chromium through
// the real engine graph and checks levels, clicks, DC, durations, spectra and loudness balance.
// Usage: npm run dev -- --port 5175 --strictPort   (in another shell), then
//        node tests/audio/measure.cjs [baseUrl]
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:5175/';

// intended character: [centroid lo, hi] Hz, [duration lo, hi] s, loudness class
const EXPECT = {
  pickup: [300, 2500, 0.05, 0.5, 'normal'],
  drop: [150, 1500, 0.05, 0.5, 'normal'],
  ember: [700, 4000, 0.15, 1.5, 'normal'],
  thaw: [500, 4500, 0.8, 2.5, 'normal'],
  serve: [500, 3000, 0.15, 1.0, 'normal'],
  craft: [300, 2500, 0.1, 1.0, 'normal'],
  padTick: [900, 4000, 0.01, 0.2, 'quiet'],
  padComplete: [150, 3000, 0.3, 1.8, 'normal'],
  unlock: [400, 3500, 0.8, 3.5, 'big'],
  questComplete: [400, 3000, 0.5, 2.5, 'big'],
  chop: [300, 2500, 0.04, 0.4, 'normal'],
  treeFall: [80, 1500, 0.9, 2.5, 'normal'],
  mine: [500, 4000, 0.05, 0.6, 'normal'],
  iceCrack: [900, 6000, 0.1, 0.9, 'normal'],
  splash: [400, 4000, 0.15, 1.0, 'normal'],
  hammer: [300, 3000, 0.04, 0.5, 'normal'],
  hearthUp: [80, 1200, 1.5, 4.5, 'big'],
  fanfare: [250, 2500, 2.5, 5.0, 'big'],
  uiTap: [600, 3000, 0.01, 0.2, 'quiet'],
  error: [200, 1200, 0.15, 0.8, 'normal'],
  footstep: [900, 5000, 0.02, 0.25, 'quiet'],
  arrive: [250, 2500, 0.2, 1.5, 'quiet'],
  order: [400, 3500, 0.3, 1.5, 'normal'],
  orderNew: [800, 4500, 0.1, 0.8, 'normal'],
  upgrade: [700, 3500, 0.2, 1.2, 'normal'],
  beaconStage: [60, 900, 1.2, 4.0, 'big'],
  dawn: [150, 2000, 5.5, 9.5, 'big'],
  ploughFind: [150, 2500, 0.2, 1.2, 'normal'],
  zoneCleared: [500, 3500, 0.8, 2.5, 'big'],
  dig: [500, 3500, 0.05, 0.4, 'normal'],
  rescued: [300, 2500, 0.8, 2.6, 'normal'],
  followerWait: [500, 2500, 0.1, 0.5, 'quiet'],
  followerHome: [300, 2500, 0.4, 1.8, 'normal'],
  lanternOn: [300, 3500, 0.15, 0.9, 'normal'],
  allFound: [250, 2500, 2.2, 4.5, 'big'],
  fishLeapSpawn: [700, 4000, 0.02, 0.2, 'quiet'],
  fishLeapCatch: [300, 3000, 0.1, 0.9, 'normal'],
  skateBounce: [100, 1200, 0.05, 0.4, 'normal'],
  crankNotch: [800, 4000, 0.005, 0.1, 'quiet'],
  crankTurn: [100, 1500, 0.2, 0.8, 'normal'],
  liftArrive: [300, 3000, 0.2, 1.0, 'normal'],
  bellows: [250, 1500, 0.2, 0.8, 'normal'],
  flameTaken: [150, 1500, 0.3, 1.4, 'normal'],
  flameLow: [100, 1200, 0.3, 1.2, 'quiet'],
  flameOut: [250, 1500, 0.3, 1.4, 'normal'],
  brazierLit: [100, 1500, 0.8, 2.6, 'big'],
  trailComplete: [200, 2500, 1.2, 3.5, 'big'],
};

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : String(x));

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + 'audio-test.html');
  await page.waitForFunction(() => !!window.__audioLab);
  const fails = [];
  const fail = (msg) => fails.push(msg);
  // Other work in the repo can make the dev server full-reload the page; retry across reloads.
  const lab = async (fn, arg) => {
    for (let attempt = 0; ; attempt++) {
      try {
        await page.waitForFunction(() => !!window.__audioLab);
        return await page.evaluate(fn, arg);
      } catch (e) {
        if (attempt >= 4 || !/context was destroyed|navigation/i.test(String(e))) throw e;
        await page.waitForTimeout(1000);
      }
    }
  };

  // ---- sfx
  const names = await lab(() => window.__audioLab.names);
  const rows = [];
  for (const n of names) {
    const m = await lab((n) => window.__audioLab.sfx(n), n);
    // a second render at another seed/pitch to make sure variation stays in bounds
    const m2 = await lab((n) => window.__audioLab.sfx(n, 1.6, 999), n);
    rows.push({ n, m, m2 });
  }
  const normals = rows
    .filter((r) => EXPECT[r.n][4] === 'normal')
    .map((r) => r.m.loudDb)
    .sort((a, b) => a - b);
  const median = normals[Math.floor(normals.length / 2)];
  console.log('\nSFX (rendered through the full engine, default volume 0.8)');
  console.log('name           peak  loud  dMed   rms   dur  cent  atk spike    dc     tail | p1.6: peak loud');
  for (const { n, m, m2 } of rows) {
    const [clo, chi, dlo, dhi, cls] = EXPECT[n];
    const d = m.loudDb - median;
    console.log(
      `${n.padEnd(14)} ${f1(m.peakDb).padStart(5)} ${f1(m.loudDb).padStart(5)} ${f1(d).padStart(5)} ${f1(m.rmsDb).padStart(5)} ${m.dur
        .toFixed(2)
        .padStart(5)} ${String(Math.round(m.centroid)).padStart(5)} ${m.attack.toFixed(2).padStart(4)} ${m.spike.toFixed(1).padStart(5)} ${f3(m.dc)} ${m.tail.toExponential(1).padStart(8)} | ${f1(m2.peakDb).padStart(5)} ${f1(m2.loudDb).padStart(5)}`,
    );
    for (const [tag, x] of [
      ['', m],
      ['@p1.6 ', m2],
    ]) {
      if (x.peakDb < -45) fail(`${n} ${tag}silent (peak ${f1(x.peakDb)})`);
      // a single sound at default volume must leave >= 4 dB headroom (volume 1.0 adds ~2 dB)
      if (x.peakDb > -4 || x.clipped > 0) fail(`${n} ${tag}peak too hot ${f1(x.peakDb)} dBFS (clipped ${x.clipped})`);
      if (x.dc > 0.02) fail(`${n} ${tag}DC offset ${f3(x.dc)}`);
      if (x.tail > 1e-4) fail(`${n} ${tag}does not end at zero (tail ${x.tail})`);
      if (x.spike > 12) fail(`${n} ${tag}isolated spike/click (ratio ${f1(x.spike)})`);
      if (x.attack > 0.5) fail(`${n} ${tag}onset click (first 0.25 ms at ${f3(x.attack)} of peak)`);
    }
    if (m.centroid < clo || m.centroid > chi) fail(`${n} centroid ${Math.round(m.centroid)} Hz outside ${clo}-${chi}`);
    if (m.dur < dlo || m.dur > dhi) fail(`${n} duration ${m.dur.toFixed(2)} s outside ${dlo}-${dhi}`);
    if (cls === 'normal' && Math.abs(d) > 4) fail(`${n} loudness ${f1(d)} dB from median (normal class +-4)`);
    if (cls === 'quiet' && (d > 0 || d < -12)) fail(`${n} loudness ${f1(d)} dB (quiet class -12..0)`);
    if (cls === 'big' && (d > 4 || d < -3)) fail(`${n} loudness ${f1(d)} dB (big class -3..+4)`);
  }
  console.log(`median loudness (normal class): ${f1(median)} dBFS`);

  // ---- streaks
  console.log('\nStreaks');
  const streaks = [
    ['pickup', 30, 30],
    ['ember', 30, 30],
    ['pickup', 60, 60],
    ['padTick', 60, 40],
    ['footstep', 40, 20],
    ['crankNotch', 48, 12, true],
    ['crankNotch', 60, 20, true],
    ['fishLeapCatch', 12, 3],
    ['dig', 16, 6, true],
    ['bellows', 12, 4, true],
  ];
  for (const [n, count, rate, flat] of streaks) {
    const m = await lab(([n, c, r, fl]) => window.__audioLab.streak(n, c, r, fl), [n, count, rate, !!flat]);
    console.log(
      `${(n + ' x' + count + ' @' + rate + '/s').padEnd(24)} peak ${f1(m.peakDb)}  loud ${f1(m.loudDb)}  clipped ${m.clipped}  tail ${m.tail.toExponential(1)}`,
    );
    if (m.peakDb > -1 || m.clipped) fail(`${n} streak too hot: ${f1(m.peakDb)} dBFS`);
    if (m.loudDb - median > 7) fail(`${n} streak stacks ${f1(m.loudDb - median)} dB over a single sfx`);
  }
  const all = await lab(() => window.__audioLab.allAtOnce());
  console.log(`${'ALL sfx at once + music'.padEnd(24)} peak ${f1(all.peakDb)}  loud ${f1(all.loudDb)}  clipped ${all.clipped}`);
  if (all.clipped || all.peakDb > -0.3) fail(`everything-at-once clips: ${f1(all.peakDb)}`);

  // ---- music
  console.log('\nMusic (20 s, offline)');
  console.log('mood      peak   rms  loud   cent  active  renderMs');
  const moods = await lab(() => window.__audioLab.moods);
  for (const mood of moods) {
    const m = await lab((mood) => window.__audioLab.music(mood, 20), mood);
    console.log(
      `${mood.padEnd(8)} ${f1(m.peakDb).padStart(5)} ${f1(m.rmsDb).padStart(5)} ${f1(m.loudDb).padStart(5)} ${String(
        Math.round(m.centroid),
      ).padStart(6)} ${m.activeFrac.toFixed(2).padStart(6)} ${String(Math.round(m.renderMs)).padStart(8)}`,
    );
    if (m.peakDb < -50) fail(`music ${mood} silent`);
    if (m.peakDb > -3 || m.clipped) fail(`music ${mood} too hot ${f1(m.peakDb)}`);
    if (m.activeFrac < 0.6) fail(`music ${mood} has dead air ${m.activeFrac.toFixed(2)}`);
    if (m.rmsDb > median - 6) fail(`music ${mood} not under the sfx (rms ${f1(m.rmsDb)} vs sfx ${f1(median)})`);
    if (m.dc > 0.02) fail(`music ${mood} DC ${f3(m.dc)}`);
    if (m.spike > 12) fail(`music ${mood} click (spike ratio ${f1(m.spike)})`);
    if (m.centroid < 150 || m.centroid > 2500) fail(`music ${mood} centroid ${Math.round(m.centroid)}`);
  }

  // ---- ambience
  console.log('\nAmbience (6 s)');
  const ambs = [
    { wind: 1 },
    { wind: 0.3 },
    { fire: 1 },
    { crowd: 1 },
    { camp: 1 },
    { plough: 1 },
    { plough: 0.3 },
    { skate: 1 },
    { skate: 0.3 },
    { forge: 1 },
    { forge: 0.3 },
    { flame: 1 },
    { flame: 0.3 },
    { gust: 1 },
    { wind: 1, gust: 1 },
    { wind: 1, fire: 1, crowd: 1, camp: 1 },
    { wind: 1, gust: 1, flame: 1 }, // Trail of Light
    { wind: 1, plough: 1 },
    { forge: 1, fire: 1, camp: 1 },
  ];
  // [centroid lo, hi] per bed when it plays alone at level 1
  const AMB_CENT = { wind: [300, 1500], fire: [300, 2000], crowd: [120, 900], camp: [150, 1500], plough: [600, 3500], skate: [1500, 7000], forge: [100, 1500], flame: [150, 1500], gust: [400, 1800] };
  const brightness = {};
  for (const lv of ambs) {
    const m = await lab((lv) => window.__audioLab.ambience(lv), lv);
    const keys = Object.keys(lv);
    const tag = 'ambience ' + keys.map((k) => `${k}=${lv[k]}`).join(' ');
    console.log(`${tag.padEnd(58)} peak ${f1(m.peakDb)} rms ${f1(m.rmsDb)} cent ${Math.round(m.centroid)} active ${m.activeFrac.toFixed(2)}`);
    const sum = keys.reduce((a, k) => a + lv[k], 0);
    const maxLv = Math.max(...keys.map((k) => lv[k]));
    if (m.peakDb < -50) fail(`${tag} silent`);
    if (m.peakDb > -3 || m.clipped) fail(`${tag} too hot`);
    if (m.rmsDb > median - 4) fail(`${tag} louder than sfx`);
    if (m.dc > 0.02) fail(`${tag} DC ${f3(m.dc)}`);
    if (m.spike > 12) fail(`${tag} click (spike ${f1(m.spike)})`);
    if (maxLv === 1 && m.activeFrac < 0.9) fail(`${tag} drops out (${m.activeFrac.toFixed(2)})`);
    if (keys.length === 1 && sum === 1 && m.rmsDb > median - 8) fail(`${tag} too loud for a background bed`);
    if (keys.length === 1 && sum === 1) {
      const [lo, hi] = AMB_CENT[keys[0]];
      if (m.centroid < lo || m.centroid > hi) fail(`${tag} centroid ${Math.round(m.centroid)} outside ${lo}-${hi}`);
    }
    if (keys.length === 1) (brightness[keys[0]] = brightness[keys[0]] || {})[lv[keys[0]]] = m.centroid;
  }
  // level-tracking beds must get brighter as their level rises
  for (const k of ['plough', 'skate', 'forge', 'flame']) {
    const b = brightness[k];
    if (b && b[1] <= b[0.3] * 1.1) fail(`ambience ${k} does not brighten with level (${Math.round(b[0.3])} -> ${Math.round(b[1])} Hz)`);
  }

  // ---- live playback after a real click (retried if the dev server reloads the page mid-way)
  console.log('\nLive');
  const live = async () => {
    await page.reload();
    await page.waitForFunction(() => !!window.__audioLab);
    errors.length = 0;
    await page.click('#sfx button');
    await page.waitForTimeout(200);
    const btns = await page.$$('#sfx button');
    for (const b of btns.slice(0, 8)) await b.click();
    await page.click('#streaks button');
    await page.click('#moods button:nth-child(2)');
    await page.waitForTimeout(2500);
    await page.click('#moods button:nth-child(3)');
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => window.__audioLab.liveState());
    // suspend / resume round trip through the public API
    const sr = await page.evaluate(async () => {
      const audio = window.__audioLab.api;
      audio.suspend();
      await new Promise((r) => setTimeout(r, 300));
      const a = window.__audioLab.liveState();
      audio.resume();
      await new Promise((r) => setTimeout(r, 300));
      return [a, window.__audioLab.liveState()];
    });
    return { state, sr };
  };
  let res = null;
  for (let i = 0; i < 3; i++) {
    try {
      res = await live();
      if (/context: running/.test(res.state)) break;
    } catch (e) {
      if (i === 2) throw e;
    }
  }
  console.log(res.state);
  console.log('suspend ->', res.sr[0], '| resume ->', res.sr[1]);
  if (!/context: running/.test(res.state)) fail(`live context not running: ${res.state}`);
  if (!/mood: cozy/.test(res.state)) fail(`live mood did not switch: ${res.state}`);
  if (!/suspended/.test(res.sr[0]) || !/running/.test(res.sr[1])) fail('suspend/resume did not round-trip');
  if (errors.length) fail('console errors: ' + errors.join(' | '));

  await browser.close();
  console.log('\n' + (fails.length ? `FAIL (${fails.length})\n - ` + fails.join('\n - ') : 'ALL AUDIO CHECKS PASSED'));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
