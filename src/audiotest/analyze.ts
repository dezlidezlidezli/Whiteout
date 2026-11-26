// Objective measurements of rendered audio (used by tests/audio/measure.cjs via the soundboard).

export interface Metrics {
  peakDb: number;
  clipped: number;
  /** Max 100 ms-window K-weighted RMS (dBFS) — "how loud does it feel at its loudest". */
  loudDb: number;
  /** K-weighted RMS over the whole active region (dBFS). */
  rmsDb: number;
  /** Seconds from onset until the signal stays below -40 dB re peak. */
  dur: number;
  /** |mean| / peak. */
  dc: number;
  /** Max |x| in the first 0.5 ms after onset, relative to peak (click indicator). */
  attack: number;
  /** Max |x| over the last 20 ms of the render (should be ~0). */
  tail: number;
  /** Max sample-to-sample step relative to peak, outside the first 2 ms (discontinuity indicator). */
  maxStep: number;
  /** Energy-weighted spectral centroid (Hz). */
  centroid: number;
  /** Fraction of 100 ms windows above -50 dBFS. */
  activeFrac: number;
}

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -200);

export function analyze(buf: AudioBuffer, skipSeconds = 0): Metrics {
  const sr = buf.sampleRate;
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const start = Math.floor(skipSeconds * sr);
  const n = buf.length;
  const mono = new Float32Array(n - start);
  let peak = 0;
  let clipped = 0;
  for (let i = start; i < n; i++) {
    let s = 0;
    for (const ch of chans) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      s += ch[i];
    }
    mono[i - start] = s / chans.length;
  }
  const m = mono.length;
  let mp = 0;
  let sum = 0;
  for (let i = 0; i < m; i++) {
    const a = Math.abs(mono[i]);
    if (a > mp) mp = a;
    sum += mono[i];
  }
  const safe = Math.max(mp, 1e-9);
  // onset / end
  let onset = 0;
  while (onset < m && Math.abs(mono[onset]) < safe * 0.001) onset++;
  let end = m - 1;
  const endThr = safe * Math.pow(10, -40 / 20);
  while (end > onset && Math.abs(mono[end]) < endThr) end--;
  const attackN = Math.max(1, Math.floor(sr * 0.0005));
  let atk = 0;
  for (let i = onset; i < Math.min(m, onset + attackN); i++) atk = Math.max(atk, Math.abs(mono[i]));
  let tail = 0;
  for (let i = Math.max(0, m - Math.floor(sr * 0.02)); i < m; i++) tail = Math.max(tail, Math.abs(mono[i]));
  let maxStep = 0;
  for (let i = onset + Math.floor(sr * 0.002); i < m; i++) maxStep = Math.max(maxStep, Math.abs(mono[i] - mono[i - 1]));

  // K-weighting (BS.1770 approximation)
  const kw = kWeight(mono, sr);
  const win = Math.floor(sr * 0.1);
  const hop = Math.floor(win / 4);
  let loud = 0;
  let active = 0;
  let windows = 0;
  for (let i = 0; i + win <= m; i += hop) {
    let e = 0;
    for (let j = i; j < i + win; j++) e += kw[j] * kw[j];
    const r = Math.sqrt(e / win);
    if (r > loud) loud = r;
    windows++;
    if (db(r) > -50) active++;
  }
  if (m < win) {
    let e = 0;
    for (let j = 0; j < m; j++) e += kw[j] * kw[j];
    loud = Math.sqrt(e / win);
  }
  let e2 = 0;
  for (let i = onset; i <= end; i++) e2 += kw[i] * kw[i];
  const rms = Math.sqrt(e2 / Math.max(1, end - onset + 1));

  return {
    peakDb: db(peak),
    clipped,
    loudDb: db(loud),
    rmsDb: db(rms),
    dur: (end - onset) / sr,
    dc: Math.abs(sum / m) / safe,
    attack: atk / safe,
    tail,
    maxStep: maxStep / safe,
    centroid: centroid(mono, sr, onset, end),
    activeFrac: windows ? active / windows : 0,
  };
}

function biquad(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

function kWeight(x: Float32Array, sr: number): Float32Array {
  // stage 1: high shelf +4 dB @ 1682 Hz; stage 2: highpass @ 38 Hz (RBJ cookbook)
  const shelf = (() => {
    const f0 = 1681.97, gain = 4, q = 0.7071;
    const A = Math.pow(10, gain / 40);
    const w = (2 * Math.PI * f0) / sr;
    const cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    const sA = 2 * Math.sqrt(A) * al;
    const a0 = A + 1 - (A - 1) * cs + sA;
    return [
      (A * (A + 1 + (A - 1) * cs + sA)) / a0,
      (-2 * A * (A - 1 + (A + 1) * cs)) / a0,
      (A * (A + 1 + (A - 1) * cs - sA)) / a0,
      (2 * (A - 1 - (A + 1) * cs)) / a0,
      (A + 1 - (A - 1) * cs - sA) / a0,
    ];
  })();
  const hp = (() => {
    const f0 = 38.13, q = 0.5;
    const w = (2 * Math.PI * f0) / sr;
    const cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    const a0 = 1 + al;
    return [(1 + cs) / 2 / a0, -(1 + cs) / a0, (1 + cs) / 2 / a0, (-2 * cs) / a0, (1 - al) / a0];
  })();
  const s1 = biquad(x, shelf[0], shelf[1], shelf[2], shelf[3], shelf[4]);
  return biquad(s1, hp[0], hp[1], hp[2], hp[3], hp[4]);
}

function centroid(x: Float32Array, sr: number, from: number, to: number): number {
  const N = 2048;
  const hann = new Float32Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  let num = 0;
  let den = 0;
  const last = Math.max(from, to - N);
  for (let s = from; s <= last; s += N / 2) {
    for (let i = 0; i < N; i++) {
      re[i] = (x[s + i] ?? 0) * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      const mag = Math.sqrt(p);
      num += ((k * sr) / N) * mag * mag;
      den += mag * mag;
    }
  }
  return den > 0 ? num / den : 0;
}

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j], ai = im[i + j];
        const br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ar + br; im[i + j] = ai + bi;
        re[i + j + len / 2] = ar - br; im[i + j + len / 2] = ai - bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}
