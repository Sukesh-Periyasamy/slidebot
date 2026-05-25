/**
 * replayManager.ts
 *
 * Manages reconnect replay sequencing for annotation events.
 *
 * Architecture position:
 *   sessionManager
 *   → replayManager
 *   → socketManager
 *
 * Responsibilities:
 * - Queue replay events during disconnection
 * - Deduplicate replay packets by eventId
 * - Sequence-safe ordering (sort by seq before replay)
 * - Bounded replay cache (MAX_REPLAY_CACHE events)
 * - Replay ACK handling (remove from queue on ACK)
 * - Replay timeout cleanup (auto-expire stale queued events)
 * - Expose replay metrics for diagnostics
 *
 * DO NOT:
 * - Import React
 * - Subscribe to stores
 * - Flush replay from render paths
 *
 * Isolation invariant:
 *   replayManager never triggers renders; it calls socketManager.emit() directly.
 *   Stores are updated by socket event handlers in sessionManager.
 */

import type { Socket } from 'socket.io-client';
import { logger } from '@/lib/logger';
import { useRealtimeDebugStore } from '@/features/debug/store/realtimeDebugStore';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum events held in the replay cache. Oldest evicted when exceeded. */
const MAX_REPLAY_CACHE = 256;

/** Events older than this (ms) are considered stale and cleaned up on replay. */
const REPLAY_STALE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

/** Timeout for a single replay attempt before marking it timed out. */
const REPLAY_ACK_TIMEOUT_MS = 8_000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ReplayEvent {
  eventId: string;
  seq: number;
  event: string;       // socket event name (e.g. 'annotation_event')
  payload: unknown;    // Validated payload (already passed ingress validation)
  enqueuedAt: number;  // Unix ms — for stale TTL
}

export interface ReplayMetrics {
  /** Events currently in the replay cache */
  queued: number;
  /** Events dropped due to deduplication */
  deduped: number;
  /** Events successfully replayed to server */
  replayed: number;
  /** Events evicted due to stale TTL */
  timedOut: number;
  /** Events evicted because cache was full */
  evicted: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ReplayManager
// ─────────────────────────────────────────────────────────────────────────────

class ReplayManager {
  private cache: ReplayEvent[] = [];
  private dedupe = new Set<string>();
  private metrics: ReplayMetrics = {
    queued: 0,
    deduped: 0,
    replayed: 0,
    timedOut: 0,
    evicted: 0,
  };
  private ackTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ── Enqueue ───────────────────────────────────────────────────────────────

  /**
   * Enqueue an event for replay after reconnect.
   * Idempotent: duplicate eventIds are silently dropped.
   *
   * Call this BEFORE emitting to the socket (optimistic send).
   * The replay cache holds events in case the socket disconnects before ACK.
   */
  enqueue(event: string, payload: unknown, meta: { eventId: string; seq: number }): void {
    const { eventId, seq } = meta;

    if (this.dedupe.has(eventId)) {
      this.metrics.deduped++;
      return;
    }

    const entry: ReplayEvent = {
      eventId,
      seq,
      event,
      payload,
      enqueuedAt: Date.now(),
    };

    this.cache.push(entry);
    this.dedupe.add(eventId);
    this.metrics.queued++;

    // Enforce bounded cache — evict oldest
    if (this.cache.length > MAX_REPLAY_CACHE) {
      const evicted = this.cache.shift();
      if (evicted) {
        this.dedupe.delete(evicted.eventId);
        this.clearAckTimer(evicted.eventId);
        this.metrics.evicted++;
        this.metrics.queued = Math.max(0, this.metrics.queued - 1);
        
        if (import.meta.env.DEV) {
          useRealtimeDebugStore.getState().recordDroppedPacket();
        }
      }
    }

    this.syncDebugStore();
  }

  // ── ACK ───────────────────────────────────────────────────────────────────

  /**
   * Acknowledge an event by eventId — removes it from the replay cache.
   * Call this when the server confirms the event was processed.
   */
  acknowledge(eventId: string): void {
    const idx = this.cache.findIndex((e) => e.eventId === eventId);
    if (idx === -1) return;

    this.cache.splice(idx, 1);
    this.dedupe.delete(eventId);
    this.clearAckTimer(eventId);
    this.metrics.queued = Math.max(0, this.metrics.queued - 1);
    this.syncDebugStore();
  }

  // ── Replay ────────────────────────────────────────────────────────────────

