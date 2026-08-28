// Builds a full Board: terrain hexes, number tokens, and the intersection/edge graph
// that future sprints will use for settlement and road placement.

import type {
  Board,
  Edge,
  HexTile,
  Intersection,
  Port,
  PortType,
  ResourceType,
  TerrainType,
} from '../models/types';
import { RESOURCE_TYPES, TERRAIN_TO_RESOURCE } from '../models/types';
import type { RNG } from '../utils/rng';
import { createRng, randomSeed, shuffle } from '../utils/rng';
import {
  generateHexCoords,
  generateExtendedHexCoords,
  getHexCorners,
  hexId,
  hexToPixel,
  pointKey,
  BOARD_RADIUS,
} from './hexGeometry';

const HEX_SIZE = 1;

/** Board uses the 30-hex extended layout once a game has more than 4 players. */
export const EXTENDED_BOARD_PLAYER_THRESHOLD = 5;

export const TERRAIN_DECK: TerrainType[] = [
  ...Array(4).fill('forest'),
  ...Array(4).fill('pasture'),
  ...Array(4).fill('fields'),
  ...Array(3).fill('mountains'),
  ...Array(3).fill('hills'),
  ...Array(1).fill('desert'),
] as TerrainType[];

export const NUMBER_TOKEN_DECK: number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

/** The 30-tile deck for the 5-6 player extended board (standard expansion counts). */
export const EXTENDED_TERRAIN_DECK: TerrainType[] = [
  ...Array(6).fill('forest'),
  ...Array(6).fill('pasture'),
  ...Array(6).fill('fields'),
  ...Array(5).fill('mountains'),
  ...Array(5).fill('hills'),
  ...Array(2).fill('desert'),
] as TerrainType[];

/** 28 number tokens for the 28 non-desert hexes on the extended board. */
export const EXTENDED_NUMBER_TOKEN_DECK: number[] = [
  2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12,
];

/** The standard Catan harbor deck: 4 generic + one 2:1 port per resource. */
export const PORT_COUNT = 9;
const GENERIC_PORT_COUNT = 4;

/** The extended board's 11-harbor deck: 5 generic + 6 resource-specific (one resource repeats). */
export const EXTENDED_PORT_COUNT = 11;
const EXTENDED_GENERIC_PORT_COUNT = 5;

function buildPortDeck(portCount: number, genericCount: number): PortType[] {
  return [
    ...Array<PortType>(genericCount).fill('GENERIC_3_TO_1'),
    ...Array<PortType>(portCount - genericCount).fill('RESOURCE_2_TO_1'),
  ];
}

/**
 * Places the 9 harbors around the coastline. Boundary edges (touching exactly one
 * hex) are ordered by angle around the board center so the chosen edges are spread
 * evenly around the ring, the same way the physical board's harbors are spaced out
 * rather than clustered.
 */
function generatePorts(
  edges: Edge[],
  intersections: Intersection[],
  rng: RNG,
  portCount: number,
  genericCount: number
): Port[] {
  const boundaryEdges = edges.filter((e) => e.hexIds.length === 1);
  const intersectionById = new Map(intersections.map((i) => [i.id, i]));

  const withAngle = boundaryEdges.map((edge) => {
    const [aId, bId] = edge.intersectionIds;
    const a = intersectionById.get(aId)!;
    const b = intersectionById.get(bId)!;
    const midX = (a.position.x + b.position.x) / 2;
    const midY = (a.position.y + b.position.y) / 2;
    return { edge, angle: Math.atan2(midY, midX) };
  });
  withAngle.sort((x, y) => x.angle - y.angle);

  const deck = shuffle(buildPortDeck(portCount, genericCount), rng);
  // Cycle through a shuffled resource order so any extra resource-port slots
  // (the extended board has more resource ports than resource types) wrap
  // around rather than running out.
  const resourceOrder = shuffle([...RESOURCE_TYPES], rng);
  let resourceCursor = 0;

  const step = withAngle.length / portCount;
  const chosenIndices = Array.from({ length: portCount }, (_, i) =>
    Math.round(i * step) % withAngle.length
  );

  return chosenIndices.map((edgeIndex, i) => {
    const { edge } = withAngle[edgeIndex];
    const type = deck[i];
    const resource =
      type === 'RESOURCE_2_TO_1' ? resourceOrder[resourceCursor++ % resourceOrder.length] : null;
    return {
      id: `port-${i}`,
      type,
      resource,
      edgeId: edge.id,
      intersectionIds: edge.intersectionIds,
    };
  });
}

