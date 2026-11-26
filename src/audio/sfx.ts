// Synthesised sound effects. Each function schedules its nodes at v.t and returns its duration (s).
import type { SfxName } from './index';
import { fm, noise, rand, semis, tone, type Voice } from './synth';

type SfxFn = (v: Voice) => number;

export interface SfxSpec {
  fn: SfxFn;
  /** Output gain (loudness calibration; measured by tests/audio). */
  level: number;
  /** Minimum seconds between triggers; faster triggers are dropped. */
  minGap: number;
  /** Max simultaneous voices; the oldest is faded out when exceeded. */
  poly: number;
  /** Random pitch spread in cents (±). */
  cents: number;
  /** Duck the music bus while playing (0 = none, 1 = full). */
  duck?: number;
}

const PENT = [0, 2, 4, 7, 9];

// ---------------------------------------------------------------------------------------------

const pickup: SfxFn = (v) => {
  const f = 392 * v.p; // G4 base; the ladder climbs from here
  // rounded woody body with a quick downward "pop" glide
  tone(v, { f: f * 1.5, f2: f, glide: 0.014, a: 0.0015, d: 0.12, g: 0.6 });
  // marimba-like 4th partial gives the wood
  tone(v, { f: f * 3.99, a: 0.001, d: 0.04, g: 0.24 });
  // soft knock transient
  noise(v, { filter: 'bandpass', f: 1800 + 600 * v.rng(), q: 1.2, a: 0.001, d: 0.012, g: 0.2 });
  return 0.14;
};

const drop: SfxFn = (v) => {
  const f = 196 * v.p;
  tone(v, { f: f * 1.25, f2: f * 0.8, glide: 0.05, a: 0.002, d: 0.09, g: 0.75 });
  tone(v, { type: 'triangle', f: f * 2.5, a: 0.001, d: 0.03, g: 0.12 });
  noise(v, { filter: 'lowpass', f: 900, q: 0.7, a: 0.001, d: 0.04, g: 0.35 });
  return 0.13;
};

const ember: SfxFn = (v) => {
  const f = 784 * v.p; // G5
  // glassy: clean fundamental + inharmonic glass partials + a touch of FM shimmer
  tone(v, { f, a: 0.002, d: 0.42, g: 0.42, rev: 0.25 });
  tone(v, { f: f * 2.756, a: 0.001, d: 0.18, g: 0.12 });
  tone(v, { f: f * 5.404, a: 0.001, d: 0.07, g: 0.05 });
  fm(v, { f: f * 2, ratio: 1.5, index: 0.6, indexDecay: 0.05, a: 0.001, d: 0.12, g: 0.06 });
  return 0.45;
};

const thaw: SfxFn = (v) => {
  const { rng } = v;
  // 1) ice crackle: a burst of tiny bright clicks
  const n = 9 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    noise(v, {
      at: Math.pow(rng(), 1.6) * 0.17,
      filter: 'highpass',
      f: rand(rng, 3000, 6500),
      q: 0.8,
      a: 0.0008,
      d: rand(rng, 0.006, 0.02),
      g: rand(rng, 0.12, 0.32),
    });
  }
  // shard tinkles
  for (let i = 0; i < 3; i++) {
    tone(v, { at: 0.03 + i * 0.045 + rng() * 0.02, f: rand(rng, 2400, 3600), a: 0.001, d: 0.09, g: 0.05 });
  }
  // 2) warm rising shimmer: major arpeggio gliding up into place
  const base = 392 * v.p; // G4
  const chord = [0, 4, 7, 12, 16];
  chord.forEach((s, i) => {
    const f = base * semis(s);
    const at = 0.1 + i * 0.065;
    tone(v, { at, type: 'triangle', f: f * semis(-1.2), f2: f, glide: 0.18, a: 0.04, d: 0.95, g: 0.13, rev: 0.35 });
    tone(v, { at: at + 0.01, f: f * 2, a: 0.03, d: 0.5, g: 0.035, rev: 0.4 });
  });
  // 3) soft upward breath
  noise(v, { at: 0.05, filter: 'bandpass', f: 500, f2: 3000, glide: 0.5, q: 1.4, a: 0.2, d: 0.35, g: 0.12, rev: 0.3 });
  return 1.45;
};

