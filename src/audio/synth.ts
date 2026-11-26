// Low-level synthesis primitives shared by sfx, music and ambience.
// Everything takes a BaseAudioContext so it renders identically live and in an OfflineAudioContext.
// No sample-rate assumptions: buffers are sized from ctx.sampleRate.

export type Rng = () => number;

/** Small fast seeded PRNG (mulberry32). Audio variation only; never used by the sim. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (rng: Rng, lo: number, hi: number): number => lo + (hi - lo) * rng();
export const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];
export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const semis = (s: number): number => Math.pow(2, s / 12);

/** Per-trigger context handed to every sound function. */
export interface Voice {
  ac: BaseAudioContext;
  /** Where this voice's dry signal goes. */
  out: AudioNode;
  /** Reverb send input (may be null). */
  rev: AudioNode | null;
  /** Start time on the context clock. */
  t: number;
  rng: Rng;
  /** Pitch multiplier (caller pitch × small random variation). */
  p: number;
  noise: AudioBuffer;
}

const MIN = 0.0001;

/**
 * Attack/decay envelope on a fresh gain node. Linear attack, exponential decay to -60 dB, then a
 * short linear ramp to true zero so sources can stop without a click. Returns [node, endTime].
 */
export function envelope(
  ac: BaseAudioContext,
  dest: AudioNode,
  t: number,
  attack: number,
  peak: number,
  decay: number,
  hold = 0,
): [GainNode, number] {
  const g = ac.createGain();
  const a = Math.max(0.001, attack);
  const p = Math.max(MIN * 2, peak);
  // Zero the intrinsic value too: a source starting at a fractional time can render its first
  // frame before the setValueAtTime(0, t) event lands, and the default gain (1) would let a
  // full-scale single-sample spike through.
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(p, t + a);
  if (hold > 0) g.gain.setValueAtTime(p, t + a + hold);
  const end = t + a + hold + Math.max(0.005, decay);
  g.gain.exponentialRampToValueAtTime(p * 0.001, end);
  g.gain.linearRampToValueAtTime(0, end + 0.006);
  g.connect(dest);
  return [g, end + 0.01];
}

export interface ToneOpts {
  type?: OscillatorType;
  f: number;
  /** Glide target frequency (exponential) reached after `glide` seconds. */
  f2?: number;
  glide?: number;
  a?: number;
  d: number;
  hold?: number;
  g: number;
  at?: number; // offset from voice start
  dest?: AudioNode;
  detune?: number;
  /** Amount of this tone sent to reverb. */
  rev?: number;
}

export function tone(v: Voice, o: ToneOpts): number {
  const { ac } = v;
  const t = v.t + (o.at ?? 0);
  const dest = o.dest ?? v.out;
  const [g, end] = envelope(ac, dest, t, o.a ?? 0.002, o.g, o.d, o.hold ?? 0);
  if (o.rev && v.rev) sendTo(ac, g, v.rev, o.rev);
  const osc = ac.createOscillator();
  osc.type = o.type ?? 'sine';
  const f = clampF(ac, o.f);
  osc.frequency.setValueAtTime(f, t);
  if (o.f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(clampF(ac, o.f2), t + (o.glide ?? 0.05));
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);
  osc.connect(g);
  osc.start(t);
  osc.stop(end);
  return end - v.t;
}

export interface NoiseOpts {
  filter?: BiquadFilterType;
  f: number;
  f2?: number;
  glide?: number;
  q?: number;
  a?: number;
  d: number;
  hold?: number;
  g: number;
  at?: number;
  dest?: AudioNode;
  rev?: number;
  /** Playback rate of the noise buffer (lower = darker/grainier). */
  rate?: number;
}

