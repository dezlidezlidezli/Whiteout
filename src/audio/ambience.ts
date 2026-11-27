// Continuous ambience beds, each smoothed toward a 0..1 level:
//   wind  - filtered-noise blizzard (two bands + gust LFOs)
//   fire  - crackling hearth (pre-rendered loop)
//   crowd - cold wordless murmur + shivering hums near a big Icebound queue (pre-rendered loop)
//   camp  - faint cosy life: distant chatter-like blips, laugh-like chirps, fire pops (loop)
// Sources start lazily the first time a level goes above zero and then run silently at gain 0
// (a looping buffer source costs almost nothing). Loops are read by two players at incommensurate
// rates so the pattern takes about a minute to realign and never sounds like a loop.
import { holdParam, makeRng, type Rng } from './synth';

export interface AmbienceLevels {
  wind?: number;
  fire?: number;
  crowd?: number;
  camp?: number;
}

type BedName = 'wind' | 'fire' | 'crowd' | 'camp';

/** Output gain at level 1, curve exponent, smoothing multiplier. */
const BEDS: Record<BedName, [number, number, number]> = {
  wind: [0.32, 1.4, 1],
  fire: [0.5, 1.2, 0.6],
  crowd: [0.3, 1.2, 1],
  camp: [0.3, 1.2, 1],
};

interface Loop {
  buf: AudioBuffer;
  loopEnd: number;
}

export class Ambience {
  private ac: BaseAudioContext;
  private out: GainNode;
  private noise: AudioBuffer;
  private gains: Partial<Record<BedName, GainNode>> = {};
  private lv: Record<BedName, number> = { wind: 0, fire: 0, crowd: 0, camp: 0 };

  constructor(ac: BaseAudioContext, dest: AudioNode, noise: AudioBuffer) {
    this.ac = ac;
    this.noise = noise;
    this.out = ac.createGain();
    this.out.gain.value = 1;
    this.out.connect(dest);
  }

  set(levels: AmbienceLevels, smooth = 0.6): void {
    const now = this.ac.currentTime;
    for (const name of Object.keys(BEDS) as BedName[]) {
      const x = levels[name];
      if (x === undefined || !Number.isFinite(x)) continue;
      this.lv[name] = clamp01(x);
      let g = this.gains[name];
      if (this.lv[name] > 0 && !g) g = this.start(name, now);
      if (g) {
        const [gain, curve, sm] = BEDS[name];
        ramp(g.gain, gain * Math.pow(this.lv[name], curve), now, smooth * sm);
      }
    }
  }

  levels(): Required<AmbienceLevels> {
    return { ...this.lv };
  }

  private start(name: BedName, now: number): GainNode {
    const g = this.ac.createGain();
    g.gain.value = 0;
    g.connect(this.out);
    this.gains[name] = g;
    if (name === 'wind') this.startWind(g, now);
    else if (name === 'fire') this.playLoop(makeLoop(this.ac, 5, 99, fillFire), g, now);
    else if (name === 'crowd') this.playLoop(makeLoop(this.ac, 7, 41, fillCrowd), g, now);
    else this.playLoop(makeLoop(this.ac, 9, 17, fillCamp), g, now);
    return g;
  }

  private playLoop(loop: Loop, dest: AudioNode, now: number): void {
    const layers: [number, number, number][] = [
      [1, 0.8, 0],
      [0.917, 0.45, loop.loopEnd * 0.43],
    ];
    for (const [rate, level, offset] of layers) {
      const src = this.ac.createBufferSource();
      src.buffer = loop.buf;
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = loop.loopEnd;
      src.playbackRate.value = rate;
      const lg = this.ac.createGain();
      lg.gain.value = level;
      src.connect(lg);
      lg.connect(dest);
      src.start(now, offset);
    }
  }

