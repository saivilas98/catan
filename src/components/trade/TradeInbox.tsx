import type { GameState, ResourceCount } from '../../game/models/types';
import { RESOURCE_TYPES } from '../../game/models/types';
import { RESOURCE_DISPLAY } from '../../data/terrainTheme';

interface TradeInboxProps {
  game: GameState;
  onAccept: (playerId: string, tradeId: string) => void;
  onReject: (playerId: string, tradeId: string) => void;
  onCancel: (tradeId: string) => void;
}

function bundleText(bundle: Partial<ResourceCount>): string {
  return RESOURCE_TYPES.filter((r) => (bundle[r] ?? 0) > 0)
    .map((r) => `${bundle[r]} ${RESOURCE_DISPLAY[r].icon}`)
    .join(' ');
}

function playerName(game: GameState, id: string): string {
  return game.players.find((p) => p.id === id)?.name ?? id;
}

/** Pending trades, with accept/reject controls for whichever players may respond. */
export function TradeInbox({ game, onAccept, onReject, onCancel }: TradeInboxProps) {
  const pending = game.tradeOffers.filter((t) => t.status === 'PENDING');
  if (pending.length === 0) return null;

  return (
    <section className="trade-inbox">
      <h3 className="trade-inbox__title">Trade Requests ({pending.length})</h3>
      <ul className="trade-inbox__list">
        {pending.map((trade) => {
          const responders = trade.targetPlayerId
            ? [trade.targetPlayerId]
            : game.players.map((p) => p.id).filter((id) => id !== trade.proposerId);

          return (
            <li key={trade.id} className="trade-offer-card">
              <p className="trade-offer-card__summary">
                <strong>{playerName(game, trade.proposerId)}</strong> offers{' '}
                <span className="trade-offer-card__bundle">{bundleText(trade.offeredResources)}</span>{' '}
                for{' '}
                <span className="trade-offer-card__bundle">
                  {bundleText(trade.requestedResources)}
                </span>
                {trade.targetPlayerId === null && (
                  <span className="trade-offer-card__tag">open to all</span>
                )}
              </p>
              <div className="trade-offer-card__actions">
                {responders.map((responderId) => (
                  <div key={responderId} className="trade-offer-card__responder">
                    <span>{playerName(game, responderId)}:</span>
                    <button
                      type="button"
                      className="btn btn--small btn--primary"
                      onClick={() => onAccept(responderId, trade.id)}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn btn--small btn--ghost"
                      onClick={() => onReject(responderId, trade.id)}
                    >
                      Reject
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn--small btn--quiet"
                  onClick={() => onCancel(trade.id)}
                >
                  Cancel (proposer)
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
