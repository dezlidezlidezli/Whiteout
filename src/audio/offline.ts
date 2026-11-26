// Offline rendering helpers (browser only): render any sfx / music / ambience through the full
// engine graph (buses, reverb, limiter) into an AudioBuffer for objective measurement.
import type { MusicMood, SfxName, SfxOpts } from './index';
import { Engine } from './engine';

/**
 * Browser compressors start in a fully-compressed state and settle within ~0.3 s of silence, so
 * offline renders trigger sounds after this pre-roll and analysis skips it (live use is always settled).
 */
export const PREROLL = 0.4;

export interface RenderOpts {
  sampleRate?: number;
  seed?: number;
  sfxVolume?: number;
  musicVolume?: number;
}

export async function renderWith(
  seconds: number,
  setup: (engine: Engine, ac: OfflineAudioContext) => void,
  o: RenderOpts = {},
): Promise<AudioBuffer> {
  const sr = o.sampleRate ?? 48000;
  const ac = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const engine = new Engine(ac, ac.destination, { seed: o.seed ?? 1234, sfx: o.sfxVolume ?? 0.8, music: o.musicVolume ?? 0.5 });
  setup(engine, ac);
  return ac.startRendering();
}

/** One sound after the pre-roll, followed by enough tail for reverb to die out. */
export function renderSfx(name: SfxName, opts: SfxOpts = {}, seconds = 5, o: RenderOpts = {}): Promise<AudioBuffer> {
  return renderWith(PREROLL + seconds, (e) => e.sfx(name, opts, PREROLL), o);
}

/** A rapid streak: `count` triggers at `rate` per second, pitch from `pitchOf(i)`. */
export function renderStreak(
  name: SfxName,
  count: number,
  rate: number,
  pitchOf: (i: number) => number,
  seconds = 4,
  o: RenderOpts = {},
): Promise<AudioBuffer> {
  return renderWith(PREROLL + seconds, (e) => {
    for (let i = 0; i < count; i++) e.sfx(name, { pitch: pitchOf(i) }, PREROLL + i / rate);
  }, o);
}

/** `seconds` of a music mood (no fade-in so the whole render is representative). */
export function renderMusic(mood: MusicMood, seconds = 20, o: RenderOpts = {}): Promise<AudioBuffer> {
  return renderWith(seconds, (e) => {
    e.music(mood, 0);
    e.update(seconds);
  }, o);
}

export function renderAmbience(levels: { wind?: number; fire?: number; crowd?: number; camp?: number }, seconds = 6, o: RenderOpts = {}): Promise<AudioBuffer> {
  return renderWith(seconds, (e) => e.setAmbience(levels, 0.02), o);
}