  private startWind(g: GainNode, now: number): void {
    const ac = this.ac;
    // body: broad band of noise, centre slowly wandering
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.5;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.9;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const gust = ac.createGain();
    gust.gain.value = 0.75;
    src.connect(bp);
    bp.connect(lp);
    lp.connect(gust);
    gust.connect(g);

    // whistle: narrow resonant band, quieter
    const src2 = ac.createBufferSource();
    src2.buffer = this.noise;
    src2.loop = true;
    src2.playbackRate.value = 0.83;
    const bp2 = ac.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.value = 950;
    bp2.Q.value = 9;
    const w2 = ac.createGain();
    w2.gain.value = 0.5;
    src2.connect(bp2);
    bp2.connect(w2);
    w2.connect(g);

    // slow LFOs: centre frequency wander + gust amplitude
    const lfo = (freq: number, depth: number, target: AudioParam) => {
      const o = ac.createOscillator();
      o.frequency.value = freq;
      const d = ac.createGain();
      d.gain.value = depth;
      o.connect(d);
      d.connect(target);
      o.start(now);
    };
    lfo(0.071, 180, bp.frequency);
    lfo(0.113, 0.3, gust.gain);
    lfo(0.047, 260, bp2.frequency);
    lfo(0.163, 0.3, w2.gain);
    src.start(now, 0.3);
    src2.start(now, 1.1);
  }
}

// ---------------------------------------------------------------------------------------------
// Pre-rendered loops (generated once per context, sized from its sample rate)

function makeLoop(ac: BaseAudioContext, secs: number, seed: number, fill: (d: Float32Array, sr: number, r: Rng) => void): Loop {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * secs);
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  fill(d, sr, makeRng(seed));
  // normalise to a known peak so bed gains are predictable
  let pk = 0;
  for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
  if (pk > 0) for (let i = 0; i < len; i++) d[i] *= 0.9 / pk;
  // seamless loop: crossfade the last 50 ms into the start; the loop ends where the fade began
  const xf = Math.floor(sr * 0.05);
  for (let i = 0; i < xf; i++) {
    const w = i / xf;
    d[i] = d[i] * w + d[len - xf + i] * (1 - w);
  }
  return { buf, loopEnd: (len - xf) / sr };
}

/** Add a short decaying highpassed noise burst (crackle / pop). */
function addCrackle(d: Float32Array, sr: number, r: Rng, start: number, durS: number, amp: number): void {
  const dur = Math.floor(sr * durS);
  let hp = 0;
  let prev = 0;
  for (let i = 0; i < dur && start + i < d.length; i++) {
    const x = r() * 2 - 1;
    hp = 0.6 * (hp + x - prev);
    prev = x;
    const env = Math.exp((-5 * i) / dur) * Math.min(1, i / Math.max(1, sr * 0.0005));
    d[start + i] += hp * amp * env;
  }
}

/** Add a band-limited noise grain (resonant bandpass, Hann envelope). */
function addNoiseGrain(d: Float32Array, sr: number, r: Rng, start: number, durS: number, f: number, q: number, amp: number): void {
  const n = Math.floor(sr * durS);
  const w = (2 * Math.PI * f) / sr;
  const al = Math.sin(w) / (2 * q);
  const a0 = 1 + al;
  const b0 = al / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n && start + i < d.length; i++) {
    const x = r() * 2 - 1;
    const y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    const env = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    d[start + i] += y * amp * env;
  }
}

/** Add a soft tone with a pitch glide, optional tremolo, Hann-like envelope. */
function addTone(
  d: Float32Array, sr: number, start: number, durS: number, f0: number, f1: number, amp: number,
  trem = 0, tremHz = 0, h2 = 0,
): void {
  const n = Math.floor(sr * durS);
  let ph = 0;
  for (let i = 0; i < n && start + i < d.length; i++) {
    const x = i / n;
    const f = f0 * Math.pow(f1 / f0, x);
    ph += (2 * Math.PI * f) / sr;
    const env = Math.sin(Math.PI * x) ** 1.5;
    const tr = trem ? 1 - trem * (0.5 + 0.5 * Math.sin((2 * Math.PI * tremHz * i) / sr)) : 1;
    d[start + i] += (Math.sin(ph) + h2 * Math.sin(2 * ph)) * amp * env * tr;
  }
}

function lowpassInPlace(d: Float32Array, sr: number, hz: number): void {
  const k = Math.min(1, (2 * Math.PI * hz) / sr);
  let a = 0;
  for (let i = 0; i < d.length; i++) {
    a += k * (d[i] - a);
    d[i] = a;
  }
}