const serve: SfxFn = (v) => {
  const f = 523.25 * v.p; // C5
  // ceramic clink
  tone(v, { f: 2093 * v.p, a: 0.001, d: 0.06, g: 0.1 });
  tone(v, { f: 3290 * v.p, a: 0.001, d: 0.04, g: 0.06 });
  // two-note marimba "here you go"
  tone(v, { f, a: 0.002, d: 0.16, g: 0.42 });
  tone(v, { f: f * 4, a: 0.001, d: 0.03, g: 0.07 });
  tone(v, { at: 0.075, f: f * 1.5, a: 0.002, d: 0.24, g: 0.42, rev: 0.15 });
  tone(v, { at: 0.075, f: f * 6, a: 0.001, d: 0.03, g: 0.06 });
  return 0.36;
};

const craft: SfxFn = (v) => {
  const f = 300 * v.p;
  // two bubbly "bloops" (ladle / pot)
  tone(v, { f, f2: f * 1.9, glide: 0.06, a: 0.003, d: 0.1, g: 0.5 });
  tone(v, { at: 0.07, f: f * 1.25, f2: f * 2.3, glide: 0.05, a: 0.003, d: 0.1, g: 0.42 });
  // woody knock
  noise(v, { filter: 'bandpass', f: 700, q: 2, a: 0.001, d: 0.035, g: 0.3 });
  tone(v, { at: 0.12, f: 1046 * v.p, a: 0.002, d: 0.16, g: 0.12, rev: 0.2 });
  return 0.3;
};

const padTick: SfxFn = (v) => {
  const f = 1400 * v.p;
  tone(v, { f, a: 0.001, d: 0.028, g: 0.35 });
  tone(v, { type: 'triangle', f: f * 2, a: 0.001, d: 0.01, g: 0.08 });
  return 0.04;
};

const padComplete: SfxFn = (v) => {
  // "ka"
  noise(v, { filter: 'bandpass', f: 2000, q: 2, a: 0.001, d: 0.03, g: 0.4 });
  tone(v, { f: 420, f2: 220, glide: 0.03, a: 0.001, d: 0.04, g: 0.35 });
  // "chunk"
  tone(v, { at: 0.075, f: 160, f2: 55, glide: 0.07, a: 0.002, d: 0.24, g: 0.95 });
  noise(v, { at: 0.075, filter: 'lowpass', f: 900, q: 1, a: 0.001, d: 0.08, g: 0.6 });
  tone(v, { at: 0.075, type: 'triangle', f: 330, a: 0.001, d: 0.05, g: 0.2 });
  // sparkle: ascending pentatonic bells
  const base = 1046.5 * v.p;
  [0, 4, 7, 12].forEach((s, i) => {
    tone(v, { at: 0.16 + i * 0.055, f: base * semis(s), a: 0.002, d: 0.38, g: 0.11, rev: 0.4 });
    tone(v, { at: 0.16 + i * 0.055, f: base * semis(s) * 2.756, a: 0.001, d: 0.08, g: 0.03 });
  });
  return 0.9;
};

