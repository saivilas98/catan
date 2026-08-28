import type { GameState } from '../../game/models/types';
import { phaseInstruction } from './phaseInstruction';

interface EndTurnBarProps {
  game: GameState;
  rolling: boolean;
  onEndTurn: () => void;
}

/**
 * Anchored at the bottom of the left sidebar, outside the scrollable console —
 * the game's most-pressed button, and the trigger for the pass-the-laptop
 * curtain, so it stays reachable no matter how tall the console above it gets.
 */
export function EndTurnBar({ game, rolling, onEndTurn }: EndTurnBarProps) {
  const blocked = phaseInstruction(game) !== null;
  const isSpecialBuilding = game.turnPhase === 'SPECIAL_BUILDING';

  return (
    <div className="end-turn-bar">
      <button
        type="button"
        className="end-turn-bar__btn"
        onClick={onEndTurn}
        disabled={rolling || blocked}
      >
        {isSpecialBuilding ? 'Pass' : 'End Turn'}
      </button>
    </div>
  );
}
