// New Game must produce a genuinely fresh state from any point in a game, with
// nothing from the previous one leaking through.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import { createInitialGame } from '../engine/gameEngine';
import { devGiveDevelopmentCard, devPlaceBuilding } from '../engine/devTools';
import { validateGameState } from '../rules/invariants';
import { RESOURCE_TYPES } from '../models/types';
import type { GameState } from '../models/types';
import {
  expectOk,
  giveDevelopmentCard,
  givePlayedKnights,
  giveResources,
  readyToAct,
  rollAs,
  runFullSetup,
  THREE_PLAYERS,
} from './helpers';

/** Everything a fresh game must look like, whatever came before it. */
function expectPristine(game: GameState) {
  expect(validateGameState(game).valid).toBe(true);

  expect(game.phase).toBe('INITIAL_PLACEMENT');
  expect(game.turnPhase).toBe('AWAITING_ROLL');
  expect(game.turnNumber).toBe(1);
  expect(game.setupOrderIndex).toBe(0);
  expect(game.setupStep).toBe('PLACE_SETTLEMENT');
  expect(game.pendingSettlementId).toBeNull();

  expect(game.winnerId).toBeNull();
  expect(game.longestRoadPlayerId).toBeNull();
  expect(game.longestRoadLength).toBe(0);
  expect(game.largestArmyPlayerId).toBeNull();

  expect(game.tradeOffers).toEqual([]);
  expect(game.pendingDiscards).toEqual([]);
  expect(game.stealCandidateIds).toEqual([]);
  expect(game.robberMoveReason).toBeNull();
  expect(game.roadBuildingRoadsRemaining).toBe(0);
  expect(game.hasPlayedDevCardThisTurn).toBe(false);
  expect(game.hasRolledThisTurn).toBe(false);
  expect(game.diceResult).toBeNull();
  expect(game.lastDiceRoll).toBeNull();

  // A single opening event, and nothing carried over.
  expect(game.eventLog).toHaveLength(1);
  expect(game.eventLog[0].type).toBe('GAME_STARTED');

  // The board is empty and the robber is home on the desert.
  expect(game.board.intersections.every((i) => i.building === null)).toBe(true);
  expect(game.board.edges.every((e) => e.road === null)).toBe(true);
  const desert = game.board.hexes.find((h) => h.terrain === 'desert')!;
  expect(game.robberHexId).toBe(desert.id);

  // Full deck, and every player empty-handed with a full supply.
  expect(game.developmentDeck).toHaveLength(25);
  for (const player of game.players) {
    for (const resource of RESOURCE_TYPES) expect(player.resources[resource]).toBe(0);
    expect(player.developmentCards).toEqual([]);
    expect(player.playedDevelopmentCards).toEqual([]);
    expect(player.victoryPoints).toBe(0);
    expect(player.roadsBuilt).toBe(0);
    expect(player.settlementsBuilt).toBe(0);
    expect(player.citiesBuilt).toBe(0);
    expect(player.piecesRemaining).toEqual({ road: 15, settlement: 5, city: 4 });
  }
}

/**
 * The UI's New Game drops the old state and calls createInitialGame afresh, so
 * that is exactly what these assert — from each phase a game can be left in.
 */
