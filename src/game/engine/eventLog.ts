import type { GameEvent, GameEventType, GameState } from '../models/types';

/** How many events GameState retains. The UI shows this many at most. */
export const EVENT_LOG_LIMIT = 20;

interface AppendEventInput {
  type: GameEventType;
  message: string;
  playerId?: string | null;
  turnNumber?: number;
}

/**
 * Appends an event and returns the new state.
 * IDs come from an ever-increasing sequence rather than the log length, which stops
 * repeating once the log hits its cap.
 */
export function logEvent(state: GameState, input: AppendEventInput): GameState {
  const event: GameEvent = {
    id: `evt-${state.eventSequence}-${input.type}`,
    turnNumber: input.turnNumber ?? state.turnNumber,
    type: input.type,
    playerId: input.playerId ?? null,
    message: input.message,
  };

  return {
    ...state,
    eventSequence: state.eventSequence + 1,
    eventLog: [...state.eventLog, event].slice(-EVENT_LOG_LIMIT),
  };
}
