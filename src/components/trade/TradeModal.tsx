import { useState } from 'react';
import type { GameState, ResourceCount, ResourceType } from '../../game/models/types';
import { countResources, RESOURCE_TYPES } from '../../game/models/types';
import { getBestTradeRate } from '../../game/rules/trade';
import { getCurrentPlayer } from '../../game/engine/gameEngine';
import { PLAYER_COLOR_HEX, RESOURCE_DISPLAY } from '../../data/terrainTheme';
import { ResourceStepper } from './ResourceStepper';

interface TradeModalProps {
  game: GameState;
  onClose: () => void;
  onProposeTrade: (
    targetPlayerId: string | null,
    offered: Partial<ResourceCount>,
    requested: Partial<ResourceCount>
  ) => void;
  onBankTrade: (give: ResourceType, receive: ResourceType) => void;
}

type Tab = 'players' | 'bank';

function emptyBundle(): Partial<ResourceCount> {
  return {};
}

export function TradeModal({ game, onClose, onProposeTrade, onBankTrade }: TradeModalProps) {
  const [tab, setTab] = useState<Tab>('players');
  const currentPlayer = getCurrentPlayer(game);
  const otherPlayers = game.players.filter((p) => p.id !== currentPlayer.id);

  const [offered, setOffered] = useState<Partial<ResourceCount>>(emptyBundle());
  const [requested, setRequested] = useState<Partial<ResourceCount>>(emptyBundle());
  const [target, setTarget] = useState<string | 'ALL'>('ALL');

  const [give, setGive] = useState<ResourceType>('brick');
  const [receive, setReceive] = useState<ResourceType>('lumber');

  const setOfferedAmount = (resource: ResourceType, amount: number) =>
    setOffered((prev) => ({ ...prev, [resource]: amount }));
  const setRequestedAmount = (resource: ResourceType, amount: number) =>
    setRequested((prev) => ({ ...prev, [resource]: amount }));

  const offeredTotal = countResources(offered);
  const requestedTotal = countResources(requested);
  const canSend = offeredTotal > 0 && requestedTotal > 0;

  const handleSend = () => {
    onProposeTrade(target === 'ALL' ? null : target, offered, requested);
    setOffered(emptyBundle());
    setRequested(emptyBundle());
  };

  const bankRate = getBestTradeRate(game, currentPlayer.id, give);
  const canGiveBank = currentPlayer.resources[give] >= bankRate;
  const receiveOptions = RESOURCE_TYPES.filter((r) => r !== give);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="trade-modal" onClick={(e) => e.stopPropagation()}>
        <header className="trade-modal__header">
          <h2>Trade</h2>
          <button type="button" className="trade-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="trade-modal__tabs">
          <button
            type="button"
            className={`trade-tab${tab === 'players' ? ' trade-tab--active' : ''}`}
            onClick={() => setTab('players')}
          >
            Trade with Players
          </button>
          <button
            type="button"
            className={`trade-tab${tab === 'bank' ? ' trade-tab--active' : ''}`}
            onClick={() => setTab('bank')}
          >
            Trade with Bank
          </button>
        </div>

        <div className="trade-modal__your-resources">
          <span className="trade-modal__section-title">Your Resources</span>
          <div className="resource-row">
            {RESOURCE_TYPES.map((r) => (
              <span key={r} className="resource-chip resource-chip--held">
                <span className="resource-chip__icon">{RESOURCE_DISPLAY[r].icon}</span>
                <span className="resource-chip__count">{currentPlayer.resources[r]}</span>
              </span>
            ))}
          </div>
        </div>

        {tab === 'players' ? (
          <div className="trade-modal__body">
            <div className="trade-columns">
              <div className="trade-column">
                <span className="trade-modal__section-title">You Offer</span>
                {RESOURCE_TYPES.map((r) => (
                  <ResourceStepper
                    key={r}
                    resource={r}
                    value={offered[r] ?? 0}
                    max={currentPlayer.resources[r]}
                    onChange={(v) => setOfferedAmount(r, v)}
                  />
                ))}
              </div>
              <div className="trade-column">
                <span className="trade-modal__section-title">You Request</span>
                {RESOURCE_TYPES.map((r) => (
                  <ResourceStepper
                    key={r}
                    resource={r}
                    value={requested[r] ?? 0}
                    onChange={(v) => setRequestedAmount(r, v)}
                  />
                ))}
              </div>
            </div>

            <div className="trade-target">
              <span className="trade-modal__section-title">Trade With</span>
              <div className="trade-target__options">
                {otherPlayers.map((p) => (
                  <label key={p.id} className="trade-target__option">
                    <input
                      type="radio"
                      name="trade-target"
                      checked={target === p.id}
                      onChange={() => setTarget(p.id)}
                    />
                    <span
                      className="trade-target__swatch"
                      style={{ background: PLAYER_COLOR_HEX[p.color] }}
                    />
                    {p.name}
                  </label>
                ))}
                <label className="trade-target__option">
                  <input
                    type="radio"
                    name="trade-target"
                    checked={target === 'ALL'}
                    onChange={() => setTarget('ALL')}
                  />
                  Everyone
                </label>
              </div>
            </div>

            <button
              type="button"
              className="btn btn--primary trade-send-btn"
              disabled={!canSend}
              onClick={handleSend}
            >
              SEND TRADE
            </button>
          </div>
        ) : (
          <div className="trade-modal__body">
            <div className="bank-trade">
              <label className="bank-trade__field">
                Give
                <select value={give} onChange={(e) => setGive(e.target.value as ResourceType)}>
                  {RESOURCE_TYPES.map((r) => (
                    <option key={r} value={r}>
                      {RESOURCE_DISPLAY[r].icon} {RESOURCE_DISPLAY[r].label} (have{' '}
                      {currentPlayer.resources[r]})
                    </option>
                  ))}
                </select>
              </label>

              <p className="bank-trade__rate">
                Rate: {bankRate}:1 {bankRate < 4 ? '(port)' : '(standard)'}
              </p>

              <label className="bank-trade__field">
                Receive
                <select
                  value={receive}
                  onChange={(e) => setReceive(e.target.value as ResourceType)}
                >
                  {receiveOptions.map((r) => (
                    <option key={r} value={r}>
                      {RESOURCE_DISPLAY[r].icon} {RESOURCE_DISPLAY[r].label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="btn btn--primary trade-send-btn"
                disabled={!canGiveBank}
                onClick={() => onBankTrade(give, receive)}
              >
                TRADE {bankRate} {RESOURCE_DISPLAY[give].icon} → 1 {RESOURCE_DISPLAY[receive].icon}
              </button>
              {!canGiveBank && (
                <p className="bank-trade__hint">
                  You need {bankRate} {RESOURCE_DISPLAY[give].label} to make this trade.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
