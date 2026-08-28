import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import { createInitialGame } from '../engine/gameEngine';
import { validateGameState, validateResources } from '../rules/invariants';
import { getValidRoadLocations, getValidSettlementLocations } from '../rules/placement';
import type { GameState } from '../models/types';
import { fixedDiceRng } from '../utils/fixedRng';
import { placeBuilding } from '../engine/construction';
import {
  expectOk,
  FOUR_PLAYERS,
  giveDevelopmentCard,
  giveResources,
  readyToAct,
  runFullSetup,
  SIX_PLAYERS,
  THREE_PLAYERS,
} from './helpers';

/** Intersections far enough apart that each can hold its own building. */
function spacedIntersections(state: GameState, count: number) {
  const chosen: GameState['board']['intersections'] = [];
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

/** Asserts the state is structurally sound, reporting every violation at once. */
function expectValid(state: GameState, context: string) {
  const result = validateGameState(state);
  if (!result.valid) {
    throw new Error(`Invalid state after ${context}:\n  - ${result.errors.join('\n  - ')}`);
  }
  expect(result.valid).toBe(true);
}

describe('invariants: freshly created games', () => {
  it('holds for a new 3-player game', () => {
    expectValid(createInitialGame(THREE_PLAYERS, 1), 'createInitialGame(3)');
  });

  it('holds for a new 4-player game', () => {
    expectValid(createInitialGame(FOUR_PLAYERS, 7), 'createInitialGame(4)');
  });

  it('holds for a new 6-player game (the larger expansion deck must not look overfull)', () => {
    expectValid(createInitialGame(SIX_PLAYERS, 7), 'createInitialGame(6)');
  });

  it('holds across many seeds', () => {
    for (let seed = 1; seed <= 25; seed++) {
      expectValid(createInitialGame(THREE_PLAYERS, seed), `seed ${seed}`);
    }
  });
});

describe('invariants: through initial placement', () => {
  it('holds after every placement of a full setup', () => {
    let game = createInitialGame(THREE_PLAYERS, 3);
    let step = 0;

    while (game.phase === 'INITIAL_PLACEMENT') {
      const playerId = game.currentPlayerId;

      const intersectionId = getValidSettlementLocations(game, playerId)[0];
      game = expectOk(
        applyAction(game, { type: 'PLACE_INITIAL_SETTLEMENT', playerId, intersectionId })
      );
      expectValid(game, `setup settlement ${++step}`);

      const edgeId = getValidRoadLocations(game, playerId)[0];
      game = expectOk(applyAction(game, { type: 'PLACE_INITIAL_ROAD', playerId, edgeId }));
      expectValid(game, `setup road ${step}`);
    }

    expect(game.phase).toBe('PLAYING');
  });

  it('holds for a 4-player setup too', () => {
    expectValid(runFullSetup(FOUR_PLAYERS, 11), 'four-player setup');
  });
});

describe('invariants: detecting corrupted states', () => {
  it('flags negative resources', () => {
    const base = readyToAct();
    const broken: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, resources: { ...p.resources, ore: -1 } } : p
      ),
    };
    expect(validateGameState(broken).valid).toBe(false);
    expect(validateResources(broken).valid).toBe(false);
    expect(validateResources(broken).errors[0]).toMatch(/negative ore/i);
  });

  it('flags a winner recorded outside game over', () => {
    const broken: GameState = { ...readyToAct(), winnerId: 'player-0' };
    expect(validateGameState(broken).errors.some((e) => /not over/i.test(e))).toBe(true);
  });

  it('flags game over with no winner', () => {
    const broken: GameState = { ...readyToAct(), phase: 'GAME_OVER', winnerId: null };
    expect(validateGameState(broken).errors.some((e) => /no winner/i.test(e))).toBe(true);
  });

  it('flags a robber on a hex that does not exist', () => {
    const broken: GameState = { ...readyToAct(), robberHexId: 'hex-nowhere' };
    expect(validateGameState(broken).errors.some((e) => /unknown hex/i.test(e))).toBe(true);
  });

  it('flags an unknown current player', () => {
    const broken: GameState = { ...readyToAct(), currentPlayerId: 'player-99' };
    expect(validateGameState(broken).errors.some((e) => /not a known player/i.test(e))).toBe(true);
  });

  it('flags piece counts that do not balance', () => {
    const base = readyToAct();
    const broken: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0
          ? { ...p, piecesRemaining: { ...p.piecesRemaining, road: 3 } }
          : p
      ),
    };
    expect(validateGameState(broken).errors.some((e) => /do not balance/i.test(e))).toBe(true);
  });

  it('flags outstanding discards outside the discard phase', () => {
    const broken: GameState = {
      ...readyToAct(),
      pendingDiscards: [{ playerId: 'player-1', required: 3 }],
    };
    expect(validateGameState(broken).errors.some((e) => /Outstanding discards/i.test(e))).toBe(
      true
    );
  });

  it('flags the stealing phase with no candidates', () => {
    const broken: GameState = { ...readyToAct(), turnPhase: 'STEALING', stealCandidateIds: [] };
    expect(validateGameState(broken).errors.some((e) => /no candidates/i.test(e))).toBe(true);
  });

  it('flags free roads owed outside Road Building', () => {
    const broken: GameState = { ...readyToAct(), roadBuildingRoadsRemaining: 2 };
    expect(validateGameState(broken).errors.some((e) => /Free roads owed/i.test(e))).toBe(true);
  });

  it('flags a duplicated development card', () => {
    const base = readyToAct();
    const card = base.developmentDeck[0];
    const broken: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, developmentCards: [card] } : p
      ),
    };
    expect(
      validateGameState(broken).errors.some((e) => /more than one place/i.test(e))
    ).toBe(true);
  });

  it('flags a stale public victory point total', () => {
    const base = readyToAct();
    const broken: GameState = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, victoryPoints: 7 } : p)),
    };
    expect(validateGameState(broken).errors.some((e) => /public VP/i.test(e))).toBe(true);
  });
});

