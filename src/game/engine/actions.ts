// Every gameplay mutation flows through here:
//   action -> validate -> new GameState (+ events)
// The UI dispatches actions and renders the result; it never mutates state itself.

import type {
  BuildingType,
  GameState,
  ProductionAward,
  ResourceCount,
  ResourceType,
} from '../models/types';
import type { RNG } from '../utils/rng';
import { createStatefulRng } from '../utils/rng';
import { isRobberRoll, rollTwoDice } from './dice';
import { produceResources, summarizeAwards } from './production';
import { logEvent } from './eventLog';
import { placeBuilding, placeRoad } from './construction';
import {
  canBuildCity,
  canBuildRoad,
  canBuildSettlement,
  canPlaceInitialRoad,
  canPlaceInitialSettlement,
} from '../rules/placement';
import {
  advanceSetup,
  getInitialResourceAwards,
  getSetupRound,
  grantAwards,
} from './setup';
import {
  canAcceptTrade,
  canBankTrade,
  canCancelTrade,
  canProposeTrade,
  canRejectTrade,
  getBestTradeRate,
} from '../rules/trade';
import {
  acceptTrade,
  cancelTrade,
  executeBankTrade,
  expireOffersFrom,
  proposeTrade,
  rejectTrade,
} from './trade';
import {
  canBuyDevelopmentCard,
  canPlayDevelopmentCard,
  findPlayableCard,
} from '../rules/development';
import {
  buyDevelopmentCard,
  applyMonopoly,
  applyYearOfPlenty,
  consumeCard,
  withLargestArmy,
} from './development';
import {
  canDiscard,
  canMoveRobber,
  getDiscardRequirements,
  totalResourceCards,
} from '../rules/robber';
import {
  applyDiscard,
  moveRobber,
  resolveAfterRobberMove,
  stealResource,
} from './robber';
import {
  countResources,
  RESOURCE_TYPES as RESOURCE_TYPE_LIST,
  ROAD_BUILDING_ROADS,
} from '../models/types';
import {
  calculateVictoryPoints,
  checkVictoryCondition,
  withScoringRefreshed,
} from '../rules/scoring';

export type GameAction =
  | { type: 'ROLL_DICE'; playerId: string }
  | { type: 'END_TURN'; playerId: string }
  | { type: 'BUILD_ROAD'; playerId: string; edgeId: string }
  | { type: 'BUILD_SETTLEMENT'; playerId: string; intersectionId: string }
  | { type: 'BUILD_CITY'; playerId: string; intersectionId: string }
  | { type: 'PLACE_INITIAL_SETTLEMENT'; playerId: string; intersectionId: string }
  | { type: 'PLACE_INITIAL_ROAD'; playerId: string; edgeId: string }
  | {
      type: 'PROPOSE_TRADE';
      playerId: string;
      targetPlayerId: string | null;
      offeredResources: Partial<ResourceCount>;
      requestedResources: Partial<ResourceCount>;
    }
  | { type: 'ACCEPT_TRADE'; playerId: string; tradeId: string }
  | { type: 'REJECT_TRADE'; playerId: string; tradeId: string }
  | { type: 'CANCEL_TRADE'; playerId: string; tradeId: string }
  | { type: 'BANK_TRADE'; playerId: string; give: ResourceType; receive: ResourceType }
  | { type: 'BUY_DEVELOPMENT_CARD'; playerId: string }
  | { type: 'PLAY_KNIGHT'; playerId: string }
  | { type: 'PLAY_ROAD_BUILDING'; playerId: string }
  | { type: 'PLAY_MONOPOLY'; playerId: string; resource: ResourceType }
  | {
      type: 'PLAY_YEAR_OF_PLENTY';
      playerId: string;
      selection: Partial<ResourceCount>;
    }
  | {
      type: 'DISCARD_RESOURCES';
      playerId: string;
      selection: Partial<ResourceCount>;
    }
  | { type: 'MOVE_ROBBER'; playerId: string; hexId: string }
  | { type: 'STEAL_RESOURCE'; playerId: string; victimId: string };

export type GameErrorCode =
  | 'WRONG_PHASE'
  | 'NOT_CURRENT_PLAYER'
  | 'ALREADY_ROLLED'
  | 'MUST_ROLL_FIRST'
  | 'ILLEGAL_PLACEMENT'
  | 'WRONG_SETUP_STEP'
  | 'INVALID_TRADE'
  | 'INVALID_DEVELOPMENT_CARD'
  | 'INVALID_DISCARD'
  | 'INVALID_ROBBER_MOVE'
  | 'INVALID_STEAL'
  | 'GAME_OVER'
  | 'UNKNOWN_PLAYER'
  | 'UNKNOWN_ACTION';

