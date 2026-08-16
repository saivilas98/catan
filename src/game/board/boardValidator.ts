// Structural validation for a generated Board. This checks shape/consistency only —
// it does not enforce gameplay rules (that belongs to later sprints).

import type { Board, TerrainType } from '../models/types';

export interface BoardValidationResult {
  valid: boolean;
  errors: string[];
}

const EXPECTED_TERRAIN_COUNTS: Record<TerrainType, number> = {
  forest: 4,
  pasture: 4,
  fields: 4,
  mountains: 3,
  hills: 3,
  desert: 1,
};

const EXPECTED_NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

function hasDuplicates(ids: string[]): boolean {
  return new Set(ids).size !== ids.length;
}

export function validateBoard(board: Board): BoardValidationResult {
  const errors: string[] = [];

  if (board.hexes.length !== 19) {
    errors.push(`Expected 19 hexes, found ${board.hexes.length}`);
  }

  const terrainCounts: Partial<Record<TerrainType, number>> = {};
  for (const hex of board.hexes) {
    terrainCounts[hex.terrain] = (terrainCounts[hex.terrain] ?? 0) + 1;
  }
  for (const [terrain, expected] of Object.entries(EXPECTED_TERRAIN_COUNTS)) {
    const actual = terrainCounts[terrain as TerrainType] ?? 0;
    if (actual !== expected) {
      errors.push(`Expected ${expected} ${terrain} hexes, found ${actual}`);
    }
  }

  const deserts = board.hexes.filter((h) => h.terrain === 'desert');
  if (deserts.length !== 1) {
    errors.push(`Expected exactly 1 desert hex, found ${deserts.length}`);
  }
  for (const desert of deserts) {
    if (desert.numberToken !== null) {
      errors.push(`Desert hex ${desert.id} should not have a number token`);
    }
    if (!desert.hasRobber) {
      errors.push(`Desert hex ${desert.id} should start holding the robber`);
    }
  }

  const numberTokens = board.hexes
    .filter((h) => h.terrain !== 'desert')
    .map((h) => h.numberToken)
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
  const expectedSorted = [...EXPECTED_NUMBER_TOKENS].sort((a, b) => a - b);
  if (JSON.stringify(numberTokens) !== JSON.stringify(expectedSorted)) {
    errors.push('Number token distribution does not match the standard Catan set');
  }

  const nonDesertMissingToken = board.hexes.find(
    (h) => h.terrain !== 'desert' && h.numberToken === null
  );
  if (nonDesertMissingToken) {
    errors.push(`Non-desert hex ${nonDesertMissingToken.id} is missing a number token`);
  }

  if (hasDuplicates(board.hexes.map((h) => h.id))) {
    errors.push('Duplicate hex IDs found');
  }
  if (hasDuplicates(board.intersections.map((i) => i.id))) {
    errors.push('Duplicate intersection IDs found');
  }
  if (hasDuplicates(board.edges.map((e) => e.id))) {
    errors.push('Duplicate edge IDs found');
  }

  const hexIds = new Set(board.hexes.map((h) => h.id));
  for (const edge of board.edges) {
    if (edge.hexIds.length < 1 || edge.hexIds.length > 2) {
      errors.push(`Edge ${edge.id} should touch 1 or 2 hexes, touches ${edge.hexIds.length}`);
    }
    for (const hid of edge.hexIds) {
      if (!hexIds.has(hid)) errors.push(`Edge ${edge.id} references unknown hex ${hid}`);
    }
    if (edge.intersectionIds.length !== 2) {
      errors.push(`Edge ${edge.id} should have exactly 2 endpoint intersections`);
    }
  }

  const intersectionIds = new Set(board.intersections.map((i) => i.id));
  for (const intersection of board.intersections) {
    if (intersection.hexIds.length < 1 || intersection.hexIds.length > 3) {
      errors.push(
        `Intersection ${intersection.id} should touch 1-3 hexes, touches ${intersection.hexIds.length}`
      );
    }
    for (const hid of intersection.hexIds) {
      if (!hexIds.has(hid)) {
        errors.push(`Intersection ${intersection.id} references unknown hex ${hid}`);
      }
    }
    for (const eid of intersection.edgeIds) {
      if (!board.edges.some((e) => e.id === eid)) {
        errors.push(`Intersection ${intersection.id} references unknown edge ${eid}`);
      }
    }
    for (const iid of intersection.intersectionIds) {
      if (!intersectionIds.has(iid)) {
        errors.push(`Intersection ${intersection.id} references unknown neighbor ${iid}`);
      }
    }
  }

  for (const hex of board.hexes) {
    if (hex.intersectionIds.length !== 6) {
      errors.push(`Hex ${hex.id} should have 6 intersections, has ${hex.intersectionIds.length}`);
    }
    if (hex.edgeIds.length !== 6) {
      errors.push(`Hex ${hex.id} should have 6 edges, has ${hex.edgeIds.length}`);
    }
  }

  if (board.ports.length !== 9) {
    errors.push(`Expected 9 ports, found ${board.ports.length}`);
  }
  const genericPorts = board.ports.filter((p) => p.type === 'GENERIC_3_TO_1');
  if (genericPorts.length !== 4) {
    errors.push(`Expected 4 generic 3:1 ports, found ${genericPorts.length}`);
  }
  const resourcePorts = board.ports.filter((p) => p.type === 'RESOURCE_2_TO_1');
  if (resourcePorts.length !== 5) {
    errors.push(`Expected 5 resource-specific 2:1 ports, found ${resourcePorts.length}`);
  }
  const resourcePortTypes = new Set(resourcePorts.map((p) => p.resource));
  if (resourcePortTypes.size !== 5) {
    errors.push('Expected one resource-specific port per resource type');
  }
  if (hasDuplicates(board.ports.map((p) => p.id))) {
    errors.push('Duplicate port IDs found');
  }
  const edgeIds = new Set(board.edges.map((e) => e.id));
  for (const port of board.ports) {
    if (!edgeIds.has(port.edgeId)) {
      errors.push(`Port ${port.id} references unknown edge ${port.edgeId}`);
    }
    const edge = board.edges.find((e) => e.id === port.edgeId);
    if (edge && edge.hexIds.length !== 1) {
      errors.push(`Port ${port.id} is not on a coastal (boundary) edge`);
    }
    if (port.type === 'RESOURCE_2_TO_1' && !port.resource) {
      errors.push(`Port ${port.id} is resource-specific but has no resource`);
    }
    if (port.type === 'GENERIC_3_TO_1' && port.resource) {
      errors.push(`Port ${port.id} is generic but has a resource set`);
    }
  }

  return { valid: errors.length === 0, errors };
}
