// Boot: sim + view + ui + platform glue. Fixed-step sim with accumulator; the view interpolates.

import { audio } from './audio';
import { GAME_DATA, MECHANIC_IDS, withMechanics, type GameData } from './data';
import { Autopilot, decodeSaveCode, encodeSaveCode, Sim, STEP, type SimEvent } from './sim';
import { installLifecycle } from './platform/lifecycle';
import { AutoQuality, detectQuality, type QualityLevel } from './platform/quality';
import { readPref, SaveStore, writePref } from './platform/storage';
import { Hud } from './ui/hud';
import { Joystick } from './ui/joystick';
import { TitleScreen } from './ui/title';
import { DebugOverlay } from './ui/debug';
import { FrameStats } from './platform/perf';
import { View } from './view/view';
import * as THREE from 'three';
import { createLatePresentation } from './view/late'; // LATE-GAME HOOK

const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
const autoplayParam = params.get('autoplay') === '1';
let timeScale = Math.max(0, Number(params.get('timescale') ?? '1') || 1);
const fresh = params.get('fresh') === '1' || params.get('new') === '1';

// Development switch for the five mechanics (shipped data has them OFF):
//   ?mech=plough,rescue,skate   ?mech=all   (or __fk.cheat.mechanics('all') at runtime)
function parseMech(v: string | null): Record<string, boolean> | null {
  if (!v) return null;
  const want = v === 'all' ? [...MECHANIC_IDS] : v.split(',').map((x) => x.trim()).filter(Boolean);
  return Object.fromEntries(MECHANIC_IDS.map((m) => [m, want.includes(m)]));
}
const mechFlags = parseMech(params.get('mech'));
let DATA: GameData = mechFlags ? withMechanics(GAME_DATA, mechFlags) : GAME_DATA;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = (document.getElementById('ui') as HTMLDivElement | null) ?? document.body;

// A custom seed plays in its own save slot so test runs never clobber the real save.
const store = new SaveStore(seedParam ? `seed${seedParam}` : 'main');
const seed = seedParam ? Number(seedParam) || 1 : 1 + Math.floor(Math.random() * 1e6);

/**
 * Load a save and prove it actually runs: a probe copy is stepped and queried inside try/catch.
 * Throws a friendly message (never raw JS error text) when the save cannot be used.
 */
function loadChecked(json: string): Sim {
  let probe: Sim;
  try {
    probe = new Sim(DATA, { save: json });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    throw new Error(/newer version/i.test(msg) ? 'that save is from a newer version of the game' : "that doesn't look like a Frostkettle save");
  }
  try {
    for (let i = 0; i < 30; i++) probe.step(STEP);
    probe.drainEvents();
    probe.questProgress();
    probe.guide();
    probe.serialize();
  } catch {
    throw new Error('that save is damaged and cannot be played');
  }
  return new Sim(DATA, { save: json });
}

/** Saves that failed the boot check are kept here (never destroyed). */
let bootNotice: string | null = null;

function createSim(): Sim {
  if (!fresh) {
    const saved = store.read();
    if (saved) {
      try {
        return loadChecked(saved);
      } catch (err) {
        console.warn('Frostkettle: save unusable, trying backup', err);
        const bak = store.readBackup();
        if (bak && bak !== saved) {
          try {
            const s = loadChecked(bak);
            bootNotice = 'Your last save was damaged, so we loaded the one before it.';
            return s;
          } catch {
            /* fall through */
          }
        }
        store.quarantine();
        bootNotice = "Your save couldn't be loaded, so a new game started. The old save is kept safe.";
      }
    }
  }
  return new Sim(DATA, { seed });
}

const frameStats = new FrameStats();
const hadSave = !fresh && !!store.read();
let sim = createSim();
const showTitle = !autoplayParam && !params.has('skiptitle');

// ---- quality
const qualityPref = readPref<'auto' | QualityLevel>('quality', 'auto');
let qualityMode: 'auto' | QualityLevel = qualityPref;
const startQuality: QualityLevel = qualityMode === 'auto' ? detectQuality() : qualityMode;

let snowLevel = readPref<0 | 1 | 2>('snow', 1);

// ---- audio prefs
const vols = readPref<{ sfx: number; music: number } | null>('volumes', null);
if (vols) audio.setVolumes(vols);

