import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import { placeBuilding, placeRoad } from '../engine/construction';
import {
  calculateVictoryPoints,
  checkVictoryCondition,
  getVictoryPointBreakdown,
  withScoringRefreshed,
  LARGEST_ARMY_VP,
  LONGEST_ROAD_VP,
  VICTORY_POINT_TARGET,
} from '../rules/scoring';
import { calculateLargestArmy } from '../rules/development';
import type { GameState, Intersection } from '../models/types';
import {
  expectOk,
  giveDevelopmentCard,
  givePlayedKnights,
  giveResources,
  readyToAct,
} from './helpers';

/** Intersections far enough apart that each can hold its own building. */
function spacedIntersections(state: GameState, count: number): Intersection[] {
  const chosen: Intersection[] = [];
  const taken = new Set<string>();
  for (const intersection of state.board.intersections) {
    if (chosen.length >= count) break;
    if (taken.has(intersection.id)) continue;
    chosen.push(intersection);
    taken.add(intersection.id);
    for (const neighbour of intersection.intersectionIds) taken.add(neighbour);
  }
  return chosen;
}

/** Places `settlements` settlements and `cities` cities for a player. */
function withBuildings(
  state: GameState,
  playerId: string,
  settlements: number,
  cities: number
): GameState {
  const spots = spacedIntersections(state, settlements + cities);
  let next = state;
  spots.forEach((spot, index) => {
    const type = index < cities ? 'city' : 'settlement';
    next = placeBuilding(next, playerId, spot.id, type, { free: true });
  });
  return next;
}

describe('victory point sources', () => {
  it('scores a settlement as 1', () => {
    const state = withBuildings(readyToAct(), 'player-0', 1, 0);
    expect(calculateVictoryPoints(state, 'player-0')).toBe(1);
  });

  it('scores a city as 2', () => {
    const state = withBuildings(readyToAct(), 'player-0', 0, 1);
    expect(calculateVictoryPoints(state, 'player-0')).toBe(2);
  });

  it('scores a victory point card as 1', () => {
    const state = giveDevelopmentCard(readyToAct(), 'player-0', 'victoryPoint');
    expect(calculateVictoryPoints(state, 'player-0')).toBe(1);
  });

  it('scores Longest Road as exactly 2', () => {
    const state: GameState = { ...readyToAct(), longestRoadPlayerId: 'player-0' };
    expect(calculateVictoryPoints(state, 'player-0')).toBe(LONGEST_ROAD_VP);
    expect(LONGEST_ROAD_VP).toBe(2);
  });

  it('scores Largest Army as exactly 2', () => {
    const state: GameState = { ...readyToAct(), largestArmyPlayerId: 'player-0' };
    expect(calculateVictoryPoints(state, 'player-0')).toBe(LARGEST_ARMY_VP);
    expect(LARGEST_ARMY_VP).toBe(2);
  });

  it('adds every source into one total', () => {
    let state = withBuildings(readyToAct(), 'player-0', 2, 2); // 2 + 4
    state = giveDevelopmentCard(state, 'player-0', 'victoryPoint'); // +1
    state = { ...state, longestRoadPlayerId: 'player-0', largestArmyPlayerId: 'player-0' }; // +4

    const breakdown = getVictoryPointBreakdown(state, 'player-0');
    expect(breakdown.settlementPoints).toBe(2);
    expect(breakdown.cityPoints).toBe(4);
    expect(breakdown.victoryPointCards).toBe(1);
    expect(breakdown.longestRoad).toBe(2);
    expect(breakdown.largestArmy).toBe(2);
    expect(breakdown.publicTotal).toBe(10);
    expect(breakdown.total).toBe(11);
  });
});

describe('no double counting', () => {
  it('counts an upgraded settlement as a city only', () => {
    const spot = spacedIntersections(readyToAct(), 1)[0];
    let state = placeBuilding(readyToAct(), 'player-0', spot.id, 'settlement', { free: true });
    expect(calculateVictoryPoints(state, 'player-0')).toBe(1);

    state = placeBuilding(state, 'player-0', spot.id, 'city', { free: true });
    const breakdown = getVictoryPointBreakdown(state, 'player-0');

    expect(breakdown.settlements).toBe(0); // replaced, not added to
    expect(breakdown.cities).toBe(1);
    expect(breakdown.total).toBe(2); // not 1 + 2
  });

  it('counts Longest Road once, however often scoring is refreshed', () => {
    let state: GameState = { ...readyToAct(), longestRoadPlayerId: 'player-0' };
    for (let i = 0; i < 5; i++) state = withScoringRefreshed(state);
    // The holder is recomputed from the board each time; with no roads it is dropped.
    expect(getVictoryPointBreakdown(state, 'player-0').longestRoad).toBe(0);
  });

  it('counts Largest Army once, however often scoring is refreshed', () => {
    let state = givePlayedKnights(readyToAct(), 'player-0', 3);
    for (let i = 0; i < 5; i++) state = withScoringRefreshed(state);
    expect(getVictoryPointBreakdown(state, 'player-0').largestArmy).toBe(2);
    expect(calculateVictoryPoints(state, 'player-0')).toBe(2);
  });
});