describe('reset: a new game is pristine after', () => {
  it('normal play', () => {
    let played = runFullSetup(THREE_PLAYERS, 3);
    played = rollAs(played, 2, 3);
    played = giveResources(played, played.currentPlayerId, { brick: 5, lumber: 5 });
    expect(played.turnNumber).toBeGreaterThan(0); // the old game really did progress
    expectPristine(createInitialGame(THREE_PLAYERS, 99));
  });

  it('an active trade offer', () => {
    let game = readyToAct();
    game = giveResources(game, 'player-0', { lumber: 3 });
    game = expectOk(
      applyAction(game, {
        type: 'PROPOSE_TRADE',
        playerId: 'player-0',
        targetPlayerId: 'player-1',
        offeredResources: { lumber: 2 },
        requestedResources: { ore: 1 },
      })
    );
    expect(game.tradeOffers).toHaveLength(1);
    expectPristine(createInitialGame(THREE_PLAYERS, 99));
  });

  it('a pending discard', () => {
    let game = runFullSetup(THREE_PLAYERS, 1);
    game = giveResources(game, game.currentPlayerId, { brick: 9 });
    game = rollAs(game, 3, 4);
    expect(game.turnPhase).toBe('DISCARDING');
    expectPristine(createInitialGame(THREE_PLAYERS, 99));
  });

  it('the robber phase', () => {
    const game = rollAs(runFullSetup(THREE_PLAYERS, 1), 3, 4);
    expect(game.turnPhase).toBe('MOVING_ROBBER');
    expectPristine(createInitialGame(THREE_PLAYERS, 99));
  });

  it('road-building mode', () => {
    let game = runFullSetup(THREE_PLAYERS, 1);
    game = rollAs(game, 2, 3);
    game = giveDevelopmentCard(game, game.currentPlayerId, 'roadBuilding');
    game = expectOk(
      applyAction(game, { type: 'PLAY_ROAD_BUILDING', playerId: game.currentPlayerId })
    );
    expect(game.turnPhase).toBe('ROAD_BUILDING');
    expectPristine(createInitialGame(THREE_PLAYERS, 99));
  });

  it('game over', () => {
    let finished = readyToAct();
    finished = givePlayedKnights(finished, 'player-0', 3);
    finished = devGiveDevelopmentCard(finished, 'player-0', 'victoryPoint');
    const spots = finished.board.intersections
      .filter((i) => i.hexIds.length === 3)
      .slice(0, 4);
    for (const spot of spots) finished = devPlaceBuilding(finished, spot.id, 'player-0', 'city');
    expect(finished.players[0].victoryPoints).toBeGreaterThan(0);
    expectPristine(createInitialGame(THREE_PLAYERS, 99));
  });

  it('mid initial placement', () => {
    const started = createInitialGame(THREE_PLAYERS, 4);
    const partway = expectOk(
      applyAction(started, {
        type: 'PLACE_INITIAL_SETTLEMENT',
        playerId: started.currentPlayerId,
        intersectionId: started.board.intersections[0].id,
      })
    );
    expect(partway.setupStep).toBe('PLACE_ROAD');
    expectPristine(createInitialGame(THREE_PLAYERS, 99));
  });
});

describe('reset: successive games are independent', () => {
  it('gives a different board for a different seed and the same board for the same seed', () => {
    const a = createInitialGame(THREE_PLAYERS, 111);
    const b = createInitialGame(THREE_PLAYERS, 111);
    const c = createInitialGame(THREE_PLAYERS, 222);

    expect(a.board.hexes.map((h) => h.terrain)).toEqual(b.board.hexes.map((h) => h.terrain));
    expect(a.board.hexes.map((h) => h.terrain)).not.toEqual(
      c.board.hexes.map((h) => h.terrain)
    );
  });

  it('does not share mutable state between two games from the same seed', () => {
    const first = createInitialGame(THREE_PLAYERS, 7);
    const second = createInitialGame(THREE_PLAYERS, 7);

    const mutated = devPlaceBuilding(
      first,
      first.board.intersections[0].id,
      'player-0',
      'settlement'
    );

    // The second game must be untouched by anything done to the first.
    expect(mutated.board.intersections[0].building).not.toBeNull();
    expect(second.board.intersections[0].building).toBeNull();
    expectPristine(second);
  });

  it('supports a 4-player game after a 3-player one', () => {
    runFullSetup(THREE_PLAYERS, 5);
    const four = createInitialGame(['Sai', 'Rahul', 'Ananya', 'Karthik'], 6);
    expect(four.players).toHaveLength(4);
    expectPristine(four);
  });
});