export interface GameError {
  code: GameErrorCode;
  message: string;
}

export type ActionResult =
  | { ok: true; state: GameState; awards?: ProductionAward[] }
  | { ok: false; error: GameError };

export interface ActionDeps {
  /** Overrides the state's seeded dice RNG. Tests use this to force a specific total. */
  rng?: RNG;
  /** Overrides the steal RNG, so tests can force which card the robber takes. */
  stealRng?: RNG;
}

const RESOURCE_LABELS: Record<ResourceType, string> = {
  brick: 'Brick',
  lumber: 'Lumber',
  wool: 'Wool',
  grain: 'Grain',
  ore: 'Ore',
};

function fail(code: GameErrorCode, message: string): ActionResult {
  return { ok: false, error: { code, message } };
}

function playerName(state: GameState, playerId: string): string {
  return state.players.find((p) => p.id === playerId)?.name ?? playerId;
}

/** Shared guards: the game is live and the actor is the player whose turn it is. */
function validateActor(state: GameState, playerId: string): GameError | null {
  if (state.phase !== 'PLAYING') {
    return {
      code: 'WRONG_PHASE',
      message: `Cannot act: game phase is ${state.phase}, expected PLAYING.`,
    };
  }
  if (!state.players.some((p) => p.id === playerId)) {
    return { code: 'UNKNOWN_PLAYER', message: `Unknown player: ${playerId}.` };
  }
  if (playerId !== state.currentPlayerId) {
    return {
      code: 'NOT_CURRENT_PLAYER',
      message: `Cannot act: it is ${playerName(state, state.currentPlayerId)}'s turn, not ${playerName(state, playerId)}'s.`,
    };
  }
  return null;
}

function rollDiceAction(state: GameState, playerId: string, deps: ActionDeps): ActionResult {
  const actorError = validateActor(state, playerId);
  if (actorError) return { ok: false, error: actorError };

  if (state.hasRolledThisTurn) {
    return fail(
      'ALREADY_ROLLED',
      `Cannot roll dice: ${playerName(state, playerId)} has already rolled this turn.`
    );
  }

  // Use the injected RNG when given, otherwise advance the game's own seeded stream
  // so a seed reproduces an entire game's rolls.
  const stateful = deps.rng ? null : createStatefulRng(state.diceRngState);
  const rng: RNG = deps.rng ?? stateful!.rng;

  const diceResult = rollTwoDice(rng);
  const diceRngState = stateful ? stateful.getState() : state.diceRngState;

  const name = playerName(state, playerId);
  let next: GameState = {
    ...state,
    diceResult,
    lastDiceRoll: diceResult,
    hasRolledThisTurn: true,
    diceRngState,
  };
  next = logEvent(next, {
      type: 'DICE_ROLLED',
      playerId,
      message: `${name} rolled ${diceResult.total} (${diceResult.die1} + ${diceResult.die2})`,
    });

  if (isRobberRoll(diceResult)) {
    // A 7 produces nothing. Anyone over the hand limit discards first; only once
    // every discard is settled does the active player move the robber.
    const pendingDiscards = getDiscardRequirements(next);
    next = {
      ...next,
      pendingDiscards,
      robberMoveReason: 'DICE_ROLL',
      turnPhase: pendingDiscards.length > 0 ? 'DISCARDING' : 'MOVING_ROBBER',
    };
    next = logEvent(next, {
      type: 'ROBBER_PENDING',
      playerId,
      message:
        pendingDiscards.length > 0
          ? `7 rolled — ${pendingDiscards.length} player${pendingDiscards.length > 1 ? 's' : ''} must discard`
          : '7 rolled — no resources produced. Move the robber.',
    });
    return { ok: true, state: next, awards: [] };
  }

  const production = produceResources(next, diceResult.total);
  next = { ...production.state, turnPhase: 'AWAITING_ACTIONS' };

  if (production.awards.length === 0) {
    next = logEvent(next, {
        type: 'NO_PRODUCTION',
        playerId: null,
        message: `No settlements produced on ${diceResult.total}`,
      });
  } else {
    for (const [awardedPlayerId, totals] of summarizeAwards(production.awards)) {
      const summary = Object.entries(totals)
        .map(([resource, amount]) => `${amount} ${RESOURCE_LABELS[resource as ResourceType]}`)
        .join(', ');
      next = logEvent(next, {
          type: 'RESOURCES_PRODUCED',
          playerId: awardedPlayerId,
          message: `${playerName(next, awardedPlayerId)} received ${summary}`,
        });
    }
  }

  return { ok: true, state: next, awards: production.awards };
}

