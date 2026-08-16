// Core domain types for the Catan game engine.
// These are intentionally UI-agnostic — the engine must be usable without React.

export type TerrainType =
  | 'forest'
  | 'pasture'
  | 'fields'
  | 'mountains'
  | 'hills'
  | 'desert';

export type ResourceType = 'brick' | 'lumber' | 'wool' | 'grain' | 'ore';

export const RESOURCE_TYPES: ResourceType[] = ['brick', 'lumber', 'wool', 'grain', 'ore'];

/**
 * Total cards in a resource bundle. Used everywhere a hand size or bundle size is
 * needed — the discard threshold, trade validation, the UI counters — so the count
 * can never drift between them.
 */
export function countResources(bundle: Partial<ResourceCount>): number {
  return RESOURCE_TYPES.reduce((sum, resource) => sum + (bundle[resource] ?? 0), 0);
}

/** The single source of truth for what each terrain produces. Never duplicate this in the UI. */
export const TERRAIN_TO_RESOURCE: Record<TerrainType, ResourceType | null> = {
  hills: 'brick',
  forest: 'lumber',
  pasture: 'wool',
  fields: 'grain',
  mountains: 'ore',
  desert: null,
};

export type PlayerColor = 'red' | 'blue' | 'white' | 'orange';

export type GamePhase = 'SETUP' | 'INITIAL_PLACEMENT' | 'PLAYING' | 'GAME_OVER';

/**
 * Where the current player is within their own turn.
 *
 * The transitional phases exist so the engine can refuse everything else while a
 * mandatory step is outstanding: DISCARDING (a 7 was rolled and someone is over the
 * hand limit), MOVING_ROBBER (the robber must be relocated before play resumes),
 * STEALING (several victims are adjacent, so the active player must pick one), and
 * ROAD_BUILDING (free roads from the development card are still to be placed).
 *
 * Monopoly and Year of Plenty deliberately have no phase of their own: each is a
 * single decision, so the UI collects the choice and dispatches one atomic action.
 * That avoids a half-committed state where the card is spent but unresolved.
 */
export type TurnPhase =
  | 'AWAITING_ROLL'
  | 'AWAITING_ACTIONS'
  | 'DISCARDING'
  | 'MOVING_ROBBER'
  | 'STEALING'
  | 'ROAD_BUILDING'
  | 'ENDING_TURN';

export type BuildingType = 'settlement' | 'city';

/** Everything a player can construct. Roads sit on edges, buildings on intersections. */
export type PieceType = 'road' | 'settlement' | 'city';

/** How many resources each building type collects per producing hex. */
export const BUILDING_YIELD: Record<BuildingType, number> = {
  settlement: 1,
  city: 2,
};

/** Victory points awarded for owning each building type. */
export const BUILDING_VICTORY_POINTS: Record<BuildingType, number> = {
  settlement: 1,
  city: 2,
};

/** Standard build costs. The engine is the only place these are read from. */
export const PIECE_COSTS: Record<PieceType, Partial<ResourceCount>> = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { ore: 3, grain: 2 },
};

/** Physical piece limits from the boxed game. */
export const PIECE_LIMITS: Record<PieceType, number> = {
  road: 15,
  settlement: 5,
  city: 4,
};

export interface Building {
  id: string;
  type: BuildingType;
  ownerId: string;
  /** Logical board location — never a pixel position. */
  intersectionId: string;
}

export interface Road {
  id: string;
  type: 'road';
  ownerId: string;
  /** Logical board location — never a pixel position. */
  edgeId: string;
}

export type DevelopmentCardType =
  | 'knight'
  | 'roadBuilding'
  | 'yearOfPlenty'
  | 'monopoly'
  | 'victoryPoint';

/**
 * The standard base-game deck: 25 cards.
 * Note the 2 Monopoly cards — the real boxed game has two, which is what makes the
 * total come to 25 (14 + 5 + 2 + 2 + 2). A deck with a single Monopoly would only
 * total 24.
 */