  /**
   * Replay all cached events to the socket after reconnect.
   *
   * Events are:
   * 1. Stale TTL filtered (remove events older than REPLAY_STALE_TTL_MS)
   * 2. Sorted by seq number (sequence-safe ordering)
   * 3. Emitted in order with ACK timeout cleanup
   *
   * This is idempotent — if the socket disconnects mid-replay,
   * remaining events stay in the cache for the next replay call.
   */
  async replayAll(socket: Socket): Promise<void> {
    if (!socket.connected) {
      logger.warn('[ReplayManager] replayAll called but socket not connected');
      return;
    }

    // 1. Prune stale events
    this.pruneStale();

    if (this.cache.length === 0) {
      return;
    }

    // 2. Sort by sequence number (sequence-safe ordering)
    const sorted = [...this.cache].sort((a, b) => a.seq - b.seq);

    logger.debug(
      { count: sorted.length, seqRange: [sorted[0]?.seq, sorted[sorted.length - 1]?.seq] },
      '[ReplayManager] Starting replay'
    );

    // 3. Emit in sequence order
    for (const entry of sorted) {
      if (!socket.connected) {
        logger.warn('[ReplayManager] Socket disconnected mid-replay — pausing');
        break;
      }

      this.emitWithAckTimeout(socket, entry);
      this.metrics.replayed++;
    }
  }

  // ── Stale cleanup ─────────────────────────────────────────────────────────

  /**
   * Remove events older than REPLAY_STALE_TTL_MS.
   * Called automatically before each replay and can be called manually.
   */
  pruneStale(): void {
    const cutoff = Date.now() - REPLAY_STALE_TTL_MS;
    const before = this.cache.length;

    this.cache = this.cache.filter((e) => {
      if (e.enqueuedAt < cutoff) {
        this.dedupe.delete(e.eventId);
        this.clearAckTimer(e.eventId);
        return false;
      }
      return true;
    });

    const removed = before - this.cache.length;
    if (removed > 0) {
      this.metrics.timedOut += removed;
      this.metrics.queued = Math.max(0, this.metrics.queued - removed);
      logger.debug({ removed }, '[ReplayManager] Pruned stale replay events');
      this.syncDebugStore();
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  /**
   * Clear the entire replay cache.
   * Call on explicit session end (not on transient disconnects).
   */
  clear(): void {
    for (const eventId of this.dedupe) {
      this.clearAckTimer(eventId);
    }
    this.cache = [];
    this.dedupe.clear();
    this.metrics.queued = 0;
    this.syncDebugStore();
  }

  // ── Metrics ───────────────────────────────────────────────────────────────

  getMetrics(): Readonly<ReplayMetrics> {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      queued: 0,
      deduped: 0,
      replayed: 0,
      timedOut: 0,
      evicted: 0,
    };
  }

  /** Current count of events in the replay cache. */
  get size(): number {
    return this.cache.length;
  }

  // ── Debug ─────────────────────────────────────────────────────────────────

  private syncDebugStore(): void {
    if (import.meta.env.DEV) {
      useRealtimeDebugStore.getState().updateQueueDepth(this.cache.length);
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private emitWithAckTimeout(socket: Socket, entry: ReplayEvent): void {
    // Clear any existing timer for this eventId
    this.clearAckTimer(entry.eventId);

    socket.emit(entry.event, entry.payload);

    // Set ACK timeout — if not acknowledged within REPLAY_ACK_TIMEOUT_MS,
    // consider it timed out and evict from cache.
    const timer = setTimeout(() => {
      this.ackTimers.delete(entry.eventId);
      const idx = this.cache.findIndex((e) => e.eventId === entry.eventId);
      if (idx !== -1) {
        this.cache.splice(idx, 1);
        this.dedupe.delete(entry.eventId);
        this.metrics.timedOut++;
        this.metrics.queued = Math.max(0, this.metrics.queued - 1);
        logger.debug(
          { eventId: entry.eventId, seq: entry.seq },
          '[ReplayManager] ACK timeout — evicted replay event'
        );
        if (import.meta.env.DEV) {
          useRealtimeDebugStore.getState().recordDroppedPacket();
        }
        this.syncDebugStore();
      }
    }, REPLAY_ACK_TIMEOUT_MS);

    this.ackTimers.set(entry.eventId, timer);
  }

  private clearAckTimer(eventId: string): void {
    const timer = this.ackTimers.get(eventId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.ackTimers.delete(eventId);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

export const replayManager = new ReplayManager();
