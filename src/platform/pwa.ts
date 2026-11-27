// Platform glue for the installed iPhone web app. Loaded from index.html (not from main.ts).
//  - iOS gesture hardening (pinch / double-tap zoom, long-press menus)
//  - standalone detection (`html.fk-standalone`), persistent storage request
//  - service worker registration + safe update flow (production builds only)
//  - a one-time "Add to Home Screen" tip for iOS Safari visitors
//
// Contract for game code:
//  - dispatch `window.dispatchEvent(new Event('fk-ready'))` after the first frame is drawn
//    (removes the loading splash; a 15 s fallback exists)
//  - listen for `fk-update-ready` if you want to show an "update available" control, and call
//    `window.__fkPwa.applyUpdate()` from it (reloads; save first). Otherwise the update is applied
//    automatically at the next launch or when returning after a long break.
//  - scrollable UI panels need `touch-action: pan-y` (body is `touch-action: none`)

export interface FkPwa {
  readonly standalone: boolean;
  readonly ios: boolean;
  /** Version hash of the running service worker cache, when known. */
  version: string | null;
  /** True when a newer version has been downloaded and is waiting. */
  updateReady: boolean;
  /** Activate the waiting version and reload the page. No-op when nothing is waiting. */
  applyUpdate(): void;
  /** Check the server for a new version now. */
  checkForUpdate(): Promise<void>;
}

declare global {
  interface Window {
    __fkPwa?: FkPwa;
  }
  interface Navigator {
    standalone?: boolean;
  }
}

const RELOAD_FLAG = 'fk-sw-reloaded';
const A2HS_KEY = 'fk-a2hs-dismissed';
/** Away at least this long with an update waiting -> apply it on return (counts as a relaunch). */
const LONG_BREAK_MS = 10 * 60 * 1000;
const UPDATE_POLL_MS = 30 * 60 * 1000;

const ua = navigator.userAgent;
const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const standalone =
  navigator.standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode or blocked storage */
  }
}

// ---------------------------------------------------------------- gestures

function isEditable(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

function hardenGestures(): void {
  const stop = (e: Event) => e.preventDefault();
  // Safari's proprietary pinch events.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, stop, { passive: false });
  }
  // Pinch with two fingers on anything.
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener('dblclick', stop, { passive: false });
  document.addEventListener('contextmenu', (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });
  document.addEventListener('selectstart', (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });
  document.addEventListener('dragstart', stop);
}

// ---------------------------------------------------------------- service worker

const state: FkPwa = {
  standalone,
  ios,
  version: null,
  updateReady: false,
  applyUpdate,
  checkForUpdate,
};

let registration: ServiceWorkerRegistration | null = null;
let reloadRequested = false;

function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting) return;
  reloadRequested = true;
  try {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    /* ignore */
  }
  // Give the game a chance to save (it also saves on pagehide).
  window.dispatchEvent(new Event('fk-before-update'));
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

async function checkForUpdate(): Promise<void> {
  try {
    await registration?.update();
  } catch {
    /* offline: try again later */
  }
}

function markUpdateReady(): void {
  if (state.updateReady) return;
  state.updateReady = true;
  window.dispatchEvent(new Event('fk-update-ready'));
}

function watchInstalling(worker: ServiceWorker | null): void {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    // Only an *update* waits; the very first install activates straight away.
    if (worker.state === 'installed' && navigator.serviceWorker.controller) markUpdateReady();
  });
}

function recentlyReloaded(): boolean {
  try {
    const t = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
    return Date.now() - t < 30_000;
  } catch {
    return false;
  }
}

async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Reload only when we asked for the swap; never yank a running session otherwise.
    if (reloadRequested) window.location.reload();
  });
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.type === 'VERSION') state.version = String(e.data.version);
  });

  // updateViaCache 'none': always revalidate sw.js with the server (GitHub Pages caches 10 min).
  registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
  navigator.serviceWorker.controller?.postMessage({ type: 'GET_VERSION' });

  if (registration.waiting && navigator.serviceWorker.controller) {
    // A new version finished downloading during an earlier session: this is a fresh launch,
    // nothing has been played yet, so swap now (behind the splash).
    if (!recentlyReloaded()) {
      applyUpdate();
      return;
    }
    markUpdateReady();
  }
  watchInstalling(registration.installing);
  registration.addEventListener('updatefound', () => watchInstalling(registration!.installing));

  // Look for a new deployment at launch, when coming back to the app, and periodically.
  void checkForUpdate();
  let hiddenAt = 0;
  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    if (state.updateReady && away >= LONG_BREAK_MS) {
      applyUpdate(); // returning after a long break is effectively a relaunch
      return;
    }
    if (Date.now() - lastCheck > 60_000) {
      lastCheck = Date.now();
      void checkForUpdate();
    }
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  }, UPDATE_POLL_MS);
}

