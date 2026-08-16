import type { HexTile as HexTileModel } from '../../game/models/types';
import { getHexCorners, hexToPixel } from '../../game/board/hexGeometry';
import { TERRAIN_THEME } from '../../data/terrainTheme';
import { NumberToken } from './NumberToken';
import { RobberPiece } from './BoardPieces';

interface HexTileProps {
  hex: HexTileModel;
  size: number;
  /** Live robber position from GameState, not the board's initial flag. */
  hasRobber: boolean;
  /** True for one beat right after a roll matching this hex's number. */
  justRolled?: boolean;
}

export function HexTile({ hex, size, hasRobber, justRolled = false }: HexTileProps) {
  const center = hexToPixel(hex.coord, size);
  // Each tile is drawn slightly smaller than its cell so a sliver of water shows
  // between neighbours — separate physical pieces laid down, not a contiguous map.
  const radius = size * 0.965;
  const corners = getHexCorners({ x: 0, y: 0 }, radius);
  const points = corners.map((c) => `${c.x},${c.y}`).join(' ');
  const theme = TERRAIN_THEME[hex.terrain];
  const gradientId = `terrain-${hex.id}`;
  const clipId = `hex-clip-${hex.id}`;

  return (
    <g transform={`translate(${center.x} ${center.y})`}>
      <defs>
        <radialGradient id={gradientId} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={theme.gradientTo} />
          <stop offset="100%" stopColor={theme.gradientFrom} />
        </radialGradient>
        <clipPath id={clipId}>
          <polygon points={points} />
        </clipPath>
      </defs>
      {/* Themed color underneath the artwork: fallback if the image can't load,
          and guarantees no gap shows at the tile edge from crop rounding. */}
      <polygon
        points={points}
        fill={`url(#${gradientId})`}
        stroke={theme.stroke}
        strokeWidth={size * 0.035}
        strokeLinejoin="round"
        filter="url(#hex-shadow)"
      />
      {/*
        The source art is a tightly-cropped pointy-top hex (width:height ≈
        sqrt(3):2); a regular hexagon rotated 90° switches from pointy-top to
        flat-top (our grid's orientation), and rotating that same tight
        rectangle 90° swaps its aspect to 2:sqrt(3) — exactly our flat-top
        tile's own bounding box — so the crop lands on our tile edge directly,
        no oversized square padding needed this time.
      */}
      <g clipPath={`url(#${clipId})`}>
        <image
          href={theme.art}
          x={(-radius * Math.sqrt(3)) / 2}
          y={-radius}
          width={radius * Math.sqrt(3)}
          height={radius * 2}
          transform="rotate(90)"
          preserveAspectRatio="xMidYMid slice"
        />
      </g>
      {/*
        The board rotates -90 as a whole; these two carry readable content
        (a numeral, a figure) so each gets its own local rotate(90) to cancel
        that and stay upright. The animated pieces keep their CSS-transform
        keyframes on a separate inner <g> from this positioning rotate — an SVG
        `transform` attribute and a CSS `transform` animation on the very same
        element don't compose, the CSS one simply replaces the attribute for
        the animation's duration (see the same fix applied to RoadPiece).
      */}
      {hex.numberToken !== null && (
        <g transform="rotate(90)">
          <NumberToken value={hex.numberToken} radius={size * 0.285} pulsing={justRolled} />
        </g>
      )}
      {hasRobber && (
        <g transform="rotate(90)">
          <g className="piece piece--robber-hop">
            <RobberPiece scale={size} />
          </g>
        </g>
      )}
    </g>
  );
}
