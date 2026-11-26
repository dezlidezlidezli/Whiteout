// Continuous ambience: filtered-noise wind (two bands + gust LFOs) and a crackling fire bed.
// Sources start lazily the first time a level goes above zero and then run silently at gain 0
// (a looping buffer source costs almost nothing).
import { holdParam, makeRng } from './synth';

export class Ambience {
  private ac: BaseAudioContext;
  private out: GainNode;
  private noise: AudioBuffer;
  private windGain: GainNode | null = null;
  private fireGain: GainNode | null = null;
  private wind = 0;
  private fire = 0;

  constructor(ac: BaseAudioContext, dest: AudioNode, noise: AudioBuffer) {
    this.ac = ac;
    this.noise = noise;
    this.out = ac.createGain();
    this.out.gain.value = 1;
    this.out.connect(dest);
  }

  set(levels: { wind?: number; fire?: number }, smooth = 0.6): void {
    const now = this.ac.currentTime;
    if (levels.wind !== undefined && Number.isFinite(levels.wind)) {
      this.wind = clamp01(levels.wind);
      if (this.wind > 0 && !this.windGain) this.startWind(now);
      if (this.windGain) ramp(this.windGain.gain, 0.32 * Math.pow(this.wind, 1.4), now, smooth);
    }
    if (levels.fire !== undefined && Number.isFinite(levels.fire)) {
      this.fire = clamp01(levels.fire);
      if (this.fire > 0 && !this.fireGain) this.startFire(now);
      if (this.fireGain) ramp(this.fireGain.gain, 0.5 * Math.pow(this.fire, 1.2), now, smooth * 0.6);
    }
  }

  levels(): { wind: number; fire: number } {
    return { wind: this.wind, fire: this.fire };
  }

  private startWind(now: number): void {
    const ac = this.ac;
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(this.out);
    this.windGain = g;

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

  private startFire(now: number): void {
    const ac = this.ac;
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(this.out);
    this.fireGain = g;
    const src = ac.createBufferSource();
    src.buffer = makeFireBuffer(ac);
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = FIRE_LOOP_END;
    src.connect(g);
    src.start(now);
  }
}

let FIRE_LOOP_END = 4.95;

/** Pre-rendered 5 s loop: soft low roar + sparse random crackles and pops. */
function makeFireBuffer(ac: BaseAudioContext): AudioBuffer {
  const sr = ac.sampleRate;
  const secs = 5;
  const len = Math.floor(sr * secs);
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const r = makeRng(99);
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
  // crackles: short decaying bursts of bright noise; occasional bigger pops
  const count = Math.floor(secs * 9);
  for (let c = 0; c < count; c++) {
    const start = Math.floor(r() * (len - sr * 0.05));
    const big = r() < 0.15;
    const dur = Math.floor(sr * (big ? 0.02 + r() * 0.02 : 0.002 + r() * 0.008));
    const amp = big ? 0.5 + r() * 0.3 : 0.15 + r() * 0.35;
    let hp = 0;
    let prev = 0;
    for (let i = 0; i < dur; i++) {
      const x = r() * 2 - 1;
      hp = 0.6 * (hp + x - prev); // crude highpass
      prev = x;
      const env = Math.exp((-5 * i) / dur) * Math.min(1, i / Math.max(1, sr * 0.0005));
      d[start + i] += hp * amp * env;
    }
  }
  // seamless loop: crossfade the last 50 ms into the start; the loop ends where the fade began
  const xf = Math.floor(sr * 0.05);
  FIRE_LOOP_END = (len - xf) / sr;
  for (let i = 0; i < xf; i++) {
    const w = i / xf;
    d[i] = d[i] * w + d[len - xf + i] * (1 - w);
  }
  return buf;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function ramp(p: AudioParam, v: number, now: number, tc: number): void {
  holdParam(p, now);
  p.setTargetAtTime(v, now, Math.max(0.02, tc));
}
