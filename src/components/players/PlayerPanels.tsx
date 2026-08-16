import type { GameState } from '../../game/models/types';
import { getPlayerPorts } from '../../game/rules/trade';
import { calculateLongestRoadLength } from '../../game/rules/longestRoad';
import { countVictoryPointCards } from '../../game/rules/development';
import { PlayerPanel } from './PlayerPanel';

interface PlayerPanelsProps {
  game: GameState;
  className?: string;
}

export function PlayerPanels({ game, className }: PlayerPanelsProps) {
  const gameOver = game.phase === 'GAME_OVER';

  return (
    <div className={`player-panels${className ? ` ${className}` : ''}`}>
      {game.players.map((player) => {
        const isCurrent = player.id === game.currentPlayerId;
        // Hidden Victory Point cards are private: only surfaced to the player
        // whose turn it is, or to everyone once the game has ended.
        const hiddenVictoryPoints =
          isCurrent || gameOver ? countVictoryPointCards(game, player.id) : 0;

        return (
          <PlayerPanel
            key={player.id}
            player={player}
            isCurrent={isCurrent}
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