async function unregisterDevWorkers(): Promise<void> {
  // A production build previewed on the same origin must not hijack the dev server.
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
}

// ---------------------------------------------------------------- storage

async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* not supported */
  }
}

// ---------------------------------------------------------------- Add to Home Screen tip

function shareIcon(): string {
  return (
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-label="Share" style="vertical-align:-3px">' +
    '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  );
}

/** The title screen is up (the tip lives only there, never over game UI). */
function onTitle(): boolean {
  return !!document.querySelector('.fk-title:not(.fk-leave)');
}

function showInstallTip(): void {
  if (standalone || !ios || storageGet(A2HS_KEY) || !onTitle() || document.getElementById('fk-a2hs')) return;
  const tip = document.createElement('div');
  tip.id = 'fk-a2hs';
  tip.setAttribute('role', 'note');
  tip.style.cssText = [
    'position:fixed',
    'left:50%',
    // Above the title's Begin / New game buttons (clear of the thumb and of the wordmark).
    'bottom:calc(var(--safe-bottom, 0px) + 8vh + 150px)',
    'transform:translate(-50%, 20px)',
    'opacity:0',
    'transition:opacity .35s ease, transform .35s ease',
    'z-index:900',
    'width:min(360px, calc(100vw - 24px))',
    'box-sizing:border-box',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'padding:10px 8px 10px 12px',
    'border-radius:16px',
    'background:rgba(22,36,63,.94)',
    'border:1px solid rgba(255,179,92,.35)',
    'box-shadow:0 8px 28px rgba(0,0,0,.45)',
    'color:#f6e7cf',
    'font:500 13.5px/1.35 -apple-system,system-ui,sans-serif',
    'pointer-events:auto',
    'touch-action:manipulation',
  ].join(';');
  tip.innerHTML =
    '<img src="icons/apple-touch-icon.png" alt="" width="36" height="36" style="border-radius:9px;flex:none">' +
    '<div style="flex:1">Play fullscreen &amp; offline: tap ' +
    shareIcon() +
    ' then <b>Add to Home Screen</b>.</div>' +
    '<button type="button" aria-label="Dismiss" style="flex:none;width:36px;height:36px;border:0;border-radius:10px;' +
    'background:rgba(255,255,255,.08);color:inherit;font:600 18px/1 system-ui;cursor:pointer">&times;</button>';
  let watch = 0;
  const hide = (remember: boolean) => {
    window.clearInterval(watch);
    if (remember) storageSet(A2HS_KEY, '1');
    tip.style.opacity = '0';
    tip.style.transform = 'translate(-50%, 20px)';
    tip.style.pointerEvents = 'none';
    window.setTimeout(() => tip.remove(), 400);
  };
  tip.querySelector('button')!.addEventListener('click', () => hide(true));
  // Gone as soon as the game begins (it comes back on a later visit to the title, until dismissed).
  watch = window.setInterval(() => {
    if (!onTitle()) hide(false);
  }, 200);
  document.body.appendChild(tip);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      tip.style.opacity = '1';
      tip.style.transform = 'translate(-50%, 0)';
    }),
  );
}

// ---------------------------------------------------------------- boot

hardenGestures();
document.documentElement.classList.toggle('fk-standalone', standalone);
document.documentElement.classList.toggle('fk-ios', ios);
window.__fkPwa = state;

if (import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void registerServiceWorker().catch((err) => console.warn('[pwa] service worker registration failed', err));
  });
} else {
  void unregisterDevWorkers();
}
void requestPersistentStorage();

// Show the install tip once the game is up (or after a short delay if it never says so).
{
  let shown = false;
  const show = () => {
    if (shown) return;
    shown = true;
    window.setTimeout(showInstallTip, 1200);
  };
  window.addEventListener('fk-ready', show, { once: true });
  window.setTimeout(show, 6000);
}

export {};
