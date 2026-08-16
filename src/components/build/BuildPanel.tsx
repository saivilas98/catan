import type { GameState, PieceType } from '../../game/models/types';
import { PIECE_COSTS } from '../../game/models/types';
import { canAfford, hasPieceRemaining } from '../../game/rules/placement';
import { RESOURCE_DISPLAY } from '../../data/terrainTheme';
import type { PlacementMode } from '../board/HexBoard';

interface BuildPanelProps {
  game: GameState;
  mode: PlacementMode;
  validCount: number;
  onSelectMode: (mode: PlacementMode) => void;
}

const BUILDABLE: Array<{ piece: PieceType; label: string; mode: PlacementMode }> = [
  { piece: 'road', label: 'Road', mode: 'road' },
  { piece: 'settlement', label: 'Settlement', mode: 'settlement' },
  { piece: 'city', label: 'City', mode: 'city' },
];

/** Cost chips such as "🧱1 🌲1". */
function CostChips({ piece }: { piece: PieceType }) {
  return (
    <span className="build-cost">
      {Object.entries(PIECE_COSTS[piece]).map(([resource, amount]) => (
        <span key={resource} className="build-cost__item">
          {RESOURCE_DISPLAY[resource as keyof typeof RESOURCE_DISPLAY].icon}
          {amount}
        </span>
      ))}
    </span>
  );
}

export function BuildPanel({ game, mode, validCount, onSelectMode }: BuildPanelProps) {
  const playerId = game.currentPlayerId;
  const canBuildNow = game.phase === 'PLAYING' && game.hasRolledThisTurn;

  return (
    <section className="build-panel">
      <h3 className="build-panel__title">Build</h3>

      {!canBuildNow && <p className="build-panel__hint">Roll the dice before building.</p>}

      <div className="build-panel__options">
        {BUILDABLE.map(({ piece, label, mode: pieceMode }) => {
          const affordable = canAfford(game, playerId, piece);
          const hasPieces = hasPieceRemaining(game, playerId, piece);
          const active = mode === pieceMode;
          const disabled = !canBuildNow || !affordable || !hasPieces;

          return (
            <button
              key={piece}
              type="button"
              className={`build-option${active ? ' build-option--active' : ''}`}
              disabled={disabled}
              onClick={() => onSelectMode(active ? 'none' : pieceMode)}
              title={
                !hasPieces
                  ? `No ${label.toLowerCase()} pieces left`
                  : !affordable
                    ? 'Not enough resources'
                    : `Build a ${label.toLowerCase()}`
              }
            >
              <span className="build-option__label">{label}</span>
              <CostChips piece={piece} />
            </button>
          );
        })}
      </div>

      {mode !== 'none' && (
        <div className="build-panel__placing">
          <span>
            {validCount > 0
              ? `Select a highlighted spot (${validCount})`
              : 'No legal spots available'}
          </span>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => onSelectMode('none')}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
