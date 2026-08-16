import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import { placeBuilding, placeRoad } from '../engine/construction';
import { getValidRoadLocations } from '../rules/placement';
import type { GameState } from '../models/types';
import {
  expectOk,
  giveDevelopmentCard,
  giveResources,
  readyToAct,
} from './helpers';

const NO_RESOURCES = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };

describe('Monopoly', () => {
  it('collects the chosen resource from every opponent', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'monopoly');
    game = giveResources(game, 'player-0', { lumber: 1 });
    game = giveResources(game, 'player-1', { lumber: 3, ore: 2 });
    game = giveResources(game, 'player-2', { lumber: 2 });

    const played = expectOk(
      applyAction(game, { type: 'PLAY_MONOPOLY', playerId: 'player-0', resource: 'lumber' })
    );

    expect(played.players[0].resources.lumber).toBe(6); // 1 held + 3 + 2
    expect(played.players[1].resources.lumber).toBe(0);
    expect(played.players[2].resources.lumber).toBe(0);
    // Other resources are untouched.
    expect(played.players[1].resources.ore).toBe(2);
  });

  it('consumes the card', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'monopoly');

    const played = expectOk(
      applyAction(game, { type: 'PLAY_MONOPOLY', playerId: 'player-0', resource: 'wool' })
    );
    expect(played.players[0].developmentCards).toHaveLength(0);
    expect(played.players[0].playedDevelopmentCards).toHaveLength(1);
  });

  it('collects nothing when no opponent holds the resource', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'monopoly');

    const played = expectOk(
      applyAction(game, { type: 'PLAY_MONOPOLY', playerId: 'player-0', resource: 'grain' })
    );
    expect(played.players[0].resources).toEqual(NO_RESOURCES);
  });

  it('matches the acceptance scenario: 2 + 3 + 1 lumber collected', () => {
    let game = readyToAct(['Sai', 'Rahul', 'Ananya', 'Karthik']);
    game = giveDevelopmentCard(game, 'player-0', 'monopoly');
    game = giveResources(game, 'player-1', { lumber: 2 });
    game = giveResources(game, 'player-2', { lumber: 3 });
    game = giveResources(game, 'player-3', { lumber: 1 });

    const played = expectOk(
      applyAction(game, { type: 'PLAY_MONOPOLY', playerId: 'player-0', resource: 'lumber' })
    );
    expect(played.players[0].resources.lumber).toBe(6);
  });

  it('rejects playing Monopoly without the card', () => {
    const game = readyToAct();
    const result = applyAction(game, {
      type: 'PLAY_MONOPOLY',
      playerId: 'player-0',
      resource: 'ore',
    });
    expect(result.ok).toBe(false);
  });
});

describe('Year of Plenty', () => {
  it('adds two of the same resource', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'yearOfPlenty');

    const played = expectOk(
      applyAction(game, {
        type: 'PLAY_YEAR_OF_PLENTY',
        playerId: 'player-0',
        selection: { ore: 2 },
      })
    );
    expect(played.players[0].resources.ore).toBe(2);
    expect(played.players[0].developmentCards).toHaveLength(0);
  });

  it('adds two different resources', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'yearOfPlenty');

    const played = expectOk(
      applyAction(game, {
        type: 'PLAY_YEAR_OF_PLENTY',
        playerId: 'player-0',
        selection: { ore: 1, grain: 1 },
      })
    );
    expect(played.players[0].resources.ore).toBe(1);
    expect(played.players[0].resources.grain).toBe(1);
  });

  it('rejects a selection that is not exactly two cards', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'yearOfPlenty');

    for (const bad of [{ ore: 1 }, { ore: 3 }, {}, { ore: 2, grain: 1 }]) {
      const result = applyAction(game, {
        type: 'PLAY_YEAR_OF_PLENTY',
        playerId: 'player-0',
        selection: bad,
      });
      expect(result.ok).toBe(false);
    }
  });

  it('does not consume the card when the selection is invalid', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'yearOfPlenty');

    const result = applyAction(game, {
      type: 'PLAY_YEAR_OF_PLENTY',
      playerId: 'player-0',
      selection: { ore: 5 },
    });
    expect(result.ok).toBe(false);
    expect(game.players[0].developmentCards).toHaveLength(1);
  });
});

