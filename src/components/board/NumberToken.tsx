interface NumberTokenProps {
  value: number;
  radius: number;
  /** True for one beat right after a matching roll — the token visibly presses. */
  pulsing?: boolean;
}

const DOT_COUNTS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

/**
 * A small engraved medallion sitting on the tile: a bronze rim, an inset coin
 * groove, a gently stamped numeral, and bead-like probability pips — quieter
 * and a touch smaller than a plain flat disc, so it reads as a crafted piece
 * rather than a UI badge. 6 and 8 keep a deep-garnet numeral and a soft warm
 * halo so the hot numbers still pop without extra decoration.
 * (#token-face / #token-shadow are defined once in HexBoard's <defs>.)
 */
export function NumberToken({ value, radius, pulsing = false }: NumberTokenProps) {
  const isHot = value === 6 || value === 8;
  const ink = isHot ? '#8f2418' : '#3a2f1c';
  const dots = DOT_COUNTS[value] ?? 0;
  const dotSpacing = radius * 0.24;
  const startX = -((dots - 1) * dotSpacing) / 2;

  return (
    <g filter="url(#token-shadow)" className={pulsing ? 'number-token--pulse' : undefined}>
      {isHot && <circle r={radius * 0.92} fill="#c94a2f" opacity={0.16} />}

      {/* Bronze rim, then the parchment face inset within it — a coin, not a disc. */}
      <circle r={radius} fill="#8a6a3a" />
      <circle r={radius * 0.9} fill="url(#token-face)" />

      {/* Engraved groove near the rim. */}
      <circle
        r={radius * 0.78}
        fill="none"
        stroke={isHot ? '#b96a4a' : '#b39a6b'}
        strokeOpacity={0.45}
        strokeWidth={radius * 0.03}
      />

      {/* Bevel: light grazes the upper-left arc, shade settles on the lower-right. */}
      <path
        d={`M ${-radius * 0.78} ${radius * 0.46} A ${radius * 0.9} ${radius * 0.9} 0 0 1 ${radius * 0.46} ${-radius * 0.78}`}
        fill="none"
        stroke="#fff9e8"
        strokeOpacity={0.5}
        strokeWidth={radius * 0.06}
        strokeLinecap="round"
      />
      <path
        d={`M ${radius * 0.78} ${-radius * 0.46} A ${radius * 0.9} ${radius * 0.9} 0 0 1 ${-radius * 0.46} ${radius * 0.78}`}
        fill="none"
        stroke="#8a744c"
        strokeOpacity={0.35}
        strokeWidth={radius * 0.06}
        strokeLinecap="round"
      />

      {/* A faint sunken duplicate under the numeral gives it a stamped, not
          printed, look — cheaper than a true SVG inset shadow and reads fine
          at this size. */}
      <text
        y={radius * 0.14}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={radius * (isHot ? 1.05 : 0.96)}
        fontWeight={800}
        fill={isHot ? '#5c140c' : '#241c10'}
        opacity={0.35}
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        {value}
      </text>
      <text
        y={radius * 0.08}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={radius * (isHot ? 1.05 : 0.96)}
        fontWeight={800}
        fill={ink}
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        {value}
      </text>

      <g transform={`translate(0 ${radius * 0.55})`}>
        {Array.from({ length: dots }).map((_, i) => (
          <g key={i} transform={`translate(${startX + i * dotSpacing} 0)`}>
            <circle r={radius * 0.05} fill={ink} />
            <circle cx={-radius * 0.015} cy={-radius * 0.015} r={radius * 0.016} fill="#fff9e8" opacity={0.5} />
          </g>
        ))}
      </g>
    </g>
  );
}
