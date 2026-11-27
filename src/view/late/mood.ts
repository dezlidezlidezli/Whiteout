// Per-area music mood and ambience for the late areas, plus the finale/Open Season overrides
// (asked of the finale director). The view picks title/calm/cozy itself; while an override is
// active we keep the view's own mood memo in step so it never fights us, and set the music and
// ambience after the view has done its per-frame audio (scene.onBeforeRender).

import { audio, type MusicMood } from '../../audio';
import { areaAt, type LateCtx, type LatePart } from './ctx';

export interface MoodSource {
  /** Music the finale/end-state wants, or undefined for no opinion. */
  musicWant(): MusicMood | null | undefined;
  /** Ambience levels the finale/end-state wants (merged over the area's). */
  ambienceWant(): Parameters<typeof audio.ambience>[0] | null;
}

export class Mood implements LatePart {
  private want: MusicMood | null | undefined;
  private amb: Parameters<typeof audio.ambience>[0] | null = null;
  private active = false;
  private lastForge = 0;

  constructor(private ctx: LateCtx, private src: MoodSource) {}

  frame(): void {
    const { view, sim } = this.ctx;
    const s = sim.state;
    const p = s.player;
    let want = this.src.musicWant();
    let amb: Parameters<typeof audio.ambience>[0] = {};
    if (!view.title && want === undefined && s.finale.phase === 'none') {
      const a = areaAt(sim, p.x, p.z);
      if (a === 'beaconPeak') want = 'peak';
      else if (a === 'ironridge' && !sim.cosy) want = 'storm';
      if (a === 'beaconPeak') {
        const g = 0.5 + 0.5 * Math.sin(this.ctx.time * 0.37) * Math.sin(this.ctx.time * 0.11);
        amb = { wind: 0.7 + g * 0.25, gust: g * 0.35 };
      }
    }
    // Forge roar near a working forge, anywhere.
    let forge = 0;
    for (const d of sim.data.stations) {
      if (d.type !== 'processor' || d.model !== 'forge' || !sim.isActive(d.id)) continue;
      const st = s.stations[d.id];
      if (!st || st.kind !== 'processor' || !st.active) continue;
      forge = Math.max(forge, Math.max(0, 1 - Math.hypot(p.x - d.x, p.z - d.z) / 8) * 0.8);
    }
    // Only touch the forge bed when we have something to say (the crank mechanic may drive it too).
    if (forge > 0.01 || this.lastForge > 0.01) amb.forge = forge;
    this.lastForge = forge;
    const extra = this.src.ambienceWant();
    if (extra) amb = { ...amb, ...extra };
    this.amb = amb;
    const on = want !== undefined && !view.title;
    if (on) {
      // Keep the view's memo equal to the mood it would pick, so it never cross-fades over ours.
      (view as unknown as { music: string | null }).music = view.title ? 'title' : sim.cosy ? 'cozy' : 'calm';
    } else if (this.active) {
      (view as unknown as { music: string | null }).music = null; // hand music back to the view
    }
    this.active = on;
    this.want = want;
  }

  post(): void {
    if (this.active && this.want !== undefined) audio.music(this.want);
    if (this.amb) audio.ambience(this.amb);
  }

  reset(): void {
    if (this.active) (this.ctx.view as unknown as { music: string | null }).music = null;
    this.active = false;
  }
}
