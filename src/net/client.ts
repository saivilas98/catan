// Thin browser-side wrapper around a WebSocket connection to a host server.
// Auto-reconnects with backoff on an unexpected drop (Wi-Fi hiccup, host
// device sleeping briefly) — listeners survive across the underlying socket
// being replaced, so callers never need to know a reconnect happened except
// via onOpen/onClose firing again. Deliberate close() (the player clicking
// Leave) does not trigger a reconnect.
import type { ClientMessage, ServerMessage } from './protocol';

const MAX_RECONNECT_DELAY_MS = 8000;

export class GameClient {
  private socket: WebSocket;
  private intentionalClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;

  private messageListeners = new Set<(message: ServerMessage) => void>();
  private openListeners = new Set<() => void>();
  private closeListeners = new Set<() => void>();
  private errorListeners = new Set<() => void>();

  constructor(private url: string) {
    this.socket = this.connect();
  }

  private connect(): WebSocket {
    const socket = new WebSocket(this.url);
    socket.addEventListener('message', (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      this.messageListeners.forEach((listener) => listener(message));
    });
    socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.openListeners.forEach((listener) => listener());
    });
    socket.addEventListener('close', () => {
      this.closeListeners.forEach((listener) => listener());
      if (!this.intentionalClose) this.scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      this.errorListeners.forEach((listener) => listener());
    });
    return socket;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.socket = this.connect();
    }, delay);
  }

  onMessage(listener: (message: ServerMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onOpen(listener: () => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  onError(listener: () => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /** Silently dropped if the socket is mid-reconnect — no send queue in this MVP. */
  send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.socket.close();
  }

  getUrl(): string {
    return this.url;
  }
}

/** Builds a ws:// URL from whatever a player types in — bare IP, IP:port, or a full URL. */
export function resolveHostUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) return trimmed;
  const withoutScheme = trimmed.replace(/^https?:\/\//, '');
  return `ws://${withoutScheme}`;
}

const STORAGE_PREFIX = 'catan-network-session:';

interface SavedSession {
  reconnectToken: string;
  name: string;
}

/** Lets a freshly opened tab rejoin the same seat after closing the old one. */
export function saveSession(url: string, session: SavedSession): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + url, JSON.stringify(session));
  } catch {
    // Storage can be unavailable (private browsing, quota) — reconnection by
    // token is a convenience, not a correctness requirement, so just skip it.
  }
}

export function loadSession(url: string): SavedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + url);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}

export function clearSession(url: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + url);
  } catch {
    // Nothing to do if storage is unavailable.
  }
}
