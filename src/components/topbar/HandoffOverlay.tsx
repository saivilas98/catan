import type { CSSProperties } from 'react';
import type { Player } from '../../game/models/types';
import { PLAYER_COLOR_HEX } from '../../data/terrainTheme';

interface HandoffOverlayProps {
  player: Player;
  turnNumber: number;
  onContinue: () => void;
  /** True when this handoff is into a Special Building slot, not a real turn. */
  isSpecialBuilding?: boolean;
}

/**
 * A full-screen curtain in the next player's color, shown between turns on a
 * shared laptop. This is also a privacy feature: it covers the outgoing player's
 * exact resources the instant the turn ends, before the next player looks up.
 * (The private-cards view is already closed by the time this appears — see the
 * App-level effect that hides it on any currentPlayerId change.)
 */
export function HandoffOverlay({
  player,
  turnNumber,
  onContinue,
  isSpecialBuilding,
}: HandoffOverlayProps) {
  const color = PLAYER_COLOR_HEX[player.color];
  return (
    <div className="handoff-curtain" style={{ '--curtain-color': color } as CSSProperties}>
      <div className="handoff-curtain__content">
        <p className="handoff-modal__eyebrow">Pass the laptop</p>
        <span className="handoff-curtain__swatch" style={{ background: color }} />
        <h2 className="handoff-modal__title">{player.name}</h2>
        <p className="handoff-modal__body">
          {isSpecialBuilding ? 'Special Building Phase' : `Turn ${turnNumber}`} ·{' '}
          {player.victoryPoints} VP
        </p>
        <button type="button" className="btn btn--primary handoff-curtain__btn" onClick={onContinue}>
          {isSpecialBuilding ? `I am ${player.name} — Special Build` : `I am ${player.name} — Begin Turn`}
        </button>
      </div>
    </div>
  );
}
