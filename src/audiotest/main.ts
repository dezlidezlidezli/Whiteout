// Soundboard for auditioning every sound on a phone, plus window.__audioLab for automated
// offline measurement (tests/audio/measure.cjs).
import { audio, ladderPitch, type MusicMood, type SfxName } from '../audio/index';
import { SFX_NAMES } from '../audio/sfx';
import { PREROLL, renderAmbience, renderMusic, renderSfx, renderStreak } from '../audio/offline';
import { analyze } from './analyze';

const MOODS: MusicMood[] = ['title', 'calm', 'cozy', 'storm', 'finale', 'whiteout', 'peak'];
const $ = (id: string) => document.getElementById(id)!;
const status = $('status');

function btn(parent: HTMLElement, label: string, onTap: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', () => {
    audio.unlock();
    onTap();
    refresh();
  });
  parent.appendChild(b);
  return b;
}

function refresh(): void {
  const live = audio as unknown as { state?: () => string; engine?: () => { activeVoices(): number; currentMood(): string | null } | null };
  const e = live.engine?.();
  status.textContent = `context: ${live.state?.() ?? '?'} · voices: ${e?.activeVoices() ?? 0} · mood: ${e?.currentMood() ?? 'none'}`;
}
setInterval(refresh, 500);

const sfxGrid = $('sfx');
for (const name of SFX_NAMES) {
  const warm = ['thaw', 'hearthUp', 'fanfare', 'padComplete', 'unlock', 'questComplete', 'ember', 'order', 'upgrade', 'beaconStage', 'dawn', 'rescued', 'followerHome', 'allFound', 'zoneCleared', 'flameTaken', 'brazierLit', 'trailComplete', 'fishLeapCatch'].includes(name);
  btn(sfxGrid, name, () => audio.sfx(name), warm ? 'warm' : '');
}

const streaks = $('streaks');
const ladder = (name: SfxName, n: number, rate: number) => () => {
  for (let i = 0; i < n; i++) setTimeout(() => audio.sfx(name, { pitch: ladderPitch(i) }), (i * 1000) / rate);
};
btn(streaks, 'pickup ×20', ladder('pickup', 20, 10), 'cold');
btn(streaks, 'ember ×20', ladder('ember', 20, 12), 'warm');
btn(streaks, 'pickup 30/s', ladder('pickup', 30, 30), 'cold');
btn(streaks, 'padTick run', () => {
  for (let i = 0; i < 40; i++) setTimeout(() => audio.sfx('padTick', { pitch: 1 + i * 0.015 }), 1000 * (1 - Math.pow(1 - i / 40, 1.6)) * 2);
  setTimeout(() => audio.sfx('padComplete'), 2100);
});
btn(streaks, 'arrivals', () => {
  for (let i = 0; i < 6; i++) setTimeout(() => audio.sfx('arrive'), i * 450);
});
btn(streaks, 'dawn+finale', () => {
  audio.sfx('dawn');
  setTimeout(() => audio.music('finale'), 3000);
});
// --- signature mechanics sequences
const after = (ms: number, f: () => void) => setTimeout(f, ms);
/** Ramp an ambience bed from a to b over `ms` milliseconds. */
const rampAmb = (key: 'plough' | 'skate' | 'forge' | 'flame' | 'gust', a: number, b: number, ms: number) => {
  const steps = Math.max(1, Math.round(ms / 100));
  for (let i = 0; i <= steps; i++) after(i * 100, () => audio.ambience({ [key]: a + ((b - a) * i) / steps }));
};
btn(streaks, 'plough 5 s then find', () => {
  rampAmb('plough', 0.15, 1, 5000);
  after(5000, () => audio.sfx('ploughFind'));
  after(5300, () => audio.ambience({ plough: 0 }));
  after(6000, () => audio.sfx('zoneCleared'));
});
btn(streaks, 'rescue then walk home', () => {
  audio.sfx('lanternOn');
  for (let i = 0; i < 5; i++) after(500 + i * 300, () => audio.sfx('dig'));
  after(2100, () => audio.sfx('rescued'));
  for (let i = 0; i < 10; i++) after(4000 + i * 330, () => audio.sfx('footstep'));
  after(5200, () => audio.sfx('followerWait'));
  after(7600, () => audio.sfx('followerHome'));
  after(8400, () => audio.sfx('thaw'));
});
btn(streaks, 'fish leap combo x6', () => {
  audio.ambience({ skate: 0.8 });
  for (let i = 0; i < 6; i++) {
    after(i * 700, () => audio.sfx('fishLeapSpawn'));
    after(i * 700 + 350, () => audio.sfx('fishLeapCatch', { pitch: ladderPitch(i) }));
  }
  after(4300, () => audio.sfx('skateBounce'));
  after(4600, () => audio.ambience({ skate: 0 }));
});
btn(streaks, 'crank 3 turns then lift', () => {
  const notchesPerTurn = 8;
  for (let i = 0; i < notchesPerTurn * 3; i++) {
    after(i * 90, () => audio.sfx('crankNotch'));
    if ((i + 1) % notchesPerTurn === 0) after(i * 90, () => audio.sfx('crankTurn'));
    if (i % 6 === 0) after(i * 90, () => audio.sfx('bellows'));
  }
  rampAmb('forge', 0.1, 1, 2200);
  after(2400, () => audio.sfx('liftArrive'));
  after(5000, () => rampAmb('forge', 1, 0, 2000));
});
btn(streaks, 'take flame → low → brazier lit', () => {
  audio.sfx('flameTaken');
  rampAmb('flame', 1, 0.25, 4000);
  after(1000, () => rampAmb('gust', 0, 0.8, 1000));
  after(2500, () => rampAmb('gust', 0.8, 0, 1000));
  after(3600, () => audio.sfx('flameLow'));
  after(4600, () => audio.sfx('brazierLit'));
  after(4700, () => rampAmb('flame', 0.25, 1, 500));
  after(6500, () => audio.sfx('trailComplete'));
  after(8000, () => rampAmb('flame', 1, 0, 1000));
});
btn(streaks, 'flame out', () => {
  audio.sfx('flameOut');
  audio.ambience({ flame: 0 });
});
btn(streaks, 'walk', () => {
  for (let i = 0; i < 12; i++) setTimeout(() => audio.sfx('footstep'), i * 320);
});
btn(streaks, 'serve+thaw', () => {
  audio.sfx('serve');
  setTimeout(() => audio.sfx('thaw'), 250);
  for (let i = 0; i < 6; i++) setTimeout(() => audio.sfx('ember', { pitch: ladderPitch(i) }), 900 + i * 90);
});

