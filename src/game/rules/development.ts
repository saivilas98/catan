// Development card legality, Largest Army, and true (hidden-inclusive) victory points.

import type {
  DevelopmentCard,
  DevelopmentCardType,
  GameState,
  ResourceType,
} from '../models/types';
import {
  DEVELOPMENT_CARD_COST,
  LARGEST_ARMY_MINIMUM,
  RESOURCE_TYPES,
} from '../models/types';

export interface DevelopmentCheck {
  valid: boolean;
  reason?: string;
}

const OK: DevelopmentCheck = { valid: true };

function no(reason: string): DevelopmentCheck {
  return { valid: false, reason };
}

export function canAffordDevelopmentCard(state: GameState, playerId: string): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  return RESOURCE_TYPES.every(
    (r) => player.resources[r] >= (DEVELOPMENT_CARD_COST[r] ?? 0)
  );
}

export function canBuyDevelopmentCard(state: GameState, playerId: string): DevelopmentCheck {
  if (state.phase !== 'PLAYING') return no('Development cards can only be bought during play.');
  // Special Building Phase (5-6 players) allows buying with cards already in hand.
  if (state.turnPhase !== 'AWAITING_ACTIONS' && state.turnPhase !== 'SPECIAL_BUILDING') {
    return no('You must roll the dice before buying a development card.');
  }
  if (playerId !== state.currentPlayerId) return no('It is not your turn.');
  if (state.developmentDeck.length === 0) {
    return no('The development card deck is empty.');
  }
  if (!canAffordDevelopmentCard(state, playerId)) {
    return no('A development card costs 1 Wool, 1 Grain and 1 Ore.');
  }
  return OK;
}

/** Cards in hand that could be played right now, ignoring the one-per-turn limit. */
export function getPlayableCards(state: GameState, playerId: string): DevelopmentCard[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  return player.developmentCards.filter(
    // Victory Point cards are never actively played; they simply count.
    (card) => card.type !== 'victoryPoint' && card.acquiredTurnNumber < state.turnNumber
  );
}

export function canPlayDevelopmentCard(
  state: GameState,
  playerId: string,
  cardType: DevelopmentCardType
): DevelopmentCheck {
  if (state.phase !== 'PLAYING') return no('Development cards can only be played during play.');
  if (playerId !== state.currentPlayerId) return no('It is not your turn.');
  if (state.turnPhase !== 'AWAITING_ACTIONS') {
    return no('You can only play a development card during your action phase.');
  }
  if (cardType === 'victoryPoint') {
    return no('Victory Point cards are not played — they count automatically.');
  }
  if (state.hasPlayedDevCardThisTurn) {
    return no('You have already played a development card this turn.');
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return no('Unknown player.');

  const owned = player.developmentCards.filter((card) => card.type === cardType);
  if (owned.length === 0) return no(`You do not have a ${cardType} card.`);

  if (!owned.some((card) => card.acquiredTurnNumber < state.turnNumber)) {
    return no('You cannot play a development card on the turn you bought it.');
  }
  return OK;
}

/** The oldest playable card of a type — so a fresh purchase is never spent first. */
export function findPlayableCard(
  state: GameState,
  playerId: string,
  cardType: DevelopmentCardType
): DevelopmentCard | undefined {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return undefined;
  return player.developmentCards.find(
    (card) => card.type === cardType && card.acquiredTurnNumber < state.turnNumber
  );
}

export function countPlayedKnights(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;
  return player.playedDevelopmentCards.filter((card) => card.type === 'knight').length;
}

/**
 * Largest Army holder after the current knight counts.
 * Needs at least 3 played knights; a challenger must strictly exceed the incumbent,
 * so a tie always leaves the badge where it is.
 */
export function calculateLargestArmy(state: GameState): string | null {
  const counts = state.players.map((player) => ({
    playerId: player.id,
    knights: countPlayedKnights(state, player.id),
  }));

  const eligible = counts.filter((c) => c.knights >= LARGEST_ARMY_MINIMUM);
  if (eligible.length === 0) return null;

  const holder = state.largestArmyPlayerId;
  const holderKnights = holder
    ? (counts.find((c) => c.playerId === holder)?.knights ?? 0)
    : 0;

  const best = Math.max(...eligible.map((c) => c.knights));

  // The incumbent keeps it unless someone strictly beats them.
  if (holder && holderKnights >= LARGEST_ARMY_MINIMUM && holderKnights >= best) {
    return holder;
  }

  const leaders = eligible.filter((c) => c.knights === best);
  if (leaders.length === 1) return leaders[0].playerId;

  // An unbroken tie with no qualifying incumbent: the card stays unclaimed. (The
  // incumbent is deliberately not returned here — if they no longer qualify they
  // must lose it, even though played knights cannot actually decrease in play.)
  return null;
}

export function countVictoryPointCards(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;
  return player.developmentCards.filter((card) => card.type === 'victoryPoint').length;
}

/**
 * The player's real victory point total, hidden Victory Point cards included.
 * Delegates to rules/scoring.ts, which owns the authoritative calculation.
 */
export { calculateVictoryPoints as getTotalVictoryPoints } from './scoring';

/** Resource labels shared by development-card log messages. */
export const RESOURCE_LABEL: Record<ResourceType, string> = {
  brick: 'Brick',
  lumber: 'Lumber',
  wool: 'Wool',
  grain: 'Grain',
  ore: 'Ore',
};
