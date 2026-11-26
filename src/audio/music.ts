// Generative music: per-mood chord graph + phrase-based melody generator, scheduled ahead on the
// audio clock. One MoodPlayer per active mood; the engine cross-fades between them.
import type { MusicMood } from './index';
import { envelope, holdParam, midiHz, pick, rand, type Rng } from './synth';

type Inst = 'kalimba' | 'musicbox' | 'bell' | 'pluckLow';

interface MoodDef {
  bpm: number;
  /** MIDI root of the key. */
  root: number;
  scale: number[];
  /** Chord graph over scale degrees (0-based): degree -> allowed next degrees (weighted by repeats). */
  graph: Record<number, number[]>;
  start: number;
  barsPerChord: number;
  /** Melody: instrument, range (MIDI), phrase length, rest between phrases (in 8th steps). */
  mel: Inst;
  melLo: number;
  melHi: number;
  phrase: [number, number];
  rest: [number, number];
  durs: number[];
  melGain: number;
  /** Chance of repeating the previous motif (gives coherence). */
  motif: number;
  /** Pad level and brightness (lowpass Hz). */
  pad: number;
  padCut: number;
  padType: OscillatorType;
  bass: number;
  /** Arpeggio counter-line: probability per 8th step, instrument, octave. */
  arp: number;
  arpInst: Inst;
  arpOct: number;
  /** Low pulse (storm heartbeat). */
  pulse: number;
  /** Overall mood gain. */
  gain: number;
  reverb: number;
  /** Probability that a chord change goes home to degree 0 (resolution). */
  home: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

const MAJOR_GRAPH: Record<number, number[]> = {
  0: [3, 3, 5, 5, 1, 4],
  1: [4, 4, 3, 5],
  2: [5, 3],
  3: [0, 0, 4, 5, 1],
  4: [0, 0, 5, 3],
  5: [3, 3, 1, 2, 4],
};

export const MOODS: Record<MusicMood, MoodDef> = {
  calm: {
    bpm: 66,
    root: 62, // D
    scale: MAJOR,
    graph: MAJOR_GRAPH,
    start: 0,
    barsPerChord: 2,
    mel: 'kalimba',
    melLo: 69,
    melHi: 88,
    phrase: [3, 6],
    rest: [6, 16],
    durs: [1, 2, 2, 2, 3, 4],
    melGain: 0.2,
    motif: 0.3,
    pad: 0.05,
    padCut: 900,
    padType: 'triangle',
    bass: 0,
    arp: 0.06,
    arpInst: 'musicbox',
    arpOct: 2,
    pulse: 0,
    gain: 1,
    reverb: 0.55,
    home: 0.2,
  },
  cozy: {
    bpm: 72,
    root: 65, // F
    scale: MAJOR,
    graph: MAJOR_GRAPH,
    start: 0,
    barsPerChord: 2,
    mel: 'kalimba',
    melLo: 67,
    melHi: 86,
    phrase: [4, 7],
    rest: [3, 10],
    durs: [1, 1, 2, 2, 3],
    melGain: 0.19,
    motif: 0.35,
    pad: 0.06,
    padCut: 1300,
    padType: 'triangle',
    bass: 0.11,
    arp: 0.22,
    arpInst: 'musicbox',
    arpOct: 1,
    pulse: 0,
    gain: 1,
    reverb: 0.5,
    home: 0.25,
  },
  storm: {
    bpm: 60,
    root: 57, // A minor, low
    scale: MINOR,
    graph: {
      0: [5, 5, 3, 6, 4],
      2: [5, 3],
      3: [0, 0, 4, 5],
      4: [0, 0, 5],
      5: [3, 6, 0],
      6: [0, 0, 2],
    },
    start: 0,
    barsPerChord: 2,
    mel: 'pluckLow',
    melLo: 57,
    melHi: 74,
    phrase: [2, 5],
    rest: [8, 18],
    durs: [2, 2, 3, 4],
    melGain: 0.2,
    motif: 0.45,
    pad: 0.06,
    padCut: 550,
    padType: 'sawtooth',
    bass: 0.13,
    arp: 0,
    arpInst: 'kalimba',
    arpOct: 0,
    pulse: 0.18,
    gain: 1,
    reverb: 0.6,
    home: 0.2,
  },
  title: {
    bpm: 76,
    root: 60, // C
    scale: MAJOR,
    graph: MAJOR_GRAPH,
    start: 0,
    barsPerChord: 2,
    mel: 'musicbox',
    melLo: 72,
    melHi: 91,
    phrase: [4, 7],
    rest: [4, 10],
    durs: [1, 1, 2, 2, 3],
    melGain: 0.18,
    motif: 0.55,
    pad: 0.055,
    padCut: 1100,
    padType: 'triangle',
    bass: 0.08,
    arp: 0.12,
    arpInst: 'kalimba',
    arpOct: 1,
    pulse: 0,
    gain: 1,
    reverb: 0.55,
    home: 0.3,
  },
  finale: {
    bpm: 84,
    root: 67, // G
    scale: MAJOR,
    graph: { 0: [3, 4, 5], 1: [4], 2: [3], 3: [4, 4, 0, 1], 4: [0, 0, 0, 5], 5: [3, 1, 4] },
    start: 0,
    barsPerChord: 1,
    mel: 'bell',
    melLo: 71,
    melHi: 91,
    phrase: [4, 8],
    rest: [2, 6],
    durs: [1, 1, 2, 2, 4],
    melGain: 0.16,
    motif: 0.4,
    pad: 0.065,
    padCut: 1800,
    padType: 'sawtooth',
    bass: 0.12,
    arp: 0.35,
    arpInst: 'musicbox',
    arpOct: 1,
    pulse: 0,
    gain: 1,
    reverb: 0.55,
    home: 0.45,
  },
};

// --------------------------------------------------------------------------------------------
// Instruments (cheap: 2-4 nodes per note)

function playNote(ac: BaseAudioContext, out: AudioNode, inst: Inst, t: number, midi: number, vel: number, rng: Rng): void {
  const f = midiHz(midi);
  const g = vel;
  const osc = (type: OscillatorType, freq: number, a: number, peak: number, d: number, detune = 0) => {
    const [eg, end] = envelope(ac, out, t, a, peak, d);
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.min(freq, ac.sampleRate * 0.45), t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.connect(eg);
    o.start(t);
    o.stop(end);
  };
  switch (inst) {
    case 'kalimba': {
      const d = 1.6 * Math.pow(440 / f, 0.35);
      osc('sine', f, 0.003, g, d);
      osc('sine', f * 5.95, 0.001, g * 0.08, 0.07);
      osc('triangle', f * 2, 0.002, g * 0.05, d * 0.25);
      break;
    }
    case 'musicbox': {
      const d = 1.3 * Math.pow(440 / f, 0.3);
      osc('sine', f, 0.002, g, d);
      osc('sine', f * 4, 0.001, g * 0.1, d * 0.15);
      osc('sine', f * 2.0, 0.001, g * 0.12, d * 0.4, rand(rng, -4, 4));
      break;
    }
    case 'bell': {
      osc('sine', f, 0.003, g, 1.8);
      osc('sine', f * 2.0, 0.002, g * 0.25, 0.9);
      osc('sine', f * 3.01, 0.001, g * 0.12, 0.35);
      osc('sine', f * 4.2, 0.001, g * 0.06, 0.15);
      break;
    }
    case 'pluckLow': {
      osc('triangle', f, 0.006, g, 1.4);
      osc('sine', f * 2, 0.004, g * 0.25, 0.4);
      break;
    }
  }
}

function playPad(
  ac: BaseAudioContext,
  out: AudioNode,
  def: MoodDef,
  t: number,
  dur: number,
  notes: number[],
  rng: Rng,
): void {
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.5;
  lp.frequency.setValueAtTime(def.padCut * 0.6, t);
  lp.frequency.linearRampToValueAtTime(def.padCut * rand(rng, 0.9, 1.25), t + dur * 0.5);
  lp.frequency.linearRampToValueAtTime(def.padCut * 0.6, t + dur);
  const g = ac.createGain();
  g.gain.value = 0;
  const att = Math.min(2.2, dur * 0.35);
  const rel = 2.2;
  const level = def.pad / Math.sqrt(notes.length);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + att);
  g.gain.setValueAtTime(level, t + dur - 0.05);
  g.gain.linearRampToValueAtTime(0, t + dur + rel);
  lp.connect(g);
  g.connect(out);
  const end = t + dur + rel + 0.05;
  for (const m of notes) {
    for (const dt of [-7, 7]) {
      const o = ac.createOscillator();
      o.type = def.padType;
      o.frequency.setValueAtTime(midiHz(m), t);
      o.detune.setValueAtTime(dt + rand(rng, -2, 2), t);
      o.connect(lp);
      o.start(t);
      o.stop(end);
    }
  }
}

