/**
 * snapshotManager.ts
 *
 * Annotation snapshot serializer, hydration, and reconnect restore path.
 *
 * Architecture position:
 *   snapshot → hydrate → replay deltas → resume realtime
 *
 * Responsibilities:
 * - Serialize the current annotation store state into a snapshot
 * - Hydrate a snapshot back into the annotation store
 * - Reconnect restore: hydrate snapshot then hand off to replayManager for deltas
 * - Stale snapshot cleanup (TTL-based)
 *
 * DO NOT:
 * - Restore entire canvas blindly (overwrite active optimistic strokes)
 * - Import React
 * - Subscribe to stores (write-only from here to stores)
 *
 * Guard invariant:
 *   Active optimistic strokes (activeStroke in annotationStore) are NEVER
 *   overwritten during hydration. Only committed annotations are restored.
 */

import { logger } from '@/lib/logger';
import type { Annotation } from '@/features/annotation/types/annotation.types';
import { useAnnotationStore } from '@/features/annotation/store/annotationStore';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SNAPSHOT_PREFIX = 'slidebot:snapshot';
const SNAPSHOT_TTL_MS = 30 * 60 * 1_000; // 30 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnotationSnapshot {
  /** Slide this snapshot belongs to */
  slideId: string;
  /** Room/session context — used to invalidate on room switch */
  roomId: string;
  /** Schema version for forward-compatibility */
  version: 'v1';
  /** Committed annotations only (not in-progress strokes) */
  annotations: Annotation[];
  /** Server sequence number at time of snapshot */
  lastSeq: number;
  /** Unix ms when this snapshot was created */
  capturedAt: number;
}

export interface HydrationResult {
  /** Number of annotations loaded into the store */
  loaded: number;
  /** True if the snapshot was stale and skipped */
  skipped: boolean;
  /** Reason for skipping (if skipped=true) */
  skipReason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────────────────────────────────────

function storageKey(slideId: string, roomId: string): string {
  return `${SNAPSHOT_PREFIX}:${roomId}:${slideId}`;
}

function writeSnapshot(snapshot: AnnotationSnapshot): void {
  try {
    localStorage.setItem(
      storageKey(snapshot.slideId, snapshot.roomId),
      JSON.stringify(snapshot)
    );
  } catch (err) {
    logger.warn('[SnapshotManager] Failed to persist snapshot', err);
  }
}

function readSnapshot(slideId: string, roomId: string): AnnotationSnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(slideId, roomId));
    if (!raw) return null;
    return JSON.parse(raw) as AnnotationSnapshot;
  } catch {
    return null;
  }
}

