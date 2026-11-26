# Frostkettle

A cosy little camp game about a copper kettle in a frozen valley. Carry fish, cook stew, thaw the
frozen villagers and help them relight the valley. It has no ads, no purchases, no timers and no
accounts, and it works offline.

Play it at **https://dezlidezlidezli.github.io/Whiteout/**

## Put it on your iPhone

1. Open the link above in **Safari**.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open Frostkettle from its new icon. It runs fullscreen in portrait, like a normal app.

After the first launch it works without internet. Updates download quietly in the background and
appear the next time you open the app, or when you come back after a break. Your game is never
interrupted.

## Your save

- Progress saves automatically on your device: every few seconds, and when you leave the app.
- The app installed on your Home Screen and the Safari tab keep **separate** saves. Play from the
  Home Screen icon.
- To back up or move a save, open **Settings → Export** in the game and keep the text code
  somewhere safe, like Notes. Paste it back with **Settings → Import**.
- Deleting the Home Screen icon deletes its save, so export first.

## Run it on a computer

You need Node.js 22.

```sh
npm install
npm run dev          # play at the address it prints (also works from a phone on the same Wi-Fi)
npm test             # game logic tests and the robot that plays the whole campaign
npm run build        # production build in dist/
node scripts/serve-subpath.cjs   # serve dist/ at http://localhost:4176/Whiteout/ like GitHub Pages
```

Offline support only runs in the production build, never in `npm run dev`.

## How deploys work

Every push to `main` runs `.github/workflows/deploy.yml`: install, test, build, then publish
`dist/` to GitHub Pages. Pushes to the development branch `claude/whiteout-survival-game-kxixxo`
are built and tested too.

One-time setup on GitHub:

1. **Settings → Pages**: under "Build and deployment", set **Source** to **GitHub Actions**.
2. Optional, only if you want to play the development branch before it is merged:
   **Settings → Environments → github-pages → Deployment branches and tags → Add deployment
   branch or tag rule**, type `claude/whiteout-survival-game-kxixxo` and save. (Or simply merge
   the branch into `main`.) There is a single site, so whichever branch was pushed last is the one
   you play.

To publish again without pushing anything: **Actions → Deploy to GitHub Pages → Run workflow**.

## For developers

- Design and architecture: `docs/DESIGN.md`.
- App icons and iPhone launch images: `node scripts/make-icons.cjs` (artwork in `scripts/icon-art.cjs`).
- The service worker is generated at build time by the `fk-pwa` plugin in `vite.config.ts` from
  `scripts/sw-template.js`. Registration lives in `src/platform/pwa.ts`.
