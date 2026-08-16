// Placement legality. Every rule here works off the logical hex/intersection/edge
// graph — never pixel distance — so Longest Road and ports can reuse it later.

import type {
  Edge,
  GameState,
  Intersection,
  PieceType,
  ResourceCount,
  ResourceType,
} from '../models/types';
import { PIECE_COSTS } from '../models/types';

export interface PlacementCheck {
  valid: boolean;
  reason?: string;
}

const OK: PlacementCheck = { valid: true };

function no(reason: string): PlacementCheck {
  return { valid: false, reason };
}

export function getBuildingCost(piece: PieceType): Partial<ResourceCount> {
  return PIECE_COSTS[piece];
}

const RESOURCE_LABEL: Record<ResourceType, string> = {
  brick: 'Brick',
  lumber: 'Lumber',
  wool: 'Wool',
  grain: 'Grain',
  ore: 'Ore',
};

/** "3 Ore and 2 Grain" — so a refusal can say what is actually required. */
export function describeCost(piece: PieceType): string {
  const parts = Object.entries(getBuildingCost(piece)).map(
    ([resource, amount]) => `${amount} ${RESOURCE_LABEL[resource as ResourceType]}`
  );
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function findIntersection(state: GameState, id: string): Intersection | undefined {
  return state.board.intersections.find((i) => i.id === id);
}

export function findEdge(state: GameState, id: string): Edge | undefined {
  return state.board.edges.find((e) => e.id === id);
}

/** True when the player holds every resource the piece costs. */
export function canAfford(state: GameState, playerId: string, piece: PieceType): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  return Object.entries(getBuildingCost(piece)).every(
    ([resource, amount]) => player.resources[resource as ResourceType] >= (amount ?? 0)
  );
}

export function hasPieceRemaining(state: GameState, playerId: string, piece: PieceType): boolean {
  const player = state.players.find((p) => p.id === playerId);
  return !!player && player.piecesRemaining[piece] > 0;
}

/**
 * The distance rule: an intersection is buildable only if it and every directly
 * adjacent intersection are empty. This applies in setup and in normal play.
 */
export function satisfiesDistanceRule(state: GameState, intersectionId: string): PlacementCheck {
  const intersection = findIntersection(state, intersectionId);
  if (!intersection) return no('That location is not on the board.');
  if (intersection.building) {
    return no('You cannot build a settlement here because this spot is already occupied.');
  }

  const neighbourOccupied = intersection.intersectionIds.some(
    (id) => findIntersection(state, id)?.building
  );
  if (neighbourOccupied) {
    return no(
      'You cannot build a settlement here because an adjacent intersection is occupied.'
    );
  }
  return OK;
}

/** Whether the player owns a road on any edge touching this intersection. */
export function touchesOwnRoad(
  state: GameState,
  playerId: string,
  intersectionId: string
): boolean {
  const intersection = findIntersection(state, intersectionId);
  if (!intersection) return false;
  return intersection.edgeIds.some(
    (edgeId) => findEdge(state, edgeId)?.road?.ownerId === playerId
  );
}

/**
 * Road connectivity, walked over the real graph.
 * A road may attach to an endpoint when the player owns a building there, or owns
 * another road there — but an opponent's building at that endpoint blocks the
 * connection, so two of the player's roads never join *through* an enemy settlement.
 */
export function isRoadConnected(state: GameState, playerId: string, edge: Edge): boolean {
  return edge.intersectionIds.some((intersectionId) => {
    const intersection = findIntersection(state, intersectionId);
    if (!intersection) return false;

    const building = intersection.building;
    if (building) {
      // Own building connects; an opponent's building blocks this endpoint entirely.
      return building.ownerId === playerId;
    }

    return intersection.edgeIds.some((otherEdgeId) => {
      if (otherEdgeId === edge.id) return false;
      return findEdge(state, otherEdgeId)?.road?.ownerId === playerId;
    });
  });
}

export interface BuildRoadOptions {
  /** Skip the resource check — used for the free roads from Road Building. */
  ignoreCost?: boolean;
}

