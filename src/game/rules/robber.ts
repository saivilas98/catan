// Robber legality: where it may move, who may be robbed, and who must discard.
// Like the other rules modules this reads the real board graph and never mutates.

import type { GameState, ResourceCount, ResourceType } from '../models/types';
import { countResources, DISCARD_THRESHOLD, RESOURCE_TYPES } from '../models/types';
import type { RNG } from '../utils/rng';

export interface RobberCheck {
  valid: boolean;
  reason?: string;
}

const OK: RobberCheck = { valid: true };

function no(reason: string): RobberCheck {
  return { valid: false, reason };
}

/** Total resource cards in hand — the number the discard rule is measured against. */
export function totalResourceCards(resources: ResourceCount): number {
  return countResources(resources);
}

/** Half, rounded down — but only for hands strictly larger than the threshold. */
export function discardCountFor(resources: ResourceCount): number {
  const total = totalResourceCards(resources);
  if (total <= DISCARD_THRESHOLD) return 0;
  return Math.floor(total / 2);
}

/**
 * Everyone who must discard after a 7, ordered starting from the active player so
 * the "pass the laptop" prompts follow the seating order around the table.
 */
export function getDiscardRequirements(
  state: GameState
): Array<{ playerId: string; required: number }> {
  const startIndex = state.players.findIndex((p) => p.id === state.currentPlayerId);
  const ordered = [
    ...state.players.slice(startIndex),
    ...state.players.slice(0, Math.max(0, startIndex)),
  ];

  return ordered
    .map((player) => ({ playerId: player.id, required: discardCountFor(player.resources) }))
    .filter((entry) => entry.required > 0);
}

/** The robber must actually move: any hex except the one it already occupies. */
export function getValidRobberHexes(state: GameState): string[] {
  return state.board.hexes.filter((hex) => hex.id !== state.robberHexId).map((hex) => hex.id);
}

export function canMoveRobber(state: GameState, hexId: string): RobberCheck {
  if (!state.board.hexes.some((hex) => hex.id === hexId)) {
    return no('That hex is not on the board.');
  }
  if (hexId === state.robberHexId) {
    return no('The robber must move to a different hex.');
  }
  return OK;
}

/**
 * Opponents who can be robbed once the robber sits on `hexId`: they own a building
 * on one of its corners, they are not the active player, and they actually hold at
 * least one card (you cannot steal from an empty hand).
 */
export function getStealCandidates(state: GameState, hexId: string): string[] {
  const hex = state.board.hexes.find((h) => h.id === hexId);
  if (!hex) return [];

  const candidates = new Set<string>();
  for (const intersectionId of hex.intersectionIds) {
    const intersection = state.board.intersections.find((i) => i.id === intersectionId);
    const owner = intersection?.building?.ownerId;
    if (!owner || owner === state.currentPlayerId) continue;

    const victim = state.players.find((p) => p.id === owner);
    if (victim && totalResourceCards(victim.resources) > 0) candidates.add(owner);
  }
  return [...candidates];
}

/**
 * Picks one card uniformly at random from a hand, weighted by how many of each
 * resource the victim holds — equivalent to drawing a random card face-down.
 * Injectable RNG so tests can force a specific outcome.
 */
export function pickRandomResource(resources: ResourceCount, rng: RNG): ResourceType | null {
  const total = totalResourceCards(resources);
  if (total === 0) return null;

  let index = Math.floor(rng() * total);
  for (const resource of RESOURCE_TYPES) {
    index -= resources[resource];
    if (index < 0) return resource;
  }
  // Only reachable if rng() returned exactly 1; fall back to the last held resource.
  return RESOURCE_TYPES.filter((r) => resources[r] > 0).pop() ?? null;
}

/** Validates a proposed discard selection against what the player owes and holds. */
export function canDiscard(
  state: GameState,
  playerId: string,
  selection: Partial<ResourceCount>
): RobberCheck {
  const requirement = state.pendingDiscards.find((d) => d.playerId === playerId);
  if (!requirement) return no('You do not need to discard.');

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return no('Unknown player.');

  let selectedTotal = 0;
  for (const resource of RESOURCE_TYPES) {
    const amount = selection[resource] ?? 0;
    if (amount < 0) return no('Discard amounts cannot be negative.');
    if (amount > player.resources[resource]) {
      return no(`You do not have ${amount} ${resource} to discard.`);
    }
    selectedTotal += amount;
  }

  if (selectedTotal !== requirement.required) {
    return no(`You must discard exactly ${requirement.required} cards, not ${selectedTotal}.`);
  }
  return OK;
}
