// Wire protocol between the LAN host server and browser clients.
// Shared by both sides — must never import DOM (WebSocket) or Node (http/fs) types.

import type { GameAction } from '../game/engine/actions';
import type { RedactedGameState } from './redactState';

export type { RedactedGameState } from './redactState';

export type ClientMessage =
  // reconnectToken: if this matches a player already known to the host (from
  // an earlier JOINED in this same session), the host reuses that seat instead
  // of creating a new one — see server/lobby.ts.
  // roomCode: omitted to create a brand-new room (the creator becomes its
  // host); provided to join an existing room by the code its host was given.
  // One server process can now referee many concurrent rooms — see
  // server/index.ts's `rooms` map.
  | { type: 'JOIN'; name: string; reconnectToken?: string; roomCode?: string }
  | { type: 'READY'; ready: boolean }
  | { type: 'START_GAME' }
  | { type: 'ACTION'; requestId: string; action: GameAction }
  | { type: 'LEAVE' };

export type ServerMessage =
  | { type: 'JOINED'; playerId: string; isHost: boolean; reconnectToken: string; roomCode: string }
  | { type: 'LOBBY_STATE'; players: { playerId: string; name: string; ready: boolean }[] }
  | { type: 'GAME_STARTED' }
  // The lobby's playerId (from JOINED) and the GameState's player ids are two
  // separate id spaces — the engine assigns its own ids independent of join
  // order/lobby ids. Sent once per client right when the game starts, before
  // the first STATE, so the client knows which GameState.players[] entry is it.
  | { type: 'YOUR_GAME_PLAYER_ID'; playerId: string }
  | { type: 'STATE'; state: RedactedGameState }
  | { type: 'ACTION_REJECTED'; requestId: string; error: string }
  | { type: 'PLAYER_DISCONNECTED'; playerId: string }
  | { type: 'PLAYER_RECONNECTED'; playerId: string }
  | { type: 'ERROR'; message: string };