export function generateBoard(seed: number = randomSeed(), playerCount = 4): Board {
  const rng = createRng(seed);
  const extended = playerCount >= EXTENDED_BOARD_PLAYER_THRESHOLD;
  const coords = extended ? generateExtendedHexCoords() : generateHexCoords(BOARD_RADIUS);

  const terrainAssignment = shuffle(extended ? EXTENDED_TERRAIN_DECK : TERRAIN_DECK, rng);
  const numberDeck = shuffle(extended ? EXTENDED_NUMBER_TOKEN_DECK : NUMBER_TOKEN_DECK, rng);
  let numberCursor = 0;
  let robberPlaced = false;

  const intersectionByKey = new Map<string, Intersection>();
  const edgeByKey = new Map<string, Edge>();

  const hexes: HexTile[] = coords.map((coord, index) => {
    const terrain = terrainAssignment[index];
    const resource: ResourceType | null = TERRAIN_TO_RESOURCE[terrain];
    const numberToken = terrain === 'desert' ? null : numberDeck[numberCursor++];
    // Only the first desert encountered starts holding the robber — with 2 deserts
    // on the extended board, the second must start clear.
    const hasRobber = terrain === 'desert' && !robberPlaced;
    if (hasRobber) robberPlaced = true;

    const center = hexToPixel(coord, HEX_SIZE);
    const corners = getHexCorners(center, HEX_SIZE);
    const id = hexId(coord);

    const intersectionIds = corners.map((corner) => {
      const key = pointKey(corner);
      let intersection = intersectionByKey.get(key);
      if (!intersection) {
        intersection = {
          id: `int-${intersectionByKey.size}`,
          position: corner,
          hexIds: [],
          intersectionIds: [],
          edgeIds: [],
          building: null,
        };
        intersectionByKey.set(key, intersection);
      }
      if (!intersection.hexIds.includes(id)) intersection.hexIds.push(id);
      return intersection.id;
    });

    const edgeIds = corners.map((corner, i) => {
      const next = corners[(i + 1) % corners.length];
      const a = intersectionIds[i];
      const b = intersectionIds[(i + 1) % intersectionIds.length];
      const key = [a, b].sort().join('|');
      let edge = edgeByKey.get(key);
      if (!edge) {
        edge = {
          id: `edge-${edgeByKey.size}`,
          intersectionIds: [a, b],
          hexIds: [],
          road: null,
        };
        edgeByKey.set(key, edge);

        const intA = intersectionByKey.get(pointKey(corner))!;
        const intB = intersectionByKey.get(pointKey(next))!;
        if (!intA.intersectionIds.includes(b)) intA.intersectionIds.push(b);
        if (!intB.intersectionIds.includes(a)) intB.intersectionIds.push(a);
        if (!intA.edgeIds.includes(edge.id)) intA.edgeIds.push(edge.id);
        if (!intB.edgeIds.includes(edge.id)) intB.edgeIds.push(edge.id);
      }
      if (!edge.hexIds.includes(id)) edge.hexIds.push(id);
      return edge.id;
    });

    return {
      id,
      coord,
      terrain,
      resource,
      numberToken,
      hasRobber,
      intersectionIds,
      edgeIds,
    };
  });

  const edges = Array.from(edgeByKey.values());
  const intersections = Array.from(intersectionByKey.values());
  const ports = generatePorts(
    edges,
    intersections,
    rng,
    extended ? EXTENDED_PORT_COUNT : PORT_COUNT,
    extended ? EXTENDED_GENERIC_PORT_COUNT : GENERIC_PORT_COUNT
  );

  return {
    hexes,
    intersections,
    edges,
    ports,
    seed,
  };
}

export function getHexNeighbors(board: Board, hexTileId: string): HexTile[] {
  const hex = board.hexes.find((h) => h.id === hexTileId);
  if (!hex) return [];
  const neighborHexIds = new Set<string>();
  for (const edgeId of hex.edgeIds) {
    const edge = board.edges.find((e) => e.id === edgeId);
    if (!edge) continue;
    for (const id of edge.hexIds) {
      if (id !== hexTileId) neighborHexIds.add(id);
    }
  }
  return board.hexes.filter((h) => neighborHexIds.has(h.id));
}

export function getHexIntersections(board: Board, hexTileId: string): Intersection[] {
  const hex = board.hexes.find((h) => h.id === hexTileId);
  if (!hex) return [];
  return board.intersections.filter((i) => hex.intersectionIds.includes(i.id));
}

export function getHexEdges(board: Board, hexTileId: string): Edge[] {
  const hex = board.hexes.find((h) => h.id === hexTileId);
  if (!hex) return [];
  return board.edges.filter((e) => hex.edgeIds.includes(e.id));
}

/** Alias for getHexIntersections — matches the "vertices" terminology used elsewhere. */
export const getHexVertices = getHexIntersections;