export function canBuildRoad(
  state: GameState,
  playerId: string,
  edgeId: string,
  options: BuildRoadOptions = {}
): PlacementCheck {
  const edge = findEdge(state, edgeId);
  if (!edge) return no('That edge is not on the board.');
  if (edge.road) return no('There is already a road on this edge.');
  if (!hasPieceRemaining(state, playerId, 'road')) {
    return no('You have no road pieces remaining.');
  }
  if (!isRoadConnected(state, playerId, edge)) {
    return no('Roads must connect to one of your roads, settlements, or cities.');
  }
  if (!options.ignoreCost && !canAfford(state, playerId, 'road')) {
    return no(`You need ${describeCost('road')} to build a road.`);
  }
  return OK;
}

export function canBuildSettlement(
  state: GameState,
  playerId: string,
  intersectionId: string
): PlacementCheck {
  if (!hasPieceRemaining(state, playerId, 'settlement')) {
    return no('You have no settlement pieces remaining.');
  }

  const distance = satisfiesDistanceRule(state, intersectionId);
  if (!distance.valid) return distance;

  // Standard Catan: outside setup, a new settlement must join your own road network.
  if (!touchesOwnRoad(state, playerId, intersectionId)) {
    return no('Settlements must be built on one of your own roads.');
  }
  if (!canAfford(state, playerId, 'settlement')) {
    return no(`You need ${describeCost('settlement')} to build a settlement.`);
  }
  return OK;
}

export function canBuildCity(
  state: GameState,
  playerId: string,
  intersectionId: string
): PlacementCheck {
  if (!hasPieceRemaining(state, playerId, 'city')) {
    return no('You have no city pieces remaining.');
  }

  const intersection = findIntersection(state, intersectionId);
  if (!intersection) return no('That location is not on the board.');

  const building = intersection.building;
  if (!building) return no('Cities can only be built by upgrading your own settlement.');
  if (building.ownerId !== playerId) return no('That building belongs to another player.');
  if (building.type === 'city') return no('There is already a city here.');

  if (!canAfford(state, playerId, 'city')) {
    return no(`You need ${describeCost('city')} to build a city.`);
  }
  return OK;
}

// ---------- Initial placement (setup) ----------

/** During setup a settlement is free, so only the distance rule applies. */
export function canPlaceInitialSettlement(
  state: GameState,
  playerId: string,
  intersectionId: string
): PlacementCheck {
  if (!hasPieceRemaining(state, playerId, 'settlement')) {
    return no('You have no settlement pieces remaining.');
  }
  return satisfiesDistanceRule(state, intersectionId);
}

/** During setup the road is free but must touch the settlement just placed. */
export function canPlaceInitialRoad(
  state: GameState,
  playerId: string,
  edgeId: string
): PlacementCheck {
  const edge = findEdge(state, edgeId);
  if (!edge) return no('That edge is not on the board.');
  if (edge.road) return no('There is already a road on this edge.');
  if (!hasPieceRemaining(state, playerId, 'road')) {
    return no('You have no road pieces remaining.');
  }
  if (!state.pendingSettlementId) {
    return no('Place your settlement before placing a road.');
  }
  if (!edge.intersectionIds.includes(state.pendingSettlementId)) {
    return no('Your first road must connect to the settlement you just placed.');
  }
  return OK;
}

// ---------- Helpers for highlighting valid targets in the UI ----------

export function getValidSettlementLocations(state: GameState, playerId: string): string[] {
  const check =
    state.phase === 'INITIAL_PLACEMENT' ? canPlaceInitialSettlement : canBuildSettlement;
  return state.board.intersections
    .filter((i) => check(state, playerId, i.id).valid)
    .map((i) => i.id);
}

export function getValidRoadLocations(state: GameState, playerId: string): string[] {
  if (state.phase === 'INITIAL_PLACEMENT') {
    return state.board.edges
      .filter((e) => canPlaceInitialRoad(state, playerId, e.id).valid)
      .map((e) => e.id);
  }

  // Road Building supplies free roads, so cost must not filter the highlights —
  // otherwise a player with no brick/lumber would see no legal targets at all.
  const ignoreCost = state.turnPhase === 'ROAD_BUILDING';
  return state.board.edges
    .filter((e) => canBuildRoad(state, playerId, e.id, { ignoreCost }).valid)
    .map((e) => e.id);
}

export function getValidCityLocations(state: GameState, playerId: string): string[] {
  return state.board.intersections
    .filter((i) => canBuildCity(state, playerId, i.id).valid)
    .map((i) => i.id);
}