function endTurnAction(state: GameState, playerId: string): ActionResult {
  const actorError = validateActor(state, playerId);
  if (actorError) return { ok: false, error: actorError };

  // A turn cannot be abandoned midway through a mandatory step.
  const blocked = blockingPhaseMessage(state);
  if (blocked) return fail('WRONG_PHASE', `Cannot end your turn: ${blocked}`);

  // Standard Catan lets a player end their turn without rolling, so this is allowed.
  const currentIndex = state.players.findIndex((p) => p.id === state.currentPlayerId);
  const nextPlayer = state.players[(currentIndex + 1) % state.players.length];

  let next: GameState = logEvent(state, {
      type: 'TURN_ENDED',
      playerId,
      message: `${playerName(state, playerId)} ended their turn`,
    });

  // Trade expiry rule: a player's own outgoing offers only make sense during their
  // turn, since acceptance changes their hand right before they'd act on it. Ending
  // the turn expires every PENDING offer they proposed; offers made *to* them by
  // other players (which can only exist while it's still this player's turn, since
  // only the current player may propose) are covered by the same sweep because the
  // proposer is always the player now ending their turn.
  const expiredCount = next.tradeOffers.filter(
    (t) => t.status === 'PENDING' && t.proposerId === playerId
  ).length;
  next = expireOffersFrom(next, playerId);
  if (expiredCount > 0) {
    next = logEvent(next, {
      type: 'TRADE_EXPIRED',
      playerId,
      message: `${playerName(next, playerId)}'s pending trade offer${expiredCount > 1 ? 's' : ''} expired`,
    });
  }

  next = {
    ...next,
    currentPlayerId: nextPlayer.id,
    turnNumber: next.turnNumber + 1,
    turnPhase: 'AWAITING_ROLL',
    hasRolledThisTurn: false,
    diceResult: null,
    // Per-turn development card state belongs to the turn that just ended.
    hasPlayedDevCardThisTurn: false,
    roadBuildingRoadsRemaining: 0,
    robberMoveReason: null,
    stealCandidateIds: [],
  };

  return { ok: true, state: next };
}

/**
 * Human-readable name for a transitional phase, used when refusing an action that
 * is blocked because a mandatory step is still outstanding.
 */
function blockingPhaseMessage(state: GameState): string | null {
  switch (state.turnPhase) {
    case 'DISCARDING':
      return 'Resolve the outstanding discards first.';
    case 'MOVING_ROBBER':
      return 'You must move the robber first.';
    case 'STEALING':
      return 'Choose who to steal from first.';
    case 'ROAD_BUILDING':
      return 'Place your Road Building roads first.';
    default:
      return null;
  }
}

/** Guards shared by all normal-play building actions. */
function validateBuildContext(state: GameState, playerId: string): GameError | null {
  const actorError = validateActor(state, playerId);
  if (actorError) return actorError;
  if (!state.hasRolledThisTurn) {
    return {
      code: 'MUST_ROLL_FIRST',
      message: 'You must roll the dice before building.',
    };
  }
  return null;
}

function buildAction(
  state: GameState,
  playerId: string,
  piece: BuildingType | 'road',
  locationId: string
): ActionResult {
  // Road Building grants free roads, so during that phase a road is allowed (and
  // free) while every other build stays blocked until the roads are placed.
  const freeRoad = piece === 'road' && state.turnPhase === 'ROAD_BUILDING';

  if (!freeRoad) {
    const blocked = blockingPhaseMessage(state);
    if (blocked) return fail('WRONG_PHASE', blocked);
  }

  const contextError = validateBuildContext(state, playerId);
  if (contextError) return { ok: false, error: contextError };

  const check =
    piece === 'road'
      ? canBuildRoad(state, playerId, locationId, { ignoreCost: freeRoad })
      : piece === 'settlement'
        ? canBuildSettlement(state, playerId, locationId)
        : canBuildCity(state, playerId, locationId);

  if (!check.valid) return fail('ILLEGAL_PLACEMENT', check.reason ?? 'Illegal placement.');

  // Validation passed — only now is anything deducted or placed.
  let next =
    piece === 'road'
      ? placeRoad(state, playerId, locationId, { free: freeRoad })
      : placeBuilding(state, playerId, locationId, piece);

  if (freeRoad) {
    const remaining = next.roadBuildingRoadsRemaining - 1;
    const player = next.players.find((p) => p.id === playerId)!;
    // Leave Road Building mode once the roads are used up, or once the player has
    // run out of road pieces to place.
    const done = remaining <= 0 || player.piecesRemaining.road === 0;
    next = {
      ...next,
      roadBuildingRoadsRemaining: done ? 0 : remaining,
      turnPhase: done ? 'AWAITING_ACTIONS' : 'ROAD_BUILDING',
    };
  }

  const name = playerName(state, playerId);
  const message =
    piece === 'city'
      ? `${name} upgraded a settlement to a city`
      : `${name} built a ${piece}`;

  return {
    ok: true,
    state: logEvent(next, { type: 'BUILT', playerId, message }),
  };
}