describe('hidden victory point cards', () => {
  it('are excluded from the public score but included in the true total', () => {
    let state = withBuildings(readyToAct(), 'player-0', 0, 2); // 4 public
    state = giveDevelopmentCard(state, 'player-0', 'victoryPoint');
    state = giveDevelopmentCard(state, 'player-0', 'victoryPoint');
    state = withScoringRefreshed(state);

    expect(state.players[0].victoryPoints).toBe(4); // public field
    expect(getVictoryPointBreakdown(state, 'player-0').publicTotal).toBe(4);
    expect(calculateVictoryPoints(state, 'player-0')).toBe(6);
  });
});

describe('largest army', () => {
  it('does not qualify below three knights', () => {
    expect(calculateLargestArmy(givePlayedKnights(readyToAct(), 'player-0', 0))).toBeNull();
    expect(calculateLargestArmy(givePlayedKnights(readyToAct(), 'player-0', 2))).toBeNull();
  });

  it('qualifies at three knights', () => {
    expect(calculateLargestArmy(givePlayedKnights(readyToAct(), 'player-0', 3))).toBe('player-0');
  });

  it('prefers four knights over three', () => {
    let state = givePlayedKnights(readyToAct(), 'player-0', 3);
    state = givePlayedKnights(state, 'player-1', 4);
    expect(calculateLargestArmy(state)).toBe('player-1');
  });

  it('keeps the card with the incumbent on a tie', () => {
    let state = givePlayedKnights(readyToAct(), 'player-0', 3);
    state = { ...state, largestArmyPlayerId: 'player-0' };
    state = givePlayedKnights(state, 'player-1', 3);
    expect(calculateLargestArmy(state)).toBe('player-0');
  });

  it('transfers when a challenger strictly exceeds the incumbent', () => {
    let state = givePlayedKnights(readyToAct(), 'player-0', 3);
    state = { ...state, largestArmyPlayerId: 'player-0' };
    state = givePlayedKnights(state, 'player-1', 4);
    expect(calculateLargestArmy(state)).toBe('player-1');
  });

  it('strips the card if the incumbent no longer qualifies', () => {
    // Knights cannot really be lost, but the holder must never outlive their claim.
    const state: GameState = { ...readyToAct(), largestArmyPlayerId: 'player-0' };
    expect(calculateLargestArmy(state)).toBeNull();
  });
});

describe('winning the game', () => {
  /** Nine points: four cities (8) plus one settlement (1). */
  function nineVictoryPoints(): GameState {
    const state = withBuildings(readyToAct(), 'player-0', 1, 4);
    const scored = withScoringRefreshed(state);
    expect(calculateVictoryPoints(scored, 'player-0')).toBe(9);
    return scored;
  }

  it('does not end the game at nine points', () => {
    const state = nineVictoryPoints();
    expect(checkVictoryCondition(state, 'player-0')).toBe(false);
    expect(state.phase).toBe('PLAYING');
  });

  it('ends the game when a settlement takes the player to ten', () => {
    let state = nineVictoryPoints();
    // A road to build from, plus the resources for the settlement.
    const target = state.board.intersections.find(
      (i) =>
        !i.building &&
        i.intersectionIds.every(
          (n) => !state.board.intersections.find((x) => x.id === n)?.building
        )
    )!;
    state = placeRoad(state, 'player-0', target.edgeIds[0], { free: true });
    state = giveResources(state, 'player-0', { brick: 1, lumber: 1, wool: 1, grain: 1 });

    const won = expectOk(
      applyAction(state, {
        type: 'BUILD_SETTLEMENT',
        playerId: 'player-0',
        intersectionId: target.id,
      })
    );

    expect(calculateVictoryPoints(won, 'player-0')).toBe(VICTORY_POINT_TARGET);
    expect(won.phase).toBe('GAME_OVER');
    expect(won.winnerId).toBe('player-0');
    expect(won.eventLog.some((e) => e.type === 'GAME_WON')).toBe(true);
    expect(won.eventLog.some((e) => e.message === 'Game Over.')).toBe(true);
  });

  it('ends the game when a Victory Point card takes the player to ten', () => {
    let state = nineVictoryPoints();
    state = giveResources(state, 'player-0', { wool: 1, grain: 1, ore: 1 });
    // Force a Victory Point card to the top of the deck.
    state = {
      ...state,
      developmentDeck: [
        { id: 'top-vp', type: 'victoryPoint', acquiredTurnNumber: 0 },
        ...state.developmentDeck,
      ],
    };

    const won = expectOk(
      applyAction(state, { type: 'BUY_DEVELOPMENT_CARD', playerId: 'player-0' })
    );

    expect(won.phase).toBe('GAME_OVER');
    expect(won.winnerId).toBe('player-0');
    // The card stays in hand, hidden, but counted.
    expect(won.players[0].victoryPoints).toBe(9); // public unchanged
    expect(calculateVictoryPoints(won, 'player-0')).toBe(10);
  });

  it('ends the game when Largest Army takes the player to ten', () => {
    // Eight public points, then a third knight for +2.
    let state = withBuildings(readyToAct(), 'player-0', 0, 4); // 8
    state = givePlayedKnights(state, 'player-0', 2);
    state = giveDevelopmentCard(state, 'player-0', 'knight');
    state = withScoringRefreshed(state);
    expect(calculateVictoryPoints(state, 'player-0')).toBe(8);

    const won = expectOk(applyAction(state, { type: 'PLAY_KNIGHT', playerId: 'player-0' }));

    expect(won.largestArmyPlayerId).toBe('player-0');
    expect(calculateVictoryPoints(won, 'player-0')).toBe(10);
    expect(won.phase).toBe('GAME_OVER');
    expect(won.winnerId).toBe('player-0');
  });

  it('rejects every action once the game is over', () => {
    let state = nineVictoryPoints();
    state = { ...state, phase: 'GAME_OVER', winnerId: 'player-0' };

    const attempts = [
      { type: 'ROLL_DICE' as const, playerId: 'player-0' },
      { type: 'END_TURN' as const, playerId: 'player-0' },
      { type: 'BUY_DEVELOPMENT_CARD' as const, playerId: 'player-0' },
      { type: 'PLAY_KNIGHT' as const, playerId: 'player-0' },
      { type: 'BUILD_ROAD' as const, playerId: 'player-0', edgeId: state.board.edges[0].id },
      {
        type: 'BUILD_SETTLEMENT' as const,
        playerId: 'player-0',
        intersectionId: state.board.intersections[0].id,
      },
      {
        type: 'MOVE_ROBBER' as const,
        playerId: 'player-0',
        hexId: state.board.hexes[1].id,
      },
      {
        type: 'BANK_TRADE' as const,
        playerId: 'player-0',
        give: 'brick' as const,
        receive: 'ore' as const,
      },
    ];

    for (const action of attempts) {
      const result = applyAction(state, action);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('GAME_OVER');
    }
  });

  it('does not let a player win on somebody else’s turn', () => {
    // player-1 is sitting on 10 points but it is player-0's turn.
    let state = withBuildings(readyToAct(), 'player-1', 1, 4); // 9
    state = giveDevelopmentCard(state, 'player-1', 'victoryPoint'); // 10
    state = withScoringRefreshed(state);
    expect(calculateVictoryPoints(state, 'player-1')).toBe(10);

    const acted = expectOk(applyAction(state, { type: 'END_TURN', playerId: 'player-0' }));
    expect(acted.phase).toBe('PLAYING');
    expect(acted.winnerId).toBeNull();
  });
});

