import type { CSSProperties } from 'react';
import type { DevelopmentCardType, GameState, Player } from '../../game/models/types';
import { DEV_CARD_DISPLAY } from '../../data/terrainTheme';

interface PrivateDevCardsProps {
  game: GameState;
  player: Player;
  onPlay: (type: DevelopmentCardType) => void;
  onHide: () => void;
}

/**
 * The actual card identities, shown only after a correct PIN. This overlay is the
 * ONLY place in the whole app where a player's hand is rendered by name — nowhere
 * else, including this same player's own sidebar, ever names their cards. Cards
 * fan out and flip face-up on reveal, like a hand actually being looked at.
 */
export function PrivateDevCards({ game, player, onPlay, onHide }: PrivateDevCardsProps) {
  const inActionPhase = game.turnPhase === 'AWAITING_ACTIONS';
  const isCurrentTurn = player.id === game.currentPlayerId;
  const cards = player.developmentCards;
  const mid = (cards.length - 1) / 2;

  return (
    <div className="modal-backdrop private-cards-backdrop" onClick={onHide}>
      <div className="private-cards" onClick={(e) => e.stopPropagation()}>
        <header className="private-cards__header">
          <h2>Your Hand</h2>
          <button type="button" className="trade-modal__close" onClick={onHide} aria-label="Hide cards">
            ×
          </button>
        </header>

        {cards.length === 0 ? (
          <p className="dev-panel-cards__empty">No cards yet.</p>
        ) : (
          <div className="card-fan">
            {cards.map((card, i) => {
              const display = DEV_CARD_DISPLAY[card.type];
              const isVictoryPoint = card.type === 'victoryPoint';
              const boughtThisTurn = card.acquiredTurnNumber >= game.turnNumber;
              const playable =
                !isVictoryPoint &&
                !boughtThisTurn &&
                isCurrentTurn &&
                inActionPhase &&
                !game.hasPlayedDevCardThisTurn;
              const offset = i - mid;

              return (
                <div
                  key={card.id}
                  className="card-fan__slot"
                  style={{
                    '--fan-rotate': `${offset * 6}deg`,
                    '--fan-lift': `${Math.abs(offset) * 5}px`,
                    animationDelay: `${i * 70}ms`,
                  } as CSSProperties}
                >
                  <div
                    className={`dev-card-face${boughtThisTurn ? ' dev-card-face--fresh' : ''}`}
                  >
                    <img
                      className="dev-card-face__art"
                      src={display.art}
                      alt={display.label}
                      draggable={false}
                    />
                    {boughtThisTurn && !isVictoryPoint && (
                      <span className="dev-card-face__fresh-tag">Bought this turn</span>
                    )}
                    {!isVictoryPoint && (
                      <button
                        type="button"
                        className="btn btn--small btn--primary dev-card-face__play"
                        disabled={!playable}
                        onClick={() => onPlay(card.type)}
                      >
                        Play
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button type="button" className="btn btn--ghost private-cards__hide-btn" onClick={onHide}>
          Hide Cards
        </button>
      </div>
    </div>
  );
}
