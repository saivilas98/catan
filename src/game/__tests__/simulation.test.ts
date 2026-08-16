// A scripted end-to-end game. Every action goes through applyAction exactly as the
// UI would dispatch it, and the state invariants are asserted after every single
// step — so this proves the subsystems work together, not just in isolation.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import type { GameAction, ActionDeps } from '../engine/actions';
import { createInitialGame } from '../engine/gameEngine';
import { validateGameState } from '../rules/invariants';
import {
  getValidCityLocations,
  getValidRoadLocations,
  getValidSettlementLocations,
} from '../rules/placement';
import { calculateVictoryPoints } from '../rules/scoring';
import { calculateLongestRoadLength } from '../rules/longestRoad';
import { countPlayedKnights } from '../rules/development';
import type { GameState, ResourceCount } from '../models/types';
import { RESOURCE_TYPES } from '../models/types';
import { fixedDiceRng } from '../utils/fixedRng';
import { devGiveDevelopmentCard, devGrantResources } from '../engine/devTools';
import { THREE_PLAYERS } from './helpers';

/** Drives the game while asserting the invariants after every accepted action. */
class Simulation {
  state: GameState;
  readonly log: string[] = [];

  constructor(names = THREE_PLAYERS, seed = 20260816) {
    this.state = createInitialGame(names, seed);
    this.assertValid('createInitialGame');
  }

  private assertValid(step: string) {
    const result = validateGameState(this.state);
    if (!result.valid) {
      throw new Error(`Invariants broken after ${step}:\n  - ${result.errors.join('\n  - ')}`);
    }
  }

  /** Dispatches an action that is expected to succeed. */
  do(action: GameAction, deps?: ActionDeps): this {
    const result = applyAction(this.state, action, deps);
    if (!result.ok) {
      throw new Error(`${action.type} failed unexpectedly: ${result.error.message}`);
    }
    this.state = result.state;
    this.log.push(action.type);
    this.assertValid(action.type);
    return this;
  }

  /** Dispatches an action that must be refused, leaving the state untouched. */
  refuse(action: GameAction): this {
    const before = JSON.stringify(this.state);
    const result = applyAction(this.state, action);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(this.state)).toBe(before);
    return this;
  }

  get current(): string {
    return this.state.currentPlayerId;
  }

  fund(playerId: string, amount = 4): this {
    this.state = devGrantResources(this.state, playerId, amount);
    this.assertValid('fund');
    return this;
  }

  giveCard(playerId: string, type: Parameters<typeof devGiveDevelopmentCard>[2]): this {
    this.state = devGiveDevelopmentCard(this.state, playerId, type);
    this.assertValid('giveCard');
    return this;
  }

  roll(die1: number, die2: number): this {
    return this.do(
      { type: 'ROLL_DICE', playerId: this.current },
      { rng: fixedDiceRng(die1, die2) }
    );
  }

  /** Clears discards, robber movement and stealing, whatever the roll produced. */
  resolveInterrupts(): this {
    let guard = 0;
    while (guard++ < 20) {
      if (this.state.turnPhase === 'DISCARDING') {
        const requirement = this.state.pendingDiscards[0];
        const player = this.state.players.find((p) => p.id === requirement.playerId)!;
        const selection: Partial<ResourceCount> = {};
        let left = requirement.required;
        for (const resource of RESOURCE_TYPES) {
          if (left <= 0) break;
          const take = Math.min(left, player.resources[resource]);
          if (take > 0) {
            selection[resource] = take;
            left -= take;
          }
        }
        this.do({
          type: 'DISCARD_RESOURCES',
          playerId: requirement.playerId,
          selection,
        });
        continue;
      }
      if (this.state.turnPhase === 'MOVING_ROBBER') {
        const target = this.state.board.hexes.find((h) => h.id !== this.state.robberHexId)!;
        this.do({ type: 'MOVE_ROBBER', playerId: this.current, hexId: target.id });
        continue;
      }
      if (this.state.turnPhase === 'STEALING') {
        this.do(
          {
            type: 'STEAL_RESOURCE',
            playerId: this.current,
            victimId: this.state.stealCandidateIds[0],
          },
          { stealRng: () => 0 }
        );
        continue;
      }
      return this;
    }
    throw new Error('resolveInterrupts did not settle');
  }

  endTurn(): this {
    return this.do({ type: 'END_TURN', playerId: this.current });
  }

  /** Plays a complete legal initial placement for every player. */
  runSetup(): this {
    while (this.state.phase === 'INITIAL_PLACEMENT') {
      const playerId = this.current;
      const intersectionId = getValidSettlementLocations(this.state, playerId)[0];
      this.do({ type: 'PLACE_INITIAL_SETTLEMENT', playerId, intersectionId });
      const edgeId = getValidRoadLocations(this.state, playerId)[0];
      this.do({ type: 'PLACE_INITIAL_ROAD', playerId, edgeId });
    }
    return this;
  }

  /** Extends the current player's road network by `count` roads, funding as needed. */
  buildRoads(count: number): this {
    for (let i = 0; i < count; i++) {
      this.fund(this.current, 2);
      const options = getValidRoadLocations(this.state, this.current);
      if (options.length === 0) break;
      // Take the last option to push outward rather than clustering.
      this.do({ type: 'BUILD_ROAD', playerId: this.current, edgeId: options[options.length - 1] });
    }
    return this;
  }
}

