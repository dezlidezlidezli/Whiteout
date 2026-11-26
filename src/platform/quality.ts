// Device quality detection and automatic fallback when frames are slow.

export type QualityLevel = 0 | 1 | 2;

export function detectQuality(): QualityLevel {
  const ua = navigator.userAgent;
  const mobile = /iPhone|iPad|iPod|Android/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  if (!mobile) return cores >= 4 ? 2 : 1;
  // Recent iPhones handle "high" (we cap DPR at 2 anyway); older/low-memory devices start lower.
  if (mem < 3 || cores < 4) return 1;
  return 2;
}

/** Watches frame times and steps quality down (never up automatically) when it stays poor. */
export class AutoQuality {
  private acc = 0;
  private n = 0;
  private slowFor = 0;
  private cooldown = 4;
  enabled = true;
  /** Rolling average frame time, ms. */
  avgMs = 16.7;

  constructor(private onLower: () => boolean) {}

  sample(dtSec: number): void {
    if (dtSec <= 0 || dtSec > 0.5) return; // tab switches etc.
    this.acc += dtSec;
    this.n++;
    this.cooldown -= dtSec;
    if (this.acc < 1) return;
    this.avgMs = (this.acc / this.n) * 1000;
    const slow = this.avgMs > 24;
    this.acc = 0;
    this.n = 0;
    this.slowFor = slow ? this.slowFor + 1 : 0;
    if (this.enabled && this.cooldown <= 0 && this.slowFor >= 3) {
      this.slowFor = 0;
      this.cooldown = 6;
      this.onLower();
    }
  }
}
