// Resource production. Deliberately built as a general pipeline:
//   dice number -> producing hexes -> adjacent buildings -> per-player awards -> new state
// so that when settlements and cities become placeable, nothing here needs to change.

import type {
  Board,
  GameState,
  HexTile,
  ProductionAward,
  ResourceCount,
  ResourceType,
} from '../models/types';
import { BUILDING_YIELD } from '../models/types';
import { ROBBER_ROLL } from './dice';

/**
 * Every hex that would produce on this dice number: matching token, not desert,
 * and not currently blocked by the robber.
 */
export function getProducingHexes(
  board: Board,
  diceNumber: number,
  robberHexId?: string
): HexTile[] {
  if (diceNumber === ROBBER_ROLL) return [];
  return board.hexes.filter(
    (hex) =>
      hex.numberToken === diceNumber &&
      hex.resource !== null &&
      hex.id !== robberHexId
  );
}

/**
 * Which players collect from one hex, and how much. A player with several buildings
 * around the same hex collects from each of them.
 */
export function getPlayersReceivingResources(
  state: GameState,
  hex: HexTile
): ProductionAward[] {
  if (hex.resource === null) return [];
  const resource: ResourceType = hex.resource;
  const awards: ProductionAward[] = [];

  for (const intersectionId of hex.intersectionIds) {
    const intersection = state.board.intersections.find((i) => i.id === intersectionId);
    const building = intersection?.building;
    if (!building) continue;

    awards.push({
      playerId: building.ownerId,
      hexId: hex.id,
      resource,
      amount: BUILDING_YIELD[building.type],
    });
  }

  return awards;
}

/**
 * All awards for a dice number, across every producing hex. A settlement touching
 * three hexes that all show the rolled number yields three separate awards.
 */
export function getProductionAwards(state: GameState, diceNumber: number): ProductionAward[] {
  const hexes = getProducingHexes(state.board, diceNumber, state.robberHexId);
  return hexes.flatMap((hex) => getPlayersReceivingResources(state, hex));
}

/** Collapses awards into a per-player resource delta. */
export function summarizeAwards(
  awards: ProductionAward[]
): Map<string, Partial<ResourceCount>> {
  const byPlayer = new Map<string, Partial<ResourceCount>>();
  for (const award of awards) {
    const totals = byPlayer.get(award.playerId) ?? {};
    totals[award.resource] = (totals[award.resource] ?? 0) + award.amount;
    byPlayer.set(award.playerId, totals);
  }
  return byPlayer;
}

/** Applies a dice number's production, returning a new GameState and the awards granted. */
export function produceResources(
  state: GameState,
  diceNumber: number
): { state: GameState; awards: ProductionAward[] } {
  const awards = getProductionAwards(state, diceNumber);
  if (awards.length === 0) return { state, awards };

  const totalsByPlayer = summarizeAwards(awards);
  const players = state.players.map((player) => {
    const totals = totalsByPlayer.get(player.id);
    if (!totals) return player;

    const resources = { ...player.resources };
    for (const [resource, amount] of Object.entries(totals)) {
      resources[resource as ResourceType] += amount ?? 0;
    }
    return { ...player, resources };
  });

  return { state: { ...state, players }, awards };
}