const unlock: SfxFn = (v) => {
  const base = 523.25 * v.p; // C5
  // pad swell under it
  [0, 4, 7].forEach((s) => {
    tone(v, { type: 'triangle', f: base * 0.5 * semis(s), a: 0.35, d: 1.2, hold: 0.1, g: 0.09, rev: 0.4 });
  });
  // rising bell arpeggio
  [0, 2, 4, 7, 9, 12, 16].forEach((s, i) => {
    const f = base * semis(s);
    tone(v, { at: i * 0.075, f, a: 0.002, d: 0.6, g: 0.16, rev: 0.4 });
    tone(v, { at: i * 0.075, f: f * 2.756, a: 0.001, d: 0.12, g: 0.03 });
  });
  // final shimmer dyad
  tone(v, { at: 0.58, f: base * 2, a: 0.01, d: 1.0, g: 0.12, rev: 0.5 });
  tone(v, { at: 0.58, f: base * 3, a: 0.01, d: 0.9, g: 0.07, rev: 0.5 });
  return 1.75;
};

const questComplete: SfxFn = (v) => {
  const base = 392 * v.p; // G4
  const seq: [number, number][] = [
    [0, 0],
    [5, 0.1],
    [9, 0.2],
  ];
  for (const [s, at] of seq) {
    const f = base * semis(s);
    tone(v, { at, f, a: 0.002, d: 0.22, g: 0.36 });
    tone(v, { at, f: f * 4, a: 0.001, d: 0.03, g: 0.06 });
  }
  // resolving dyad + bell
  tone(v, { at: 0.32, f: base * semis(12), a: 0.003, d: 0.75, g: 0.3, rev: 0.3 });
  tone(v, { at: 0.32, f: base * semis(16), a: 0.003, d: 0.7, g: 0.2, rev: 0.3 });
  fm(v, { at: 0.32, f: base * semis(24), ratio: 3.5, index: 0.8, indexDecay: 0.2, d: 0.6, g: 0.06, rev: 0.4 });
  return 1.15;
};

const hearthUp: SfxFn = (v) => {
  // deep whoomph: swept low noise + sub thump
  noise(v, { filter: 'lowpass', f: 120, f2: 900, glide: 0.18, q: 2, a: 0.08, d: 0.7, g: 0.9 });
  tone(v, { f: 75, f2: 42, glide: 0.4, a: 0.03, d: 0.7, g: 0.75 });
  // warm chord swell: detuned saws through a lowpass that opens and settles
  const ac = v.ac;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.8;
  const t = v.t;
  lp.frequency.setValueAtTime(250, t + 0.1);
  lp.frequency.exponentialRampToValueAtTime(1900, t + 0.8);
  lp.frequency.exponentialRampToValueAtTime(600, t + 2.6);
  lp.connect(v.out);
  if (v.rev) {
    const s = ac.createGain();
    s.gain.value = 0.35;
    lp.connect(s);
    s.connect(v.rev);
  }
  const root = 174.6 * v.p; // F3
  [0, 7, 12, 16, 19].forEach((s, i) => {
    for (const dt of [-8, 8]) {
      tone(v, { at: 0.12 + i * 0.03, type: 'sawtooth', f: root * semis(s), detune: dt, a: 0.45, hold: 0.3, d: 1.9, g: 0.05, dest: lp });
    }
  });
  // late warm sparkle
  [12, 16, 19, 24].forEach((s, i) => {
    tone(v, { at: 0.6 + i * 0.09, f: root * 4 * semis(s - 12), a: 0.004, d: 0.6, g: 0.05, rev: 0.5 });
  });
  return 2.9;
};