// --------------------------------------------------------------------------------------------

export class MoodPlayer {
  readonly mood: MusicMood;
  readonly out: GainNode;
  private def: MoodDef;
  private ac: BaseAudioContext;
  private rng: Rng;
  private dry: GainNode;
  private step = 0;
  private nextTime: number;
  private stepDur: number;
  private chordDeg: number;
  private chord: number[] = [];
  private stopAt = Infinity;
  // melody state
  private nextNoteStep = 0;
  private phraseLeft = 0;
  private melMidi: number;
  private motifMem: number[] = [];
  private motifPlay: number[] | null = null;
  private curPhrase: number[] = [];
  private chordCount = 0;

  constructor(ac: BaseAudioContext, dest: AudioNode, reverb: AudioNode | null, mood: MusicMood, rng: Rng, startTime: number) {
    this.ac = ac;
    this.mood = mood;
    this.def = MOODS[mood];
    this.rng = rng;
    this.out = ac.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.dry = ac.createGain();
    this.dry.gain.value = this.def.gain;
    this.dry.connect(this.out);
    if (reverb) {
      const s = ac.createGain();
      s.gain.value = this.def.reverb;
      this.dry.connect(s);
      s.connect(reverb);
    }
    this.stepDur = 60 / this.def.bpm / 2;
    this.nextTime = startTime;
    this.chordDeg = this.def.start;
    this.melMidi = Math.round((this.def.melLo + this.def.melHi) / 2);
    this.nextNoteStep = 4 + Math.floor(rng() * 6);
  }

