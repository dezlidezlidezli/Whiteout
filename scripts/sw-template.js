/* Frostkettle service worker. Generated at build time by the `fk-pwa` plugin in vite.config.ts.
 * Strategy:
 *  - Every build precaches the whole app into a cache named after a content hash of all files.
 *    Any change in any file changes this script's bytes, so the browser sees a new worker.
 *  - A new worker installs in the background and WAITS. It takes over only when the app is
 *    relaunched (no open pages) or when the page asks it to (SKIP_WAITING) at a safe moment.
 *  - Requests are answered cache-first from the current version; navigations get index.html.
 *  - Old version caches are deleted once the new worker activates.
 */
const VERSION = '__FK_VERSION__';
const FILES = __FK_FILES__;
const CACHE = 'fk-app-' + VERSION;
const PREFIX = 'fk-app-';

const scopeUrl = new URL(self.registration.scope);
const INDEX = new URL('index.html', scopeUrl).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // cache: 'reload' bypasses the HTTP cache (GitHub Pages sends max-age=600) so we never
      // precache a stale copy of a file that belongs to the previous deployment.
      await Promise.all(
        FILES.map(async (f) => {
          const url = new URL(f, scopeUrl).href;
          const res = await fetch(new Request(url, { cache: 'reload' }));
          if (!res.ok) throw new Error('precache failed: ' + url + ' ' + res.status);
          await cache.put(url, res);
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION' && event.source) {
    event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== scopeUrl.origin || !url.href.startsWith(scopeUrl.href)) return;

  if (req.mode === 'navigate') {
    // Any page inside the scope: the matching HTML file if precached (gallery.html etc.),
    // otherwise the app shell. Query strings (?seed=, ?autoplay=) are ignored for matching.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const exact = await cache.match(url.origin + url.pathname, { ignoreSearch: true });
        if (exact) return exact;
        const shell = await cache.match(INDEX);
        if (shell) return shell;
        return fetch(req);
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      // Not precached (e.g. launch images, or a file from a version still loading): network,
      // then fall back to any older cache so a page from the previous version keeps working.
      try {
        return await fetch(req);
      } catch (err) {
        const any = await caches.match(req, { ignoreSearch: true });
        if (any) return any;
        throw err;
      }
    })(),
  );
});