// ---- UI
let view: View;
const hud = new Hud(uiRoot, {
  getVolumes: () => audio.getVolumes(),
  setVolumes: (v) => {
    audio.setVolumes(v);
    writePref('volumes', audio.getVolumes());
  },
  getQuality: () => qualityMode,
  setQuality: (q) => {
    qualityMode = q;
    writePref('quality', q);
    autoQ.enabled = q === 'auto';
    view.setQuality(q === 'auto' ? detectQuality() : q);
  },
  getSnow: () => snowLevel,
  setSnow: (lv) => {
    snowLevel = lv;
    writePref('snow', lv);
    view.setSnow(lv);
  },
  exportCode: () => encodeSaveCode(sim.serialize()),
  importCode: (code) => {
    let json: string;
    try {
      json = decodeSaveCode(code);
    } catch {
      return "that code isn't complete. Copy the whole thing and try again";
    }
    let next: Sim;
    try {
      next = loadChecked(json);
    } catch (e) {
      return e instanceof Error ? e.message : 'that save cannot be used';
    }
    // Switch over only once the new save renders; otherwise roll back and keep the current game.
    const prev = sim;
    try {
      sim = next;
      view.setSim(sim);
    } catch {
      sim = prev;
      view.setSim(sim);
      return 'that save could not be shown. Your current game is unchanged';
    }
    save();
    return null;
  },
  reset: () => {
    newGame();
  },
  stats: () => {
    const s = sim.state;
    const m = Math.floor(s.time / 60);
    return [
      `Villagers thawed: <b>${s.stats.thawed ?? 0}</b>`,
      `Bowls served: <b>${s.stats.served ?? 0}</b>`,
      `Embers earned: <b>${s.stats.embersEarned ?? 0}</b>`,
      `Hearth level: <b>${s.hearth.level}</b>`,
      `Time by the fire: <b>${Math.floor(m / 60)}h ${m % 60}m</b>`,
    ].join('<br>');
  },
  tap: () => audio.sfx('uiTap'),
});

if (bootNotice) hud.toast(bootNotice, 'info');
view = new View(canvas, sim, startQuality, {
  float: (text, world, kind) => hud.float(text, world, kind),
  toast: (text, kind) => hud.toast(text, kind),
  emberLand: () => hud.emberLand(),
});

function newGame(): void {
  store.clear();
  sim = new Sim(DATA, { seed: 1 + Math.floor(Math.random() * 1e6) });
  view.setSim(sim);
  save();
}

// LATE-GAME HOOK: Areas 3–5, Beacon, finale and Open Season presentation (src/view/late).
const late = createLatePresentation({ getView: () => view, getSim: () => sim, hudRoot: hud.root, tap: () => audio.sfx('uiTap') });
view.setSnow(snowLevel);
view.warmup();
const autoQ = new AutoQuality(() => view.lowerResolution());
autoQ.enabled = qualityMode === 'auto';

// ---- input
const stick = new Joystick(uiRoot);
let autoplay = autoplayParam;
const pilot = new Autopilot();
if (autoplay) hud.hideHint();
let audioUnlocked = false;
// The walk hint only shows at the very start of a brand-new game, until the first movement.
const isBrandNew = () => sim.state.time < 3 && sim.state.quest.index === 0;
let touchedOnce = !isBrandNew();
hud.hideHint();
if (!showTitle && !touchedOnce) hud.showHint(true);
stick.onTouch = () => {
  unlockAudio();
  view.rig.skipPan();
};
function markMoved(): void {
  if (touchedOnce) return;
  touchedOnce = true;
  hud.hideHint();
}

// ---- title
let title: TitleScreen | null = null;
function unlockAudio(): void {
  if (audioUnlocked) return;
  audioUnlocked = true;
  audio.unlock();
}
if (showTitle) {
  view.setTitle(true, true);
  title = new TitleScreen(hud.root, {
    hasSave: hadSave && !isBrandNew(),
    onFirstTouch: () => {
      unlockAudio();
      audio.music('title');
    },
    onNewGame: () => newGame(),
    onBegin: () => {
      unlockAudio();
      audio.sfx('uiTap');
      view.setTitle(false);
      touchedOnce = !isBrandNew();
      if (!touchedOnce) hud.showHint(true);
      title = null;
    },
  });
}
let debug: DebugOverlay | null = null;
function toggleDebug(): void {
  if (debug) debug.toggle();
  else debug = new DebugOverlay(uiRoot, frameStats, () => view.toggleCollisionDebug(), () => `tier ${view.quality} dpr ${view.dpr.toFixed(2)} ${canvas.width}x${canvas.height} refresh ${(1 / refresh).toFixed(0)}Hz`);
}
if (params.get('debug') === '1' || params.get('debug') === 'collision') toggleDebug();
if (params.get('debug') === 'collision') view.toggleCollisionDebug(true);
hud.onSecretTap = toggleDebug;
// Extra unlock paths (some browsers only count click/touchend as activation).
for (const ev of ['touchend', 'click', 'keydown'] as const) {
  window.addEventListener(ev, () => audio.unlock(), { passive: true });
}

