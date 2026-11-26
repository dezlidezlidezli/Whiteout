// Device quality detection and automatic fallback when frames are slow.

export type QualityLevel = 0 | 1 | 2;

export function detectQuality(): QualityLevel {
  const ua = navigator.userAgent;
  const mobile = /iPhone|iPad|iPod|Android/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const cores = navigator.hardwareConcurrency || 4;
  if (!mobile) return cores >= 4 ? 2 : 1;
  // Phones: fill rate at DPR 3 is the limit, so start on Balanced (DPR 1.75, small shadow map).
  return 1;
}

/**
 * Watches frame times and lowers the render resolution (never the tier, never upward) when frames
 * stay slow. Hysteresis: needs 3 slow seconds in a row, then waits 8 s before judging again.
 */
export class AutoQuality {
  private acc = 0;
  private n = 0;
  private slowFor = 0;
  private cooldown = 5;
  enabled = true;
  /** Rolling average frame time, ms. */
  avgMs = 16.7;

  constructor(private onLower: () => boolean) {}

  /** `refreshSec` = the display interval main has learned (1/60, 1/120, 1/30 in Low Power Mode). */
  sample(dtSec: number, refreshSec = 1 / 60): void {
    if (dtSec <= 0 || dtSec > 0.5) return;
    this.acc += dtSec;
    this.n++;
    this.cooldown -= dtSec;
    if (this.acc < 1) return;
    this.avgMs = (this.acc / this.n) * 1000;
    this.acc = 0;
    this.n = 0;
    // Slow = clearly missing the display's own cadence (so 30 Hz Low Power Mode is not "slow").
    this.slowFor = this.avgMs > Math.max(refreshSec, 1 / 60) * 1000 * 1.35 ? this.slowFor + 1 : 0;
    if (this.enabled && this.cooldown <= 0 && this.slowFor >= 3) {
      this.slowFor = 0;
      this.cooldown = 8;
      this.onLower();
    }
  }
}
