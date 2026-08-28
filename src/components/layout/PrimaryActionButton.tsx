import type { GameState } from '../../game/models/types';
import { canRollDice } from '../../game/engine/gameEngine';
import { phaseInstruction } from '../dice/phaseInstruction';

interface PrimaryActionButtonProps {
  game: GameState;
  rolling: boolean;
  onRoll: () => void;
  onEndTurn: () => void;
}

/**
 * The one button that always does whatever the game wants next — Roll,
 * Pass (Special Building), or End Turn. Floats on its own next to the left
 * dock rather than living inside it, and reads as a single emoji rather than
 * a text label so its meaning comes from shape/position, not words.
 */
export function PrimaryActionButton({ game, rolling, onRoll, onEndTurn }: PrimaryActionButtonProps) {
  const mayRoll = canRollDice(game, game.currentPlayerId);
  const blocked = phaseInstruction(game) !== null;
  const isSpecialBuilding = game.turnPhase === 'SPECIAL_BUILDING';

  const label = mayRoll ? 'Roll Dice' : isSpecialBuilding ? 'Pass' : 'End Turn';
  const emoji = mayRoll ? '🎲' : isSpecialBuilding ? '⏭️' : '✅';
  const disabled = rolling || (!mayRoll && blocked);
  const onClick = mayRoll ? onRoll : onEndTurn;

  return (
    <button
      type="button"
      className="primary-action-btn"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {emoji}
    </button>
  );
}
