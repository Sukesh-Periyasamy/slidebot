import type { Namespace, Socket } from 'socket.io';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@slidebot/shared-types';

import { logger } from '../../config/logger';
import { roomManager } from '../room-manager';
import { getPresenceColor } from '@slidebot/shared-utils';
import { attachHeartbeat } from '../heartbeat';
import { handleReconnect, initiatePresenterGrace } from '../reconnect-handler';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PresenterSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type PresenterNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

// Extended events specific to presenter namespace
// (These supplement the shared types with session-specific events)
interface PresenterClientEvents {
  'session:create': (
    payload: {
      deckId: string;
      totalSlides: number;
    },
    ack: (res: SessionAckResponse) => void
  ) => void;

  'session:join': (
    payload: {
      sessionId?: string;
      deckId: string;
    },
    ack: (res: SessionAckResponse) => void
  ) => void;

  'session:end': (payload: { sessionId: string }) => void;

  'slide:goto': (payload: {
    sessionId: string;
    slideIndex: number;
    sequenceNum: number; // Client's last known sequence
  }) => void;

  'presenter:handoff': (payload: {
    sessionId: string;
    toUserId: string;
    toUserName: string;
  }) => void;

  'viewer:explore': (payload: { sessionId: string }) => void;
  'viewer:follow': (payload: { sessionId: string }) => void;
}

interface SessionAckResponse {
  ok: boolean;
  error?: string;
  session?: SessionPayload;
  members?: MemberPayload[];
  isPresenter?: boolean;
}

interface SessionPayload {
  sessionId: string;
  deckId: string;
  presenterId: string;
  presenterName: string;
  currentSlide: number;
  totalSlides: number;
  sequenceNum: number;
  status: string;
}

