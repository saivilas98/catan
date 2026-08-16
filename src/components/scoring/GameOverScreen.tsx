import type { GameState } from '../../game/models/types';
import { getVictoryPointBreakdown } from '../../game/rules/scoring';
import { calculateLongestRoadLength } from '../../game/rules/longestRoad';
import { countPlayedKnights } from '../../game/rules/development';
import { PLAYER_COLOR_HEX } from '../../data/terrainTheme';
import { getPostGameStats } from '../../utils/postGameStats';

interface GameOverScreenProps {
  game: GameState;
  onNewGame: () => void;
  /** Closes the overlay without leaving the game — the board stays browsable. */
  onDismiss: () => void;
}

const EMBER_COUNT = 14;

/**
 * The final scoreboard. The game is over, so hidden Victory Point cards are
 * revealed for everyone — that is what makes the final tally verifiable.
 */
export function GameOverScreen({ game, onNewGame, onDismiss }: GameOverScreenProps) {
  const winner = game.players.find((p) => p.id === game.winnerId);
  const stats = getPostGameStats(game);
  const maxRollCount = Math.max(1, ...Object.values(stats.rollHistogram));

  const scores = game.players
    .map((player) => ({
      player,
      breakdown: getVictoryPointBreakdown(game, player.id),
      roads: calculateLongestRoadLength(game, player.id),
      knights: countPlayedKnights(game, player.id),
    }))
    .sort((a, b) => b.breakdown.total - a.breakdown.total);

  return (
    <div className="modal-backdrop game-over-backdrop">
      <div className="game-over">
        <div className="game-over__banner">
          <div className="game-over__embers" aria-hidden="true">
            {Array.from({ length: EMBER_COUNT }).map((_, i) => (
              <span
                key={i}
                className="game-over__ember"
                style={{
                  left: `${(i * 137.5) % 100}%`,
                  animationDelay: `${(i * 0.37) % 3.5}s`,
                  animationDuration: `${3 + ((i * 0.6) % 2.5)}s`,
                }}
              />
            ))}
          </div>
          <p className="game-over__eyebrow">Winner</p>
          <h1
            className="game-over__title"
            style={{ color: winner ? PLAYER_COLOR_HEX[winner.color] : undefined }}
          >
            {winner ? winner.name : 'Game over'}
          </h1>
          {winner && (
            <p className="game-over__subtitle">
              {getVictoryPointBreakdown(game, winner.id).total} Victory Points
            </p>
          )}
        </div>

        <div className="game-over__bonuses">
          <span>
            🏆 Longest Road:{' '}
            <strong>
              {game.longestRoadPlayerId
                ? `${game.players.find((p) => p.id === game.longestRoadPlayerId)?.name} · ${game.longestRoadLength}`
                : 'None'}
            </strong>
          </span>
          <span>
            ⚔ Largest Army:{' '}
            <strong>
              {game.largestArmyPlayerId
                ? `${game.players.find((p) => p.id === game.largestArmyPlayerId)?.name} · ${countPlayedKnights(game, game.largestArmyPlayerId)}`
                : 'None'}
            </strong>
          </span>
        </div>

        <table className="score-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col" title="Settlements">🏠</th>
              <th scope="col" title="Cities">🏛</th>
              <th scope="col" title="Victory Point cards">⭐</th>
              <th scope="col" title="Longest Road">🏆</th>
              <th scope="col" title="Largest Army">⚔</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {scores.map(({ player, breakdown }) => (
              <tr
                key={player.id}
                className={player.id === game.winnerId ? 'score-table__row--winner' : ''}
              >
                <th scope="row">
                  <span
                    className="score-table__swatch"
                    style={{ background: PLAYER_COLOR_HEX[player.color] }}
                  />
                  {player.name}
                </th>
                <td>{breakdown.settlementPoints}</td>
                <td>{breakdown.cityPoints}</td>
                <td className="score-table__vp-cell">
                  {breakdown.victoryPointCards > 0 && (
                    <span className="score-table__vp-flip" aria-hidden="true">
                      ⭐
                    </span>
                  )}
                  {breakdown.victoryPointCards}
                </td>
                <td>{breakdown.longestRoad}</td>
                <td>{breakdown.largestArmy}</td>
                <td className="score-table__total">{breakdown.total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="game-over__note">
          Hidden Victory Point cards are revealed above now that the game has ended.
        </p>

        <div className="game-over__stats">
          <p className="game-over__stats-title">This Game</p>
          <div className="game-over__stats-grid">
            <span>
              <strong>{stats.turns}</strong> turns
            </span>
            <span>
              <strong>{stats.rollsCount}</strong> rolls
            </span>
            <span>
              <strong>{stats.robberMoves}</strong> robber moves
            </span>
            <span>
              <strong>{stats.resourcesStolen}</strong> cards stolen
            </span>
            <span>
              <strong>{stats.devCardsPlayed}</strong> dev cards played
            </span>
            <span>
              <strong>{stats.tradesCompleted}</strong> trades made
            </span>
          </div>

          {stats.rollsCount > 0 && (
            <div className="dice-histogram">
              {Array.from({ length: 11 }, (_, i) => i + 2).map((total) => {
                const count = stats.rollHistogram[total] ?? 0;
                return (
                  <div key={total} className="dice-histogram__bar-col">
                    <span
                      className="dice-histogram__bar"
                      style={{ height: `${(count / maxRollCount) * 100}%` }}
                      title={`${total}: rolled ${count} time${count === 1 ? '' : 's'}`}
                    />
                    <span className="dice-histogram__label">{total}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="game-over__actions">
          <button type="button" className="btn btn--ghost" onClick={onDismiss}>
            View Final Board
          </button>
          <button type="button" className="btn btn--primary" onClick={onNewGame}>
            NEW GAME
          </button>
        </div>
      </div>
    </div>
  );
}
