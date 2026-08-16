import { describe, expect, it } from 'vitest';
import { placeBuilding, placeRoad } from '../engine/construction';
import {
  calculateLongestRoadLength,
  getLongestRoadHolder,
  LONGEST_ROAD_MINIMUM,
} from '../rules/longestRoad';
import type { GameState } from '../models/types';
import { createPlayingGame } from './helpers';

/**
 * Lays an acyclic chain of roads and reports the intersections it runs through, so
 * tests can drop a blocking building at a known point along it.
 *
 * The walk deliberately never revisits an intersection: on a hex grid a greedy walk
 * otherwise curls around a single hex into a loop, and a loop is NOT severed by a
 * building (a trail can start and end there without ever passing through it).
 */
function buildChain(
  state: GameState,
  playerId: string,
  length: number,
  startEdgeIndex = 0
): { state: GameState; edgeIds: string[]; nodes: string[] } {
  const start = state.board.edges[startEdgeIndex];
  let next = placeRoad(state, playerId, start.id, { free: true });

  const edgeIds = [start.id];
  let current = start.intersectionIds[1];
  const nodes = [start.intersectionIds[0], current];

  while (edgeIds.length < length) {
    const intersection = next.board.intersections.find((i) => i.id === current)!;
    const candidate = intersection.edgeIds
      .map((id) => next.board.edges.find((e) => e.id === id)!)
      .find((e) => {
        if (edgeIds.includes(e.id) || e.road) return false;
        const far = e.intersectionIds[0] === current ? e.intersectionIds[1] : e.intersectionIds[0];
        return !nodes.includes(far); // keep the chain acyclic
      });
    if (!candidate) break;

    next = placeRoad(next, playerId, candidate.id, { free: true });
    edgeIds.push(candidate.id);
    current =
      candidate.intersectionIds[0] === current
        ? candidate.intersectionIds[1]
        : candidate.intersectionIds[0];
    nodes.push(current);
  }

  return { state: next, edgeIds, nodes };
}

describe('longest road: basic trails', () => {
  it('counts a single road as length 1', () => {
    const { state } = buildChain(createPlayingGame(), 'player-0', 1);
    expect(calculateLongestRoadLength(state, 'player-0')).toBe(1);
  });

  it('counts two connected roads as length 2', () => {
    const { state } = buildChain(createPlayingGame(), 'player-0', 2);
    expect(calculateLongestRoadLength(state, 'player-0')).toBe(2);
  });

  it('counts five connected roads as length 5, which qualifies', () => {
    const { state } = buildChain(createPlayingGame(), 'player-0', 5);
    expect(calculateLongestRoadLength(state, 'player-0')).toBe(5);
    expect(getLongestRoadHolder(state).playerId).toBe('player-0');
  });

  it('does not qualify with only four roads', () => {
    const { state } = buildChain(createPlayingGame(), 'player-0', 4);
    expect(calculateLongestRoadLength(state, 'player-0')).toBe(4);
    expect(getLongestRoadHolder(state).playerId).toBeNull();
  });

  it('is zero for a player with no roads', () => {
    expect(calculateLongestRoadLength(createPlayingGame(), 'player-0')).toBe(0);
  });

  it('ignores roads belonging to other players', () => {
    const { state } = buildChain(createPlayingGame(), 'player-1', 6);
    expect(calculateLongestRoadLength(state, 'player-0')).toBe(0);
    expect(calculateLongestRoadLength(state, 'player-1')).toBe(6);
  });
});

describe('longest road: graph shapes', () => {
  it('takes the longest branch rather than the total road count', () => {
    // A 5-road chain with two extra stubs hanging off the second intersection.
    // Total roads is 7, but no single trail uses all of them.
    const { state: chainState, nodes } = buildChain(createPlayingGame(), 'player-0', 5);
    let state = chainState;
    const junction = state.board.intersections.find((i) => i.id === nodes[1])!;

    let branches = 0;
    for (const edgeId of junction.edgeIds) {
      const edge = state.board.edges.find((e) => e.id === edgeId)!;
      if (edge.road) continue;
      state = placeRoad(state, 'player-0', edge.id, { free: true });
      branches += 1;
    }

    const totalRoads = state.board.edges.filter((e) => e.road?.ownerId === 'player-0').length;
    const longest = calculateLongestRoadLength(state, 'player-0');

    expect(branches).toBeGreaterThan(0);
    expect(totalRoads).toBe(5 + branches);
    // The trail can use at most one stub at each end of the junction, never all.
    expect(longest).toBeLessThan(totalRoads);
    expect(longest).toBeGreaterThanOrEqual(5);
  });

  it('walks a closed loop exactly once around', () => {
    // The six edges of one hex form a cycle: the trail is 6, never more.
    let state = createPlayingGame();
    const hex = state.board.hexes[0];
    for (const edgeId of hex.edgeIds) {
      state = placeRoad(state, 'player-0', edgeId, { free: true });
    }

    expect(calculateLongestRoadLength(state, 'player-0')).toBe(6);
  });

  it('never counts an edge twice within one trail', () => {
    // A loop plus a tail: the trail is the 6-cycle plus the single tail road.
    let state = createPlayingGame();
    const hex = state.board.hexes[0];
    for (const edgeId of hex.edgeIds) {
      state = placeRoad(state, 'player-0', edgeId, { free: true });
    }

    const corner = state.board.intersections.find((i) => i.id === hex.intersectionIds[0])!;
    const tail = corner.edgeIds
      .map((id) => state.board.edges.find((e) => e.id === id)!)
      .find((e) => !e.road);
    if (tail) state = placeRoad(state, 'player-0', tail.id, { free: true });

    const owned = state.board.edges.filter((e) => e.road?.ownerId === 'player-0').length;
    const longest = calculateLongestRoadLength(state, 'player-0');

    expect(longest).toBe(owned); // every edge used exactly once
    expect(longest).toBe(tail ? 7 : 6);
  });

  it('handles a complex branching network without exceeding the edge count', () => {
    const { state: chainState, nodes } = buildChain(createPlayingGame(), 'player-0', 6);
    let state = chainState;

    // Hang a stub off several intersections along the chain.
    for (const nodeId of nodes.slice(1, 4)) {
      const intersection = state.board.intersections.find((i) => i.id === nodeId)!;
      const free = intersection.edgeIds
        .map((id) => state.board.edges.find((e) => e.id === id)!)
        .find((e) => !e.road);
      if (free) state = placeRoad(state, 'player-0', free.id, { free: true });
    }

    const owned = state.board.edges.filter((e) => e.road?.ownerId === 'player-0').length;
    const longest = calculateLongestRoadLength(state, 'player-0');

    expect(longest).toBeGreaterThanOrEqual(6);
    expect(longest).toBeLessThanOrEqual(owned);
  });
});