function initialSettlementAction(
  state: GameState,
  playerId: string,
  intersectionId: string
): ActionResult {
  if (state.phase !== 'INITIAL_PLACEMENT') {
    return fail('WRONG_PHASE', 'Initial placement is only available during setup.');
  }
  if (playerId !== state.currentPlayerId) {
    return fail(
      'NOT_CURRENT_PLAYER',
      `It is ${playerName(state, state.currentPlayerId)}'s turn to place.`
    );
  }
  if (state.setupStep !== 'PLACE_SETTLEMENT') {
    return fail('WRONG_SETUP_STEP', 'You must place your road next.');
  }

  const check = canPlaceInitialSettlement(state, playerId, intersectionId);
  if (!check.valid) return fail('ILLEGAL_PLACEMENT', check.reason ?? 'Illegal placement.');

  const round = getSetupRound(state);
  // Setup placements are free.
  let next = placeBuilding(state, playerId, intersectionId, 'settlement', { free: true });
  next = { ...next, setupStep: 'PLACE_ROAD', pendingSettlementId: intersectionId };

  const name = playerName(state, playerId);
  next = logEvent(next, {
      type: 'SETUP_PLACEMENT',
      playerId,
      message: `${name} placed their ${round === 1 ? 'first' : 'second'} settlement`,
    });

  // Only the second settlement grants its adjacent resources.
  if (round === 2) {
    const awards = getInitialResourceAwards(next, playerId, intersectionId);
    next = grantAwards(next, awards);
    if (awards.length > 0) {
      const summary = Object.entries(
        awards.reduce<Record<string, number>>((totals, award) => {
          totals[award.resource] = (totals[award.resource] ?? 0) + award.amount;
          return totals;
        }, {})
      )
        .map(([resource, amount]) => `${amount} ${RESOURCE_LABELS[resource as ResourceType]}`)
        .join(', ');
      next = logEvent(next, {
          type: 'RESOURCES_PRODUCED',
          playerId,
          message: `${name} received ${summary} from their second settlement`,
        });
    }
  }

  return { ok: true, state: next };
}

function initialRoadAction(
  state: GameState,
  playerId: string,
  edgeId: string
): ActionResult {
  if (state.phase !== 'INITIAL_PLACEMENT') {
    return fail('WRONG_PHASE', 'Initial placement is only available during setup.');
  }
  if (playerId !== state.currentPlayerId) {
    return fail(
      'NOT_CURRENT_PLAYER',
      `It is ${playerName(state, state.currentPlayerId)}'s turn to place.`
    );
  }
  if (state.setupStep !== 'PLACE_ROAD') {
    return fail('WRONG_SETUP_STEP', 'You must place your settlement first.');
  }

  const check = canPlaceInitialRoad(state, playerId, edgeId);
  if (!check.valid) return fail('ILLEGAL_PLACEMENT', check.reason ?? 'Illegal placement.');

  const round = getSetupRound(state);
  const name = playerName(state, playerId);

  let next = placeRoad(state, playerId, edgeId, { free: true });
  next = logEvent(next, {
      type: 'SETUP_PLACEMENT',
      playerId,
      message: `${name} placed their ${round === 1 ? 'first' : 'second'} road`,
    });

  const advanced = advanceSetup(next);
  if (advanced.phase === 'PLAYING' && next.phase === 'INITIAL_PLACEMENT') {
    return {
      ok: true,
      state: logEvent(advanced, {
        type: 'SETUP_COMPLETE',
        playerId: advanced.currentPlayerId,
        message: `Setup complete — ${playerName(advanced, advanced.currentPlayerId)} starts the game`,
      }),
    };
  }

  return { ok: true, state: advanced };
}

