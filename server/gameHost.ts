// The authoritative session once a lobby's host clicks Start. Owns the one real
// GameState, runs the same reducer local mode uses, and broadcasts a redacted
// per-player view to each connected socket after every accepted action.
import type { WebSocket } from 'ws';
import { createInitialGame } from '../src/game/engine/gameEngine';
import { applyAction, type GameAction } from '../src/game/engine/actions';
import { redactState } from '../src/net/redactState';
import type { ServerMessage } from '../src/net/protocol';

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

export class GameHost {
  private state;
  private sockets = new Map<string, WebSocket>();

  constructor(players: { id: string; name: string }[]) {
    this.state = createInitialGame(players.map((p) => p.name));
    // createInitialGame assigns its own sequential ids (player-0, player-1, ...)
    // in the order names were given, so lobby player order must match — the
    // caller is responsible for passing players in a stable, agreed order.
    players.forEach((lobbyPlayer, index) => {
      this.playerIdByLobbyId.set(lobbyPlayer.id, this.state.players[index].id);
    });
  }

  private playerIdByLobbyId = new Map<string, string>();

  registerSocket(lobbyPlayerId: string, socket: WebSocket) {
    const gamePlayerId = this.playerIdByLobbyId.get(lobbyPlayerId);
    if (!gamePlayerId) return;
    this.sockets.set(gamePlayerId, socket);
    send(socket, { type: 'YOUR_GAME_PLAYER_ID', playerId: gamePlayerId });
    send(socket, { type: 'STATE', state: redactState(this.state, gamePlayerId) });
  }

  handleAction(lobbyPlayerId: string, requestId: string, action: GameAction) {
    const gamePlayerId = this.playerIdByLobbyId.get(lobbyPlayerId);
    const socket = this.sockets.get(gamePlayerId ?? '');
    if (!gamePlayerId) return;

    if (action.playerId !== gamePlayerId) {
      if (socket) send(socket, { type: 'ACTION_REJECTED', requestId, error: 'Player mismatch' });
      return;
    }

    const result = applyAction(this.state, action);
    if (!result.ok) {
      if (socket) send(socket, { type: 'ACTION_REJECTED', requestId, error: result.error.message });
      return;
    }

    this.state = result.state;
    this.broadcastState();
  }

  private broadcastState() {
    for (const [gamePlayerId, socket] of this.sockets) {
      send(socket, { type: 'STATE', state: redactState(this.state, gamePlayerId) });
    }
  }
}
