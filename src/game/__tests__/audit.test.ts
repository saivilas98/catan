// Subsystem audits for Sprint 7: production, trade, robber flow, development cards
// and the two bonus races, each pushed at its documented edge cases.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import { placeBuilding, placeRoad } from '../engine/construction';
import { devPlaceBuilding } from '../engine/devTools';
import { validateResources, validateGameState } from '../rules/invariants';
import { getProductionAwards } from '../engine/production';
import { calculateLongestRoadLength, getLongestRoadHolder } from '../rules/longestRoad';
import { calculateLargestArmy } from '../rules/development';
import { getBestTradeRate } from '../rules/trade';
import { TERRAIN_TO_RESOURCE } from '../models/types';
import type { GameState, TerrainType } from '../models/types';
import {
  createPlayingGame,
  expectOk,
  giveDevelopmentCard,
  givePlayedKnights,
  giveResources,
  readyToAct,
  rollAs,
  runFullSetup,
  THREE_PLAYERS,
} from './helpers';

/** Rewrites a hex's terrain and number so production can be tested exactly. */
function retile(
  state: GameState,
  hexId: string,
  terrain: TerrainType,
  numberToken: number | null
): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      hexes: state.board.hexes.map((hex) =>
        hex.id === hexId
          ? { ...hex, terrain, resource: TERRAIN_TO_RESOURCE[terrain], numberToken }
          : hex
      ),
    },
  };
}

describe('audit: terrain to resource, every type', () => {
  const cases: Array<[TerrainType, string]> = [
    ['hills', 'brick'],
    ['forest', 'lumber'],
    ['pasture', 'wool'],
    ['fields', 'grain'],
    ['mountains', 'ore'],
  ];

  for (const [terrain, resource] of cases) {
    it(`${terrain} yields 1 ${resource} for a settlement and 2 for a city`, () => {
      const base = createPlayingGame();
      const hex = base.board.hexes[4];
      const tiled = retile(base, hex.id, terrain, 5);

      const withSettlement = placeBuilding(
        tiled,
        'player-0',
        hex.intersectionIds[0],
        'settlement',
        { free: true }
      );
      const settlementAwards = getProductionAwards(withSettlement, 5).filter(
        (a) => a.hexId === hex.id
      );
      expect(settlementAwards).toHaveLength(1);
      expect(settlementAwards[0].resource).toBe(resource);
      expect(settlementAwards[0].amount).toBe(1);

      const withCity = placeBuilding(tiled, 'player-0', hex.intersectionIds[0], 'city', {
        free: true,
      });
      const cityAwards = getProductionAwards(withCity, 5).filter((a) => a.hexId === hex.id);
      expect(cityAwards[0].amount).toBe(2);
    });
  }

  it('desert never produces', () => {
    const base = createPlayingGame();
    const desert = base.board.hexes.find((h) => h.terrain === 'desert')!;
    const withSettlement = placeBuilding(
      base,
      'player-0',
      desert.intersectionIds[0],
      'settlement',
      { free: true }
    );
    for (let n = 2; n <= 12; n++) {
      expect(getProductionAwards(withSettlement, n).some((a) => a.hexId === desert.id)).toBe(
        false
      );
    }
  });
});

describe('audit: multi-hex production', () => {
  it('pays one card per adjacent hex sharing the rolled number', () => {
    const base = createPlayingGame();
    const corner = base.board.intersections.find((i) => i.hexIds.length === 3)!;
    const [a, b, c] = corner.hexIds;

    let state = retile(base, a, 'forest', 8);
    state = retile(state, b, 'fields', 8);
    state = retile(state, c, 'mountains', 8);
    state = placeBuilding(state, 'player-0', corner.id, 'settlement', { free: true });

    const awards = getProductionAwards(state, 8).filter((x) => x.playerId === 'player-0');
    expect(awards).toHaveLength(3);
    expect(awards.map((x) => x.resource).sort()).toEqual(['grain', 'lumber', 'ore']);

    const rolled = rollAs(state, 4, 4);
    expect(rolled.players[0].resources.lumber).toBe(1);
    expect(rolled.players[0].resources.grain).toBe(1);
    expect(rolled.players[0].resources.ore).toBe(1);
  });
});

