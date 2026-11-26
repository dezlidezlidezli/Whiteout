// Soundboard for auditioning every sound on a phone, plus window.__audioLab for automated
// offline measurement (tests/audio/measure.cjs).
import { audio, ladderPitch, type MusicMood, type SfxName } from '../audio/index';
import { SFX_NAMES } from '../audio/sfx';
import { renderAmbience, renderMusic, renderSfx, renderStreak } from '../audio/offline';
import { analyze } from './analyze';

const MOODS: MusicMood[] = ['title', 'calm', 'cozy', 'storm', 'finale'];
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
  const warm = ['thaw', 'hearthUp', 'fanfare', 'padComplete', 'unlock', 'questComplete', 'ember'].includes(name);
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
slider('sfx', audio.getVolumes().sfx, (v) => audio.setVolumes({ sfx: v }));
slider('music', audio.getVolumes().music, (v) => audio.setVolumes({ music: v }));

// ---------------------------------------------------------------------------------------------
// Measurement API for Playwright

const lab = {
  names: SFX_NAMES,
  moods: MOODS,
  async sfx(name: SfxName, pitch = 1, seed = 1234) {
    return analyze(await renderSfx(name, { pitch }, 5, { seed }));
  },
  async streak(name: SfxName, count: number, rate: number) {
    return analyze(await renderStreak(name, count, rate, (i) => ladderPitch(i), 2 + count / rate + 2));
  },
  async allAtOnce() {
    const { renderWith } = await import('../audio/offline');
    return analyze(
      await renderWith(6, (e) => {
        for (const n of SFX_NAMES) e.sfx(n, {}, 0.02);
        e.music('cozy', 0);
        e.update(6);
        e.setAmbience({ wind: 1, fire: 1 }, 0.02);
      }),
    );
  },
  async music(mood: MusicMood, seconds = 20, seed = 77) {
    const t0 = performance.now();
    const buf = await renderMusic(mood, seconds, { seed });
    const ms = performance.now() - t0;
    return { ...analyze(buf, 0.5), renderMs: ms };
  },
  async ambience(wind: number, fire: number) {
    return analyze(await renderAmbience({ wind, fire }, 6), 1.5);
  },
  liveState() {
    refresh();
    return status.textContent;
  },
};
(window as unknown as { __audioLab: typeof lab }).__audioLab = lab;
