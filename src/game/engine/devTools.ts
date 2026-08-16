// TEMPORARY (Sprint 2 only): lets developers and tests attach buildings to intersections
// so the production pipeline can be exercised before real settlement placement exists
// in Sprint 3. Not reachable from the normal player flow — DEV panel and tests only.

import type {
  BuildingType,
  DevelopmentCardType,
  GameState,
  HexTile,
} from '../models/types';
import { PIECE_LIMITS } from '../models/types';
import { placeBuilding, withScoringRefreshed } from './construction';

/**
 * Places a building directly, bypassing the placement *rules* — but not the piece
 * accounting. Skipping the supply bookkeeping used to leave states where a player
 * had more buildings on the board than pieces taken from their supply, which the
 * state invariants (rightly) reject. Delegates to the real construction helper so
 * pieces, counters and scoring all stay consistent; only legality is skipped.
 */
export function devPlaceBuilding(
  state: GameState,
  intersectionId: string,
  ownerId: string,
  type: BuildingType
): GameState {
  if (!state.players.some((p) => p.id === ownerId)) {
    throw new Error(`devPlaceBuilding: unknown player ${ownerId}`);
  }
  if (!state.board.intersections.some((i) => i.id === intersectionId)) {
    throw new Error(`devPlaceBuilding: unknown intersection ${intersectionId}`);
  }

  const existing = state.board.intersections.find((i) => i.id === intersectionId)?.building;

  // Overwriting someone else's building would silently consume a piece that never
  // comes back, so hand the displaced piece to its owner first.
  let base = state;
  if (existing && !(existing.type === 'settlement' && existing.ownerId === ownerId)) {
    base = returnBuildingPiece(state, existing.ownerId, existing.type);
  }

  // Upgrading a settlement to a city returns the settlement piece; placing a city on
  // an empty corner would otherwise return a piece that was never taken out.
  if (type === 'city' && !existing) {
    const withSettlement = placeBuilding(base, ownerId, intersectionId, 'settlement', {
      free: true,
    });
    return placeBuilding(withSettlement, ownerId, intersectionId, 'city', { free: true });
  }

  return placeBuilding(base, ownerId, intersectionId, type, { free: true });
}

/** Gives a displaced building's piece back to its owner's supply. */
function returnBuildingPiece(
  state: GameState,
  ownerId: string,
  type: BuildingType
): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === ownerId
        ? {
            ...player,
            piecesRemaining: {
              ...player.piecesRemaining,
              [type]: Math.min(PIECE_LIMITS[type], player.piecesRemaining[type] + 1),
            },
            settlementsBuilt:
              type === 'settlement'
                ? Math.max(0, player.settlementsBuilt - 1)
                : player.settlementsBuilt,
            citiesBuilt:
              type === 'city' ? Math.max(0, player.citiesBuilt - 1) : player.citiesBuilt,
          }
        : player
    ),
  };
}

/** Tops up a player's resources so build flows can be exercised during development. */
export function devGrantResources(
  state: GameState,
  playerId: string,
  amount = 3
): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            resources: {
              brick: player.resources.brick + amount,
              lumber: player.resources.lumber + amount,
              wool: player.resources.wool + amount,
              grain: player.resources.grain + amount,
              ore: player.resources.ore + amount,
            },
          }
        : player
    ),
  };
}

/** Tops up every player's resources at once — useful for exercising trades in the browser. */
export function devGrantResourcesToAll(state: GameState, amount = 3): GameState {
  return state.players.reduce((acc, player) => devGrantResources(acc, player.id, amount), state);
}

/**
 * Puts a specific development card into a player's hand, acquired on an earlier
 * turn so it is immediately playable. Bypasses the deck and the cost on purpose.
 */
export function devGiveDevelopmentCard(
  state: GameState,
  playerId: string,
  type: DevelopmentCardType
): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            developmentCards: [
              ...player.developmentCards,
              {
                // Counted across hand *and* played pile: the hand length alone
                // repeats once a granted card is played, which produced colliding
                // card IDs (and duplicate React keys in the card list).
                id: `dev-granted-${type}-${
                  player.developmentCards.length + player.playedDevelopmentCards.length
                }-${state.turnNumber}`,
                type,
                // Zero means "acquired long ago", so it is playable right now.
                acquiredTurnNumber: 0,
              },
            ],
          }
        : player
    ),
  };
}

/**
 * Removes every building from the board — useful for resetting a DEV experiment.
 * Returns the pieces to their owners' supplies and rescores, so the state stays
 * internally consistent rather than leaving players short of pieces they no
 * longer have on the board.
 */
export function devClearBuildings(state: GameState): GameState {
  const intersections = state.board.intersections.map((intersection) =>
    intersection.building ? { ...intersection, building: null } : intersection
  );

  const players = state.players.map((player) => ({
    ...player,
    piecesRemaining: {
      ...player.piecesRemaining,
      settlement: PIECE_LIMITS.settlement,
      city: PIECE_LIMITS.city,
    },
    settlementsBuilt: 0,
    citiesBuilt: 0,
  }));

  return withScoringRefreshed({
    ...state,
    players,
    board: { ...state.board, intersections },
  });
}

/** First hex matching a terrain and number token — the usual way tests pick a target hex. */
export function findHex(
  state: GameState,
  predicate: (hex: HexTile) => boolean
): HexTile | undefined {
  return state.board.hexes.find(predicate);
}
