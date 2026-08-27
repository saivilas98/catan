// LAN host process: serves the built client and accepts WebSocket connections
// from other devices on the same network. Sprint A only wires up the transport
// (static files + JOIN/JOINED echo) — no lobby or gameplay yet.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../src/net/protocol';
import { Lobby } from './lobby';
import { GameHost } from './gameHost';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');
const PORT = Number(process.env.PORT ?? 8080);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

async function serveStatic(urlPath: string): Promise<{ body: Buffer; contentType: string } | null> {
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.join(DIST_DIR, relative);
  if (!filePath.startsWith(DIST_DIR)) return null; // guard against path traversal
  try {
    const body = await readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream';
    return { body, contentType };
  } catch {
    // SPA fallback: unknown paths resolve to index.html
    try {
      const body = await readFile(path.join(DIST_DIR, 'index.html'));
      return { body, contentType: 'text/html' };
    } catch {
      return null;
    }
  }
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface): iface is NonNullable<typeof iface> => !!iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  // Lets the host's own screen show the address other devices should type in,
  // regardless of what address the host used to load this page themselves
  // (e.g. localhost, which nobody else on the network can reach).
  if (url.pathname === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({ port: PORT, addresses: lanAddresses() })
    );
    return;
  }

  serveStatic(url.pathname).then((file) => {
    if (!file) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': file.contentType }).end(file.body);
  });
});

const wss = new WebSocketServer({ server: httpServer });

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

const lobby = new Lobby();
// Set once the host clicks Start; from then on ACTION messages route to it
// instead of the lobby. One process hosts exactly one session (Sprint E scope
// covers anything beyond a single LAN party).
let gameHost: GameHost | null = null;

wss.on('connection', (socket) => {
  console.log('[catan-host] client connected');

  socket.on('message', (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: 'ERROR', message: 'Malformed message' });
      return;
    }

    switch (message.type) {
      case 'JOIN': {
        const result = lobby.join(socket, message.name, message.reconnectToken);
        if (!result.ok) {
          send(socket, { type: 'ERROR', message: result.error });
          break;
        }
        if (result.rejoined) {
          console.log(`[catan-host] ${message.name} reconnected as ${result.player.id}`);
          // Game already running: hand this socket the game's own identity
          // message and a fresh state snapshot, same as a first-time joiner
          // gets when the host starts the game.
          gameHost?.registerSocket(result.player.id, socket);
        } else {
          console.log(`[catan-host] ${message.name} joined as ${result.player.id}`);
        }
        break;
      }
      case 'READY': {
        const playerId = lobby.playerIdFor(socket);
        if (playerId) lobby.setReady(playerId, message.ready);
        break;
      }
      case 'START_GAME': {
        const playerId = lobby.playerIdFor(socket);
        const result = playerId ? lobby.startGame(playerId) : { ok: false as const, error: 'Not joined' };
        if (!result.ok) {
          send(socket, { type: 'ERROR', message: result.error });
          break;
        }
        try {
          gameHost = new GameHost(result.players);
          for (const player of result.players) gameHost.registerSocket(player.id, player.socket);
          console.log('[catan-host] game started');
        } catch (err) {
          // A single bad session must not take down the whole process — every
          // other LAN party on this host would go down with it.
          console.error('[catan-host] failed to start game:', err);
          gameHost = null;
          send(socket, { type: 'ERROR', message: 'Failed to start the game' });
        }
        break;
      }
      case 'ACTION': {
        const playerId = lobby.playerIdFor(socket);
        if (!gameHost || !playerId) {
          send(socket, { type: 'ACTION_REJECTED', requestId: message.requestId, error: 'Game has not started' });
          break;
        }
        try {
          gameHost.handleAction(playerId, message.requestId, message.action);
        } catch (err) {
          console.error('[catan-host] action handling crashed:', err);
          send(socket, { type: 'ACTION_REJECTED', requestId: message.requestId, error: 'Server error handling action' });
        }
        break;
      }
      case 'LEAVE':
        lobby.disconnect(socket);
        break;
      default:
        send(socket, { type: 'ERROR', message: `Unhandled message type: ${(message as ClientMessage).type}` });
    }
  });

  socket.on('close', () => {
    console.log('[catan-host] client disconnected');
    lobby.disconnect(socket);
  });
});

httpServer.listen(PORT, () => {
  const addresses = lanAddresses();

  console.log(`[catan-host] listening on port ${PORT}`);
  console.log(`[catan-host] on this machine: http://localhost:${PORT}`);
  for (const address of addresses) {
    console.log(`[catan-host] on your network: http://${address}:${PORT}`);
  }
});
