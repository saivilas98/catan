import { describe, expect, it } from 'vitest';
import { generateBoard } from '../board/boardGenerator';
import { validateBoard } from '../board/boardValidator';

describe('generateBoard', () => {
  it('contains 19 hexes', () => {
    const board = generateBoard(1);
    expect(board.hexes).toHaveLength(19);
  });

  it('has the correct terrain distribution', () => {
    const board = generateBoard(1);
    const counts: Record<string, number> = {};
    for (const hex of board.hexes) {
      counts[hex.terrain] = (counts[hex.terrain] ?? 0) + 1;
    }
    expect(counts).toEqual({
      forest: 4,
      pasture: 4,
      fields: 4,
      mountains: 3,
      hills: 3,
      desert: 1,
    });
  });

  it('has exactly one desert', () => {
    const board = generateBoard(1);
    const deserts = board.hexes.filter((h) => h.terrain === 'desert');
    expect(deserts).toHaveLength(1);
  });

  it('gives the desert no number token', () => {
    const board = generateBoard(1);
    const desert = board.hexes.find((h) => h.terrain === 'desert')!;
    expect(desert.numberToken).toBeNull();
  });

  it('assigns the correct number token distribution', () => {
    const board = generateBoard(1);
    const tokens = board.hexes
      .map((h) => h.numberToken)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    expect(tokens).toEqual([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
  });

  it('gives every hex a unique ID', () => {
    const board = generateBoard(1);
    const ids = board.hexes.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every intersection a unique ID', () => {
    const board = generateBoard(1);
    const ids = board.intersections.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every edge a unique ID', () => {
    const board = generateBoard(1);
    const ids = board.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('produces valid neighbor relationships (each hex has 6 edges and 6 intersections)', () => {
    const board = generateBoard(1);
    for (const hex of board.hexes) {
      expect(hex.edgeIds).toHaveLength(6);
      expect(hex.intersectionIds).toHaveLength(6);
    }
    // Corner/edge hexes touch fewer than 3 hexes at a shared intersection; interior
    // intersections touch exactly 3. Every intersection should touch 1-3 hexes.
    for (const intersection of board.intersections) {
      expect(intersection.hexIds.length).toBeGreaterThanOrEqual(1);
      expect(intersection.hexIds.length).toBeLessThanOrEqual(3);
    }
  });

  it('produces the same board for the same seed', () => {
    const boardA = generateBoard(42);
    const boardB = generateBoard(42);
    expect(boardA.hexes.map((h) => h.terrain)).toEqual(boardB.hexes.map((h) => h.terrain));
    expect(boardA.hexes.map((h) => h.numberToken)).toEqual(boardB.hexes.map((h) => h.numberToken));
  });

  it('can produce different boards for different seeds', () => {
    const boardA = generateBoard(1);
    const boardB = generateBoard(2);
    const layoutA = boardA.hexes.map((h) => h.terrain).join(',');
    const layoutB = boardB.hexes.map((h) => h.terrain).join(',');
    expect(layoutA).not.toEqual(layoutB);
  });

  it('passes structural validation', () => {
    const board = generateBoard(7);
    const result = validateBoard(board);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('generateBoard (5-6 player extended board)', () => {
  it('contains 30 hexes for 5 players', () => {
    const board = generateBoard(1, 5);
    expect(board.hexes).toHaveLength(30);
  });

  it('contains 30 hexes for 6 players', () => {
    const board = generateBoard(1, 6);
    expect(board.hexes).toHaveLength(30);
  });

  it('has the correct terrain distribution', () => {
    const board = generateBoard(1, 6);
    const counts: Record<string, number> = {};
    for (const hex of board.hexes) {
      counts[hex.terrain] = (counts[hex.terrain] ?? 0) + 1;
    }
    expect(counts).toEqual({
      forest: 6,
      pasture: 6,
      fields: 6,
      mountains: 5,
      hills: 5,
      desert: 2,
    });
  });

  it('has exactly one hex holding the robber, on a desert', () => {
    const board = generateBoard(1, 6);
    const robberHexes = board.hexes.filter((h) => h.hasRobber);
    expect(robberHexes).toHaveLength(1);
    expect(robberHexes[0].terrain).toBe('desert');
  });

  it('gives both deserts no number token', () => {
    const board = generateBoard(1, 6);
    const deserts = board.hexes.filter((h) => h.terrain === 'desert');
    expect(deserts).toHaveLength(2);
    for (const desert of deserts) expect(desert.numberToken).toBeNull();
  });

  it('assigns the correct 28-token number distribution', () => {
    const board = generateBoard(1, 6);
    const tokens = board.hexes
      .map((h) => h.numberToken)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    expect(tokens).toEqual([
      2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12,
    ]);
  });

  it('places 11 ports covering every resource', () => {
    const board = generateBoard(1, 6);
    expect(board.ports).toHaveLength(11);
    const resourcePorts = board.ports.filter((p) => p.type === 'RESOURCE_2_TO_1');
    const resources = new Set(resourcePorts.map((p) => p.resource));
    expect(resources.size).toBe(5);
  });

  it('produces valid neighbor relationships (each hex has 6 edges and 6 intersections)', () => {
    const board = generateBoard(1, 6);
    for (const hex of board.hexes) {
      expect(hex.edgeIds).toHaveLength(6);
      expect(hex.intersectionIds).toHaveLength(6);
    }
  });

  it('passes structural validation', () => {
    const board = generateBoard(7, 6);
    const result = validateBoard(board);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
