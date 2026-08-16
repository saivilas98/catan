// Longest Road: a graph problem, not a road count.
//
// A player's roads are edges of the board graph. The Longest Road is the longest
// continuous *trail* through those edges — a walk that never reuses an edge, though
// it may revisit an intersection (which is what makes loops and figure-eights work).
// An opponent's settlement or city on an intersection blocks passage *through* it,
// so the roads on either side are not continuous even though both still exist.

import type { GameState } from '../models/types';

/** Minimum trail length before a player qualifies for the Longest Road bonus. */
export const LONGEST_ROAD_MINIMUM = 5;

export interface LongestRoadHolder {
  playerId: string | null;
  length: number;
}

/**
 * The longest continuous trail through a player's own roads.
 *
 * Exhaustive DFS from both ends of every owned road. The board is tiny (72 edges,
 * at most 15 roads per player) so correctness beats cleverness here — see the
 * sprint brief's explicit instruction not to optimise prematurely.
 */
export function calculateLongestRoadLength(state: GameState, playerId: string): number {
  const ownedEdges = state.board.edges.filter((edge) => edge.road?.ownerId === playerId);
  if (ownedEdges.length === 0) return 0;

  const edgeById = new Map(ownedEdges.map((edge) => [edge.id, edge]));

  // Which of the player's roads touch each intersection.
  const edgesAtIntersection = new Map<string, string[]>();
  for (const edge of ownedEdges) {
    for (const intersectionId of edge.intersectionIds) {
      const list = edgesAtIntersection.get(intersectionId);
      if (list) list.push(edge.id);
      else edgesAtIntersection.set(intersectionId, [edge.id]);
    }
  }

  const buildingByIntersection = new Map(
    state.board.intersections.map((i) => [i.id, i.building])
  );

  /** An opponent's building severs the route at that intersection. */
  const isBlocked = (intersectionId: string): boolean => {
    const building = buildingByIntersection.get(intersectionId);
    return !!building && building.ownerId !== playerId;
  };

  let best = 0;
  const used = new Set<string>();

  /**
   * We have just traversed `edgeId` and arrived at `arrivedAt`. Try to extend the
   * trail through that intersection.
   */
  const extend = (arrivedAt: string): void => {
    if (used.size > best) best = used.size;

    // You may end a road at an opponent's building, but never pass through it.
    if (isBlocked(arrivedAt)) return;

    for (const nextEdgeId of edgesAtIntersection.get(arrivedAt) ?? []) {
      if (used.has(nextEdgeId)) continue;
      const nextEdge = edgeById.get(nextEdgeId)!;
      const farEnd =
        nextEdge.intersectionIds[0] === arrivedAt
          ? nextEdge.intersectionIds[1]
          : nextEdge.intersectionIds[0];

      used.add(nextEdgeId);
      extend(farEnd);
      used.delete(nextEdgeId);
    }
  };

  // Start from both ends of every road so no trail is missed.
  for (const start of ownedEdges) {
    for (const startIntersection of start.intersectionIds) {
      const farEnd =
        start.intersectionIds[0] === startIntersection
          ? start.intersectionIds[1]
          : start.intersectionIds[0];

      used.add(start.id);
      extend(farEnd);
      used.delete(start.id);
    }
  }

  return best;
}

/** Every player's longest trail, for display and for holder resolution. */
export function getLongestRoadLengths(state: GameState): Array<{
  playerId: string;
  length: number;
}> {
  return state.players.map((player) => ({
    playerId: player.id,
    length: calculateLongestRoadLength(state, player.id),
  }));
}

/**
 * Who holds Longest Road after the current board state.
 *
 * The incumbent keeps the card while they still qualify and nobody strictly beats
 * them, so ties never move it. If the incumbent drops below the minimum, the card
 * passes to whoever is now uniquely longest — and if that is itself a tie, nobody
 * holds it until someone pulls ahead.
 */
export function getLongestRoadHolder(state: GameState): LongestRoadHolder {
  const lengths = getLongestRoadLengths(state);
  const qualifying = lengths.filter((entry) => entry.length >= LONGEST_ROAD_MINIMUM);
  if (qualifying.length === 0) return { playerId: null, length: 0 };

  const holder = state.longestRoadPlayerId;
  const holderLength = holder
    ? (lengths.find((entry) => entry.playerId === holder)?.length ?? 0)
    : 0;
  const best = Math.max(...qualifying.map((entry) => entry.length));

  if (holder && holderLength >= LONGEST_ROAD_MINIMUM && holderLength >= best) {
    return { playerId: holder, length: holderLength };
  }

  const leaders = qualifying.filter((entry) => entry.length === best);
  if (leaders.length === 1) return { playerId: leaders[0].playerId, length: best };

  // An unbroken tie with no qualifying incumbent: the card stays unclaimed.
  return { playerId: null, length: 0 };
}
