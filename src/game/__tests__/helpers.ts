// Shared test scaffolding.

import { applyAction } from '../engine/actions';
import { createInitialGame } from '../engine/gameEngine';
import { getSetupOrder } from '../engine/setup';
import { getValidRoadLocations, getValidSettlementLocations } from '../rules/placement';
import type { DevelopmentCardType, GameState } from '../models/types';
import { fixedDiceRng } from '../utils/fixedRng';

export const THREE_PLAYERS = ['Sai', 'Rahul', 'Ananya'];
export const FOUR_PLAYERS = ['Sai', 'Rahul', 'Ananya', 'Karthik'];
export const SIX_PLAYERS = ['Sai', 'Rahul', 'Ananya', 'Karthik', 'Divya', 'Meera'];

export function expectOk(result: ReturnType<typeof applyAction>): GameState {
  if (!result.ok) throw new Error(`Expected success, got: ${result.error.message}`);
  return result.state;
}

/**
 * A game in the PLAYING phase with an empty board — lets turn/dice/production
 * tests exercise their own concerns without running a full setup first.
 */
export function createPlayingGame(names = THREE_PLAYERS, seed = 1): GameState {
  const game = createInitialGame(names, seed);
  return {
    ...game,
    phase: 'PLAYING',
    turnPhase: 'AWAITING_ROLL',
    setupOrderIndex: getSetupOrder(names.length).length,
    currentPlayerId: game.players[0].id,
  };
}

/** Plays a complete, legal initial placement by always taking the first valid spot. */
export function runFullSetup(names = THREE_PLAYERS, seed = 1): GameState {
  let game = createInitialGame(names, seed);

  while (game.phase === 'INITIAL_PLACEMENT') {
    const playerId = game.currentPlayerId;

    const intersectionId = getValidSettlementLocations(game, playerId)[0];
    game = expectOk(
      applyAction(game, { type: 'PLACE_INITIAL_SETTLEMENT', playerId, intersectionId })
    );

    const edgeId = getValidRoadLocations(game, playerId)[0];
    game = expectOk(applyAction(game, { type: 'PLACE_INITIAL_ROAD', playerId, edgeId }));
  }

  return game;
}

/** Rolls as the current player with a forced result. */
export function rollAs(state: GameState, die1: number, die2: number): GameState {
  return expectOk(
    applyAction(
      state,
      { type: 'ROLL_DICE', playerId: state.currentPlayerId },
      { rng: fixedDiceRng(die1, die2) }
    )
  );
}

/**
 * A game in AWAITING_ACTIONS — where buying/playing cards, trading and building are
 * legal. Reaching this phase always means the player has already rolled, so the
 * flag is set to match.
 */
export function readyToAct(names = THREE_PLAYERS, seed = 1): GameState {
  return {
    ...createPlayingGame(names, seed),
    turnPhase: 'AWAITING_ACTIONS',
    hasRolledThisTurn: true,
  };
}

/**
 * Puts a development card straight into a player's hand, acquired on an earlier
 * turn so it is immediately playable.
 */
export function giveDevelopmentCard(
  state: GameState,
  playerId: string,
  type: DevelopmentCardType,
  acquiredTurnNumber = 0
): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            developmentCards: [
              ...player.developmentCards,
              {
                id: `test-${type}-${player.developmentCards.length}`,
                type,
                acquiredTurnNumber,
              },
            ],
          }
        : player
    ),
  };
}

/** Marks knights as already played, for Largest Army scenarios. */
export function givePlayedKnights(
  state: GameState,
  playerId: string,
  count: number
): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            playedDevelopmentCards: [
              ...player.playedDevelopmentCards,
              ...Array.from({ length: count }, (_, i) => ({
                id: `played-knight-${playerId}-${i}`,
                type: 'knight' as const,
                acquiredTurnNumber: 0,
              })),
            ],
          }
        : player
    ),
  };
}

/** An RNG that always returns the same value — forces a deterministic steal. */
export function fixedRng(value: number) {
  return () => value;
}

/** Grants resources directly, for setting up a build test. */
export function giveResources(
  state: GameState,
  playerId: string,
  resources: Partial<GameState['players'][number]['resources']>
): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId
        ? { ...player, resources: { ...player.resources, ...resources } }
        : player
    ),
  };
}
