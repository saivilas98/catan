// Pre-game join/ready state for one hosted session, and (once started) the
// roster of seats a dropped player can reconnect into. The actual GameState
// only comes into being once the host starts the game (see gameHost.ts).
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../src/net/protocol';
import { MIN_PLAYERS, MAX_PLAYERS } from '../src/game/engine/gameEngine';

interface LobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
  /** Null while this player is disconnected — only possible once `started`; a
   *  disconnect before the game starts removes the seat outright instead. */
  socket: WebSocket | null;
  reconnectToken: string;
}

function send(socket: WebSocket | null, message: ServerMessage) {
  if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

type JoinResult =
  | { ok: true; player: LobbyPlayer; rejoined: boolean }
  | { ok: false; error: string };

export class Lobby {
  private players: LobbyPlayer[] = [];
  private nextId = 1;
  private started = false;

  /** The short code other players type in to join this specific room. */
  constructor(readonly code: string) {}

  join(socket: WebSocket, name: string, reconnectToken?: string): JoinResult {
    if (reconnectToken) {
      const existing = this.players.find((p) => p.reconnectToken === reconnectToken);
      if (existing) {
        existing.socket = socket;
        const isHost = this.players[0]?.id === existing.id;
        send(socket, {
          type: 'JOINED',
          playerId: existing.id,
          isHost,
          reconnectToken: existing.reconnectToken,
          roomCode: this.code,
        });
        this.broadcast({ type: 'PLAYER_RECONNECTED', playerId: existing.id });
        this.broadcastLobbyState();
        return { ok: true, player: existing, rejoined: true };
      }
      // Unrecognized token (fresh server restart, expired session) — fall
      // through and treat this as a brand new join instead of failing.
    }

    if (this.started) return { ok: false, error: 'Game already in progress' };
    if (this.players.length >= MAX_PLAYERS) {
      return { ok: false, error: `This game is full (max ${MAX_PLAYERS} players)` };
    }
    const isHost = this.players.length === 0;
    const player: LobbyPlayer = {
      id: `player-${this.nextId++}`,
      name,
      ready: false,
      socket,
      reconnectToken: randomUUID(),
    };
    this.players.push(player);
    send(socket, {
      type: 'JOINED',
      playerId: player.id,
      isHost,
      reconnectToken: player.reconnectToken,
      roomCode: this.code,
    });
    this.broadcastLobbyState();
    return { ok: true, player, rejoined: false };
  }

  isEmpty(): boolean {
    return this.players.length === 0;
  }

  setReady(playerId: string, ready: boolean) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;
    player.ready = ready;
    this.broadcastLobbyState();
  }

  /** Only the first player to join (the host) may start the game, and only once enough players have joined. */
  startGame(
    playerId: string
  ): { ok: true; players: { id: string; name: string; socket: WebSocket }[] } | { ok: false; error: string } {
    if (this.started) return { ok: false, error: 'Game already started' };
    if (this.players[0]?.id !== playerId) return { ok: false, error: 'Only the host can start the game' };
    if (this.players.length < MIN_PLAYERS) {
      return { ok: false, error: `Need at least ${MIN_PLAYERS} players to start` };
    }
    this.started = true;
    // Every seat necessarily has a live socket here: a disconnect before the
    // game starts removes the seat outright (see disconnect() below), so
    // nothing left in the roster at this point can have gone null yet.
    const roster = this.players.map((p) => ({ id: p.id, name: p.name, socket: p.socket! }));
    this.broadcast({ type: 'GAME_STARTED' });
    return { ok: true, players: roster };
  }

  disconnect(socket: WebSocket) {
    const player = this.players.find((p) => p.socket === socket);
    if (!player) return;
    player.socket = null;

    if (this.started) {
      // Keep the seat reserved — the player's reconnectToken still lets them
      // resume it (see join() above and GameHost.registerSocket). Full
      // rejoin-any-time-later host recovery after the host process itself
      // dies is explicitly out of scope for this phase.
      this.broadcast({ type: 'PLAYER_DISCONNECTED', playerId: player.id });
      return;
    }
    this.players = this.players.filter((p) => p !== player);
    this.broadcast({ type: 'PLAYER_DISCONNECTED', playerId: player.id });
    this.broadcastLobbyState();
  }

  playerIdFor(socket: WebSocket): string | null {
    return this.players.find((p) => p.socket === socket)?.id ?? null;
  }

  private broadcastLobbyState() {
    this.broadcast({
      type: 'LOBBY_STATE',
      players: this.players.map((p) => ({ playerId: p.id, name: p.name, ready: p.ready })),
    });
  }

  private broadcast(message: ServerMessage) {
    for (const player of this.players) send(player.socket, message);
  }
}
