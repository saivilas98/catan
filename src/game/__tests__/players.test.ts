import { describe, expect, it } from 'vitest';
import { createInitialGame, createPlayers } from '../engine/gameEngine';

describe('createPlayers', () => {
  it('creates exactly 3 players for a 3-player game', () => {
    const players = createPlayers(['Sai', 'Rahul', 'Ananya']);
    expect(players).toHaveLength(3);
  });

  it('creates exactly 4 players for a 4-player game', () => {
    const players = createPlayers(['Sai', 'Rahul', 'Ananya', 'Karthik']);
    expect(players).toHaveLength(4);
  });

  it('assigns each player a distinct color', () => {
    const players = createPlayers(['Sai', 'Rahul', 'Ananya', 'Karthik']);
    const colors = players.map((p) => p.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('rejects fewer than 3 players', () => {
    expect(() => createPlayers(['Sai', 'Rahul'])).toThrow();
  });

  it('creates exactly 6 players for a 6-player game', () => {
    const players = createPlayers(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(players).toHaveLength(6);
  });

  it('assigns each of 6 players a distinct color', () => {
    const players = createPlayers(['A', 'B', 'C', 'D', 'E', 'F']);
    const colors = players.map((p) => p.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('rejects more than 6 players', () => {
    expect(() => createPlayers(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toThrow();
  });
});

describe('createInitialGame', () => {
  it('starts in the INITIAL_PLACEMENT phase with player 1 placing first', () => {
    const game = createInitialGame(['Sai', 'Rahul', 'Ananya'], 99);
    expect(game.phase).toBe('INITIAL_PLACEMENT');
    expect(game.setupStep).toBe('PLACE_SETTLEMENT');
    expect(game.currentPlayerId).toBe(game.players[0].id);
  });

  it('gives every player a full supply of pieces', () => {
    const game = createInitialGame(['Sai', 'Rahul', 'Ananya'], 99);
    for (const player of game.players) {
      expect(player.piecesRemaining).toEqual({ road: 15, settlement: 5, city: 4 });
      expect(player.victoryPoints).toBe(0);
    }
  });

  it('produces a valid 19-hex board as part of game creation', () => {
    const game = createInitialGame(['Sai', 'Rahul', 'Ananya'], 99);
    expect(game.board.hexes).toHaveLength(19);
  });

  it('produces the 30-hex extended board for a 5+ player game', () => {
    const game = createInitialGame(['A', 'B', 'C', 'D', 'E'], 99);
    expect(game.board.hexes).toHaveLength(30);
    expect(game.board.ports).toHaveLength(11);
    const robberHexes = game.board.hexes.filter((h) => h.hasRobber);
    expect(robberHexes).toHaveLength(1);
    expect(robberHexes[0].id).toBe(game.robberHexId);
    expect(game.developmentDeck).toHaveLength(34);
  });

  it('produces the standard 25-card deck for 3-4 player games', () => {
    const game = createInitialGame(['Sai', 'Rahul', 'Ananya'], 99);
    expect(game.developmentDeck).toHaveLength(25);
  });
});
