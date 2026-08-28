import type { GameState } from '../../game/models/types';
import { getPlayerPorts } from '../../game/rules/trade';
import { calculateLongestRoadLength } from '../../game/rules/longestRoad';
import { countVictoryPointCards } from '../../game/rules/development';
import { PlayerPanel } from './PlayerPanel';

interface PlayerPanelsProps {
  game: GameState;
  className?: string;
  /** See PlayerPanel's `viewerPlayerId` — omitted in local mode. */
  viewerPlayerId?: string;
  /** Tighter horizontal card, for the perimeter rail above the board. */
  compact?: boolean;
}

export function PlayerPanels({ game, className, viewerPlayerId, compact }: PlayerPanelsProps) {
  const gameOver = game.phase === 'GAME_OVER';

  return (
    <div
      className={`player-panels${compact ? ' player-panels--compact' : ''}${className ? ` ${className}` : ''}`}
    >
      {game.players.map((player) => {
        const isCurrent = player.id === game.currentPlayerId;
        const isViewer = viewerPlayerId ? player.id === viewerPlayerId : isCurrent;
        // Hidden Victory Point cards are private: only surfaced to this panel's
        // own viewer, or to everyone once the game has ended. In network mode
        // countVictoryPointCards naturally returns 0 for anyone else anyway
        // (their development cards arrive already redacted), but skip the call
        // entirely for clarity rather than relying on that alone.
        const hiddenVictoryPoints =
          isViewer || gameOver ? countVictoryPointCards(game, player.id) : 0;

        return (
          <PlayerPanel
            key={player.id}
            player={player}
            isCurrent={isCurrent}
            viewerPlayerId={viewerPlayerId}
            compact={compact}
            ports={getPlayerPorts(game, player.id)}
            hasLargestArmy={game.largestArmyPlayerId === player.id}
            hasLongestRoad={game.longestRoadPlayerId === player.id}
            hiddenVictoryPoints={hiddenVictoryPoints}
            longestRoadLength={calculateLongestRoadLength(game, player.id)}
          />
        );
      })}
    </div>
  );
}
