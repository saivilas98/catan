// Every action attempted in every phase. The engine — not the UI — is the authority,
// so each of these dispatches straight at applyAction with no button in the way.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import type { GameAction } from '../engine/actions';
import { createInitialGame } from '../engine/gameEngine';
import { devPlaceBuilding } from '../engine/devTools';
import { validateGameState } from '../rules/invariants';
import type { GameState } from '../models/types';
import { getValidRoadLocations, getValidSettlementLocations } from '../rules/placement';
import {
  expectOk,
  giveDevelopmentCard,
  giveResources,
  readyToAct,
  rollAs,
  runFullSetup,
  THREE_PLAYERS,
} from './helpers';

// ---------- Phase fixtures ----------

function initialPlacement(): GameState {
  return createInitialGame(THREE_PLAYERS, 1);
}

function awaitingRoll(): GameState {
  return runFullSetup(THREE_PLAYERS, 1);
}

/**
 * A real post-setup action phase: the player owns settlements and roads, so
 * building actions are rejected on phase grounds only, never for want of a network.
 */
function awaitingActions(): GameState {
  return rollAs(runFullSetup(THREE_PLAYERS, 1), 2, 3);
}

/** A 7 with one player over the hand limit, so discards are outstanding. */
function discarding(): GameState {
  let game = runFullSetup(THREE_PLAYERS, 1);
  game = giveResources(game, game.currentPlayerId, { brick: 9 });
  game = rollAs(game, 3, 4);
  if (game.turnPhase !== 'DISCARDING') throw new Error('fixture did not reach DISCARDING');
  return game;
}

/** A 7 with nobody over the limit, so the robber move is owed immediately. */
function movingRobber(): GameState {
  const game = rollAs(runFullSetup(THREE_PLAYERS, 1), 3, 4);
  if (game.turnPhase !== 'MOVING_ROBBER') throw new Error('fixture did not reach MOVING_ROBBER');
  return game;
}

/** Two robbable opponents on the robber's new hex, so a choice is pending. */
function stealing(): GameState {
  let game = movingRobber();
  const hex = game.board.hexes.find((h) => h.id !== game.robberHexId)!;
  game = devPlaceBuilding(game, hex.intersectionIds[0], 'player-1', 'settlement');
  game = devPlaceBuilding(game, hex.intersectionIds[2], 'player-2', 'settlement');
  game = giveResources(game, 'player-1', { ore: 2 });
  game = giveResources(game, 'player-2', { wool: 2 });
  game = expectOk(
    applyAction(game, { type: 'MOVE_ROBBER', playerId: game.currentPlayerId, hexId: hex.id })
  );
  if (game.turnPhase !== 'STEALING') throw new Error('fixture did not reach STEALING');
  return game;
}

/** Road Building played, with free roads still owed. */
function roadBuilding(): GameState {
  let game = runFullSetup(THREE_PLAYERS, 1);
  game = rollAs(game, 2, 3);
  game = giveDevelopmentCard(game, game.currentPlayerId, 'roadBuilding');
  game = expectOk(
    applyAction(game, { type: 'PLAY_ROAD_BUILDING', playerId: game.currentPlayerId })
  );
  if (game.turnPhase !== 'ROAD_BUILDING') throw new Error('fixture did not reach ROAD_BUILDING');
  return game;
}

function gameOver(): GameState {
  return { ...awaitingActions(), phase: 'GAME_OVER', winnerId: 'player-0' };
}

// ---------- Action builders (well-formed, so only the phase can reject them) ----------

