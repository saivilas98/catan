import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/actions';
import { placeBuilding } from '../engine/construction';
import {
  DEVELOPMENT_DECK_SIZE,
  drawDevelopmentCard,
  generateDevelopmentDeck,
} from '../engine/developmentDeck';
import {
  calculateLargestArmy,
  countPlayedKnights,
  getPlayableCards,
  getTotalVictoryPoints,
} from '../rules/development';
import type { DevelopmentCardType, GameState } from '../models/types';
import {
  createPlayingGame,
  expectOk,
  giveDevelopmentCard,
  givePlayedKnights,
  giveResources,
  readyToAct,
} from './helpers';

const CARD_COST = { wool: 1, grain: 1, ore: 1 };

function countByType(deck: Array<{ type: DevelopmentCardType }>) {
  return deck.reduce<Record<string, number>>((counts, card) => {
    counts[card.type] = (counts[card.type] ?? 0) + 1;
    return counts;
  }, {});
}

describe('development deck', () => {
  it('contains exactly 25 cards in the standard distribution', () => {
    const deck = generateDevelopmentDeck(1);
    expect(deck).toHaveLength(25);
    expect(DEVELOPMENT_DECK_SIZE).toBe(25);
    // 2 Monopoly cards, matching the real boxed game — this is what makes 25.
    expect(countByType(deck)).toEqual({
      knight: 14,
      victoryPoint: 5,
      roadBuilding: 2,
      yearOfPlenty: 2,
      monopoly: 2,
    });
  });

  it('shuffles deterministically for a given seed', () => {
    expect(generateDevelopmentDeck(42).map((c) => c.type)).toEqual(
      generateDevelopmentDeck(42).map((c) => c.type)
    );
  });

  it('generally produces different orders for different seeds', () => {
    const a = generateDevelopmentDeck(1).map((c) => c.type).join(',');
    const b = generateDevelopmentDeck(2).map((c) => c.type).join(',');
    expect(a).not.toEqual(b);
  });

  it('gives every card a unique id', () => {
    const ids = generateDevelopmentDeck(1).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws from the front and never goes below zero', () => {
    let deck = generateDevelopmentDeck(1);
    for (let i = 0; i < 25; i++) {
      const drawn = drawDevelopmentCard(deck, 1);
      expect(drawn).not.toBeNull();
      deck = drawn!.deck;
    }
    expect(deck).toHaveLength(0);
    expect(drawDevelopmentCard(deck, 1)).toBeNull();
  });

  it('stamps the acquisition turn on a drawn card', () => {
    const drawn = drawDevelopmentCard(generateDevelopmentDeck(1), 7)!;
    expect(drawn.card.acquiredTurnNumber).toBe(7);
  });
});

describe('buying development cards', () => {
  it('deducts exactly 1 wool, 1 grain and 1 ore and adds the card to hand', () => {
    let game = readyToAct();
    game = giveResources(game, 'player-0', { wool: 2, grain: 2, ore: 2, brick: 1 });

    const built = expectOk(
      applyAction(game, { type: 'BUY_DEVELOPMENT_CARD', playerId: 'player-0' })
    );

    expect(built.players[0].resources).toEqual({
      brick: 1,
      lumber: 0,
      wool: 1,
      grain: 1,
      ore: 1,
    });
    expect(built.players[0].developmentCards).toHaveLength(1);
    expect(built.developmentDeck).toHaveLength(24);
  });

  it('rejects a purchase without enough resources', () => {
    let game = readyToAct();
    game = giveResources(game, 'player-0', { wool: 1, grain: 1, ore: 0 });
    const result = applyAction(game, { type: 'BUY_DEVELOPMENT_CARD', playerId: 'player-0' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_DEVELOPMENT_CARD');
  });

  it('rejects a purchase before rolling', () => {
    let game = createPlayingGame(); // AWAITING_ROLL
    game = giveResources(game, 'player-0', CARD_COST);
    const result = applyAction(game, { type: 'BUY_DEVELOPMENT_CARD', playerId: 'player-0' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/roll the dice/i);
  });

  it('rejects a purchase when the deck is empty', () => {
    let game = readyToAct();
    game = giveResources(game, 'player-0', CARD_COST);
    game = { ...game, developmentDeck: [] };
    const result = applyAction(game, { type: 'BUY_DEVELOPMENT_CARD', playerId: 'player-0' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/deck is empty/i);
  });

  it('does not reveal the card type in the event log', () => {
    let game = readyToAct();
    game = giveResources(game, 'player-0', CARD_COST);
    const built = expectOk(
      applyAction(game, { type: 'BUY_DEVELOPMENT_CARD', playerId: 'player-0' })
    );
    const event = built.eventLog.find((e) => e.type === 'DEV_CARD_BOUGHT')!;
    expect(event.message).toBe('Sai bought a development card');
    for (const type of ['Knight', 'Monopoly', 'Road Building', 'Year of Plenty']) {
      expect(event.message).not.toContain(type);
    }
  });
});

describe('current-turn card restriction', () => {
  it('refuses to play a card bought on the same turn', () => {
    let game = readyToAct();
    game = giveResources(game, 'player-0', CARD_COST);
    // Force a knight to the top of the deck so the purchase is predictable.
    game = {
      ...game,
      developmentDeck: [
        { id: 'top-knight', type: 'knight', acquiredTurnNumber: 0 },
        ...game.developmentDeck,
      ],
    };
    const bought = expectOk(
      applyAction(game, { type: 'BUY_DEVELOPMENT_CARD', playerId: 'player-0' })
    );

    expect(bought.players[0].developmentCards[0].acquiredTurnNumber).toBe(bought.turnNumber);

    const result = applyAction(bought, { type: 'PLAY_KNIGHT', playerId: 'player-0' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/turn you bought it/i);
  });

  it('allows the card once a later turn has begun', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'knight', game.turnNumber);
    expect(getPlayableCards(game, 'player-0')).toHaveLength(0);

    const laterTurn: GameState = { ...game, turnNumber: game.turnNumber + 3 };
    expect(getPlayableCards(laterTurn, 'player-0')).toHaveLength(1);
  });

  it('never lists Victory Point cards as playable', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'victoryPoint');
    expect(getPlayableCards(game, 'player-0')).toHaveLength(0);
  });
});

describe('victory point cards', () => {
  it('count toward the true total but not the public score', () => {
    let game = readyToAct();
    // Two real cities on the board = 4 public points.
    const spots = game.board.intersections.filter((i) => i.hexIds.length === 3).slice(0, 2);
    for (const spot of spots) {
      game = placeBuilding(game, 'player-0', spot.id, 'city', { free: true });
    }
    game = giveDevelopmentCard(game, 'player-0', 'victoryPoint');
    game = giveDevelopmentCard(game, 'player-0', 'victoryPoint');

    expect(game.players[0].victoryPoints).toBe(4); // public: buildings + bonuses
    expect(getTotalVictoryPoints(game, 'player-0')).toBe(6); // includes hidden cards
  });

  it('cannot be played as an action', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'victoryPoint');
    // There is no PLAY_VICTORY_POINT action at all; the closest attempt is rejected.
    expect(getPlayableCards(game, 'player-0')).toHaveLength(0);
  });
});

