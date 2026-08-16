// Trading legality and rates — both player-to-player and with the bank/ports.
// Like placement.ts, this works off the real board graph: port ownership is
// determined by whether a player's settlement/city sits on a port's coastal
// intersection, never by arbitrary UI state.

import type { GameState, Port, ResourceCount, ResourceType, TradeOffer } from '../models/types';
import { countResources, RESOURCE_TYPES } from '../models/types';

const RESOURCE_LABEL: Record<ResourceType, string> = {
  brick: 'Brick',
  lumber: 'Lumber',
  wool: 'Wool',
  grain: 'Grain',
  ore: 'Ore',
};

export interface TradeCheck {
  valid: boolean;
  reason?: string;
}

const OK: TradeCheck = { valid: true };

function no(reason: string): TradeCheck {
  return { valid: false, reason };
}

function findPlayer(state: GameState, playerId: string) {
  return state.players.find((p) => p.id === playerId);
}

function totalResources(bundle: Partial<ResourceCount>): number {
  return countResources(bundle);
}

/** True when the player currently holds at least `bundle` of each resource named. */
export function hasAtLeast(state: GameState, playerId: string, bundle: Partial<ResourceCount>): boolean {
  const player = findPlayer(state, playerId);
  if (!player) return false;
  return RESOURCE_TYPES.every((r) => player.resources[r] >= (bundle[r] ?? 0));
}

// ---------- Ports ----------

/** Every port a player controls: they own a settlement or city on one of its two corners. */
export function getPlayerPorts(state: GameState, playerId: string): Port[] {
  return state.board.ports.filter((port) =>
    port.intersectionIds.some((intersectionId) => {
      const intersection = state.board.intersections.find((i) => i.id === intersectionId);
      return intersection?.building?.ownerId === playerId;
    })
  );
}

/**
 * The best rate available to this player for giving up `resource`: 2 with a matching
 * resource-specific port, else 3 with any generic port, else the standard 4. Rates
 * never stack — owning a generic port does not improve a resource-specific rate and
 * vice versa; only the single best applicable rate for this exact resource applies.
 */
export function getBestTradeRate(
  state: GameState,
  playerId: string,
  resource: ResourceType
): number {
  const ports = getPlayerPorts(state, playerId);
  if (ports.some((p) => p.type === 'RESOURCE_2_TO_1' && p.resource === resource)) return 2;
  if (ports.some((p) => p.type === 'GENERIC_3_TO_1')) return 3;
  return 4;
}

export function canBankTrade(
  state: GameState,
  playerId: string,
  give: ResourceType,
  receive: ResourceType
): TradeCheck {
  const player = findPlayer(state, playerId);
  if (!player) return no('Unknown player.');
  if (give === receive) return no('You must give a different resource than you receive.');

  const rate = getBestTradeRate(state, playerId, give);
  if (player.resources[give] < rate) {
    return no(`You need at least ${rate} ${RESOURCE_LABEL[give]} to make this trade at ${rate}:1.`);
  }
  return OK;
}

// ---------- Player-to-player trades ----------

export function canProposeTrade(
  state: GameState,
  proposerId: string,
  targetPlayerId: string | null,
  offeredResources: Partial<ResourceCount>,
  requestedResources: Partial<ResourceCount>
): TradeCheck {
  if (state.phase !== 'PLAYING') return no('Trading is only available during play.');
  if (state.turnPhase !== 'AWAITING_ACTIONS') {
    return no(
      state.turnPhase === 'AWAITING_ROLL'
        ? 'You must roll the dice before proposing a trade.'
        : 'You cannot trade until the current step is resolved.'
    );
  }
  if (proposerId !== state.currentPlayerId) {
    return no('Only the current player can propose a trade.');
  }
  if (!findPlayer(state, proposerId)) return no('Unknown player.');
  if (targetPlayerId === proposerId) return no('You cannot trade with yourself.');
  if (targetPlayerId && !findPlayer(state, targetPlayerId)) return no('Unknown trade partner.');

  if (totalResources(offeredResources) <= 0) {
    return no('You must offer at least one resource.');
  }
  if (totalResources(requestedResources) <= 0) {
    return no('You must request at least one resource.');
  }
  if (!hasAtLeast(state, proposerId, offeredResources)) {
    return no('You do not have enough resources to offer that.');
  }
  return OK;
}

function findTrade(state: GameState, tradeId: string): TradeOffer | undefined {
  return state.tradeOffers.find((t) => t.id === tradeId);
}

/**
 * Responding to an offer is only legal while the proposer is genuinely in their
 * action phase. A pending offer can otherwise survive into a mandatory step — play
 * a knight with an offer outstanding and the robber phase begins with the trade
 * still live — and resolving it there would move resources mid-sequence.
 */
function respondablePhase(state: GameState): TradeCheck {
  if (state.phase !== 'PLAYING') {
    return no('Trades can only be resolved during play.');
  }
  if (state.turnPhase !== 'AWAITING_ACTIONS') {
    return no('You cannot resolve a trade until the current step is finished.');
  }
  return OK;
}

/** Whether `playerId` is allowed to respond (accept/reject) to this offer. */
function canRespond(trade: TradeOffer, playerId: string): boolean {
  if (playerId === trade.proposerId) return false;
  return trade.targetPlayerId === null || trade.targetPlayerId === playerId;
}

/**
 * Revalidates a pending trade at acceptance time — both sides must still hold what
 * they're about to give up. This is what stops a player from double-spending the
 * same resources across two separate pending offers.
 */
export function canAcceptTrade(state: GameState, playerId: string, tradeId: string): TradeCheck {
  const phase = respondablePhase(state);
  if (!phase.valid) return phase;

  const trade = findTrade(state, tradeId);
  if (!trade) return no('That trade no longer exists.');
  if (trade.status !== 'PENDING') return no(`That trade is already ${trade.status.toLowerCase()}.`);
  if (!canRespond(trade, playerId)) return no('This trade was not offered to you.');
  if (!findPlayer(state, trade.proposerId)) return no('The proposer no longer exists.');

  if (!hasAtLeast(state, trade.proposerId, trade.offeredResources)) {
    return no('The proposer no longer has the offered resources.');
  }
  if (!hasAtLeast(state, playerId, trade.requestedResources)) {
    return no('You do not have the requested resources.');
  }
  return OK;
}

export function canRejectTrade(state: GameState, playerId: string, tradeId: string): TradeCheck {
  const phase = respondablePhase(state);
  if (!phase.valid) return phase;

  const trade = findTrade(state, tradeId);
  if (!trade) return no('That trade no longer exists.');
  if (trade.status !== 'PENDING') return no(`That trade is already ${trade.status.toLowerCase()}.`);
  if (!canRespond(trade, playerId)) return no('This trade was not offered to you.');
  return OK;
}

export function canCancelTrade(state: GameState, playerId: string, tradeId: string): TradeCheck {
  const phase = respondablePhase(state);
  if (!phase.valid) return phase;

  const trade = findTrade(state, tradeId);
  if (!trade) return no('That trade no longer exists.');
  if (trade.status !== 'PENDING') return no(`That trade is already ${trade.status.toLowerCase()}.`);
  if (trade.proposerId !== playerId) return no('Only the proposer can cancel this trade.');
  return OK;
}

/** Pending offers a given player can currently act on (as a possible respondent). */
export function getIncomingOffers(state: GameState, playerId: string): TradeOffer[] {
  return state.tradeOffers.filter((t) => t.status === 'PENDING' && canRespond(t, playerId));
}
