import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  BuildingType,
  DevelopmentCardType,
  GameState,
  ResourceCount,
  ResourceType,
} from './game/models/types';
import { createInitialGame } from './game/engine/gameEngine';
import { applyAction } from './game/engine/actions';
import type { GameAction, ActionDeps } from './game/engine/actions';
import {
  devClearBuildings,
  devGrantResources,
  devGiveDevelopmentCard,
  devGrantResourcesToAll,
  devPlaceBuilding,
} from './game/engine/devTools';
import {
  getValidCityLocations,
  getValidRoadLocations,
  getValidSettlementLocations,
} from './game/rules/placement';
import { fixedDiceRng } from './game/utils/fixedRng';
import { PLAYER_COLOR_HEX } from './data/terrainTheme';
import { SetupScreen } from './components/setup/SetupScreen';
import { ModeSelect } from './components/setup/ModeSelect';
import type { SessionMode } from './components/setup/ModeSelect';
import { NetworkSetup } from './components/setup/NetworkSetup';
import { NetworkLobby } from './components/setup/NetworkLobby';
import { clearSession, type GameClient } from './net/client';
import { NetworkTransport } from './net/networkTransport';
import { HexBoard } from './components/board/HexBoard';
import type { PlacementMode } from './components/board/HexBoard';
import { PlayerPanels } from './components/players/PlayerPanels';
import { YourResources } from './components/players/YourResources';
import { TurnPanel } from './components/dice/TurnPanel';
import { EndTurnBar } from './components/dice/EndTurnBar';
import { BuildPanel } from './components/build/BuildPanel';
import { TradeModal } from './components/trade/TradeModal';
import { TradeInbox } from './components/trade/TradeInbox';
import { DevCardsSummary } from './components/development/DevCardsSummary';
import { CardDrawToast } from './components/privacy/CardDrawToast';
import { PinModal } from './components/privacy/PinModal';
import { PrivateDevCards } from './components/privacy/PrivateDevCards';
import {
  MonopolyModal,
  StealTargetModal,
  YearOfPlentyModal,
} from './components/development/CardChoiceModals';
import { DiscardModal } from './components/robber/DiscardModal';
import { GameOverScreen } from './components/scoring/GameOverScreen';
import { BonusIndicators } from './components/scoring/BonusIndicators';
import { getValidRobberHexes } from './game/rules/robber';
import { EventLog } from './components/log/EventLog';
import { TopBar } from './components/topbar/TopBar';
import { HandoffOverlay } from './components/topbar/HandoffOverlay';
import { ConfirmNewGameModal } from './components/topbar/ConfirmNewGameModal';
import { DevPanel } from './components/dev/DevPanel';
import './App.css';

/** How long the dice visually tumble before revealing the engine's result. */
const ROLL_ANIMATION_MS = 600;
/** How long a producing hex's number token stays pressed after a matching roll. */
const PULSE_DURATION_MS = 900;
/** How long the board's dim-and-glint reaction plays before the standings overlay appears. */
const VICTORY_BOARD_BEAT_MS = 900;
/** How long the "card drawn" acknowledgement stays up. Identity is never shown. */
const CARD_DRAW_TOAST_MS = 1400;

/** DEV tools only exist behind an explicit, non-default query flag — never for players. */
const DEV_MODE = new URLSearchParams(window.location.search).get('dev') === '1';

