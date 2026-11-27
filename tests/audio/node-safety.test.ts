// The audio module must be importable under Node (no window / AudioContext) and every method must
// be a silent no-op there. Browser-side measurements live in tests/audio/measure.cjs.
import { describe, expect, it } from 'vitest';
import { audio, ladderPitch } from '../../src/audio/index';

describe('audio module under Node', () => {
  it('imports without side effects and no-ops safely', () => {
    expect(() => {
      audio.unlock();
      audio.sfx('pickup', { pitch: 1.5 });
      audio.sfx('fanfare');
      audio.music('calm');
      audio.music(null);
      audio.ambience({ wind: 0.5, fire: 1, crowd: 0.3, camp: 1 });
      audio.sfx('dawn');
      audio.sfx('crankNotch');
      audio.music('whiteout');
      audio.ambience({ plough: 0.5, skate: 1, forge: 0.2, flame: 1, gust: 0.4 });
      audio.suspend();
      audio.resume();
    }).not.toThrow();
  });

  it('stores and clamps volumes before unlock', () => {
    audio.setVolumes({ sfx: 0.3 });
    audio.setVolumes({ music: 2 });
    expect(audio.getVolumes()).toEqual({ sfx: 0.3, music: 1 });
    audio.setVolumes({ sfx: 0.8, music: 0.5 });
  });

  it('ladderPitch climbs a pentatonic and stays bounded', () => {
    expect(ladderPitch(0)).toBe(1);
    for (let i = 1; i < 10; i++) expect(ladderPitch(i)).toBeGreaterThan(ladderPitch(i - 1));
    for (let i = 0; i < 200; i++) {
      expect(ladderPitch(i)).toBeGreaterThanOrEqual(1);
      expect(ladderPitch(i)).toBeLessThan(4);
    }
  });
});
