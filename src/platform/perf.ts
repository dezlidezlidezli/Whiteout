// Lightweight frame profiler: fixed-size ring buffers, no per-frame allocation.

const N = 600; // ~10 s at 60 Hz

export class FrameStats {
  readonly dt = new Float32Array(N); // ms between frames
  readonly sim = new Float32Array(N); // ms in sim steps
  readonly view = new Float32Array(N); // ms in view.frame (incl. render submit)
  readonly hud = new Float32Array(N); // ms in hud.update
  readonly steps = new Uint8Array(N);
  i = 0;
  count = 0;
  /** ms spent in the last autosave serialize+write. */
  lastSaveMs = 0;

  push(dt: number, sim: number, view: number, hud: number, steps: number): void {
    const i = this.i;
    this.dt[i] = dt;
    this.sim[i] = sim;
    this.view[i] = view;
    this.hud[i] = hud;
    this.steps[i] = steps;
    this.i = (i + 1) % N;
    if (this.count < N) this.count++;
  }

  /** Summary over the last `frames` frames. */
  summary(frames = N): {
    fps: number; low1: number; dtAvg: number; dtMax: number; long: number;
    sim: number; view: number; hud: number; js95: number; jsMax: number; stepsMax: number; stepsAvg: number;
  } {
    const n = Math.min(frames, this.count);
    if (n === 0) return { fps: 0, low1: 0, dtAvg: 0, dtMax: 0, long: 0, sim: 0, view: 0, hud: 0, js95: 0, jsMax: 0, stepsMax: 0, stepsAvg: 0 };
    const dts: number[] = [];
    const js: number[] = [];
    let sd = 0, ss = 0, sv = 0, sh = 0, st = 0, smax = 0, long = 0, dmax = 0;
    for (let k = 0; k < n; k++) {
      const i = (this.i - 1 - k + N) % N;
      const d = this.dt[i];
      dts.push(d);
      sd += d;
      if (d > dmax) dmax = d;
      if (d > 25) long++;
      ss += this.sim[i];
      sv += this.view[i];
      sh += this.hud[i];
      js.push(this.sim[i] + this.view[i] + this.hud[i]);
      st += this.steps[i];
      if (this.steps[i] > smax) smax = this.steps[i];
    }
    dts.sort((a, b) => b - a);
    js.sort((a, b) => a - b);
    const worst = dts.slice(0, Math.max(1, Math.round(n / 100)));
    const lowDt = worst.reduce((a, b) => a + b, 0) / worst.length;
    const dtAvg = sd / n;
    return {
      fps: 1000 / dtAvg, low1: 1000 / lowDt, dtAvg, dtMax: dmax, long,
      sim: ss / n, view: sv / n, hud: sh / n, js95: js[Math.floor(js.length * 0.95)], jsMax: js[js.length - 1],
      stepsMax: smax, stepsAvg: st / n,
    };
  }
}