const moodGrid = $('moods');
const moodBtns: HTMLButtonElement[] = [];
const setMood = (m: MusicMood | null, b: HTMLButtonElement) => {
  audio.music(m);
  moodBtns.forEach((x) => x.classList.toggle('on', x === b && m !== null));
};
for (const m of MOODS) {
  const b: HTMLButtonElement = btn(moodGrid, m, () => setMood(m, b));
  moodBtns.push(b);
}
const off: HTMLButtonElement = btn(moodGrid, 'off', () => setMood(null, off));

const sliders = $('sliders');
function slider(label: string, value: number, onInput: (v: number) => void): void {
  const l = document.createElement('label');
  const span = document.createElement('span');
  span.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'range';
  inp.min = '0';
  inp.max = '1';
  inp.step = '0.01';
  inp.value = String(value);
  const out = document.createElement('span');
  out.textContent = value.toFixed(2);
  inp.addEventListener('input', () => {
    audio.unlock();
    const v = Number(inp.value);
    out.textContent = v.toFixed(2);
    onInput(v);
  });
  l.append(span, inp, out);
  sliders.appendChild(l);
}
slider('wind', 0, (v) => audio.ambience({ wind: v }));
slider('fire', 0, (v) => audio.ambience({ fire: v }));
slider('crowd', 0, (v) => audio.ambience({ crowd: v }));
slider('camp', 0, (v) => audio.ambience({ camp: v }));
slider('plough', 0, (v) => audio.ambience({ plough: v }));
slider('skate', 0, (v) => audio.ambience({ skate: v }));
slider('forge', 0, (v) => audio.ambience({ forge: v }));
slider('flame', 0, (v) => audio.ambience({ flame: v }));
slider('gust', 0, (v) => audio.ambience({ gust: v }));
slider('sfx', audio.getVolumes().sfx, (v) => audio.setVolumes({ sfx: v }));
slider('music', audio.getVolumes().music, (v) => audio.setVolumes({ music: v }));

// ---------------------------------------------------------------------------------------------
// Measurement API for Playwright

const lab = {
  names: SFX_NAMES,
  moods: MOODS,
  async sfx(name: SfxName, pitch = 1, seed = 1234) {
    return analyze(await renderSfx(name, { pitch }, name === 'dawn' ? 11 : 6, { seed }), PREROLL - 0.05);
  },
  async streak(name: SfxName, count: number, rate: number, flat = false) {
    const pitchOf = flat ? () => 1 : (i: number) => ladderPitch(i);
    return analyze(await renderStreak(name, count, rate, pitchOf, 2 + count / rate + 2), PREROLL - 0.05);
  },
  async allAtOnce() {
    const { renderWith } = await import('../audio/offline');
    return analyze(
      await renderWith(6, (e) => {
        for (const n of SFX_NAMES) e.sfx(n, {}, PREROLL);
        e.music('cozy', 0);
        e.update(6);
        e.setAmbience({ wind: 1, fire: 1 }, 0.02);
      }),
      PREROLL - 0.05,
    );
  },
  async music(mood: MusicMood, seconds = 20, seed = 77) {
    const t0 = performance.now();
    const buf = await renderMusic(mood, seconds, { seed });
    const ms = performance.now() - t0;
    return { ...analyze(buf, 0.5), renderMs: ms };
  },
  async ambience(levels: Record<string, number>) {
    return analyze(await renderAmbience(levels, 12), 1.5);
  },
  api: audio,
  liveState() {
    refresh();
    return status.textContent;
  },
};
(window as unknown as { __audioLab: typeof lab }).__audioLab = lab;
