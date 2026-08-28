import { HowToPlayModal } from '../help/HowToPlayModal';
import { useState } from 'react';
import { FullscreenButton } from '../layout/FullscreenButton';

export type SessionMode = 'local' | 'host' | 'join';

interface ModeSelectProps {
  onSelect: (mode: SessionMode) => void;
}

/**
 * The very first screen. Local mode goes straight into the existing pass-and-play
 * SetupScreen, untouched. Host/Join branch into the new LAN network flow instead.
 */
export function ModeSelect({ onSelect }: ModeSelectProps) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="setup-screen">
      <div className="setup-table-glow" aria-hidden="true" />
      <FullscreenButton className="setup-fullscreen-btn" />
      <div className="setup-card">
        <h1 className="setup-title">CATAN</h1>
        <p className="setup-subtitle">Build · Trade · Conquer</p>
        <p className="setup-tagline">How are you playing?</p>

        <button type="button" className="setup-help-link" onClick={() => setShowHelp(true)}>
          📖 New here? Learn how to play
        </button>

        <div className="mode-select-list">
          <button type="button" className="mode-select-btn" onClick={() => onSelect('local')}>
            <span className="mode-select-btn-title">Same Screen</span>
            <span className="mode-select-btn-desc">Pass the device around the table</span>
          </button>
          <button type="button" className="mode-select-btn" onClick={() => onSelect('host')}>
            <span className="mode-select-btn-title">Host a Network Game</span>
            <span className="mode-select-btn-desc">Everyone joins from their own device on this Wi-Fi</span>
          </button>
          <button type="button" className="mode-select-btn" onClick={() => onSelect('join')}>
            <span className="mode-select-btn-title">Join a Network Game</span>
            <span className="mode-select-btn-desc">Someone else is hosting nearby</span>
          </button>
        </div>
      </div>

      {showHelp && <HowToPlayModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