function deleteSnapshot(slideId: string, roomId: string): void {
  try {
    localStorage.removeItem(storageKey(slideId, roomId));
  } catch {
    // noop
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SnapshotManager
// ─────────────────────────────────────────────────────────────────────────────

class SnapshotManager {
  // ── Serialize ─────────────────────────────────────────────────────────────

  /**
   * Capture a snapshot of the current committed annotations for a slide.
   * Only committed annotations are included — never in-progress strokes.
   *
   * @param slideId  - Current slide ID
   * @param roomId   - Current room/session ID
   * @param lastSeq  - Server sequence number (for delta replay ordering)
   */
  capture(slideId: string, roomId: string, lastSeq: number): AnnotationSnapshot {
    const store = useAnnotationStore.getState();

    // Only committed annotations — never in-progress strokes
    const annotations = Object.values(store.annotations)
      .filter((a) => a.status === 'committed' && a.slideId === slideId)
      .map((a) => {
        // Compaction: Round coordinates to 4 decimal places to reduce JSON size
        if (a.data.tool === 'freehand' || (a.data as any).tool === 'laser') {
          const pts = (a.data as any).points as number[];
          if (pts) {
            return {
              ...a,
              data: {
                ...a.data,
                points: pts.map((p) => Math.round(p * 10000) / 10000),
              },
            };
          }
        }
        return a;
      });

    const snapshot: AnnotationSnapshot = {
      slideId,
      roomId,
      version: 'v1',
      annotations,
      lastSeq,
      capturedAt: Date.now(),
    };

    writeSnapshot(snapshot);

    logger.debug(
      { slideId, roomId, count: annotations.length, lastSeq },
      '[SnapshotManager] Snapshot captured'
    );

    return snapshot;
  }

  // ── Hydrate ───────────────────────────────────────────────────────────────

  /**
   * Hydrate a snapshot into the annotation store.
   *
   * Guards:
   * - Skips stale snapshots (older than SNAPSHOT_TTL_MS)
   * - Skips snapshots from a different room
   * - Never overwrites active optimistic strokes (activeStroke)
   * - Only loads committed annotations (status === 'committed')
   *
   * @param slideId - Slide to restore
   * @param roomId  - Expected room (validation — wrong room = skip)
   * @returns HydrationResult with count and skip reason if applicable
   */
  hydrate(slideId: string, roomId: string): HydrationResult {
    const snapshot = readSnapshot(slideId, roomId);

    if (!snapshot) {
      return { loaded: 0, skipped: true, skipReason: 'no_snapshot' };
    }

    // ── Stale check
    const age = Date.now() - snapshot.capturedAt;
    if (age > SNAPSHOT_TTL_MS) {
      logger.debug(
        { slideId, roomId, ageSec: Math.round(age / 1000) },
        '[SnapshotManager] Snapshot stale — skipping hydration'
      );
      deleteSnapshot(slideId, roomId);
      return { loaded: 0, skipped: true, skipReason: 'stale' };
    }

    // ── Room mismatch check
    if (snapshot.roomId !== roomId) {
      logger.warn(
        { snapshotRoomId: snapshot.roomId, currentRoomId: roomId },
        '[SnapshotManager] Snapshot room mismatch — skipping hydration'
      );
      return { loaded: 0, skipped: true, skipReason: 'room_mismatch' };
    }

    // ── Guard: preserve active optimistic stroke
    const store = useAnnotationStore.getState();
    const hasActiveStroke = store.activeStroke !== null;

    // Load committed annotations from snapshot, merging with existing store
    // (do not clobber existing annotations that arrived after the snapshot)
    const existingIds = new Set(Object.keys(store.annotations));
    const toLoad = snapshot.annotations.filter(
      (a) =>
        a.status === 'committed' &&
        !existingIds.has(a.id) // don't overwrite already-known annotations
    );

    if (toLoad.length > 0) {
      for (const annotation of toLoad) {
        store.addAnnotation(annotation);
      }
    }

    logger.debug(
      {
        slideId,
        roomId,
        loaded: toLoad.length,
        skippedExisting: snapshot.annotations.length - toLoad.length,
        hasActiveStroke,
        lastSeq: snapshot.lastSeq,
      },
      '[SnapshotManager] Snapshot hydrated'
    );

    return { loaded: toLoad.length, skipped: false };
  }

  // ── Reconnect restore ─────────────────────────────────────────────────────

  /**
   * Full reconnect restore path:
   *   snapshot → hydrate → replay deltas → resume realtime
   *
   * Steps:
   * 1. Hydrate persisted snapshot (committed annotations only)
   * 2. Return lastSeq from snapshot so caller can use it to filter delta replay
   *    (replayManager should only replay events with seq > lastSeq)
   *
   * The caller (sessionManager.recoverAfterReconnect) handles the
   * replayManager.replayAll() call after this returns.
   *
   * @param slideId - Current slide to restore
   * @param roomId  - Current room/session ID
   * @returns The lastSeq from the snapshot (0 if no snapshot), used to filter replay
   */
  restoreOnReconnect(slideId: string, roomId: string): number {
    const result = this.hydrate(slideId, roomId);

    if (result.skipped) {
      logger.debug(
        { slideId, roomId, reason: result.skipReason },
        '[SnapshotManager] Reconnect restore: snapshot skipped'
      );
      return 0;
    }

    const snapshot = readSnapshot(slideId, roomId);
    return snapshot?.lastSeq ?? 0;
  }

  // ── Stale cleanup ─────────────────────────────────────────────────────────

  /**
   * Remove all snapshots for a given room.
   * Call on intentional session end to avoid stale data on next join.
   */
  clearForRoom(roomId: string): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${SNAPSHOT_PREFIX}:${roomId}:`)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
      logger.debug({ roomId, cleared: keysToRemove.length }, '[SnapshotManager] Cleared snapshots for room');
    } catch {
      // noop — localStorage may not be available
    }
  }

  /**
   * Remove all snapshots older than SNAPSHOT_TTL_MS across all rooms.
   * Can be called periodically (e.g. on app init) to prevent storage bloat.
   */
  pruneStale(): void {
    try {
      const cutoff = Date.now() - SNAPSHOT_TTL_MS;
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(SNAPSHOT_PREFIX)) continue;
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const snap = JSON.parse(raw) as { capturedAt?: number };
          if (typeof snap.capturedAt === 'number' && snap.capturedAt < cutoff) {
            keysToRemove.push(key);
          }
        } catch {
          keysToRemove.push(key); // remove corrupt entries
        }
      }

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }

      if (keysToRemove.length > 0) {
        logger.debug({ pruned: keysToRemove.length }, '[SnapshotManager] Pruned stale snapshots');
      }
    } catch {
      // noop
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

export const snapshotManager = new SnapshotManager();
