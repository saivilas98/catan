// Structural invariants for a live GameState.
//
// validateBoard() (Sprint 1) checks the board is well formed. This checks the whole
// game: that no sequence of actions has produced a state the rules make impossible.
// Tests assert it after every action, so a violation points at the action that
// caused it rather than surfacing many turns later.

import type { GameState, ResourceType } from '../models/types';
import {
  DEVELOPMENT_DECK_COMPOSITION,
  PIECE_LIMITS,
  RESOURCE_TYPES,
} from '../models/types';
import { MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS } from '../engine/gameEngine';
import { validateBoard } from '../board/boardValidator';
import { calculateVictoryPoints } from './scoring';

export interface StateValidationResult {
  valid: boolean;
  errors: string[];
}

/** Turn phases that only make sense while a game is actually being played. */
const PLAYING_ONLY_PHASES = new Set([
  'AWAITING_ACTIONS',
  'DISCARDING',
  'MOVING_ROBBER',
  'STEALING',
  'ROAD_BUILDING',
]);

export function validateGameState(state: GameState): StateValidationResult {
  const errors: string[] = [];
  const playerIds = new Set(state.players.map((p) => p.id));

  // ---------- Players ----------
  if (state.players.length < MIN_PLAYERS || state.players.length > MAX_PLAYERS) {
    errors.push(`Player count ${state.players.length} outside ${MIN_PLAYERS}-${MAX_PLAYERS}`);
  }
  if (playerIds.size !== state.players.length) {
    errors.push('Duplicate player IDs');
  }
  if (!playerIds.has(state.currentPlayerId)) {
    errors.push(`currentPlayerId ${state.currentPlayerId} is not a known player`);
  }
  const colors = state.players.map((p) => p.color);
  if (new Set(colors).size !== colors.length) {
    errors.push('Duplicate player colours');
  }
  for (const color of colors) {
    if (!PLAYER_COLORS.includes(color)) errors.push(`Unknown player colour ${color}`);
  }

  // ---------- Resources ----------
  for (const player of state.players) {
    for (const resource of RESOURCE_TYPES) {
      const amount = player.resources[resource as ResourceType];
      if (!Number.isInteger(amount)) {
        errors.push(`${player.id} has non-integer ${resource}: ${amount}`);
      }
      if (amount < 0) {
        errors.push(`${player.id} has negative ${resource}: ${amount}`);
      }
    }
  }

  // ---------- Buildings and roads ----------
  const seenBuildingIntersections = new Set<string>();
  let totalBuildings = 0;
  for (const intersection of state.board.intersections) {
    const building = intersection.building;
    if (!building) continue;
    totalBuildings += 1;

    if (seenBuildingIntersections.has(intersection.id)) {
      errors.push(`Two buildings on intersection ${intersection.id}`);
    }
    seenBuildingIntersections.add(intersection.id);

    if (!playerIds.has(building.ownerId)) {
      errors.push(`Building ${building.id} owned by unknown player ${building.ownerId}`);
    }
    if (building.intersectionId !== intersection.id) {
      errors.push(`Building ${building.id} records the wrong intersection`);
    }
  }

  const seenRoadEdges = new Set<string>();
  for (const edge of state.board.edges) {
    const road = edge.road;
    if (!road) continue;
    if (seenRoadEdges.has(edge.id)) errors.push(`Two roads on edge ${edge.id}`);
    seenRoadEdges.add(edge.id);

    if (!playerIds.has(road.ownerId)) {
      errors.push(`Road ${road.id} owned by unknown player ${road.ownerId}`);
    }
    if (road.edgeId !== edge.id) errors.push(`Road ${road.id} records the wrong edge`);
  }

  // ---------- Piece limits ----------
  for (const player of state.players) {
    const roads = state.board.edges.filter((e) => e.road?.ownerId === player.id).length;
    const settlements = state.board.intersections.filter(
      (i) => i.building?.ownerId === player.id && i.building.type === 'settlement'
    ).length;
    const cities = state.board.intersections.filter(
      (i) => i.building?.ownerId === player.id && i.building.type === 'city'
    ).length;

    if (roads > PIECE_LIMITS.road) errors.push(`${player.id} has ${roads} roads (max ${PIECE_LIMITS.road})`);
    if (settlements > PIECE_LIMITS.settlement) {
      errors.push(`${player.id} has ${settlements} settlements (max ${PIECE_LIMITS.settlement})`);
    }
    if (cities > PIECE_LIMITS.city) {
      errors.push(`${player.id} has ${cities} cities (max ${PIECE_LIMITS.city})`);
    }

    for (const piece of ['road', 'settlement', 'city'] as const) {
      const remaining = player.piecesRemaining[piece];
      if (remaining < 0) errors.push(`${player.id} has negative ${piece} pieces`);
      if (remaining > PIECE_LIMITS[piece]) {
        errors.push(`${player.id} has more ${piece} pieces than the supply allows`);
      }
    }

    // Pieces on the board plus pieces in hand must equal the original supply.
    if (roads + player.piecesRemaining.road !== PIECE_LIMITS.road) {
      errors.push(
        `${player.id} road pieces do not balance: ${roads} placed + ${player.piecesRemaining.road} left`
      );
    }
    if (settlements + player.piecesRemaining.settlement !== PIECE_LIMITS.settlement) {
      errors.push(
        `${player.id} settlement pieces do not balance: ${settlements} placed + ${player.piecesRemaining.settlement} left`
      );
    }
    if (cities + player.piecesRemaining.city !== PIECE_LIMITS.city) {
      errors.push(
        `${player.id} city pieces do not balance: ${cities} placed + ${player.piecesRemaining.city} left`
      );
    }
  }
  if (totalBuildings > state.board.intersections.length) {
    errors.push('More buildings than intersections');
  }

  // ---------- Development cards ----------
  const allCardIds: string[] = [
    ...state.developmentDeck.map((c) => c.id),
    ...state.players.flatMap((p) => [
      ...p.developmentCards.map((c) => c.id),
      ...p.playedDevelopmentCards.map((c) => c.id),
    ]),
  ];
  if (new Set(allCardIds).size !== allCardIds.length) {
    errors.push('A development card exists in more than one place');
  }

  const deckTotal = Object.values(DEVELOPMENT_DECK_COMPOSITION).reduce((a, b) => a + b, 0);
  // Cards granted by DEV tools are not from the deck, so only the deck itself is
  // bounded here; the true conservation check lives in the simulation test.
  if (state.developmentDeck.length > deckTotal) {
    errors.push(`Deck holds ${state.developmentDeck.length} cards, more than the ${deckTotal} printed`);
  }
  if (state.developmentDeck.length < 0) errors.push('Negative deck size');

  // ---------- Board ----------
  const boardResult = validateBoard(state.board);
  if (!boardResult.valid) {
    errors.push(...boardResult.errors.map((e) => `Board: ${e}`));
  }
  if (!state.board.hexes.some((h) => h.id === state.robberHexId)) {
    errors.push(`Robber is on unknown hex ${state.robberHexId}`);
  }

  // ---------- Victory ----------
  for (const player of state.players) {
    if (player.victoryPoints < 0) errors.push(`${player.id} has negative victory points`);
  }
  if (state.phase === 'GAME_OVER') {
    if (!state.winnerId) errors.push('Game is over with no winner recorded');
    else if (!playerIds.has(state.winnerId)) errors.push('Winner is not a known player');
  } else if (state.winnerId) {
    errors.push('A winner is recorded but the game is not over');
  }
  if (state.longestRoadPlayerId && !playerIds.has(state.longestRoadPlayerId)) {
    errors.push('Longest Road held by an unknown player');
  }
  if (state.largestArmyPlayerId && !playerIds.has(state.largestArmyPlayerId)) {
    errors.push('Largest Army held by an unknown player');
  }

  // ---------- Turn ----------
  if (state.phase === 'INITIAL_PLACEMENT' && PLAYING_ONLY_PHASES.has(state.turnPhase)) {
    errors.push(`Turn phase ${state.turnPhase} is not valid during initial placement`);
  }
  if (state.turnNumber < 1) errors.push('Turn number must be at least 1');
  if (state.turnPhase === 'DISCARDING' && state.pendingDiscards.length === 0) {
    errors.push('Discard phase with nobody left to discard');
  }
  if (state.turnPhase !== 'DISCARDING' && state.pendingDiscards.length > 0) {
    errors.push('Outstanding discards outside the discard phase');
  }
  if (state.turnPhase === 'STEALING' && state.stealCandidateIds.length === 0) {
    errors.push('Stealing phase with no candidates');
  }
  for (const candidateId of state.stealCandidateIds) {
    if (!playerIds.has(candidateId)) errors.push(`Steal candidate ${candidateId} is unknown`);
    if (candidateId === state.currentPlayerId) {
      errors.push('The current player is listed as their own steal candidate');
    }
  }
  for (const requirement of state.pendingDiscards) {
    if (!playerIds.has(requirement.playerId)) {
      errors.push(`Discard required of unknown player ${requirement.playerId}`);
    }
    if (requirement.required <= 0) errors.push('A discard requirement of zero or fewer cards');
  }
  if (state.roadBuildingRoadsRemaining < 0) errors.push('Negative Road Building roads remaining');
  if (state.turnPhase !== 'ROAD_BUILDING' && state.roadBuildingRoadsRemaining > 0) {
    errors.push('Free roads owed outside the Road Building phase');
  }

  // Victory points must agree with the authoritative calculation.
  for (const player of state.players) {
    const expectedPublic = calculateVictoryPoints(state, player.id) -
      player.developmentCards.filter((c) => c.type === 'victoryPoint').length;
    if (player.victoryPoints !== expectedPublic) {
      errors.push(
        `${player.id} public VP is ${player.victoryPoints} but should be ${expectedPublic}`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Focused resource check, for asserting after every resource-moving action. */
export function validateResources(state: GameState): StateValidationResult {
  const errors: string[] = [];
  for (const player of state.players) {
    for (const resource of RESOURCE_TYPES) {
      const amount = player.resources[resource];
      if (amount < 0) errors.push(`${player.id} has negative ${resource}: ${amount}`);
      if (!Number.isInteger(amount)) errors.push(`${player.id} has fractional ${resource}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
