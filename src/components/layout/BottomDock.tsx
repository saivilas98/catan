import type { GameState, ResourceCount } from '../../game/models/types';
import { RESOURCE_TYPES } from '../../game/models/types';
import { canRollDice } from '../../game/engine/gameEngine';
import { RESOURCE_DISPLAY } from '../../data/terrainTheme';
import { phaseInstruction } from '../dice/phaseInstruction';

interface BottomDockProps {
  game: GameState;
  resources: ResourceCount;
  rolling: boolean;
  showOrdinaryActions: boolean;
  pendingTradeCount: number;
  devCardCount: number;
  onRoll: () => void;
  onEndTurn: () => void;
  onOpenBuild: () => void;
  onOpenTrade: () => void;
  onOpenCards: () => void;
  onOpenLog: () => void;
}

/**
 * The one persistent strip below the board: your own resource counts on the
 * left, action triggers on the right, and a single primary button whose label
 * always names the one thing the game wants next — Roll, End Turn, or Pass
 * during a Special Building slot. Everything the icons open is a Popover; none
 * of them hold a permanent panel of their own.
 */
export function BottomDock({
  game,
  resources,
  rolling,
  showOrdinaryActions,
  pendingTradeCount,
  devCardCount,
  onRoll,
  onEndTurn,
  onOpenBuild,
  onOpenTrade,
  onOpenCards,
  onOpenLog,
}: BottomDockProps) {
  const mayRoll = canRollDice(game, game.currentPlayerId);
  const blocked = phaseInstruction(game) !== null;
  const isSpecialBuilding = game.turnPhase === 'SPECIAL_BUILDING';

  const primaryLabel = mayRoll ? 'Roll Dice' : isSpecialBuilding ? 'Pass' : 'End Turn';
  const primaryDisabled = rolling || (!mayRoll && blocked);
  const primaryOnClick = mayRoll ? onRoll : onEndTurn;

  const canOpenTrade = showOrdinaryActions || pendingTradeCount > 0;

  return (
    <div className="bottom-dock">
      <div className="bottom-dock__resources">
        {RESOURCE_TYPES.map((resource) => {
          const { icon, label } = RESOURCE_DISPLAY[resource];
          const count = resources[resource];
          return (
            <span
              key={resource}
              className={`dock-chip${count > 0 ? ' dock-chip--held' : ''}`}
              title={label}
            >
              <span aria-hidden="true">{icon}</span>
              {count}
            </span>
          );
        })}
      </div>

      <div className="bottom-dock__actions">
        <button
          type="button"
          className="dock-icon-btn"
          onClick={onOpenBuild}
          disabled={!showOrdinaryActions}
          aria-label="Build"
          title="Build"
        >
          🛠
        </button>
        <button
          type="button"
          className="dock-icon-btn"
          onClick={onOpenTrade}
          disabled={!canOpenTrade}
          aria-label="Trade"
          title="Trade"
        >
          🤝
          {pendingTradeCount > 0 && <span className="dock-badge">{pendingTradeCount}</span>}
        </button>
        <button
          type="button"
          className="dock-icon-btn"
          onClick={onOpenCards}
          aria-label="Development cards"
          title="Development cards"
        >
          🂠
          {devCardCount > 0 && <span className="dock-badge">{devCardCount}</span>}
        </button>
        <button
          type="button"
          className="dock-icon-btn"
          onClick={onOpenLog}
          aria-label="Game log"
          title="Game log"
        >
          📜
        </button>
        <button
          type="button"
          className="dock-primary-btn"
          onClick={primaryOnClick}
          disabled={primaryDisabled}
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
