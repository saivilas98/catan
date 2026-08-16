import { describe, expect, it } from 'vitest';
import { rollTwoDice, isRobberRoll } from '../engine/dice';
import { createStatefulRng } from '../utils/rng';
import { fixedDiceRng } from '../utils/fixedRng';

describe('dice', () => {
  it('produces die values in 1..6', () => {
    const { rng } = createStatefulRng(12345);
    for (let i = 0; i < 500; i++) {
      const { die1, die2 } = rollTwoDice(rng);
      expect(die1).toBeGreaterThanOrEqual(1);
      expect(die1).toBeLessThanOrEqual(6);
      expect(die2).toBeGreaterThanOrEqual(1);
      expect(die2).toBeLessThanOrEqual(6);
      expect(Number.isInteger(die1)).toBe(true);
      expect(Number.isInteger(die2)).toBe(true);
    }
  });

  it('calculates the total correctly', () => {
    const { rng } = createStatefulRng(999);
    for (let i = 0; i < 200; i++) {
      const result = rollTwoDice(rng);
      expect(result.total).toBe(result.die1 + result.die2);
    }
  });

  it('can be forced to an exact result with an injected RNG', () => {
    expect(rollTwoDice(fixedDiceRng(3, 4))).toEqual({ die1: 3, die2: 4, total: 7 });
    expect(rollTwoDice(fixedDiceRng(6, 6))).toEqual({ die1: 6, die2: 6, total: 12 });
    expect(rollTwoDice(fixedDiceRng(1, 1))).toEqual({ die1: 1, die2: 1, total: 2 });
  });

  it('identifies a 7 as the robber roll', () => {
    expect(isRobberRoll({ die1: 3, die2: 4, total: 7 })).toBe(true);
    expect(isRobberRoll({ die1: 4, die2: 4, total: 8 })).toBe(false);
  });
});