const fanfare: SfxFn = (v) => {
  const ac = v.ac;
  const t = v.t;
  const base = 392 * v.p; // G4
  // soft brass: two detuned saws through a per-note opening lowpass
  const brass = (at: number, s: number, len: number, g: number) => {
    const f = base * semis(s);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(500, t + at);
    lp.frequency.exponentialRampToValueAtTime(2400, t + at + 0.06);
    lp.frequency.exponentialRampToValueAtTime(1100, t + at + 0.3 + len * 0.5);
    lp.connect(v.out);
    if (v.rev) {
      const sg = ac.createGain();
      sg.gain.value = 0.35;
      lp.connect(sg);
      sg.connect(v.rev);
    }
    for (const dt of [-6, 6]) {
      tone(v, { at, type: 'sawtooth', f, detune: dt, a: 0.03, hold: len, d: 0.45, g, dest: lp });
    }
    tone(v, { at, f, a: 0.03, hold: len, d: 0.5, g: g * 1.2 });
  };
  const line: [number, number, number][] = [
    [0, -5, 0.08],
    [0.18, 0, 0.08],
    [0.36, 4, 0.08],
    [0.54, 7, 0.4],
    [1.1, 4, 0.08],
    [1.28, 7, 0.08],
    [1.46, 12, 1.3],
  ];
  for (const [at, s, len] of line) brass(at, s, len, 0.07);
  // harmony under the final note
  brass(1.46, 4, 1.3, 0.04);
  brass(1.46, 0, 1.3, 0.04);
  brass(1.46, -12, 1.3, 0.045);
  // timpani-ish thumps
  for (const at of [0, 0.54, 1.46]) {
    tone(v, { at, f: 98 * v.p, f2: 88 * v.p, glide: 0.3, a: 0.004, d: 0.55, g: 0.4 });
    noise(v, { at, filter: 'lowpass', f: 400, q: 0.7, a: 0.002, d: 0.08, g: 0.18 });
  }
  // sparkle bells cascading over the resolution
  [24, 19, 16, 24, 28, 31].forEach((s, i) => {
    tone(v, { at: 1.5 + i * 0.12, f: base * semis(s - 12), a: 0.002, d: 0.8, g: 0.06, rev: 0.6 });
  });
  return 3.6;
};

const chop: SfxFn = (v) => {
  const { rng } = v;
  noise(v, { filter: 'bandpass', f: 1100 * v.p, q: 3, a: 0.001, d: 0.07, g: 1.1 });
  tone(v, { f: 210 * v.p, f2: 130 * v.p, glide: 0.04, a: 0.0015, d: 0.06, g: 0.3 });
  noise(v, { filter: 'highpass', f: 4000, q: 0.7, a: 0.0008, d: 0.006, g: 0.25 });
  // little woody resonance
  tone(v, { f: rand(rng, 520, 600) * v.p, a: 0.001, d: 0.05, g: 0.1 });
  return 0.15;
};

const treeFall: SfxFn = (v) => {
  const ac = v.ac;
  const t = v.t;
  // creak: low saw with wobbling pitch through a resonant bandpass
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 650;
  bp.Q.value = 5;
  bp.connect(v.out);
  const [cg, cend] = [ac.createGain(), t + 0.75];
  cg.gain.value = 0;
  cg.gain.setValueAtTime(0, t);
  cg.gain.linearRampToValueAtTime(0.5, t + 0.12);
  cg.gain.setValueAtTime(0.5, t + 0.45);
  cg.gain.linearRampToValueAtTime(0, cend);
  cg.connect(bp);
  const saw = ac.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.setValueAtTime(55, t);
  saw.frequency.linearRampToValueAtTime(85, t + 0.3);
  saw.frequency.linearRampToValueAtTime(62, t + 0.7);
  const lfo = ac.createOscillator();
  lfo.frequency.value = 9;
  const lg = ac.createGain();
  lg.gain.value = 9;
  lfo.connect(lg);
  lg.connect(saw.frequency);
  saw.connect(cg);
  saw.start(t);
  lfo.start(t);
  saw.stop(cend + 0.01);
  lfo.stop(cend + 0.01);
  // whoosh as it falls
  noise(v, { at: 0.45, filter: 'bandpass', f: 300, f2: 1400, glide: 0.45, q: 1.2, a: 0.35, d: 0.2, g: 0.35 });
  // thud + snow puff
  tone(v, { at: 1.0, f: 90, f2: 38, glide: 0.25, a: 0.004, d: 0.45, g: 0.95 });
  noise(v, { at: 1.0, filter: 'lowpass', f: 380, q: 0.8, a: 0.003, d: 0.35, g: 0.8 });
  noise(v, { at: 1.02, filter: 'highpass', f: 2500, q: 0.6, a: 0.02, d: 0.4, g: 0.1 });
  return 1.5;
};

