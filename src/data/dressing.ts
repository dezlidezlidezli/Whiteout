// Yard dressing for the view: floors, palisades (also solid for collision), paths and clutter zones.
// Every area's work loop is a compact walled yard; yards open towards the camp and gateways, and counters
// sit in gaps of the outer palisade with the Icebound crowd massed beyond.

import type { ClutterZoneDef, DressingDef, FloorDef, PalisadeDef, PathDef } from './types';

const floors: FloorDef[] = [
  // Camp
  { id: 'f_camp', area: 'camp', type: 'packedEarth', x0: -9, x1: 9, z0: -9, z1: 7.5 },
  { id: 'f_hearth', area: 'camp', type: 'cobble', x0: -2.6, x1: 2.6, z0: -2.6, z1: 2.6 },
  // Kettle Yard
  { id: 'f_yard', area: 'kettleYard', type: 'packedEarth', x0: -6.5, x1: 6.5, z0: 7.5, z1: 16.2 },
  { id: 'f_yardDeck', area: 'kettleYard', type: 'planks', x0: -6.5, x1: 6.5, z0: 13.9, z1: 16.2 },
  // Pinewood
  { id: 'f_pineYard', area: 'pinewood', type: 'packedEarth', x0: -13.4, x1: -7.6, z0: -6.0, z1: 8.0 },
  { id: 'f_sawDeck', area: 'pinewood', type: 'planks', x0: -12.8, x1: -10.0, z0: 2.0, z1: 5.4 },
  // Frozen Lake
  { id: 'f_market', area: 'frozenLake', type: 'packedEarth', x0: 7.6, x1: 15.2, z0: -10, z1: -1.6 },
  { id: 'f_ice', area: 'frozenLake', type: 'ice', x0: 14.8, x1: 23, z0: -10, z1: -1.0 },
  { id: 'f_smokeWalk', area: 'frozenLake', type: 'planks', x0: 8.8, x1: 19.6, z0: 0.4, z1: 3.2 },
  { id: 'f_lakeDeck', area: 'frozenLake', type: 'planks', x0: 10.0, x1: 20.2, z0: 5.2, z1: 7.8 },
  // Ironridge
  { id: 'f_veins', area: 'ironridge', type: 'stone', x0: -10, x1: -0.8, z0: -26, z1: -16.8 },
  { id: 'f_forgeYard', area: 'ironridge', type: 'cobble', x0: -8.2, x1: 6.2, z0: -15.4, z1: -8.8 },
  { id: 'f_feastDeck', area: 'ironridge', type: 'planks', x0: 5.6, x1: 8.8, z0: -23.0, z1: -15.0 },
  // Beacon Peak
  { id: 'f_peak', area: 'beaconPeak', type: 'stone', x0: -6.5, x1: 6.5, z0: -38, z1: -25 },
];

const walls: PalisadeDef[] = [
  // Kettle Yard: open to the camp (north); counters fill the gaps in the south palisade.
  { id: 'w_yardW', area: 'kettleYard', points: [{ x: -6.8, z: 7.4 }, { x: -6.8, z: 16.2 }, { x: -3.35, z: 16.2 }] },
  { id: 'w_yardS', area: 'kettleYard', points: [{ x: -1.05, z: 16.2 }, { x: 1.85, z: 16.2 }] },
  { id: 'w_yardE', area: 'kettleYard', points: [{ x: 4.15, z: 16.2 }, { x: 6.8, z: 16.2 }, { x: 6.8, z: 7.4 }] },
  // Pinewood: open to the camp (east) and the Ironridge gap (north-east).
  { id: 'w_pine', area: 'pinewood', points: [{ x: -7.8, z: 10.6 }, { x: -21.8, z: 10.6 }, { x: -21.8, z: -10.2 }, { x: -10.2, z: -10.2 }] },
  // Frozen Lake: counters in the south palisade; open to the camp (west).
  { id: 'w_lakeS1', area: 'frozenLake', points: [{ x: 7.8, z: 8.0 }, { x: 11.65, z: 8.0 }] },
  { id: 'w_lakeS2', area: 'frozenLake', points: [{ x: 13.95, z: 8.0 }, { x: 16.45, z: 8.0 }] },
  { id: 'w_lakeE', area: 'frozenLake', points: [{ x: 18.75, z: 8.0 }, { x: 23.2, z: 8.0 }, { x: 23.2, z: -10.2 }, { x: 9.0, z: -10.2 }] },
  // Ironridge: feast counters in the east palisade; gateway north to Beacon Peak; open to the camp (south).
  { id: 'w_ridgeE1', area: 'ironridge', points: [{ x: 9.0, z: -10.2 }, { x: 9.0, z: -15.45 }] },
  { id: 'w_ridgeE2', area: 'ironridge', points: [{ x: 9.0, z: -17.75 }, { x: 9.0, z: -20.25 }] },
  { id: 'w_ridgeE3', area: 'ironridge', points: [{ x: 9.0, z: -22.55 }, { x: 9.0, z: -26.2 }, { x: 6.5, z: -26.2 }] },
  { id: 'w_ridgeW', area: 'ironridge', points: [{ x: -6.5, z: -26.2 }, { x: -10.2, z: -26.2 }, { x: -10.2, z: -10.2 }] },
  // Beacon Peak
  { id: 'w_peak', area: 'beaconPeak', points: [{ x: -6.8, z: -26.2 }, { x: -6.8, z: -38.2 }, { x: 6.8, z: -38.2 }, { x: 6.8, z: -26.2 }] },
];

