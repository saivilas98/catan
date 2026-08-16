import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import { devPlaceBuilding } from '../engine/devTools';
import {
  discardCountFor,
  getStealCandidates,
  getValidRobberHexes,
  pickRandomResource,
  totalResourceCards,
} from '../rules/robber';
import type { GameState, HexTile } from '../models/types';
import {
  createPlayingGame,
  expectOk,
  fixedRng,
  giveDevelopmentCard,
  giveResources,
  readyToAct,
  rollAs,
  THREE_PLAYERS,
} from './helpers';

const NO_RESOURCES = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };

function hexWithoutRobber(game: GameState): HexTile {
  return game.board.hexes.find((h) => h.id !== game.robberHexId)!;
}

/** Rolls a 7 as the current player. */
function rollSeven(game: GameState): GameState {
  return rollAs(game, 3, 4);
}

describe('discard maths', () => {
  it('discards nothing at or below 7 cards', () => {
    expect(discardCountFor({ ...NO_RESOURCES, brick: 7 })).toBe(0);
    expect(discardCountFor({ ...NO_RESOURCES, brick: 3, lumber: 4 })).toBe(0);
    expect(discardCountFor(NO_RESOURCES)).toBe(0);
  });

  it('discards half rounded down above 7 cards', () => {
    expect(discardCountFor({ ...NO_RESOURCES, brick: 8 })).toBe(4);
    expect(discardCountFor({ ...NO_RESOURCES, brick: 9 })).toBe(4);
    expect(discardCountFor({ ...NO_RESOURCES, brick: 10 })).toBe(5);
    expect(discardCountFor({ ...NO_RESOURCES, brick: 11 })).toBe(5);
    expect(discardCountFor({ ...NO_RESOURCES, brick: 12 })).toBe(6);
  });

  it('counts every resource type toward the hand size', () => {
    expect(totalResourceCards({ brick: 2, lumber: 3, wool: 1, grain: 2, ore: 1 })).toBe(9);
    expect(discardCountFor({ brick: 2, lumber: 3, wool: 1, grain: 2, ore: 1 })).toBe(4);
  });
});

