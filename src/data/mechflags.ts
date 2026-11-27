// Per-mechanic switches (plough, rescue, skate, crank, flame). The full game data holds everything;
// withMechanics() derives a copy with the disabled mechanics stripped out, so a disabled mechanic is
// completely inert and invisible: no zones, no pads, no quests, no stations/decor/helpers in the arrays
// the view iterates. Pure data, deterministic. Placement (tents, forest) is identical in every
// configuration, so saves move freely between configurations.

import type { GameData, MechanicFlags, PadDef, QuestDef } from './types';

export type MechanicId = keyof MechanicFlags;
export const MECHANIC_IDS: readonly MechanicId[] = ['plough', 'rescue', 'skate', 'crank', 'flame'];
export const ALL_MECHANICS: Readonly<MechanicFlags> = { plough: true, rescue: true, skate: true, crank: true, flame: true };
export const NO_MECHANICS: Readonly<MechanicFlags> = { plough: false, rescue: false, skate: false, crank: false, flame: false };
/** The mechanics switched on in the shipped game: each is turned on here once the view draws it. */
export const SHIPPED_MECHANICS: Readonly<MechanicFlags> = { ...NO_MECHANICS, crank: true, plough: true, flame: true };

const GRANT_OF: Record<'plough' | 'lantern' | 'skates', MechanicId> = { plough: 'plough', lantern: 'rescue', skates: 'skate' };

/** Derived data -> the full data it was derived from (so withMechanics can always widen again). */
const FULL = new WeakMap<GameData, GameData>();

/** The full (all mechanics) data a configuration was derived from; itself if it is full data. */
export function fullDataOf(data: GameData): GameData {
  return FULL.get(data) ?? data;
}

/** What each mechanic owns in the full data (ids); zones and mech arrays are emptied separately. */
const OWNS: Record<MechanicId, { pads: string[]; quests: string[]; stations: string[]; decor: (id: string, model: string) => boolean; helpers: string[] }> = {
  plough: {
    pads: ['pad_plough', 'pad_ploughBlade'],
    quests: ['q_plough', 'q_ploughLot'],
    stations: ['crateFindPine', 'crateFindLake'],
    decor: (id) => id === 'lm_pineStatue' || id === 'lm_lakeSculpture',
    helpers: [],
  },
  rescue: {
    pads: ['pad_lantern', 'pad_lantern2'],
    quests: ['q_lantern', 'q_rescue'],
    stations: [],
    decor: (id) => id === 'foundBoard' || id === 'monument',
    helpers: [],
  },
  skate: { pads: ['pad_skates'], quests: ['q_skate'], stations: [], decor: (_id, model) => model === 'gripMat', helpers: [] },
  crank: {
    pads: ['pad_bellows', 'pad_mineLift', 'pad_winder'],
    quests: ['q_pump', 'q_lift'],
    stations: ['shaftPile'],
    decor: (id, model) => model === 'capstan' || id === 'mineLiftFrame',
    helpers: ['winder'],
  },
  flame: {
    pads: [],
    quests: ['q_trail', 'q_lightBeacon'],
    stations: [],
    decor: (id, model) => model === 'trailBrazier' || model === 'windGap' || model === 'festivalLamp' ||
      /^peakRock/.test(id) || /^brazier(Yard|Pine|Lake|Ridge)$/.test(id),
    helpers: [],
  },
};

/**
 * The game data with only the given mechanics switched on. `data` may itself be a derived
 * configuration: the result is always derived from the full data behind it.
 */
