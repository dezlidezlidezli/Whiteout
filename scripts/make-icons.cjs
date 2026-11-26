#!/usr/bin/env node
// Rasterise the Frostkettle icon (scripts/icon-art.cjs) into public/icons/ and
// render iOS launch images into public/splash/, using the globally installed Playwright.
//   node scripts/make-icons.cjs            -> writes public/icons + public/splash
//   node scripts/make-icons.cjs --preview <dir>  -> also writes a preview sheet PNG there
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { iconSvg } = require('./icon-art.cjs');

const root = path.resolve(__dirname, '..');
const iconsDir = path.join(root, 'public', 'icons');
const splashDir = path.join(root, 'public', 'splash');

// [cssWidth, cssHeight, dpr] — portrait iPhones that support Add to Home Screen today.
const DEVICES = [
  [375, 667, 2], [414, 736, 3], [375, 812, 3], [414, 896, 2], [414, 896, 3],
  [390, 844, 3], [428, 926, 3], [393, 852, 3], [430, 932, 3], [402, 874, 3],
  [440, 956, 3], [420, 912, 3],
];

function splashHtml(w, h) {
  const icon = Math.round(Math.min(w, h) * 0.34);
  return `<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;
    background:#0e1626;
    font-family:-apple-system,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="width:${icon}px;height:${icon}px;border-radius:${icon * 0.23}px;overflow:hidden;
      ">${iconSvg({ size: icon })}</div>
    <div style="margin-top:${icon * 0.2}px;color:#f6e7cf;font-weight:800;letter-spacing:.04em;font-size:${Math.round(icon * 0.22)}px;
      text-shadow:0 2px 12px rgba(255,150,60,.35)">Frostkettle</div>
  </body></html>`;
}

async function shot(page, html, w, h, file, dpr = 1) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: h }, omitBackground: false });
  void dpr;
}

const iconPage = (svg, n) =>
  `<!doctype html><html><body style="margin:0;width:${n}px;height:${n}px;overflow:hidden">${svg}</body></html>`;

(async () => {
  fs.mkdirSync(iconsDir, { recursive: true });
  fs.mkdirSync(splashDir, { recursive: true });
  fs.writeFileSync(path.join(iconsDir, 'icon.svg'), iconSvg({ size: 1024 }).replace(/ width="1024" height="1024"/, '') + '\n');

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const out = [
    ['apple-touch-icon.png', 180, 1],
    ['icon-192.png', 192, 1],
    ['icon-512.png', 512, 1],
    ['icon-maskable-512.png', 512, 0.78],
    ['icon-maskable-192.png', 192, 0.78],
    ['favicon-32.png', 32, 1],
    ['favicon-16.png', 16, 1],
  ];
  for (const [name, n, scale] of out) {
    await shot(page, iconPage(iconSvg({ scale, size: n }), n), n, n, path.join(iconsDir, name));
    console.log('icon', name);
  }

  for (const [w, h, dpr] of DEVICES) {
    const p = await browser.newPage({ deviceScaleFactor: dpr });
    const file = path.join(splashDir, `launch-${w * dpr}x${h * dpr}.png`);
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(splashHtml(w, h), { waitUntil: 'load' });
    await p.screenshot({ path: file });
    await p.close();
    console.log('splash', path.basename(file));
  }

  const pi = process.argv.indexOf('--preview');
  if (pi > 0) {
    const dir = process.argv[pi + 1];
    fs.mkdirSync(dir, { recursive: true });
    const img = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(iconsDir, f)).toString('base64');
    const tile = (f, s, r) => `<img src="${img(f)}" style="width:${s}px;height:${s}px;border-radius:${r}">`;
    const html = `<!doctype html><body style="margin:0;padding:24px;background:#888;display:flex;gap:24px;align-items:center;flex-wrap:wrap;width:1100px">
      ${tile('icon-512.png', 512, '22.5%')}
      <div style="display:flex;flex-direction:column;gap:16px">${tile('apple-touch-icon.png', 120, '22.5%')}${tile('apple-touch-icon.png', 60, '22.5%')}${tile('favicon-32.png', 32, '0')}</div>
      ${tile('icon-maskable-512.png', 300, '50%')}
      <div style="background:url(${img('icon-maskable-512.png')}) center/300px;width:300px;height:300px;clip-path:inset(10% round 20%)"></div>
    </body>`;
    const pv = await browser.newPage();
    await pv.setViewportSize({ width: 1150, height: 1000 });
    await pv.setContent(html);
    await pv.screenshot({ path: path.join(dir, 'icon-preview.png'), fullPage: true });
    // simulated home screen row at true size on a wallpaper
    const home = `<!doctype html><body style="margin:0;width:390px;height:200px;background:linear-gradient(#3a5c7c,#7a9cb0);display:flex;gap:27px;padding:30px 27px;box-sizing:border-box">
      ${['#4caf50', '#2196f3', '', '#ff9800'].map((c) => c ? `<div style="width:60px;height:60px;border-radius:14px;background:${c}"></div>` : tile('apple-touch-icon.png', 60, '14px')).join('')}
    </body>`;
    const ph = await browser.newPage({ deviceScaleFactor: 3 });
    await ph.setViewportSize({ width: 390, height: 200 });
    await ph.setContent(home);
    await ph.screenshot({ path: path.join(dir, 'icon-homescreen.png') });
    console.log('preview written to', dir);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
