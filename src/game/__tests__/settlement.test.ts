import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import { placeBuilding, placeRoad } from '../engine/construction';
import { canBuildSettlement, satisfiesDistanceRule } from '../rules/placement';
import { PIECE_COSTS } from '../models/types';
import type { GameState } from '../models/types';
import { createPlayingGame, expectOk, giveResources, rollAs } from './helpers';

const SETTLEMENT_COST = { brick: 1, lumber: 1, wool: 1, grain: 1 };

/** A rolled game where player-0 owns a road, so settlements have something to attach to. */
function gameWithRoad(): { game: GameState; intersectionId: string; edgeId: string } {
  let game = rollAs(createPlayingGame(), 1, 2);
  const edge = game.board.edges.find((e) => e.hexIds.length === 2)!;
  game = placeRoad(game, 'player-0', edge.id, { free: true });
  return { game, intersectionId: edge.intersectionIds[0], edgeId: edge.id };
}

describe('settlement placement rules', () => {
  it('allows a settlement on an empty intersection touching your road', () => {
    const { game, intersectionId } = gameWithRoad();
    const funded = giveResources(game, 'player-0', SETTLEMENT_COST);
    expect(canBuildSettlement(funded, 'player-0', intersectionId).valid).toBe(true);
  });

  it('rejects a settlement on an occupied intersection', () => {
    const { game, intersectionId } = gameWithRoad();
    let next = placeBuilding(game, 'player-0', intersectionId, 'settlement', { free: true });
    next = giveResources(next, 'player-0', SETTLEMENT_COST);

    const check = canBuildSettlement(next, 'player-0', intersectionId);
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/already occupied/i);
  });

  it('rejects a settlement adjacent to another settlement (distance rule)', () => {
    const { game, intersectionId } = gameWithRoad();
    const neighbourId = game.board.intersections.find((i) => i.id === intersectionId)!
      .intersectionIds[0];

    let next = placeBuilding(game, 'player-0', intersectionId, 'settlement', { free: true });
    next = giveResources(next, 'player-0', SETTLEMENT_COST);

    const check = canBuildSettlement(next, 'player-0', neighbourId);
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/adjacent intersection is occupied/i);
  });

  it('allows a settlement when every adjacent intersection is empty', () => {
    const { game, intersectionId } = gameWithRoad();
    expect(satisfiesDistanceRule(game, intersectionId).valid).toBe(true);
  });

  it("blocks an intersection occupied by an opponent", () => {
    const { game, intersectionId } = gameWithRoad();
    let next = placeBuilding(game, 'player-1', intersectionId, 'settlement', { free: true });
    next = giveResources(next, 'player-0', SETTLEMENT_COST);

    expect(canBuildSettlement(next, 'player-0', intersectionId).valid).toBe(false);
  });

  it('rejects a settlement without enough resources', () => {
    const { game, intersectionId } = gameWithRoad();
    const check = canBuildSettlement(game, 'player-0', intersectionId);
    expect(check.valid).toBe(false);
    // The refusal names the exact cost, per the Sprint 7 error-message audit.
    expect(check.reason).toMatch(/1 Brick, 1 Lumber, 1 Wool and 1 Grain/i);
  });

  it('rejects a settlement once all 5 pieces are used', () => {
    const { game, intersectionId } = gameWithRoad();
    let next = giveResources(game, 'player-0', SETTLEMENT_COST);
    next = {
      ...next,
      players: next.players.map((p) =>
        p.id === 'player-0'
          ? { ...p, piecesRemaining: { ...p.piecesRemaining, settlement: 0 } }
          : p
      ),
    };

    const check = canBuildSettlement(next, 'player-0', intersectionId);
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/no settlement pieces remaining/i);
  });

  it('costs exactly 1 brick, 1 lumber, 1 wool, 1 grain', () => {
    expect(PIECE_COSTS.settlement).toEqual(SETTLEMENT_COST);
  });

  it('deducts exactly the settlement cost and grants +1 VP', () => {
    const { game, intersectionId } = gameWithRoad();
    const funded = giveResources(game, 'player-0', {
      brick: 3,
      lumber: 3,
      wool: 2,
      grain: 2,
      ore: 5,
    });

    const built = expectOk(
      applyAction(funded, {
        type: 'BUILD_SETTLEMENT',
        playerId: 'player-0',
        intersectionId,
      })
    );

    const player = built.players[0];
    expect(player.resources).toEqual({ brick: 2, lumber: 2, wool: 1, grain: 1, ore: 5 });
    expect(player.victoryPoints).toBe(1);
    expect(player.settlementsBuilt).toBe(1);
    expect(player.piecesRemaining.settlement).toBe(4);
  });

  it('does not partially deduct when a build is rejected', () => {
    const { game, intersectionId } = gameWithRoad();
    // Everything but grain — the build must fail leaving resources untouched.
    const funded = giveResources(game, 'player-0', { brick: 1, lumber: 1, wool: 1, grain: 0 });

    const result = applyAction(funded, {
      type: 'BUILD_SETTLEMENT',
      playerId: 'player-0',
      intersectionId,
    });

    expect(result.ok).toBe(false);
    expect(funded.players[0].resources).toEqual({
      brick: 1,
      lumber: 1,
      wool: 1,
      grain: 0,
      ore: 0,
    });
  });

  it('requires the settlement to touch one of your own roads', () => {
    const game = giveResources(rollAs(createPlayingGame(), 1, 2), 'player-0', SETTLEMENT_COST);
    const lonely = game.board.intersections[0].id;
    const check = canBuildSettlement(game, 'player-0', lonely);
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/your own roads/i);
  });
});
