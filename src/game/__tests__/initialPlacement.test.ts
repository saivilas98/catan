import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import { createInitialGame } from '../engine/gameEngine';
import { getSetupOrder } from '../engine/setup';
import { getValidRoadLocations, getValidSettlementLocations } from '../rules/placement';
import { RESOURCE_TYPES } from '../models/types';
import type { GameState } from '../models/types';
import { expectOk, FOUR_PLAYERS, runFullSetup, THREE_PLAYERS } from './helpers';

function placeSettlement(game: GameState, intersectionId: string) {
  return applyAction(game, {
    type: 'PLACE_INITIAL_SETTLEMENT',
    playerId: game.currentPlayerId,
    intersectionId,
  });
}

function placeRoadAt(game: GameState, edgeId: string) {
  return applyAction(game, {
    type: 'PLACE_INITIAL_ROAD',
    playerId: game.currentPlayerId,
    edgeId,
  });
}

function totalResources(game: GameState, playerId: string): number {
  const player = game.players.find((p) => p.id === playerId)!;
  return RESOURCE_TYPES.reduce((sum, r) => sum + player.resources[r], 0);
}

describe('setup order', () => {
  it('runs forward then reverse for 3 players', () => {
    expect(getSetupOrder(3)).toEqual([0, 1, 2, 2, 1, 0]);
  });

  it('runs forward then reverse for 4 players', () => {
    expect(getSetupOrder(4)).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
  });

  it('follows player order in round 1 and reverse order in round 2', () => {
    let game = createInitialGame(THREE_PLAYERS, 1);
    const seen: string[] = [];

    while (game.phase === 'INITIAL_PLACEMENT') {
      seen.push(game.players.find((p) => p.id === game.currentPlayerId)!.name);
      const intersectionId = getValidSettlementLocations(game, game.currentPlayerId)[0];
      game = expectOk(placeSettlement(game, intersectionId));
      const edgeId = getValidRoadLocations(game, game.currentPlayerId)[0];
      game = expectOk(placeRoadAt(game, edgeId));
    }

    expect(seen).toEqual(['Sai', 'Rahul', 'Ananya', 'Ananya', 'Rahul', 'Sai']);
  });
});

