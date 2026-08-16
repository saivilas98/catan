import type { GameState } from '../../game/models/types';
import { countPlayedKnights } from '../../game/rules/development';
import { LONGEST_ROAD_MINIMUM } from '../../game/rules/longestRoad';
import { LARGEST_ARMY_MINIMUM } from '../../game/models/types';
import { PLAYER_COLOR_HEX } from '../../data/terrainTheme';

interface BonusIndicatorsProps {
  game: GameState;
}

/** The two public 2-point bonuses, always visible to everyone. */
export function BonusIndicators({ game }: BonusIndicatorsProps) {
  const roadHolder = game.players.find((p) => p.id === game.longestRoadPlayerId);
  const armyHolder = game.players.find((p) => p.id === game.largestArmyPlayerId);

  return (
    <section className="bonus-indicators">
      <div className={`bonus-card${roadHolder ? ' bonus-card--held' : ''}`}>
        <span className="bonus-card__icon" aria-hidden="true">
          🏆
        </span>
        <span className="bonus-card__body">
          <span className="bonus-card__label">Longest Road</span>
          {roadHolder ? (
            <span className="bonus-card__holder" style={{ color: PLAYER_COLOR_HEX[roadHolder.color] }}>
              {roadHolder.name} · {game.longestRoadLength} roads
            </span>
          ) : (
            <span className="bonus-card__none">None · needs {LONGEST_ROAD_MINIMUM}</span>
          )}
        </span>
        <span className="bonus-card__vp">2 VP</span>
      </div>

      <div className={`bonus-card${armyHolder ? ' bonus-card--held' : ''}`}>
        <span className="bonus-card__icon" aria-hidden="true">
          ⚔
        </span>
        <span className="bonus-card__body">
          <span className="bonus-card__label">Largest Army</span>
          {armyHolder ? (
            <span className="bonus-card__holder" style={{ color: PLAYER_COLOR_HEX[armyHolder.color] }}>
              {armyHolder.name} · {countPlayedKnights(game, armyHolder.id)} knights
            </span>
          ) : (
            <span className="bonus-card__none">None · needs {LARGEST_ARMY_MINIMUM}</span>
          )}
        </span>
        <span className="bonus-card__vp">2 VP</span>
      </div>
    </section>
  );
}
