/**
 * replayManager.test.ts
 *
 * Unit tests for the replay manager:
 * - Enqueue deduplication
 * - Sequence ordering
 * - Bounded cache eviction
 * - Replay timeout cleanup (ACK timeout)
 * - ACK handling (acknowledge removes from cache)
 * - stale TTL pruning
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock the logger before importing replayManager
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Import after mock (static import hoisted after vi.mock by vitest)
import { replayManager } from '../replayManager';


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeEvent(eventId: string, seq: number) {
  return { eventId, seq, payload: { data: 'test' }, event: 'annotation_event' };
}

function makeSocket(connected = true) {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  return {
    connected,
    emit: vi.fn((event: string, payload: unknown) => {
      emitted.push({ event, payload });
    }),
    _emitted: emitted,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ReplayManager', () => {
  beforeEach(() => {
    replayManager.clear();
    replayManager.resetMetrics();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Enqueue ───────────────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('enqueues an event and tracks metrics', () => {
      replayManager.enqueue('annotation_event', { x: 1 }, { eventId: 'e1', seq: 1 });
      expect(replayManager.size).toBe(1);
      expect(replayManager.getMetrics().queued).toBe(1);
    });

    it('deduplicates by eventId — same eventId enqueued twice', () => {
      replayManager.enqueue('annotation_event', {}, { eventId: 'e1', seq: 1 });
      replayManager.enqueue('annotation_event', {}, { eventId: 'e1', seq: 1 });
      expect(replayManager.size).toBe(1);
      expect(replayManager.getMetrics().deduped).toBe(1);
    });

    it('allows different eventIds', () => {
      replayManager.enqueue('annotation_event', {}, { eventId: 'e1', seq: 1 });
      replayManager.enqueue('annotation_event', {}, { eventId: 'e2', seq: 2 });
      expect(replayManager.size).toBe(2);
    });
  });

  // ── Bounded cache ─────────────────────────────────────────────────────────

  describe('bounded cache', () => {
    it('evicts oldest event when cache exceeds 256', () => {
      // Fill to max (256 = MAX_REPLAY_CACHE from implementation)
      for (let i = 0; i < 256; i++) {
        replayManager.enqueue('annotation_event', {}, { eventId: `e${i}`, seq: i });
      }
      expect(replayManager.size).toBe(256);

      // Add one more — should evict e0
      replayManager.enqueue('annotation_event', {}, { eventId: 'e256', seq: 256 });
      expect(replayManager.size).toBe(256);
      expect(replayManager.getMetrics().evicted).toBe(1);
    });
  });

  // ── ACK handling ──────────────────────────────────────────────────────────

  describe('acknowledge', () => {
    it('removes acknowledged event from cache', () => {
      replayManager.enqueue('annotation_event', {}, { eventId: 'e1', seq: 1 });
      expect(replayManager.size).toBe(1);

      replayManager.acknowledge('e1');
      expect(replayManager.size).toBe(0);
    });

    it('is idempotent for unknown eventId', () => {
      expect(() => replayManager.acknowledge('unknown')).not.toThrow();
    });

    it('allows the same eventId to be re-enqueued after ACK', () => {
      replayManager.enqueue('annotation_event', {}, { eventId: 'e1', seq: 1 });
      replayManager.acknowledge('e1');
      // After ACK, eventId is removed from dedupe set — can enqueue again
      replayManager.enqueue('annotation_event', {}, { eventId: 'e1', seq: 2 });
      expect(replayManager.size).toBe(1);
    });
  });

  // ── Sequence ordering ─────────────────────────────────────────────────────

  describe('replayAll — sequence ordering', () => {
    it('emits events in ascending seq order', async () => {
      // Enqueue out of order
      replayManager.enqueue('annotation_event', { seq: 3 }, { eventId: 'e3', seq: 3 });
      replayManager.enqueue('annotation_event', { seq: 1 }, { eventId: 'e1', seq: 1 });
      replayManager.enqueue('annotation_event', { seq: 2 }, { eventId: 'e2', seq: 2 });

      const socket = makeSocket(true) as any;
      await replayManager.replayAll(socket);

      expect(socket.emit).toHaveBeenCalledTimes(3);
      const calls = socket.emit.mock.calls as [string, { seq: number }][];
      expect(calls[0]![1]).toEqual({ seq: 1 });
      expect(calls[1]![1]).toEqual({ seq: 2 });
      expect(calls[2]![1]).toEqual({ seq: 3 });
    });

    it('does not emit if socket is disconnected', async () => {
      replayManager.enqueue('annotation_event', {}, { eventId: 'e1', seq: 1 });
      const socket = makeSocket(false) as any;
      await replayManager.replayAll(socket);
      expect(socket.emit).not.toHaveBeenCalled();
    });
  });

  // ── Replay timeout (ACK timeout) ──────────────────────────────────────────

  describe('ACK timeout cleanup', () => {
    it('evicts event from cache after ACK timeout (8s)', async () => {
      replayManager.enqueue('annotation_event', {}, { eventId: 'e1', seq: 1 });
      const socket = makeSocket(true) as any;
      await replayManager.replayAll(socket);

      // Event should still be in cache (waiting for ACK)
      expect(replayManager.size).toBe(1);

      // Advance time past ACK timeout (8000ms)
      vi.advanceTimersByTime(8001);

      // Should have been evicted by timeout
      expect(replayManager.size).toBe(0);
      expect(replayManager.getMetrics().timedOut).toBe(1);
    });
  });

  // ── Stale TTL pruning ─────────────────────────────────────────────────────

  describe('pruneStale', () => {
    it('removes events older than 5 minutes', () => {
      replayManager.enqueue('annotation_event', {}, { eventId: 'e1', seq: 1 });
      replayManager.enqueue('annotation_event', {}, { eventId: 'e2', seq: 2 });

      // Advance time past stale TTL (5 minutes = 300,000ms)
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Add a fresh event
      replayManager.enqueue('annotation_event', {}, { eventId: 'e3', seq: 3 });

      replayManager.pruneStale();

      // Only the fresh event should remain
      expect(replayManager.size).toBe(1);
      expect(replayManager.getMetrics().timedOut).toBe(2);
    });

    it('does not remove recent events', () => {
      replayManager.enqueue('annotation_event', {}, { eventId: 'e1', seq: 1 });
      vi.advanceTimersByTime(1000); // 1 second — not stale
      replayManager.pruneStale();
      expect(replayManager.size).toBe(1);
    });
  });

  // ── Clear ─────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('empties the cache and dedupe set', () => {
      replayManager.enqueue('annotation_event', {}, { eventId: 'e1', seq: 1 });
      replayManager.enqueue('annotation_event', {}, { eventId: 'e2', seq: 2 });
      replayManager.clear();
      expect(replayManager.size).toBe(0);

      // After clear, same eventIds can be re-enqueued
      replayManager.enqueue('annotation_event', {}, { eventId: 'e1', seq: 1 });
      expect(replayManager.size).toBe(1);
    });
  });

  // ── Metrics ───────────────────────────────────────────────────────────────

  describe('metrics', () => {
    it('tracks queued, deduped, replayed, timedOut, evicted', async () => {
      replayManager.enqueue('annotation_event', {}, { eventId: 'e1', seq: 1 });
      replayManager.enqueue('annotation_event', {}, { eventId: 'e1', seq: 1 }); // dedup

      const socket = makeSocket(true) as any;
      await replayManager.replayAll(socket);

      vi.advanceTimersByTime(8001); // trigger ACK timeout

      const m = replayManager.getMetrics();
      expect(m.queued).toBe(0); // evicted by timeout
      expect(m.deduped).toBe(1);
      expect(m.replayed).toBe(1);
      expect(m.timedOut).toBe(1);
    });
  });
});
