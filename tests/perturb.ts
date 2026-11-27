// Small random perturbations of the world (tent plots dropped, decor solids removed or nudged) used to prove
// the campaign never depends on one exact layout (a stall under a tiny change means a real player can stall).

import { ALL_MECHANICS, GAME_DATA as SHIPPED_DATA, withMechanics, type GameData } from '../src/data';

/** Every signature mechanic on (the shipped data has them off until the view draws them). */
const GAME_DATA = withMechanics(SHIPPED_DATA, ALL_MECHANICS);

export function perturbed(seed: number): GameData {
  let r = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  const tentSpots = GAME_DATA.camp.tentSpots.filter(() => rnd() > 0.35);
  const decor = GAME_DATA.decor
    .filter((d) => !d.solid || d.unlockedBy || rnd() > 0.3)
    .map((d) => (d.solid && !d.unlockedBy ? { ...d, x: d.x + (rnd() - 0.5) * 0.6, z: d.z + (rnd() - 0.5) * 0.6 } : d));
  return { ...GAME_DATA, decor, camp: { ...GAME_DATA.camp, tentSpots, tentAt: GAME_DATA.camp.tentAt.slice(0, tentSpots.length) } };
}
