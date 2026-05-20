import type { Namespace, Socket } from 'socket.io';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@slidebot/shared-types';
import { ROOMS } from '@slidebot/shared-types';

import { logger } from '../../config/logger';

type CollabSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type CollabNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Register all /collaboration namespace event handlers.
 * Each connected socket gets its own set of handlers bound via closure.
 */
export function registerCollaborationHandlers(ns: CollabNamespace): void {
  ns.on('connection', (socket: CollabSocket) => {
    const { userId, displayName, avatarUrl, color } = socket.data;
    logger.info({ userId, socketId: socket.id }, 'User connected to /collaboration');

    // ── join_deck ───────────────────────────────────────────────────────────
    socket.on('join_deck', async ({ deckId, slideId }, ack) => {
      try {
        // TODO: Verify user has access to this deck (check DeckCollaborator or owner)
        const room = ROOMS.deck(deckId);
        await socket.join(room);

        socket.data.currentDeckId = deckId;
        socket.data.currentSlideId = slideId ?? null;

        // Notify existing users that someone joined
        socket.to(room).emit('user_joined', {
          user: {
            userId,
            displayName,
            avatarUrl,
            color,
            slideId: slideId ?? null,
            cursor: null,
            isActive: true,
            lastSeen: new Date().toISOString(),
          },
        });

        // TODO: Send full presence list to the joining user
        // TODO: Send Yjs document state to the joining user

        ack?.({ ok: true });
        logger.debug({ userId, deckId, room }, 'User joined deck room');
      } catch (err) {
        logger.error({ err, userId }, 'Error joining deck');
        ack?.({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to join deck' } });
      }
    });

    // ── leave_deck ──────────────────────────────────────────────────────────
    socket.on('leave_deck', async ({ deckId }) => {
      const room = ROOMS.deck(deckId);
      await socket.leave(room);
      socket.data.currentDeckId = null;
      socket.to(room).emit('user_left', { userId });
      logger.debug({ userId, deckId }, 'User left deck');
    });

    // ── cursor_move ─────────────────────────────────────────────────────────
    socket.on('cursor_move', ({ deckId, slideId, position }) => {
      // Broadcast cursor position to all other users in the deck room
      // NOTE: No DB write — ephemeral presence data only
      socket.to(ROOMS.deck(deckId)).emit('cursor_update', {
        userId,
        deckId,
        slideId,
        position,
      });
    });

    // ── yjs_update ──────────────────────────────────────────────────────────
    socket.on('yjs_update', ({ deckId, update, origin }) => {
      // Broadcast Yjs CRDT update to all other users in the deck room
      // TODO: Debounce-persist Yjs snapshot to DB (500ms)
      socket.to(ROOMS.deck(deckId)).emit('yjs_update', { deckId, update, origin });
    });

    // ── yjs_sync_request ────────────────────────────────────────────────────
    socket.on('yjs_sync_request', async ({ deckId }, ack) => {
      // TODO: Fetch Yjs snapshot from DB and return full state
      ack?.({ ok: true, state: undefined });
    });

    // ── annotation_start ────────────────────────────────────────────────────
    socket.on('annotation_start', (payload) => {
      socket.to(ROOMS.deck(socket.data.currentDeckId ?? '')).emit('annotation_started', {
        ...payload,
        userId,
      });
    });

    // ── annotation_draw ─────────────────────────────────────────────────────
    socket.on('annotation_draw', (payload) => {
      socket.to(ROOMS.deck(socket.data.currentDeckId ?? '')).emit('annotation_drew', {
        ...payload,
        userId,
      });
    });

    // ── annotation_end ──────────────────────────────────────────────────────
    socket.on('annotation_end', async (payload) => {
      // TODO: If !isEphemeral, persist annotation to DB
      // TODO: Broadcast saved annotation to room
      logger.debug({ userId, annotationId: payload.annotationId }, 'Annotation ended');
    });

    // ── annotation_delete ───────────────────────────────────────────────────
    socket.on('annotation_delete', ({ slideId, annotationId }) => {
      // TODO: Delete from DB (verify ownership)
      socket.to(ROOMS.deck(socket.data.currentDeckId ?? '')).emit('annotation_deleted', {
        slideId,
        annotationId,
      });
    });

    // ── disconnect ──────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.info({ userId, reason }, 'User disconnected from /collaboration');

      if (socket.data.currentDeckId) {
        socket
          .to(ROOMS.deck(socket.data.currentDeckId))
          .emit('user_left', { userId });
      }
    });
  });
}
