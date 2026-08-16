import { useState } from 'react';
import type { BuildingType, DevelopmentCardType, GameState } from '../../game/models/types';
import { validateBoard } from '../../game/board/boardValidator';

interface DevPanelProps {
  game: GameState;
  onPlaceTestBuilding: (hexId: string, type: BuildingType) => void;
  onPlaceOnPort: (portId: string) => void;
  onClearBuildings: () => void;
  onGrantResources: () => void;
  onGrantResourcesToAll: () => void;
  onGiveCard: (type: DevelopmentCardType) => void;
  onForceRoll: (die1: number, die2: number) => void;
}

/**
 * Development-only controls. These bypass game rules on purpose so the production
 * pipeline can be exercised before real building placement lands in Sprint 3.
 */
export function DevPanel({
  game,
  onPlaceTestBuilding,
  onPlaceOnPort,
  onClearBuildings,
  onGrantResources,
  onGrantResourcesToAll,
  onGiveCard,
  onForceRoll,
}: DevPanelProps) {
  const [open, setOpen] = useState(false);
  const validation = validateBoard(game.board);

  const producingHexes = game.board.hexes.filter((h) => h.numberToken !== null);
  const buildingCount = game.board.intersections.filter((i) => i.building).length;
  const [hexId, setHexId] = useState(producingHexes[0]?.id ?? '');
  const [buildingType, setBuildingType] = useState<BuildingType>('settlement');
  const selectedHex = game.board.hexes.find((h) => h.id === hexId);
  const [portId, setPortId] = useState(game.board.ports[0]?.id ?? '');

  return (
    <div className="dev-panel">
      <button type="button" className="dev-panel__toggle" onClick={() => setOpen((v) => !v)}>
        {open ? 'Close Dev' : 'DEV'}
      </button>
      {open && (
        <div className="dev-panel__body">
          <div className="dev-panel__section">
            <div>Seed: {game.seed}</div>
            <div>Hexes: {game.board.hexes.length}</div>
            <div>Intersections: {game.board.intersections.length}</div>
            <div>Edges: {game.board.edges.length}</div>
            <div>Phase: {game.phase} / {game.turnPhase}</div>
            <div>Turn: {game.turnNumber}</div>
            <div>Robber hex: {game.robberHexId}</div>
            <div>Test buildings: {buildingCount}</div>
            <div>Board valid: {validation.valid ? 'yes' : 'no'}</div>
            {!validation.valid && (
              <ul>
                {validation.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="dev-panel__section">
            <strong>Test building</strong>
            <select value={hexId} onChange={(e) => setHexId(e.target.value)}>
              {producingHexes.map((hex) => (
                <option key={hex.id} value={hex.id}>
                  {hex.terrain} · {hex.numberToken}
                </option>
              ))}
            </select>
            <select
              value={buildingType}
              onChange={(e) => setBuildingType(e.target.value as BuildingType)}
            >
              <option value="settlement">settlement (1)</option>
              <option value="city">city (2)</option>
            </select>
            <button type="button" onClick={() => onPlaceTestBuilding(hexId, buildingType)}>
              Place on current player
            </button>
            <button type="button" onClick={onClearBuildings}>
              Clear buildings
            </button>
            <button type="button" onClick={onGrantResources}>
              +3 all resources
            </button>
            <button type="button" onClick={onGrantResourcesToAll}>
              +3 all resources (everyone)
            </button>
          </div>

          <div className="dev-panel__section">
            <strong>Place on port (current player)</strong>
            <select value={portId} onChange={(e) => setPortId(e.target.value)}>
              {game.board.ports.map((port) => (
                <option key={port.id} value={port.id}>
                  {port.type === 'GENERIC_3_TO_1' ? 'Generic 3:1' : `${port.resource} 2:1`}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => onPlaceOnPort(portId)}>
              Settle this port
            </button>
          </div>

          <div className="dev-panel__section">
            <strong>Give development card</strong>
            <div className="dev-panel__rolls">
              {(
                [
                  ['knight', 'Knight'],
                  ['roadBuilding', 'Road Bld'],
                  ['yearOfPlenty', 'Year+'],
                  ['monopoly', 'Monopoly'],
                  ['victoryPoint', 'VP'],
                ] as Array<[DevelopmentCardType, string]>
              ).map(([type, label]) => (
                <button key={type} type="button" onClick={() => onGiveCard(type)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="dev-panel__section">
            <strong>Force roll</strong>
            <div className="dev-panel__rolls">
              <button type="button" onClick={() => onForceRoll(3, 4)}>
                7
              </button>
              {selectedHex?.numberToken != null && (
                <button
                  type="button"
                  onClick={() => {
                    const total = selectedHex.numberToken!;
                    const die1 = Math.max(1, Math.min(6, total - 1));
                    onForceRoll(die1, total - die1);
                  }}
                >
                  {selectedHex.numberToken} (selected hex)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