export function withMechanics(data: GameData, flags: Partial<MechanicFlags>): GameData {
  const full = fullDataOf(data);
  const on: MechanicFlags = { ...NO_MECHANICS, ...flags };
  const off = MECHANIC_IDS.filter((m) => !on[m]);
  if (off.length === 0) {
    const out = { ...full, mechanics: { ...ALL_MECHANICS } };
    FULL.set(out, full);
    return out;
  }
  const pads = new Set<string>();
  const quests = new Set<string>();
  const stations = new Set<string>();
  const helpers = new Set<string>();
  for (const m of off) {
    OWNS[m].pads.forEach((x) => pads.add(x));
    OWNS[m].quests.forEach((x) => quests.add(x));
    OWNS[m].stations.forEach((x) => stations.add(x));
    OWNS[m].helpers.forEach((x) => helpers.add(x));
  }
  const decorOff = (id: string, model: string) => off.some((m) => OWNS[m].decor(id, model));
  const decor = new Set(full.decor.filter((d) => decorOff(d.id, d.model)).map((d) => d.id));

  // Mechanic data: empty what is off (plough off also buries the snowed-in villagers for good).
  const mech = { ...full.mech };
  if (!on.plough) {
    mech.deepSnow = [];
    mech.finds = [];
    mech.villagers = mech.villagers.filter((v) => !v.underSnow);
  }
  if (!on.rescue) {
    mech.villagers = [];
    mech.finds = mech.finds.filter((f) => f.kind !== 'villager');
  }
  if (!on.skate) {
    mech.ice = [];
    mech.gripMats = [];
    mech.skateLane = [];
  }
  if (!on.crank) mech.cranks = [];
  if (!on.flame) {
    mech.braziers = [];
    mech.windGaps = [];
    mech.festivalLamps = [];
  }
  // Things unlocked by a removed find (crates, landmarks) or by finding everyone go too.
  const findIds = new Set(mech.finds.map((f) => f.id));
  const lostUnlock = (u?: string) =>
    !!u && (pads.has(u) || (full.mech.finds.some((f) => f.id === u) && !findIds.has(u)) || (u === 'allFound' && !on.rescue));
  for (const s of full.stations) if (lostUnlock(s.unlockedBy)) stations.add(s.id);
  for (const d of full.decor) if (lostUnlock(d.unlockedBy)) decor.add(d.id);

  // Pads that required a removed pad require what that pad required instead (transitively).
  const byId = new Map(full.pads.map((p) => [p.id, p]));
  const expand = (ids: readonly string[], seen = new Set<string>()): string[] => {
    const out: string[] = [];
    for (const id of ids) {
      if (!pads.has(id)) out.push(id);
      else if (!seen.has(id)) {
        seen.add(id);
        out.push(...expand(byId.get(id)?.requires ?? [], seen));
      }
    }
    return [...new Set(out)];
  };
  const gone = (id: string) => stations.has(id) || decor.has(id) || helpers.has(id) || pads.has(id);
  const keptPads: PadDef[] = full.pads
    .filter((p) => !pads.has(p.id))
    .map((p) => ({
      ...p,
      requires: p.requires ? expand(p.requires) : p.requires,
      effects: p.effects.filter((e) => !(e.type === 'unlock' && gone(e.id)) && !(e.type === 'grant' && !on[GRANT_OF[e.what]])),
    }));
  // Quests: drop the mechanic's own and every quest whose goal is a removed pad.
  const keptQuests: QuestDef[] = full.quests.filter((q) => !quests.has(q.id) && !(q.goal.type === 'pad' && pads.has(q.goal.pad)));

  const out: GameData = {
    ...full,
    stations: full.stations.filter((s) => !stations.has(s.id)),
    decor: full.decor.filter((d) => !decor.has(d.id)),
    pads: keptPads,
    helpers: full.helpers
      .filter((h) => !helpers.has(h.id) && !(h.station && gone(h.station)))
      .map((h) => (h.from || h.to ? { ...h, from: h.from?.filter((x) => !gone(x)), to: h.to?.filter((x) => !gone(x)) } : h)),
    links: full.links.filter((l) => !gone(l.from) && !gone(l.to)),
    quests: keptQuests,
    mech,
    mechanics: on,
  };
  FULL.set(out, full);
  return out;
}

/** Re-anchor a quest id from another configuration: the same quest, or the next one that exists here. */
export function anchorQuest(data: GameData, id: string): number {
  const i = data.quests.findIndex((q) => q.id === id);
  if (i >= 0) return i;
  const all = fullDataOf(data).quests;
  const j = all.findIndex((q) => q.id === id);
  if (j < 0) return -1;
  const here = new Set(data.quests.map((q) => q.id));
  for (let k = j + 1; k < all.length; k++) if (here.has(all[k].id)) return data.quests.findIndex((q) => q.id === all[k].id);
  return data.quests.length - 1;
}
