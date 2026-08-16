import type { GameState } from '../game/models/types';

export interface PostGameStats {
  turns: number;
  rollsCount: number;
  /** Frequency of each dice total 2-12, parsed from the DICE_ROLLED log messages. */
  rollHistogram: Record<number, number>;
  robberMoves: number;
  resourcesStolen: number;
  devCardsPlayed: number;
  tradesCompleted: number;
}

const ROLL_TOTAL_PATTERN = /rolled (\d+)/;

/**
 * Fun end-of-game numbers, derived entirely from the existing event log — no
 * new engine state, just reading what already happened.
 */
export function getPostGameStats(game: GameState): PostGameStats {
  const rollHistogram: Record<number, number> = {};
  let rollsCount = 0;
  let robberMoves = 0;
  let resourcesStolen = 0;
  let devCardsPlayed = 0;
  let tradesCompleted = 0;

  for (const event of game.eventLog) {
    switch (event.type) {
      case 'DICE_ROLLED': {
        const match = ROLL_TOTAL_PATTERN.exec(event.message);
        if (match) {
          const total = Number(match[1]);
          rollHistogram[total] = (rollHistogram[total] ?? 0) + 1;
          rollsCount += 1;
        }
        break;
      }
      case 'ROBBER_MOVED':
        robberMoves += 1;
        break;
      case 'RESOURCE_STOLEN':
        resourcesStolen += 1;
        break;
      case 'DEV_CARD_PLAYED':
        devCardsPlayed += 1;
        break;
      case 'TRADE_ACCEPTED':
      case 'BANK_TRADE':
        tradesCompleted += 1;
        break;
      default:
        break;
    }
  }

  return {
    turns: game.turnNumber,
    rollsCount,
    rollHistogram,
    robberMoves,
    resourcesStolen,
    devCardsPlayed,
    tradesCompleted,
  };
}