  fadeIn(now: number, secs: number): void {
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    if (secs <= 0) g.setValueAtTime(1, now);
    else g.linearRampToValueAtTime(1, now + secs);
  }

  fadeOut(now: number, secs: number): void {
    const g = this.out.gain;
    holdParam(g, now);
    g.linearRampToValueAtTime(0, now + Math.max(0.05, secs));
    this.stopAt = now + secs;
  }

  /** True when fully faded and every scheduled note has rung out. */
  finished(now: number): boolean {
    return now > this.stopAt + 4.5;
  }

  dispose(): void {
    try {
      this.out.disconnect();
    } catch {
      /* already gone */
    }
  }

  /** Schedule everything that starts before `until` (audio clock). */
  scheduleUntil(until: number, now: number): void {
    // fell behind (context suspended / tab throttled): jump forward instead of bursting notes
    if (this.nextTime < now - 0.2) {
      const skip = Math.ceil((now - this.nextTime) / this.stepDur);
      this.nextTime += skip * this.stepDur;
      this.step += skip;
    }
    while (this.nextTime < until && this.nextTime < this.stopAt) {
      this.doStep(this.step, this.nextTime);
      this.step++;
      this.nextTime += this.stepDur;
    }
  }

  private degToMidi(deg: number, octave = 0): number {
    const sc = this.def.scale;
    const o = Math.floor(deg / sc.length);
    const i = ((deg % sc.length) + sc.length) % sc.length;
    return this.def.root + sc[i] + 12 * (o + octave);
  }

  private buildChord(deg: number): number[] {
    // triad (+ sometimes 7th / 9th for colour), voiced around the root an octave below the key
    const tones = [deg, deg + 2, deg + 4];
    if (this.rng() < 0.35) tones.push(deg + 6);
    else if (this.rng() < 0.3) tones.push(deg + 8);
    return tones.map((d) => this.degToMidi(d, -1));
  }

  private doStep(step: number, t: number): void {
    const def = this.def;
    const rng = this.rng;
    const stepsPerChord = def.barsPerChord * 8;
    const ac = this.ac;
    const jitter = () => t + rand(rng, 0, 0.012);

    if (step % stepsPerChord === 0) {
      if (step > 0) {
        const nexts = def.graph[this.chordDeg] ?? [0];
        this.chordDeg = rng() < def.home && this.chordDeg !== 0 ? 0 : pick(rng, nexts);
        if (!(this.chordDeg in def.graph)) this.chordDeg = 0;
      }
      this.chordCount++;
      this.chord = this.buildChord(this.chordDeg);
      playPad(ac, this.dry, def, t, stepsPerChord * this.stepDur, this.chord, rng);
      if (def.bass > 0) {
        const bm = this.degToMidi(this.chordDeg, -2);
        bassNote(ac, this.dry, t, midiHz(bm), def.bass, stepsPerChord * this.stepDur * 0.9);
      }
    }
    // second bass hit halfway through long chords (cozy / finale)
    if (def.bass > 0 && step % stepsPerChord === stepsPerChord / 2 && rng() < 0.5) {
      bassNote(ac, this.dry, t, midiHz(this.degToMidi(this.chordDeg + (rng() < 0.5 ? 4 : 0), -2)), def.bass * 0.7, stepsPerChord * this.stepDur * 0.4);
    }
    // storm heartbeat pulse on beats 1 and 3
    if (def.pulse > 0 && step % 4 === 0) {
      const bm = this.degToMidi(this.chordDeg, -2);
      bassNote(ac, this.dry, t, midiHz(bm), def.pulse * (step % 8 === 0 ? 1 : 0.6), 0.5);
    }
    // arpeggio counter-line
    if (def.arp > 0 && step % 1 === 0 && rng() < def.arp && step >= 4) {
      const m = pick(rng, this.chord) + 12 * def.arpOct;
      playNote(ac, this.dry, def.arpInst, jitter(), m, def.melGain * rand(rng, 0.3, 0.5), rng);
    }
    // melody
    if (step >= this.nextNoteStep) this.melodyStep(step, t);
  }

