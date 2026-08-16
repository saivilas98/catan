import { useState } from 'react';
import type { CSSProperties } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS } from '../../game/engine/gameEngine';
import { PLAYER_COLOR_HEX } from '../../data/terrainTheme';
import { validatePlayerPins } from '../../utils/pin';
import { HowToPlayModal } from '../help/HowToPlayModal';

interface SetupScreenProps {
  onStart: (playerNames: string[], playerPins: string[]) => void;
}

export function SetupScreen({ onStart }: SetupScreenProps) {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>(['', '', '', '']);
  const [pins, setPins] = useState<string[]>(['', '', '', '']);
  const [showErrors, setShowErrors] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const handleNameChange = (index: number, value: string) => {
    setNames((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handlePinChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    setPins((prev) => {
      const next = [...prev];
      next[index] = digits;
      return next;
    });
  };

  const activePins = pins.slice(0, playerCount);
  const pinCheck = validatePlayerPins(activePins);

  const handleStart = () => {
    if (!pinCheck.valid) {
      setShowErrors(true);
      return;
    }
    const activeNames = names
      .slice(0, playerCount)
      .map((name, i) => name.trim() || `Player ${i + 1}`);
    onStart(activeNames, activePins);
  };

  return (
    <div className="setup-screen">
      <div className="setup-table-glow" aria-hidden="true" />
      <div className="setup-card">
        <h1 className="setup-title">CATAN</h1>
        <p className="setup-subtitle">Build · Trade · Conquer</p>
        <p className="setup-tagline">Gather around the table.</p>

        <button type="button" className="setup-help-link" onClick={() => setShowHelp(true)}>
          📖 New here? Learn how to play
        </button>

        <div className="setup-player-count">
          {[MIN_PLAYERS, MAX_PLAYERS].map((count) => (
            <button
              key={count}
              type="button"
              className={`setup-count-btn${playerCount === count ? ' setup-count-btn--active' : ''}`}
              onClick={() => setPlayerCount(count)}
            >
              {count} Players
            </button>
          ))}
        </div>

        <div className="setup-player-list">
          {Array.from({ length: playerCount }).map((_, index) => {
            const pinError = showErrors ? pinCheck.fieldErrors[index] : '';
            const color = PLAYER_COLOR_HEX[PLAYER_COLORS[index]];
            return (
              <div
                className="setup-seat"
                key={index}
                style={{ '--seat-color': color } as CSSProperties}
              >
                <span className="setup-player-swatch" style={{ background: color }} />
                <label className="setup-player-label">
                  Player {index + 1}
                  <input
                    type="text"
                    value={names[index]}
                    placeholder={`Player ${index + 1}`}
                    maxLength={20}
                    onChange={(e) => handleNameChange(index, e.target.value)}
                  />
                </label>
                <label className="setup-player-label setup-player-label--pin">
                  Private PIN
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={pins[index]}
                    placeholder="••"
                    maxLength={2}
                    className={pinError ? 'setup-pin-input--error' : ''}
                    onChange={(e) => handlePinChange(index, e.target.value)}
                  />
                  {pinError && <span className="setup-pin-error">{pinError}</span>}
                </label>
              </div>
            );
          })}
        </div>

        <p className="setup-pin-hint">
          Your PIN keeps your development cards private from the other players sharing
          this screen. Choose any 2 digits — no two players may share one.
        </p>

        <button type="button" className="setup-start-btn" onClick={handleStart}>
          START GAME
        </button>
      </div>

      {showHelp && <HowToPlayModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
