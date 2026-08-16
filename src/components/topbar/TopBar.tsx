import type { Player } from '../../game/models/types';
import { PLAYER_COLOR_HEX } from '../../data/terrainTheme';

interface TopBarProps {
  turnNumber: number;
  currentPlayer: Player;
  onNewGame: () => void;
}

/** A compact full-width bar so the board keeps the vertical space. */
export function TopBar({ turnNumber, currentPlayer, onNewGame }: TopBarProps) {
  return (
    <header className="top-bar">
      <span className="top-bar__brand">CATAN</span>
      <span className="top-bar__turn">Turn {turnNumber}</span>
      <span
        className="top-bar__player"
        style={{ color: PLAYER_COLOR_HEX[currentPlayer.color] }}
      >
        {currentPlayer.name}&rsquo;s Turn
      </span>
      <button type="button" className="btn btn--quiet top-bar__new-game" onClick={onNewGame}>
        New Game
      </button>
    </header>
  );
}
