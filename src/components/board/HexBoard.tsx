import type { Board, PlayerColor, Point } from '../../game/models/types';
import { getHexCorners, hexToPixel } from '../../game/board/hexGeometry';
import { HexTile } from './HexTile';
import { CityPiece, RoadPiece, SettlementPiece } from './BoardPieces';
import { PortMarker } from './PortMarker';

/** What the board is currently soliciting a click for. */
export type PlacementMode = 'none' | 'settlement' | 'road' | 'city' | 'robber';

interface HexBoardProps {
  board: Board;
  robberHexId: string;
  /** playerId -> color key, so each piece renders with the right owner's art. */
  playerColors: Record<string, PlayerColor>;
  mode: PlacementMode;
  validIntersectionIds: string[];
  validEdgeIds: string[];
  validHexIds?: string[];
  /** The just-revealed dice total, so matching hexes can press-pulse; null otherwise. */
  pulseTotal?: number | null;
  /** Set for the board's post-victory reaction beat: dims the board and lets
      this player's own pieces glint on top, full-brightness. */
  celebrateWinnerId?: string | null;
  onSelectIntersection: (intersectionId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onSelectHex?: (hexId: string) => void;
}

const HEX_SIZE = 62;
// Port badges are the widest thing hanging off the board's outer edge (a
// circle plus label sitting past each outer intersection); this is the
// smallest padding that keeps them from clipping against the SVG's own
// viewBox, which acts as a hard clip rect.
const PADDING = HEX_SIZE * 1.85;
/** Board geometry is generated at unit size; scale it up for rendering. */
const SCALE = HEX_SIZE;

function scalePoint(p: Point): Point {
  return { x: p.x * SCALE, y: p.y * SCALE };
}

export function HexBoard({
  board,
  robberHexId,
  playerColors,
  mode,
  validIntersectionIds,
  validEdgeIds,
  validHexIds = [],
  pulseTotal = null,
  celebrateWinnerId = null,
  onSelectIntersection,
  onSelectEdge,
  onSelectHex,
}: HexBoardProps) {
  const centers = board.hexes.map((hex) => hexToPixel(hex.coord, HEX_SIZE));
  const minX = Math.min(...centers.map((c) => c.x)) - PADDING;
  const maxX = Math.max(...centers.map((c) => c.x)) + PADDING;
  const minY = Math.min(...centers.map((c) => c.y)) - PADDING;
  const maxY = Math.max(...centers.map((c) => c.y)) + PADDING;

  // The whole board is rotated 90° anti-clockwise for display — everything below
  // is still computed in the engine's original (unrotated) layout, and a single
  // `rotate(-90, cx, cy)` on the outer content group turns it on screen (SVG's
  // positive rotation is clockwise, so -90 is anti-clockwise). The viewBox swaps
  // width/height around that same pivot so the rotated content is framed exactly.
  // Pieces that must stay upright (robber, number tokens, settlements/cities,
  // ports) carry a local `rotate(90)` counter-rotation; roads and the hex
  // artwork rotate with the board on purpose.
  const boardCenterX = (minX + maxX) / 2;
  const boardCenterY = (minY + maxY) / 2;
  const viewBoxX = boardCenterX - (maxY - minY) / 2;
  const viewBoxY = boardCenterY - (maxX - minX) / 2;
  const viewBoxWidth = maxY - minY;
  const viewBoxHeight = maxX - minX;

  const intersectionPos = new Map(
    board.intersections.map((i) => [i.id, scalePoint(i.position)])
  );

  const winnerRoads = celebrateWinnerId
    ? board.edges.filter((edge) => edge.road?.ownerId === celebrateWinnerId)
    : [];
  const winnerBuildings = celebrateWinnerId
    ? board.intersections.filter((i) => i.building?.ownerId === celebrateWinnerId)
    : [];

  const validIntersections = new Set(validIntersectionIds);
  const validEdges = new Set(validEdgeIds);
  const validHexes = new Set(validHexIds);
  const showIntersectionTargets = mode === 'settlement' || mode === 'city';
  const showEdgeTargets = mode === 'road';
  const showHexTargets = mode === 'robber';

  return (
    <div className={`hex-board${mode !== 'none' ? ' hex-board--placing' : ''}`}>
      <svg
        viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
        role="img"
        aria-label="Catan game board"
      >
        <defs>
          {/* Shared tile lighting: light catches the top-left, shade pools bottom-right. */}
          <linearGradient id="hex-bevel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff6e1" stopOpacity="0.17" />
            <stop offset="42%" stopColor="#fff6e1" stopOpacity="0" />
            <stop offset="70%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
          </linearGradient>
          <filter id="hex-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="1.6" dy="2.4" stdDeviation="1.6" floodColor="#06131a" floodOpacity="0.5" />
          </filter>
          <filter id="token-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0.8" dy="1.4" stdDeviation="1" floodColor="#000000" floodOpacity="0.4" />
          </filter>
          <radialGradient id="token-face" cx="38%" cy="32%" r="80%">
            <stop offset="0%" stopColor="#f6ecd0" />
            <stop offset="100%" stopColor="#dfcb9e" />
          </radialGradient>
        </defs>

        <g transform={`rotate(-90 ${boardCenterX} ${boardCenterY})`}>
        {/* No board frame — the hexes float directly over the page's ocean
            background (see .app-shell in App.css), so nothing but the tiles
            and pieces themselves is drawn here. */}

        {board.hexes.map((hex) => (
          <HexTile
            key={hex.id}
            hex={hex}
            size={HEX_SIZE}
            hasRobber={hex.id === robberHexId}
            justRolled={hex.numberToken !== null && hex.numberToken === pulseTotal}
          />
        ))}

        <g className="board-layer board-layer--ports">
          {board.ports.map((port) => {
            const a = intersectionPos.get(port.intersectionIds[0]);
            const b = intersectionPos.get(port.intersectionIds[1]);
            if (!a || !b) return null;
            return (
              <PortMarker
                key={port.id}
                port={port}
                boardCenter={{ x: 0, y: 0 }}
                a={a}
                b={b}
                scale={HEX_SIZE}
              />
            );
          })}
        </g>

        {/* Roads sit under buildings so a settlement always reads on top. */}
        <g className="board-layer board-layer--roads">
          {board.edges.map((edge) => {
            if (!edge.road) return null;
            const from = intersectionPos.get(edge.intersectionIds[0]);
            const to = intersectionPos.get(edge.intersectionIds[1]);
            if (!from || !to) return null;
            return (
              <RoadPiece
                key={edge.id}
                from={from}
                to={to}
                color={playerColors[edge.road.ownerId] ?? 'white'}
                scale={HEX_SIZE}
              />
            );
          })}
        </g>

        <g className="board-layer board-layer--buildings">
          {board.intersections.map((intersection) => {
            const building = intersection.building;
            if (!building) return null;
            const pos = intersectionPos.get(intersection.id)!;
            const color = playerColors[building.ownerId] ?? 'white';
            return (
              // rotate(90) cancels the board's -90 so the piece art stays upright.
              <g key={intersection.id} transform={`translate(${pos.x} ${pos.y}) rotate(90)`}>
                {building.type === 'city' ? (
                  <CityPiece color={color} scale={HEX_SIZE} />
                ) : (
                  <SettlementPiece color={color} scale={HEX_SIZE} />
                )}
              </g>
            );
          })}
        </g>

        {/*
          Victory's first beat: the board dims except the winner's own pieces,
          which are redrawn on top at full brightness with a quick glint sweep —
          a scrim rather than a filter, so nothing about the normal piece layers
          above needs to change.
        */}
        {celebrateWinnerId && (
          <>
            <rect
              x={minX}
              y={minY}
              width={maxX - minX}
              height={maxY - minY}
              fill="#050302"
              opacity={0.45}
            />
            <g className="board-layer board-layer--celebrate">
              {winnerRoads.map((edge, i) => {
                const from = intersectionPos.get(edge.intersectionIds[0]);
                const to = intersectionPos.get(edge.intersectionIds[1]);
                if (!from || !to) return null;
                return (
                  <g key={edge.id} className="celebrate-glint" style={{ animationDelay: `${(i % 10) * 55}ms` }}>
                    <RoadPiece from={from} to={to} color={playerColors[celebrateWinnerId] ?? 'white'} scale={HEX_SIZE} />
                  </g>
                );
              })}
              {winnerBuildings.map((intersection, i) => {
                const pos = intersectionPos.get(intersection.id)!;
                return (
                  <g
                    key={intersection.id}
                    className="celebrate-glint"
                    style={{ animationDelay: `${(i % 10) * 55}ms` }}
                    transform={`translate(${pos.x} ${pos.y}) rotate(90)`}
                  >
                    {intersection.building!.type === 'city' ? (
                      <CityPiece color={playerColors[celebrateWinnerId] ?? 'white'} scale={HEX_SIZE} />
                    ) : (
                      <SettlementPiece color={playerColors[celebrateWinnerId] ?? 'white'} scale={HEX_SIZE} />
                    )}
                  </g>
                );
              })}
            </g>
          </>
        )}

        {/* Click targets, only rendered for locations the engine says are legal. */}
        {showEdgeTargets && (
          <g className="board-layer board-layer--targets">
            {board.edges.map((edge) => {
              if (!validEdges.has(edge.id)) return null;
              const from = intersectionPos.get(edge.intersectionIds[0]);
              const to = intersectionPos.get(edge.intersectionIds[1]);
              if (!from || !to) return null;
              // A rotated rect (rather than a line) gives the target real area,
              // so it is comfortably clickable and hit-testable.
              const midX = (from.x + to.x) / 2;
              const midY = (from.y + to.y) / 2;
              const length = Math.hypot(to.x - from.x, to.y - from.y);
              const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
              const thickness = HEX_SIZE * 0.16;

              return (
                <rect
                  key={edge.id}
                  className="target target--edge"
                  x={-length / 2}
                  y={-thickness / 2}
                  width={length}
                  height={thickness}
                  rx={thickness / 2}
                  transform={`translate(${midX} ${midY}) rotate(${angle})`}
                  onClick={() => onSelectEdge(edge.id)}
                >
                  <title>Build road here</title>
                </rect>
              );
            })}
          </g>
        )}

        {showHexTargets && (
          <g className="board-layer board-layer--targets">
            {board.hexes.map((hex) => {
              if (!validHexes.has(hex.id)) return null;
              const center = hexToPixel(hex.coord, HEX_SIZE);
              const points = getHexCorners({ x: 0, y: 0 }, HEX_SIZE * 0.88)
                .map((c) => `${c.x},${c.y}`)
                .join(' ');
              return (
                <polygon
                  key={hex.id}
                  className="target target--hex"
                  points={points}
                  transform={`translate(${center.x} ${center.y})`}
                  onClick={() => onSelectHex?.(hex.id)}
                >
                  <title>Move the robber here</title>
                </polygon>
              );
            })}
          </g>
        )}

        {showIntersectionTargets && (
          <g className="board-layer board-layer--targets">
            {board.intersections.map((intersection) => {
              if (!validIntersections.has(intersection.id)) return null;
              const pos = intersectionPos.get(intersection.id)!;
              return (
                <circle
                  key={intersection.id}
                  className="target target--intersection"
                  cx={pos.x}
                  cy={pos.y}
                  r={HEX_SIZE * 0.14}
                  onClick={() => onSelectIntersection(intersection.id)}
                >
                  <title>{mode === 'city' ? 'Upgrade to city' : 'Build settlement here'}</title>
                </circle>
              );
            })}
          </g>
        )}
        </g>
      </svg>
    </div>
  );
}