  private melodyStep(step: number, t: number): void {
    const def = this.def;
    const rng = this.rng;
    if (this.phraseLeft <= 0) {
      // begin a new phrase (maybe a variation of the last motif)
      this.phraseLeft = Math.round(rand(rng, def.phrase[0], def.phrase[1] + 0.99));
      this.motifPlay = this.motifMem.length > 2 && rng() < def.motif ? [...this.motifMem] : null;
      if (this.motifPlay) this.phraseLeft = this.motifPlay.length + 1;
      this.curPhrase = [];
    }
    const strong = step % 4 === 0;
    const chordPcs = this.chord.map((m) => ((m % 12) + 12) % 12);
    let m = this.melMidi;
    if (this.motifPlay && this.motifPlay.length) {
      m += this.motifPlay.shift()!;
    } else {
      const r = rng();
      const scaleStep = r < 0.55 ? 1 : r < 0.8 ? 2 : r < 0.88 ? 0 : 3;
      const dir = rng() < 0.5 ? -1 : 1;
      m = this.moveInScale(m, dir * scaleStep);
    }
    const last = this.phraseLeft === 1;
    if ((strong && rng() < 0.65) || last) m = this.nearestChordTone(m, chordPcs);
    // stay in range by reflecting
    if (m > def.melHi) m = this.moveInScale(m, -2 - Math.floor(rng() * 3));
    if (m < def.melLo) m = this.moveInScale(m, 2 + Math.floor(rng() * 3));
    m = Math.min(def.melHi + 2, Math.max(def.melLo - 2, m));
    this.curPhrase.push(m - this.melMidi);
    this.melMidi = m;

    const vel = def.melGain * rand(rng, 0.65, 1) * (last ? 0.85 : 1);
    playNote(this.ac, this.dry, def.mel, t + rand(rng, 0, 0.015), m, vel, rng);
    // occasional soft harmony a third/sixth below on long notes
    let dur = pick(rng, def.durs);
    if (last) dur = Math.max(dur, 3);
    if (dur >= 3 && rng() < 0.3) {
      playNote(this.ac, this.dry, def.mel, t + 0.01, this.moveInScale(m, -2), vel * 0.45, rng);
    }
    this.phraseLeft--;
    if (this.phraseLeft <= 0) {
      if (!this.motifPlay && this.curPhrase.length > 2) this.motifMem = this.curPhrase.slice(1);
      this.motifPlay = null;
      this.nextNoteStep = step + dur + Math.round(rand(rng, def.rest[0], def.rest[1]));
    } else {
      this.nextNoteStep = step + dur;
    }
  }

  private moveInScale(m: number, steps: number): number {
    const sc = this.def.scale;
    const rel = m - this.def.root;
    const oct = Math.floor(rel / 12);
    const pc = ((rel % 12) + 12) % 12;
    // find closest scale index
    let idx = 0;
    let best = 99;
    sc.forEach((s, i) => {
      const dd = Math.abs(s - pc);
      if (dd < best) {
        best = dd;
        idx = i;
      }
    });
    const deg = oct * sc.length + idx + steps;
    return this.degToMidi(deg);
  }

  private nearestChordTone(m: number, pcs: number[]): number {
    for (let d = 0; d < 7; d++) {
      for (const s of [m - d, m + d]) if (pcs.includes(((s % 12) + 12) % 12)) return s;
    }
    return m;
  }
}

function bassNote(ac: BaseAudioContext, out: AudioNode, t: number, f: number, g: number, dur: number): void {
  const [eg, end] = envelope(ac, out, t, 0.04, g, Math.max(0.3, dur));
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  o.connect(eg);
  const o2 = ac.createOscillator();
  o2.type = 'triangle';
  o2.frequency.setValueAtTime(f * 2, t);
  const g2 = ac.createGain();
  g2.gain.value = 0.15;
  o2.connect(g2);
  g2.connect(eg);
  o.start(t);
  o2.start(t);
  o.stop(end);
  o2.stop(end);
}