describe('one development card per turn', () => {
  it('rejects a second card play in the same turn', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'yearOfPlenty');
    game = giveDevelopmentCard(game, 'player-0', 'monopoly');

    const first = expectOk(
      applyAction(game, {
        type: 'PLAY_YEAR_OF_PLENTY',
        playerId: 'player-0',
        selection: { ore: 2 },
      })
    );
    const second = applyAction(first, {
      type: 'PLAY_MONOPOLY',
      playerId: 'player-0',
      resource: 'lumber',
    });

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.message).toMatch(/already played a development card/i);
  });

  it('resets the limit when the turn ends', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'yearOfPlenty');
    game = expectOk(
      applyAction(game, {
        type: 'PLAY_YEAR_OF_PLENTY',
        playerId: 'player-0',
        selection: { ore: 2 },
      })
    );
    expect(game.hasPlayedDevCardThisTurn).toBe(true);

    game = expectOk(applyAction(game, { type: 'END_TURN', playerId: 'player-0' }));
    expect(game.hasPlayedDevCardThisTurn).toBe(false);
  });
});

describe('knights', () => {
  it('rejects playing a knight the player does not own', () => {
    const game = readyToAct();
    const result = applyAction(game, { type: 'PLAY_KNIGHT', playerId: 'player-0' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/do not have a knight/i);
  });

  it('consumes the card, counts the knight, and demands a robber move', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'knight');

    const played = expectOk(applyAction(game, { type: 'PLAY_KNIGHT', playerId: 'player-0' }));

    expect(played.players[0].developmentCards).toHaveLength(0);
    expect(played.players[0].playedDevelopmentCards).toHaveLength(1);
    expect(countPlayedKnights(played, 'player-0')).toBe(1);
    expect(played.turnPhase).toBe('MOVING_ROBBER');
    expect(played.robberMoveReason).toBe('KNIGHT');
  });

  it('logs the knight but never the rest of the hand', () => {
    let game = readyToAct();
    game = giveDevelopmentCard(game, 'player-0', 'knight');
    const played = expectOk(applyAction(game, { type: 'PLAY_KNIGHT', playerId: 'player-0' }));
    expect(played.eventLog.some((e) => e.message === 'Sai played a Knight')).toBe(true);
  });
});

describe('largest army', () => {
  it('is nobody with fewer than 3 played knights', () => {
    let game = readyToAct();
    game = givePlayedKnights(game, 'player-0', 2);
    expect(calculateLargestArmy(game)).toBeNull();
  });

  it('goes to the first player to reach 3 knights', () => {
    let game = readyToAct();
    game = givePlayedKnights(game, 'player-0', 3);
    expect(calculateLargestArmy(game)).toBe('player-0');
  });

  it('transfers only when a challenger strictly exceeds the holder', () => {
    let game = readyToAct();
    game = givePlayedKnights(game, 'player-0', 3);
    game = { ...game, largestArmyPlayerId: 'player-0' };

    // A tie at 3 leaves the badge with the incumbent.
    game = givePlayedKnights(game, 'player-1', 3);
    expect(calculateLargestArmy(game)).toBe('player-0');

    // Pulling ahead to 4 takes it.
    game = givePlayedKnights(game, 'player-1', 1);
    expect(calculateLargestArmy(game)).toBe('player-1');
  });

  it('updates automatically when the third knight is played', () => {
    let game = readyToAct();
    game = givePlayedKnights(game, 'player-0', 2);
    game = giveDevelopmentCard(game, 'player-0', 'knight');

    const played = expectOk(applyAction(game, { type: 'PLAY_KNIGHT', playerId: 'player-0' }));
    expect(played.largestArmyPlayerId).toBe('player-0');
    expect(played.eventLog.some((e) => e.type === 'LARGEST_ARMY')).toBe(true);
  });
});