// ---- save / lifecycle
let paused = false;
let lost = false;
function save(): void {
  const a = performance.now();
  store.write(sim.serialize());
  frameStats.lastSaveMs = performance.now() - a;
}
window.setInterval(() => {
  if (!paused) save();
}, 10_000);
installLifecycle(canvas, {
  save,
  pause: () => {
    paused = true;
    audio.suspend();
  },
  resume: () => {
    paused = false;
    last = -1;
    audio.resume();
  },
  contextLost: () => {
    lost = true;
  },
  contextRestored: () => {
    // Rebuild every GPU resource from scratch on a fresh view.
    view.dispose();
    view = new View(canvas, sim, Math.min(view.quality, 1) as QualityLevel, {
      float: (text, world, kind) => hud.float(text, world, kind),
      toast: (text, kind) => hud.toast(text, kind),
      emberLand: () => hud.emberLand(),
    });
    (window.__fk as FkDebug).view = view;
    if (title) view.setTitle(true, true);
    view.setSnow(snowLevel);
    view.warmup();
    lost = false;
  },
});
window.addEventListener('resize', () => view.resize());
window.visualViewport?.addEventListener('resize', () => view.resize());

// ---- debug hook
interface FkDebug {
  sim: Sim;
  view: View;
  cheat: Record<string, (...a: never[]) => unknown>;
  events: SimEvent[];
}
declare global {
  interface Window {
    __fk?: FkDebug;
  }
}
const recent: SimEvent[] = [];
const cheat = {
  embers: (n = 1000) => {
    sim.state.embers += n;
  },
  completePad: (id: string) => sim.completePad(id),
  /** Complete every currently visible pad (or the named one). */
  pad: (id?: string) => {
    if (id) return sim.completePad(id);
    for (const p of DATA.pads) if (sim.state.pads[p.id].visible) sim.completePad(p.id);
  },
  skipQuest: (n = 1) => {
    for (let i = 0; i < n; i++) sim.skipQuest();
  },
  teleport: (x: number, z: number) => {
    const p = sim.state.player;
    p.x = p.px = x;
    p.z = p.pz = z;
  },
  timescale: (s: number) => {
    timeScale = Math.max(0, s);
  },
  pop: (n: number) => sim.addPopulation(n),
  crowd: (n: number) => view.addCrowd(n),
  hearth: (l: number) => sim.setHearth(l),
  fuel: (n = 10) => {
    const st = sim.state.stations.hearth;
    if (st && st.kind === 'deposit') st.count += n;
  },
  stack: (item: string, n: number) => {
    for (let i = 0; i < n; i++) sim.state.player.stack.push(item as never);
  },
  autoplay: (on = true) => {
    autoplay = on;
    if (on) markMoved();
  },
  /** Fast-forward the sim headlessly (bot plays), then snap the view. */
  fastForward: (seconds: number) => {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) {
      pilot.update(sim, STEP);
      sim.step(STEP);
    }
    sim.drainEvents();
    view.setSim(sim);
  },
  save,
  stats: () => view.stats(),
  /** Force a graphics quality (0..2) and disable auto fallback. */
  quality: (q: QualityLevel) => {
    autoQ.enabled = false;
    view.setQuality(q);
  },
  reset: () => {
    store.clear();
    sim = new Sim(DATA, { seed: 1 });
    view.setSim(sim);
  },
  /** Frame-time summary over the last n frames (perf tests / debug). */
  perf: (n = 600) => frameStats.summary(n),
  perfReset: () => {
    frameStats.count = 0;
  },
  /** Deterministic JS profile: n iterations of (1 sim step + view frame + hud), timings in ms. */
  bench: (n = 300, render = false) => {
    view.skipRender = !render;
    const a: number[] = [], b: number[] = [], c: number[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      if (autoplay) pilot.update(sim, STEP);
      sim.step(STEP);
      const ev = sim.drainEvents();
      if (ev.length) view.handleEvents(ev);
      const t1 = performance.now();
      view.frame(1, STEP);
      const t2 = performance.now();
      hud.update(sim, STEP, (w) => view.project(projV.set(w.x, w.y, w.z)));
      const t3 = performance.now();
      a.push(t1 - t0);
      b.push(t2 - t1);
      c.push(t3 - t2);
    }
    const st = (x: number[]) => {
      const y = x.slice().sort((p, q) => p - q);
      const r = (v: number) => Math.round(v * 100) / 100;
      return { avg: r(x.reduce((p, q) => p + q, 0) / x.length), p95: r(y[Math.floor(y.length * 0.95)]), max: r(y[y.length - 1]) };
    };
    view.skipRender = false;
    const tot = a.map((v, i) => v + b[i] + c[i]);
    return { sim: st(a), view: st(b), hud: st(c), total: st(tot) };
  },
  /**
   * Turn mechanics on/off at runtime: 'all', 'none', 'plough,skate' or an array. Rebuilds the sim
   * from the current save (saves load in either configuration) and rebuilds the view.
   */
  mechanics: (list: string | string[] = 'all') => {
    const v = Array.isArray(list) ? list.join(',') : list;
    DATA = withMechanics(GAME_DATA, parseMech(v === 'none' ? '' : v) ?? {});
    const json = sim.serialize();
    sim = new Sim(DATA, { save: json });
    view.dispose();
    view = new View(canvas, sim, view.quality, {
      float: (text, world, kind) => hud.float(text, world, kind),
      toast: (text, kind) => hud.toast(text, kind),
      emberLand: () => hud.emberLand(),
    });
    view.setSnow(snowLevel);
    if (title) view.setTitle(true, true);
    return { ...DATA.mechanics };
  },
  /** Leave the title screen (tests). */
  begin: () => title?.finish(false),
};
window.__fk = { sim, view, cheat: cheat as unknown as FkDebug['cheat'], events: recent };
Object.defineProperty(window.__fk, 'sim', { get: () => sim });
Object.defineProperty(window.__fk, 'view', { get: () => view, set: (v) => (view = v) });