const mine: SfxFn = (v) => {
  const { rng } = v;
  const f = rand(rng, 1250, 1450) * v.p;
  tone(v, { f, a: 0.001, d: 0.16, g: 0.24 });
  tone(v, { f: f * 2.21, a: 0.001, d: 0.09, g: 0.12 });
  tone(v, { f: f * 3.03, a: 0.001, d: 0.05, g: 0.07 });
  noise(v, { filter: 'highpass', f: 3000, q: 0.7, a: 0.0008, d: 0.012, g: 0.35 });
  tone(v, { f: 220, f2: 140, glide: 0.03, a: 0.001, d: 0.05, g: 0.4 });
  noise(v, { filter: 'bandpass', f: 600, q: 1, a: 0.001, d: 0.05, g: 0.3 });
  return 0.25;
};

const iceCrack: SfxFn = (v) => {
  const { rng } = v;
  for (let i = 0; i < 7; i++) {
    noise(v, {
      at: Math.pow(rng(), 1.3) * 0.12,
      filter: 'bandpass',
      f: rand(rng, 1800, 4000),
      q: 1.2,
      a: 0.0008,
      d: rand(rng, 0.008, 0.025),
      g: rand(rng, 0.25, 0.5),
    });
  }
  // resonant descending "ping" of the ice sheet
  noise(v, { filter: 'bandpass', f: 2800 * v.p, f2: 700 * v.p, glide: 0.3, q: 12, a: 0.002, d: 0.34, g: 1.3 });
  tone(v, { f: 2200 * v.p, f2: 900 * v.p, glide: 0.18, a: 0.0015, d: 0.18, g: 0.08 });
  tone(v, { f: 160, f2: 95, glide: 0.05, a: 0.002, d: 0.09, g: 0.35 });
  return 0.5;
};

const splash: SfxFn = (v) => {
  const { rng } = v;
  tone(v, { f: 320 * v.p, f2: 120 * v.p, glide: 0.07, a: 0.002, d: 0.08, g: 0.3 });
  noise(v, { filter: 'bandpass', f: 400, f2: 1500, glide: 0.12, q: 1.0, a: 0.008, d: 0.38, g: 0.75 });
  noise(v, { at: 0.02, filter: 'highpass', f: 3500, q: 0.6, a: 0.01, d: 0.2, g: 0.05 });
  // droplets: tiny rising chirps
  for (let i = 0; i < 6; i++) {
    const f = rand(rng, 700, 1500) * v.p;
    tone(v, { at: 0.06 + rng() * 0.38, f, f2: f * 1.8, glide: 0.03, a: 0.001, d: 0.035, g: rand(rng, 0.05, 0.12) });
  }
  return 0.55;
};

const hammer: SfxFn = (v) => {
  const { rng } = v;
  tone(v, { f: 260 * v.p, f2: 170 * v.p, glide: 0.04, a: 0.001, d: 0.06, g: 0.6 });
  noise(v, { filter: 'bandpass', f: 2300 * v.p, q: 3, a: 0.001, d: 0.03, g: 0.55 });
  const r = rand(rng, 1650, 1800) * v.p;
  tone(v, { f: r, a: 0.001, d: 0.12, g: 0.07 });
  tone(v, { f: r * 1.56, a: 0.001, d: 0.08, g: 0.04 });
  return 0.2;
};

const uiTap: SfxFn = (v) => {
  tone(v, { f: 1050 * v.p, f2: 900 * v.p, glide: 0.02, a: 0.001, d: 0.04, g: 0.35 });
  tone(v, { type: 'triangle', f: 2100 * v.p, a: 0.001, d: 0.012, g: 0.06 });
  return 0.06;
};

