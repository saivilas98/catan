// Wraps a connected GameClient into the same "dispatch an action, receive the
// next state" shape App.tsx already uses for local mode — see the dispatch
// branch in App.tsx. No client-side optimistic prediction: dispatch fires the
// action at the host and the real GameState arrives later via subscribe().
import type { GameClient } from './client';
import type { GameAction } from '../game/engine/actions';
import type { RedactedGameState } from './redactState';

let requestCounter = 0;
function nextRequestId(): string {
  requestCounter += 1;
  return `req-${Date.now()}-${requestCounter}`;
}

export class NetworkTransport {
  constructor(
    private client: GameClient,
    /** The lobby's join-time id — NOT the GameState player id (see protocol.ts's YOUR_GAME_PLAYER_ID). Currently unused; kept for future diagnostics/reconnect (Sprint D). */
    readonly lobbyPlayerId: string
  ) {}

  dispatch(action: GameAction): void {
    this.client.send({ type: 'ACTION', requestId: nextRequestId(), action });
  }

  /** Fires on every authoritative state update or rejected/errored action. */
  subscribe(onState: (state: RedactedGameState) => void, onError: (message: string) => void): () => void {
    return this.client.onMessage((message) => {
      if (message.type === 'STATE') onState(message.state);
      else if (message.type === 'ACTION_REJECTED') onError(message.error);
      else if (message.type === 'ERROR') onError(message.message);
    });
  }
}
