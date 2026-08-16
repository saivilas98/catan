// The single authoritative victory-point calculation. Nothing else in the codebase
// should add up victory points — every other module reads from here.

import type { GameState, VictoryPointBreakdown } from '../models/types';
import { BUILDING_VICTORY_POINTS } from '../models/types';
import { calculateLargestArmy, countPlayedKnights } from './development';
import { getLongestRoadHolder, calculateLongestRoadLength } from './longestRoad';

export const LONGEST_ROAD_VP = 2;
export const LARGEST_ARMY_VP = 2;
export const VICTORY_POINT_TARGET = 10;

/**
 * A full accounting of one player's score.
 *
 * `publicTotal` is what opponents may see: buildings plus the two public bonuses.
 * `total` additionally includes hidden Victory Point cards and is what the win
 * condition reads — it must never be rendered for anyone but that player (or after
 * the game is over, when everything is revealed).
 */
export function getVictoryPointBreakdown(
  state: GameState,
  playerId: string
): VictoryPointBreakdown {
  let settlements = 0;
  let cities = 0;

  for (const intersection of state.board.intersections) {
    const building = intersection.building;
    if (!building || building.ownerId !== playerId) continue;
    // A city replaces its settlement, so each intersection is counted exactly once.
    if (building.type === 'city') cities += 1;
    else settlements += 1;
  }

  const settlementPoints = settlements * BUILDING_VICTORY_POINTS.settlement;
  const cityPoints = cities * BUILDING_VICTORY_POINTS.city;

  const player = state.players.find((p) => p.id === playerId);
  const victoryPointCards =
    player?.developmentCards.filter((card) => card.type === 'victoryPoint').length ?? 0;

  const longestRoad = state.longestRoadPlayerId === playerId ? LONGEST_ROAD_VP : 0;
  const largestArmy = state.largestArmyPlayerId === playerId ? LARGEST_ARMY_VP : 0;

  const publicTotal = settlementPoints + cityPoints + longestRoad + largestArmy;

  return {
    settlements,
    cities,
    settlementPoints,
    cityPoints,
    victoryPointCards,
    longestRoad,
    largestArmy,
    publicTotal,
    total: publicTotal + victoryPointCards,
  };
}

/** The player's true score, hidden Victory Point cards included. */
export function calculateVictoryPoints(state: GameState, playerId: string): number {
  return getVictoryPointBreakdown(state, playerId).total;
}

/** What opponents are allowed to see. */
export function calculatePublicVictoryPoints(state: GameState, playerId: string): number {
  return getVictoryPointBreakdown(state, playerId).publicTotal;
}

export function checkVictoryCondition(state: GameState, playerId: string): boolean {
  return calculateVictoryPoints(state, playerId) >= VICTORY_POINT_TARGET;
}

/**
 * Recomputes both public bonuses and every player's public score.
 *
 * Called after any board mutation — a road, a settlement, a city upgrade or a
 * knight can all move a bonus, and a new settlement can even sever an opponent's
 * road network and cost them Longest Road.
 */
export function withScoringRefreshed(state: GameState): GameState {
  const longestRoad = getLongestRoadHolder(state);
  const largestArmyPlayerId = calculateLargestArmy(state);

  const scored: GameState = {
    ...state,
    longestRoadPlayerId: longestRoad.playerId,
    longestRoadLength: longestRoad.length,
    largestArmyPlayerId,
  };

  return {
    ...scored,
    players: scored.players.map((player) => ({
      ...player,
      // player.victoryPoints stays PUBLIC; hidden cards live only in the breakdown.
      victoryPoints: calculatePublicVictoryPoints(scored, player.id),
    })),
  };
}

/** Convenience for the UI: current knight count for the Largest Army indicator. */
export function getLargestArmyHolder(state: GameState): {
  playerId: string | null;
  knights: number;
} {
  const playerId = state.largestArmyPlayerId;
  return {
    playerId,
    knights: playerId ? countPlayedKnights(state, playerId) : 0,
  };
}

/** Convenience for the UI: the current Longest Road holder and their trail length. */
export function getLongestRoadDisplay(state: GameState): {
  playerId: string | null;
  length: number;
} {
  return {
    playerId: state.longestRoadPlayerId,
    length: state.longestRoadPlayerId
      ? calculateLongestRoadLength(state, state.longestRoadPlayerId)
      : 0,
  };
}
