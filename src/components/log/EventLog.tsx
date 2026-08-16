import type { GameEvent, GameState } from '../../game/models/types';
import { PLAYER_COLOR_HEX } from '../../data/terrainTheme';

interface EventLogProps {
  game: GameState;
}

/** A chronicle, not a console: entries are grouped under a "TURN N" rule, newest first. */
export function EventLog({ game }: EventLogProps) {
  const events = [...game.eventLog].reverse();

  return (
    <section className="event-log">
      <h3 className="event-log__title">Game Log</h3>
      <ol className="event-log__list">
        {events.map((event, i) => {
          const isNewTurn = i === 0 || events[i - 1].turnNumber !== event.turnNumber;
          return (
            <li key={event.id} className="event-log__entry">
              {isNewTurn && <p className="event-log__turn-rule">Turn {event.turnNumber}</p>}
              <div className={`event-log__item event-log__item--${event.type}`}>
                <span className="event-log__dot" style={{ background: dotColor(game, event) }} />
                <span className="event-log__message">{event.message}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function dotColor(game: GameState, event: GameEvent): string {
  const player = game.players.find((p) => p.id === event.playerId);
  return player ? PLAYER_COLOR_HEX[player.color] : '#6b5d47';
}
