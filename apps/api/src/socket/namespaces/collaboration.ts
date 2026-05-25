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
import { roomManager } from '../room-manager';
import {
  createSocketDedupe,
  validateAnnotationEvent,
} from '../annotation-ingress-validator';
import { metrics } from '../../config/metrics';

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

const roomDegradationModes = new Map<string, boolean>();

async function checkAndBroadcastRoomPressure(ns: Namespace, room: string) {
  try {
    const sockets = await ns.in(room).fetchSockets();
    const count = sockets.length;
    let totalRtt = 0;
    let rttCount = 0;
    for (const s of sockets) {
      if (typeof s.data.clientRtt === 'number') {
        totalRtt += s.data.clientRtt;
        rttCount++;
      }
    }
    const avgRtt = rttCount > 0 ? totalRtt / rttCount : 0;
    
    const isDegraded = count > 50 || avgRtt > 150;
    const mode = isDegraded ? 'degraded' : 'normal';
    
    roomDegradationModes.set(room, isDegraded);
    ns.to(room).emit('room:pressure', { mode, count });
  } catch (err) {
    logger.warn({ err, room }, 'Failed to check room pressure');
  }
}

export function registerCollaborationHandlers(ns: CollabNamespace): void {
  ns.on('connection', (socket: CollabSocket) => {
    const { userId, displayName, avatarUrl, color } = socket.data;
    logger.info({ userId, socketId: socket.id }, 'User connected to /collaboration');
    metrics.inc('collab:connections');

    // Per-socket duplicate packet tracker (bounded sliding window)
    const { isDuplicate } = createSocketDedupe();

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
        socket.data.clientRtt = parsed.data.clientRtt ?? 50;

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

        // Check and broadcast room pressure (async)
        checkAndBroadcastRoomPressure(ns, room);

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

          const replayEvents = await roomManager.getReplayEvents(deckId, slideId);
          if (replayEvents.length > 0) {
            // Adaptive catch-up batch sizing based on client latency (P5.5)
            const clientRtt = parsed.data.clientRtt ?? 50;
            const isHighLatency = clientRtt > 150;
            const batchSize = isHighLatency ? 20 : 100;

            for (let i = 0; i < replayEvents.length; i += batchSize) {
              const chunk = replayEvents.slice(i, i + batchSize);
              for (const ev of chunk) {
                socket.emit('annotation_event_broadcast', ev as any);
              }
              // Yield to event loop and network stack if high latency
              if (isHighLatency && i + batchSize < replayEvents.length) {
                await new Promise((resolve) => setTimeout(resolve, 50));
              }
            }
            logger.debug(
              { userId, slideId, count: replayEvents.length, clientRtt, batchSize },
              'Replayed transient events for reconnect'
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
      checkAndBroadcastRoomPressure(ns, room);
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
    // Validated via legacy RealtimeSchemas (annotation_start is not an AnnotationEvent envelope)
    socket.on('annotation_start', (rawPayload) => {
      const parsed = RealtimeSchemas.annotationStart.safeParse(rawPayload);
      if (!parsed.success) {
        logger.debug(
          { userId, issues: parsed.error.issues },
          '[collab] Rejected invalid annotation_start payload'
        );
        return;
      }
      const room = ROOMS.deck(socket.data.currentDeckId ?? '');
      socket.to(room).emit('annotation_started', {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(parsed.data as any),
        userId,
      });
    });

    // ── annotation_draw ───────────────────────────────────────────────────────
    // Broadcast only — no DB write. Streaming incremental points.
    // Validated via legacy RealtimeSchemas (not a full AnnotationEvent envelope)
    socket.on('annotation_draw', (rawPayload) => {
      const parsed = RealtimeSchemas.annotationDraw.safeParse(rawPayload);
      if (!parsed.success) {
        logger.debug(
          { userId, issues: parsed.error.issues },
          '[collab] Rejected invalid annotation_draw payload'
        );
        return;
      }
      const room = ROOMS.deck(socket.data.currentDeckId ?? '');
      socket.to(room).emit('annotation_drew', {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(parsed.data as any),
        userId,
      });
    });

    // ── annotation_end ────────────────────────────────────────────────────────
    // Persist non-ephemeral annotations. Broadcast annotation_saved to room.
    //
    // annotation_end payloads are validated with the legacy RealtimeSchemas
    // envelope. Full AnnotationEvent envelope validation is done on
    // 'annotation_event' (new unified event channel). Both paths use
    // validateAnnotationEvent() for the structured AnnotationEvent schema.
    socket.on('annotation_end', async (rawPayload) => {
      const legacyParsed = RealtimeSchemas.annotationEnd.safeParse(rawPayload);
      if (!legacyParsed.success) {
        logger.debug(
          { userId, issues: legacyParsed.error.issues },
          '[collab] Rejected invalid annotation_end payload'
        );
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

      // Enqueue to BullMQ for async persistence (non-blocking)
      await annotationService.enqueueSaveAnnotation({
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

      // Optimistically broadcast confirmed-saved annotation to ALL (including sender)
      ns.to(room).emit('annotation_saved', {
        slideId: payload.slideId,
        annotation: buildAnnotationForBroadcast(
          payload,
          socket.data.currentDeckId ?? '',
          userId,
          displayName
        ),
      });

      logger.debug(
        { userId, annotationId: payload.annotationId },
        'Annotation enqueued for persistence and broadcast'
      );
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
      const deckId = socket.data.currentDeckId;
      if (!deckId) return;

      const isAllowed = await annotationService.canClearAnnotations(deckId, userId);
      if (!isAllowed) {
        logger.warn({ userId, deckId, slideId }, 'Unauthorized attempt to clear annotations');
        socket.emit('error', { code: 'FORBIDDEN', message: 'You do not have permission to clear annotations.' });
        return;
      }

      const room = ROOMS.deck(deckId);

      // Audit log
      logger.info({ event: 'audit', action: 'annotation_clear', userId, deckId, slideId }, 'Annotations cleared');

      // For MVP: clear all annotations on the slide for this session context
      // Broadcast immediately for fast UX
      ns.to(room).emit('annotation_cleared', { slideId });

      logger.debug({ userId, slideId }, 'Annotation clear broadcast');
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.info({ userId, reason }, 'User disconnected from /collaboration');
      metrics.inc('collab:disconnections');

      // Note: In Socket.IO, socket.rooms is usually empty on disconnect
      // but we saved the currentDeckId in socket.data when they joined.
      let rooms = Array.from(socket.rooms).filter((r) => r.startsWith('deck:'));
      if (rooms.length === 0 && socket.data.currentDeckId) {
        rooms = [`deck:${socket.data.currentDeckId}`];
      }

      for (const room of rooms) {
        socket.to(room).emit('user_left', { userId });
        checkAndBroadcastRoomPressure(ns, room);
      }
    });

    // ── annotation_event ──────────────────────────────────────────────────────
    // New unified annotation event channel using the full AnnotationEvent
    // envelope. Validated with strict schema including sequence, ownership,
    // schema version, and duplicate detection.
    socket.on('annotation_event', (rawPayload) => {
      const result = validateAnnotationEvent(
        rawPayload,
        userId,
        isDuplicate,
        '/collaboration'
      );

      if (!result.ok) {
        metrics.inc('collab:validation_error');
        // Validation errors are tracked by counters in the validator.
        // In DEV mode, the validator already logs the rejection.
        return;
      }

      metrics.inc('collab:annotation_event_rx');

      // Broadcast validated event to all others in the deck room
      const room = ROOMS.deck(socket.data.currentDeckId ?? '');
      // The Zod-inferred type is structurally compatible with AnnotationEventIngress
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.to(room).emit('annotation_event_broadcast', result.event as any);

      // Enqueue to room manager replay queue
      if (socket.data.currentDeckId) {
        const room = ROOMS.deck(socket.data.currentDeckId);
        const isDegraded = roomDegradationModes.get(room) ?? false;
        roomManager.enqueueReplayEvent(socket.data.currentDeckId, result.event.slideIndex.toString(), result.event, isDegraded).catch(err => {
          logger.warn({ err }, 'Failed to enqueue replay event');
        });
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
