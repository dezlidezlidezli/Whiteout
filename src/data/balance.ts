import type { Balance } from './types';

export const BALANCE: Balance = {
  playerSpeed: 5.2,
  playerRadius: 0.38,
  startCapacity: 6,
  maxCapacity: 40,
  transferInterval: 0.1,
  emberCollectRadius: 2.4,
  emberCollectRate: 40,
  customerSpeed: 1.9,
  thawedSpeed: 3.2,
  thawTime: 0.9,
  spawnInterval: 0.9,
  maxCustomers: 110,
  cosyMultiplier: 2,
  cosyHelperSpeed: 1.3,
  fuelPerLog: 24,
  hearthFuelCap: 16,
  // Warm radius per hearth level (index 0 = level 1).
  warmRadius: [6.5, 11.5, 16, 21, 28],
  padBaseRate: 12,
  padSecondsToFill: 2.2,
  padAccel: 1.6,
};