describe('rolling a 7', () => {
  it('produces no resources and goes straight to the robber when nobody is over the limit', () => {
    const game = rollSeven(createPlayingGame());
    expect(game.turnPhase).toBe('MOVING_ROBBER');
    expect(game.pendingDiscards).toEqual([]);
  });

  it('requires discards from every player over the limit', () => {
    let game = createPlayingGame();
    game = giveResources(game, 'player-0', { brick: 9 }); // 9 -> discard 4
    game = giveResources(game, 'player-1', { lumber: 7 }); // 7 -> safe
    game = giveResources(game, 'player-2', { ore: 10 }); // 10 -> discard 5

    game = rollSeven(game);

    expect(game.turnPhase).toBe('DISCARDING');
    expect(game.pendingDiscards).toEqual([
      { playerId: 'player-0', required: 4 },
      { playerId: 'player-2', required: 5 },
    ]);
  });

  it('blocks the robber move until every discard is settled', () => {
    let game = createPlayingGame();
    game = giveResources(game, 'player-0', { brick: 9 });
    game = giveResources(game, 'player-2', { ore: 10 });
    game = rollSeven(game);

    const early = applyAction(game, {
      type: 'MOVE_ROBBER',
      playerId: 'player-0',
      hexId: hexWithoutRobber(game).id,
    });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.code).toBe('WRONG_PHASE');

    game = expectOk(
      applyAction(game, {
        type: 'DISCARD_RESOURCES',
        playerId: 'player-0',
        selection: { brick: 4 },
      })
    );
    expect(game.turnPhase).toBe('DISCARDING'); // player-2 still owes

    game = expectOk(
      applyAction(game, {
        type: 'DISCARD_RESOURCES',
        playerId: 'player-2',
        selection: { ore: 5 },
      })
    );
    expect(game.turnPhase).toBe('MOVING_ROBBER');
    expect(game.players[0].resources.brick).toBe(5);
    expect(game.players[2].resources.ore).toBe(5);
  });

  it('rejects a discard of the wrong size', () => {
    let game = createPlayingGame();
    game = giveResources(game, 'player-0', { brick: 9 });
    game = rollSeven(game);

    for (const wrong of [{ brick: 3 }, { brick: 5 }]) {
      const result = applyAction(game, {
        type: 'DISCARD_RESOURCES',
        playerId: 'player-0',
        selection: wrong,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_DISCARD');
    }

    const right = applyAction(game, {
      type: 'DISCARD_RESOURCES',
      playerId: 'player-0',
      selection: { brick: 4 },
    });
    expect(right.ok).toBe(true);
  });

  it('rejects discarding resources the player does not hold', () => {
    let game = createPlayingGame();
    game = giveResources(game, 'player-0', { brick: 9 });
    game = rollSeven(game);

    const result = applyAction(game, {
      type: 'DISCARD_RESOURCES',
      playerId: 'player-0',
      selection: { brick: 2, ore: 2 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/do not have/i);
  });

  it('rejects a discard from a player who does not owe one', () => {
    let game = createPlayingGame();
    game = giveResources(game, 'player-0', { brick: 9 });
    game = rollSeven(game);

    const result = applyAction(game, {
      type: 'DISCARD_RESOURCES',
      playerId: 'player-1',
      selection: { brick: 1 },
    });
    expect(result.ok).toBe(false);
  });

  it('does not let the active player end their turn mid-sequence', () => {
    let game = createPlayingGame();
    game = giveResources(game, 'player-0', { brick: 9 });
    game = rollSeven(game);

    const duringDiscard = applyAction(game, { type: 'END_TURN', playerId: 'player-0' });
    expect(duringDiscard.ok).toBe(false);

    game = expectOk(
      applyAction(game, {
        type: 'DISCARD_RESOURCES',
        playerId: 'player-0',
        selection: { brick: 4 },
      })
    );

    const duringRobber = applyAction(game, { type: 'END_TURN', playerId: 'player-0' });
    expect(duringRobber.ok).toBe(false);
    if (!duringRobber.ok) expect(duringRobber.error.message).toMatch(/move the robber/i);
  });
});

describe('robber movement', () => {
  it('starts on the desert', () => {
    const game = createPlayingGame();
    const desert = game.board.hexes.find((h) => h.terrain === 'desert')!;
    expect(game.robberHexId).toBe(desert.id);
  });

  it('offers every hex except the one it occupies', () => {
    const game = createPlayingGame();
    const valid = getValidRobberHexes(game);
    expect(valid).toHaveLength(18);
    expect(valid).not.toContain(game.robberHexId);
  });

  it('refuses to stay on the same hex', () => {
    const game = rollSeven(createPlayingGame());
    const result = applyAction(game, {
      type: 'MOVE_ROBBER',
      playerId: 'player-0',
      hexId: game.robberHexId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/different hex/i);
  });

  it('moves after a 7 and returns to the action phase when nobody is adjacent', () => {
    const game = rollSeven(createPlayingGame());
    const target = hexWithoutRobber(game);
    const moved = expectOk(
      applyAction(game, { type: 'MOVE_ROBBER', playerId: 'player-0', hexId: target.id })
    );
    expect(moved.robberHexId).toBe(target.id);
    expect(moved.turnPhase).toBe('AWAITING_ACTIONS');
  });

  it('moves after a knight', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'knight');
    game = expectOk(applyAction(game, { type: 'PLAY_KNIGHT', playerId: 'player-0' }));
    expect(game.turnPhase).toBe('MOVING_ROBBER');

    const target = hexWithoutRobber(game);
    game = expectOk(
      applyAction(game, { type: 'MOVE_ROBBER', playerId: 'player-0', hexId: target.id })
    );
    expect(game.robberHexId).toBe(target.id);
  });

  it('blocks production on the hex it occupies', () => {
    let game = createPlayingGame();
    const forest = game.board.hexes.find(
      (h) => h.terrain === 'forest' && h.numberToken !== null
    )!;
    game = devPlaceBuilding(game, forest.intersectionIds[0], 'player-0', 'settlement');
    game = { ...game, robberHexId: forest.id };

    const total = forest.numberToken!;
    const die1 = Math.max(1, Math.min(6, total - 1));
    const rolled = rollAs(game, die1, total - die1);

    expect(rolled.players[0].resources.lumber).toBe(0);
  });
});

describe('steal candidates', () => {
  it('lists only opponents with a building on the robber hex', () => {
    let game = readyToAct();
    const hex = hexWithoutRobber(game);
    game = devPlaceBuilding(game, hex.intersectionIds[0], 'player-1', 'settlement');
    game = giveResources(game, 'player-1', { ore: 1 });

    expect(getStealCandidates(game, hex.id)).toEqual(['player-1']);
  });

  it('never includes the active player', () => {
    let game = readyToAct();
    const hex = hexWithoutRobber(game);
    game = devPlaceBuilding(game, hex.intersectionIds[0], 'player-0', 'settlement');
    game = giveResources(game, 'player-0', { ore: 5 });

    expect(getStealCandidates(game, hex.id)).toEqual([]);
  });

  it('excludes opponents holding no cards', () => {
    let game = readyToAct();
    const hex = hexWithoutRobber(game);
    game = devPlaceBuilding(game, hex.intersectionIds[0], 'player-1', 'settlement');
    // player-1 has zero resources.
    expect(getStealCandidates(game, hex.id)).toEqual([]);
  });
});

describe('stealing', () => {
  it('steals automatically when exactly one victim is adjacent', () => {
    let game = rollSeven(createPlayingGame());
    const hex = hexWithoutRobber(game);
    game = devPlaceBuilding(game, hex.intersectionIds[0], 'player-1', 'settlement');
    game = giveResources(game, 'player-1', { ore: 3 });

    const moved = expectOk(
      applyAction(
        game,
        { type: 'MOVE_ROBBER', playerId: 'player-0', hexId: hex.id },
        { stealRng: fixedRng(0) }
      )
    );

    expect(moved.players[1].resources.ore).toBe(2);
    expect(moved.players[0].resources.ore).toBe(1);
    expect(moved.turnPhase).toBe('AWAITING_ACTIONS');
  });

  it('waits for a choice when several victims are adjacent', () => {
    let game = rollSeven(createPlayingGame());
    const hex = hexWithoutRobber(game);
    game = devPlaceBuilding(game, hex.intersectionIds[0], 'player-1', 'settlement');
    game = devPlaceBuilding(game, hex.intersectionIds[2], 'player-2', 'settlement');
    game = giveResources(game, 'player-1', { ore: 2 });
    game = giveResources(game, 'player-2', { wool: 2 });

    const moved = expectOk(
      applyAction(game, { type: 'MOVE_ROBBER', playerId: 'player-0', hexId: hex.id })
    );
    expect(moved.turnPhase).toBe('STEALING');
    expect(moved.stealCandidateIds.sort()).toEqual(['player-1', 'player-2']);

    const stolen = expectOk(
      applyAction(
        moved,
        { type: 'STEAL_RESOURCE', playerId: 'player-0', victimId: 'player-2' },
        { stealRng: fixedRng(0) }
      )
    );
    expect(stolen.players[2].resources.wool).toBe(1);
    expect(stolen.players[0].resources.wool).toBe(1);
    expect(stolen.turnPhase).toBe('AWAITING_ACTIONS');
  });

  it('rejects stealing from a player who is not a candidate', () => {
    let game = rollSeven(createPlayingGame());
    const hex = hexWithoutRobber(game);
    game = devPlaceBuilding(game, hex.intersectionIds[0], 'player-1', 'settlement');
    game = devPlaceBuilding(game, hex.intersectionIds[2], 'player-2', 'settlement');
    game = giveResources(game, 'player-1', { ore: 2 });
    game = giveResources(game, 'player-2', { wool: 2 });

    const moved = expectOk(
      applyAction(game, { type: 'MOVE_ROBBER', playerId: 'player-0', hexId: hex.id })
    );

    const self = applyAction(moved, {
      type: 'STEAL_RESOURCE',
      playerId: 'player-0',
      victimId: 'player-0',
    });
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.error.message).toMatch(/cannot steal from yourself/i);
  });

  it('takes nothing when the only adjacent opponent is empty-handed', () => {
    let game = rollSeven(createPlayingGame());
    const hex = hexWithoutRobber(game);
    game = devPlaceBuilding(game, hex.intersectionIds[0], 'player-1', 'settlement');
    // player-1 holds nothing, so they are not a candidate at all.

    const moved = expectOk(
      applyAction(game, { type: 'MOVE_ROBBER', playerId: 'player-0', hexId: hex.id })
    );
    expect(moved.turnPhase).toBe('AWAITING_ACTIONS');
    expect(moved.players[1].resources).toEqual(NO_RESOURCES);
    expect(moved.players[0].resources).toEqual(NO_RESOURCES);
  });

  it('does not name the stolen resource in the public log', () => {
    let game = rollSeven(createPlayingGame());
    const hex = hexWithoutRobber(game);
    game = devPlaceBuilding(game, hex.intersectionIds[0], 'player-1', 'settlement');
    game = giveResources(game, 'player-1', { ore: 3 });

    const moved = expectOk(
      applyAction(
        game,
        { type: 'MOVE_ROBBER', playerId: 'player-0', hexId: hex.id },
        { stealRng: fixedRng(0) }
      )
    );
    const event = moved.eventLog.find((e) => e.type === 'RESOURCE_STOLEN')!;
    expect(event.message).toBe('Sai stole 1 resource from Rahul');
    expect(event.message).not.toMatch(/ore|brick|wool|grain|lumber/i);
  });
});

describe('pickRandomResource', () => {
  it('is weighted by how many cards the victim holds', () => {
    const hand = { brick: 2, lumber: 0, wool: 0, grain: 0, ore: 3 };
    // Indices 0-1 land on brick, 2-4 on ore (RESOURCE_TYPES order).
    expect(pickRandomResource(hand, fixedRng(0))).toBe('brick');
    expect(pickRandomResource(hand, fixedRng(0.2))).toBe('brick');
    expect(pickRandomResource(hand, fixedRng(0.5))).toBe('ore');
    expect(pickRandomResource(hand, fixedRng(0.99))).toBe('ore');
  });

  it('returns null for an empty hand', () => {
    expect(pickRandomResource(NO_RESOURCES, fixedRng(0.5))).toBeNull();
  });

  it('never picks a resource the victim does not hold', () => {
    const hand = { brick: 0, lumber: 0, wool: 1, grain: 0, ore: 0 };
    for (let i = 0; i < 20; i++) {
      expect(pickRandomResource(hand, fixedRng(i / 20))).toBe('wool');
    }
  });
});

describe('deterministic steals', () => {
  it('reproduces the same steal for the same seed', () => {
    const build = (): GameState => {
      let game = rollSeven(createPlayingGame(THREE_PLAYERS, 5));
      const hex = hexWithoutRobber(game);
      game = devPlaceBuilding(game, hex.intersectionIds[0], 'player-1', 'settlement');
      game = giveResources(game, 'player-1', { brick: 2, ore: 2, wool: 2 });
      return expectOk(
        applyAction(game, { type: 'MOVE_ROBBER', playerId: 'player-0', hexId: hex.id })
      );
    };

    expect(build().players[0].resources).toEqual(build().players[0].resources);
  });
});
