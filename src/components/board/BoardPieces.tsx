import type { Building, PlayerColor, Point, Road } from '../../game/models/types';
import { PIECE_ASPECT, PLAYER_PIECE_ART, ROBBER_ART, ROBBER_ASPECT } from '../../data/terrainTheme';

interface SettlementPieceProps {
  color: PlayerColor;
  scale: number;
}

/**
 * A settlement rendered from the illustrated piece art, sized to a target height
 * (its own natural aspect ratio decides the width) and anchored so its base
 * platform sits on the intersection rather than floating above it.
 */
export function SettlementPiece({ color, scale }: SettlementPieceProps) {
  const h = scale * 0.62;
  const w = h * PIECE_ASPECT.settlement;

  return (
    <g className="piece piece--settlement">
      <ellipse cx={0} cy={scale * 0.08} rx={w * 0.42} ry={h * 0.13} fill="rgba(0,0,0,0.4)" />
      <image
        href={PLAYER_PIECE_ART[color].settlement}
        x={-w / 2}
        y={-h + scale * 0.1}
        width={w}
        height={h}
      />
    </g>
  );
}

/** A meaningfully bigger structure, same anchoring convention as the settlement. */
export function CityPiece({ color, scale }: SettlementPieceProps) {
  const h = scale * 0.74;
  const w = h * PIECE_ASPECT.city;

  return (
    <g className="piece piece--city">
      <ellipse cx={0} cy={scale * 0.09} rx={w * 0.42} ry={h * 0.12} fill="rgba(0,0,0,0.42)" />
      <image
        href={PLAYER_PIECE_ART[color].city}
        x={-w / 2}
        y={-h + scale * 0.11}
        width={w}
        height={h}
      />
    </g>
  );
}

interface RoadPieceProps {
  from: Point;
  to: Point;
  color: PlayerColor;
  scale: number;
}

/**
 * A road centered and rotated onto the real edge. The rendered length is fixed
 * relative to the hex's own width rather than the raw edge distance (0.8x a
 * hex's vertex-to-vertex width), and thickness is boosted well past the source
 * art's naturally thin aspect ratio so the piece reads clearly on the board.
 */
export function RoadPiece({ from, to, color, scale }: RoadPieceProps) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

  const hexWidth = scale * 2;
  const length = hexWidth * 0.8 * 0.5;
  const height = Math.max(length / PIECE_ASPECT.road, length * 0.16) * 1.9 * 0.5;

  return (
    // Position/rotation lives on this outer <g> as a plain SVG attribute; the
    // animated `.piece--road` class goes on the inner one instead of here,
    // since a CSS `transform` in its keyframes would otherwise replace (not
    // compose with) this attribute for the animation's duration.
    <g transform={`translate(${midX} ${midY}) rotate(${angle})`}>
      <g className="piece piece--road">
        <ellipse cx={0} cy={height * 0.32} rx={length * 0.46} ry={height * 0.16} fill="rgba(0,0,0,0.3)" />
        <image
          href={PLAYER_PIECE_ART[color].road}
          x={-length / 2}
          y={-height / 2}
          width={length}
          height={height}
        />
      </g>
    </g>
  );
}

/**
 * The single black robber figure — an original piece, not tied to any player
 * color. Sized up from the first pass (he kept getting lost against busier
 * terrain art) and given a strong two-layer ember aura — a wide soft glow plus
 * a tighter bright core — so he stays clearly visible against every terrain,
 * light desert sand included, reading as a menacing presence rather than just
 * another small piece on the tile.
 */
export function RobberPiece({ scale }: { scale: number }) {
  const h = scale * 0.86;
  const w = h * ROBBER_ASPECT;

  return (
    <g className="piece piece--robber" transform={`translate(0 ${-scale * 0.05})`}>
      <defs>
        <radialGradient id="robber-aura-outer" cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#ff8a3d" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#ff6a2d" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#ff6a2d" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="robber-aura-core" cx="50%" cy="42%" r="45%">
          <stop offset="0%" stopColor="#ffd39a" stopOpacity="0.85" />
          <stop offset="70%" stopColor="#ff9a4d" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ff9a4d" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={0} cy={-h * 0.26} r={w * 1.55} fill="url(#robber-aura-outer)" className="robber-aura robber-aura--outer" />
      <circle cx={0} cy={-h * 0.26} r={w * 0.95} fill="url(#robber-aura-core)" className="robber-aura robber-aura--core" />
      <ellipse cx={0} cy={scale * 0.24} rx={w * 0.46} ry={h * 0.1} fill="rgba(0,0,0,0.45)" />
      <image href={ROBBER_ART} x={-w / 2} y={-h + scale * 0.22} width={w} height={h} />
    </g>
  );
}

export type { Building, Road };
