import type { Player, Port } from '../../game/models/types';
import { countResources, RESOURCE_TYPES } from '../../game/models/types';
import { PLAYER_COLOR_HEX, RESOURCE_DISPLAY } from '../../data/terrainTheme';

interface PlayerPanelProps {
  /**
   * In network mode this is a RedactedPlayer (see src/net/redactState.ts):
   * `resources`/`developmentCards` are zeroed/emptied for every player but the
   * viewer, with the true totals carried separately in `resourceCount`/
   * `developmentCardCount` so this panel can still show an accurate card count
   * for opponents without ever rendering their hand's contents.
   */
  player: Player & { resourceCount?: number; developmentCardCount?: number };
  isCurrent: boolean;
  ports: Port[];
  hasLargestArmy: boolean;
  hasLongestRoad: boolean;
  /** Only ever passed for the player themselves — never for opponents. */
  hiddenVictoryPoints: number;
  longestRoadLength: number;
  /**
   * Whose device this is, in network mode. Local mode omits this and falls
   * back to `isCurrent` — the shared-screen assumption that you're only ever
   * looking at the screen during your own turn (see the handoff overlay).
   * Network mode has no such assumption: every device sees the live board at
   * once, so a fixed viewer identity is required to know whose exact hand
   * (rather than just a count) is safe to render here.
   */
  viewerPlayerId?: string;
  /** Tighter horizontal card, for the perimeter rail above the board. */
  compact?: boolean;
}

export function PlayerPanel({
  player,
  isCurrent,
  ports,
  hasLargestArmy,
  hasLongestRoad,
  hiddenVictoryPoints,
  longestRoadLength,
  viewerPlayerId,
  compact,
}: PlayerPanelProps) {
  const showPrivate = viewerPlayerId ? player.id === viewerPlayerId : isCurrent;
  const total = player.resourceCount ?? countResources(player.resources);
  const devCount = player.developmentCardCount ?? player.developmentCards.length;
  const knightsPlayed = player.playedDevelopmentCards.filter((c) => c.type === 'knight').length;

  return (
    <div
      className={`player-panel${isCurrent ? ' player-panel--current' : ''}${compact ? ' player-panel--compact' : ''}`}
    >
      <div className="player-panel__top">
        <span
          className="player-panel__swatch"
          style={{ background: PLAYER_COLOR_HEX[player.color] }}
        />
        <div className="player-panel__identity">
          <span className="player-panel__name">{player.name}</span>
          <span className="player-panel__status">
            {isCurrent ? 'Current turn' : 'Waiting'}
          </span>
        </div>
        {/*
          Opponents only ever see the public score. The current player also sees
          their hidden Victory Point cards folded in, marked so it is obvious the
          extra points are private.
        */}
        <span
          className="player-panel__vp"
          title={
            showPrivate && hiddenVictoryPoints > 0
              ? `${player.victoryPoints} public + ${hiddenVictoryPoints} hidden`
              : 'Public victory points'
          }
        >
          {player.victoryPoints}
          {showPrivate && hiddenVictoryPoints > 0 && (
            <span className="player-panel__vp-hidden">+{hiddenVictoryPoints}</span>
          )}{' '}
          VP
        </span>
      </div>

      {/*
        Resource privacy: only the panel's own viewer gets their exact hand shown
        here (and it is also mirrored in the left sidebar's Your Resources).
        Every other player is shown nothing but a total card count — the
        composition of their hand is exactly the kind of hidden information that
        must not leak, whether that's a shared screen (local mode) or the wire
        (network mode, where it's actually redacted before it ever arrives).
      */}
      {showPrivate ? (
        <ul className="resource-row">
          {RESOURCE_TYPES.map((type) => {
            const { icon, label } = RESOURCE_DISPLAY[type];
            const count = player.resources[type];
            return (
              <li
                key={type}
                className={`resource-chip${count > 0 ? ' resource-chip--held' : ''}`}
                title={`${label}: ${count}`}
              >
                <span className="resource-chip__icon" aria-hidden="true">
                  {icon}
                </span>
                <span className="resource-chip__count">{count}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="player-panel__resource-count">
          🎴 {total} resource card{total === 1 ? '' : 's'}
        </p>
      )}

      <div className="player-panel__footer">
        <span className="piece-tally" title="Roads remaining">
          🛤 {player.piecesRemaining.road}
        </span>
        <span className="piece-tally" title="Settlements remaining">
          🏠 {player.piecesRemaining.settlement}
        </span>
        <span className="piece-tally" title="Cities remaining">
          🏛 {player.piecesRemaining.city}
        </span>
      </div>

      <div className="player-panel__dev">
        {/* Only counts, never identities — the card-back glyph reinforces that this
            is a closed hand, not just an inline stat. */}
        <span title="Development cards in hand">🂠 {devCount} dev</span>
        <span title="Knights played">🛡️ {knightsPlayed} knights</span>
        {/* Total roads owned vs longest continuous run — they are not the same thing. */}
        <span title="Roads owned · longest continuous run">
          🛤 {player.roadsBuilt}/{longestRoadLength}
        </span>
        {hasLargestArmy && <span className="largest-army-tag">⚔ Largest Army</span>}
        {hasLongestRoad && <span className="longest-road-tag">🏆 Longest Road</span>}
      </div>

      {ports.length > 0 && (
        <div className="player-panel__ports">
          <span className="player-panel__ports-label">Ports</span>
          {ports.map((port) => (
            <span key={port.id} className="port-tag">
              {port.resource ? `${RESOURCE_DISPLAY[port.resource].icon} 2:1` : '3:1'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
