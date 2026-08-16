import type { GameState } from '../../game/models/types';
import { canRollDice, getCurrentPlayer } from '../../game/engine/gameEngine';
import { getSetupRound } from '../../game/engine/setup';
import { PLAYER_COLOR_HEX } from '../../data/terrainTheme';
import { Die } from './Die';
import { phaseInstruction } from './phaseInstruction';

interface TurnPanelProps {
  game: GameState;
  rolling: boolean;
  error: string | null;
  onRoll: () => void;
}

export function TurnPanel({ game, rolling, error, onRoll }: TurnPanelProps) {
  const currentPlayer = getCurrentPlayer(game);
  const isSetup = game.phase === 'INITIAL_PLACEMENT';
  const mayRoll = canRollDice(game, currentPlayer.id);
  const dice = game.diceResult;
  // Hide the outcome while the dice are visually tumbling.
  const shown = rolling ? null : dice;
  const instruction = phaseInstruction(game);

  return (
    <section className="turn-panel">
      <header className="turn-panel__header">
        <span
          className="turn-panel__swatch"
          style={{ background: PLAYER_COLOR_HEX[currentPlayer.color] }}
        />
        <div>
          <h2 className="turn-panel__title">{currentPlayer.name}&rsquo;s Turn</h2>
          <p className="turn-panel__subtitle">
            {isSetup
              ? `Setup round ${getSetupRound(game)} of 2`
              : `Turn ${game.turnNumber} · ${formatPhase(game.turnPhase)}`}
          </p>
        </div>
      </header>

      {isSetup ? (
        <p className="turn-panel__setup" aria-live="polite">
          {game.setupStep === 'PLACE_SETTLEMENT'
            ? 'Place a settlement on a highlighted corner.'
            : 'Place a road touching your new settlement.'}
        </p>
      ) : (
        <>
          <div className="turn-panel__dice">
            <Die value={shown?.die1 ?? null} rolling={rolling} />
            <Die value={shown?.die2 ?? null} rolling={rolling} />
          </div>

          <p className="turn-panel__total" aria-live="polite">
            {shown ? `${shown.die1} + ${shown.die2} = ${shown.total}` : 'Roll to begin'}
          </p>

          {!rolling && instruction && <p className="turn-panel__notice">{instruction}</p>}
        </>
      )}

      {error && <p className="turn-panel__error">{error}</p>}

      {!isSetup && (
        <div className="turn-panel__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onRoll}
            disabled={!mayRoll || rolling}
          >
            {game.hasRolledThisTurn ? 'Already Rolled' : 'ROLL DICE'}
          </button>
        </div>
      )}
    </section>
  );
}

function formatPhase(phase: GameState['turnPhase']): string {
  switch (phase) {
    case 'AWAITING_ROLL':
      return 'Awaiting roll';
    case 'AWAITING_ACTIONS':
      return 'Actions';
    case 'DISCARDING':
      return 'Discarding';
    case 'MOVING_ROBBER':
      return 'Moving robber';
    case 'STEALING':
      return 'Stealing';
    case 'ROAD_BUILDING':
      return 'Road building';
    case 'ENDING_TURN':
      return 'Ending turn';
    default:
      return phase;
  }
}
