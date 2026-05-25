/**
 * useAnnotationPersistence
 *
 * Handles saving annotations to the REST API with:
 * - Debounced saves (300ms) — avoids DB hammering during rapid annotation_end events
 * - Retry queue — failed saves are retried on next opportunity
 * - Optimistic UI — annotation is already in store from real-time; this just persists it
 * - Idempotent — uses annotation ID as upsert key (safe to call multiple times)
 *
 * This hook is the "write" side. See useAnnotationRestore for the "read" side.
 */

import { useCallback, useEffect, useRef } from 'react';

import { apiClient } from '@/lib/apiClient';
import { logger } from '@/lib/logger';
import { useSyncStore } from '@/features/sync/store/syncStore';
import type { Annotation } from '../types/annotation.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PendingSave {
  annotation: Annotation;
  sessionId?: string;
  retries: number;
  scheduledAt: number;
}

interface UseAnnotationPersistenceOptions {
  sessionId: string | null;
  /** Max retries before giving up on a save (default 3) */
  maxRetries?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAnnotationPersistence({
  sessionId,
  maxRetries = 3,
}: UseAnnotationPersistenceOptions) {
  // Queue of annotations pending save
  const saveQueueRef = useRef<Map<string, PendingSave>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);

  // ── Flush queue ──────────────────────────────────────────────────────────

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    const queue = saveQueueRef.current;
    if (queue.size === 0) return;

    flushingRef.current = true;
    const batch = Array.from(queue.values());
    // Don't clear queue yet — we'll remove individual entries on success

    await Promise.allSettled(
      batch.map(async (entry) => {
        if (entry.annotation.isEphemeral) {
          // Ephemeral (laser) — never persist
          queue.delete(entry.annotation.id);
          return;
        }

        try {
          await apiClient.post('/annotations', {
            id: entry.annotation.id,
            slideId: entry.annotation.slideId,
            sessionId: sessionId ?? entry.sessionId,
            tool: entry.annotation.data.tool,
            color: entry.annotation.color,
            strokeWidth: entry.annotation.strokeWidth,
            opacity: entry.annotation.opacity,
            data: entry.annotation.data,
            isEphemeral: false,
          });

          queue.delete(entry.annotation.id);
        } catch (err) {
          const next: PendingSave = {
            ...entry,
            retries: entry.retries + 1,
          };

          if (next.retries >= maxRetries) {
            logger.warn(
              { annotationId: entry.annotation.id, retries: next.retries },
              'Annotation save failed after max retries — dropping'
            );
            queue.delete(entry.annotation.id);
          } else {
            queue.set(entry.annotation.id, next);
            logger.debug(
              { annotationId: entry.annotation.id, retries: next.retries },
              'Annotation save failed — will retry'
            );
          }
        }
      })
    );

    flushingRef.current = false;

    // Schedule another flush if retries remain (back-off)
    if (queue.size > 0) {
      if (typeof window !== 'undefined') {
        window.setTimeout(() => void flush(), 2000);
      }
    }
  }, [sessionId, maxRetries]);

  // ── Schedule debounced flush ──────────────────────────────────────────────

  const scheduleFlush = useCallback(
    (delay = 300) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, delay);
    },
    [flush]
  );

  // ── Enqueue an annotation save ────────────────────────────────────────────

  const enqueueSave = useCallback(
    (annotation: Annotation) => {
      if (annotation.isEphemeral) return; // Never queue ephemeral annotations

      saveQueueRef.current.set(annotation.id, {
        annotation,
        sessionId: useSyncStore.getState().session?.sessionId ?? '',
        retries: 0,
        scheduledAt: Date.now() + 500, // Debounce 500ms
      });

      scheduleFlush(300);
    },
    [scheduleFlush]
  );

  // ── Enqueue a delete ──────────────────────────────────────────────────────

  const enqueueDelete = useCallback(async (annotationId: string) => {
    // Delete is time-sensitive — fire immediately (no debounce)
    try {
      await apiClient.delete(`/annotations/${annotationId}`);
    } catch (err) {
      logger.warn({ annotationId }, 'Failed to delete annotation from DB');
    }
  }, []);

  // ── Flush on unmount (don't lose pending saves) ───────────────────────────

  useEffect(() => {
    const currentQueue = saveQueueRef.current;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      // Best-effort flush on unmount (fire-and-forget)
      if (currentQueue.size > 0) {
        void flush();
      }
    };
  }, [flush]);

  // ── Flush on tab visibility change (before user navigates away) ───────────

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && saveQueueRef.current.size > 0) {
        void flush();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [flush]);

  return {
    enqueueSave,
    enqueueDelete,
    pendingCount: saveQueueRef.current.size,
  };
}
