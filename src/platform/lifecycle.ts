// Visibility/pause, save-on-hide and WebGL context-loss recovery.

export interface LifecycleHooks {
  save(): void;
  pause(): void;
  resume(): void;
  contextLost(): void;
  contextRestored(): void;
}

export function installLifecycle(canvas: HTMLCanvasElement, hooks: LifecycleHooks): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hooks.save();
      hooks.pause();
    } else {
      hooks.resume();
    }
  });
  window.addEventListener('pagehide', () => hooks.save());
  window.addEventListener('beforeunload', () => hooks.save());
  // The PWA layer fires this just before reloading for a new version.
  window.addEventListener('fk-before-update', () => hooks.save());
  canvas.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault();
      hooks.contextLost();
    },
    false,
  );
  canvas.addEventListener('webglcontextrestored', () => hooks.contextRestored(), false);
}
