import type { GameState } from '../../game/models/types';

/**
 * The one thing the game is waiting on, phrased for the active player. Shared by
 * TurnPanel (to show the notice) and EndTurnBar (to know whether ending the turn
 * is currently blocked) without either component owning the other's state.
 */
export function phaseInstruction(game: GameState): string | null {
  switch (game.turnPhase) {
    case 'DISCARDING':
      return '7 rolled — players over 7 cards must discard.';
    case 'MOVING_ROBBER':
      return game.robberMoveReason === 'KNIGHT'
        ? 'Knight played — choose a hex for the robber.'
        : '7 rolled — choose a hex for the robber.';
    case 'STEALING':
      return 'Choose an opponent to rob.';
    case 'ROAD_BUILDING':
      return `Road Building — place ${game.roadBuildingRoadsRemaining} more free road${
        game.roadBuildingRoadsRemaining === 1 ? '' : 's'
      }.`;
    default:
      return null;
  }
}
