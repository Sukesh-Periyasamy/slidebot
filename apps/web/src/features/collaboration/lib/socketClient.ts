/**
 * Socket.IO client singleton — enhanced with exponential backoff reconnection.
 *
 * Manages connections to the /presenter and /collaboration namespaces.
 * Call connect() once after login and disconnect() on logout.
 *
 * Reconnect strategy:
 * - Socket.IO handles transport-level reconnection
 * - Application-level recovery (session state restore) is handled by
 *   useReconnectRecovery after the 'connect' event fires
 * - Token refresh on Supabase auth change
 */
import { io, type Socket } from 'socket.io-client';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const API_URL = (import.meta.env['VITE_API_URL'] as string) ?? 'http://localhost:4000';

// ─────────────────────────────────────────────────────────────────────────────
// Connection state
// ─────────────────────────────────────────────────────────────────────────────

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

interface SocketState {
  presenterSocket: Socket | null;
  collaborationSocket: Socket | null;
  status: ConnectionStatus;
  listeners: Set<(status: ConnectionStatus) => void>;
  /** Number of reconnect attempts since last clean connect */
  reconnectAttempts: number;
  /** Whether this is a reconnect (vs initial connect) */
  hasConnectedOnce: boolean;
}

const state: SocketState = {
  presenterSocket: null,
  collaborationSocket: null,
  status: 'disconnected',
  listeners: new Set(),
  reconnectAttempts: 0,
  hasConnectedOnce: false,
};

function setStatus(s: ConnectionStatus) {
  state.status = s;
  state.listeners.forEach((fn) => fn(s));
}

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO options — tuned for resilient reconnection
// ─────────────────────────────────────────────────────────────────────────────

function buildSocketOpts(token: string) {
  return {
    auth: { token },
    transports: ['websocket', 'polling'] as ['websocket', 'polling'],
    // Socket.IO built-in reconnection
    reconnection: true,
    reconnectionDelay: 1_000, // 1s initial delay
    reconnectionDelayMax: 20_000, // 20s max
    reconnectionAttempts: 15, // Try 15x before giving up
    randomizationFactor: 0.3, // 30% jitter
    timeout: 10_000,
    // Application-level ping handled separately via heartbeat.ts
    pingTimeout: 30_000,
    pingInterval: 25_000,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Connect / disconnect
// ─────────────────────────────────────────────────────────────────────────────

export async function connectSocket(): Promise<void> {
  if (state.presenterSocket?.connected) return;

  setStatus('connecting');

  // Get fresh auth token
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    logger.error('[Socket] No auth token — cannot connect');
    setStatus('error');
    return;
  }

  const opts = buildSocketOpts(token);

  // ── /presenter namespace ────────────────────────────────────────────────────
  const presenterSocket = io(`${API_URL}/presenter`, opts);

  presenterSocket.on('connect', () => {
    const isReconnect = state.hasConnectedOnce;
    state.hasConnectedOnce = true;
    state.reconnectAttempts = 0;

    setStatus('connected');
    logger.log(`[Socket] /presenter ${isReconnect ? 're' : ''}connected`, presenterSocket.id);
  });

  presenterSocket.on('disconnect', (reason) => {
    logger.warn('[Socket] /presenter disconnected:', reason);
    // Don't set status on intentional disconnect (logout)
    if (reason !== 'io client disconnect') {
      setStatus('reconnecting');
    }
  });

  presenterSocket.on('reconnect_attempt', (attemptNumber) => {
    state.reconnectAttempts = attemptNumber;
    setStatus('reconnecting');
    logger.log(`[Socket] Reconnect attempt ${attemptNumber}`);
  });

  presenterSocket.on('reconnect', (attemptNumber) => {
    logger.log(`[Socket] Reconnected after ${attemptNumber} attempts`);
    setStatus('connected');
  });

  presenterSocket.on('reconnect_failed', () => {
    logger.error('[Socket] Reconnect failed after all attempts');
    setStatus('error');
  });

  presenterSocket.on('connect_error', (err) => {
    logger.error('[Socket] /presenter connect error:', err.message);
    // Only set error on initial connection failure; reconnects handled above
    if (!state.hasConnectedOnce) {
      setStatus('error');
    }
  });

  // ── /collaboration namespace ────────────────────────────────────────────────
  const collaborationSocket = io(`${API_URL}/collaboration`, opts);

  collaborationSocket.on('connect', () => {
    logger.log('[Socket] /collaboration connected', collaborationSocket.id);
  });

  collaborationSocket.on('disconnect', (reason) => {
    logger.warn('[Socket] /collaboration disconnected:', reason);
  });

  collaborationSocket.on('reconnect', () => {
    logger.log('[Socket] /collaboration reconnected');
  });

  // ── Token refresh on Supabase auth change ──────────────────────────────────
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.access_token) {
      const newToken = session.access_token;
      presenterSocket.auth = { token: newToken };
      collaborationSocket.auth = { token: newToken };
      logger.log('[Socket] Auth token refreshed');
    }
  });

  state.presenterSocket = presenterSocket;
  state.collaborationSocket = collaborationSocket;
}

export function disconnectSocket(): void {
  state.presenterSocket?.disconnect();
  state.collaborationSocket?.disconnect();
  state.presenterSocket = null;
  state.collaborationSocket = null;
  state.hasConnectedOnce = false;
  state.reconnectAttempts = 0;
  setStatus('disconnected');
}

// ─────────────────────────────────────────────────────────────────────────────
// Accessors
// ─────────────────────────────────────────────────────────────────────────────

export function getPresenterSocket(): Socket {
  if (!state.presenterSocket) {
    throw new Error('Socket not connected. Call connectSocket() first.');
  }
  return state.presenterSocket;
}

export function getCollaborationSocket(): Socket {
  if (!state.collaborationSocket) {
    throw new Error('Socket not connected. Call connectSocket() first.');
  }
  return state.collaborationSocket;
}

export function getConnectionStatus(): ConnectionStatus {
  return state.status;
}

export function isReconnect(): boolean {
  return state.hasConnectedOnce && state.reconnectAttempts > 0;
}

export function onStatusChange(fn: (status: ConnectionStatus) => void): () => void {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}
