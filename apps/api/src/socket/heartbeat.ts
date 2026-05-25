/**
 * Heartbeat system — keeps connections alive and detects stale sockets.
 *
 * Strategy:
 * - Server emits `app:ping` every PING_INTERVAL ms
 * - Client must respond with `app:pong` within PONG_TIMEOUT ms
 * - If pong not received, socket is considered stale and forcibly disconnected
 * - Reconnecting clients get full state via session:join ack
 *
 * This supplements Socket.IO's built-in pingTimeout/pingInterval with
 * an application-level heartbeat that carries session health data.
 */

import type { Namespace, Socket } from 'socket.io';
import { logger } from '../config/logger';
import { roomManager } from './room-manager';

const PING_INTERVAL_MS = 20_000; // 20s between pings
const PONG_TIMEOUT_MS = 10_000; // 10s to respond

// Per-socket heartbeat state
interface HeartbeatState {
  pingTimer: ReturnType<typeof setInterval> | null;
  pongTimer: ReturnType<typeof setTimeout> | null;
  missedPongs: number;
  lastPongAt: number;
}

/**
 * Attach application-level heartbeat to a single socket.
 * Call this inside the 'connection' handler of any namespace.
 */
export function attachHeartbeat(
  socket: Socket,
  opts: { namespace: string; userId: string }
): () => void {
  const hb: HeartbeatState = {
    pingTimer: null,
    pongTimer: null,
    missedPongs: 0,
    lastPongAt: Date.now(),
  };

  const sendPing = () => {
    if (!socket.connected) return;

    // Start pong timeout
    hb.pongTimer = setTimeout(() => {
      hb.missedPongs++;
      logger.warn(
        { userId: opts.userId, socketId: socket.id, missed: hb.missedPongs },
        'Missed pong'
      );

      if (hb.missedPongs >= 3) {
        logger.error(
          { userId: opts.userId, socketId: socket.id },
          'Too many missed pongs — forcing disconnect'
        );
        socket.disconnect();
      }
    }, PONG_TIMEOUT_MS);

    socket.emit('app:ping' as never, { ts: Date.now() } as never);
  };

  // Listen for pong
  socket.on('app:pong' as never, () => {
    if (hb.pongTimer) clearTimeout(hb.pongTimer);
    hb.pongTimer = null;
    hb.missedPongs = 0;
    hb.lastPongAt = Date.now();

    // Renew presenter lease if applicable
    if (opts.namespace === '/presenter' && socket.data.currentSessionId) {
      roomManager.renewPresenterLease(socket.data.currentSessionId, opts.userId).catch(() => {});
    }
  });

  // Start heartbeat loop
  hb.pingTimer = setInterval(sendPing, PING_INTERVAL_MS);

  const cleanup = () => {
    if (hb.pingTimer) clearInterval(hb.pingTimer);
    if (hb.pongTimer) clearTimeout(hb.pongTimer);
  };

  socket.on('disconnect', cleanup);
  return cleanup;
}

/**
 * Handle presenter disconnection with grace period.
 *
 * If the presenter reconnects within GRACE_MS, we notify others and restore authority.
 * If not, we optionally auto-promote the longest-serving viewer.
 */
const GRACE_MS = 15_000; // 15 seconds

// presenterGraceTimers: sessionId → timer (in-memory, restarts on server restart)
const presenterGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function startPresenterGrace(
  sessionId: string,
  presenterId: string,
  ns: Namespace,
  onGraceExpired: (sessionId: string, presenterId: string) => void
): void {
  // Clear any existing timer (e.g., rapid reconnect)
  const existing = presenterGraceTimers.get(sessionId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    presenterGraceTimers.delete(sessionId);

    const session = await roomManager.getSession(sessionId);
    if (!session || session.status === 'ended') return;

    // Still shows disconnected presenter — grace expired
    if (session.presenterId === presenterId) {
      logger.info({ sessionId, presenterId }, 'Presenter grace expired — notifying room');
      ns.to(`session:${sessionId}`).emit(
        'presenter:grace_expired' as never,
        {
          sessionId,
          presenterId,
        } as never
      );

      onGraceExpired(sessionId, presenterId);
    }
  }, GRACE_MS);

  presenterGraceTimers.set(sessionId, timer);
  logger.debug({ sessionId, presenterId, graceMs: GRACE_MS }, 'Presenter grace started');
}

export function cancelPresenterGrace(sessionId: string): void {
  const timer = presenterGraceTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    presenterGraceTimers.delete(sessionId);
    logger.debug({ sessionId }, 'Presenter grace cancelled (reconnected)');
  }
}
