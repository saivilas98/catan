// The two-round opening: forward order, then reverse order, each player placing
// a settlement then a road. The second settlement grants its adjacent resources.

import type { GameState, ProductionAward, ResourceType } from '../models/types';
import { TERRAIN_TO_RESOURCE } from '../models/types';

/** Setup visits players forward then backward: [0,1,..,n-1, n-1,..,1,0]. */
export function getSetupOrder(playerCount: number): number[] {
  const forward = Array.from({ length: playerCount }, (_, i) => i);
  return [...forward, ...[...forward].reverse()];
}

export function getSetupPlayerIndex(state: GameState): number {
  return getSetupOrder(state.players.length)[state.setupOrderIndex];
}

/** 1 for the opening round, 2 for the reverse round. */
export function getSetupRound(state: GameState): 1 | 2 {
  return state.setupOrderIndex < state.players.length ? 1 : 2;
}

export function isSetupComplete(state: GameState): boolean {
  return state.setupOrderIndex >= getSetupOrder(state.players.length).length;
}

/**
 * The resource bonus for the second settlement: one card per adjacent
 * resource-producing hex. The desert yields nothing.
 */
export function getInitialResourceAwards(
  state: GameState,
  playerId: string,
  intersectionId: string
): ProductionAward[] {
  const intersection = state.board.intersections.find((i) => i.id === intersectionId);
  if (!intersection) return [];

  const awards: ProductionAward[] = [];
  for (const hexId of intersection.hexIds) {
    const hex = state.board.hexes.find((h) => h.id === hexId);
    if (!hex) continue;
    const resource = TERRAIN_TO_RESOURCE[hex.terrain];
    if (!resource) continue;
    awards.push({ playerId, hexId, resource, amount: 1 });
  }
  return awards;
}

export function grantAwards(state: GameState, awards: ProductionAward[]): GameState {
  if (awards.length === 0) return state;
  return {
    ...state,
    players: state.players.map((player) => {
      const own = awards.filter((a) => a.playerId === player.id);
      if (own.length === 0) return player;
      const resources = { ...player.resources };
      for (const award of own) {
        resources[award.resource as ResourceType] += award.amount;
      }
      return { ...player, resources };
    }),
  };
}

/**
 * Advances to the next placement slot after a road is placed, transitioning to
 * PLAYING once the final setup road is down.
 */
export function advanceSetup(state: GameState): GameState {
  const nextIndex = state.setupOrderIndex + 1;
  const order = getSetupOrder(state.players.length);

  if (nextIndex >= order.length) {
    return {
      ...state,
      phase: 'PLAYING',
      turnPhase: 'AWAITING_ROLL',
      setupOrderIndex: nextIndex,
      setupStep: 'PLACE_SETTLEMENT',
      pendingSettlementId: null,
      currentPlayerId: state.players[0].id,
      turnNumber: 1,
      hasRolledThisTurn: false,
      diceResult: null,
    };
  }

  return {
    ...state,
    setupOrderIndex: nextIndex,
    setupStep: 'PLACE_SETTLEMENT',
    pendingSettlementId: null,
    currentPlayerId: state.players[order[nextIndex]].id,
  };
}
