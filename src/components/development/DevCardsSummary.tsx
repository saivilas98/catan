import type { GameState } from '../../game/models/types';
import { DEVELOPMENT_CARD_COST } from '../../game/models/types';
import { canAffordDevelopmentCard } from '../../game/rules/development';
import { RESOURCE_DISPLAY } from '../../data/terrainTheme';

interface DevCardsSummaryProps {
  game: GameState;
  onBuy: () => void;
  onView: () => void;
}

/**
 * The left-sidebar Development section. Deliberately shows nothing about which
 * cards the player holds — only a count. Identities are only ever revealed behind
 * the PIN-gated "View My Cards" overlay, even for the player whose turn it is.
 */
export function DevCardsSummary({ game, onBuy, onView }: DevCardsSummaryProps) {
  const player = game.players.find((p) => p.id === game.currentPlayerId);
  if (!player) return null;

  const inActionPhase = game.turnPhase === 'AWAITING_ACTIONS';
  const canBuy =
    inActionPhase && canAffordDevelopmentCard(game, player.id) && game.developmentDeck.length > 0;

  return (
    <section className="dev-summary">
      <h3 className="dev-summary__title">Development</h3>
      <p className="dev-summary__count">
        Development Cards: <strong>{player.developmentCards.length}</strong>
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