function actionsFor(game: GameState): Record<string, GameAction> {
  const me = game.currentPlayerId;
  const otherHex = game.board.hexes.find((h) => h.id !== game.robberHexId)!.id;
  const ownBuilding = game.board.intersections.find((i) => i.building?.ownerId === me);

  // Use targets that are legal on their own merits, so a rejection can only be
  // about the phase. Fall back to any free location when the phase makes the
  // legality query meaningless.
  const anyEdge =
    getValidRoadLocations(game, me)[0] ?? game.board.edges.find((e) => !e.road)!.id;
  const anyIntersection =
    getValidSettlementLocations(game, me)[0] ??
    game.board.intersections.find((i) => !i.building)!.id;

  // A discard must be for exactly the number owed, or it is malformed rather than
  // merely out of phase.
  const owed = game.pendingDiscards.find((d) => d.playerId === me)?.required ?? 1;
  const discardSelection: Record<string, number> = {};
  let left = owed;
  const holder = game.players.find((p) => p.id === me)!;
  for (const [resource, held] of Object.entries(holder.resources)) {
    if (left <= 0) break;
    const take = Math.min(left, held as number);
    if (take > 0) {
      discardSelection[resource] = take;
      left -= take;
    }
  }

  return {
    ROLL_DICE: { type: 'ROLL_DICE', playerId: me },
    END_TURN: { type: 'END_TURN', playerId: me },
    BUILD_ROAD: { type: 'BUILD_ROAD', playerId: me, edgeId: anyEdge },
    BUILD_SETTLEMENT: { type: 'BUILD_SETTLEMENT', playerId: me, intersectionId: anyIntersection },
    BUILD_CITY: {
      type: 'BUILD_CITY',
      playerId: me,
      intersectionId: ownBuilding?.id ?? anyIntersection,
    },
    PLACE_INITIAL_SETTLEMENT: {
      type: 'PLACE_INITIAL_SETTLEMENT',
      playerId: me,
      intersectionId: anyIntersection,
    },
    PLACE_INITIAL_ROAD: { type: 'PLACE_INITIAL_ROAD', playerId: me, edgeId: anyEdge },
    PROPOSE_TRADE: {
      type: 'PROPOSE_TRADE',
      playerId: me,
      targetPlayerId: game.players.find((p) => p.id !== me)!.id,
      offeredResources: { brick: 1 },
      requestedResources: { ore: 1 },
    },
    BANK_TRADE: { type: 'BANK_TRADE', playerId: me, give: 'brick', receive: 'ore' },
    BUY_DEVELOPMENT_CARD: { type: 'BUY_DEVELOPMENT_CARD', playerId: me },
    PLAY_KNIGHT: { type: 'PLAY_KNIGHT', playerId: me },
    PLAY_ROAD_BUILDING: { type: 'PLAY_ROAD_BUILDING', playerId: me },
    PLAY_MONOPOLY: { type: 'PLAY_MONOPOLY', playerId: me, resource: 'lumber' },
    PLAY_YEAR_OF_PLENTY: { type: 'PLAY_YEAR_OF_PLENTY', playerId: me, selection: { ore: 2 } },
    MOVE_ROBBER: { type: 'MOVE_ROBBER', playerId: me, hexId: otherHex },
    STEAL_RESOURCE: {
      type: 'STEAL_RESOURCE',
      playerId: me,
      victimId: game.players.find((p) => p.id !== me)!.id,
    },
    DISCARD_RESOURCES: { type: 'DISCARD_RESOURCES', playerId: me, selection: discardSelection },
  };
}

/**
 * Runs every action against a fixture and returns the ones the engine accepted.
 * Actions are given every resource and card they could need, so anything rejected
 * is rejected on phase grounds rather than for lack of means.
 */
function acceptedActions(fixture: GameState): string[] {
  const accepted: string[] = [];

  for (const [name, action] of Object.entries(actionsFor(fixture))) {
    // Fund and equip the actor generously so only the phase rule can bite.
    let armed = giveResources(fixture, fixture.currentPlayerId, {
      brick: 9,
      lumber: 9,
      wool: 9,
      grain: 9,
      ore: 9,
    });
    armed = giveDevelopmentCard(armed, fixture.currentPlayerId, 'knight');
    armed = giveDevelopmentCard(armed, fixture.currentPlayerId, 'monopoly');
    armed = giveDevelopmentCard(armed, fixture.currentPlayerId, 'yearOfPlenty');
    armed = giveDevelopmentCard(armed, fixture.currentPlayerId, 'roadBuilding');

    const result = applyAction(armed, action);
    if (result.ok) {
      accepted.push(name);
      // Anything the engine accepts must leave a valid state behind.
      const validation = validateGameState(result.state);
      if (!validation.valid) {
        throw new Error(
          `${name} produced an invalid state:\n  - ${validation.errors.join('\n  - ')}`
        );
      }
    }
  }

  return accepted.sort();
}

describe('action matrix: INITIAL_PLACEMENT', () => {
  it('permits only the setup placement that is due', () => {
    expect(acceptedActions(initialPlacement())).toEqual(['PLACE_INITIAL_SETTLEMENT']);
  });

  it('permits only the setup road once a settlement is down', () => {
    const game = initialPlacement();
    const withSettlement = expectOk(
      applyAction(game, {
        type: 'PLACE_INITIAL_SETTLEMENT',
        playerId: game.currentPlayerId,
        intersectionId: game.board.intersections[0].id,
      })
    );
    expect(acceptedActions(withSettlement)).toEqual(['PLACE_INITIAL_ROAD']);
  });
});

describe('action matrix: AWAITING_ROLL', () => {
  it('permits only rolling and ending the turn', () => {
    expect(acceptedActions(awaitingRoll())).toEqual(['END_TURN', 'ROLL_DICE']);
  });
});

describe('action matrix: AWAITING_ACTIONS', () => {
  it('permits the full set of ordinary turn actions', () => {
    const accepted = acceptedActions(awaitingActions());
    expect(accepted).toEqual([
      'BANK_TRADE',
      'BUILD_CITY',
      'BUILD_ROAD',
      'BUY_DEVELOPMENT_CARD',
      'END_TURN',
      'PLAY_KNIGHT',
      'PLAY_MONOPOLY',
      'PLAY_ROAD_BUILDING',
      'PLAY_YEAR_OF_PLENTY',
      'PROPOSE_TRADE',
    ]);
  });

  it('refuses to roll twice or move the robber unprompted', () => {
    const accepted = acceptedActions(awaitingActions());
    expect(accepted).not.toContain('ROLL_DICE');
    expect(accepted).not.toContain('MOVE_ROBBER');
    expect(accepted).not.toContain('STEAL_RESOURCE');
    expect(accepted).not.toContain('DISCARD_RESOURCES');
  });
});

