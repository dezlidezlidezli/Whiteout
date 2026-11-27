// AUDIO CONTRACT — the signatures below are fixed; other code imports only from this file.
// Fully procedural WebAudio implementation lives in sibling files (engine/sfx/music/ambience/live).

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
  | 'footstep'
  | 'arrive' // thawed villager reaches camp / enters a tent (quiet, frequent)
  | 'order' // caravan order completed on the notice board
  | 'orderNew' // a new caravan order is posted
  | 'upgrade' // repeatable upgrade bought (lighter than padComplete)
  | 'beaconStage' // a Great Beacon stage completes
  | 'dawn' // finale dawn break: long warm swell (6-8 s) the finale music enters under
  // --- signature mechanics (docs/MECHANICS.md)
  | 'ploughFind' // plough uncovers a find
  | 'zoneCleared' // a deep-snow zone reaches 100 %
  | 'dig' // digging a buried villager out (repeatable scoops)
  | 'rescued' // villager dug free: tender breathy swell + hopeful chime
  | 'followerWait' // follower left outside the glow stops and waits
  | 'followerHome' // follower reaches warmth
  | 'lanternOn'
  | 'allFound' // all lost villagers found (~3 s)
  | 'fishLeapSpawn'
  | 'fishLeapCatch' // pass pitch: ladderPitch(combo)
  | 'skateBounce'
  | 'crankNotch' // up to ~12/s
  | 'crankTurn' // one full capstan turn
  | 'liftArrive'
  | 'bellows'
  | 'flameTaken'
  | 'flameLow' // occasional gentle warning
  | 'flameOut'
  | 'brazierLit'
  | 'trailComplete';

export type MusicMood = 'title' | 'calm' | 'cozy' | 'storm' | 'finale' | 'whiteout' | 'peak';

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
  /**
   * Continuous ambience controls, 0..1. wind = blizzard intensity, fire = proximity to hearth/kettle,
   * crowd = near a big Icebound queue (cold murmur), camp = inside a populated camp (cosy life),
   * plough = pushing the plough (ramp it up while pushing; it brightens with level),
   * skate = skating speed (blade hiss), forge = forge blast level, flame = carried flame level,
   * gust = standing in a wind gap (whistling layer on top of wind).
   */
  ambience(levels: {
    wind?: number;
    fire?: number;
    crowd?: number;
    camp?: number;
    plough?: number;
    skate?: number;
    forge?: number;
    flame?: number;
    gust?: number;
  }): void;
  setVolumes(v: { sfx?: number; music?: number }): void;
  getVolumes(): { sfx: number; music: number };
  /** Pause/resume everything (app backgrounded). */
  suspend(): void;
  resume(): void;
}

import { createLiveAudio } from './live';
import { ladderPitch as ladder } from './sfx';

/** The game's audio singleton. Lazy: nothing is created until unlock() runs in a user gesture. */
export const audio: AudioApi = createLiveAudio();

/**
 * Optional helper: pitch multiplier for the n-th item of a streak (stack height for `pickup`,
 * combo count for `ember`). Climbs a major pentatonic two octaves, then cycles the top octave.
 * Usage: audio.sfx('pickup', { pitch: ladderPitch(stack.length - 1) }).
 */
export function ladderPitch(n: number): number {
  return ladder(n);
}