export function noise(v: Voice, o: NoiseOpts): number {
  const { ac } = v;
  const t = v.t + (o.at ?? 0);
  const dest = o.dest ?? v.out;
  const [g, end] = envelope(ac, dest, t, o.a ?? 0.002, o.g, o.d, o.hold ?? 0);
  if (o.rev && v.rev) sendTo(ac, g, v.rev, o.rev);
  const flt = ac.createBiquadFilter();
  flt.type = o.filter ?? 'bandpass';
  flt.frequency.setValueAtTime(clampF(ac, o.f), t);
  if (o.f2 !== undefined) flt.frequency.exponentialRampToValueAtTime(clampF(ac, o.f2), t + (o.glide ?? o.d));
  flt.Q.setValueAtTime(o.q ?? 1, t);
  flt.connect(g);
  const src = ac.createBufferSource();
  src.buffer = v.noise;
  src.loop = true;
  if (o.rate) src.playbackRate.setValueAtTime(o.rate, t);
  src.connect(flt);
  src.start(t, v.rng() * (v.noise.duration - 0.5));
  src.stop(end);
  return end - v.t;
}

/** Simple 2-operator FM bell/glass tone. */
export interface FmOpts {
  f: number;
  ratio: number;
  index: number;
  indexDecay?: number;
  a?: number;
  d: number;
  g: number;
  at?: number;
  dest?: AudioNode;
  rev?: number;
}

export function fm(v: Voice, o: FmOpts): number {
  const { ac } = v;
  const t = v.t + (o.at ?? 0);
  const dest = o.dest ?? v.out;
  const [g, end] = envelope(ac, dest, t, o.a ?? 0.002, o.g, o.d);
  if (o.rev && v.rev) sendTo(ac, g, v.rev, o.rev);
  const car = ac.createOscillator();
  const mod = ac.createOscillator();
  const mg = ac.createGain();
  const f = clampF(ac, o.f);
  car.frequency.setValueAtTime(f, t);
  mod.frequency.setValueAtTime(clampF(ac, f * o.ratio), t);
  const dev = f * o.index;
  mg.gain.setValueAtTime(dev, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(0.01, dev * 0.02), t + (o.indexDecay ?? o.d * 0.5));
  mod.connect(mg);
  mg.connect(car.frequency);
  car.connect(g);
  car.start(t);
  mod.start(t);
  car.stop(end);
  mod.stop(end);
  return end - v.t;
}

export function sendTo(ac: BaseAudioContext, from: AudioNode, to: AudioNode, amount: number): GainNode {
  const s = ac.createGain();
  s.gain.value = amount;
  from.connect(s);
  s.connect(to);
  return s;
}

function clampF(ac: BaseAudioContext, f: number): number {
  return Math.min(ac.sampleRate * 0.45, Math.max(20, f));
}

/** White-noise buffer (mono, a couple of seconds), created once per context. */
export function makeNoiseBuffer(ac: BaseAudioContext, seconds = 2.5, seed = 1): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  const r = makeRng(seed);
  for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
  return buf;
}

/** Procedural stereo reverb impulse response: decaying, progressively darker noise. */
export function makeImpulse(ac: BaseAudioContext, seconds = 2.2, seed = 7): AudioBuffer {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ac.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const r = makeRng(seed + ch * 101);
    let lp = 0;
    const predelay = Math.floor(sr * 0.012);
    for (let i = 0; i < len; i++) {
      const x = i / len;
      // darken over time: one-pole lowpass whose coefficient falls with time
      const k = 0.65 - 0.55 * x;
      lp += k * (r() * 2 - 1 - lp);
      const env = i < predelay ? 0 : Math.pow(1 - x, 2.2) * Math.exp(-3.2 * x);
      d[i] = lp * env;
    }
    // fade the last few ms to zero
    const fade = Math.min(len, Math.floor(sr * 0.01));
    for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
  }
  return buf;
}

/** Freeze an AudioParam at its current value at `now`, discarding later automation. */
export function holdParam(p: AudioParam, now: number): void {
  const anyP = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof anyP.cancelAndHoldAtTime === 'function') {
    anyP.cancelAndHoldAtTime(now);
  } else {
    const v = p.value;
    p.cancelScheduledValues(now);
    p.setValueAtTime(v, now);
  }
}
