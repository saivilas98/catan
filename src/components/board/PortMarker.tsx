import type { Point, Port } from '../../game/models/types';
import { RESOURCE_DISPLAY } from '../../data/terrainTheme';

interface PortMarkerProps {
  port: Port;
  boardCenter: Point;
  a: Point;
  b: Point;
  scale: number;
}

/**
 * A harbor badge floating just offshore from its two coastal intersections, with
 * dock lines running back to them so the connection to the board graph is legible.
 */
export function PortMarker({ port, boardCenter, a, b, scale }: PortMarkerProps) {
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  // Push the badge outward, away from the board center, past the coastline.
  const dirX = midX - boardCenter.x;
  const dirY = midY - boardCenter.y;
  const dirLen = Math.hypot(dirX, dirY) || 1;
  const badgeX = midX + (dirX / dirLen) * scale * 0.55;
  const badgeY = midY + (dirY / dirLen) * scale * 0.55;

  const label = port.type === 'GENERIC_3_TO_1' ? '3:1' : '2:1';
  const icon = port.resource ? RESOURCE_DISPLAY[port.resource].icon : '⚓';
  const radius = scale * 0.3;

  return (
    <g className="port-marker">
      {/* A dark under-line first, then the pale dashed rope on top — keeps the
          dock line readable over the light sand as well as the dark water. */}
      <line x1={badgeX} y1={badgeY} x2={a.x} y2={a.y} className="port-marker__dock-shadow" />
      <line x1={badgeX} y1={badgeY} x2={b.x} y2={b.y} className="port-marker__dock-shadow" />
      <line x1={badgeX} y1={badgeY} x2={a.x} y2={a.y} className="port-marker__dock" />
      <line x1={badgeX} y1={badgeY} x2={b.x} y2={b.y} className="port-marker__dock" />
      {/* rotate(90) cancels the board's -90 rotation so the ratio/icon stay upright. */}
      <g transform={`translate(${badgeX} ${badgeY}) rotate(90)`} filter="url(#token-shadow)">
        {/* A parchment disc, same material family as the number tokens, so the
            trade ratio reads clearly against the ocean instead of blending into it. */}
        <circle r={radius} className="port-marker__badge" />
        <text
          y={-radius * 0.32}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={radius * 0.9}
        >
          {icon}
        </text>
        <line
          x1={-radius * 0.55}
          x2={radius * 0.55}
          y1={radius * 0.14}
          y2={radius * 0.14}
          className="port-marker__divider"
        />
        <text
          y={radius * 0.58}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={radius * 0.56}
          className="port-marker__rate"
        >
          {label}
        </text>
      </g>
    </g>
  );
}
