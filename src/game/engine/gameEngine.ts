// Top-level game engine entry points. React components should call into this module
// rather than re-implementing setup/turn logic themselves.

import type {
  GameEvent,
  GameState,
  Player,
  PlayerColor,
  ResourceCount,
} from '../models/types';
import { PIECE_LIMITS } from '../models/types';
import { generateBoard } from '../board/boardGenerator';
import { randomSeed } from '../utils/rng';
import { EVENT_LOG_LIMIT } from './eventLog';
import { generateDevelopmentDeck } from './developmentDeck';

export const PLAYER_COLORS: PlayerColor[] = [
  'red',
  'blue',
  'white',
  'orange',
  'green',
  'purple',
];

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;

export function emptyResources(): ResourceCount {
  return { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
}

export function createPlayers(names: string[]): Player[] {
  if (names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) {
    throw new Error(`Catan supports ${MIN_PLAYERS}-${MAX_PLAYERS} players, got ${names.length}`);
  }
  return names.map((name, index) => ({
    id: `player-${index}`,
    name: name.trim() || `Player ${index + 1}`,
    color: PLAYER_COLORS[index],
    victoryPoints: 0,
    resources: emptyResources(),
    developmentCards: [],
    playedDevelopmentCards: [],
    piecesRemaining: { ...PIECE_LIMITS },
    roadsBuilt: 0,
    settlementsBuilt: 0,
    citiesBuilt: 0,
  }));
}

export function createInitialGame(playerNames: string[], seed: number = randomSeed()): GameState {
  const players = createPlayers(playerNames);
  const board = generateBoard(seed, players.length);
  const robberHex = board.hexes.find((hex) => hex.hasRobber);
  if (!robberHex) throw new Error('Generated board has no hex holding the robber');

  return {
    phase: 'INITIAL_PLACEMENT',
    turnPhase: 'AWAITING_ROLL',
    players,
    currentPlayerId: players[0].id,
    turnNumber: 1,
    setupOrderIndex: 0,
    setupStep: 'PLACE_SETTLEMENT',
    pendingSettlementId: null,
    hasRolledThisTurn: false,
    diceResult: null,
    lastDiceRoll: null,
    robberHexId: robberHex.id,
    // Offset the deck seed so the development deck is not correlated with the
    // board layout that the same seed produced.
    developmentDeck: generateDevelopmentDeck((seed ^ 0x9e3779b9) >>> 0, players.length),
    pendingDiscards: [],
    stealCandidateIds: [],
    robberMoveReason: null,
    roadBuildingRoadsRemaining: 0,
    hasPlayedDevCardThisTurn: false,
    specialBuildRoundOwnerId: null,
    largestArmyPlayerId: null,
    longestRoadPlayerId: null,
    longestRoadLength: 0,
    winnerId: null,
    tradeOffers: [],
    tradeSequence: 0,
    eventLog: ([
      {
        id: 'evt-0-GAME_STARTED',
        turnNumber: 1,
        type: 'GAME_STARTED',
        playerId: players[0].id,
        message: `Setup begins — ${players[0].name} places first`,
      },
    ] satisfies GameEvent[]).slice(-EVENT_LOG_LIMIT),
    eventSequence: 1,
    board,
    seed,
    diceRngState: seed >>> 0,
    stealRngState: (seed * 2654435761) >>> 0,
  };
}

export function getCurrentPlayer(game: GameState): Player {
  const player = game.players.find((p) => p.id === game.currentPlayerId);
  if (!player) throw new Error(`Current player ${game.currentPlayerId} not found`);
  return player;
}

export function isCurrentPlayer(game: GameState, playerId: string): boolean {
  return game.currentPlayerId === playerId;
}

/** Whether the given player may roll right now — mirrors the engine's own validation. */
export function canRollDice(game: GameState, playerId: string): boolean {
  return (
    game.phase === 'PLAYING' &&
    game.turnPhase === 'AWAITING_ROLL' &&
    game.currentPlayerId === playerId &&
    !game.hasRolledThisTurn
  );
}