const error: SfxFn = (v) => {
  const ac = v.ac;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1300;
  lp.Q.value = 0.5;
  lp.connect(v.out);
  tone(v, { type: 'triangle', f: 349 * v.p, a: 0.006, d: 0.14, g: 0.5, dest: lp });
  tone(v, { at: 0.13, type: 'triangle', f: 294 * v.p, a: 0.006, d: 0.22, g: 0.5, dest: lp });
  return 0.42;
};

const footstep: SfxFn = (v) => {
  const { rng } = v;
  const n = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    noise(v, {
      at: rng() * 0.06,
      filter: 'bandpass',
      f: rand(rng, 1600, 3600) * v.p,
      q: rand(rng, 0.8, 1.6),
      a: 0.001,
      d: rand(rng, 0.008, 0.022),
      g: rand(rng, 0.25, 0.6),
    });
  }
  noise(v, { filter: 'lowpass', f: 500, q: 0.7, a: 0.004, d: 0.05, g: 0.5 });
  return 0.11;
};

const arrive: SfxFn = (v) => {
  const { rng } = v;
  // two tiny wooden door knocks / latch
  for (const at of [0, 0.085 + rng() * 0.02]) {
    noise(v, { at, filter: 'bandpass', f: rand(rng, 900, 1200), q: 3, a: 0.001, d: 0.03, g: 0.5 });
    tone(v, { at, f: rand(rng, 260, 300), f2: 180, glide: 0.03, a: 0.0015, d: 0.04, g: 0.25 });
  }
  // soft contented "mm" bell
  const f = 659.3 * v.p; // E5
  tone(v, { at: 0.16, f, a: 0.02, d: 0.55, g: 0.18, rev: 0.3 });
  tone(v, { at: 0.16, f: f * 2.0, a: 0.02, d: 0.25, g: 0.03, rev: 0.3 });
  return 0.8;
};

const order: SfxFn = (v) => {
  // rubber stamp: dull thump + paper slap
  tone(v, { f: 180, f2: 90, glide: 0.05, a: 0.002, d: 0.09, g: 0.6 });
  noise(v, { filter: 'bandpass', f: 1400, q: 0.9, a: 0.001, d: 0.05, g: 0.45 });
  noise(v, { filter: 'lowpass', f: 600, q: 0.7, a: 0.002, d: 0.06, g: 0.4 });
  // coin-like ember chime: two bright glassy notes
  const f = 1174.7 * v.p; // D6
  [0, 7].forEach((s, i) => {
    const at = 0.12 + i * 0.07;
    tone(v, { at, f: f * semis(s), a: 0.002, d: 0.45, g: 0.18, rev: 0.3 });
    tone(v, { at, f: f * semis(s) * 2.756, a: 0.001, d: 0.12, g: 0.05 });
    tone(v, { at, f: f * semis(s) * 5.404, a: 0.001, d: 0.05, g: 0.025 });
  });
  return 0.75;
};

const orderNew: SfxFn = (v) => {
  const { rng } = v;
  // paper flutter: a few quick soft filtered-noise flaps
  const n = 4 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    noise(v, { at: i * 0.035 + rng() * 0.01, filter: 'bandpass', f: rand(rng, 1800, 3200), q: 0.8, a: 0.004, d: 0.03, g: rand(rng, 0.25, 0.4) * (1 - i / (n + 1)) });
  }
  // pin pushed in: small tick + short metallic ping
  const at = 0.2;
  noise(v, { at, filter: 'highpass', f: 2500, q: 0.7, a: 0.0008, d: 0.008, g: 0.3 });
  tone(v, { at, f: 2350 * v.p, a: 0.001, d: 0.12, g: 0.1 });
  tone(v, { at, f: 2350 * 2.21 * v.p, a: 0.001, d: 0.05, g: 0.03 });
  tone(v, { at, f: 440, f2: 260, glide: 0.02, a: 0.001, d: 0.03, g: 0.2 });
  return 0.4;
};