function formatBundle(bundle: Partial<ResourceCount>): string {
  return Object.entries(bundle)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([resource, amount]) => `${amount} ${RESOURCE_LABELS[resource as ResourceType]}`)
    .join(', ');
}

function proposeTradeAction(
  state: GameState,
  playerId: string,
  targetPlayerId: string | null,
  offeredResources: Partial<ResourceCount>,
  requestedResources: Partial<ResourceCount>
): ActionResult {
  const check = canProposeTrade(
    state,
    playerId,
    targetPlayerId,
    offeredResources,
    requestedResources
  );
  if (!check.valid) return fail('INVALID_TRADE', check.reason ?? 'Invalid trade.');

  const { state: withOffer } = proposeTrade(
    state,
    playerId,
    targetPlayerId,
    offeredResources,
    requestedResources
  );

  const name = playerName(state, playerId);
  const targetName = targetPlayerId ? playerName(state, targetPlayerId) : 'everyone';
  const next = logEvent(withOffer, {
    type: 'TRADE_PROPOSED',
    playerId,
    message: `${name} offered ${targetName} ${formatBundle(offeredResources)} for ${formatBundle(requestedResources)}`,
  });

  return { ok: true, state: next };
}

function acceptTradeAction(state: GameState, playerId: string, tradeId: string): ActionResult {
  const check = canAcceptTrade(state, playerId, tradeId);
  if (!check.valid) return fail('INVALID_TRADE', check.reason ?? 'Invalid trade.');

  const trade = state.tradeOffers.find((t) => t.id === tradeId)!;
  const next = acceptTrade(state, playerId, tradeId);
  const message = `${playerName(state, playerId)} accepted ${playerName(state, trade.proposerId)}'s trade`;

  return { ok: true, state: logEvent(next, { type: 'TRADE_ACCEPTED', playerId, message }) };
}

function rejectTradeAction(state: GameState, playerId: string, tradeId: string): ActionResult {
  const check = canRejectTrade(state, playerId, tradeId);
  if (!check.valid) return fail('INVALID_TRADE', check.reason ?? 'Invalid trade.');

  const trade = state.tradeOffers.find((t) => t.id === tradeId)!;
  const next = rejectTrade(state, tradeId);
  const message = `${playerName(state, playerId)} rejected ${playerName(state, trade.proposerId)}'s trade`;

  return { ok: true, state: logEvent(next, { type: 'TRADE_REJECTED', playerId, message }) };
}

function cancelTradeAction(state: GameState, playerId: string, tradeId: string): ActionResult {
  const check = canCancelTrade(state, playerId, tradeId);
  if (!check.valid) return fail('INVALID_TRADE', check.reason ?? 'Invalid trade.');

  const next = cancelTrade(state, tradeId);
  const message = `${playerName(state, playerId)} cancelled their trade offer`;

  return { ok: true, state: logEvent(next, { type: 'TRADE_CANCELLED', playerId, message }) };
}

function bankTradeAction(
  state: GameState,
  playerId: string,
  give: ResourceType,
  receive: ResourceType
): ActionResult {
  const actorError = validateActor(state, playerId);
  if (actorError) return { ok: false, error: actorError };
  if (state.turnPhase !== 'AWAITING_ACTIONS') {
    return fail(
      'INVALID_TRADE',
      state.turnPhase === 'AWAITING_ROLL'
        ? 'You must roll the dice before trading with the bank.'
        : `You cannot trade with the bank right now. ${blockingPhaseMessage(state) ?? ''}`.trim()
    );
  }

  const check = canBankTrade(state, playerId, give, receive);
  if (!check.valid) return fail('INVALID_TRADE', check.reason ?? 'Invalid trade.');

  const rate = getBestTradeRate(state, playerId, give);
  const next = executeBankTrade(state, playerId, give, receive, rate);
  const name = playerName(state, playerId);
  const usedPort = rate < 4;
  const message = usedPort
    ? `${name} traded ${rate} ${RESOURCE_LABELS[give]} for 1 ${RESOURCE_LABELS[receive]} using a ${rate}:1 port`
    : `${name} traded ${rate} ${RESOURCE_LABELS[give]} for 1 ${RESOURCE_LABELS[receive]} with the bank`;

  return { ok: true, state: logEvent(next, { type: 'BANK_TRADE', playerId, message }) };
}

// ---------- Development cards ----------

