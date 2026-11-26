// Boot: sim + view + ui + platform glue. Fixed-step sim with accumulator; the view interpolates.

import { audio } from './audio';
import { GAME_DATA } from './data';
import { Autopilot, decodeSaveCode, encodeSaveCode, Sim, STEP, type SimEvent } from './sim';
import { installLifecycle } from './platform/lifecycle';
import { AutoQuality, detectQuality, type QualityLevel } from './platform/quality';
import { readPref, SaveStore, writePref } from './platform/storage';
import { Hud } from './ui/hud';
import { Joystick } from './ui/joystick';
import { View } from './view/view';
import * as THREE from 'three';

const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
const autoplayParam = params.get('autoplay') === '1';
let timeScale = Math.max(0, Number(params.get('timescale') ?? '1') || 1);
const fresh = params.get('fresh') === '1' || params.get('new') === '1';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = (document.getElementById('ui') as HTMLDivElement | null) ?? document.body;

// A custom seed plays in its own save slot so test runs never clobber the real save.
const store = new SaveStore(seedParam ? `seed${seedParam}` : 'main');
const seed = seedParam ? Number(seedParam) || 1 : 1 + Math.floor(Math.random() * 1e6);

function createSim(): Sim {
  if (!fresh) {
    const saved = store.read();
    if (saved) {
      try {
        return new Sim(GAME_DATA, { save: saved });
      } catch (err) {
        console.warn('Frostkettle: save unreadable, trying backup', err);
        const bak = store.readBackup();
        if (bak && bak !== saved) {
          try {
            return new Sim(GAME_DATA, { save: bak });
          } catch {
            /* fall through */
          }
        }
        store.quarantine();
      }
    }
  }
  return new Sim(GAME_DATA, { seed });
}

let sim = createSim();

// ---- quality
const qualityPref = readPref<'auto' | QualityLevel>('quality', 'auto');
let qualityMode: 'auto' | QualityLevel = qualityPref;
const startQuality: QualityLevel = qualityMode === 'auto' ? detectQuality() : qualityMode;

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
  exportCode: () => encodeSaveCode(sim.serialize()),
  importCode: (code) => {
    try {
      const json = decodeSaveCode(code);
      const next = new Sim(GAME_DATA, { save: json });
      save();
      sim = next;
      view.setSim(sim);
      save();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'invalid code';
    }
  },
  reset: () => {
    store.clear();
    sim = new Sim(GAME_DATA, { seed: 1 + Math.floor(Math.random() * 1e6) });
    view.setSim(sim);
    save();
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

view = new View(canvas, sim, startQuality, {
  float: (text, world, kind) => hud.float(text, world, kind),
  toast: (text, kind) => hud.toast(text, kind),
  emberLand: () => hud.emberLand(),
});

const autoQ = new AutoQuality(() => {
  if (view.quality <= 0) return false;
  view.setQuality((view.quality - 1) as QualityLevel);
  return true;
});
autoQ.enabled = qualityMode === 'auto';

// ---- input
const stick = new Joystick(uiRoot);
let autoplay = autoplayParam;
const pilot = new Autopilot();
if (autoplay) hud.hideHint();
let audioUnlocked = false;
// The walk hint only shows at the very start of a brand-new game, until the first movement.
let touchedOnce = readPref('hintDone', false) || sim.state.time > 3 || sim.state.quest.index > 0;
if (touchedOnce) hud.hideHint();
stick.onTouch = () => {
  if (!audioUnlocked) {
    audioUnlocked = true;
    audio.unlock();
  }
  view.rig.skipPan();
};
function markMoved(): void {
  if (touchedOnce) return;
  touchedOnce = true;
  writePref('hintDone', true);
  hud.hideHint();
}
// Extra unlock paths (some browsers only count click/touchend as activation).
for (const ev of ['touchend', 'click', 'keydown'] as const) {
  window.addEventListener(ev, () => audio.unlock(), { passive: true });
}

// ---- save / lifecycle
let paused = false;
let lost = false;
function save(): void {
  store.write(sim.serialize());
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
    last = performance.now();
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
    for (const p of GAME_DATA.pads) if (sim.state.pads[p.id].visible) sim.completePad(p.id);
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
    if (on) hud.hideHint();
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
  reset: () => {
    store.clear();
    sim = new Sim(GAME_DATA, { seed: 1 });
    view.setSim(sim);
  },
};
window.__fk = { sim, view, cheat: cheat as unknown as FkDebug['cheat'], events: recent };
Object.defineProperty(window.__fk, 'sim', { get: () => sim });
Object.defineProperty(window.__fk, 'view', { get: () => view, set: (v) => (view = v) });

// ---- main loop
let last = performance.now();
let acc = 0;
let firstFrame = true;
const MAX_STEPS = 240;

function loop(now: number): void {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (paused || lost) return;
  if (dt > 0.25) dt = 0.25;
  autoQ.sample(dt);
  view.frameMs = autoQ.avgMs;

  // Input -> sim (autoplay yields to a real touch).
  if (stick.active && autoplay && !autoplayParam) autoplay = false;
  const settingsOpen = hud.settingsOpen;
  if (!autoplay) {
    const v = settingsOpen ? { x: 0, z: 0 } : stick.vector();
    sim.setMove(v.x, v.z);
    if (!touchedOnce && Math.hypot(v.x, v.z) > 0.2) markMoved();
  }

  acc += dt * timeScale;
  let steps = 0;
  while (acc >= STEP && steps < MAX_STEPS) {
    if (autoplay) pilot.update(sim, STEP);
    sim.step(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps >= MAX_STEPS) acc = 0;
  const events = sim.drainEvents();
  if (events.length) {
    view.handleEvents(events);
    recent.push(...events);
    if (recent.length > 300) recent.splice(0, recent.length - 300);
  }
  view.frame(acc / STEP, dt);
  hud.update(sim, dt, (w) => view.project(new THREE.Vector3(w.x, w.y, w.z)));
  if (firstFrame) {
    firstFrame = false;
    window.dispatchEvent(new Event('fk-ready'));
  }
}
requestAnimationFrame(loop);