function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [rolling, setRolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<PlacementMode>('none');
  const [tradeOpen, setTradeOpen] = useState(false);
  // Which development card is mid-play and waiting on the player's choice.
  const [cardPrompt, setCardPrompt] = useState<'monopoly' | 'yearOfPlenty' | null>(null);

  // --- LAN network mode. null until the player picks a mode on the very first
  // screen; 'local' renders the existing pass-and-play SetupScreen untouched.
  // 'host'/'join' route through NetworkSetup -> NetworkLobby instead. Sprint C
  // wires the lobby's "game started" signal into a real networked GameState;
  // for now these only exist pre-game, so `game` itself is unaffected. ---
  const [sessionMode, setSessionMode] = useState<SessionMode | null>(null);
  const [networkClient, setNetworkClient] = useState<GameClient | null>(null);
  const [networkPlayerId, setNetworkPlayerId] = useState<string | null>(null);
  // The lobby's playerId (above) and the GameState's own player ids are two
  // separate id spaces — the engine assigns ids independent of join order. Set
  // once YOUR_GAME_PLAYER_ID arrives, right as the game starts (see
  // onGameStarted below); everything that reads game.players[] must key off
  // this, never off the lobby id.
  const [gamePlayerId, setGamePlayerId] = useState<string | null>(null);
  // True while the socket is dropped and GameClient is auto-reconnecting.
  const [networkConnectionLost, setNetworkConnectionLost] = useState(false);
  const [networkIsHost, setNetworkIsHost] = useState(false);

  const networkUnsubscribeRef = useRef<(() => void) | null>(null);

  const resetNetworkState = useCallback(() => {
    networkUnsubscribeRef.current?.();
    networkUnsubscribeRef.current = null;
    networkTransportRef.current = null;
    if (networkClient) clearSession(networkClient.getUrl());
    networkClient?.close();
    setNetworkClient(null);
    setNetworkPlayerId(null);
    setGamePlayerId(null);
    setNetworkIsHost(false);
    setNetworkConnectionLost(false);
    setSessionMode(null);
    gameRef.current = null;
    setGame(null);
  }, [networkClient]);

  // --- Privacy state. Deliberately local UI state, never part of GameState: PINs
  // and "who can currently see whose hand" are not Catan rules, and keeping them
  // out of the engine keeps every existing engine test untouched. ---
  const [pins, setPins] = useState<Record<string, string>>({});
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  // The one player, if any, whose actual card identities are on screen right now.
  const [unlockedPlayerId, setUnlockedPlayerId] = useState<string | null>(null);
  const [cardDrawFlash, setCardDrawFlash] = useState(false);
  const [handoffPlayerId, setHandoffPlayerId] = useState<string | null>(null);
  const [confirmNewGameOpen, setConfirmNewGameOpen] = useState(false);
  // The just-revealed roll total, so producing hexes can press-pulse — purely a
  // visual echo of a value already in GameState, cleared a moment after it shows.
  const [pulseTotal, setPulseTotal] = useState<number | null>(null);
  // Victory plays as two beats: the board reacts first (winner's pieces glint
  // through a dimmed board), then the standings overlay fades in on top.
  const [victoryBoardBeat, setVictoryBoardBeat] = useState(false);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);

  const rollTimer = useRef<number | null>(null);
  const pulseTimer = useRef<number | null>(null);
  const victoryTimer = useRef<number | null>(null);
  const cardDrawTimer = useRef<number | null>(null);
  // The engine must run exactly once per user action. A setState updater can be
  // invoked twice (StrictMode), which would double-consume the dice RNG, so we
  // read the live state from a ref and call the engine outside any updater.
  const gameRef = useRef<GameState | null>(null);

  const commit = useCallback((next: GameState) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  // Set once a network game starts (see NetworkLobby's onGameStarted below).
  // While set, dispatch routes actions over the wire instead of running the
  // engine locally — the host is the only process that ever calls applyAction
  // for that session.
  const networkTransportRef = useRef<NetworkTransport | null>(null);

  /**
   * Single funnel from UI intent to engine action; surfaces engine errors verbatim.
   * In network mode this is fire-and-forget: there is no client-side prediction,
   * so the boolean return is optimistic (the action was sent, not that it
   * succeeded) — the authoritative result arrives later via the transport's
   * subscribe() callback, same as commit() does for local mode.
   */
  const dispatch = useCallback(
    (action: GameAction, deps?: ActionDeps): boolean => {
      if (networkTransportRef.current) {
        networkTransportRef.current.dispatch(action);
        return true;
      }
      const current = gameRef.current;
      if (!current) return false;
      const result = applyAction(current, action, deps);
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
      setError(null);
      commit(result.state);
      return true;
    },
    [commit]
  );

  const startRollAnimation = useCallback(() => {
    setRolling(true);
    if (rollTimer.current) window.clearTimeout(rollTimer.current);
    rollTimer.current = window.setTimeout(() => {
      setRolling(false);
      // Read the roll that just landed (already in state by now) and give its
      // producing hexes a brief press-pulse.
      const total = gameRef.current?.diceResult?.total ?? null;
      setPulseTotal(total);
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(() => setPulseTotal(null), PULSE_DURATION_MS);
    }, ROLL_ANIMATION_MS);
  }, []);

  /** The one place private cards ever close. Call this liberally — when in doubt, hide. */
  const closePrivateCards = useCallback(() => {
    setUnlockedPlayerId(null);
    setPinModalOpen(false);
    setPinError(null);
  }, []);

  // Belt-and-suspenders auto-hide: whenever whose turn it is, or what phase the
  // turn is in, changes for ANY reason, the private card view closes. This covers
  // every case in the spec (turn end, robber phase, discard phase, ...) with one
  // rule instead of chasing each transition individually.
  // Local mode only: in network mode each device only ever holds its own
  // player's real hand (see redactState.ts), so there is nothing to re-hide
  // when the turn passes to someone else — that player's data never arrived.
  const privacyGuardKey =
    sessionMode === 'local' && game ? `${game.currentPlayerId}:${game.turnPhase}` : null;
  const previousPrivacyGuardKey = useRef<string | null>(null);
  useEffect(() => {
    if (previousPrivacyGuardKey.current !== null && previousPrivacyGuardKey.current !== privacyGuardKey) {
      closePrivateCards();
    }
    previousPrivacyGuardKey.current = privacyGuardKey;
  }, [privacyGuardKey, closePrivateCards]);

  // The instant the game newly ends, play the board's reaction beat before the
  // standings overlay appears on top of it.
  const previousPhase = useRef<GameState['phase'] | null>(null);
  useEffect(() => {
    if (!game) {
      previousPhase.current = null;
      return;
    }
    if (game.phase === 'GAME_OVER' && previousPhase.current !== 'GAME_OVER') {
      setVictoryBoardBeat(true);
      setGameOverDismissed(false);
      if (victoryTimer.current) window.clearTimeout(victoryTimer.current);
      victoryTimer.current = window.setTimeout(() => setVictoryBoardBeat(false), VICTORY_BOARD_BEAT_MS);
    }
    previousPhase.current = game.phase;
  }, [game]);

  const startGame = (playerNames: string[], playerPins: string[]) => {
    const next = createInitialGame(playerNames);
    commit(next);
    const pinMap: Record<string, string> = {};
    next.players.forEach((player, i) => {
      pinMap[player.id] = playerPins[i];
    });
    setPins(pinMap);
    setError(null);
    setMode('none');
    setTradeOpen(false);
    closePrivateCards();
    setHandoffPlayerId(null);
    setCardDrawFlash(false);
    setPulseTotal(null);
    setVictoryBoardBeat(false);
    setGameOverDismissed(false);
  };

  /** Returns to the setup screen; starting from there builds a fresh board and state. */
  const handleNewGame = () => {
    // Network mode: tear down the socket/transport too, or stray STATE
    // messages arriving right after would resurrect `game` via commit().
    if (sessionMode !== 'local') {
      resetNetworkState();
      setConfirmNewGameOpen(false);
      return;
    }
    gameRef.current = null;
    setGame(null);
    setError(null);
    setMode('none');
    setSessionMode(null);
    setTradeOpen(false);
    setPins({});
    closePrivateCards();
    setHandoffPlayerId(null);
    setCardDrawFlash(false);
    setPulseTotal(null);
    setVictoryBoardBeat(false);
    setGameOverDismissed(false);
    setConfirmNewGameOpen(false);
  };

  const handleRoll = () => {
    const current = gameRef.current;
    if (!current) return;
    startRollAnimation();
    setMode('none');
    dispatch({ type: 'ROLL_DICE', playerId: current.currentPlayerId });
  };

  const handleEndTurn = () => {
    const current = gameRef.current;
    if (!current) return;
    setMode('none');
    setTradeOpen(false);
    // Local mode only: network mode's own hand stays visible on this device for
    // the whole session (see NetworkLobby's onGameStarted), there is no shared
    // screen to hand off, and dispatch() there is fire-and-forget, so
    // gameRef.current right after calling it is still the OLD state, not the
    // next player — reading it here would show the handoff for the wrong player.
    if (sessionMode !== 'local') {
      dispatch({ type: 'END_TURN', playerId: current.currentPlayerId });
      return;
    }
    closePrivateCards();
    const ok = dispatch({ type: 'END_TURN', playerId: current.currentPlayerId });
    if (ok && gameRef.current && gameRef.current.phase === 'PLAYING') {
      setHandoffPlayerId(gameRef.current.currentPlayerId);
    }
  };

  // --- Placement ---

  const handleSelectIntersection = (intersectionId: string) => {
    const current = gameRef.current;
    if (!current) return;
    const playerId = current.currentPlayerId;

    if (current.phase === 'INITIAL_PLACEMENT') {
      dispatch({ type: 'PLACE_INITIAL_SETTLEMENT', playerId, intersectionId });
      return;
    }

    const type: BuildingType = mode === 'city' ? 'city' : 'settlement';
    const ok = dispatch(
      type === 'city'
        ? { type: 'BUILD_CITY', playerId, intersectionId }
        : { type: 'BUILD_SETTLEMENT', playerId, intersectionId }
    );
    if (ok) setMode('none');
  };

  const handleSelectEdge = (edgeId: string) => {
    const current = gameRef.current;
    if (!current) return;
    const playerId = current.currentPlayerId;

    if (current.phase === 'INITIAL_PLACEMENT') {
      dispatch({ type: 'PLACE_INITIAL_ROAD', playerId, edgeId });
      return;
    }

    const ok = dispatch({ type: 'BUILD_ROAD', playerId, edgeId });
    if (ok) setMode('none');
  };

  // --- Development cards ---

  const handleBuyCard = () => {
    const current = gameRef.current;
    if (!current) return;
    const ok = dispatch({ type: 'BUY_DEVELOPMENT_CARD', playerId: current.currentPlayerId });
    if (ok) {
      // Acknowledge the purchase without ever showing which card it was.
      setCardDrawFlash(true);
      if (cardDrawTimer.current) window.clearTimeout(cardDrawTimer.current);
      cardDrawTimer.current = window.setTimeout(() => setCardDrawFlash(false), CARD_DRAW_TOAST_MS);
    }
  };

  /** Knight and Road Building resolve immediately; the other two need a choice first. */
  const handlePlayCard = (type: DevelopmentCardType) => {
    const current = gameRef.current;
    if (!current) return;
    const playerId = current.currentPlayerId;

    // Playing a card is exactly the moment the rest of the hand must stop being
    // shown — close the private view the instant a play begins, before the engine
    // action even runs.
    closePrivateCards();

    switch (type) {
      case 'knight':
        dispatch({ type: 'PLAY_KNIGHT', playerId });
        break;
      case 'roadBuilding':
        setMode('none');
        dispatch({ type: 'PLAY_ROAD_BUILDING', playerId });
        break;
      case 'monopoly':
        setCardPrompt('monopoly');
        break;
      case 'yearOfPlenty':
        setCardPrompt('yearOfPlenty');
        break;
      default:
        break;
    }
  };

  const handleMonopoly = (resource: ResourceType) => {
    const current = gameRef.current;
    if (!current) return;
    dispatch({ type: 'PLAY_MONOPOLY', playerId: current.currentPlayerId, resource });
    setCardPrompt(null);
  };

  const handleYearOfPlenty = (selection: Partial<ResourceCount>) => {
    const current = gameRef.current;
    if (!current) return;
    dispatch({ type: 'PLAY_YEAR_OF_PLENTY', playerId: current.currentPlayerId, selection });
    setCardPrompt(null);
  };

  // --- Privacy: PIN entry and the private card view ---

  const handleOpenPin = () => {
    // Network mode has no PIN — this device already only ever received its
    // own player's real cards (see redactState.ts). But several existing
    // local-mode code paths call closePrivateCards() unconditionally (playing
    // a card, clicking the backdrop, ...), which also clears unlockedPlayerId
    // in network mode. Re-opening here just means showing this device's own
    // hand again, not actually unlocking anything new.
    if (sessionMode !== 'local') {
      if (gamePlayerId) setUnlockedPlayerId(gamePlayerId);
      return;
    }
    setPinError(null);
    setPinModalOpen(true);
  };

  const handleSubmitPin = (pin: string) => {
    const current = gameRef.current;
    if (!current) return;
    const expected = pins[current.currentPlayerId];
    if (pin === expected) {
      setUnlockedPlayerId(current.currentPlayerId);
      setPinModalOpen(false);
      setPinError(null);
    } else {
      setPinError('Incorrect PIN.');
    }
  };

  // --- Robber sequence ---

  const handleDiscard = (playerId: string, selection: Partial<ResourceCount>) => {
    dispatch({ type: 'DISCARD_RESOURCES', playerId, selection });
  };

  const handleSelectHex = (hexId: string) => {
    const current = gameRef.current;
    if (!current) return;
    dispatch({ type: 'MOVE_ROBBER', playerId: current.currentPlayerId, hexId });
  };

  const handleSteal = (victimId: string) => {
    const current = gameRef.current;
    if (!current) return;
    dispatch({ type: 'STEAL_RESOURCE', playerId: current.currentPlayerId, victimId });
  };

  // --- DEV-only helpers (bypass rules on purpose; gated behind ?dev=1, never shipped to players) ---

  const handlePlaceTestBuilding = (hexId: string, type: BuildingType) => {
    const current = gameRef.current;
    if (!current) return;
    const hex = current.board.hexes.find((h) => h.id === hexId);
    if (!hex) return;
    const freeIntersection =
      hex.intersectionIds.find(
        (id) => !current.board.intersections.find((i) => i.id === id)?.building
      ) ?? hex.intersectionIds[0];
    commit(devPlaceBuilding(current, freeIntersection, current.currentPlayerId, type));
  };

  const handlePlaceOnPort = (portId: string) => {
    const current = gameRef.current;
    if (!current) return;
    const port = current.board.ports.find((p) => p.id === portId);
    if (!port) return;
    const freeIntersection =
      port.intersectionIds.find(
        (id) => !current.board.intersections.find((i) => i.id === id)?.building
      ) ?? port.intersectionIds[0];
    commit(devPlaceBuilding(current, freeIntersection, current.currentPlayerId, 'settlement'));
  };

  const handleClearBuildings = () => {
    if (gameRef.current) commit(devClearBuildings(gameRef.current));
  };

  const handleGrantResources = () => {
    const current = gameRef.current;
    if (current) commit(devGrantResources(current, current.currentPlayerId));
  };

  const handleGrantResourcesToAll = () => {
    if (gameRef.current) commit(devGrantResourcesToAll(gameRef.current));
  };

  const handleGiveCard = (type: DevelopmentCardType) => {
    const current = gameRef.current;
    if (current) commit(devGiveDevelopmentCard(current, current.currentPlayerId, type));
  };

  // --- Trading ---

  const handleProposeTrade = (
    targetPlayerId: string | null,
    offeredResources: Partial<ResourceCount>,
    requestedResources: Partial<ResourceCount>
  ) => {
    const current = gameRef.current;
    if (!current) return;
    const ok = dispatch({
      type: 'PROPOSE_TRADE',
      playerId: current.currentPlayerId,
      targetPlayerId,
      offeredResources,
      requestedResources,
    });
    if (ok) setTradeOpen(false);
  };

  const handleAcceptTrade = (playerId: string, tradeId: string) => {
    dispatch({ type: 'ACCEPT_TRADE', playerId, tradeId });
  };

  const handleRejectTrade = (playerId: string, tradeId: string) => {
    dispatch({ type: 'REJECT_TRADE', playerId, tradeId });
  };

  const handleCancelTrade = (tradeId: string) => {
    const current = gameRef.current;
    if (!current) return;
    dispatch({ type: 'CANCEL_TRADE', playerId: current.currentPlayerId, tradeId });
  };

  const handleBankTrade = (give: ResourceType, receive: ResourceType) => {
    const current = gameRef.current;
    if (!current) return;
    const ok = dispatch({ type: 'BANK_TRADE', playerId: current.currentPlayerId, give, receive });
    if (ok) setTradeOpen(false);
  };

  const handleForceRoll = (die1: number, die2: number) => {
    const current = gameRef.current;
    if (!current) return;
    startRollAnimation();
    dispatch(
      { type: 'ROLL_DICE', playerId: current.currentPlayerId },
      { rng: fixedDiceRng(die1, die2) }
    );
  };

  /**
   * The board's click mode. Mandatory steps (setup placement, moving the robber,
   * Road Building) override the player's manual build selection, because the game
   * is waiting on exactly that input.
   */
  const effectiveMode: PlacementMode = !game
    ? 'none'
    : game.phase === 'INITIAL_PLACEMENT'
      ? game.setupStep === 'PLACE_SETTLEMENT'
        ? 'settlement'
        : 'road'
      : game.turnPhase === 'MOVING_ROBBER'
        ? 'robber'
        : game.turnPhase === 'ROAD_BUILDING'
          ? 'road'
          : mode;

  const { validIntersectionIds, validEdgeIds, validHexIds } = useMemo(() => {
    const empty = { validIntersectionIds: [], validEdgeIds: [], validHexIds: [] };
    if (!game) return empty;
    const playerId = game.currentPlayerId;
    switch (effectiveMode) {
      case 'settlement':
        return { ...empty, validIntersectionIds: getValidSettlementLocations(game, playerId) };
      case 'city':
        return { ...empty, validIntersectionIds: getValidCityLocations(game, playerId) };
      case 'road':
        return { ...empty, validEdgeIds: getValidRoadLocations(game, playerId) };
      case 'robber':
        return { ...empty, validHexIds: getValidRobberHexes(game) };
      default:
        return empty;
    }
  }, [game, effectiveMode]);

  // Board pieces render as illustrated art per player color (see PLAYER_PIECE_ART),
  // so the board needs the player's color KEY, not a hex string.
  const playerColors = useMemo(
    () => (game ? Object.fromEntries(game.players.map((p) => [p.id, p.color])) : {}),
    [game]
  );

  if (!game) {
    if (sessionMode === null) {
      return <ModeSelect onSelect={setSessionMode} />;
    }
    if (sessionMode === 'local') {
      return <SetupScreen onStart={startGame} />;
    }
    // sessionMode is 'host' or 'join': collect a name/address, connect, then
    // show the live lobby. Sprint C turns "game started" into a real GameState;
    // for now the lobby is a dead end once the host clicks Start.
    if (!networkClient || !networkPlayerId) {
      return (
        <NetworkSetup
          role={sessionMode}
          onConnected={(client, playerId, isHost) => {
            setNetworkClient(client);
            setNetworkPlayerId(playerId);
            setNetworkIsHost(isHost);
          }}
          onBack={resetNetworkState}
        />
      );
    }
    return (
      <NetworkLobby
        client={networkClient}
        playerId={networkPlayerId}
        isHost={networkIsHost}
        onGameStarted={() => {
          const transport = new NetworkTransport(networkClient, networkPlayerId);
          networkTransportRef.current = transport;

          const unsubscribeIdentity = networkClient.onMessage((message) => {
            if (message.type === 'YOUR_GAME_PLAYER_ID') {
              setGamePlayerId(message.playerId);
              // This device is that player, for the whole session — no PIN
              // needed, unlike local mode's shared-screen handoff.
              setUnlockedPlayerId(message.playerId);
            }
          });
          const unsubscribeState = transport.subscribe(
            (state) => {
              setError(null);
              commit(state);
            },
            (message) => setError(message)
          );
          const unsubscribeOpen = networkClient.onOpen(() => setNetworkConnectionLost(false));
          const unsubscribeClose = networkClient.onClose(() => setNetworkConnectionLost(true));
          networkUnsubscribeRef.current = () => {
            unsubscribeIdentity();
            unsubscribeState();
            unsubscribeOpen();
            unsubscribeClose();
          };
        }}
        onLeave={resetNetworkState}
      />
    );
  }

  const currentPlayer = game.players.find((p) => p.id === game.currentPlayerId)!;
  // Local mode has no fixed "viewer" — the shared screen always belongs to
  // whoever's turn it is. Network mode's viewer is this device's own player,
  // regardless of whose turn it is, since every device sees the live board.
  const viewerPlayerId = sessionMode === 'local' ? undefined : (gamePlayerId ?? undefined);
  const viewerPlayer = viewerPlayerId
    ? (game.players.find((p) => p.id === viewerPlayerId) ?? currentPlayer)
    : currentPlayer;
  // Only the action panels relevant to a normal action phase are shown — every
  // special phase (discard, robber, stealing, road building, setup) replaces them
  // with its own focused instruction instead of leaving irrelevant buttons visible.
  const showOrdinaryActions = game.phase === 'PLAYING' && game.turnPhase === 'AWAITING_ACTIONS';
  // Local mode restricts viewing to your own turn (the shared-screen PIN model);
  // network mode's own hand is visible on this device for the whole session,
  // whoever's turn it is — see NetworkLobby's onGameStarted.
  const unlockedPlayer =
    unlockedPlayerId && (sessionMode !== 'local' || unlockedPlayerId === game.currentPlayerId)
      ? game.players.find((p) => p.id === unlockedPlayerId)
      : undefined;

  return (
    <div className="app-shell">
      <TopBar
        turnNumber={game.turnNumber}
        currentPlayer={currentPlayer}
        onNewGame={() => setConfirmNewGameOpen(true)}
      />

      {sessionMode !== 'local' && networkConnectionLost && (
        <div className="network-status-banner" role="status">
          Reconnecting to host…
        </div>
      )}

      <div className="main-row">
        <aside className="sidebar sidebar--left">
          <div
            className="player-console"
            style={{ '--player-color': PLAYER_COLOR_HEX[currentPlayer.color] } as CSSProperties}
          >
            <TurnPanel game={game} rolling={rolling} error={error} onRoll={handleRoll} />

            {game.phase === 'PLAYING' && (
              <YourResources resources={viewerPlayer.resources} />
            )}

            {showOrdinaryActions && (
              <BuildPanel
                game={game}
                mode={mode}
                validCount={validIntersectionIds.length + validEdgeIds.length}
                onSelectMode={setMode}
              />
            )}

            {showOrdinaryActions && (
              <button
                type="button"
                className="btn btn--primary trade-open-btn"
                onClick={() => setTradeOpen(true)}
              >
                Trade
              </button>
            )}

            {game.phase === 'PLAYING' && (
              <DevCardsSummary
                game={game}
                onBuy={handleBuyCard}
                onView={handleOpenPin}
                viewerPlayerId={viewerPlayerId}
              />
            )}

            {cardDrawFlash && <CardDrawToast />}
          </div>

          {game.phase === 'PLAYING' && (
            <EndTurnBar game={game} rolling={rolling} onEndTurn={handleEndTurn} />
          )}
        </aside>

        <main className="board-stage">
          <HexBoard
            board={game.board}
            robberHexId={game.robberHexId}
            playerColors={playerColors}
            mode={effectiveMode}
            validIntersectionIds={validIntersectionIds}
            validEdgeIds={validEdgeIds}
            validHexIds={validHexIds}
            pulseTotal={pulseTotal}
            celebrateWinnerId={victoryBoardBeat ? game.winnerId : null}
            onSelectIntersection={handleSelectIntersection}
            onSelectEdge={handleSelectEdge}
            onSelectHex={handleSelectHex}
          />
        </main>

        <aside className="sidebar sidebar--right">
          <BonusIndicators game={game} />
          {/* Above the player cards, not buried under the log — a new trade
              request is time-sensitive and easy to miss lower down. */}
          <TradeInbox
            game={game}
            onAccept={handleAcceptTrade}
            onReject={handleRejectTrade}
            onCancel={handleCancelTrade}
          />
          <PlayerPanels game={game} viewerPlayerId={viewerPlayerId} />
          <EventLog game={game} />
        </aside>
      </div>

      {game.phase === 'GAME_OVER' && !victoryBoardBeat && !gameOverDismissed && (
        <GameOverScreen
          game={game}
          onNewGame={() => setConfirmNewGameOpen(true)}
          onDismiss={() => setGameOverDismissed(true)}
        />
      )}

      {game.phase === 'GAME_OVER' && gameOverDismissed && (
        <button
          type="button"
          className="results-recall-btn"
          onClick={() => setGameOverDismissed(false)}
        >
          🏆 View Results
        </button>
      )}

      {game.phase !== 'GAME_OVER' && game.turnPhase === 'DISCARDING' && (
        <DiscardModal game={game} onDiscard={handleDiscard} />
      )}

      {game.phase !== 'GAME_OVER' && game.turnPhase === 'STEALING' && (
        <StealTargetModal game={game} onSteal={handleSteal} />
      )}

      {cardPrompt === 'monopoly' && (
        <MonopolyModal onConfirm={handleMonopoly} onCancel={() => setCardPrompt(null)} />
      )}

      {cardPrompt === 'yearOfPlenty' && (
        <YearOfPlentyModal
          onConfirm={handleYearOfPlenty}
          onCancel={() => setCardPrompt(null)}
        />
      )}

      {tradeOpen && (
        <TradeModal
          game={game}
          onClose={() => setTradeOpen(false)}
          onProposeTrade={handleProposeTrade}
          onBankTrade={handleBankTrade}
        />
      )}

      {pinModalOpen && (
        <PinModal
          playerName={currentPlayer.name}
          error={pinError}
          onSubmit={handleSubmitPin}
          onCancel={closePrivateCards}
        />
      )}

      {unlockedPlayer && (
        <PrivateDevCards
          game={game}
          player={unlockedPlayer}
          onPlay={handlePlayCard}
          onHide={closePrivateCards}
        />
      )}

      {handoffPlayerId && (
        <HandoffOverlay
          player={game.players.find((p) => p.id === handoffPlayerId)!}
          turnNumber={game.turnNumber}
          onContinue={() => setHandoffPlayerId(null)}
        />
      )}

      {confirmNewGameOpen && (
        <ConfirmNewGameModal
          onConfirm={handleNewGame}
          onCancel={() => setConfirmNewGameOpen(false)}
        />
      )}

      {DEV_MODE && (
        <DevPanel
          game={game}
          onPlaceTestBuilding={handlePlaceTestBuilding}
          onPlaceOnPort={handlePlaceOnPort}
          onClearBuildings={handleClearBuildings}
          onGrantResources={handleGrantResources}
          onGrantResourcesToAll={handleGrantResourcesToAll}
          onGiveCard={handleGiveCard}
          onForceRoll={handleForceRoll}
        />
      )}
    </div>
  );
}

export default App;
