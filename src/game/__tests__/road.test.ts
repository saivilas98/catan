import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import { placeBuilding, placeRoad } from '../engine/construction';
import { canBuildRoad } from '../rules/placement';
import { PIECE_COSTS } from '../models/types';
import type { Edge, GameState } from '../models/types';
import { createPlayingGame, expectOk, giveResources, rollAs } from './helpers';

const ROAD_COST = { brick: 1, lumber: 1 };

function edgesOf(game: GameState, intersectionId: string): Edge[] {
  const intersection = game.board.intersections.find((i) => i.id === intersectionId)!;
  return intersection.edgeIds.map((id) => game.board.edges.find((e) => e.id === id)!);
}

/** Two edges that share one intersection — the shape every connectivity test needs. */
function findEdgePair(game: GameState): {
  shared: string;
  edgeA: Edge;
  edgeB: Edge;
} {
  const intersection = game.board.intersections.find((i) => i.edgeIds.length >= 2)!;
  const [edgeA, edgeB] = edgesOf(game, intersection.id);
  return { shared: intersection.id, edgeA, edgeB };
}

describe('road placement rules', () => {
  it('allows a road on an empty edge connected to your settlement', () => {
    const base = rollAs(createPlayingGame(), 1, 2);
    const { shared, edgeA } = findEdgePair(base);
    let game = placeBuilding(base, 'player-0', shared, 'settlement', { free: true });
    game = giveResources(game, 'player-0', ROAD_COST);

    expect(canBuildRoad(game, 'player-0', edgeA.id).valid).toBe(true);
  });

  it('rejects a road on an occupied edge', () => {
    const base = rollAs(createPlayingGame(), 1, 2);
    const { shared, edgeA } = findEdgePair(base);
    let game = placeBuilding(base, 'player-0', shared, 'settlement', { free: true });
    game = placeRoad(game, 'player-1', edgeA.id, { free: true });
    game = giveResources(game, 'player-0', ROAD_COST);

    const check = canBuildRoad(game, 'player-0', edgeA.id);
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/already a road/i);
  });

  it('rejects a road with no connection to your network', () => {
    const game = giveResources(rollAs(createPlayingGame(), 1, 2), 'player-0', ROAD_COST);
    const lonely = game.board.edges[0];
    const check = canBuildRoad(game, 'player-0', lonely.id);
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/must connect/i);
  });

  it('allows a road connected to one of your own roads', () => {
    const base = rollAs(createPlayingGame(), 1, 2);
    const { shared, edgeA, edgeB } = findEdgePair(base);
    let game = placeBuilding(base, 'player-0', shared, 'settlement', { free: true });
    game = placeRoad(game, 'player-0', edgeA.id, { free: true });
    game = giveResources(game, 'player-0', ROAD_COST);

    expect(canBuildRoad(game, 'player-0', edgeB.id).valid).toBe(true);
  });

  it('allows a road to continue through your own settlement', () => {
    const base = rollAs(createPlayingGame(), 1, 2);
    const { shared, edgeA, edgeB } = findEdgePair(base);
    let game = placeRoad(base, 'player-0', edgeA.id, { free: true });
    game = placeBuilding(game, 'player-0', shared, 'settlement', { free: true });
    game = giveResources(game, 'player-0', ROAD_COST);

    expect(canBuildRoad(game, 'player-0', edgeB.id).valid).toBe(true);
  });

  it('allows a road to continue through your own city', () => {
    const base = rollAs(createPlayingGame(), 1, 2);
    const { shared, edgeA, edgeB } = findEdgePair(base);
    let game = placeRoad(base, 'player-0', edgeA.id, { free: true });
    game = placeBuilding(game, 'player-0', shared, 'city', { free: true });
    game = giveResources(game, 'player-0', ROAD_COST);

    expect(canBuildRoad(game, 'player-0', edgeB.id).valid).toBe(true);
  });

  it("does NOT let a road continue through an opponent's settlement", () => {
    const base = rollAs(createPlayingGame(), 1, 2);
    const { shared, edgeA, edgeB } = findEdgePair(base);

    // player-0 road -> opponent settlement at the shared corner -> player-0 wants edgeB.
    let game = placeRoad(base, 'player-0', edgeA.id, { free: true });
    game = placeBuilding(game, 'player-1', shared, 'settlement', { free: true });
    game = giveResources(game, 'player-0', ROAD_COST);

    const check = canBuildRoad(game, 'player-0', edgeB.id);
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/must connect/i);
  });

  it("does NOT let a road continue through an opponent's city", () => {
    const base = rollAs(createPlayingGame(), 1, 2);
    const { shared, edgeA, edgeB } = findEdgePair(base);
    let game = placeRoad(base, 'player-0', edgeA.id, { free: true });
    game = placeBuilding(game, 'player-1', shared, 'city', { free: true });
    game = giveResources(game, 'player-0', ROAD_COST);

    expect(canBuildRoad(game, 'player-0', edgeB.id).valid).toBe(false);
  });

  it('costs exactly 1 brick and 1 lumber', () => {
    expect(PIECE_COSTS.road).toEqual(ROAD_COST);
  });

  it('deducts exactly the road cost', () => {
    const base = rollAs(createPlayingGame(), 1, 2);
    const { shared, edgeA } = findEdgePair(base);
    let game = placeBuilding(base, 'player-0', shared, 'settlement', { free: true });
    game = giveResources(game, 'player-0', { brick: 2, lumber: 2, wool: 1 });

    const built = expectOk(
      applyAction(game, { type: 'BUILD_ROAD', playerId: 'player-0', edgeId: edgeA.id })
    );

    expect(built.players[0].resources).toEqual({
      brick: 1,
      lumber: 1,
      wool: 1,
      grain: 0,
      ore: 0,
    });
    expect(built.players[0].roadsBuilt).toBe(1);
    expect(built.players[0].piecesRemaining.road).toBe(14);
  });

  it('rejects building beyond 15 roads', () => {
    const base = rollAs(createPlayingGame(), 1, 2);
    const { shared, edgeA } = findEdgePair(base);
    let game = placeBuilding(base, 'player-0', shared, 'settlement', { free: true });
    game = giveResources(game, 'player-0', ROAD_COST);
    game = {
      ...game,
      players: game.players.map((p) =>
        p.id === 'player-0' ? { ...p, piecesRemaining: { ...p.piecesRemaining, road: 0 } } : p
      ),
    };

    const check = canBuildRoad(game, 'player-0', edgeA.id);
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/no road pieces remaining/i);
  });

  it('gives a road no victory points', () => {
    const base = rollAs(createPlayingGame(), 1, 2);
    const { shared, edgeA } = findEdgePair(base);
    let game = placeBuilding(base, 'player-0', shared, 'settlement', { free: true });
    game = giveResources(game, 'player-0', ROAD_COST);

    const built = expectOk(
      applyAction(game, { type: 'BUILD_ROAD', playerId: 'player-0', edgeId: edgeA.id })
    );
    expect(built.players[0].victoryPoints).toBe(1); // from the settlement only
  });
});