function buyDevelopmentCardAction(state: GameState, playerId: string): ActionResult {
  const actorError = validateActor(state, playerId);
  if (actorError) return { ok: false, error: actorError };

  const check = canBuyDevelopmentCard(state, playerId);
  if (!check.valid) {
    return fail('INVALID_DEVELOPMENT_CARD', check.reason ?? 'Cannot buy a development card.');
  }

  const bought = buyDevelopmentCard(state, playerId);
  if (!bought) {
    return fail('INVALID_DEVELOPMENT_CARD', 'The development card deck is empty.');
  }

  // The card type is deliberately absent from the message — it is hidden information.
  return {
    ok: true,
    state: logEvent(bought.state, {
      type: 'DEV_CARD_BOUGHT',
      playerId,
      message: `${playerName(state, playerId)} bought a development card`,
    }),
  };
}

/** Shared preamble for every PLAY_* action: validate, then consume the card. */
function beginPlayCard(
  state: GameState,
  playerId: string,
  cardType: 'knight' | 'roadBuilding' | 'monopoly' | 'yearOfPlenty'
): { ok: true; state: GameState } | { ok: false; result: ActionResult } {
  const actorError = validateActor(state, playerId);
  if (actorError) return { ok: false, result: { ok: false, error: actorError } };

  const check = canPlayDevelopmentCard(state, playerId, cardType);
  if (!check.valid) {
    return {
      ok: false,
      result: fail('INVALID_DEVELOPMENT_CARD', check.reason ?? 'Cannot play that card.'),
    };
  }

  const card = findPlayableCard(state, playerId, cardType);
  if (!card) {
    return {
      ok: false,
      result: fail('INVALID_DEVELOPMENT_CARD', 'No playable card of that type.'),
    };
  }

  return { ok: true, state: consumeCard(state, playerId, card.id) };
}

function playKnightAction(state: GameState, playerId: string): ActionResult {
  const begun = beginPlayCard(state, playerId, 'knight');
  if (!begun.ok) return begun.result;

  const name = playerName(state, playerId);
  let next = logEvent(begun.state, {
    type: 'DEV_CARD_PLAYED',
    playerId,
    message: `${name} played a Knight`,
  });

  // A knight always sends the player to the robber, exactly like rolling a 7.
  next = { ...next, turnPhase: 'MOVING_ROBBER', robberMoveReason: 'KNIGHT' };

  const army = withLargestArmy(next);
  next = army.state;
  if (army.changed && army.holderId) {
    next = logEvent(next, {
      type: 'LARGEST_ARMY',
      playerId: army.holderId,
      message: `${playerName(next, army.holderId)} now has the Largest Army`,
    });
  }

  return { ok: true, state: next };
}

function playRoadBuildingAction(state: GameState, playerId: string): ActionResult {
  const begun = beginPlayCard(state, playerId, 'roadBuilding');
  if (!begun.ok) return begun.result;

  const player = begun.state.players.find((p) => p.id === playerId)!;
  // Never promise more roads than the player physically has pieces for.
  const roads = Math.min(ROAD_BUILDING_ROADS, player.piecesRemaining.road);

  let next = logEvent(begun.state, {
    type: 'DEV_CARD_PLAYED',
    playerId,
    message: `${playerName(state, playerId)} played Road Building`,
  });

  if (roads === 0) {
    // The card is still spent, but there is nothing to place.
    return {
      ok: true,
      state: logEvent(next, {
        type: 'DEV_CARD_PLAYED',
        playerId,
        message: `${playerName(next, playerId)} has no road pieces left to place`,
      }),
    };
  }

  next = { ...next, turnPhase: 'ROAD_BUILDING', roadBuildingRoadsRemaining: roads };
  return { ok: true, state: next };
}

function playMonopolyAction(
  state: GameState,
  playerId: string,
  resource: ResourceType
): ActionResult {
  const begun = beginPlayCard(state, playerId, 'monopoly');
  if (!begun.ok) return begun.result;

  const applied = applyMonopoly(begun.state, playerId, resource);
  const name = playerName(state, playerId);

  let next = logEvent(applied.state, {
    type: 'DEV_CARD_PLAYED',
    playerId,
    message: `${name} played Monopoly`,
  });
  next = logEvent(next, {
    type: 'RESOURCES_PRODUCED',
    playerId,
    message: `${name} collected ${applied.collected} ${RESOURCE_LABELS[resource]} from the other players`,
  });

  return { ok: true, state: next };
}

