// Hex-grid geometry: axial coordinates, neighbor lookups, and pixel/corner math.
// Orientation is "flat-top" (matches the classic Catan board's row layout: 3-4-5-4-3).
// This module is pure math — it knows nothing about terrain, players, or React.

import type { AxialCoord, Point } from '../models/types';

export const BOARD_RADIUS = 2; // radius-2 hex grid = 19 tiles, matches standard Catan.

/** The 6 axial step directions, in clockwise order starting from due east. */
const AXIAL_DIRECTIONS: ReadonlyArray<{ q: number; r: number }> = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function makeAxial(q: number, r: number): AxialCoord {
  return { q, r, s: -q - r };
}

export function axialKey(coord: { q: number; r: number }): string {
  return `${coord.q},${coord.r}`;
}

export function hexId(coord: { q: number; r: number }): string {
  const qPart = coord.q < 0 ? `n${-coord.q}` : `${coord.q}`;
  const rPart = coord.r < 0 ? `n${-coord.r}` : `${coord.r}`;
  return `hex-q${qPart}-r${rPart}`;
}

export function axialDistance(a: AxialCoord, b: AxialCoord): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
}

/** All axial coordinates within `radius` of the origin (a full hexagonal board shape). */
export function generateHexCoords(radius: number): AxialCoord[] {
  const coords: AxialCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      coords.push(makeAxial(q, r));
    }
  }
  return coords;
}

export const EXTENDED_BOARD_RADIUS = 3; // base radius for the 5-6 player extended board.

/**
 * The 30-hex "extended" board used for 5-6 players: a radius-3 hexagon (37 tiles)
 * with the last row of each column trimmed off, producing the standard elongated
 * 3-4-5-6-5-4-3 column shape rather than a full 4-5-6-7-6-5-4 hexagon.
 */
export function generateExtendedHexCoords(): AxialCoord[] {
  const radius = EXTENDED_BOARD_RADIUS;
  const coords: AxialCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius) - 1;
    for (let r = rMin; r <= rMax; r++) {
      coords.push(makeAxial(q, r));
    }
  }
  return coords;
}

/** The 6 neighboring axial coordinates of a hex (not filtered to any particular board). */
export function getHexNeighborCoords(coord: AxialCoord): AxialCoord[] {
  return AXIAL_DIRECTIONS.map((dir) => makeAxial(coord.q + dir.q, coord.r + dir.r));
}

export function hexToPixel(coord: AxialCoord, size: number): Point {
  const x = size * (1.5 * coord.q);
  const y = size * ((Math.sqrt(3) / 2) * coord.q + Math.sqrt(3) * coord.r);
  return { x, y };
}

/** The 6 corner points of a flat-top hex centered at `center`, in clockwise order. */
export function getHexCorners(center: Point, size: number): Point[] {
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;
    corners.push({
      x: center.x + size * Math.cos(angleRad),
      y: center.y + size * Math.sin(angleRad),
    });
  }
  return corners;
}

/** Round a pixel coordinate to a stable grid key so shared corners/edges dedupe correctly. */
export function pointKey(p: Point, precision = 2): string {
  return `${p.x.toFixed(precision)}:${p.y.toFixed(precision)}`;
}