describe('longest road: buildings on the route', () => {
  it("is severed by an opponent's settlement in the middle", () => {
    const { state, nodes } = buildChain(createPlayingGame(), 'player-0', 6);
    expect(calculateLongestRoadLength(state, 'player-0')).toBe(6);

    // nodes[3] sits with three roads on each side.
    const blocked = placeBuilding(state, 'player-1', nodes[3], 'settlement', { free: true });
    expect(calculateLongestRoadLength(blocked, 'player-0')).toBe(3);
  });

  it("is severed by an opponent's city just the same", () => {
    const { state, nodes } = buildChain(createPlayingGame(), 'player-0', 6);
    const blocked = placeBuilding(state, 'player-1', nodes[3], 'city', { free: true });
    expect(calculateLongestRoadLength(blocked, 'player-0')).toBe(3);
  });

  it('is not severed by the road owner’s own settlement', () => {
    const { state, nodes } = buildChain(createPlayingGame(), 'player-0', 6);
    const own = placeBuilding(state, 'player-0', nodes[3], 'settlement', { free: true });
    expect(calculateLongestRoadLength(own, 'player-0')).toBe(6);
  });

  it('is not severed by the road owner’s own city', () => {
    const { state, nodes } = buildChain(createPlayingGame(), 'player-0', 6);
    const own = placeBuilding(state, 'player-0', nodes[3], 'city', { free: true });
    expect(calculateLongestRoadLength(own, 'player-0')).toBe(6);
  });

  it('still allows a trail to END at an opponent building', () => {
    // Blocking the far end costs nothing: you may arrive there, just not pass through.
    const { state, nodes } = buildChain(createPlayingGame(), 'player-0', 5);
    const blocked = placeBuilding(state, 'player-1', nodes[nodes.length - 1], 'settlement', {
      free: true,
    });
    expect(calculateLongestRoadLength(blocked, 'player-0')).toBe(5);
  });
});

describe('longest road: holder and ties', () => {
  it('awards nobody when no player reaches the minimum', () => {
    const { state } = buildChain(createPlayingGame(), 'player-0', LONGEST_ROAD_MINIMUM - 1);
    expect(getLongestRoadHolder(state)).toEqual({ playerId: null, length: 0 });
  });

  it('awards the sole qualifying player', () => {
    const { state } = buildChain(createPlayingGame(), 'player-0', 5);
    expect(getLongestRoadHolder(state)).toEqual({ playerId: 'player-0', length: 5 });
  });

  it('leaves the card with the incumbent on a tie', () => {
    const first = buildChain(createPlayingGame(), 'player-0', 5);
    let state: GameState = { ...first.state, longestRoadPlayerId: 'player-0', longestRoadLength: 5 };

    // Give the challenger an equal-length, separate chain.
    const second = buildChain(state, 'player-1', 5, 40);
    state = second.state;

    expect(calculateLongestRoadLength(state, 'player-1')).toBe(5);
    expect(getLongestRoadHolder(state).playerId).toBe('player-0');
  });

  it('transfers to a strictly longer challenger', () => {
    const first = buildChain(createPlayingGame(), 'player-0', 5);
    let state: GameState = { ...first.state, longestRoadPlayerId: 'player-0', longestRoadLength: 5 };

    const second = buildChain(state, 'player-1', 7, 40);
    state = second.state;

    expect(calculateLongestRoadLength(state, 'player-1')).toBe(7);
    expect(getLongestRoadHolder(state)).toEqual({ playerId: 'player-1', length: 7 });
  });

  it('strips the card when the incumbent drops below the minimum', () => {
    const { state, nodes } = buildChain(createPlayingGame(), 'player-0', 6);
    const held: GameState = {
      ...state,
      longestRoadPlayerId: 'player-0',
      longestRoadLength: 6,
    };

    // An opponent settlement cuts the chain into 3 + 2 — below the minimum.
    const broken = placeBuilding(held, 'player-1', nodes[3], 'settlement', { free: true });
    expect(calculateLongestRoadLength(broken, 'player-0')).toBe(3);
    expect(getLongestRoadHolder(broken)).toEqual({ playerId: null, length: 0 });
  });
});