function fillFire(d: Float32Array, sr: number, r: Rng): void {
  const len = d.length;
  // roar: twice-lowpassed noise with slow flicker
  let a = 0;
  let b = 0;
  const k = Math.min(1, (2 * Math.PI * 300) / sr);
  for (let i = 0; i < len; i++) {
    a += k * (r() * 2 - 1 - a);
    b += k * (a - b);
    const flick = 0.7 + 0.3 * Math.sin((i / sr) * 2 * Math.PI * 0.8 + Math.sin((i / sr) * 2.3));
    d[i] = b * 2.2 * flick;
  }
  // crackles; occasional bigger pops
  const count = Math.floor((len / sr) * 9);
  for (let c = 0; c < count; c++) {
    const start = Math.floor(r() * (len - sr * 0.05));
    const big = r() < 0.15;
    addCrackle(d, sr, r, start, big ? 0.02 + r() * 0.02 : 0.002 + r() * 0.008, big ? 0.5 + r() * 0.3 : 0.15 + r() * 0.35);
  }
}

function fillCrowd(d: Float32Array, sr: number, r: Rng): void {
  const secs = d.length / sr;
  // murmur: overlapping soft low-mid noise grains (no formant pairs or consonants -> not speech)
  const grains = Math.floor(secs * 11);
  for (let i = 0; i < grains; i++) {
    const dur = 0.18 + r() * 0.35;
    const start = Math.floor(r() * (secs - dur) * sr);
    addNoiseGrain(d, sr, r, start, dur, 240 + r() * 380, 2.5 + r() * 2, 0.6 + r() * 0.6);
  }
  // cold hums with a shivering tremolo, drifting slightly downward
  const hums = Math.floor(secs * 2.2);
  for (let i = 0; i < hums; i++) {
    const dur = 0.6 + r() * 1.0;
    const start = Math.floor(r() * (secs - dur) * sr);
    const f = 105 + r() * 90;
    addTone(d, sr, start, dur, f, f * (0.94 + r() * 0.04), 0.05 + r() * 0.04, 0.55, 6 + r() * 4, 0.3);
  }
  lowpassInPlace(d, sr, 1100);
}

function fillCamp(d: Float32Array, sr: number, r: Rng): void {
  const secs = d.length / sr;
  // very faint room tone
  let a = 0;
  const k = Math.min(1, (2 * Math.PI * 250) / sr);
  for (let i = 0; i < d.length; i++) {
    a += k * (r() * 2 - 1 - a);
    d[i] = a * 0.15;
  }
  // distant chatter-like blips: little "phrases" of 2-5 pure-tone syllables with gliding pitch
  let t = r() * 0.5;
  while (t < secs - 1.2) {
    const voice = 190 + r() * 230; // each phrase has its own register
    const syl = 2 + Math.floor(r() * 4);
    let s = t;
    for (let j = 0; j < syl; j++) {
      const dur = 0.07 + r() * 0.09;
      const f0 = voice * Math.pow(2, (r() * 4 - 2) / 12);
      const f1 = f0 * Math.pow(2, (r() * 6 - 3) / 12);
      addTone(d, sr, Math.floor(s * sr), dur, f0, f1, 0.09 + r() * 0.05, 0, 0, 0.35);
      s += dur + 0.03 + r() * 0.06;
    }
    // occasional laugh-like chirp: quick descending blips
    if (r() < 0.22) {
      const n = 4 + Math.floor(r() * 2);
      const f = 420 + r() * 160;
      for (let j = 0; j < n; j++) {
        addTone(d, sr, Math.floor((s + 0.1 + j * 0.13) * sr), 0.06, f * Math.pow(0.95, j), f * Math.pow(0.95, j) * 0.92, 0.09, 0, 0, 0.3);
      }
      s += 0.1 + n * 0.13;
    }
    t = s + 0.5 + r() * 1.3;
  }
  lowpassInPlace(d, sr, 1600);
  // soft distant fire pops
  const pops = Math.floor(secs * 2.5);
  for (let i = 0; i < pops; i++) addCrackle(d, sr, r, Math.floor(r() * (secs - 0.05) * sr), 0.003 + r() * 0.006, 0.06 + r() * 0.08);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function ramp(p: AudioParam, v: number, now: number, tc: number): void {
  holdParam(p, now);
  p.setTargetAtTime(v, now, Math.max(0.02, tc));
}
