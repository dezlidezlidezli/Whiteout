# Frostkettle

Original cosy arcade/camp game, installable web app for iPhone. TypeScript + Three.js + Vite.
**Read `docs/DESIGN.md` before changing anything** — it is the design and architecture contract.

## Commands

- `npm run dev` — dev server (pass `-- --port <n>`)
- `npm run typecheck` — tsc
- `npm test` — vitest (sim tests + headless campaign bot)
- `npm run build` — typecheck + production build to `dist/`

## Rules

- `src/sim` and `src/data` are pure TypeScript: no three.js, no DOM, deterministic, seeded RNG.
- View code imports models only from `src/view/models/index.ts` and audio only from
  `src/audio/index.ts`; those exported signatures are a fixed contract.
- No external assets, fonts, CDNs or network calls. No ads, purchases or wait-timers, ever.
- Relative URLs only (the app is served from a sub-path on GitHub Pages).
- Chromium + Playwright are preinstalled globally (`require('playwright')` from a `.cjs` script
  works anywhere). Never `npm install playwright` or run `playwright install`.
- Verify visual work with real screenshots at an iPhone viewport (390×844, deviceScaleFactor 2 or 3).