describe('Road Building', () => {
  /** A game where player-0 owns a settlement and road, so roads can extend. */
  function withNetwork(): GameState {
    let game = readyToAct();
    const intersection = game.board.intersections.find((i) => i.edgeIds.length >= 2)!;
    game = placeBuilding(game, 'player-0', intersection.id, 'settlement', { free: true });
    game = placeRoad(game, 'player-0', intersection.edgeIds[0], { free: true });
    return giveDevelopmentCard(game, 'player-0', 'roadBuilding');
  }

  it('enters road-building mode owing two roads', () => {
    const game = withNetwork();
    const played = expectOk(
      applyAction(game, { type: 'PLAY_ROAD_BUILDING', playerId: 'player-0' })
    );
    expect(played.turnPhase).toBe('ROAD_BUILDING');
    expect(played.roadBuildingRoadsRemaining).toBe(2);
    expect(played.players[0].developmentCards).toHaveLength(0);
  });

  it('places two roads free of charge', () => {
    let game = withNetwork();
    game = expectOk(applyAction(game, { type: 'PLAY_ROAD_BUILDING', playerId: 'player-0' }));

    const roadsBefore = game.players[0].piecesRemaining.road;
    expect(game.players[0].resources).toEqual(NO_RESOURCES);

    const first = getValidRoadLocations(game, 'player-0')[0];
    game = expectOk(applyAction(game, { type: 'BUILD_ROAD', playerId: 'player-0', edgeId: first }));
    expect(game.turnPhase).toBe('ROAD_BUILDING');
    expect(game.roadBuildingRoadsRemaining).toBe(1);

    const second = getValidRoadLocations(game, 'player-0')[0];
    game = expectOk(
      applyAction(game, { type: 'BUILD_ROAD', playerId: 'player-0', edgeId: second })
    );

    // Free: no resources spent, but the pieces are consumed.
    expect(game.players[0].resources).toEqual(NO_RESOURCES);
    expect(game.players[0].piecesRemaining.road).toBe(roadsBefore - 2);
    expect(game.turnPhase).toBe('AWAITING_ACTIONS');
    expect(game.roadBuildingRoadsRemaining).toBe(0);
  });

  it('still enforces road connectivity for the free roads', () => {
    let game = withNetwork();
    game = expectOk(applyAction(game, { type: 'PLAY_ROAD_BUILDING', playerId: 'player-0' }));

    const disconnected = game.board.edges.find(
      (e) => !getValidRoadLocations(game, 'player-0').includes(e.id) && !e.road
    )!;
    const result = applyAction(game, {
      type: 'BUILD_ROAD',
      playerId: 'player-0',
      edgeId: disconnected.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ILLEGAL_PLACEMENT');
  });

  it('grants only one road when one piece remains', () => {
    let game = withNetwork();
    game = {
      ...game,
      players: game.players.map((p) =>
        p.id === 'player-0'
          ? { ...p, piecesRemaining: { ...p.piecesRemaining, road: 1 } }
          : p
      ),
    };
    game = expectOk(applyAction(game, { type: 'PLAY_ROAD_BUILDING', playerId: 'player-0' }));
    expect(game.roadBuildingRoadsRemaining).toBe(1);

    const edge = getValidRoadLocations(game, 'player-0')[0];
    game = expectOk(applyAction(game, { type: 'BUILD_ROAD', playerId: 'player-0', edgeId: edge }));

    expect(game.players[0].piecesRemaining.road).toBe(0);
    expect(game.turnPhase).toBe('AWAITING_ACTIONS');
  });

  it('grants no roads when no pieces remain, but still spends the card', () => {
    let game = withNetwork();
    game = {
      ...game,
      players: game.players.map((p) =>
        p.id === 'player-0'
          ? { ...p, piecesRemaining: { ...p.piecesRemaining, road: 0 } }
          : p
      ),
    };
    game = expectOk(applyAction(game, { type: 'PLAY_ROAD_BUILDING', playerId: 'player-0' }));

    expect(game.turnPhase).toBe('AWAITING_ACTIONS');
    expect(game.roadBuildingRoadsRemaining).toBe(0);
    expect(game.players[0].developmentCards).toHaveLength(0);
  });

  it('blocks unrelated builds until the free roads are placed', () => {
    let game = withNetwork();
    game = giveResources(game, 'player-0', { ore: 5, grain: 5 });
    game = expectOk(applyAction(game, { type: 'PLAY_ROAD_BUILDING', playerId: 'player-0' }));

    const ownSettlement = game.board.intersections.find(
      (i) => i.building?.ownerId === 'player-0'
    )!;
    const result = applyAction(game, {
      type: 'BUILD_CITY',
      playerId: 'player-0',
      intersectionId: ownSettlement.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/Road Building roads first/i);
  });

  it('blocks ending the turn until the free roads are placed', () => {
    let game = withNetwork();
    game = expectOk(applyAction(game, { type: 'PLAY_ROAD_BUILDING', playerId: 'player-0' }));

    const result = applyAction(game, { type: 'END_TURN', playerId: 'player-0' });
    expect(result.ok).toBe(false);
  });
});
