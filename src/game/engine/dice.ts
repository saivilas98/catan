// Dice are engine-owned. The UI never generates a die value — it dispatches an action
// and renders whatever the resulting GameState says.

import type { DiceResult } from '../models/types';
import type { RNG } from '../utils/rng';

export const DIE_FACES = 6;

/** The dice total that triggers the robber instead of production. */
export const ROBBER_ROLL = 7;

export function rollDie(rng: RNG): number {
  return Math.floor(rng() * DIE_FACES) + 1;
}

/** Rolls two six-sided dice with an injectable RNG so tests can force any total. */
export function rollTwoDice(rng: RNG): DiceResult {
  const die1 = rollDie(rng);
  const die2 = rollDie(rng);
  return { die1, die2, total: die1 + die2 };
}

export function isRobberRoll(result: DiceResult): boolean {
  return result.total === ROBBER_ROLL;
}
