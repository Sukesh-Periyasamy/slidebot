/**
 * useAnnotationRestore
 *
 * Handles restoring persisted annotations from the API on:
 * - Initial slide load
 * - Page refresh / reconnect
 * - Slide navigation (loads annotations for the new slide)
 *
 * Flow:
 *   1. Fetch annotations for slideId from GET /api/v1/annotations/slide/:slideId
 *   2. Load into annotationStore via loadAnnotations()
 *   3. Deduplicates vs already-loaded (prevents double-load on fast reconnect)
 *   4. Exposes loading / error state for the UI
 *
 * The server returns from an AnnotationSnapshot (O(1)) so this is very fast.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

import { apiClient, extractData } from '@/lib/apiClient';
import { logger } from '@/lib/logger';
import { useAnnotationStore } from '../store/annotationStore';
import type { Annotation } from '../types/annotation.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GetAnnotationsResponse {
  data: Annotation[];
  count: number;
}

type RestoreStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface UseAnnotationRestoreOptions {
  slideId: string | null;
  /** If false, skip fetch (e.g., presenter-only screens) */
  enabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAnnotationRestore({ slideId, enabled = true }: UseAnnotationRestoreOptions) {
  const [status, setStatus] = useState<RestoreStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const loadedSlidesRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const loadAnnotations = useAnnotationStore((s) => s.loadAnnotations);
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation);

  const restore = useCallback(
    async (sid: string, force = false) => {
      // Deduplicate: skip if already loaded (unless forced)
      if (!force && loadedSlidesRef.current.has(sid)) return;

      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('loading');
      setError(null);

      try {
        const response = await apiClient.get<GetAnnotationsResponse>(`/annotations/slide/${sid}`, {
          signal: controller.signal,
        });

        const annotations = extractData(response) as unknown as Annotation[];

        // Load into store (replaces current slide annotations)
        loadAnnotations(annotations);
        loadedSlidesRef.current.add(sid);

        setStatus('loaded');
        logger.debug({ slideId: sid, count: annotations.length }, 'Annotations restored from DB');
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'CanceledError') return; // Aborted — safe to ignore

        const message = err instanceof Error ? err.message : 'Failed to restore annotations';
        setError(message);
        setStatus('error');
        logger.error({ err, slideId: sid }, 'Failed to restore annotations');
      }
    },
    [loadAnnotations]
  );

  // ── Auto-restore on slideId change ────────────────────────────────────────

  useEffect(() => {
    if (!slideId || !enabled) return;

    void restore(slideId);

    return () => {
      abortRef.current?.abort();
    };
  }, [slideId, enabled, restore]);

  // ── Handle incoming annotation_saved from socket (real-time + reconnect) ──

  const receiveAnnotation = useCallback(
    (annotation: Annotation) => {
      // Upsert into store — handles both new and duplicate (reconnect replay)
      addAnnotation(annotation);
    },
    [addAnnotation]
  );

  return {
    status,
    isLoading: status === 'loading',
    isLoaded: status === 'loaded',
    isError: status === 'error',
    error,
    /** Force re-fetch from server (e.g., after reconnect) */
    refetch: (sid: string) => restore(sid, true),
    /** Merge a single annotation from socket into the store */
    receiveAnnotation,
  };
}