describe('audit: several players on one hex', () => {
  it('pays every adjacent owner, and 2 once one upgrades to a city', () => {
    const base = createPlayingGame();
    const hex = base.board.hexes.find((h) => h.terrain !== 'desert')!;
    let state = retile(base, hex.id, 'forest', 9);
    state = placeBuilding(state, 'player-0', hex.intersectionIds[0], 'settlement', {
      free: true,
    });
    state = placeBuilding(state, 'player-1', hex.intersectionIds[2], 'settlement', {
      free: true,
    });

    const first = rollAs(state, 4, 5);
    expect(first.players[0].resources.lumber).toBe(1);
    expect(first.players[1].resources.lumber).toBe(1);

    // Upgrade player-0 and roll again on a fresh turn.
    const upgraded = placeBuilding(
      { ...first, hasRolledThisTurn: false, turnPhase: 'AWAITING_ROLL' },
      'player-0',
      hex.intersectionIds[0],
      'city',
      { free: true }
    );
    const second = rollAs(upgraded, 4, 5);
    expect(second.players[0].resources.lumber).toBe(1 + 2);
    expect(second.players[1].resources.lumber).toBe(1 + 1);
  });
});

describe('audit: robber blocks exactly one hex', () => {
  it('silences its own hex while other hexes with the same number still pay', () => {
    const base = createPlayingGame();
    const [hexA, hexB] = base.board.hexes.filter((h) => h.terrain !== 'desert');

    // Clear every other 8 on the board so only these two hexes can pay out.
    let state: GameState = {
      ...base,
      board: {
        ...base.board,
        hexes: base.board.hexes.map((hex) =>
          hex.numberToken === 8 && hex.id !== hexA.id && hex.id !== hexB.id
            ? { ...hex, numberToken: 3 }
            : hex
        ),
      },
    };

    state = retile(state, hexA.id, 'forest', 8);
    state = retile(state, hexB.id, 'fields', 8);
    state = placeBuilding(state, 'player-0', hexA.intersectionIds[0], 'settlement', {
      free: true,
    });
    state = placeBuilding(state, 'player-0', hexB.intersectionIds[3], 'settlement', {
      free: true,
    });
    state = { ...state, robberHexId: hexA.id };

    const rolled = rollAs(state, 4, 4);
    expect(rolled.players[0].resources.lumber).toBe(0); // blocked
    expect(rolled.players[0].resources.grain).toBe(1); // unaffected
  });
});

describe('audit: resources stay valid through every mutating action', () => {
  it('never goes negative across production, building, trading, discard and steal', () => {
    let game = runFullSetup(THREE_PLAYERS, 9);

    for (let turn = 0; turn < 12; turn++) {
      const playerId = game.currentPlayerId;
      game = rollAs(game, turn % 3 === 2 ? 3 : 2, turn % 3 === 2 ? 4 : 3);
      expect(validateResources(game).valid).toBe(true);

      while (game.turnPhase === 'DISCARDING') {
        const requirement = game.pendingDiscards[0];
        const player = game.players.find((p) => p.id === requirement.playerId)!;
        const selection: Record<string, number> = {};
        let left = requirement.required;
        for (const [resource, held] of Object.entries(player.resources)) {
          if (left <= 0) break;
          const take = Math.min(left, held as number);
          if (take > 0) {
            selection[resource] = take;
            left -= take;
          }
        }
        game = expectOk(
          applyAction(game, {
            type: 'DISCARD_RESOURCES',
            playerId: requirement.playerId,
            selection,
          })
        );
        expect(validateResources(game).valid).toBe(true);
      }

      if (game.turnPhase === 'MOVING_ROBBER') {
        const hexId = game.board.hexes.find((h) => h.id !== game.robberHexId)!.id;
        game = expectOk(applyAction(game, { type: 'MOVE_ROBBER', playerId, hexId }));
        expect(validateResources(game).valid).toBe(true);
      }
      if (game.turnPhase === 'STEALING') {
        game = expectOk(
          applyAction(game, {
            type: 'STEAL_RESOURCE',
            playerId,
            victimId: game.stealCandidateIds[0],
          })
        );
        expect(validateResources(game).valid).toBe(true);
      }

      // Bank trade and a build whenever affordable.
      game = giveResources(game, playerId, { brick: 4, lumber: 4, wool: 2, grain: 2, ore: 3 });
      game = expectOk(applyAction(game, { type: 'BANK_TRADE', playerId, give: 'brick', receive: 'ore' }));
      expect(validateResources(game).valid).toBe(true);

      game = expectOk(applyAction(game, { type: 'END_TURN', playerId }));
      expect(validateResources(game).valid).toBe(true);
    }

    expect(validateGameState(game).valid).toBe(true);
  });
});

