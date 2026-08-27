import type { GameState } from '../../game/models/types';
import { DEVELOPMENT_CARD_COST } from '../../game/models/types';
import { canAffordDevelopmentCard } from '../../game/rules/development';
import { RESOURCE_DISPLAY } from '../../data/terrainTheme';

interface DevCardsSummaryProps {
  game: GameState;
  onBuy: () => void;
  onView: () => void;
  /**
   * In network mode, this device's own player — their card count is shown here
   * regardless of whose turn it is, since every device sees the live board at
   * once. Local mode omits this and falls back to the current player, since you
   * can only be looking at the screen during your own turn there.
   */
  viewerPlayerId?: string;
}

/**
 * The left-sidebar Development section. Deliberately shows nothing about which
 * cards the player holds — only a count. Identities are only ever revealed behind
 * the PIN-gated "View My Cards" overlay in local mode (network mode has no PIN —
 * this device already only ever received its own player's real cards).
 */
export function DevCardsSummary({ game, onBuy, onView, viewerPlayerId }: DevCardsSummaryProps) {
  const currentPlayer = game.players.find((p) => p.id === game.currentPlayerId);
  if (!currentPlayer) return null;
  const viewer = viewerPlayerId
    ? (game.players.find((p) => p.id === viewerPlayerId) ?? currentPlayer)
    : currentPlayer;
  const devCount =
    (viewer as typeof viewer & { developmentCardCount?: number }).developmentCardCount ??
    viewer.developmentCards.length;

  // Buying is only ever legal for the current player, regardless of who's viewing.
  const inActionPhase = game.turnPhase === 'AWAITING_ACTIONS' && viewer.id === currentPlayer.id;
  const canBuy =
    inActionPhase &&
    canAffordDevelopmentCard(game, currentPlayer.id) &&
    game.developmentDeck.length > 0;

  return (
    <section className="dev-summary">
      <h3 className="dev-summary__title">Development</h3>
      <p className="dev-summary__count">
        Development Cards: <strong>{devCount}</strong>
      </p>

      <button type="button" className="btn btn--ghost dev-summary__view-btn" onClick={onView}>
        View My Cards
      </button>

      <button
        type="button"
        className="btn btn--ghost dev-buy-btn"
        disabled={!canBuy}
        onClick={onBuy}
      >
        Buy Development Card
        <span className="build-cost">
          {Object.entries(DEVELOPMENT_CARD_COST).map(([resource, amount]) => (
            <span key={resource} className="build-cost__item">
              {RESOURCE_DISPLAY[resource as keyof typeof RESOURCE_DISPLAY].icon}
              {amount}
            </span>
          ))}
        </span>
      </button>
    </section>
  );
}