export const DEVELOPMENT_DECK_COMPOSITION: Record<DevelopmentCardType, number> = {
  knight: 14,
  victoryPoint: 5,
  roadBuilding: 2,
  yearOfPlenty: 2,
  monopoly: 2,
};

export const DEVELOPMENT_CARD_COST: Partial<ResourceCount> = {
  wool: 1,
  grain: 1,
  ore: 1,
};

/** Played knights needed before a player can hold Largest Army. */
export const LARGEST_ARMY_MINIMUM = 3;

/** Hand size above which a player must discard when a 7 is rolled. */
export const DISCARD_THRESHOLD = 7;

/** Free roads granted by one Road Building card. */
export const ROAD_BUILDING_ROADS = 2;

export interface DevelopmentCard {
  id: string;
  type: DevelopmentCardType;
  /**
   * The turn on which this card was bought. A card cannot be played on the same
   * turn it was acquired, so the engine compares this against the current turn.
   */
  acquiredTurnNumber: number;
}

export interface DiceResult {
  die1: number;
  die2: number;
  total: number;
}

/** Axial coordinate identifying a hex on the board. q + r + s = 0. */
export interface AxialCoord {
  q: number;
  r: number;
  s: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface HexTile {
  id: string;
  coord: AxialCoord;
  terrain: TerrainType;
  resource: ResourceType | null;
  numberToken: number | null;
  /** True for the hex the robber started on. Live position is GameState.robberHexId. */
  hasRobber: boolean;
  /** Intersection IDs of this hex's 6 corners, in clockwise order. */
  intersectionIds: string[];
  /** Edge IDs of this hex's 6 sides, in clockwise order. */
  edgeIds: string[];
}

export interface Intersection {
  id: string;
  position: Point;
  hexIds: string[];
  intersectionIds: string[];
  edgeIds: string[];
  building: Building | null;
}

export interface Edge {
  id: string;
  intersectionIds: [string, string];
  hexIds: string[];
  road: Road | null;
}

export type PortType = 'GENERIC_3_TO_1' | 'RESOURCE_2_TO_1';

export interface Port {
  id: string;
  type: PortType;
  /** Set only for RESOURCE_2_TO_1 ports. */
  resource: ResourceType | null;
  /** The boundary edge this port sits on. */
  edgeId: string;
  /** The two coastal intersections a settlement/city can occupy to control this port. */
  intersectionIds: [string, string];
}

export interface Board {
  hexes: HexTile[];
  intersections: Intersection[];
  edges: Edge[];
  ports: Port[];
  seed: number;
}

export type ResourceCount = Record<ResourceType, number>;

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  /**
   * Public victory points — from buildings only, so this is safe to show every
   * player. Hidden Victory Point cards are deliberately excluded; use
   * getTotalVictoryPoints() for the true total the win condition will read.
   */
  victoryPoints: number;
  resources: ResourceCount;
  /** The player's hand. Private: never render another player's contents. */
  developmentCards: DevelopmentCard[];
  /** Cards already played, face up. Knights here drive Largest Army. */
  playedDevelopmentCards: DevelopmentCard[];
  /** Pieces still in the player's supply, by type. */
  piecesRemaining: Record<PieceType, number>;
  roadsBuilt: number;
  settlementsBuilt: number;
  citiesBuilt: number;
}

/** A full accounting of one player's score. See rules/scoring.ts. */
export interface VictoryPointBreakdown {
  settlements: number;
  cities: number;
  settlementPoints: number;
  cityPoints: number;
  /** Hidden from opponents until the game ends. */
  victoryPointCards: number;
  longestRoad: number;
  largestArmy: number;
  /** Buildings plus public bonuses — safe to show everyone. */
  publicTotal: number;
  /** publicTotal plus hidden VP cards — the true score the win condition reads. */
  total: number;
}

/** How many cards a player must discard after a 7. */
export interface DiscardRequirement {
  playerId: string;
  required: number;
}

/** Why the robber is being moved — affects nothing but the log wording. */
export type RobberMoveReason = 'DICE_ROLL' | 'KNIGHT';

