// Development card state transitions. Validation lives in rules/development.ts.

import type {
  DevelopmentCard,
  GameState,
  Player,
  ResourceCount,
  ResourceType,
} from '../models/types';
import { DEVELOPMENT_CARD_COST, RESOURCE_TYPES } from '../models/types';
import { drawDevelopmentCard } from './developmentDeck';
import { calculateLargestArmy } from '../rules/development';

/** Buys the top card: pays the cost, draws, and stamps the acquisition turn. */
export function buyDevelopmentCard(
  state: GameState,
  playerId: string
): { state: GameState; card: DevelopmentCard } | null {
  const drawn = drawDevelopmentCard(state.developmentDeck, state.turnNumber);
  if (!drawn) return null;

  const players = state.players.map((player) => {
    if (player.id !== playerId) return player;
    const resources = { ...player.resources };
    for (const resource of RESOURCE_TYPES) {
      resources[resource] -= DEVELOPMENT_CARD_COST[resource] ?? 0;
    }
    return {
      ...player,
      resources,
      developmentCards: [...player.developmentCards, drawn.card],
    };
  });

  return {
    card: drawn.card,
    state: { ...state, players, developmentDeck: drawn.deck },
  };
}

/** Moves one specific card from hand to the played pile. */
export function consumeCard(
  state: GameState,
  playerId: string,
  cardId: string
): GameState {
  const players = state.players.map((player) => {
    if (player.id !== playerId) return player;
    const card = player.developmentCards.find((c) => c.id === cardId);
    if (!card) return player;
    return {
      ...player,
      developmentCards: player.developmentCards.filter((c) => c.id !== cardId),
      playedDevelopmentCards: [...player.playedDevelopmentCards, card],
    };
  });

  return { ...state, players, hasPlayedDevCardThisTurn: true };
}

/** Recomputes the Largest Army holder after a knight is played. */
export function withLargestArmy(state: GameState): {
  state: GameState;
  changed: boolean;
  holderId: string | null;
} {
  const holderId = calculateLargestArmy(state);
  const changed = holderId !== state.largestArmyPlayerId;
  return { state: { ...state, largestArmyPlayerId: holderId }, changed, holderId };
}

function addResources(player: Player, bundle: Partial<ResourceCount>): Player {
  const resources = { ...player.resources };
  for (const resource of RESOURCE_TYPES) {
    resources[resource] += bundle[resource] ?? 0;
  }
  return { ...player, resources };
}

/**
 * Monopoly: every opponent hands over their entire stock of one resource.
 * Returns the total collected so the caller can log it.
 */
export function applyMonopoly(
  state: GameState,
  playerId: string,
  resource: ResourceType
): { state: GameState; collected: number } {
  const collected = state.players
    .filter((p) => p.id !== playerId)
    .reduce((sum, p) => sum + p.resources[resource], 0);

  const players = state.players.map((player) => {
    if (player.id === playerId) {
      return {
        ...player,
        resources: { ...player.resources, [resource]: player.resources[resource] + collected },
      };
    }
    return { ...player, resources: { ...player.resources, [resource]: 0 } };
  });

  return { state: { ...state, players }, collected };
}

/** Year of Plenty: the bank supplies exactly the two chosen cards. */
export function applyYearOfPlenty(
  state: GameState,
  playerId: string,
  selection: Partial<ResourceCount>
): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? addResources(player, selection) : player
    ),
  };
}
