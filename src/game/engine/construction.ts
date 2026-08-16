// Construction state transitions. Every build is atomic: nothing is deducted or
// placed until every check has passed.

import type {
  Building,
  BuildingType,
  GameState,
  PieceType,
  Player,
  ResourceType,
  Road,
} from '../models/types';
import { PIECE_COSTS } from '../models/types';
import { withScoringRefreshed as refreshScoring } from '../rules/scoring';

// Scoring lives in rules/scoring.ts — the single authoritative calculation. Both
// placement helpers below refresh it, because a road can change Longest Road and a
// settlement can sever an opponent's network and take theirs away.
export { withScoringRefreshed } from '../rules/scoring';

function payFor(player: Player, piece: PieceType): Player {
  const resources = { ...player.resources };
  for (const [resource, amount] of Object.entries(PIECE_COSTS[piece])) {
    resources[resource as ResourceType] -= amount ?? 0;
  }
  return { ...player, resources };
}

interface UpdatePlayerOptions {
  /** Skip the resource cost — used during free setup placements. */
  free?: boolean;
}

function updatePlayerForBuild(
  state: GameState,
  playerId: string,
  piece: PieceType,
  options: UpdatePlayerOptions = {}
): Player[] {
  return state.players.map((player) => {
    if (player.id !== playerId) return player;

    let next = options.free ? player : payFor(player, piece);
    next = {
      ...next,
      piecesRemaining: {
        ...next.piecesRemaining,
        [piece]: next.piecesRemaining[piece] - 1,
      },
    };

    switch (piece) {
      case 'road':
        return { ...next, roadsBuilt: next.roadsBuilt + 1 };
      case 'settlement':
        return { ...next, settlementsBuilt: next.settlementsBuilt + 1 };
      case 'city':
        // Upgrading returns the settlement piece to the player's supply.
        return {
          ...next,
          citiesBuilt: next.citiesBuilt + 1,
          settlementsBuilt: next.settlementsBuilt - 1,
          piecesRemaining: {
            ...next.piecesRemaining,
            settlement: next.piecesRemaining.settlement + 1,
          },
        };
      default:
        return next;
    }
  });
}

/** Places a road on an edge. Assumes validation already passed. */
export function placeRoad(
  state: GameState,
  playerId: string,
  edgeId: string,
  options: UpdatePlayerOptions = {}
): GameState {
  const road: Road = {
    id: `road-${playerId}-${edgeId}`,
    type: 'road',
    ownerId: playerId,
    edgeId,
  };

  const edges = state.board.edges.map((edge) =>
    edge.id === edgeId ? { ...edge, road } : edge
  );

  // A new road can win or lose Longest Road, so rescore immediately.
  return refreshScoring({
    ...state,
    players: updatePlayerForBuild(state, playerId, 'road', options),
    board: { ...state.board, edges },
  });
}

/** Places a settlement or upgrades to a city. Assumes validation already passed. */
export function placeBuilding(
  state: GameState,
  playerId: string,
  intersectionId: string,
  type: BuildingType,
  options: UpdatePlayerOptions = {}
): GameState {
  const building: Building = {
    id: `${type}-${playerId}-${intersectionId}`,
    type,
    ownerId: playerId,
    intersectionId,
  };

  const intersections = state.board.intersections.map((intersection) =>
    intersection.id === intersectionId ? { ...intersection, building } : intersection
  );

  const next: GameState = {
    ...state,
    players: updatePlayerForBuild(state, playerId, type, options),
    board: { ...state.board, intersections },
  };

  // A settlement can sever an opponent's road network, so rescore everyone.
  return refreshScoring(next);
}
