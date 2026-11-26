import type { ItemDef, ItemKind, RecipeDef } from './types';

export const ITEM_KINDS: ItemKind[] = ['fish', 'stew', 'log', 'plank', 'smokedFish', 'ore', 'ingot', 'feast'];

export const ITEMS: Record<ItemKind, ItemDef> = {
  fish: { kind: 'fish', name: 'Fish', price: 0, color: '#7fb4d8' },
  stew: { kind: 'stew', name: 'Hot stew', price: 2, color: '#e0873a' },
  log: { kind: 'log', name: 'Log', price: 0, color: '#9a6b3f' },
  plank: { kind: 'plank', name: 'Plank', price: 0, color: '#d9a866' },
  smokedFish: { kind: 'smokedFish', name: 'Smoked fish', price: 5, color: '#c8743a' },
  ore: { kind: 'ore', name: 'Ore', price: 0, color: '#7b7f8c' },
  ingot: { kind: 'ingot', name: 'Ingot', price: 0, color: '#c9ced6' },
  feast: { kind: 'feast', name: 'Feast', price: 12, color: '#f0c050' },
};

export const RECIPES: Record<string, RecipeDef> = {
  stew: { id: 'stew', inputs: { fish: 1 }, output: 'stew', outputCount: 1, time: 0.7 },
  plank: { id: 'plank', inputs: { log: 1 }, output: 'plank', outputCount: 2, time: 1.2 },
  // Reserved for later areas (data only):
  smokedFish: { id: 'smokedFish', inputs: { fish: 2, log: 1 }, output: 'smokedFish', outputCount: 2, time: 2.0 },
  ingot: { id: 'ingot', inputs: { ore: 2, log: 1 }, output: 'ingot', outputCount: 1, time: 2.5 },
  feast: { id: 'feast', inputs: { stew: 1, smokedFish: 1 }, output: 'feast', outputCount: 1, time: 2.0 },
};
