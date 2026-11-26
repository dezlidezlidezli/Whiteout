// The audio engine: bus graph, voice management, music cross-fades and ambience.
// Context-agnostic: works on a live AudioContext and on an OfflineAudioContext (for tests).
import type { MusicMood, SfxName, SfxOpts } from './index';
import { Ambience } from './ambience';
import { MoodPlayer } from './music';
import { SFX } from './sfx';
import { holdParam, makeImpulse, makeNoiseBuffer, makeRng, type Rng, type Voice } from './synth';

/** Headroom: everything is mixed well under full scale before the limiter. */
const SFX_TRIM = 0.42;
const MUSIC_TRIM = 0.42;
const AMB_TRIM = 0.5;
export const MUSIC_FADE = 2.5;
export const LOOKAHEAD = 0.35;

interface ActiveVoice {
  gain: GainNode;
  level: number;
  end: number;
}

export interface EngineOptions {
  seed?: number;
  sfx?: number;
  music?: number;
}

export class Engine {
  readonly ac: BaseAudioContext;
  readonly sfxBus: GainNode;
  readonly musicBus: GainNode;
  readonly ambBus: GainNode;
  private musicDuck: GainNode;
  private master: GainNode;
  private reverbIn: GainNode;
  private noise: AudioBuffer;
  private rng: Rng;
  private voices = new Map<SfxName, ActiveVoice[]>();
  private last = new Map<SfxName, number>();
  private moods: MoodPlayer[] = [];
  private current: MoodPlayer | null = null;
  readonly ambience: Ambience;
  private vol = { sfx: 0.8, music: 0.5 };

  constructor(ac: BaseAudioContext, destination: AudioNode, opts: EngineOptions = {}) {
    this.ac = ac;
    this.rng = makeRng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.noise = makeNoiseBuffer(ac, 2.5, 3);

    // master chain: buses -> master -> limiter (compressor) -> soft safety clipper -> out
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    const clipper = ac.createWaveShaper();
    clipper.curve = softClipCurve();
    clipper.oversample = 'none';
    const post = ac.createGain();
    post.gain.value = 1;
    this.master = ac.createGain();
    this.master.gain.value = 1;
    this.master.connect(limiter);
    limiter.connect(clipper);
    clipper.connect(post);
    post.connect(destination);

    // shared reverb (procedural IR)
    this.reverbIn = ac.createGain();
    this.reverbIn.gain.value = 0.32;
    const conv = ac.createConvolver();
    conv.normalize = true;
    conv.buffer = makeImpulse(ac, 2.2, 11);
    const revHp = ac.createBiquadFilter();
    revHp.type = 'highpass';
    revHp.frequency.value = 180;
    this.reverbIn.connect(revHp);
    revHp.connect(conv);
    conv.connect(this.master);

    this.sfxBus = ac.createGain();
    this.musicBus = ac.createGain();
    this.musicDuck = ac.createGain();
    this.ambBus = ac.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.musicDuck);
    this.musicDuck.connect(this.master);
    this.ambBus.connect(this.master);
    this.ambBus.gain.value = AMB_TRIM;

