import type { GameState } from '../../game/models/types';
import { PLAYER_COLOR_HEX } from '../../data/terrainTheme';
import { getSetupRound } from '../../game/engine/setup';
import { phaseInstruction } from '../dice/phaseInstruction';

interface TopBarLiteProps {
  game: GameState;
  onOpenPlayers: () => void;
  onOpenMenu: () => void;
}

/**
 * Everything that used to be the top bar plus the whole player-rail, in one
 * thin strip: current player + whatever the game is waiting on, a tap target
 * for player details, and a menu for New Game / dev tools. No permanent stats
 * live here — see BottomDock and Popover for where those went.
 */
export function TopBarLite({ game, onOpenPlayers, onOpenMenu }: TopBarLiteProps) {
  const currentPlayer = game.players.find((p) => p.id === game.currentPlayerId)!;
  const isSetup = game.phase === 'INITIAL_PLACEMENT';
  const isSpecialBuilding = game.turnPhase === 'SPECIAL_BUILDING';
  const instruction = phaseInstruction(game);

  const statusText = isSetup
    ? `Setup ${getSetupRound(game)}/2 — ${
        game.setupStep === 'PLACE_SETTLEMENT' ? 'place a settlement' : 'place a road'
      }`
    : isSpecialBuilding
      ? `Special Building — ${currentPlayer.name} may build`
      : (instruction ?? `${currentPlayer.name}’s turn`);

  return (
    <header className="top-bar-lite">
      <span className="top-bar-lite__brand">CATAN</span>

      <div className="top-bar-lite__status">
        <span
          className="top-bar-lite__swatch"
          style={{ background: PLAYER_COLOR_HEX[currentPlayer.color] }}
          aria-hidden="true"
        />
        <span className="top-bar-lite__text">
          Turn {game.turnNumber} · {statusText}
        </span>
        {game.diceResult && (
          <span className="top-bar-lite__dice">🎲 {game.diceResult.total}</span>
        )}
      </div>

      <div className="top-bar-lite__right">
        <button
          type="button"
          className="top-bar-lite__avatars"
          onClick={onOpenPlayers}
          aria-label="View players"
        >
          {game.players.map((p) => (
            <span
              key={p.id}
              className={`top-bar-lite__avatar${p.id === game.currentPlayerId ? ' top-bar-lite__avatar--current' : ''}`}
              style={{ background: PLAYER_COLOR_HEX[p.color] }}
            />
          ))}
        </button>
        <button type="button" className="top-bar-lite__menu" onClick={onOpenMenu} aria-label="Menu">
          ≡
        </button>
      </div>
    </header>
  );
}
