import { useEffect, useState } from 'react';
import type { GameState, ResourceCount, ResourceType } from '../../game/models/types';
import { countResources, RESOURCE_TYPES } from '../../game/models/types';
import { totalResourceCards } from '../../game/rules/robber';
import { PLAYER_COLOR_TEXT_HEX, RESOURCE_DISPLAY } from '../../data/terrainTheme';
import { ResourceStepper } from '../trade/ResourceStepper';

interface DiscardModalProps {
  game: GameState;
  onDiscard: (playerId: string, selection: Partial<ResourceCount>) => void;
}

/**
 * Handles one discard at a time. Because everyone shares a laptop, each player gets
 * a hand-off screen first, so the previous player's selections are never on screen
 * when the next player takes over.
 */
export function DiscardModal({ game, onDiscard }: DiscardModalProps) {
  const requirement = game.pendingDiscards[0];
  const [selection, setSelection] = useState<Partial<ResourceCount>>({});
  const [revealed, setRevealed] = useState(false);

  const playerId = requirement?.playerId;

  // Reset the private view whenever the discard passes to a different player.
  useEffect(() => {
    setSelection({});
    setRevealed(false);
  }, [playerId]);

  if (!requirement) return null;
  const player = game.players.find((p) => p.id === requirement.playerId);
  if (!player) return null;

  const selectedTotal = countResources(selection);
  const handSize = totalResourceCards(player.resources);
  const complete = selectedTotal === requirement.required;

  if (!revealed) {
    return (
      <div className="modal-backdrop">
        <div className="handoff-modal">
          <p className="handoff-modal__eyebrow">Robber!</p>
          <h2 className="handoff-modal__title">
            Pass the laptop to{' '}
            <span style={{ color: PLAYER_COLOR_TEXT_HEX[player.color] }}>{player.name}</span>
          </h2>
          <p className="handoff-modal__body">
            {player.name} holds {handSize} resource cards and must discard{' '}
            {requirement.required}.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => setRevealed(true)}>
            I am {player.name} — show my cards
          </button>
          {game.pendingDiscards.length > 1 && (
            <p className="handoff-modal__queue">
              {game.pendingDiscards.length - 1} more player
              {game.pendingDiscards.length > 2 ? 's' : ''} still to discard
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="discard-modal">
        <header className="discard-modal__header">
          <h2>
            <span style={{ color: PLAYER_COLOR_TEXT_HEX[player.color] }}>{player.name}</span>, discard{' '}
            {requirement.required}
          </h2>
          <p className="discard-modal__sub">
            You have {handSize} cards — over the limit of 7.
          </p>
        </header>

        <div className="discard-modal__list">
          {RESOURCE_TYPES.map((resource: ResourceType) => (
            <div key={resource} className="discard-row">
              <span className="discard-row__held">
                {RESOURCE_DISPLAY[resource].icon} {player.resources[resource]}
              </span>
              <ResourceStepper
                resource={resource}
                value={selection[resource] ?? 0}
                max={player.resources[resource]}
                onChange={(next) => setSelection((prev) => ({ ...prev, [resource]: next }))}
              />
            </div>
          ))}
        </div>

        <p className={`discard-modal__count${complete ? ' discard-modal__count--ok' : ''}`}>
          Selected {selectedTotal} / {requirement.required}
        </p>

        <button
          type="button"
          className="btn btn--primary"
          disabled={!complete}
          onClick={() => onDiscard(player.id, selection)}
        >
          CONFIRM DISCARD
        </button>
      </div>
    </div>
  );
}