const paths: PathDef[] = [
  { id: 'p_yard', kind: 'boardwalk', width: 2.0, points: [{ x: 0, z: 2.8 }, { x: 0, z: 8.0 }] },
  { id: 'p_pinewood', kind: 'snow', width: 2.2, points: [{ x: -2.8, z: 0.6 }, { x: -8.6, z: 0.6 }, { x: -9.6, z: 0.6 }] },
  { id: 'p_lake', kind: 'snow', width: 2.2, points: [{ x: 2.8, z: -0.6 }, { x: 8.6, z: -0.6 }, { x: 9.4, z: -0.6 }] },
  { id: 'p_ridge', kind: 'snow', width: 2.2, points: [{ x: 0, z: -2.8 }, { x: 0, z: -8.6 }, { x: 0, z: -10.0 }] },
  { id: 'p_peak', kind: 'boardwalk', width: 2.0, points: [{ x: 0.6, z: -15.4 }, { x: 0.6, z: -25.5 }, { x: 0, z: -28.0 }] },
  { id: 'p_pineRidge', kind: 'snow', width: 1.8, points: [{ x: -10.6, z: -4.0 }, { x: -9.2, z: -9.2 }, { x: -7.0, z: -11.0 }] },
];

const clutterZones: ClutterZoneDef[] = [
  { id: 'c_yardNW', area: 'kettleYard', x0: -6.5, x1: -5.7, z0: 7.6, z1: 9.0 },
  { id: 'c_yardNE', area: 'kettleYard', x0: 5.7, x1: 6.5, z0: 7.6, z1: 9.6 },
  { id: 'c_yardSW', area: 'kettleYard', x0: -6.5, x1: -5.6, z0: 14.4, z1: 16.2 },
  { id: 'c_yardSE', area: 'kettleYard', x0: 5.6, x1: 6.5, z0: 15.0, z1: 16.2 },
  { id: 'c_pineW', area: 'pinewood', x0: -21.5, x1: -20.7, z0: -10, z1: 7.4 },
  { id: 'c_pineS', area: 'pinewood', x0: -13.2, x1: -12.2, z0: 6.0, z1: 10.4 },
  { id: 'c_lakeSW', area: 'frozenLake', x0: 7.8, x1: 9.6, z0: 5.6, z1: 7.8 },
  { id: 'c_lakeSE', area: 'frozenLake', x0: 20.4, x1: 23, z0: 6.9, z1: 7.8 },
  { id: 'c_ridgeSW', area: 'ironridge', x0: -10, x1: -8.6, z0: -26, z1: -24.6 },
  { id: 'c_ridgeW', area: 'ironridge', x0: -10, x1: -8.4, z0: -12, z1: -10.4 },
  { id: 'c_ridgeSE', area: 'ironridge', x0: 6.6, x1: 8.8, z0: -26, z1: -23.0 },
  { id: 'c_peakW', area: 'beaconPeak', x0: -6.5, x1: -4.8, z0: -38, z1: -35.4 },
  { id: 'c_peakE', area: 'beaconPeak', x0: 4.8, x1: 6.5, z0: -38, z1: -35.4 },
];

export const DRESSING: DressingDef = { floors, walls, paths, clutterZones };
