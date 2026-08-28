import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import { placeBuilding } from '../engine/construction';
import { createPlayingGame, giveResources } from './helpers';
import { fixedDiceRng } from '../utils/fixedRng';
import type { Edge, GameState } from '../models/types';

function edgesOf(game: GameState, intersectionId: string): Edge[] {
  const intersection = game.board.intersections.find((i) => i.id === intersectionId)!;
  return intersection.edgeIds.map((id) => game.board.edges.find((e) => e.id === id)!);
}

/** Two edges that share one intersection — enough to place a settlement then a road off it. */
function findEdgePair(game: GameState): { shared: string; edgeA: Edge; edgeB: Edge } {
  const intersection = game.board.intersections.find((i) => i.edgeIds.length >= 2)!;
  const [edgeA, edgeB] = edgesOf(game, intersection.id);
  return { shared: intersection.id, edgeA, edgeB };
}

const THREE = ['Sai', 'Rahul', 'Ananya'];
const FOUR = ['Sai', 'Rahul', 'Ananya', 'Karthik'];

/** Rolls as the current player, asserting success. */
function roll(state: GameState, die1 = 2, die2 = 3): GameState {
  const result = applyAction(
    state,
    { type: 'ROLL_DICE', playerId: state.currentPlayerId },
    { rng: fixedDiceRng(die1, die2) }
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

function endTurn(state: GameState): GameState {
  const result = applyAction(state, { type: 'END_TURN', playerId: state.currentPlayerId });
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

function currentName(state: GameState): string {
  return state.players.find((p) => p.id === state.currentPlayerId)!.name;
}

describe('turn engine', () => {
  it('starts with player 1 in AWAITING_ROLL and not yet rolled', () => {
    const game = createPlayingGame(THREE, 1);
    expect(currentName(game)).toBe('Sai');
    expect(game.turnPhase).toBe('AWAITING_ROLL');
    expect(game.hasRolledThisTurn).toBe(false);
    expect(game.turnNumber).toBe(1);
  });

  it('lets the current player roll once', () => {
    const game = roll(createPlayingGame(THREE, 1));
    expect(game.hasRolledThisTurn).toBe(true);
    expect(game.diceResult).toEqual({ die1: 2, die2: 3, total: 5 });
    expect(game.lastDiceRoll).toEqual({ die1: 2, die2: 3, total: 5 });
  });

  it('rejects a second roll in the same turn', () => {
    const game = roll(createPlayingGame(THREE, 1));
    const second = applyAction(
      game,
      { type: 'ROLL_DICE', playerId: game.currentPlayerId },
      { rng: fixedDiceRng(4, 4) }
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('ALREADY_ROLLED');
      expect(second.error.message).toContain('already rolled');
    }
  });

  it('rejects a roll from a player whose turn it is not', () => {
    const game = createPlayingGame(THREE, 1);
    const result = applyAction(
      game,
      { type: 'ROLL_DICE', playerId: 'player-1' },
      { rng: fixedDiceRng(4, 4) }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_CURRENT_PLAYER');
  });

  it('rejects a roll once the game is over', () => {
    const game: GameState = { ...createPlayingGame(THREE, 1), phase: 'GAME_OVER' };
    const result = applyAction(game, { type: 'ROLL_DICE', playerId: game.currentPlayerId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('GAME_OVER');
  });

  it('rejects a roll during initial placement', () => {
    const game: GameState = {
      ...createPlayingGame(THREE, 1),
      phase: 'INITIAL_PLACEMENT',
    };
    const result = applyAction(game, { type: 'ROLL_DICE', playerId: game.currentPlayerId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });

  it('rejects actions from an unknown player', () => {
    const game = createPlayingGame(THREE, 1);
    const result = applyAction(game, { type: 'ROLL_DICE', playerId: 'player-99' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNKNOWN_PLAYER');
  });

  it('moves to AWAITING_ACTIONS after a non-7 roll', () => {
    const game = roll(createPlayingGame(THREE, 1), 4, 4);
    expect(game.turnPhase).toBe('AWAITING_ACTIONS');
  });

  it('ending a turn changes the current player and resets turn state', () => {
    let game = roll(createPlayingGame(THREE, 1));
    game = endTurn(game);
    expect(currentName(game)).toBe('Rahul');
    expect(game.hasRolledThisTurn).toBe(false);
    expect(game.diceResult).toBeNull();
    expect(game.turnPhase).toBe('AWAITING_ROLL');
    expect(game.turnNumber).toBe(2);
  });

  it('keeps lastDiceRoll across the turn boundary', () => {
    let game = roll(createPlayingGame(THREE, 1), 5, 6);
    game = endTurn(game);
    expect(game.diceResult).toBeNull();
    expect(game.lastDiceRoll).toEqual({ die1: 5, die2: 6, total: 11 });
  });

  it('lets a player end their turn without rolling', () => {
    const game = createPlayingGame(THREE, 1);
    const result = applyAction(game, { type: 'END_TURN', playerId: game.currentPlayerId });
    expect(result.ok).toBe(true);
  });

  it('wraps turn order correctly for 3 players', () => {
    let game = createPlayingGame(THREE, 1);
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      order.push(currentName(game));
      game = endTurn(game);
    }
    expect(order).toEqual(['Sai', 'Rahul', 'Ananya', 'Sai']);
  });

  it('wraps turn order correctly for 4 players', () => {
    let game = createPlayingGame(FOUR, 1);
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      order.push(currentName(game));
      game = endTurn(game);
    }
    expect(order).toEqual(['Sai', 'Rahul', 'Ananya', 'Karthik', 'Sai']);
  });

  it('lets the next player roll after the previous player rolled', () => {
    let game = roll(createPlayingGame(THREE, 1));
    game = endTurn(game);
    const result = applyAction(
      game,
      { type: 'ROLL_DICE', playerId: game.currentPlayerId },
      { rng: fixedDiceRng(1, 2) }
    );
    expect(result.ok).toBe(true);
  });
});

describe('event log', () => {
  it('records dice rolls', () => {
    const game = roll(createPlayingGame(THREE, 1), 4, 4);
    const rolled = game.eventLog.filter((e) => e.type === 'DICE_ROLLED');
    expect(rolled).toHaveLength(1);
    expect(rolled[0].message).toContain('Sai rolled 8');
    expect(rolled[0].turnNumber).toBe(1);
  });

  it('records turn changes', () => {
    let game = roll(createPlayingGame(THREE, 1));
    game = endTurn(game);
    const ended = game.eventLog.filter((e) => e.type === 'TURN_ENDED');
    expect(ended).toHaveLength(1);
    expect(ended[0].message).toContain('Sai ended their turn');
  });

  it('records a 7 as a robber-pending event', () => {
    const game = roll(createPlayingGame(THREE, 1), 3, 4);
    expect(game.eventLog.some((e) => e.type === 'ROBBER_PENDING')).toBe(true);
    expect(game.eventLog.some((e) => e.message.includes('7 rolled'))).toBe(true);
  });

  it('caps the log length', () => {
    let game = createPlayingGame(THREE, 1);
    for (let i = 0; i < 40; i++) {
      game = roll(game, 1, 2);
      game = endTurn(game);
    }
    expect(game.eventLog.length).toBeLessThanOrEqual(20);
  });

  it('keeps event IDs unique after the log is trimmed', () => {
    let game = createPlayingGame(THREE, 1);
    for (let i = 0; i < 40; i++) {
      game = roll(game, 1, 2);
      game = endTurn(game);
    }
    const ids = game.eventLog.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

const FIVE = ['Sai', 'Rahul', 'Ananya', 'Karthik', 'Divya'];

describe('Special Building Phase (5-6 players)', () => {
  it('does NOT occur in 3-4 player games', () => {
    let game = roll(createPlayingGame(THREE, 1));
    game = endTurn(game);
    expect(game.turnPhase).toBe('AWAITING_ROLL');
    expect(game.specialBuildRoundOwnerId).toBeNull();

    let fourGame = roll(createPlayingGame(FOUR, 1));
    fourGame = endTurn(fourGame);
    expect(fourGame.turnPhase).toBe('AWAITING_ROLL');
    expect(fourGame.specialBuildRoundOwnerId).toBeNull();
  });

  it('starts after a 5-player turn ends, owned by whoever just went', () => {
    let game = roll(createPlayingGame(FIVE, 1));
    game = endTurn(game);
    expect(game.turnPhase).toBe('SPECIAL_BUILDING');
    expect(game.specialBuildRoundOwnerId).toBe('player-0');
    expect(currentName(game)).toBe('Rahul');
    // No turn actually advanced yet — that only happens once the phase resolves.
    expect(game.turnNumber).toBe(1);
  });

  it('cycles every other player in order, then resumes real turns', () => {
    let game = roll(createPlayingGame(FIVE, 1));
    game = endTurn(game); // player-0's turn ends, SBP starts on player-1

    const sbpOrder: string[] = [];
    while (game.turnPhase === 'SPECIAL_BUILDING') {
      sbpOrder.push(currentName(game));
      game = endTurn(game); // pass
    }

    expect(sbpOrder).toEqual(['Rahul', 'Ananya', 'Karthik', 'Divya']);
    // Real play resumes with the player who would have gone next anyway.
    expect(currentName(game)).toBe('Rahul');
    expect(game.turnPhase).toBe('AWAITING_ROLL');
    expect(game.turnNumber).toBe(2);
    expect(game.specialBuildRoundOwnerId).toBeNull();
  });

  it('rejects rolling dice during Special Building Phase', () => {
    let game = roll(createPlayingGame(FIVE, 1));
    game = endTurn(game);
    const result = applyAction(game, { type: 'ROLL_DICE', playerId: game.currentPlayerId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });

  it('rejects proposing a trade during Special Building Phase', () => {
    let game = roll(createPlayingGame(FIVE, 1));
    game = endTurn(game);
    const result = applyAction(game, {
      type: 'PROPOSE_TRADE',
      playerId: game.currentPlayerId,
      targetPlayerId: null,
      offeredResources: { brick: 1 },
      requestedResources: { lumber: 1 },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an out-of-turn player acting during Special Building Phase', () => {
    let game = roll(createPlayingGame(FIVE, 1));
    game = endTurn(game); // SBP now belongs to player-1 (Rahul)
    const result = applyAction(game, { type: 'END_TURN', playerId: 'player-2' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_CURRENT_PLAYER');
  });

  it('lets the Special Building participant build without rolling', () => {
    let game = roll(createPlayingGame(FIVE, 1));
    game = endTurn(game); // SBP now belongs to player-1 (Rahul)
    expect(game.currentPlayerId).toBe('player-1');

    const { shared, edgeA } = findEdgePair(game);
    game = placeBuilding(game, 'player-1', shared, 'settlement', { free: true });
    game = giveResources(game, 'player-1', { brick: 1, lumber: 1 });

    const result = applyAction(game, {
      type: 'BUILD_ROAD',
      playerId: 'player-1',
      edgeId: edgeA.id,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.board.edges.find((e) => e.id === edgeA.id)?.road?.ownerId).toBe(
        'player-1'
      );
      // Building doesn't end the participant's SBP slot — passing does.
      expect(result.state.turnPhase).toBe('SPECIAL_BUILDING');
      expect(result.state.currentPlayerId).toBe('player-1');
    }
  });
});
