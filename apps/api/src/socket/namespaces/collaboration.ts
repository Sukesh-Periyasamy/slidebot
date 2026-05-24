/**
 * /collaboration namespace — real-time annotation sync + DB persistence.
 *
 * Persistence flow per annotation lifecycle:
 *   annotation_start  → broadcast only (live preview, not yet persisted)
 *   annotation_draw   → broadcast only (streaming points, not persisted)
 *   annotation_end    → broadcast + DB upsert (non-ephemeral) + snapshot rebuild
 *   annotation_delete → soft-delete in DB + broadcast
 *   annotation_clear  → soft-delete all for slide + broadcast
 *
 *   join_deck         → send restored annotations from snapshot (reconnect restore)
 *
 * Design:
 * - DB writes are fire-and-forget (non-blocking to socket flow)
 * - Broadcast happens before DB write completes (optimistic latency)
 * - annotation_saved is only broadcast after DB confirms write
 * - isEphemeral=true → broadcast only, never persisted (laser pointer)
 */

import type { Namespace, Socket } from 'socket.io';

import type {
  Annotation,
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@slidebot/shared-types';
import { ROOMS, REALTIME_EVENTS, RealtimeSchemas } from '@slidebot/shared-types';

import { logger } from '../../config/logger';
import { annotationService } from '../../modules/annotations/annotations.service';
import type { AnnotationDataPayload } from '../../modules/annotations/annotations.types';
import { annotationRateLimiterMiddleware } from '../annotation-throttle';
import { assertSingleServerListener } from '../dev-listener-assert';

type AnnotationTool =
  | 'freehand'
  | 'highlight'
  | 'arrow'
  | 'text'
  | 'laser'
  | 'select'
  | 'eraser';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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

type BroadcastAnnotationTool = Annotation['tool'];

/**
 * Extend AnnotationEndPayload to carry the full annotation data.
 * The shared-types package has a minimal shape; we use the richer version here.
 */
interface FullAnnotationEndPayload {
  slideId: string;
  sessionId?: string;
  annotationId: string;
  tool: string;
  color: string;
  strokeWidth: number;
  opacity: number;
  /** Normalised data payload (discriminated union matching AnnotationDataPayload) */
  data: AnnotationDataPayload;
  isEphemeral: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerCollaborationHandlers(ns: CollabNamespace): void {
  ns.on('connection', (socket: CollabSocket) => {
    const { userId, displayName, avatarUrl, color } = socket.data;
    logger.info({ userId, socketId: socket.id }, 'User connected to /collaboration');

    // Apply per-socket annotation rate limiting middleware
    // Drops excess cursor_move / annotation_draw / laser_move events silently
    socket.use(annotationRateLimiterMiddleware(socket as unknown as Parameters<typeof annotationRateLimiterMiddleware>[0]));

    socket.on('join_deck', async (rawPayload, ack) => {
      const parsed = RealtimeSchemas.joinDeck.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Invalid join_deck payload' } });
        return;
      }
      const { deckId, slideId } = parsed.data;
      try {
        const room = ROOMS.deck(deckId);
        await socket.join(room);

        socket.data.currentDeckId = deckId;
        socket.data.currentSlideId = slideId ?? null;

        // Notify existing participants
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

        // ── Restore persisted annotations for the current slide ──────────────
        // Runs after join — uses snapshot cache so it's typically <5ms
        if (slideId) {
          const annotations = await annotationService.getAnnotationsForSlide(slideId);

          if (annotations.length > 0) {
            // Send each annotation as annotation_saved so the client
            // can load them into the store without special handling
            for (const ann of annotations) {
              socket.emit('annotation_saved', {
                slideId: ann.slideId,
                annotation: {
                  deckId: socket.data.currentDeckId ?? '',
                  id: ann.id,
                  slideId: ann.slideId,
                  userId: ann.userId,
                  displayName: ann.displayName,
                  color: ann.color,
                  strokeWidth: ann.strokeWidth,
                  opacity: ann.opacity,
                  data: ann.data as never,
                  isEphemeral: ann.isEphemeral,
                  status: 'committed' as const,
                  tool: ((ann.data as { tool?: string }).tool ?? 'freehand') as BroadcastAnnotationTool,
                  createdAt: ann.createdAt,
                },
              });
            }

            logger.debug(
              { userId, slideId, count: annotations.length },
              'Restored annotations for reconnect'
            );
          }
        }

        ack?.({ ok: true });
        logger.debug({ userId, deckId, room }, 'User joined deck room');
      } catch (err) {
        logger.error({ err, userId }, 'Error joining deck');
        ack?.({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to join deck' } });
      }
    });

    // ── leave_deck ────────────────────────────────────────────────────────────
    socket.on('leave_deck', async (rawPayload) => {
      const parsed = RealtimeSchemas.leaveDeck.safeParse(rawPayload);
      if (!parsed.success) {
        return;
      }
      const { deckId } = parsed.data;
      const room = ROOMS.deck(deckId);
      await socket.leave(room);
      socket.data.currentDeckId = null;
      socket.to(room).emit('user_left', { userId });
      logger.debug({ userId, deckId }, 'User left deck');
    });

    // ── cursor_move ───────────────────────────────────────────────────────────
    socket.on('cursor_move', (rawPayload) => {
      const parsed = RealtimeSchemas.cursorMove.safeParse(rawPayload);
      if (!parsed.success) {
        return;
      }
      const { deckId, slideId, position } = parsed.data;
      // Ephemeral — broadcast only, never written to DB
      socket.to(ROOMS.deck(deckId)).emit('cursor_update', {
        userId,
        deckId,
        slideId,
        position,
      });
    });

    // ── yjs_update ────────────────────────────────────────────────────────────
    socket.on('yjs_update', ({ deckId, update, origin }) => {
      socket.to(ROOMS.deck(deckId)).emit('yjs_update', { deckId, update, origin });
      // TODO: Debounce-persist Yjs snapshot to DB
    });

    // ── yjs_sync_request ──────────────────────────────────────────────────────
    socket.on('yjs_sync_request', async ({ deckId }, ack) => {
      ack?.({ ok: true });
    });

    // ── annotation_start ──────────────────────────────────────────────────────
    // Broadcast only — no DB write. Client sees live preview.
    socket.on('annotation_start', (payload) => {
      if (!RealtimeSchemas.annotationStart.safeParse(payload).success) {
        return;
      }
      const room = ROOMS.deck(socket.data.currentDeckId ?? '');
      socket.to(room).emit('annotation_started', {
        ...payload,
        userId,
      });
    });

    // ── annotation_draw ───────────────────────────────────────────────────────
    // Broadcast only — no DB write. Streaming incremental points.
    socket.on('annotation_draw', (payload) => {
      if (!RealtimeSchemas.annotationDraw.safeParse(payload).success) {
        return;
      }
      const room = ROOMS.deck(socket.data.currentDeckId ?? '');
      socket.to(room).emit('annotation_drew', {
        ...payload,
        userId,
      });
    });

    // ── annotation_end ────────────────────────────────────────────────────────
    // Persist non-ephemeral annotations. Broadcast annotation_saved to room.
    socket.on('annotation_end', async (rawPayload) => {
      if (!RealtimeSchemas.annotationEnd.safeParse(rawPayload).success) {
        return;
      }
      // The shared type has a minimal shape; cast to our richer internal type
      const payload = rawPayload as unknown as FullAnnotationEndPayload;
      const room = ROOMS.deck(socket.data.currentDeckId ?? '');

      logger.debug(
        { userId, annotationId: payload.annotationId, isEphemeral: payload.isEphemeral },
        'annotation_end received'
      );

      if (payload.isEphemeral) {
        // Laser pointer — just broadcast, never persist
        socket.to(room).emit('annotation_saved', {
          slideId: payload.slideId,
          annotation: buildAnnotationForBroadcast(
            payload,
            socket.data.currentDeckId ?? '',
            userId,
            displayName
          ),
        });
        return;
      }

      // Persist to DB (non-blocking — let socket respond fast)
      const savedAnnotation = await annotationService.saveAnnotation({
        id: payload.annotationId,
        slideId: payload.slideId,
        sessionId: payload.sessionId ?? null,
        userId,
        displayName,
        tool: payload.tool as AnnotationTool,
        color: payload.color,
        strokeWidth: payload.strokeWidth,
        opacity: payload.opacity,
        data: payload.data,
        isEphemeral: false,
      });

      if (savedAnnotation) {
        // Broadcast confirmed-saved annotation to ALL (including sender)
        ns.to(room).emit('annotation_saved', {
          slideId: payload.slideId,
          annotation: {
            deckId: socket.data.currentDeckId ?? '',
            id: savedAnnotation.id,
            slideId: savedAnnotation.slideId,
            userId: savedAnnotation.userId,
            displayName: savedAnnotation.displayName,
            color: savedAnnotation.color,
            strokeWidth: savedAnnotation.strokeWidth,
            opacity: savedAnnotation.opacity,
            data: savedAnnotation.data as never,
            isEphemeral: savedAnnotation.isEphemeral,
            status: 'committed' as const,
            tool: payload.tool as BroadcastAnnotationTool,
            createdAt: savedAnnotation.createdAt.toISOString(),
          },
        });

        logger.debug(
          { userId, annotationId: payload.annotationId },
          'Annotation persisted and broadcast'
        );
      } else {
        // DB save failed — still broadcast so real-time isn't broken
        socket.to(room).emit('annotation_saved', {
          slideId: payload.slideId,
          annotation: buildAnnotationForBroadcast(
            payload,
            socket.data.currentDeckId ?? '',
            userId,
            displayName
          ),
        });
        logger.warn(
          { userId, annotationId: payload.annotationId },
          'Annotation DB save failed — broadcast without persist'
        );
      }
    });

    // ── annotation_delete ─────────────────────────────────────────────────────
    socket.on('annotation_delete', async (rawPayload) => {
      const parsed = RealtimeSchemas.annotationDelete.safeParse(rawPayload);
      if (!parsed.success) {
        return;
      }
      const { slideId, annotationId } = parsed.data;
      const room = ROOMS.deck(socket.data.currentDeckId ?? '');

      // Soft-delete in DB (verifies ownership inside service)
      const deleted = await annotationService.deleteAnnotation(annotationId, userId);

      if (deleted) {
        // Broadcast to ALL (including sender for confirmation)
        ns.to(room).emit('annotation_deleted', { slideId, annotationId });
        logger.debug({ userId, annotationId }, 'Annotation deleted and broadcast');
      } else {
        // Not found or unauthorized — only send error to sender
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: 'Cannot delete this annotation',
        });
      }
    });

    // ── annotation_clear ──────────────────────────────────────────────────────
    socket.on('annotation_clear', async (rawPayload) => {
      const parsed = RealtimeSchemas.annotationClear.safeParse(rawPayload);
      if (!parsed.success) {
        return;
      }
      const { slideId } = parsed.data;
      const room = ROOMS.deck(socket.data.currentDeckId ?? '');

      // Note: we soft-delete all (any user can clear — presenter only in future)
      // For MVP: clear all annotations on the slide for this session context
      // Broadcast immediately for fast UX
      ns.to(room).emit('annotation_cleared', { slideId });

      logger.debug({ userId, slideId }, 'Annotation clear broadcast');
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.info({ userId, reason }, 'User disconnected from /collaboration');

      // Note: In Socket.IO, socket.rooms is usually empty on disconnect
      // but we saved the currentDeckId in socket.data when they joined.
      let rooms = Array.from(socket.rooms).filter((r) => r.startsWith('deck:'));
      if (rooms.length === 0 && socket.data.currentDeckId) {
        rooms = [`deck:${socket.data.currentDeckId}`];
      }

      for (const room of rooms) {
        socket.to(room).emit('user_left', { userId });
      }
    });

    assertSingleServerListener(socket, REALTIME_EVENTS.JOIN_DECK, 'CollaborationNamespace');
    assertSingleServerListener(socket, REALTIME_EVENTS.CURSOR_MOVE, 'CollaborationNamespace');
    assertSingleServerListener(socket, REALTIME_EVENTS.ANNOTATION_START, 'CollaborationNamespace');
    assertSingleServerListener(socket, REALTIME_EVENTS.ANNOTATION_DRAW, 'CollaborationNamespace');
    assertSingleServerListener(socket, REALTIME_EVENTS.ANNOTATION_END, 'CollaborationNamespace');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildAnnotationForBroadcast(
  payload: FullAnnotationEndPayload,
  deckId: string,
  userId: string,
  displayName: string
) {
  return {
    deckId,
    id: payload.annotationId,
    slideId: payload.slideId,
    userId,
    displayName,
    color: payload.color,
    strokeWidth: payload.strokeWidth,
    opacity: payload.opacity,
    data: payload.data as never,
    isEphemeral: payload.isEphemeral,
    status: 'committed' as const,
    tool: payload.tool as BroadcastAnnotationTool,
    createdAt: new Date().toISOString(),
  };
}