const upgrade: SfxFn = (v) => {
  const f = 880 * v.p; // A5
  [0, 5].forEach((s, i) => {
    const at = i * 0.08;
    tone(v, { at, f: f * semis(s), a: 0.002, d: 0.3, g: 0.25, rev: 0.3 });
    tone(v, { at, f: f * semis(s) * 2.756, a: 0.001, d: 0.08, g: 0.05 });
  });
  // tiny sparkle on top
  tone(v, { at: 0.16, f: f * semis(12), a: 0.002, d: 0.3, g: 0.07, rev: 0.4 });
  tone(v, { at: 0.2, f: f * semis(17), a: 0.002, d: 0.25, g: 0.04, rev: 0.4 });
  return 0.55;
};

const beaconStage: SfxFn = (v) => {
  const { rng } = v;
  // heavy stone settling: deep thud + gritty rumble + a couple of trailing grinds
  tone(v, { f: 70, f2: 36, glide: 0.3, a: 0.004, d: 0.6, g: 0.9 });
  noise(v, { filter: 'lowpass', f: 300, q: 0.8, a: 0.004, d: 0.5, g: 0.9 });
  noise(v, { filter: 'bandpass', f: 700, q: 1.2, a: 0.01, d: 0.25, g: 0.3 });
  for (let i = 0; i < 3; i++) {
    noise(v, { at: 0.18 + i * 0.12 + rng() * 0.05, filter: 'bandpass', f: rand(rng, 400, 900), q: 2, a: 0.01, d: 0.12, g: 0.18 });
  }
  // low bell (inharmonic partials, long ring)
  const f = 130.8 * v.p; // C3
  tone(v, { at: 0.12, f, a: 0.004, d: 2.4, g: 0.35, rev: 0.4 });
  tone(v, { at: 0.12, f: f * 2.0, a: 0.004, d: 1.6, g: 0.16, rev: 0.4 });
  tone(v, { at: 0.12, f: f * 2.4, a: 0.003, d: 1.1, g: 0.1, rev: 0.4 });
  tone(v, { at: 0.12, f: f * 3.0, a: 0.003, d: 0.8, g: 0.08 });
  tone(v, { at: 0.12, f: f * 4.2, a: 0.002, d: 0.4, g: 0.05 });
  return 2.7;
};

const dawn: SfxFn = (v) => {
  const ac = v.ac;
  const t = v.t;
  const root = 146.8 * v.p; // D3; the chord below is G major add9, the key of the finale music
  // a long warm swell: detuned saw/triangle chord through a slowly opening lowpass
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.6;
  lp.frequency.setValueAtTime(220, t);
  lp.frequency.exponentialRampToValueAtTime(2200, t + 4.0);
  lp.frequency.exponentialRampToValueAtTime(900, t + 7.0);
  lp.connect(v.out);
  if (v.rev) {
    const s = ac.createGain();
    s.gain.value = 0.45;
    lp.connect(s);
    s.connect(v.rev);
  }
  // G major add9 voiced wide: G2 D3 G3 B3 D4 A4
  const chord = [-7, 0, 5, 9, 12, 19];
  chord.forEach((s, i) => {
    for (const dt of [-7, 7]) {
      tone(v, { at: i * 0.12, type: i < 2 ? 'triangle' : 'sawtooth', f: root * semis(s), detune: dt, a: 2.8, hold: 1.6, d: 2.8, g: i < 2 ? 0.09 : 0.035, dest: lp });
    }
  });
  // shimmering high bells drifting in as the light rises
  const bells = [24, 28, 31, 33, 36, 31, 35, 38, 36, 43];
  bells.forEach((s, i) => {
    const at = 1.4 + i * 0.42 + v.rng() * 0.1;
    tone(v, { at, f: root * semis(s), a: 0.003, d: 1.4, g: 0.05, rev: 0.6 });
    tone(v, { at, f: root * semis(s) * 2.756, a: 0.002, d: 0.25, g: 0.01 });
  });
  return 7.4;
};