describe('initial placement', () => {
  it('gives every player exactly two settlements and two roads', () => {
    const game = runFullSetup(THREE_PLAYERS, 1);
    for (const player of game.players) {
      expect(player.settlementsBuilt).toBe(2);
      expect(player.roadsBuilt).toBe(2);
      expect(player.piecesRemaining.settlement).toBe(3);
      expect(player.piecesRemaining.road).toBe(13);
      expect(player.victoryPoints).toBe(2);
    }
  });

  it('works the same for 4 players', () => {
    const game = runFullSetup(FOUR_PLAYERS, 7);
    expect(game.players).toHaveLength(4);
    for (const player of game.players) {
      expect(player.settlementsBuilt).toBe(2);
      expect(player.roadsBuilt).toBe(2);
    }
  });

  it('charges nothing for setup settlements and roads', () => {
    let game = createInitialGame(THREE_PLAYERS, 1);
    const intersectionId = getValidSettlementLocations(game, game.currentPlayerId)[0];
    game = expectOk(placeSettlement(game, intersectionId));
    expect(totalResources(game, 'player-0')).toBe(0);

    const edgeId = getValidRoadLocations(game, game.currentPlayerId)[0];
    game = expectOk(placeRoadAt(game, edgeId));
    expect(totalResources(game, 'player-0')).toBe(0);
  });

  it('requires the setup road to touch the settlement just placed', () => {
    let game = createInitialGame(THREE_PLAYERS, 1);
    const intersectionId = getValidSettlementLocations(game, game.currentPlayerId)[0];
    game = expectOk(placeSettlement(game, intersectionId));

    const settlementEdges = game.board.intersections.find((i) => i.id === intersectionId)!
      .edgeIds;
    const farEdge = game.board.edges.find((e) => !settlementEdges.includes(e.id))!;

    const result = placeRoadAt(game, farEdge.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ILLEGAL_PLACEMENT');
      expect(result.error.message).toMatch(/must connect to the settlement/i);
    }
  });

  it('enforces the distance rule during setup', () => {
    let game = createInitialGame(THREE_PLAYERS, 1);
    const intersectionId = getValidSettlementLocations(game, game.currentPlayerId)[0];
    game = expectOk(placeSettlement(game, intersectionId));
    const edgeId = getValidRoadLocations(game, game.currentPlayerId)[0];
    game = expectOk(placeRoadAt(game, edgeId));

    // Next player tries the neighbouring corner of the settlement just placed.
    const neighbourId = game.board.intersections.find((i) => i.id === intersectionId)!
      .intersectionIds[0];
    const result = placeSettlement(game, neighbourId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/adjacent intersection is occupied/i);
  });

  it('grants no resources for the first settlement', () => {
    let game = createInitialGame(THREE_PLAYERS, 1);
    const intersectionId = getValidSettlementLocations(game, game.currentPlayerId)[0];
    game = expectOk(placeSettlement(game, intersectionId));
    expect(totalResources(game, 'player-0')).toBe(0);
  });

  it('grants one resource per adjacent producing hex for the second settlement', () => {
    let game = createInitialGame(THREE_PLAYERS, 1);
    const playerCount = THREE_PLAYERS.length;

    // Advance to the start of round 2 (the reverse round).
    while (game.setupOrderIndex < playerCount) {
      const intersectionId = getValidSettlementLocations(game, game.currentPlayerId)[0];
      game = expectOk(placeSettlement(game, intersectionId));
      const edgeId = getValidRoadLocations(game, game.currentPlayerId)[0];
      game = expectOk(placeRoadAt(game, edgeId));
    }

    const playerId = game.currentPlayerId;
    expect(totalResources(game, playerId)).toBe(0);

    const secondSpot = getValidSettlementLocations(game, playerId)[0];
    const producingHexes = game.board.intersections
      .find((i) => i.id === secondSpot)!
      .hexIds.map((id) => game.board.hexes.find((h) => h.id === id)!)
      .filter((hex) => hex.resource !== null);

    game = expectOk(placeSettlement(game, secondSpot));

    expect(totalResources(game, playerId)).toBe(producingHexes.length);
    for (const hex of producingHexes) {
      const player = game.players.find((p) => p.id === playerId)!;
      expect(player.resources[hex.resource!]).toBeGreaterThan(0);
    }
  });

  it('grants nothing from an adjacent desert', () => {
    const game = runFullSetup(THREE_PLAYERS, 1);
    const desert = game.board.hexes.find((h) => h.terrain === 'desert')!;
    // The desert has no resource, so it can never appear in an award.
    expect(desert.resource).toBeNull();
  });

  it('rejects placing a road before a settlement', () => {
    const game = createInitialGame(THREE_PLAYERS, 1);
    const result = placeRoadAt(game, game.board.edges[0].id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_SETUP_STEP');
  });

  it('rejects placing two settlements in a row', () => {
    let game = createInitialGame(THREE_PLAYERS, 1);
    const first = getValidSettlementLocations(game, game.currentPlayerId)[0];
    game = expectOk(placeSettlement(game, first));

    const second = getValidSettlementLocations(game, game.currentPlayerId)[1];
    const result = placeSettlement(game, second);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_SETUP_STEP');
  });

  it('rejects a placement from a player who is not up', () => {
    const game = createInitialGame(THREE_PLAYERS, 1);
    const result = applyAction(game, {
      type: 'PLACE_INITIAL_SETTLEMENT',
      playerId: 'player-2',
      intersectionId: game.board.intersections[0].id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_CURRENT_PLAYER');
  });

  it('rejects rolling dice during setup', () => {
    const game = createInitialGame(THREE_PLAYERS, 1);
    const result = applyAction(game, {
      type: 'ROLL_DICE',
      playerId: game.currentPlayerId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });

  it('transitions to PLAYING after the final setup road, with player 1 to move', () => {
    const game = runFullSetup(THREE_PLAYERS, 1);
    expect(game.phase).toBe('PLAYING');
    expect(game.turnPhase).toBe('AWAITING_ROLL');
    expect(game.currentPlayerId).toBe('player-0');
    expect(game.turnNumber).toBe(1);
    expect(game.hasRolledThisTurn).toBe(false);
    expect(game.eventLog.some((e) => e.type === 'SETUP_COMPLETE')).toBe(true);
  });

  it('rejects setup placements once the game is in PLAYING', () => {
    const game = runFullSetup(THREE_PLAYERS, 1);
    const result = applyAction(game, {
      type: 'PLACE_INITIAL_SETTLEMENT',
      playerId: game.currentPlayerId,
      intersectionId: game.board.intersections[0].id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });

  it('logs setup placements', () => {
    const game = runFullSetup(THREE_PLAYERS, 1);
    const setupEvents = game.eventLog.filter((e) => e.type === 'SETUP_PLACEMENT');
    expect(setupEvents.length).toBeGreaterThan(0);
  });
});

describe('building guards outside their phase', () => {
  it('rejects building before rolling', () => {
    const game = runFullSetup(THREE_PLAYERS, 1);
    const result = applyAction(game, {
      type: 'BUILD_ROAD',
      playerId: game.currentPlayerId,
      edgeId: game.board.edges[0].id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('MUST_ROLL_FIRST');
  });
});
