import { DIE_FACES } from '../engine/dice';
import type { RNG } from './rng';

/**
 * An RNG that makes rollTwoDice return exactly the requested faces.
 * Used by tests and the DEV panel to force a specific total (e.g. a 7).
 */
export function fixedDiceRng(die1: number, die2: number): RNG {
  const faces = [die1, die2];
  let index = 0;
  return () => {
    const face = faces[Math.min(index, faces.length - 1)];
    index += 1;
    // Land mid-bucket so floor(value * DIE_FACES) + 1 === face.
    return (face - 0.5) / DIE_FACES;
  };
}
