import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import { placeBuilding } from '../engine/construction';
import { canBuildCity } from '../rules/placement';
import { PIECE_COSTS } from '../models/types';
import type { GameState } from '../models/types';
import { createPlayingGame, expectOk, giveResources, rollAs } from './helpers';

const CITY_COST = { ore: 3, grain: 2 };

/** A rolled game where player-0 owns a settlement at `intersectionId`. */
function gameWithSettlement(ownerId = 'player-0'): {
  game: GameState;
  intersectionId: string;
} {
  const base = rollAs(createPlayingGame(), 1, 2);
  const intersectionId = base.board.intersections[0].id;
  const game = placeBuilding(base, ownerId, intersectionId, 'settlement', { free: true });
  return { game, intersectionId };
}

describe('city upgrade rules', () => {
  it('allows a city where the player owns a settlement', () => {
    const { game, intersectionId } = gameWithSettlement();
    const funded = giveResources(game, 'player-0', CITY_COST);
    expect(canBuildCity(funded, 'player-0', intersectionId).valid).toBe(true);
  });

  it('rejects a city on an empty intersection', () => {
    const game = giveResources(rollAs(createPlayingGame(), 1, 2), 'player-0', CITY_COST);
    const check = canBuildCity(game, 'player-0', game.board.intersections[5].id);
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/upgrading your own settlement/i);
  });

  it("rejects a city on an opponent's settlement", () => {
    const { game, intersectionId } = gameWithSettlement('player-1');
    const funded = giveResources(game, 'player-0', CITY_COST);
    const check = canBuildCity(funded, 'player-0', intersectionId);
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/another player/i);
  });

  it('rejects a city where a city already stands', () => {
    const { game, intersectionId } = gameWithSettlement();
    let next = placeBuilding(game, 'player-0', intersectionId, 'city', { free: true });
    next = giveResources(next, 'player-0', CITY_COST);
    const check = canBuildCity(next, 'player-0', intersectionId);
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/already a city/i);
  });

  it('costs exactly 3 ore and 2 grain', () => {
    expect(PIECE_COSTS.city).toEqual(CITY_COST);
  });

  it('replaces the settlement, returns its piece, and consumes a city piece', () => {
    const { game, intersectionId } = gameWithSettlement();
    const funded = giveResources(game, 'player-0', { ore: 4, grain: 3 });

    const before = funded.players[0];
    expect(before.piecesRemaining.settlement).toBe(4);
    expect(before.victoryPoints).toBe(1);

    const built = expectOk(
      applyAction(funded, { type: 'BUILD_CITY', playerId: 'player-0', intersectionId })
    );

    const after = built.players[0];
    const intersection = built.board.intersections.find((i) => i.id === intersectionId)!;

    expect(intersection.building!.type).toBe('city');
    expect(after.piecesRemaining.settlement).toBe(5); // settlement piece returned
    expect(after.piecesRemaining.city).toBe(3);
    expect(after.citiesBuilt).toBe(1);
    expect(after.settlementsBuilt).toBe(0);
    expect(after.resources).toEqual({ brick: 0, lumber: 0, wool: 0, grain: 1, ore: 1 });
  });

  it('raises victory points from 1 to 2 for that spot (a net +1)', () => {
    const { game, intersectionId } = gameWithSettlement();
    expect(game.players[0].victoryPoints).toBe(1);

    const funded = giveResources(game, 'player-0', CITY_COST);
    const built = expectOk(
      applyAction(funded, { type: 'BUILD_CITY', playerId: 'player-0', intersectionId })
    );

    expect(built.players[0].victoryPoints).toBe(2);
  });

  it('rejects a city without enough resources', () => {
    const { game, intersectionId } = gameWithSettlement();
    const funded = giveResources(game, 'player-0', { ore: 2, grain: 2 });
    const check = canBuildCity(funded, 'player-0', intersectionId);
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/3 Ore and 2 Grain/i);
  });

  it('produces 2 resources where a settlement produced 1', () => {
    const base = rollAs(createPlayingGame(), 1, 2);
    const forest = base.board.hexes.find(
      (h) => h.terrain === 'forest' && h.numberToken !== null
    )!;
    const intersectionId = forest.intersectionIds[0];

    const asSettlement = placeBuilding(base, 'player-0', intersectionId, 'settlement', {
      free: true,
    });
    const asCity = placeBuilding(base, 'player-0', intersectionId, 'city', { free: true });

    const total = forest.numberToken!;
    const die1 = Math.max(1, Math.min(6, total - 1));

    const settlementRoll = rollAs(
      { ...asSettlement, hasRolledThisTurn: false, turnPhase: 'AWAITING_ROLL' },
      die1,
      total - die1
    );
    const cityRoll = rollAs(
      { ...asCity, hasRolledThisTurn: false, turnPhase: 'AWAITING_ROLL' },
      die1,
      total - die1
    );

    expect(settlementRoll.players[0].resources.lumber).toBe(1);
    expect(cityRoll.players[0].resources.lumber).toBe(2);
  });
});