export type GameEventType =
  | 'GAME_STARTED'
  | 'DICE_ROLLED'
  | 'RESOURCES_PRODUCED'
  | 'NO_PRODUCTION'
  | 'ROBBER_PENDING'
  | 'TURN_ENDED'
  | 'BUILT'
  | 'SETUP_PLACEMENT'
  | 'SETUP_COMPLETE'
  | 'TRADE_PROPOSED'
  | 'TRADE_ACCEPTED'
  | 'TRADE_REJECTED'
  | 'TRADE_CANCELLED'
  | 'TRADE_EXPIRED'
  | 'BANK_TRADE'
  | 'DEV_CARD_BOUGHT'
  | 'DEV_CARD_PLAYED'
  | 'RESOURCES_DISCARDED'
  | 'ROBBER_MOVED'
  | 'RESOURCE_STOLEN'
  | 'LARGEST_ARMY'
  | 'LONGEST_ROAD'
  | 'GAME_WON';

export interface GameEvent {
  id: string;
  turnNumber: number;
  type: GameEventType;
  /** The player the event is about, when it concerns one. */
  playerId: string | null;
  message: string;
}

/** One player's award from one producing hex. */
export interface ProductionAward {
  playerId: string;
  hexId: string;
  resource: ResourceType;
  amount: number;
}

/** What the current player must place next during INITIAL_PLACEMENT. */
export type SetupStep = 'PLACE_SETTLEMENT' | 'PLACE_ROAD';

export type TradeStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';

export interface TradeOffer {
  id: string;
  proposerId: string;
  /** null means the offer is open to every other player; any one of them may accept it. */
  targetPlayerId: string | null;
  offeredResources: Partial<ResourceCount>;
  requestedResources: Partial<ResourceCount>;
  status: TradeStatus;
  turnNumber: number;
}

export interface GameState {
  phase: GamePhase;
  turnPhase: TurnPhase;
  players: Player[];
  currentPlayerId: string;
  turnNumber: number;
  /**
   * Position within the setup order [0,1,..,n-1, n-1,..,1,0].
   * Only meaningful while phase === 'INITIAL_PLACEMENT'.
   */
  setupOrderIndex: number;
  setupStep: SetupStep;
  /** The settlement just placed in setup; the next road must touch it. */
  pendingSettlementId: string | null;
  hasRolledThisTurn: boolean;
  /** The roll for the turn in progress; cleared when the turn ends. */
  diceResult: DiceResult | null;
  /** The most recent roll of the game; survives turn changes. */
  lastDiceRoll: DiceResult | null;
  robberHexId: string;
  /** Undrawn development cards, in draw order. Buying pops from the front. */
  developmentDeck: DevelopmentCard[];
  /** Outstanding discards after a 7; play cannot resume until this is empty. */
  pendingDiscards: DiscardRequirement[];
  /** Set while turnPhase === 'STEALING': the opponents the player may rob. */
  stealCandidateIds: string[];
  /** Why the robber is currently being moved, or null when it is not. */
  robberMoveReason: RobberMoveReason | null;
  /** Free roads still owed by a played Road Building card. */
  roadBuildingRoadsRemaining: number;
  /** Catan allows only one development card played per turn. */
  hasPlayedDevCardThisTurn: boolean;
  largestArmyPlayerId: string | null;
  longestRoadPlayerId: string | null;
  /** Trail length of the current Longest Road holder; 0 when unclaimed. */
  longestRoadLength: number;
  /** Set once someone reaches 10 points; the game is then over. */
  winnerId: string | null;
  tradeOffers: TradeOffer[];
  /** Monotonic counter for trade offer IDs. */
  tradeSequence: number;
  eventLog: GameEvent[];
  /** Monotonic counter for event IDs; stays unique after the log is trimmed. */
  eventSequence: number;
  board: Board;
  seed: number;
  /** Advancing PRNG state so dice rolls are reproducible from the seed. */
  diceRngState: number;
  /** Separate PRNG stream for robber steals, so it cannot perturb dice rolls. */
  stealRngState: number;
}
