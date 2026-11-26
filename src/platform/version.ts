// Build identity, injected by vite.config.ts. Shown on the title screen and in Settings.
declare const __APP_VERSION__: string | undefined;
declare const __APP_BUILD__: string | undefined;

/** e.g. "0.1.63": major.minor from package.json + number of commits in the build. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
/** Short commit id of the build. */
export const APP_BUILD: string = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'local';
/** Human-readable label, e.g. "v0.1.63 · 97f4374". */
export const VERSION_LABEL = `v${APP_VERSION} · ${APP_BUILD}`;