describe('audit: double-spending across pending offers', () => {
  it('refuses the second offer once the first has consumed the resources', () => {
    let game = readyToAct();
    game = giveResources(game, 'player-0', { lumber: 3 });
    game = giveResources(game, 'player-1', { ore: 2 });
    game = giveResources(game, 'player-2', { wool: 2 });

    game = expectOk(
      applyAction(game, {
        type: 'PROPOSE_TRADE',
        playerId: 'player-0',
        targetPlayerId: 'player-1',
        offeredResources: { lumber: 2 },
        requestedResources: { ore: 1 },
      })
    );
    game = expectOk(
      applyAction(game, {
        type: 'PROPOSE_TRADE',
        playerId: 'player-0',
        targetPlayerId: 'player-2',
        offeredResources: { lumber: 2 },
        requestedResources: { wool: 1 },
      })
    );
    const [offerA, offerB] = game.tradeOffers;

    game = expectOk(
      applyAction(game, { type: 'ACCEPT_TRADE', playerId: 'player-1', tradeId: offerA.id })
    );
    expect(game.players[0].resources.lumber).toBe(1);

    const second = applyAction(game, {
      type: 'ACCEPT_TRADE',
      playerId: 'player-2',
      tradeId: offerB.id,
    });
    expect(second.ok).toBe(false);
    expect(game.players[0].resources.lumber).toBe(1); // untouched
    expect(validateResources(game).valid).toBe(true);
  });
});

describe('audit: the 7 sequence in exact order', () => {
  it('discards from every over-limit player, then robber, then steal, then actions', () => {
    let game = runFullSetup(THREE_PLAYERS, 1);
    const me = game.currentPlayerId;

    // A: 8 cards -> 4, B: 7 cards -> none, C: 12 cards -> 6.
    game = giveResources(game, 'player-0', { brick: 8, lumber: 0, wool: 0, grain: 0, ore: 0 });
    game = giveResources(game, 'player-1', { brick: 7, lumber: 0, wool: 0, grain: 0, ore: 0 });
    game = giveResources(game, 'player-2', { brick: 12, lumber: 0, wool: 0, grain: 0, ore: 0 });

    game = rollAs(game, 3, 4);
    expect(game.turnPhase).toBe('DISCARDING');
    expect(game.pendingDiscards).toEqual([
      { playerId: 'player-0', required: 4 },
      { playerId: 'player-2', required: 6 },
    ]);

    // The robber stays blocked until the last discard is in.
    game = expectOk(
      applyAction(game, {
        type: 'DISCARD_RESOURCES',
        playerId: 'player-0',
        selection: { brick: 4 },
      })
    );
    expect(game.turnPhase).toBe('DISCARDING');
    const blocked = applyAction(game, {
      type: 'MOVE_ROBBER',
      playerId: me,
      hexId: game.board.hexes[0].id,
    });
    expect(blocked.ok).toBe(false);

    game = expectOk(
      applyAction(game, {
        type: 'DISCARD_RESOURCES',
        playerId: 'player-2',
        selection: { brick: 6 },
      })
    );
    expect(game.turnPhase).toBe('MOVING_ROBBER');
    expect(game.players[0].resources.brick).toBe(4);
    expect(game.players[1].resources.brick).toBe(7); // untouched
    expect(game.players[2].resources.brick).toBe(6);

    // Robber onto a hex with two robbable opponents -> a choice is required.
    const hex = game.board.hexes.find((h) => h.id !== game.robberHexId)!;
    game = devPlaceBuilding(game, hex.intersectionIds[0], 'player-1', 'settlement');
    game = devPlaceBuilding(game, hex.intersectionIds[2], 'player-2', 'settlement');
    game = expectOk(applyAction(game, { type: 'MOVE_ROBBER', playerId: me, hexId: hex.id }));
    expect(game.turnPhase).toBe('STEALING');

    game = expectOk(
      applyAction(
        game,
        { type: 'STEAL_RESOURCE', playerId: me, victimId: 'player-1' },
        { stealRng: () => 0 }
      )
    );
    expect(game.turnPhase).toBe('AWAITING_ACTIONS');
    expect(game.players[1].resources.brick).toBe(6); // lost exactly one
    expect(validateGameState(game).valid).toBe(true);
  });
});

