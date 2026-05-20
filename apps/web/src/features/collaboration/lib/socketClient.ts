/**
 * Socket.IO client singleton.
 *
 * Manages connections to the /presenter and /collaboration namespaces.
 * Call connect() once after login and disconnect() on logout.
 * Both namespaces share the same underlying transport.
 */
import { io, type Socket } from 'socket.io-client';
import { supabase } from '@/lib/supabase';
import { logger } from './logger';

const API_URL = import.meta.env['VITE_API_URL'] as string ?? 'http://localhost:4000';

// ─────────────────────────────────────────────────────────────────────────────
// Connection state
// ─────────────────────────────────────────────────────────────────────────────

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface SocketState {
  presenterSocket: Socket | null;
  collaborationSocket: Socket | null;
  status: ConnectionStatus;
  listeners: Set<(status: ConnectionStatus) => void>;
}

const state: SocketState = {
  presenterSocket: null,
  collaborationSocket: null,
  status: 'disconnected',
  listeners: new Set(),
};

function setStatus(s: ConnectionStatus) {
  state.status = s;
  state.listeners.forEach((fn) => fn(s));
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
    setStatus('error');
    return;
  }

  const opts = {
    auth: { token },
    transports: ['websocket', 'polling'] as ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 10,
    timeout: 10_000,
  };

  // ── /presenter namespace ──────────────────────────────────────────────────
  const presenterSocket = io(`${API_URL}/presenter`, opts);

  presenterSocket.on('connect', () => {
    setStatus('connected');
    logger.log('[Socket] /presenter connected', presenterSocket.id);
  });

  presenterSocket.on('disconnect', (reason) => {
    logger.warn('[Socket] /presenter disconnected:', reason);
    if (reason !== 'io client disconnect') setStatus('connecting');
  });

  presenterSocket.on('connect_error', (err) => {
    logger.error('[Socket] /presenter connect error:', err.message);
    setStatus('error');
  });

  // ── /collaboration namespace ──────────────────────────────────────────────
  const collaborationSocket = io(`${API_URL}/collaboration`, opts);

  collaborationSocket.on('connect', () => {
    logger.log('[Socket] /collaboration connected', collaborationSocket.id);
  });

  collaborationSocket.on('disconnect', (reason) => {
    logger.warn('[Socket] /collaboration disconnected:', reason);
  });

  // Token refresh: re-auth on token expiry
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.access_token) {
      presenterSocket.auth = { token: session.access_token };
      collaborationSocket.auth = { token: session.access_token };
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

export function onStatusChange(fn: (status: ConnectionStatus) => void): () => void {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility logger (browser-safe)
// ─────────────────────────────────────────────────────────────────────────────
const logger = {
  log: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.warn(...args);
  },
  error: (...args: unknown[]) => console.error(...args),
};
