interface RightDockProps {
  canOpenTrade: boolean;
  pendingTradeCount: number;
  onOpenTrade: () => void;
  onOpenLog: () => void;
}

/**
 * Floats over the board's right edge: the two actions about the wider game
 * state rather than your own hand — Trade (with other players/the bank) and
 * the Log. Mirrors LeftDock's shape on the opposite side.
 */
export function RightDock({ canOpenTrade, pendingTradeCount, onOpenTrade, onOpenLog }: RightDockProps) {
  return (
    <div className="side-dock side-dock--right">
      <div className="side-dock__actions">
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
          onClick={onOpenLog}
          aria-label="Game log"
          title="Game log"
        >
          📜
        </button>
      </div>
    </div>
  );
}
