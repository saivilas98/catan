import type { DiceResult } from '../../game/models/types';
import { Die } from './Die';

interface DiceRollOverlayProps {
  visible: boolean;
  rolling: boolean;
  dice: DiceResult | null;
}

/**
 * The roll, shown big at the board's own center — everyone at the table is
 * already looking there, so this is what actually gets seen, instead of the
 * result being tucked into whichever player's own sidebar happened to roll.
 * Purely presentational: App.tsx owns visibility/timing (see
 * DICE_OVERLAY_HOLD_MS), this just renders whatever it's handed.
 */
export function DiceRollOverlay({ visible, rolling, dice }: DiceRollOverlayProps) {
  if (!visible) return null;
  const shown = rolling ? null : dice;

  return (
    <div className="dice-overlay" aria-live="polite">
      <div className="dice-overlay__dice">
        <Die value={shown?.die1 ?? null} rolling={rolling} />
        <Die value={shown?.die2 ?? null} rolling={rolling} />
      </div>
      {shown && <p className="dice-overlay__total">{shown.total}</p>}
    </div>
  );
}
