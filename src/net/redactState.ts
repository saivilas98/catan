// Pure GameState -> per-viewer view, run by the host before every broadcast.
// Must contain zero DOM/Node references so it type-checks in both the browser
// and server TS projects (see tsconfig.app.json / tsconfig.server.json).
import type { DevelopmentCard, GameState, Player, ResourceCount } from '../game/models/types';
import { countResources } from '../game/models/types';
import { emptyResources } from '../game/engine/gameEngine';

export interface RedactedPlayer extends Omit<Player, 'resources' | 'developmentCards'> {
  /** Zeroed out for every player but the viewer, unless the game has ended. */
  resources: ResourceCount;
  /** Accurate total even when `resources` above is zeroed — drives hand-size UI. */
  resourceCount: number;
  /** Emptied for every player but the viewer, unless the game has ended. */
  developmentCards: DevelopmentCard[];
  developmentCardCount: number;
}

// Deliberately NOT `Omit<..., 'diceRngState' | 'stealRngState'>`: keeping the same
// shape as GameState (with those two fields zeroed, never the real value) lets
// every existing UI component that already accepts a GameState accept this
// unchanged, since nothing in the UI ever reads those two fields directly.
export type RedactedGameState = Omit<GameState, 'players'> & {
  players: RedactedPlayer[];
};

/**
 * Produces the view of `state` that is safe to send to `viewerPlayerId` over the
 * network. Opponents' exact resources and development-card identities are never
 * serialized — only counts — and RNG state never leaves the host for anyone,
 * since it would let a client predict future dice/steal outcomes.
 *
 * Once the game ends, every player's cards become visible to everyone, matching
 * GameOverScreen's existing full victory-point breakdown. This deliberately does
 * NOT replicate local mode's PlayerPanels behavior of showing the *active*
 * player's hidden VP cards to everyone mid-game — that only worked because local
 * mode is one shared screen where the active player is the one looking at it;
 * over the network that would leak the active player's hand to every other
 * device, so network mode holds hidden cards back until game over instead.
 */
export function redactState(state: GameState, viewerPlayerId: string): RedactedGameState {
  const revealAll = state.phase === 'GAME_OVER';

  const players: RedactedPlayer[] = state.players.map((player) => {
    const visible = revealAll || player.id === viewerPlayerId;
    return {
      ...player,
      resources: visible ? player.resources : emptyResources(),
      resourceCount: countResources(player.resources),
      developmentCards: visible ? player.developmentCards : [],
      developmentCardCount: player.developmentCards.length,
    };
  });

  return {
    phase: state.phase,
    turnPhase: state.turnPhase,
    players,
    currentPlayerId: state.currentPlayerId,
    turnNumber: state.turnNumber,
    setupOrderIndex: state.setupOrderIndex,
    setupStep: state.setupStep,
    pendingSettlementId: state.pendingSettlementId,
    hasRolledThisTurn: state.hasRolledThisTurn,
    diceResult: state.diceResult,
    lastDiceRoll: state.lastDiceRoll,
    robberHexId: state.robberHexId,
    // Contents (and order) are secret — the buyer must not know what they'll draw
    // next, let alone anyone else. Only the count is ever used by the UI.
    developmentDeck: opaqueDeck(state.developmentDeck.length),
    pendingDiscards: state.pendingDiscards,
    stealCandidateIds: state.stealCandidateIds,
    robberMoveReason: state.robberMoveReason,
    roadBuildingRoadsRemaining: state.roadBuildingRoadsRemaining,
    hasPlayedDevCardThisTurn: state.hasPlayedDevCardThisTurn,
    specialBuildRoundOwnerId: state.specialBuildRoundOwnerId,
    largestArmyPlayerId: state.largestArmyPlayerId,
    longestRoadPlayerId: state.longestRoadPlayerId,
    longestRoadLength: state.longestRoadLength,
    winnerId: state.winnerId,
    tradeOffers: state.tradeOffers,
    tradeSequence: state.tradeSequence,
    eventLog: state.eventLog,
    eventSequence: state.eventSequence,
    board: state.board,
    seed: state.seed,
    // Real values would let a client predict future dice/steal outcomes; a
    // constant carries no information but keeps this type shape-compatible
    // with GameState so the UI needs no special-casing for network mode.
    diceRngState: 0,
    stealRngState: 0,
  };
}

function opaqueDeck(length: number): DevelopmentCard[] {
  return Array.from({ length }, (_, i) => ({
    id: `hidden-${i}`,
    type: 'knight',
    acquiredTurnNumber: 0,
  }));
}
