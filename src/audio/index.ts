// AUDIO CONTRACT — the signatures below are fixed; other code imports only from this file.
// Stub implementation (no-op). The audio agent replaces the internals with procedural WebAudio.

export type SfxName =
  | 'pickup' // item hops onto the carry stack (pass rising pitch as the stack grows)
  | 'drop' // item leaves the stack into a station
  | 'craft' // a processor finishes one output (kettle ladle, saw, forge clang)
  | 'serve' // bowl handed to a villager
  | 'thaw' // villager thaws — the signature "reward" sound
  | 'ember' // one ember collected (pitch ladder for streaks)
  | 'padTick' // paying into a build pad
  | 'padComplete' // pad fully paid, thing appears
  | 'unlock' // new area / big unlock
  | 'questComplete'
  | 'chop'
  | 'treeFall'
  | 'mine'
  | 'iceCrack'
  | 'splash'
  | 'hammer'
  | 'hearthUp' // hearth level rises, frost recedes
  | 'fanfare' // finale
  | 'uiTap'
  | 'error'
  | 'footstep';

export type MusicMood = 'title' | 'calm' | 'cozy' | 'storm' | 'finale';

export interface SfxOpts {
  /** Playback pitch multiplier, 1 = normal. */
  pitch?: number;
  /** 0..1 multiplier on top of the sfx bus volume. */
  volume?: number;
}

export interface AudioApi {
  /** Must be called from inside a user gesture (first touch). Safe to call repeatedly. */
  unlock(): void;
  sfx(name: SfxName, opts?: SfxOpts): void;
  /** Cross-fades to the given mood; null fades music out. */
  music(mood: MusicMood | null): void;
  /** Continuous ambience controls, 0..1. wind = blizzard intensity, fire = proximity to hearth/kettle. */
  ambience(levels: { wind?: number; fire?: number }): void;
  setVolumes(v: { sfx?: number; music?: number }): void;
  getVolumes(): { sfx: number; music: number };
  /** Pause/resume everything (app backgrounded). */
  suspend(): void;
  resume(): void;
}

let volumes = { sfx: 0.8, music: 0.5 };

export const audio: AudioApi = {
  unlock() {},
  sfx() {},
  music() {},
  ambience() {},
  setVolumes(v) {
    volumes = { ...volumes, ...v };
  },
  getVolumes() {
    return { ...volumes };
  },
  suspend() {},
  resume() {},
};