describe('deterministic full-game simulation', () => {
  it('plays a complete game from setup to victory without breaking an invariant', () => {
    const sim = new Simulation();

    // 1-3: create players, deterministic board, run setup.
    expect(sim.state.players).toHaveLength(3);
    expect(sim.state.phase).toBe('INITIAL_PLACEMENT');
    sim.runSetup();
    expect(sim.state.phase).toBe('PLAYING');
    for (const player of sim.state.players) {
      expect(player.settlementsBuilt).toBe(2);
      expect(player.roadsBuilt).toBe(2);
    }

    // 4-5: roll and produce. Rolling twice must be refused.
    sim.roll(2, 3);
    sim.refuse({ type: 'ROLL_DICE', playerId: sim.current });
    sim.resolveInterrupts();

    // 6-8: build roads, a settlement and a city.
    const builder = sim.current;
    sim.buildRoads(6);
    expect(calculateLongestRoadLength(sim.state, builder)).toBeGreaterThanOrEqual(5);
    expect(sim.state.longestRoadPlayerId).toBe(builder);

    sim.fund(builder, 4);
    const settlementSpots = getValidSettlementLocations(sim.state, builder);
    if (settlementSpots.length > 0) {
      sim.do({
        type: 'BUILD_SETTLEMENT',
        playerId: builder,
        intersectionId: settlementSpots[0],
      });
    }

    sim.fund(builder, 4);
    const citySpots = getValidCityLocations(sim.state, builder);
    expect(citySpots.length).toBeGreaterThan(0);
    sim.do({ type: 'BUILD_CITY', playerId: builder, intersectionId: citySpots[0] });

    // 9: trade — bank first, then player-to-player.
    sim.fund(builder, 4);
    sim.do({ type: 'BANK_TRADE', playerId: builder, give: 'brick', receive: 'ore' });

    const partner = sim.state.players.find((p) => p.id !== builder)!.id;
    sim.fund(partner, 3);
    sim.do({
      type: 'PROPOSE_TRADE',
      playerId: builder,
      targetPlayerId: partner,
      offeredResources: { lumber: 1 },
      requestedResources: { wool: 1 },
    });
    const tradeId = sim.state.tradeOffers[0].id;
    sim.do({ type: 'ACCEPT_TRADE', playerId: partner, tradeId });
    expect(sim.state.tradeOffers[0].status).toBe('ACCEPTED');

    // 10: buy a development card; it cannot be played this turn.
    sim.fund(builder, 2);
    sim.do({ type: 'BUY_DEVELOPMENT_CARD', playerId: builder });
    const builderHand = sim.state.players.find((p) => p.id === builder)!.developmentCards;
    const freshCard = builderHand[builderHand.length - 1];
    expect(freshCard.acquiredTurnNumber).toBe(sim.state.turnNumber);

    sim.endTurn();

    // 11: knights across later turns, reaching Largest Army.
    for (let round = 0; round < 3; round++) {
      // Bring the turn back around to the builder.
      while (sim.current !== builder) {
        sim.roll(2, 3).resolveInterrupts().endTurn();
      }
      sim.roll(2, 3).resolveInterrupts();
      sim.giveCard(builder, 'knight');
      sim.do({ type: 'PLAY_KNIGHT', playerId: builder });
      // 12-14: the knight forces a robber move and possibly a steal.
      sim.resolveInterrupts();
      // Only one development card per turn.
      sim.giveCard(builder, 'knight');
      sim.refuse({ type: 'PLAY_KNIGHT', playerId: builder });
      sim.endTurn();
    }
    expect(countPlayedKnights(sim.state, builder)).toBe(3);
    expect(sim.state.largestArmyPlayerId).toBe(builder);

    // 12: a forced 7 with a fat hand, exercising the discard chain.
    while (sim.current !== builder) sim.roll(2, 3).resolveInterrupts().endTurn();
    sim.fund(builder, 3);
    for (const player of sim.state.players) sim.fund(player.id, 3);
    sim.roll(3, 4);
    expect(sim.state.diceResult!.total).toBe(7);
    // Somebody is over the limit, so the robber waits for the discards.
    if (sim.state.pendingDiscards.length > 0) {
      expect(sim.state.turnPhase).toBe('DISCARDING');
      sim.refuse({
        type: 'MOVE_ROBBER',
        playerId: builder,
        hexId: sim.state.board.hexes[0].id,
      });
    }
    sim.resolveInterrupts();
    expect(sim.state.turnPhase).toBe('AWAITING_ACTIONS');

    // 15-17: build up to ten points and win.
    let guard = 0;
    while (sim.state.phase === 'PLAYING' && guard++ < 40) {
      if (sim.current !== builder) {
        sim.roll(2, 3).resolveInterrupts().endTurn();
        continue;
      }
      if (sim.state.turnPhase === 'AWAITING_ROLL') {
        sim.roll(2, 3).resolveInterrupts();
        if (sim.state.phase !== 'PLAYING') break;
      }

      sim.fund(builder, 4);
      const cities = getValidCityLocations(sim.state, builder);
      if (cities.length > 0) {
        sim.do({ type: 'BUILD_CITY', playerId: builder, intersectionId: cities[0] });
        if (sim.state.phase !== 'PLAYING') break;
        continue;
      }

      sim.buildRoads(2);
      if (sim.state.phase !== 'PLAYING') break;
      sim.fund(builder, 4);
      const spots = getValidSettlementLocations(sim.state, builder);
      if (spots.length > 0) {
        sim.do({ type: 'BUILD_SETTLEMENT', playerId: builder, intersectionId: spots[0] });
        if (sim.state.phase !== 'PLAYING') break;
      }
      sim.endTurn();
    }

    // 18: the game is over, the winner is recorded, and nothing further is legal.
    expect(sim.state.phase).toBe('GAME_OVER');
    expect(sim.state.winnerId).toBe(builder);
    expect(calculateVictoryPoints(sim.state, builder)).toBeGreaterThanOrEqual(10);
    expect(sim.state.eventLog.some((e) => e.type === 'GAME_WON')).toBe(true);

    sim.refuse({ type: 'ROLL_DICE', playerId: builder });
    sim.refuse({ type: 'END_TURN', playerId: builder });
    sim.refuse({ type: 'BUY_DEVELOPMENT_CARD', playerId: builder });

    expect(validateGameState(sim.state).valid).toBe(true);
  });

  it('reproduces exactly the same game from the same seed', () => {
    const play = () => {
      const sim = new Simulation(THREE_PLAYERS, 4242);
      sim.runSetup();
      for (let i = 0; i < 9; i++) {
        sim.roll(i % 4 === 3 ? 3 : 2, i % 4 === 3 ? 4 : 3);
        sim.resolveInterrupts();
        sim.endTurn();
      }
      return sim.state;
    };

    const a = play();
    const b = play();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('keeps every invariant across many seeded games', () => {
    for (const seed of [1, 7, 13, 42, 99, 2026]) {
      const sim = new Simulation(THREE_PLAYERS, seed);
      sim.runSetup();
      for (let turn = 0; turn < 12; turn++) {
        sim.roll(turn % 3 === 2 ? 3 : 2, turn % 3 === 2 ? 4 : 3);
        sim.resolveInterrupts();
        sim.endTurn();
      }
      expect(validateGameState(sim.state).valid).toBe(true);
    }
  });
});
