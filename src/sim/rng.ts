/** Seeded PRNG (mulberry32). The state lives in SimState so saves are deterministic. */
export function nextRandom(st: { rng: number }): number {
  st.rng = (st.rng + 0x6d2b79f5) >>> 0;
  let t = st.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(st: { rng: number }, a: number, b: number): number {
  return a + (b - a) * nextRandom(st);
}

export function randInt(st: { rng: number }, a: number, b: number): number {
  return Math.floor(randRange(st, a, b + 1));
}
