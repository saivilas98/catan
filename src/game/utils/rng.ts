// Small deterministic PRNG so a given seed always reproduces the same board.
// (Math.random cannot be seeded, so it can't satisfy generateBoard(seed).)

export type RNG = () => number;

/** mulberry32 — fast, seedable, good-enough distribution for shuffling a board. */
export function createRng(seed: number): RNG {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

/**
 * A seeded RNG that exposes its own state, so the state can live inside GameState
 * and dice rolls stay reproducible across a whole game from one seed.
 */
export interface StatefulRng {
  rng: RNG;
  getState: () => number;
}

export function createStatefulRng(seed: number): StatefulRng {
  let state = seed >>> 0;
  return {
    rng: () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState: () => state,
  };
}

/** Fisher-Yates shuffle using a seeded RNG. Does not mutate the input array. */
export function shuffle<T>(items: T[], rng: RNG): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