describe('audit: longest road transfers back and forth', () => {
  function chain(
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

  it('moves to a longer challenger, then back when that network is cut', () => {
    let game = readyToAct();

    const a = chain(game, 'player-0', 7, 0);
    game = a.state;
    game = { ...game, longestRoadPlayerId: getLongestRoadHolder(game).playerId };
    expect(game.longestRoadPlayerId).toBe('player-0');

    // player-1 builds 8 and takes it.
    const b = chain(game, 'player-1', 8, 45);
    game = b.state;
    expect(calculateLongestRoadLength(game, 'player-1')).toBe(8);
    game = { ...game, longestRoadPlayerId: getLongestRoadHolder(game).playerId };
    expect(game.longestRoadPlayerId).toBe('player-1');

    // player-0 cuts player-1's chain in the middle; the card returns to player-0.
    game = placeBuilding(game, 'player-0', b.nodes[4], 'settlement', { free: true });
    const afterCut = calculateLongestRoadLength(game, 'player-1');
    expect(afterCut).toBeLessThan(7);
    expect(getLongestRoadHolder(game).playerId).toBe('player-0');
  });
});

describe('audit: largest army race', () => {
  it('follows first-to-three, then strictly-more, keeping ties with the holder', () => {
    let game = readyToAct();
    game = givePlayedKnights(game, 'player-0', 3);
    game = { ...game, largestArmyPlayerId: calculateLargestArmy(game) };
    expect(game.largestArmyPlayerId).toBe('player-0');

    // A tie at 3 leaves it with player-0.
    game = givePlayedKnights(game, 'player-1', 3);
    expect(calculateLargestArmy(game)).toBe('player-0');

    // player-1 reaches 4 and takes it.
    game = givePlayedKnights(game, 'player-1', 1);
    game = { ...game, largestArmyPlayerId: calculateLargestArmy(game) };
    expect(game.largestArmyPlayerId).toBe('player-1');

    // player-0 matching at 4 does NOT take it back.
    game = givePlayedKnights(game, 'player-0', 1);
    expect(calculateLargestArmy(game)).toBe('player-1');
  });
});

describe('audit: development card timing and deck', () => {
  it('refuses a card bought this turn but allows it next turn', () => {
    let game = runFullSetup(THREE_PLAYERS, 2);
    const me = game.currentPlayerId;
    game = rollAs(game, 2, 3);
    game = giveResources(game, me, { wool: 2, grain: 2, ore: 2 });
    game = {
      ...game,
      developmentDeck: [
        { id: 'top-knight', type: 'knight', acquiredTurnNumber: 0 },
        ...game.developmentDeck,
      ],
    };
    game = expectOk(applyAction(game, { type: 'BUY_DEVELOPMENT_CARD', playerId: me }));

    expect(applyAction(game, { type: 'PLAY_KNIGHT', playerId: me }).ok).toBe(false);

    // Round the table back to the same player.
    game = expectOk(applyAction(game, { type: 'END_TURN', playerId: me }));
    for (let i = 0; i < 2; i++) {
      game = rollAs(game, 2, 3);
      game = expectOk(applyAction(game, { type: 'END_TURN', playerId: game.currentPlayerId }));
    }
    game = rollAs(game, 2, 3);
    expect(game.currentPlayerId).toBe(me);
    expect(applyAction(game, { type: 'PLAY_KNIGHT', playerId: me }).ok).toBe(true);
  });

  it('runs the deck to exactly empty and then refuses to sell', () => {
    let game = readyToAct();
    const me = game.currentPlayerId;
    const deckSize = game.developmentDeck.length;

    for (let i = 0; i < deckSize; i++) {
      game = giveResources(game, me, { wool: 1, grain: 1, ore: 1 });
      game = expectOk(applyAction(game, { type: 'BUY_DEVELOPMENT_CARD', playerId: me }));
    }
    expect(game.developmentDeck).toHaveLength(0);
    expect(game.players[0].developmentCards).toHaveLength(deckSize);

    game = giveResources(game, me, { wool: 1, grain: 1, ore: 1 });
    const result = applyAction(game, { type: 'BUY_DEVELOPMENT_CARD', playerId: me });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/deck is empty/i);
  });
});

