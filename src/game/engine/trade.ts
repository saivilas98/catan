// Trade state transitions. Proposing/cancelling/rejecting only ever touch the
// tradeOffers list; only acceptTrade and executeBankTrade move resources, and both
// assume validation already passed (the caller in actions.ts checks first).

import type { GameState, ResourceCount, ResourceType, TradeOffer } from '../models/types';
import { RESOURCE_TYPES } from '../models/types';

function nextTradeId(state: GameState): string {
  return `trade-${state.tradeSequence}`;
}

export function proposeTrade(
  state: GameState,
  proposerId: string,
  targetPlayerId: string | null,
  offeredResources: Partial<ResourceCount>,
  requestedResources: Partial<ResourceCount>
): { state: GameState; trade: TradeOffer } {
  const trade: TradeOffer = {
    id: nextTradeId(state),
    proposerId,
    targetPlayerId,
    offeredResources,
    requestedResources,
    status: 'PENDING',
    turnNumber: state.turnNumber,
  };

  return {
    trade,
    state: {
      ...state,
      tradeOffers: [...state.tradeOffers, trade],
      tradeSequence: state.tradeSequence + 1,
    },
  };
}

function setTradeStatus(
  state: GameState,
  tradeId: string,
  status: TradeOffer['status']
): GameState {
  return {
    ...state,
    tradeOffers: state.tradeOffers.map((t) => (t.id === tradeId ? { ...t, status } : t)),
  };
}

export function cancelTrade(state: GameState, tradeId: string): GameState {
  return setTradeStatus(state, tradeId, 'CANCELLED');
}

export function rejectTrade(state: GameState, tradeId: string): GameState {
  return setTradeStatus(state, tradeId, 'REJECTED');
}

function transferResources(
  resources: ResourceCount,
  bundle: Partial<ResourceCount>,
  sign: 1 | -1
): ResourceCount {
  const next = { ...resources };
  for (const resource of RESOURCE_TYPES) {
    const amount = bundle[resource] ?? 0;
    if (amount === 0) continue;
    next[resource] += sign * amount;
  }
  return next;
}

/** Swaps offered/requested resources between proposer and acceptor, atomically. */
export function acceptTrade(state: GameState, acceptorId: string, tradeId: string): GameState {
  const trade = state.tradeOffers.find((t) => t.id === tradeId);
  if (!trade) return state;

  const players = state.players.map((player) => {
    if (player.id === trade.proposerId) {
      let resources = transferResources(player.resources, trade.offeredResources, -1);
      resources = transferResources(resources, trade.requestedResources, 1);
      return { ...player, resources };
    }
    if (player.id === acceptorId) {
      let resources = transferResources(player.resources, trade.requestedResources, -1);
      resources = transferResources(resources, trade.offeredResources, 1);
      return { ...player, resources };
    }
    return player;
  });

  return setTradeStatus({ ...state, players }, tradeId, 'ACCEPTED');
}

/** Expires every PENDING offer the given player proposed — see actions.ts END_TURN. */
export function expireOffersFrom(state: GameState, proposerId: string): GameState {
  return {
    ...state,
    tradeOffers: state.tradeOffers.map((t) =>
      t.status === 'PENDING' && t.proposerId === proposerId ? { ...t, status: 'EXPIRED' } : t
    ),
  };
}

export function executeBankTrade(
  state: GameState,
  playerId: string,
  give: ResourceType,
  receive: ResourceType,
  rate: number
): GameState {
  return {
    ...state,
    players: state.players.map((player) => {
      if (player.id !== playerId) return player;
      const resources = { ...player.resources };
      resources[give] -= rate;
      resources[receive] += 1;
      return { ...player, resources };
    }),
  };
}
