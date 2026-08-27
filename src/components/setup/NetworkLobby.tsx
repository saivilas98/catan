import { useEffect, useState } from 'react';
import { clearSession, type GameClient } from '../../net/client';
import { MIN_PLAYERS } from '../../game/engine/gameEngine';

interface LobbyPlayerView {
  playerId: string;
  name: string;
  ready: boolean;
}

interface NetworkLobbyProps {
  client: GameClient;
  playerId: string;
  isHost: boolean;
  onGameStarted: () => void;
  onLeave: () => void;
}

/**
 * Live-updating waiting room: shows everyone who has joined the host's session.
 * Sprint C wires onGameStarted into a real GameState; for now it's just the
 * signal that the server accepted the host's START_GAME.
 */
export function NetworkLobby({ client, playerId, isHost, onGameStarted, onLeave }: NetworkLobbyProps) {
  const [players, setPlayers] = useState<LobbyPlayerView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = client.onMessage((message) => {
      if (message.type === 'LOBBY_STATE') {
        setPlayers(message.players);
      } else if (message.type === 'GAME_STARTED') {
        onGameStarted();
      } else if (message.type === 'ERROR') {
        setError(message.message);
      } else if (message.type === 'PLAYER_DISCONNECTED') {
        setError(null);
      }
    });
    const unsubscribeClose = client.onClose(() => setError('Disconnected from host — trying to reconnect…'));
    const unsubscribeOpen = client.onOpen(() => setError(null));
    return () => {
      unsubscribe();
      unsubscribeClose();
      unsubscribeOpen();
    };
  }, [client, onGameStarted]);

  const handleStart = () => {
    setError(null);
    client.send({ type: 'START_GAME' });
  };

  const handleLeave = () => {
    client.send({ type: 'LEAVE' });
    clearSession(client.getUrl());
    client.close();
    onLeave();
  };

  return (
    <div className="setup-screen">
      <div className="setup-table-glow" aria-hidden="true" />
      <div className="setup-card">
        <h1 className="setup-title">CATAN</h1>
        <p className="setup-subtitle">Waiting Room</p>
        <p className="setup-tagline">
          {isHost ? 'Start once everyone has joined.' : "Waiting for the host to start…"}
        </p>

        <ul className="network-lobby-list">
          {players.map((player) => (
            <li key={player.playerId} className="network-lobby-item">
              <span>{player.name}</span>
              {player.playerId === playerId && <span className="network-lobby-you">you</span>}
            </li>
          ))}
        </ul>

        {error && <p className="setup-pin-error">{error}</p>}

        {isHost && (
          <button
            type="button"
            className="setup-start-btn"
            onClick={handleStart}
            disabled={players.length < MIN_PLAYERS}
          >
            {players.length < MIN_PLAYERS ? `Need at least ${MIN_PLAYERS} players` : 'Start Game'}
          </button>
        )}
        <button type="button" className="setup-help-link" onClick={handleLeave}>
          ← Leave
        </button>
      </div>
    </div>
  );
}