function playYearOfPlentyAction(
  state: GameState,
  playerId: string,
  selection: Partial<ResourceCount>
): ActionResult {
  const total = countResources(selection);
  if (total !== 2) {
    return fail('INVALID_DEVELOPMENT_CARD', 'Year of Plenty gives exactly 2 resources.');
  }
  if (RESOURCE_TYPE_LIST.some((r) => (selection[r] ?? 0) < 0)) {
    return fail('INVALID_DEVELOPMENT_CARD', 'Resource amounts cannot be negative.');
  }

  const begun = beginPlayCard(state, playerId, 'yearOfPlenty');
  if (!begun.ok) return begun.result;

  const next = applyYearOfPlenty(begun.state, playerId, selection);
  return {
    ok: true,
    state: logEvent(next, {
      type: 'DEV_CARD_PLAYED',
      playerId,
      // The chosen resources stay private; only the card itself is announced.
      message: `${playerName(state, playerId)} played Year of Plenty`,
    }),
  };
}

// ---------- Robber sequence ----------

function discardAction(
  state: GameState,
  playerId: string,
  selection: Partial<ResourceCount>
): ActionResult {
  if (state.phase !== 'PLAYING' || state.turnPhase !== 'DISCARDING') {
    return fail('WRONG_PHASE', 'No discard is required right now.');
  }
  if (!state.players.some((p) => p.id === playerId)) {
    return fail('UNKNOWN_PLAYER', `Unknown player: ${playerId}.`);
  }

  const check = canDiscard(state, playerId, selection);
  if (!check.valid) return fail('INVALID_DISCARD', check.reason ?? 'Invalid discard.');

  const discarded = countResources(selection);
  let next = applyDiscard(state, playerId, selection);
  next = logEvent(next, {
    type: 'RESOURCES_DISCARDED',
    playerId,
    // The specific cards are private; only the count is public.
    message: `${playerName(next, playerId)} discarded ${discarded} cards`,
  });

  // Once the last player has discarded, the active player owes a robber move.
  if (next.pendingDiscards.length === 0) {
    next = { ...next, turnPhase: 'MOVING_ROBBER' };
  }

  return { ok: true, state: next };
}

function moveRobberAction(
  state: GameState,
  playerId: string,
  hexId: string,
  deps: ActionDeps
): ActionResult {
  const actorError = validateActor(state, playerId);
  if (actorError) return { ok: false, error: actorError };

  if (state.turnPhase !== 'MOVING_ROBBER') {
    return fail('WRONG_PHASE', 'The robber can only be moved when the game asks for it.');
  }

  const check = canMoveRobber(state, hexId);
  if (!check.valid) return fail('INVALID_ROBBER_MOVE', check.reason ?? 'Invalid robber move.');

  let next = moveRobber(state, hexId);
  next = logEvent(next, {
    type: 'ROBBER_MOVED',
    playerId,
    message: `${playerName(next, playerId)} moved the robber`,
  });

  const resolved = resolveAfterRobberMove(next);
  next = resolved.state;

  // Exactly one victim: steal immediately, no choice to make.
  if (resolved.candidates.length === 1) {
    return performSteal(next, playerId, resolved.candidates[0], deps);
  }

  return { ok: true, state: next };
}

function performSteal(
  state: GameState,
  playerId: string,
  victimId: string,
  deps: ActionDeps
): ActionResult {
  const outcome = stealResource(state, victimId, deps.stealRng);
  let next = outcome.state;

  if (outcome.resource) {
    // Deliberately vague: which resource moved is private to the two players.
    next = logEvent(next, {
      type: 'RESOURCE_STOLEN',
      playerId,
      message: `${playerName(next, playerId)} stole 1 resource from ${playerName(next, victimId)}`,
    });
  }

  next = {
    ...next,
    turnPhase: 'AWAITING_ACTIONS',
    stealCandidateIds: [],
    robberMoveReason: null,
  };
  return { ok: true, state: next };
}

function stealAction(
  state: GameState,
  playerId: string,
  victimId: string,
  deps: ActionDeps
): ActionResult {
  const actorError = validateActor(state, playerId);
  if (actorError) return { ok: false, error: actorError };

  if (state.turnPhase !== 'STEALING') {
    return fail('WRONG_PHASE', 'There is nobody to steal from right now.');
  }
  if (victimId === playerId) {
    return fail('INVALID_STEAL', 'You cannot steal from yourself.');
  }
  if (!state.stealCandidateIds.includes(victimId)) {
    return fail('INVALID_STEAL', 'That player is not adjacent to the robber.');
  }

  const victim = state.players.find((p) => p.id === victimId);
  if (!victim || totalResourceCards(victim.resources) === 0) {
    return fail('INVALID_STEAL', 'That player has no resources to steal.');
  }

  return performSteal(state, playerId, victimId, deps);
}

