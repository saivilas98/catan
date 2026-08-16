import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import { emptyResources } from '../engine/gameEngine';
import { createPlayingGame } from './helpers';
import { devPlaceBuilding } from '../engine/devTools';
import { getProducingHexes, getProductionAwards, produceResources } from '../engine/production';
import { TERRAIN_TO_RESOURCE } from '../models/types';
import type { GameState, HexTile, TerrainType } from '../models/types';
import { fixedDiceRng } from '../utils/fixedRng';

const PLAYERS = ['Sai', 'Rahul', 'Ananya'];

function rollWith(state: GameState, die1: number, die2: number): GameState {
  const result = applyAction(
    state,
    { type: 'ROLL_DICE', playerId: state.currentPlayerId },
    { rng: fixedDiceRng(die1, die2) }
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

/** Finds a hex of the given terrain that has a number token, for seeded board 1. */
function findTerrainHex(state: GameState, terrain: TerrainType): HexTile {
  const hex = state.board.hexes.find((h) => h.terrain === terrain && h.numberToken !== null);
  if (!hex) throw new Error(`No ${terrain} hex with a token on this board`);
  return hex;
}

describe('resources', () => {
  it('initializes every player at zero across all five resources', () => {
    const game = createPlayingGame(PLAYERS, 1);
    for (const player of game.players) {
      expect(player.resources).toEqual({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 });
    }
    expect(emptyResources()).toEqual({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 });
  });

  it('maps terrain to the correct resource', () => {
    expect(TERRAIN_TO_RESOURCE).toEqual({
      hills: 'brick',
      forest: 'lumber',
      pasture: 'wool',
      fields: 'grain',
      mountains: 'ore',
      desert: null,
    });
  });
});

describe('getProducingHexes', () => {
  it('finds every non-desert hex matching a rolled number', () => {
    const game = createPlayingGame(PLAYERS, 1);
    const target = findTerrainHex(game, 'forest');
    const hexes = getProducingHexes(game.board, target.numberToken!, 'nonexistent-hex');
    expect(hexes.length).toBeGreaterThan(0);
    for (const hex of hexes) {
      expect(hex.numberToken).toBe(target.numberToken);
      expect(hex.terrain).not.toBe('desert');
      expect(hex.resource).not.toBeNull();
    }
  });

  it('returns nothing for a 7', () => {
    const game = createPlayingGame(PLAYERS, 1);
    expect(getProducingHexes(game.board, 7, game.robberHexId)).toEqual([]);
  });

  it('never returns the desert, which has no number token', () => {
    const game = createPlayingGame(PLAYERS, 1);
    for (let n = 2; n <= 12; n++) {
      const hexes = getProducingHexes(game.board, n, game.robberHexId);
      expect(hexes.some((h) => h.terrain === 'desert')).toBe(false);
    }
  });

  it('excludes the hex the robber is sitting on', () => {
    const game = createPlayingGame(PLAYERS, 1);
    const target = findTerrainHex(game, 'forest');
    const blocked = getProducingHexes(game.board, target.numberToken!, target.id);
    expect(blocked.some((h) => h.id === target.id)).toBe(false);
  });
});

describe('robber', () => {
  it('starts on the desert hex', () => {
    const game = createPlayingGame(PLAYERS, 1);
    const desert = game.board.hexes.find((h) => h.terrain === 'desert')!;
    expect(game.robberHexId).toBe(desert.id);
  });

  it('produces no resources on a 7 and demands a robber move', () => {
    let game = createPlayingGame(PLAYERS, 1);
    // Give every player a building somewhere so production would otherwise be possible.
    game = devPlaceBuilding(game, game.board.intersections[0].id, 'player-0', 'settlement');

    const before = JSON.stringify(game.players.map((p) => p.resources));
    game = rollWith(game, 3, 4);

    expect(game.diceResult!.total).toBe(7);
    // Nobody is over the hand limit here, so the robber move is owed immediately.
    expect(game.turnPhase).toBe('MOVING_ROBBER');
    expect(JSON.stringify(game.players.map((p) => p.resources))).toBe(before);
  });

  it('leaves the robber in place until the player actually moves it', () => {
    const game = createPlayingGame(PLAYERS, 1);
    const rolled = rollWith(game, 3, 4);
    expect(rolled.robberHexId).toBe(game.robberHexId);
  });
});

describe('production pipeline', () => {
  it('gives a settlement exactly 1 resource from an adjacent hex', () => {
    let game = createPlayingGame(PLAYERS, 1);
    const forest = findTerrainHex(game, 'forest');
    game = devPlaceBuilding(game, forest.intersectionIds[0], 'player-0', 'settlement');

    const [d1, d2] = splitTotal(forest.numberToken!);
    game = rollWith(game, d1, d2);

    expect(game.players[0].resources.lumber).toBe(1);
  });

  it('gives a city exactly 2 resources from an adjacent hex', () => {
    let game = createPlayingGame(PLAYERS, 1);
    const forest = findTerrainHex(game, 'forest');
    game = devPlaceBuilding(game, forest.intersectionIds[0], 'player-0', 'city');

    const [d1, d2] = splitTotal(forest.numberToken!);
    game = rollWith(game, d1, d2);

    expect(game.players[0].resources.lumber).toBe(2);
  });

  it('only pays the owner of the building', () => {
    let game = createPlayingGame(PLAYERS, 1);
    const forest = findTerrainHex(game, 'forest');
    game = devPlaceBuilding(game, forest.intersectionIds[0], 'player-1', 'settlement');

    const [d1, d2] = splitTotal(forest.numberToken!);
    game = rollWith(game, d1, d2);

    expect(game.players[1].resources.lumber).toBe(1);
    expect(game.players[0].resources.lumber).toBe(0);
    expect(game.players[2].resources.lumber).toBe(0);
  });

  it('pays a settlement once per adjacent producing hex sharing the rolled number', () => {
    // Synthesize the edge case from the spec: one intersection touching three hexes
    // that all show the same number, across three different terrains.
    const base = createPlayingGame(PLAYERS, 1);
    const intersection = base.board.intersections.find((i) => i.hexIds.length === 3)!;
    const [hexA, hexB, hexC] = intersection.hexIds;

    const terrains: Record<string, TerrainType> = {
      [hexA]: 'forest',
      [hexB]: 'fields',
      [hexC]: 'mountains',
    };

    const hexes = base.board.hexes.map((hex) =>
      terrains[hex.id]
        ? {
            ...hex,
            terrain: terrains[hex.id],
            resource: TERRAIN_TO_RESOURCE[terrains[hex.id]],
            numberToken: 8,
          }
        : hex
    );

    let game: GameState = { ...base, board: { ...base.board, hexes } };
    game = devPlaceBuilding(game, intersection.id, 'player-0', 'settlement');

    const awards = getProductionAwards(game, 8);
    const forPlayer0 = awards.filter((a) => a.playerId === 'player-0');
    expect(forPlayer0).toHaveLength(3);

    const produced = produceResources(game, 8);
    expect(produced.state.players[0].resources.lumber).toBe(1);
    expect(produced.state.players[0].resources.grain).toBe(1);
    expect(produced.state.players[0].resources.ore).toBe(1);
  });

  it('produces nothing when no buildings exist', () => {
    let game = createPlayingGame(PLAYERS, 1);
    const forest = findTerrainHex(game, 'forest');
    const [d1, d2] = splitTotal(forest.numberToken!);
    game = rollWith(game, d1, d2);

    for (const player of game.players) {
      expect(player.resources).toEqual({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 });
    }
    expect(game.eventLog.some((e) => e.type === 'NO_PRODUCTION')).toBe(true);
  });

  it('logs what each player received', () => {
    let game = createPlayingGame(PLAYERS, 1);
    const forest = findTerrainHex(game, 'forest');
    game = devPlaceBuilding(game, forest.intersectionIds[0], 'player-0', 'settlement');

    const [d1, d2] = splitTotal(forest.numberToken!);
    game = rollWith(game, d1, d2);

    const produced = game.eventLog.filter((e) => e.type === 'RESOURCES_PRODUCED');
    expect(produced.length).toBeGreaterThan(0);
    expect(produced[0].message).toContain('Lumber');
  });
});

/** Splits a dice total into two valid die faces. */
function splitTotal(total: number): [number, number] {
  const die1 = Math.max(1, Math.min(6, total - 1));
  const die2 = total - die1;
  if (die2 < 1 || die2 > 6) throw new Error(`Cannot split total ${total}`);
  return [die1, die2];
}
