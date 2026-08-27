import { useEffect, useState } from 'react';
import { GameClient, loadSession, resolveHostUrl, saveSession } from '../../net/client';
import type { SessionMode } from './ModeSelect';

interface NetworkSetupProps {
  role: Extract<SessionMode, 'host' | 'join'>;
  onConnected: (client: GameClient, playerId: string, isHost: boolean) => void;
  onBack: () => void;
}

/**
 * Collects a display name (and, when joining, the host's address), opens the
 * WebSocket, and hands off to the lobby once the server confirms JOINED.
 * The host's own browser connects to itself at window.location.host — it must
 * already be loaded from the host server (i.e. `npm run host` is running).
 */
export function NetworkSetup({ role, onConnected, onBack }: NetworkSetupProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lanAddresses, setLanAddresses] = useState<string[] | null>(null);

  useEffect(() => {
    if (role !== 'host') return;
    // The host may have loaded this page via localhost, which nobody else on
    // the network can reach — ask the server what address actually resolves
    // to it on the LAN, rather than relying on the terminal output alone.
    fetch('/info')
      .then((res) => res.json())
      .then((info: { port: number; addresses: string[] }) => setLanAddresses(info.addresses))
      .catch(() => setLanAddresses([]));
  }, [role]);

  const handleConnect = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter your name first.');
      return;
    }
    const url = role === 'host' ? `ws://${window.location.host}` : resolveHostUrl(address);
    if (role === 'join' && !address.trim()) {
      setError("Enter the host's address.");
      return;
    }

    setError(null);
    setConnecting(true);
    const client = new GameClient(url);
    // If this browser already joined this exact host address before (e.g. the
    // tab was closed and reopened mid-game), reuse that seat instead of
    // joining as a brand new player — see server/lobby.ts's reconnect handling.
    const savedSession = loadSession(url);

    const unsubscribe = client.onMessage((message) => {
      if (message.type === 'JOINED') {
        unsubscribe();
        saveSession(url, { reconnectToken: message.reconnectToken, name: trimmedName });
        onConnected(client, message.playerId, message.isHost);
      } else if (message.type === 'ERROR') {
        unsubscribe();
        setConnecting(false);
        setError(message.message);
        client.close();
      }
    });

    client.onOpen(() =>
      client.send({ type: 'JOIN', name: trimmedName, reconnectToken: savedSession?.reconnectToken })
    );
    client.onError(() => {
      setConnecting(false);
      setError('Could not reach that address.');
    });
    client.onClose(() => setConnecting(false));
  };

  return (
    <div className="setup-screen">
      <div className="setup-table-glow" aria-hidden="true" />
      <div className="setup-card">
        <h1 className="setup-title">CATAN</h1>
        <p className="setup-subtitle">{role === 'host' ? 'Host a Network Game' : 'Join a Network Game'}</p>

        {role === 'host' && (
          <p className="setup-pin-hint">
            {lanAddresses && lanAddresses.length > 0 ? (
              <>
                Other players on this Wi-Fi should open:{' '}
                {lanAddresses.map((address, i) => (
                  <span key={address}>
                    {i > 0 && ' or '}
                    <code>http://{address}:{window.location.port || 80}</code>
                  </span>
                ))}
              </>
            ) : (
              <>
                Make sure <code>npm run host</code> is running, then connect below. Other players
                will type this computer&apos;s network address, printed in that terminal.
              </>
            )}
          </p>
        )}

        <label className="setup-player-label">
          Your Name
          <input
            type="text"
            value={name}
            placeholder="Your name"
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {role === 'join' && (
          <label className="setup-player-label">
            Host Address
            <input
              type="text"
              value={address}
              placeholder="e.g. 192.168.1.29:8080"
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
        )}

        {error && <p className="setup-pin-error">{error}</p>}

        <button type="button" className="setup-start-btn" onClick={handleConnect} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect'}
        </button>
        <button type="button" className="setup-help-link" onClick={onBack}>
          ← Back
        </button>
      </div>
    </div>
  );
}
