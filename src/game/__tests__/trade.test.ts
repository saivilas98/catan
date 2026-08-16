import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import type { GameState } from '../models/types';
import { createPlayingGame, expectOk, giveResources, THREE_PLAYERS } from './helpers';

/** Advances a fresh PLAYING game straight to AWAITING_ACTIONS, where trading is allowed. */
function readyToTrade(names = THREE_PLAYERS, seed = 1): GameState {
  const game = createPlayingGame(names, seed);
  return { ...game, turnPhase: 'AWAITING_ACTIONS' };
}

function propose(
  state: GameState,
  playerId: string,
  targetPlayerId: string | null,
  offered: Record<string, number>,
  requested: Record<string, number>
) {
  return applyAction(state, {
    type: 'PROPOSE_TRADE',
    playerId,
    targetPlayerId,
    offeredResources: offered,
    requestedResources: requested,
  });
}

describe('player-to-player trade proposals', () => {
  it('accepts a valid trade proposal and records it as PENDING', () => {
    let game = readyToTrade();
    game = giveResources(game, 'player-0', { lumber: 2 });
    game = giveResources(game, 'player-1', { ore: 1 });

    const result = propose(game, 'player-0', 'player-1', { lumber: 2 }, { ore: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.tradeOffers).toHaveLength(1);
      expect(result.state.tradeOffers[0].status).toBe('PENDING');
      expect(result.state.tradeOffers[0].proposerId).toBe('player-0');
    }
  });

  it('rejects trading with yourself', () => {
    let game = readyToTrade();
    game = giveResources(game, 'player-0', { lumber: 2 });
    const result = propose(game, 'player-0', 'player-0', { lumber: 2 }, { ore: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/cannot trade with yourself/i);
  });

  it('rejects an offer of zero resources', () => {
    let game = readyToTrade();
    game = giveResources(game, 'player-0', { lumber: 2 });
    const result = propose(game, 'player-0', 'player-1', {}, { ore: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/offer at least one resource/i);
  });

  it('rejects a request of zero resources', () => {
    let game = readyToTrade();
    game = giveResources(game, 'player-0', { lumber: 2 });
    const result = propose(game, 'player-0', 'player-1', { lumber: 2 }, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/request at least one resource/i);
  });

  it('rejects an offer the proposer cannot afford', () => {
    const game = readyToTrade(); // player-0 has zero resources
    const result = propose(game, 'player-0', 'player-1', { lumber: 2 }, { ore: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/enough resources/i);
  });

  it('rejects trading before rolling (AWAITING_ROLL)', () => {
    const game = createPlayingGame(); // still AWAITING_ROLL
    const result = propose(
      giveResources(game, 'player-0', { lumber: 2 }),
      'player-0',
      'player-1',
      { lumber: 2 },
      { ore: 1 }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/must roll the dice/i);
  });

  it('rejects a proposal from a player who is not the current player', () => {
    let game = readyToTrade();
    game = giveResources(game, 'player-1', { lumber: 2 });
    const result = propose(game, 'player-1', 'player-0', { lumber: 2 }, { ore: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/only the current player/i);
  });
});

describe('accepting, rejecting, cancelling trades', () => {
  function offeredGame() {
    let game = readyToTrade();
    game = giveResources(game, 'player-0', { lumber: 2 });
    game = giveResources(game, 'player-1', { ore: 1 });
    const result = propose(game, 'player-0', 'player-1', { lumber: 2 }, { ore: 1 });
    game = expectOk(result);
    return { game, tradeId: game.tradeOffers[0].id };
  }

  it('performs an atomic exchange on acceptance', () => {
    const { game, tradeId } = offeredGame();
    const result = applyAction(game, { type: 'ACCEPT_TRADE', playerId: 'player-1', tradeId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sai = result.state.players[0];
    const rahul = result.state.players[1];
    expect(sai.resources.lumber).toBe(0);
    expect(sai.resources.ore).toBe(1);
    expect(rahul.resources.lumber).toBe(2);
    expect(rahul.resources.ore).toBe(0);
    expect(result.state.tradeOffers[0].status).toBe('ACCEPTED');
  });

  it('moves no resources when a trade is rejected', () => {
    const { game, tradeId } = offeredGame();
    const result = applyAction(game, { type: 'REJECT_TRADE', playerId: 'player-1', tradeId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.players[0].resources).toEqual(game.players[0].resources);
    expect(result.state.players[1].resources).toEqual(game.players[1].resources);
    expect(result.state.tradeOffers[0].status).toBe('REJECTED');
  });

  it('lets the proposer cancel a pending trade, moving no resources', () => {
    const { game, tradeId } = offeredGame();
    const result = applyAction(game, { type: 'CANCEL_TRADE', playerId: 'player-0', tradeId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.tradeOffers[0].status).toBe('CANCELLED');
    expect(result.state.players[0].resources).toEqual(game.players[0].resources);
  });

  it('does not let anyone but the proposer cancel', () => {
    const { game, tradeId } = offeredGame();
    const result = applyAction(game, { type: 'CANCEL_TRADE', playerId: 'player-1', tradeId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/only the proposer/i);
  });

  it('rejects acceptance from someone the trade was not offered to', () => {
    const { game, tradeId } = offeredGame();
    const result = applyAction(game, { type: 'ACCEPT_TRADE', playerId: 'player-2', tradeId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/not offered to you/i);
  });

  it('lets any other player accept an offer open to everyone', () => {
    let game = readyToTrade();
    game = giveResources(game, 'player-0', { lumber: 2 });
    game = giveResources(game, 'player-2', { ore: 1 });
    game = expectOk(propose(game, 'player-0', null, { lumber: 2 }, { ore: 1 }));
    const tradeId = game.tradeOffers[0].id;

    const result = applyAction(game, { type: 'ACCEPT_TRADE', playerId: 'player-2', tradeId });
    expect(result.ok).toBe(true);
  });

  it('rejects accepting a trade that is no longer PENDING', () => {
    const { game, tradeId } = offeredGame();
    const rejected = expectOk(
      applyAction(game, { type: 'REJECT_TRADE', playerId: 'player-1', tradeId })
    );
    const result = applyAction(rejected, {
      type: 'ACCEPT_TRADE',
      playerId: 'player-1',
      tradeId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/already rejected/i);
  });

  it('prevents double-spending resources across two simultaneous pending offers', () => {
    let game = readyToTrade();
    // Sai has exactly 2 lumber and offers it to both Rahul and Ananya at once.
    game = giveResources(game, 'player-0', { lumber: 2 });
    game = giveResources(game, 'player-1', { ore: 1 });
    game = giveResources(game, 'player-2', { wool: 1 });

    game = expectOk(propose(game, 'player-0', 'player-1', { lumber: 2 }, { ore: 1 }));
    game = expectOk(propose(game, 'player-0', 'player-2', { lumber: 2 }, { wool: 1 }));
    const [tradeToRahul, tradeToAnanya] = game.tradeOffers;

    game = expectOk(
      applyAction(game, {
        type: 'ACCEPT_TRADE',
        playerId: 'player-1',
        tradeId: tradeToRahul.id,
      })
    );
    expect(game.players[0].resources.lumber).toBe(0);

    // Sai no longer has the lumber for the second trade — Ananya's acceptance must fail.
    const secondAttempt = applyAction(game, {
      type: 'ACCEPT_TRADE',
      playerId: 'player-2',
      tradeId: tradeToAnanya.id,
    });
    expect(secondAttempt.ok).toBe(false);
    if (!secondAttempt.ok) {
      expect(secondAttempt.error.message).toMatch(/no longer has the offered resources/i);
    }
  });
});

describe('trade expiry on end of turn', () => {
  it("expires the current player's pending outgoing offers when they end their turn", () => {
    let game = readyToTrade();
    game = giveResources(game, 'player-0', { lumber: 2 });
    game = expectOk(propose(game, 'player-0', 'player-1', { lumber: 2 }, { ore: 1 }));
    const tradeId = game.tradeOffers[0].id;

    const ended = expectOk(
      applyAction(game, { type: 'END_TURN', playerId: 'player-0' })
    );
    const trade = ended.tradeOffers.find((t) => t.id === tradeId)!;
    expect(trade.status).toBe('EXPIRED');
    expect(ended.eventLog.some((e) => e.type === 'TRADE_EXPIRED')).toBe(true);
  });

  it('does not expire trades that were already resolved', () => {
    let game = readyToTrade();
    game = giveResources(game, 'player-0', { lumber: 2 });
    game = giveResources(game, 'player-1', { ore: 1 });
    game = expectOk(propose(game, 'player-0', 'player-1', { lumber: 2 }, { ore: 1 }));
    const tradeId = game.tradeOffers[0].id;
    game = expectOk(applyAction(game, { type: 'ACCEPT_TRADE', playerId: 'player-1', tradeId }));

    const ended = expectOk(applyAction(game, { type: 'END_TURN', playerId: 'player-0' }));
    expect(ended.tradeOffers.find((t) => t.id === tradeId)!.status).toBe('ACCEPTED');
  });
});

describe('bank trading', () => {
  it('trades exactly 4 of one resource for 1 of another at the standard rate', () => {
    let game = readyToTrade();
    game = giveResources(game, 'player-0', { brick: 4 });

    const result = applyAction(game, {
      type: 'BANK_TRADE',
      playerId: 'player-0',
      give: 'brick',
      receive: 'ore',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].resources.brick).toBe(0);
    expect(result.state.players[0].resources.ore).toBe(1);
  });

  it('rejects a bank trade without enough resources', () => {
    let game = readyToTrade();
    game = giveResources(game, 'player-0', { brick: 3 });
    const result = applyAction(game, {
      type: 'BANK_TRADE',
      playerId: 'player-0',
      give: 'brick',
      receive: 'ore',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/at least 4 brick/i);
  });

  it('rejects giving and receiving the same resource', () => {
    let game = readyToTrade();
    game = giveResources(game, 'player-0', { brick: 4 });
    const result = applyAction(game, {
      type: 'BANK_TRADE',
      playerId: 'player-0',
      give: 'brick',
      receive: 'brick',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/different resource/i);
  });

  it('rejects bank trades before rolling', () => {
    let game = createPlayingGame();
    game = giveResources(game, 'player-0', { brick: 4 });
    const result = applyAction(game, {
      type: 'BANK_TRADE',
      playerId: 'player-0',
      give: 'brick',
      receive: 'ore',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/must roll the dice/i);
  });
});