// ---------------------------------------------------------------------------------------------

export const SFX: Record<SfxName, SfxSpec> = {
  pickup: { fn: pickup, level: 0.95, minGap: 0.02, poly: 6, cents: 8 },
  drop: { fn: drop, level: 1, minGap: 0.025, poly: 5, cents: 25 },
  ember: { fn: ember, level: 0.85, minGap: 0.02, poly: 4, cents: 6 },
  thaw: { fn: thaw, level: 1.35, minGap: 0.08, poly: 3, cents: 30 },
  serve: { fn: serve, level: 0.85, minGap: 0.06, poly: 3, cents: 20 },
  craft: { fn: craft, level: 1, minGap: 0.06, poly: 3, cents: 40 },
  padTick: { fn: padTick, level: 1.6, minGap: 0.03, poly: 3, cents: 15 },
  padComplete: { fn: padComplete, level: 0.45, minGap: 0.2, poly: 2, cents: 10 },
  unlock: { fn: unlock, level: 1, minGap: 0.5, poly: 1, cents: 0, duck: 0.5 },
  questComplete: { fn: questComplete, level: 0.7, minGap: 0.4, poly: 1, cents: 0, duck: 0.4 },
  chop: { fn: chop, level: 1.7, minGap: 0.06, poly: 3, cents: 60 },
  treeFall: { fn: treeFall, level: 0.36, minGap: 0.3, poly: 2, cents: 40 },
  mine: { fn: mine, level: 1.2, minGap: 0.06, poly: 3, cents: 50 },
  iceCrack: { fn: iceCrack, level: 1, minGap: 0.08, poly: 3, cents: 60 },
  splash: { fn: splash, level: 1.25, minGap: 0.1, poly: 3, cents: 60 },
  hammer: { fn: hammer, level: 1.35, minGap: 0.06, poly: 3, cents: 50 },
  hearthUp: { fn: hearthUp, level: 0.55, minGap: 1.0, poly: 1, cents: 0, duck: 0.6 },
  fanfare: { fn: fanfare, level: 0.65, minGap: 2.0, poly: 1, cents: 0, duck: 0.85 },
  uiTap: { fn: uiTap, level: 1.6, minGap: 0.03, poly: 2, cents: 10 },
  error: { fn: error, level: 1, minGap: 0.15, poly: 1, cents: 0 },
  footstep: { fn: footstep, level: 1.4, minGap: 0.07, poly: 2, cents: 100 },
  arrive: { fn: arrive, level: 0.6, minGap: 0.25, poly: 2, cents: 40 },
  order: { fn: order, level: 1, minGap: 0.3, poly: 2, cents: 0 },
  orderNew: { fn: orderNew, level: 2.2, minGap: 0.3, poly: 1, cents: 30 },
  upgrade: { fn: upgrade, level: 1, minGap: 0.12, poly: 2, cents: 0 },
  beaconStage: { fn: beaconStage, level: 0.55, minGap: 1.0, poly: 1, cents: 0, duck: 0.5 },
  dawn: { fn: dawn, level: 0.8, minGap: 5.0, poly: 1, cents: 0, duck: 0.7 },
};

export const SFX_NAMES = Object.keys(SFX) as SfxName[];

/**
 * Recommended pitch for the n-th item of a streak (stack height, ember combo): climbs a major
 * pentatonic scale for two octaves, then keeps cycling the top octave so it never gets shrill.
 */
export function ladderPitch(n: number): number {
  const i = Math.max(0, Math.floor(n));
  // indices 0..9 = two rising octaves; after that keep cycling the upper octave
  const k = i < 10 ? i : 5 + ((i - 5) % 5);
  const oct = Math.floor(k / 5);
  return semis(PENT[k % 5] + 12 * oct);
}