// ---- main loop
let last = -1;
let acc = 0;
let firstFrame = true;
/** Never run more than this many sim steps in one frame: after a hitch we drop time rather than lurch. */
const MAX_STEPS = 4;
/** Estimated display refresh interval (s); rAF timestamps are snapped to multiples of it. */
let refresh = 1 / 60;
const projV = new THREE.Vector3();

function loop(now: number): void {
  requestAnimationFrame(loop);
  if (last < 0) last = now;
  let dt = (now - last) / 1000;
  last = now;
  if (paused || lost) return;
  // Frame pacing: learn the display interval (60/120 Hz, or 30 Hz in Low Power Mode) and snap
  // noisy timestamps to whole multiples of it, so motion advances evenly every frame.
  if (dt > 0.004 && dt < 0.05) refresh += (Math.min(dt, refresh * 1.5) - refresh) * 0.02;
  const mult = Math.max(1, Math.round(dt / refresh));
  if (Math.abs(dt - mult * refresh) < refresh * 0.3) dt = mult * refresh;
  if (dt > 0.1) dt = 0.1;
  autoQ.sample(dt, refresh);
  view.frameMs = autoQ.avgMs;

  // Input -> sim (autoplay yields to a real touch).
  if (stick.active && autoplay && !autoplayParam) autoplay = false;
  const settingsOpen = hud.settingsOpen;
  if (!autoplay) {
    const v = settingsOpen || title ? { x: 0, z: 0 } : stick.vector();
    sim.setMove(v.x, v.z);
    if (!touchedOnce && (Math.hypot(v.x, v.z) > 0.2 || !isBrandNew())) markMoved();
  }

  const t0 = performance.now();
  const dtMs = dt * 1000;
  acc += dt * timeScale;
  let steps = 0;
  const maxSteps = Math.ceil(MAX_STEPS * Math.max(1, timeScale)); // debug timescale may run faster
  while (acc >= STEP && steps < maxSteps) {
    if (autoplay) pilot.update(sim, STEP);
    sim.step(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps >= maxSteps && acc >= STEP) acc = acc % STEP; // drop the backlog instead of fast-forwarding
  const events = sim.drainEvents();
  if (events.length) {
    view.handleEvents(events);
    late.handleEvents(events); // LATE-GAME HOOK
    recent.push(...events);
    if (recent.length > 300) recent.splice(0, recent.length - 300);
  }
  const t1 = performance.now();
  late.frame(acc / STEP, dt); // LATE-GAME HOOK
  view.frame(acc / STEP, dt);
  const t2 = performance.now();
  hud.update(sim, dt, (w) => view.project(projV.set(w.x, w.y, w.z)));
  const t3 = performance.now();
  frameStats.push(dtMs, t1 - t0, t2 - t1, t3 - t2, steps);
  view.cpuMs += (t3 - t0 - view.cpuMs) * 0.1;
  debug?.update(dt, view);
  if (firstFrame) {
    firstFrame = false;
    window.dispatchEvent(new Event('fk-ready'));
  }
}
requestAnimationFrame(loop);
