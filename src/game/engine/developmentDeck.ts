// The development card deck: composition, deterministic shuffling, and drawing.

import type { DevelopmentCard, DevelopmentCardType } from '../models/types';
import {
  DEVELOPMENT_DECK_COMPOSITION,
  EXTENDED_DEVELOPMENT_DECK_COMPOSITION,
} from '../models/types';
import { createRng, randomSeed, shuffle } from '../utils/rng';

export const DEVELOPMENT_DECK_SIZE = Object.values(DEVELOPMENT_DECK_COMPOSITION).reduce(
  (sum, count) => sum + count,
  0
);

/** Player count at which a game switches to the larger 5-6 player expansion deck. */
const EXTENDED_DECK_PLAYER_THRESHOLD = 5;

/**
 * Builds and shuffles the development card deck — the standard 25-card deck, or the
 * 34-card 5-6 player expansion deck once the game has more than 4 players. Seeded so
 * a given seed always produces the same draw order, which is what makes
 * development-card tests deterministic. Cards start with acquiredTurnNumber 0;
 * buying stamps the real turn.
 */
export function generateDevelopmentDeck(
  seed: number = randomSeed(),
  playerCount = 4
): DevelopmentCard[] {
  const composition =
    playerCount >= EXTENDED_DECK_PLAYER_THRESHOLD
      ? EXTENDED_DEVELOPMENT_DECK_COMPOSITION
      : DEVELOPMENT_DECK_COMPOSITION;
  const ordered: DevelopmentCardType[] = [];
  for (const [type, count] of Object.entries(composition)) {
    for (let i = 0; i < count; i++) ordered.push(type as DevelopmentCardType);
  }

  const rng = createRng(seed);
  return shuffle(ordered, rng).map((type, index) => ({
    id: `dev-${index}-${type}`,
    type,
    acquiredTurnNumber: 0,
  }));
}

/**
 * Takes the top card. Returns null when the deck is exhausted so callers can
 * surface a clear error rather than letting the count go negative.
 */
export function drawDevelopmentCard(
  deck: DevelopmentCard[],
  turnNumber: number
): { card: DevelopmentCard; deck: DevelopmentCard[] } | null {
  if (deck.length === 0) return null;
  const [card, ...rest] = deck;
  return { card: { ...card, acquiredTurnNumber: turnNumber }, deck: rest };
}
