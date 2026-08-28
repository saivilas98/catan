import type { ResourceCount } from '../../game/models/types';
import { RESOURCE_TYPES } from '../../game/models/types';
import { RESOURCE_DISPLAY } from '../../data/terrainTheme';

interface LeftDockProps {
  resources: ResourceCount;
  showOrdinaryActions: boolean;
  devCardCount: number;
  onOpenBuild: () => void;
  onOpenCards: () => void;
}

/**
 * Floats over the board's left edge: your own resource counts, plus the two
 * actions that only ever affect your own stuff (Build, Development cards).
 * Trade and the Log go in RightDock instead — they're about what everyone
 * else is doing, not your own hand.
 */
export function LeftDock({ resources, showOrdinaryActions, devCardCount, onOpenBuild, onOpenCards }: LeftDockProps) {
  return (
    <div className="side-dock side-dock--left">
      <div className="side-dock__resources">
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

      <div className="side-dock__divider" aria-hidden="true" />

      <div className="side-dock__actions">
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
          onClick={onOpenCards}
          aria-label="Development cards"
          title="Development cards"
        >
          🂠
          {devCardCount > 0 && <span className="dock-badge">{devCardCount}</span>}
        </button>
      </div>
    </div>
  );
}
