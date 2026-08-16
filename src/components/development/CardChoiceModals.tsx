import { useState } from 'react';
import type { GameState, ResourceCount, ResourceType } from '../../game/models/types';
import { countResources, RESOURCE_TYPES } from '../../game/models/types';
import { PLAYER_COLOR_HEX, RESOURCE_DISPLAY } from '../../data/terrainTheme';
import { ResourceStepper } from '../trade/ResourceStepper';

interface MonopolyModalProps {
  onConfirm: (resource: ResourceType) => void;
  onCancel: () => void;
}

export function MonopolyModal({ onConfirm, onCancel }: MonopolyModalProps) {
  const [resource, setResource] = useState<ResourceType | null>(null);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="choice-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="choice-modal__title">💰 Monopoly</h2>
        <p className="choice-modal__body">Choose a resource to take from every other player.</p>

        <div className="choice-modal__options">
          {RESOURCE_TYPES.map((r) => (
            <button
              key={r}
              type="button"
              className={`choice-chip${resource === r ? ' choice-chip--active' : ''}`}
              onClick={() => setResource(r)}
            >
              <span aria-hidden="true">{RESOURCE_DISPLAY[r].icon}</span>
              {RESOURCE_DISPLAY[r].label}
            </button>
          ))}
        </div>

        {/* Deliberately no counts — other players' holdings stay private until played. */}
        <p className="choice-modal__note">
          {resource
            ? `You will collect all ${RESOURCE_DISPLAY[resource].label} held by the other players.`
            : 'Select a resource to continue.'}
        </p>

        <div className="choice-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!resource}
            onClick={() => resource && onConfirm(resource)}
          >
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  );
}

interface YearOfPlentyModalProps {
  onConfirm: (selection: Partial<ResourceCount>) => void;
  onCancel: () => void;
}

export function YearOfPlentyModal({ onConfirm, onCancel }: YearOfPlentyModalProps) {
  const [selection, setSelection] = useState<Partial<ResourceCount>>({});
  const total = countResources(selection);
  const complete = total === 2;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="choice-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="choice-modal__title">🎁 Year of Plenty</h2>
        <p className="choice-modal__body">
          Take any 2 resources from the bank — the same twice, or two different ones.
        </p>

        <div className="choice-modal__steppers">
          {RESOURCE_TYPES.map((r) => (
            <ResourceStepper
              key={r}
              resource={r}
              value={selection[r] ?? 0}
              max={(selection[r] ?? 0) + Math.max(0, 2 - total)}
              onChange={(next) => setSelection((prev) => ({ ...prev, [r]: next }))}
            />
          ))}
        </div>

        <p className={`choice-modal__count${complete ? ' choice-modal__count--ok' : ''}`}>
          Selected {total} / 2
        </p>

        <div className="choice-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!complete}
            onClick={() => onConfirm(selection)}
          >
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  );
}

interface StealTargetModalProps {
  game: GameState;
  onSteal: (victimId: string) => void;
}

/** Shown when the robber lands next to more than one robbable opponent. */
export function StealTargetModal({ game, onSteal }: StealTargetModalProps) {
  const candidates = game.players.filter((p) => game.stealCandidateIds.includes(p.id));

  return (
    <div className="modal-backdrop">
      <div className="choice-modal">
        <h2 className="choice-modal__title">Choose who to rob</h2>
        <p className="choice-modal__body">
          You will take one random card from the player you pick.
        </p>

        <div className="choice-modal__options">
          {candidates.map((player) => (
            <button
              key={player.id}
              type="button"
              className="choice-chip"
              onClick={() => onSteal(player.id)}
            >
              <span
                className="trade-target__swatch"
                style={{ background: PLAYER_COLOR_HEX[player.color] }}
              />
              {player.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