describe('longest road integration', () => {
  it('transfers Longest Road when an opponent severs the leader’s network', () => {
    let state = readyToAct();

    // Player A: an 8-road acyclic chain.
    const chainA = buildAcyclicChain(state, 'player-0', 8, 0);
    state = chainA.state;
    state = withScoringRefreshed(state);
    expect(state.longestRoadPlayerId).toBe('player-0');
    expect(state.players[0].victoryPoints).toBe(LONGEST_ROAD_VP);

    // Player B: a separate 5-road chain, not yet enough to take the card.
    const chainB = buildAcyclicChain(state, 'player-1', 5, 45);
    state = withScoringRefreshed(chainB.state);
    expect(state.longestRoadPlayerId).toBe('player-0');

    // B settles in the middle of A's chain, cutting it below B's length.
    state = placeBuilding(state, 'player-1', chainA.nodes[4], 'settlement', { free: true });
    state = withScoringRefreshed(state);

    expect(state.longestRoadPlayerId).toBe('player-1');
    expect(state.players[0].victoryPoints).toBe(0); // A lost the bonus
    expect(getVictoryPointBreakdown(state, 'player-1').longestRoad).toBe(2);
  });
});

describe('largest army integration', () => {
  it('transfers Largest Army and moves the two points with it', () => {
    let state = readyToAct();
    state = givePlayedKnights(state, 'player-0', 3);
    state = givePlayedKnights(state, 'player-1', 2);
    state = withScoringRefreshed(state);

    expect(state.largestArmyPlayerId).toBe('player-0');
    expect(state.players[0].victoryPoints).toBe(LARGEST_ARMY_VP);
    expect(state.players[1].victoryPoints).toBe(0);

    // player-1 plays two more knights on their own turns, reaching 4.
    state = givePlayedKnights(state, 'player-1', 2);
    state = withScoringRefreshed(state);

    expect(state.largestArmyPlayerId).toBe('player-1');
    expect(state.players[0].victoryPoints).toBe(0);
    expect(state.players[1].victoryPoints).toBe(LARGEST_ARMY_VP);
  });
});

/** Local copy of the acyclic chain builder used by the longest-road suite. */
function buildAcyclicChain(
  state: GameState,
  playerId: string,
  length: number,
  startEdgeIndex: number
): { state: GameState; nodes: string[] } {
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
        const far =
          e.intersectionIds[0] === current ? e.intersectionIds[1] : e.intersectionIds[0];
        return !nodes.includes(far);
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

  return { state: next, nodes };
}