interface MemberPayload {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  role: 'presenter' | 'viewer';
  isExploring: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Presenter Namespace handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * registerPresenterHandlers — registers all /presenter namespace handlers.
 *
 * Handles:
 * - Session create / join
 * - Slide navigation (presenter only)
 * - Presenter handoff
 * - Exploration mode toggle
 * - Reconnection recovery (full state on join)
 */
export function registerPresenterHandlers(ns: PresenterNamespace): void {
  // Use type cast to handle extended events
  ns.on('connection', (socket: PresenterSocket) => {
    const extSocket = socket as unknown as {
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      to: (room: string) => { emit: (event: string, payload: unknown) => void };
      join: (room: string) => Promise<void>;
      leave: (room: string) => Promise<void>;
      emit: (event: string, payload: unknown) => void;
    };

    const { userId, displayName, avatarUrl, color } = socket.data;
    logger.info({ userId, socketId: socket.id }, 'User connected to /presenter');

    // Attach application-level heartbeat (supplements Socket.IO's built-in)
    attachHeartbeat(socket, { namespace: '/presenter', userId });

    // ── session:create ────────────────────────────────────────────────────
    extSocket.on('session:create', async (payload: unknown, ack: unknown) => {
      const { deckId, totalSlides } = payload as { deckId: string; totalSlides: number };
      const callback = ack as (res: SessionAckResponse) => void;

      try {
        // Check if deck already has an active session
        const existing = await roomManager.getActiveSessionForDeck(deckId);
        if (existing && existing.status === 'active') {
          // Join the existing session instead
          await handleJoinSession(
            extSocket,
            userId,
            displayName,
            avatarUrl,
            color,
            existing.sessionId
          );
          const members = await roomManager.getMembers(existing.sessionId);
          callback({
            ok: true,
            session: existing,
            members: members.map(toMemberPayload),
            isPresenter: existing.presenterId === userId,
          });
          return;
        }

        // Create new session
        const session = await roomManager.createSession(
          deckId,
          { userId, displayName },
          totalSlides
        );

        await roomManager.addMember(session.sessionId, {
          userId,
          displayName,
          avatarUrl,
          color,
          role: 'presenter',
          isExploring: false,
          joinedAt: Date.now(),
        });

        await extSocket.join(`session:${session.sessionId}`);

        // Update socket data
        socket.data.currentDeckId = deckId;
        socket.data.currentSessionId = session.sessionId;

        callback({ ok: true, session, members: [], isPresenter: true });

        logger.info({ sessionId: session.sessionId, userId }, 'Session created');
      } catch (err) {
        logger.error({ err }, 'session:create error');
        callback({ ok: false, error: 'Failed to create session' });
      }
    });

    // ── session:join ──────────────────────────────────────────────────────
    extSocket.on('session:join', async (payload: unknown, ack: unknown) => {
      const { sessionId, deckId } = payload as { sessionId?: string; deckId: string };
      const callback = ack as (res: SessionAckResponse) => void;

      try {
        // Find session by sessionId or by deckId
        let targetSessionId = sessionId;
        if (!targetSessionId) {
          const active = await roomManager.getActiveSessionForDeck(deckId);
          targetSessionId = active?.sessionId;
        }

        if (!targetSessionId) {
          callback({ ok: false, error: 'No active session found for this deck' });
          return;
        }

        const result = await handleReconnect(
          ns,
          extSocket.id,
          userId,
          displayName,
          avatarUrl,
          color,
          targetSessionId
        );

        if (!result.restored || !result.session) {
          callback({ ok: false, error: 'Session not found or ended' });
          return;
        }

        await extSocket.join(`session:${targetSessionId}`);
        if ((extSocket as any).data) {
          (extSocket as any).data.currentDeckId = deckId;
          (extSocket as any).data.currentSessionId = targetSessionId;
        }

        callback({
          ok: true,
          session: result.session as any,
          members: result.members as any,
          isPresenter: result.wasPresenter,
        });
      } catch (err) {
        logger.error({ err }, 'session:join error');
        callback({ ok: false, error: 'Failed to join session' });
      }
    });

    // ── slide:goto ────────────────────────────────────────────────────────
    extSocket.on('slide:goto', async (payload: unknown) => {
      const {
        sessionId,
        slideIndex,
        sequenceNum: clientSeq,
      } = payload as {
        sessionId: string;
        slideIndex: number;
        sequenceNum: number;
      };

      try {
        const result = await roomManager.changeSlide(sessionId, userId, slideIndex);

        if (!result) {
          // Not authorized or session not found
          socket.emit('error', {
            code: 'FORBIDDEN',
            message: 'Only the presenter can change slides',
          });
          return;
        }

        const { session, sequenceNum } = result;

        // Broadcast to ALL in room (including sender for confirmation)
        ns.to(`session:${sessionId}`).emit(
          'slide:changed' as never,
          {
            sessionId,
            slideIndex: session.currentSlide,
            presenterId: session.presenterId,
            sequenceNum,
            serverTimestamp: Date.now(),
          } as never
        );

        logger.debug({ sessionId, slideIndex: session.currentSlide, sequenceNum }, 'Slide changed');
      } catch (err) {
        logger.error({ err }, 'slide:goto error');
      }
    });

    // ── presenter:handoff ─────────────────────────────────────────────────
    extSocket.on('presenter:handoff', async (payload: unknown) => {
      const { sessionId, toUserId, toUserName } = payload as {
        sessionId: string;
        toUserId: string;
        toUserName: string;
      };

      try {
        const session = await roomManager.handoffPresenter(sessionId, userId, toUserId, toUserName);

        if (!session) {
          socket.emit('error', {
            code: 'FORBIDDEN',
            message: 'Only the current presenter can hand off',
          });
          return;
        }

        // Broadcast handoff to all participants
        ns.to(`session:${sessionId}`).emit(
          'presenter:changed' as never,
          {
            sessionId,
            newPresenterId: toUserId,
            newPresenterName: toUserName,
            previousPresenterId: userId,
          } as never
        );

        logger.info({ sessionId, from: userId, to: toUserId }, 'Presenter handoff');
      } catch (err) {
        logger.error({ err }, 'presenter:handoff error');
      }
    });

    // ── viewer:explore ────────────────────────────────────────────────────
    extSocket.on('viewer:explore', async (payload: unknown) => {
      const { sessionId } = payload as { sessionId: string };
      await roomManager.setExplorationMode(sessionId, userId, true);

      // Notify others (for presence UI)
      extSocket.to(`session:${sessionId}`).emit('viewer:exploring' as never, { userId } as never);

      logger.debug({ sessionId, userId }, 'Viewer entered exploration mode');
    });

    // ── viewer:follow ─────────────────────────────────────────────────────
    extSocket.on('viewer:follow', async (payload: unknown) => {
      const { sessionId } = payload as { sessionId: string };
      await roomManager.setExplorationMode(sessionId, userId, false);

      // Send current slide so viewer snaps back immediately
      const session = await roomManager.getSession(sessionId);
      if (session) {
        socket.emit(
          'slide:changed' as never,
          {
            sessionId,
            slideIndex: session.currentSlide,
            presenterId: session.presenterId,
            sequenceNum: session.sequenceNum,
            serverTimestamp: Date.now(),
            isSnapback: true, // Client uses this to skip transition animation
          } as never
        );
      }

      logger.debug({ sessionId, userId }, 'Viewer followed presenter');
    });

    // ── session:end ───────────────────────────────────────────────────────
    extSocket.on('session:end', async (payload: unknown) => {
      const { sessionId } = payload as { sessionId: string };

      const session = await roomManager.getSession(sessionId);
      if (!session || session.presenterId !== userId) return;

      await roomManager.endSession(sessionId);

      ns.to(`session:${sessionId}`).emit(
        'session:ended' as never,
        {
          sessionId,
          endedBy: userId,
        } as never
      );

      logger.info({ sessionId, userId }, 'Session ended by presenter');
    });

    // ── disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      logger.info({ userId, reason }, 'User disconnected from /presenter');

      // Find any active sessions this user was in
      let rooms = Array.from(socket.rooms).filter((r) => r.startsWith('session:'));
      if (rooms.length === 0 && socket.data.currentSessionId) {
        rooms = [`session:${socket.data.currentSessionId}`];
      }

      for (const room of rooms) {
        const sessionId = room.replace('session:', '');

        // Check if presenter disconnected BEFORE removing member
        const session = await roomManager.getSession(sessionId);
        const wasPresenter = session && session.presenterId === userId;

        // Only remove if truly gone (not just reconnecting)
        // We keep member for grace period so reconnect can restore cleanly
        if (!wasPresenter) {
          await roomManager.removeMember(sessionId, userId);
          ns.to(room).emit(
            'participant:left' as never,
            {
              sessionId,
              userId,
              displayName,
            } as never
          );
        } else {
          // Presenter disconnected — start grace period
          // Don't remove member yet; they may reconnect within GRACE_MS
          ns.to(room).emit(
            'presenter:disconnected' as never,
            {
              sessionId,
              presenterId: userId,
            } as never
          );

          // Grace period: if presenter doesn't return in 15s, notify room
          initiatePresenterGrace(sessionId, userId, ns);

          logger.info({ sessionId, userId }, 'Presenter disconnected — grace period started');
        }
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function handleJoinSession(
  socket: {
    join: (room: string) => Promise<void>;
    to: (room: string) => { emit: (e: string, p: unknown) => void };
  },
  userId: string,
  displayName: string,
  avatarUrl: string | null,
  color: string,
  sessionId: string
) {
  const session = await roomManager.getSession(sessionId);
  if (!session || session.status === 'ended') return null;

  const isPresenter = session.presenterId === userId;

  await roomManager.addMember(sessionId, {
    userId,
    displayName,
    avatarUrl,
    color,
    role: isPresenter ? 'presenter' : 'viewer',
    isExploring: false,
    joinedAt: Date.now(),
  });

  await socket.join(`session:${sessionId}`);
  if ((socket as any).data) {
    (socket as any).data.currentSessionId = sessionId;
  }

  // Notify existing members
  socket.to(`session:${sessionId}`).emit('participant:joined', {
    sessionId,
    member: {
      userId,
      displayName,
      avatarUrl,
      color,
      role: isPresenter ? 'presenter' : 'viewer',
      isExploring: false,
    },
  });

  return session;
}

function toMemberPayload(m: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  role: 'presenter' | 'viewer';
  isExploring: boolean;
}): MemberPayload {
  return {
    userId: m.userId,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
    color: m.color,
    role: m.role,
    isExploring: m.isExploring,
  };
}