    this.ambience = new Ambience(ac, this.ambBus, this.noise);
    this.setVolumes({ sfx: opts.sfx ?? 0.8, music: opts.music ?? 0.5 }, 0);
  }

  setVolumes(v: { sfx?: number; music?: number }, smooth = 0.05): void {
    if (v.sfx !== undefined && Number.isFinite(v.sfx)) this.vol.sfx = Math.min(1, Math.max(0, v.sfx));
    if (v.music !== undefined && Number.isFinite(v.music)) this.vol.music = Math.min(1, Math.max(0, v.music));
    const now = this.ac.currentTime;
    const set = (p: AudioParam, x: number) => {
      if (smooth <= 0) p.setValueAtTime(x, now);
      else {
        holdParam(p, now);
        p.setTargetAtTime(x, now, smooth);
      }
    };
    // perceptual-ish curve
    set(this.sfxBus.gain, SFX_TRIM * this.vol.sfx * this.vol.sfx);
    set(this.musicBus.gain, MUSIC_TRIM * this.vol.music * this.vol.music);
    // ambience follows the sfx slider (it is "world sound")
    set(this.ambBus.gain, AMB_TRIM * Math.min(1, this.vol.sfx * 1.1));
  }

  /** Play a sound effect at `when` (defaults to now). Returns false if rate-limited. */
  sfx(name: SfxName, opts: SfxOpts = {}, when?: number): boolean {
    const spec = SFX[name];
    if (!spec) return false;
    const ac = this.ac;
    const t = Math.max(when ?? ac.currentTime, ac.currentTime) + 0.005;
    const last = this.last.get(name) ?? -Infinity;
    if (t - last < spec.minGap) return false;
    this.last.set(name, t);

    // voice bookkeeping: purge finished, steal oldest when over the cap
    let list = this.voices.get(name);
    if (!list) this.voices.set(name, (list = []));
    for (let i = list.length - 1; i >= 0; i--) if (list[i].end <= t) list.splice(i, 1);
    while (list.length >= spec.poly) {
      const old = list.shift()!;
      holdParam(old.gain.gain, t);
      old.gain.gain.setTargetAtTime(0, t, 0.012);
    }

    const vol = clamp(opts.volume ?? 1, 0, 1);
    if (vol <= 0) return false;
    const pitch = clamp(Number.isFinite(opts.pitch) ? (opts.pitch as number) : 1, 0.25, 4);
    const cents = spec.cents ? (this.rng() * 2 - 1) * spec.cents : 0;
    // dense streams get slightly quieter so they don't stack into mush
    const density = 1 / Math.sqrt(1 + 0.35 * list.length);
    const level = spec.level * vol * density;

    const g = ac.createGain();
    g.gain.value = level;
    g.connect(this.sfxBus);
    const v: Voice = {
      ac,
      out: g,
      rev: this.reverbIn,
      t,
      rng: this.rng,
      p: pitch * Math.pow(2, cents / 1200),
      noise: this.noise,
    };
    const dur = spec.fn(v);
    list.push({ gain: g, level, end: t + dur });
    if (spec.duck) this.duck(spec.duck, t, dur);
    return true;
  }

  private duck(amount: number, t: number, dur: number): void {
    const p = this.musicDuck.gain;
    holdParam(p, t);
    p.linearRampToValueAtTime(1 - 0.6 * amount, t + 0.08);
    p.setValueAtTime(1 - 0.6 * amount, t + dur * 0.7);
    p.linearRampToValueAtTime(1, t + dur + 0.8);
  }

  music(mood: MusicMood | null, fade = MUSIC_FADE): void {
    const now = this.ac.currentTime;
    if (this.current && this.current.mood === mood) return;
    if (this.current) this.current.fadeOut(now, fade);
    this.current = null;
    if (mood) {
      const p = new MoodPlayer(this.ac, this.musicBus, this.reverbIn, mood, this.rng, now + 0.05);
      p.fadeIn(now, fade);
      this.moods.push(p);
      this.current = p;
    }
    this.update();
  }

  currentMood(): MusicMood | null {
    return this.current?.mood ?? null;
  }

  /** Drive the look-ahead scheduler. Call every ~100 ms live; once with a horizon offline. */
  update(horizon = LOOKAHEAD): void {
    const now = this.ac.currentTime;
    for (let i = this.moods.length - 1; i >= 0; i--) {
      const m = this.moods[i];
      if (m !== this.current && m.finished(now)) {
        m.dispose();
        this.moods.splice(i, 1);
        continue;
      }
      m.scheduleUntil(now + horizon, now);
    }
  }

  setAmbience(levels: { wind?: number; fire?: number }, smooth?: number): void {
    this.ambience.set(levels, smooth);
  }

  activeVoices(): number {
    let n = 0;
    const t = this.ac.currentTime;
    for (const l of this.voices.values()) for (const v of l) if (v.end > t) n++;
    return n;
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Transparent below ~-4 dBFS, then a smooth knee that never exceeds 0.94 (-0.5 dBFS). */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 2048;
  const c = new Float32Array(n);
  const knee = 0.6;
  const ceil = 0.94;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    let y: number;
    if (ax <= knee) y = ax;
    else y = knee + (ceil - knee) * Math.tanh((ax - knee) / (ceil - knee));
    c[i] = Math.sign(x) * y;
  }
  return c;
}
