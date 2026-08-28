import { useEffect, useState } from 'react';
import { GameClient, loadSession, resolveHostUrl, saveSession } from '../../net/client';
import type { SessionMode } from './ModeSelect';
import { FullscreenButton } from '../layout/FullscreenButton';

interface NetworkSetupProps {
  role: Extract<SessionMode, 'host' | 'join'>;
  onConnected: (client: GameClient, playerId: string, isHost: boolean, roomCode: string) => void;
  onBack: () => void;
}

/**
 * Collects a display name — plus, when joining, the room code the host was
 * given (and, only when testing locally, a host address to override the
 * default) — opens the WebSocket, and hands off to the lobby once the server
 * confirms JOINED. The host's own browser connects to itself at
 * window.location.host — it must already be loaded from the host server
 * (i.e. `npm run host` is running, or this is a deployed instance).
 */
export function NetworkSetup({ role, onConnected, onBack }: NetworkSetupProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [slowConnect, setSlowConnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lanAddresses, setLanAddresses] = useState<string[] | null>(null);

  const loadedViaLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  useEffect(() => {
    if (role !== 'host' || !loadedViaLocalhost) return;
    // Only relevant for local LAN hosting: the host loaded the page via
    // localhost, which nobody else on the network can reach, so ask the
    // server what address actually resolves to it on the LAN instead. Any
    // other host (a real LAN IP, or a public domain like a Render deploy) is
    // already a shareable address on its own — see shareableAddress below.
    fetch('/info')
      .then((res) => res.json())
      .then((info: { port: number; addresses: string[] }) => setLanAddresses(info.addresses))
      .catch(() => setLanAddresses([]));
  }, [role, loadedViaLocalhost]);

  // What to tell other players to open. A page already loaded from a real,
  // shareable address (a LAN IP typed directly, or a public URL like Render)
  // needs no help — window.location.origin IS the address to share. Only
  // localhost needs the /info lookup above to find a real LAN address.
  const shareableAddress = loadedViaLocalhost ? null : window.location.origin;

  const handleConnect = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter your name first.');
      return;
    }
    const trimmedRoomCode = roomCode.trim().toUpperCase();
    if (role === 'join' && !trimmedRoomCode) {
      setError("Enter the host's room code.");
      return;
    }
    // Joining from the same page the host is running on (the common case —
    // a shared public deployment, or a LAN host's own URL loaded directly)
    // needs no address at all; only offer it as an override for local testing,
    // where "this page" and "the host to connect to" can legitimately differ.
    if (role === 'join' && loadedViaLocalhost && !address.trim()) {
      setError("Enter the host's address.");
      return;
    }
    // https-served pages (Render, any TLS host) can only open wss:// sockets —
    // a plain ws:// attempt is blocked as mixed content and fails instantly.
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const sameOriginUrl = `${scheme}://${window.location.host}`;
    const url = role === 'host' ? sameOriginUrl : loadedViaLocalhost ? resolveHostUrl(address) : sameOriginUrl;

    setError(null);
    setConnecting(true);
    setSlowConnect(false);
    const client = new GameClient(url);
    // If this browser already joined this exact host address before (e.g. the
    // tab was closed and reopened mid-game), reuse that seat instead of
    // joining as a brand new player — see server/lobby.ts's reconnect handling.
    const savedSession = loadSession(url);

    let settled = false;
    const cleanups: (() => void)[] = [];
    const cleanup = () => cleanups.forEach((fn) => fn());

    // A free-tier host (e.g. Render) that's been idle can take up to ~50s to
    // wake up, dropping the very first connection attempt or two along the
    // way. GameClient already retries with backoff on its own, so a single
    // early failure must not surface as a dead end — only give up for real
    // after a generous overall timeout.
    const slowTimer = window.setTimeout(() => setSlowConnect(true), 5000);
    const giveUpTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      setConnecting(false);
      setError('Could not reach that address. If the host just woke up from sleep, try again in a moment.');
      client.close();
    }, 25000);
    cleanups.push(() => window.clearTimeout(slowTimer));
    cleanups.push(() => window.clearTimeout(giveUpTimer));

    cleanups.push(
      client.onMessage((message) => {
        if (settled) return;
        if (message.type === 'JOINED') {
          settled = true;
          cleanup();
          saveSession(url, { reconnectToken: message.reconnectToken, name: trimmedName });
          onConnected(client, message.playerId, message.isHost, message.roomCode);
        } else if (message.type === 'ERROR') {
          settled = true;
          cleanup();
          setConnecting(false);
          setError(message.message);
          client.close();
        }
      })
    );
    cleanups.push(
      client.onOpen(() =>
        client.send({
          type: 'JOIN',
          name: trimmedName,
          reconnectToken: savedSession?.reconnectToken,
          roomCode: role === 'join' ? trimmedRoomCode : undefined,
        })
      )
    );
    // Deliberately no handling on error/close here — see the comment above.
  };

  return (
    <div className="setup-screen">
      <div className="setup-table-glow" aria-hidden="true" />
      <FullscreenButton className="setup-fullscreen-btn" />
      <div className="setup-card">
        <h1 className="setup-title">CATAN</h1>
        <p className="setup-subtitle">{role === 'host' ? 'Host a Network Game' : 'Join a Network Game'}</p>

        {role === 'host' && (
          <p className="setup-pin-hint">
            {shareableAddress ? (
              <>
                Other players should open <code>{shareableAddress}</code> and enter the room code
                you'll get on the next screen.
              </>
            ) : lanAddresses && lanAddresses.length > 0 ? (
              <>
                Other players on this Wi-Fi should open:{' '}
                {lanAddresses.map((address, i) => (
                  <span key={address}>
                    {i > 0 && ' or '}
                    <code>http://{address}:{window.location.port || 80}</code>
                  </span>
                ))}
                , then enter the room code you'll get on the next screen.
              </>
            ) : (
              <>
                Make sure <code>npm run host</code> is running, then connect below. Other players
                will type this computer&apos;s network address and the room code you'll get next.
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
            Room Code
            <input
              type="text"
              value={roomCode}
              placeholder="e.g. K7QP"
              maxLength={8}
              autoCapitalize="characters"
              style={{ textTransform: 'uppercase', letterSpacing: '0.15em' }}
              onChange={(e) => setRoomCode(e.target.value)}
            />
          </label>
        )}

        {role === 'join' && loadedViaLocalhost && (
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
          {connecting ? (slowConnect ? 'Still trying…' : 'Connecting…') : 'Connect'}
        </button>
        {connecting && slowConnect && (
          <p className="setup-pin-hint">
            Taking a while — if the host is on a free hosting tier, it can take up to a
            minute to wake up from sleep.
          </p>
        )}
        <button type="button" className="setup-help-link" onClick={onBack}>
          ← Back
        </button>
      </div>
    </div>
  );
}
