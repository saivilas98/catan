import { describe, expect, it } from 'vitest';
import { redactState } from './redactState';
import { createInitialGame } from '../game/engine/gameEngine';
import { THREE_PLAYERS, giveDevelopmentCard, giveResources } from '../game/__tests__/helpers';

describe('redactState', () => {
  it('shows the viewer their own resources and development cards untouched', () => {
    const game = createInitialGame(THREE_PLAYERS, 1);
    const viewer = game.players[0].id;
    const withCards = giveDevelopmentCard(
      giveResources(game, viewer, { brick: 2, lumber: 1 }),
      viewer,
      'knight'
    );

    const redacted = redactState(withCards, viewer);
    const self = redacted.players.find((p) => p.id === viewer)!;

    expect(self.resources).toEqual({ brick: 2, lumber: 1, wool: 0, grain: 0, ore: 0 });
    expect(self.resourceCount).toBe(3);
    expect(self.developmentCards).toHaveLength(1);
    expect(self.developmentCards[0].type).toBe('knight');
    expect(self.developmentCardCount).toBe(1);
  });

  it("hides an opponent's exact resources and development card identities but keeps counts", () => {
    const game = createInitialGame(THREE_PLAYERS, 1);
    const [viewer, opponent] = game.players.map((p) => p.id);
    const withState = giveDevelopmentCard(
      giveResources(game, opponent, { ore: 3, grain: 2 }),
      opponent,
      'victoryPoint'
    );

    const redacted = redactState(withState, viewer);
    const opponentView = redacted.players.find((p) => p.id === opponent)!;

    expect(opponentView.resources).toEqual({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 });
    expect(opponentView.resourceCount).toBe(5);
    expect(opponentView.developmentCards).toEqual([]);
    expect(opponentView.developmentCardCount).toBe(1);
  });

  it('reveals every hand once the game is over', () => {
    const game = createInitialGame(THREE_PLAYERS, 1);
    const [viewer, opponent] = game.players.map((p) => p.id);
    const withState = {
      ...giveDevelopmentCard(game, opponent, 'victoryPoint'),
      phase: 'GAME_OVER' as const,
    };

    const redacted = redactState(withState, viewer);
    const opponentView = redacted.players.find((p) => p.id === opponent)!;

    expect(opponentView.developmentCards).toHaveLength(1);
    expect(opponentView.developmentCardCount).toBe(1);
  });

  it('never serializes the real RNG state, even for the game seed itself', () => {
    const game = createInitialGame(THREE_PLAYERS, 12345);
    const redacted = redactState(game, game.players[0].id);

    expect(redacted.diceRngState).toBe(0);
    expect(redacted.stealRngState).toBe(0);
    expect(game.diceRngState).not.toBe(0);
  });

  it('preserves the development deck count without revealing its contents/order', () => {
    const game = createInitialGame(THREE_PLAYERS, 1);
    const redacted = redactState(game, game.players[0].id);

    expect(redacted.developmentDeck).toHaveLength(game.developmentDeck.length);
    expect(new Set(redacted.developmentDeck.map((c) => c.type))).toEqual(new Set(['knight']));
  });

  it('passes through public fields (board, trade offers, turn state) unchanged', () => {
    const game = createInitialGame(THREE_PLAYERS, 1);
    const redacted = redactState(game, game.players[0].id);

    expect(redacted.board).toBe(game.board);
    expect(redacted.tradeOffers).toBe(game.tradeOffers);
    expect(redacted.currentPlayerId).toBe(game.currentPlayerId);
    expect(redacted.turnPhase).toBe(game.turnPhase);
  });
});