describe('invariants: hold through ordinary turns', () => {
  it('survives a long run of rolls and turn changes', () => {
    let game = runFullSetup(THREE_PLAYERS, 5);
    expectValid(game, 'setup complete');

    for (let turn = 0; turn < 30; turn++) {
      const playerId = game.currentPlayerId;
      // Alternate a safe roll and a 7 so the robber path is exercised too.
      const [d1, d2] = turn % 4 === 3 ? [3, 4] : [2, 3];

      game = expectOk(
        applyAction(game, { type: 'ROLL_DICE', playerId }, { rng: fixedDiceRng(d1, d2) })
      );
      expectValid(game, `roll on turn ${turn}`);

      // Clear whatever the roll demanded.
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
        expectValid(game, `discard on turn ${turn}`);
      }

      if (game.turnPhase === 'MOVING_ROBBER') {
        const hexId = game.board.hexes.find((h) => h.id !== game.robberHexId)!.id;
        game = expectOk(applyAction(game, { type: 'MOVE_ROBBER', playerId, hexId }));
        expectValid(game, `robber move on turn ${turn}`);
      }

      if (game.turnPhase === 'STEALING') {
        game = expectOk(
          applyAction(game, {
            type: 'STEAL_RESOURCE',
            playerId,
            victimId: game.stealCandidateIds[0],
          })
        );
        expectValid(game, `steal on turn ${turn}`);
      }

      game = expectOk(applyAction(game, { type: 'END_TURN', playerId }));
      expectValid(game, `end of turn ${turn}`);
    }
  });
});

describe('invariants: winning mid Special Building Phase', () => {
  it('clears specialBuildRoundOwnerId when the winning build happens during SBP', () => {
    let game = readyToAct(SIX_PLAYERS, 3);
    const spots = spacedIntersections(game, 5);

    // Place 5 settlements, then use the real BUILD_CITY action to upgrade 3 of
    // them — going through the actual upgrade path keeps piecesRemaining and
    // settlementsBuilt/citiesBuilt bookkeeping correct (placeBuilding with type
    // 'city' directly on an empty spot skips that bookkeeping; it's only ever
    // meant to upgrade an existing settlement).
    spots.forEach((spot) => {
      game = placeBuilding(game, 'player-0', spot.id, 'settlement', { free: true });
    });
    game = giveResources(game, 'player-0', { ore: 9, grain: 6 });
    spots.slice(0, 3).forEach((spot) => {
      game = expectOk(
        applyAction(game, { type: 'BUILD_CITY', playerId: 'player-0', intersectionId: spot.id })
      );
    });
    // 3 cities (6) + 2 settlements (2) + 1 hidden VP card (1) = 9 VP, one short
    // of winning, while leaving a city piece free to upgrade with.
    game = giveDevelopmentCard(game, 'player-0', 'victoryPoint');

    // Move into a Special Building slot for player-0, as if their normal turn
    // had already ended and the cycle came back around to them.
    game = {
      ...game,
      turnPhase: 'SPECIAL_BUILDING',
      currentPlayerId: 'player-0',
      specialBuildRoundOwnerId: 'player-5',
    };
    game = giveResources(game, 'player-0', { ore: 3, grain: 2 });

    // Upgrading that settlement to a city (1 VP -> 2 VP) is the 10th point.
    const result = applyAction(game, {
      type: 'BUILD_CITY',
      playerId: 'player-0',
      intersectionId: spots[4].id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.phase).toBe('GAME_OVER');
    expect(result.state.winnerId).toBe('player-0');
    expect(result.state.specialBuildRoundOwnerId).toBeNull();
    expectValid(result.state, 'winning a build during Special Building Phase');
  });
});