describe('action matrix: DISCARDING', () => {
  it('permits only discarding', () => {
    expect(acceptedActions(discarding())).toEqual(['DISCARD_RESOURCES']);
  });

  it('blocks building, trading, the robber and ending the turn', () => {
    const accepted = acceptedActions(discarding());
    for (const blocked of [
      'BUILD_ROAD',
      'BUILD_SETTLEMENT',
      'BUILD_CITY',
      'PROPOSE_TRADE',
      'BANK_TRADE',
      'BUY_DEVELOPMENT_CARD',
      'PLAY_KNIGHT',
      'MOVE_ROBBER',
      'END_TURN',
    ]) {
      expect(accepted).not.toContain(blocked);
    }
  });
});

describe('action matrix: MOVING_ROBBER', () => {
  it('permits only moving the robber', () => {
    expect(acceptedActions(movingRobber())).toEqual(['MOVE_ROBBER']);
  });

  it('blocks trading and ending the turn', () => {
    const accepted = acceptedActions(movingRobber());
    expect(accepted).not.toContain('PROPOSE_TRADE');
    expect(accepted).not.toContain('BANK_TRADE');
    expect(accepted).not.toContain('END_TURN');
    expect(accepted).not.toContain('STEAL_RESOURCE');
  });
});

describe('action matrix: STEALING', () => {
  it('permits only choosing a victim', () => {
    expect(acceptedActions(stealing())).toEqual(['STEAL_RESOURCE']);
  });
});

describe('action matrix: ROAD_BUILDING', () => {
  it('permits only placing the free road', () => {
    expect(acceptedActions(roadBuilding())).toEqual(['BUILD_ROAD']);
  });

  it('blocks other builds, trades and ending the turn', () => {
    const accepted = acceptedActions(roadBuilding());
    for (const blocked of ['BUILD_SETTLEMENT', 'BUILD_CITY', 'PROPOSE_TRADE', 'END_TURN']) {
      expect(accepted).not.toContain(blocked);
    }
  });
});

describe('action matrix: GAME_OVER', () => {
  it('permits nothing at all', () => {
    expect(acceptedActions(gameOver())).toEqual([]);
  });

  it('reports a game-over reason for each attempt', () => {
    const game = gameOver();
    for (const action of Object.values(actionsFor(game))) {
      const result = applyAction(game, action);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('GAME_OVER');
    }
  });
});

describe('trade responses respect the phase', () => {
  /** A pending offer that survives into a later, non-action phase. */
  function pendingOfferThen(transition: (g: GameState) => GameState): {
    game: GameState;
    tradeId: string;
  } {
    let game = readyToAct();
    game = giveResources(game, 'player-0', { lumber: 3 });
    game = giveResources(game, 'player-1', { ore: 3 });
    game = expectOk(
      applyAction(game, {
        type: 'PROPOSE_TRADE',
        playerId: 'player-0',
        targetPlayerId: 'player-1',
        offeredResources: { lumber: 2 },
        requestedResources: { ore: 1 },
      })
    );
    const tradeId = game.tradeOffers[0].id;
    return { game: transition(game), tradeId };
  }

  it('rejects accept, reject and cancel while the robber is being moved', () => {
    const { game, tradeId } = pendingOfferThen((g) => {
      const withKnight = giveDevelopmentCard(g, 'player-0', 'knight');
      return expectOk(applyAction(withKnight, { type: 'PLAY_KNIGHT', playerId: 'player-0' }));
    });
    expect(game.turnPhase).toBe('MOVING_ROBBER');

    for (const attempt of [
      { type: 'ACCEPT_TRADE' as const, playerId: 'player-1', tradeId },
      { type: 'REJECT_TRADE' as const, playerId: 'player-1', tradeId },
      { type: 'CANCEL_TRADE' as const, playerId: 'player-0', tradeId },
    ]) {
      const result = applyAction(game, attempt);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toMatch(/current step is finished/i);
    }
  });

  it('rejects trade responses once the game is over', () => {
    const { game, tradeId } = pendingOfferThen((g) => ({
      ...g,
      phase: 'GAME_OVER',
      winnerId: 'player-0',
    }));

    const result = applyAction(game, { type: 'ACCEPT_TRADE', playerId: 'player-1', tradeId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('GAME_OVER');
  });

  it('still allows a normal accept during the action phase', () => {
    const { game, tradeId } = pendingOfferThen((g) => g);
    expect(applyAction(game, { type: 'ACCEPT_TRADE', playerId: 'player-1', tradeId }).ok).toBe(
      true
    );
  });
});