/**
 * Post-processing applied to every successful action.
 *
 * Rescoring here means no code path can forget it, and the victory check runs
 * immediately — a road that wins Longest Road, a knight that wins Largest Army, or
 * a Victory Point card bought at 9 points all end the game on the spot, without
 * waiting for the player to end their turn.
 */
function finalize(state: GameState, actorId: string): GameState {
  if (state.phase !== 'PLAYING') return state;

  const scored = withScoringRefreshed(state);

  // Announce a bonus changing hands, so the log explains a sudden score jump.
  let next = scored;
  if (scored.longestRoadPlayerId !== state.longestRoadPlayerId && scored.longestRoadPlayerId) {
    next = logEvent(next, {
      type: 'LONGEST_ROAD',
      playerId: scored.longestRoadPlayerId,
      message: `${playerName(next, scored.longestRoadPlayerId)} now has the Longest Road (${scored.longestRoadLength})`,
    });
  }

  // Only the player who acted can win — you cannot be pushed to victory on
  // someone else's turn.
  if (!checkVictoryCondition(next, actorId)) return next;

  const total = calculateVictoryPoints(next, actorId);
  next = { ...next, phase: 'GAME_OVER', winnerId: actorId, turnPhase: 'ENDING_TURN' };
  next = logEvent(next, {
    type: 'GAME_WON',
    playerId: actorId,
    message: `${playerName(next, actorId)} has reached ${total} Victory Points and wins the game!`,
  });
  return logEvent(next, { type: 'GAME_WON', playerId: null, message: 'Game Over.' });
}

export function applyAction(
  state: GameState,
  action: GameAction,
  deps: ActionDeps = {}
): ActionResult {
  // Once the game is won nothing further is playable.
  if (state.phase === 'GAME_OVER') {
    return fail('GAME_OVER', 'The game is over — no further actions are allowed.');
  }

  const result = applyGameAction(state, action, deps);
  if (!result.ok) return result;
  return { ...result, state: finalize(result.state, action.playerId) };
}

function applyGameAction(
  state: GameState,
  action: GameAction,
  deps: ActionDeps
): ActionResult {
  switch (action.type) {
    case 'ROLL_DICE':
      return rollDiceAction(state, action.playerId, deps);
    case 'END_TURN':
      return endTurnAction(state, action.playerId);
    case 'BUILD_ROAD':
      return buildAction(state, action.playerId, 'road', action.edgeId);
    case 'BUILD_SETTLEMENT':
      return buildAction(state, action.playerId, 'settlement', action.intersectionId);
    case 'BUILD_CITY':
      return buildAction(state, action.playerId, 'city', action.intersectionId);
    case 'PLACE_INITIAL_SETTLEMENT':
      return initialSettlementAction(state, action.playerId, action.intersectionId);
    case 'PLACE_INITIAL_ROAD':
      return initialRoadAction(state, action.playerId, action.edgeId);
    case 'PROPOSE_TRADE':
      return proposeTradeAction(
        state,
        action.playerId,
        action.targetPlayerId,
        action.offeredResources,
        action.requestedResources
      );
    case 'ACCEPT_TRADE':
      return acceptTradeAction(state, action.playerId, action.tradeId);
    case 'REJECT_TRADE':
      return rejectTradeAction(state, action.playerId, action.tradeId);
    case 'CANCEL_TRADE':
      return cancelTradeAction(state, action.playerId, action.tradeId);
    case 'BANK_TRADE':
      return bankTradeAction(state, action.playerId, action.give, action.receive);
    case 'BUY_DEVELOPMENT_CARD':
      return buyDevelopmentCardAction(state, action.playerId);
    case 'PLAY_KNIGHT':
      return playKnightAction(state, action.playerId);
    case 'PLAY_ROAD_BUILDING':
      return playRoadBuildingAction(state, action.playerId);
    case 'PLAY_MONOPOLY':
      return playMonopolyAction(state, action.playerId, action.resource);
    case 'PLAY_YEAR_OF_PLENTY':
      return playYearOfPlentyAction(state, action.playerId, action.selection);
    case 'DISCARD_RESOURCES':
      return discardAction(state, action.playerId, action.selection);
    case 'MOVE_ROBBER':
      return moveRobberAction(state, action.playerId, action.hexId, deps);
    case 'STEAL_RESOURCE':
      return stealAction(state, action.playerId, action.victimId, deps);
    default:
      return fail('UNKNOWN_ACTION', `Unknown action: ${JSON.stringify(action)}`);
  }
}