describe('audit: monopoly and year of plenty edges', () => {
  it('monopoly leaves the caster’s own stock alone and handles empty opponents', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'monopoly');
    game = giveResources(game, 'player-0', { lumber: 2 });
    game = giveResources(game, 'player-1', { lumber: 4 });
    // player-2 holds none.

    const played = expectOk(
      applyAction(game, { type: 'PLAY_MONOPOLY', playerId: 'player-0', resource: 'lumber' })
    );
    expect(played.players[0].resources.lumber).toBe(6); // own 2 kept + 4 taken
    expect(played.players[1].resources.lumber).toBe(0);
    expect(played.players[2].resources.lumber).toBe(0);
    expect(validateResources(played).valid).toBe(true);
  });

  it('year of plenty refuses anything other than exactly two cards', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'yearOfPlenty');
    for (const bad of [{}, { ore: 1 }, { ore: 3 }, { ore: 2, wool: 1 }, { ore: -1, wool: 3 }]) {
      expect(
        applyAction(game, { type: 'PLAY_YEAR_OF_PLENTY', playerId: 'player-0', selection: bad })
          .ok
      ).toBe(false);
    }
    expect(game.players[0].developmentCards).toHaveLength(1); // never consumed
  });
});

describe('audit: port rates', () => {
  it('uses 4:1 with no port, 3:1 generic, and 2:1 only for the matching resource', () => {
    let game = readyToAct();
    expect(getBestTradeRate(game, 'player-0', 'brick')).toBe(4);

    const generic = game.board.ports.find((p) => p.type === 'GENERIC_3_TO_1')!;
    game = devPlaceBuilding(game, generic.intersectionIds[0], 'player-0', 'settlement');
    expect(getBestTradeRate(game, 'player-0', 'brick')).toBe(3);

    const specific = game.board.ports.find((p) => p.type === 'RESOURCE_2_TO_1')!;
    game = devPlaceBuilding(game, specific.intersectionIds[0], 'player-0', 'settlement');
    expect(getBestTradeRate(game, 'player-0', specific.resource!)).toBe(2);

    const other = (['brick', 'lumber', 'wool', 'grain', 'ore'] as const).find(
      (r) => r !== specific.resource
    )!;
    expect(getBestTradeRate(game, 'player-0', other)).toBe(3); // generic, never 2
  });
});
