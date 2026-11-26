// Prop registry: name -> cached spec factory.
import type * as THREE from 'three';
import { Builder, bevel } from '../geo';
import type { ModelOpts } from '../index';
import { define, instantiate, type PropSpec } from './common';
import * as camp from './camp';
import * as nature from './nature';
import * as stations from './stations';
import * as lm from './landmarks';

type Factory = (level: number, seed: number) => PropSpec;
/** Which option each prop varies by (for cache keys). */
const F: Record<string, { f: Factory; by?: 'level' | 'seed'; seeds?: number }> = {
  kettle: { f: () => camp.kettle() },
  counter: { f: () => camp.counter() },
  fishCrate: { f: () => camp.fishCrate() },
  storageTable: { f: () => camp.storageTable() },
  hearth: { f: (l) => camp.hearth(l), by: 'level' },
  tent: { f: (_l, s) => camp.tent(s), by: 'seed', seeds: 3 },
  cabin: { f: (_l, s) => camp.cabin(s), by: 'seed', seeds: 3 },
  pine: { f: (_l, s) => nature.pine(s, false), by: 'seed', seeds: 8 },
  pineSnowy: { f: (_l, s) => nature.pine(s, true), by: 'seed', seeds: 8 },
  stump: { f: (_l, s) => nature.stump(s), by: 'seed', seeds: 4 },
  rock: { f: (_l, s) => nature.rock(s), by: 'seed', seeds: 6 },
  snowDrift: { f: (_l, s) => nature.snowDrift(s), by: 'seed', seeds: 4 },
  frostWall: { f: (_l, s) => nature.frostWall(s), by: 'seed', seeds: 4 },
  iceHole: { f: (_l, s) => nature.iceHole(s), by: 'seed', seeds: 3 },
  oreVein: { f: (_l, s) => nature.oreVein(s), by: 'seed', seeds: 3 },
  sawmill: { f: () => stations.sawmill() },
  smokehouse: { f: () => stations.smokehouse() },
  forge: { f: () => stations.forge() },
  greatKitchen: { f: () => stations.greatKitchen() },
  conveyor: { f: () => stations.conveyor() },
  beacon: { f: (l) => lm.beacon(l), by: 'level' },
  fence: { f: (_l, s) => lm.fence(s), by: 'seed', seeds: 3 },
  gate: { f: () => lm.gate() },
  brazier: { f: () => lm.brazier() },
  lantern: { f: () => lm.lantern() },
  signpost: { f: () => lm.signpost() },
  sled: { f: () => lm.sled() },
  crate: { f: (_l, s) => lm.crate(s), by: 'seed', seeds: 3 },
  barrel: { f: () => lm.barrel() },
  snowman: { f: (_l, s) => lm.snowman(s), by: 'seed', seeds: 3 },
  bridge: { f: () => lm.bridge() },
  noticeBoard: { f: () => lm.noticeBoard() },
  bench: { f: () => lm.bench() },
  woodPile: { f: () => lm.woodPile() },
};

export const PROP_NAMES = Object.keys(F);

function placeholder(): PropSpec {
  const b = new Builder().add(bevel(1, 1, 1, 0.12), 0xff44cc, { p: [0, 0.5, 0] });
  return { layers: [{ name: 'body', b }], userData: { radius: 0.6, placeholder: true } };
}

export function buildProp(name: string, opts: ModelOpts = {}): THREE.Object3D {
  const e = F[name];
  let key = `prop:${name}`;
  let level = 0, seed = 0;
  if (e) {
    if (e.by === 'level') {
      level = Math.round(opts.level ?? (name === 'beacon' ? 0 : 1));
      key += `:L${level}`;
    } else if (e.by === 'seed') {
      seed = Math.abs(Math.floor(opts.seed ?? 0)) % (e.seeds ?? 4);
      key += `:S${seed}`;
    }
  }
  let def;
  try {
    def = define(key, () => (e ? e.f(level, seed) : placeholder()));
  } catch (err) {
    console.warn('[models] prop failed, using placeholder:', name, err);
    def = define(`prop:__placeholder`, placeholder);
  }
  const g = instantiate(name, def);
  g.userData.prop = name;
  if (e?.by === 'seed') {
    // extra free variation from the full seed: yaw + slight scale
    const s = opts.seed ?? 0;
    const h = Math.abs(Math.sin(s * 12.9898) * 43758.5453) % 1;
    if (name !== 'frostWall' && name !== 'fence' && name !== 'tent' && name !== 'cabin') {
      g.rotation.y = h * Math.PI * 2;
      const sc = 0.9 + ((h * 7.31) % 1) * 0.2;
      g.scale.setScalar(sc);
    }
  }
  return g;
}
