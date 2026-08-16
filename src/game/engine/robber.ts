// Robber state transitions: discarding, moving, and stealing. Validation lives in
// rules/robber.ts; these functions assume the caller has already checked.

import type { GameState, ResourceCount, ResourceType } from '../models/types';
import { RESOURCE_TYPES } from '../models/types';
import type { RNG } from '../utils/rng';
import { createStatefulRng } from '../utils/rng';
import { getStealCandidates, pickRandomResource } from '../rules/robber';

/** Removes a discard selection from a player's hand and clears their obligation. */
export function applyDiscard(
  state: GameState,
  playerId: string,
  selection: Partial<ResourceCount>
): GameState {
  const players = state.players.map((player) => {
    if (player.id !== playerId) return player;
    const resources = { ...player.resources };
    for (const resource of RESOURCE_TYPES) {
      resources[resource] -= selection[resource] ?? 0;
    }
    return { ...player, resources };
  });

  return {
    ...state,
    players,
    pendingDiscards: state.pendingDiscards.filter((d) => d.playerId !== playerId),
  };
}

export function moveRobber(state: GameState, hexId: string): GameState {
  return { ...state, robberHexId: hexId };
}

export interface StealOutcome {
  state: GameState;
  victimId: string;
  resource: ResourceType | null;
}

/**
 * Moves one random card from victim to thief. Uses the game's own seeded steal
 * stream unless an RNG is injected, so steals are reproducible and testable.
 */
export function stealResource(
  state: GameState,
  victimId: string,
  injectedRng?: RNG
): StealOutcome {
  const victim = state.players.find((p) => p.id === victimId);
  if (!victim) return { state, victimId, resource: null };

  const stateful = injectedRng ? null : createStatefulRng(state.stealRngState);
  const rng: RNG = injectedRng ?? stateful!.rng;

  const resource = pickRandomResource(victim.resources, rng);
  const stealRngState = stateful ? stateful.getState() : state.stealRngState;

  if (!resource) return { state: { ...state, stealRngState }, victimId, resource: null };

  const players = state.players.map((player) => {
    if (player.id === victimId) {
      return { ...player, resources: { ...player.resources, [resource]: player.resources[resource] - 1 } };
    }
    if (player.id === state.currentPlayerId) {
      return { ...player, resources: { ...player.resources, [resource]: player.resources[resource] + 1 } };
    }
    return player;
  });

  return { state: { ...state, players, stealRngState }, victimId, resource };
}

/**
 * What happens immediately after the robber lands: with no eligible victim play
 * resumes, with exactly one the steal is automatic, and with several the active
 * player must choose, so the game waits in the STEALING phase.
 */
export function resolveAfterRobberMove(state: GameState): {
  state: GameState;
  candidates: string[];
} {
  const candidates = getStealCandidates(state, state.robberHexId);

  if (candidates.length > 1) {
    return {
      state: { ...state, turnPhase: 'STEALING', stealCandidateIds: candidates },
      candidates,
    };
  }

  return {
    state: { ...state, turnPhase: 'AWAITING_ACTIONS', stealCandidateIds: [], robberMoveReason: null },
    candidates,
  };
}
