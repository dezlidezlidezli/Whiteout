// Live (browser) implementation of the AudioApi: lazy AudioContext, iOS unlock / interruption
// handling, visibility pausing and the look-ahead scheduler timer.
// Importing this module has no side effects and is safe under Node: nothing touches `window`
// until unlock() is called, and every method is a silent no-op without a context.
import type { AudioApi, MusicMood, SfxName, SfxOpts } from './index';
import { Engine } from './engine';
import type { AmbienceLevels } from './ambience';

type Ctor = typeof AudioContext;

export function createLiveAudio(): AudioApi & {
  /** Current context state, or 'none' before unlock. */
  state(): string;
  /** The engine (debug / soundboard); null before unlock. */
  engine(): Engine | null;
} {
  let ctx: AudioContext | null = null;
  let engine: Engine | null = null;
  let volumes = { sfx: 0.8, music: 0.5 };
  let wantMood: MusicMood | null = null;
  const wantAmb: Required<AmbienceLevels> = { wind: 0, fire: 0, crowd: 0, camp: 0, plough: 0, skate: 0, forge: 0, flame: 0, gust: 0 };
  let userSuspended = false;
  let hidden = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let listening = false;

  const shouldRun = () => !userSuspended && !hidden;

  function setAudioSessionPlayback(): void {
    try {
      const nav = (typeof navigator !== 'undefined' ? navigator : null) as
        | (Navigator & { audioSession?: { type: string } })
        | null;
      if (nav && nav.audioSession && nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback';
    } catch {
      /* not supported */
    }
  }

  function playSilence(): void {
    if (!ctx) return;
    try {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      /* ignore */
    }
  }

  function tryResume(): void {
    if (!ctx || !shouldRun()) return;
    // 'interrupted' (iOS: phone call, Siri) and 'suspended' both need resume()
    if ((ctx.state as string) !== 'running') {
      ctx.resume().catch(() => {});
    }
  }

  function startTimer(): void {
    if (timer !== null || typeof setInterval === 'undefined') return;
    timer = setInterval(() => {
      if (engine && ctx && ctx.state === 'running') engine.update();
    }, 90);
  }

  function stopTimer(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  function applyRunState(): void {
    if (!ctx) return;
    if (shouldRun()) {
      tryResume();
      startTimer();
    } else {
      stopTimer();
      if (ctx.state === 'running') ctx.suspend().catch(() => {});
    }
  }

  function onVisibility(): void {
    hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    applyRunState();
  }

  function onGesture(): void {
    // any later touch revives a context iOS interrupted or suspended behind our back
    if (ctx && shouldRun() && (ctx.state as string) !== 'running') {
      setAudioSessionPlayback();
      tryResume();
      playSilence();
    }
  }

  function addListeners(): void {
    if (listening || typeof document === 'undefined' || typeof window === 'undefined') return;
    listening = true;
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', () => {
      hidden = true;
      applyRunState();
    });
    window.addEventListener('pageshow', () => {
      hidden = document.visibilityState === 'hidden';
      applyRunState();
    });
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('touchend', onGesture, opts);
    window.addEventListener('pointerdown', onGesture, opts);
    window.addEventListener('keydown', onGesture, opts);
    if (ctx) {
      ctx.addEventListener('statechange', () => {
        if (ctx && (ctx.state as string) !== 'running' && shouldRun()) tryResume();
      });
    }
  }

  return {
    unlock() {
      if (typeof window === 'undefined') return;
      try {
        setAudioSessionPlayback();
        if (!ctx) {
          const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
          const C = w.AudioContext ?? w.webkitAudioContext;
          if (!C) return;
          try {
            ctx = new C({ latencyHint: 'interactive' });
          } catch {
            ctx = new C();
          }
          engine = new Engine(ctx, ctx.destination, { sfx: volumes.sfx, music: volumes.music });
          hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
          addListeners();
          if (Object.values(wantAmb).some((x) => x > 0)) engine.setAmbience(wantAmb, 0.5);
          if (wantMood) engine.music(wantMood);
        }
        tryResume();
        playSilence();
        if (shouldRun()) startTimer();
      } catch {
        /* never let audio break the game */
      }
    },

    sfx(name: SfxName, opts?: SfxOpts) {
      if (!engine || !ctx || ctx.state !== 'running') return;
      try {
        engine.sfx(name, opts);
      } catch {
        /* ignore */
      }
    },

    music(mood: MusicMood | null) {
      wantMood = mood;
      if (!engine) return;
      try {
        engine.music(mood);
      } catch {
        /* ignore */
      }
    },

    ambience(levels: AmbienceLevels) {
      for (const k of Object.keys(wantAmb) as (keyof AmbienceLevels)[]) {
        const x = levels[k];
        if (x !== undefined && Number.isFinite(x)) wantAmb[k] = x;
      }
      if (!engine) return;
      try {
        engine.setAmbience(levels);
      } catch {
        /* ignore */
      }
    },

    setVolumes(v: { sfx?: number; music?: number }) {
      const next = { ...volumes };
      if (v.sfx !== undefined && Number.isFinite(v.sfx)) next.sfx = Math.min(1, Math.max(0, v.sfx));
      if (v.music !== undefined && Number.isFinite(v.music)) next.music = Math.min(1, Math.max(0, v.music));
      volumes = next;
      if (engine) {
        try {
          engine.setVolumes(volumes);
        } catch {
          /* ignore */
        }
      }
    },

    getVolumes() {
      return { ...volumes };
    },

    suspend() {
      userSuspended = true;
      try {
        applyRunState();
      } catch {
        /* ignore */
      }
    },

    resume() {
      userSuspended = false;
      try {
        applyRunState();
      } catch {
        /* ignore */
      }
    },

    state() {
      return ctx ? (ctx.state as string) : 'none';
    },

    engine() {
      return engine;
    },
  };
}
