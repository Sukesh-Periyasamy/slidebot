/**
 * annotationStore.cache.test.ts
 *
 * Tests for cache bounding behavior in annotationStore:
 * - annotations map is capped at MAX_ANNOTATIONS (500), oldest evicted
 * - liveStrokes map is capped at MAX_LIVE_STROKES (50), oldest evicted
 * - cursors map is capped at MAX_CURSORS (50), oldest evicted
 * - laserPointers map is capped at MAX_LASERS (50), oldest evicted
 * - Existing userId updates do NOT count as a new entry (no false evictions)
 * - undoStack is cleaned of evicted annotation IDs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must come before imports) ──────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import {
  useAnnotationStore,
  MAX_ANNOTATIONS,
  MAX_LIVE_STROKES,
  MAX_CURSORS,
  MAX_LASERS,
} from '../annotationStore';
import type {
  Annotation,
  LiveStroke,
  LiveCursor,
  LaserPointerState,
} from '../../types/annotation.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAnnotation(id: string): Annotation {
  return {
    id,
    slideId: 'slide-1',
    userId: 'user-test',
    displayName: 'Test',
    color: '#FF0000',
    strokeWidth: 2,
    opacity: 1,
    data: { tool: 'freehand', points: [0, 0, 1, 1] },
    isEphemeral: false,
    status: 'committed',
    createdAt: new Date().toISOString(),
  };
}

function makeLiveStroke(userId: string): LiveStroke {
  return {
    annotationId: `ann-${userId}`,
    userId,
    tool: 'freehand',
    color: '#00FF00',
    strokeWidth: 2,
    opacity: 1,
    points: [0, 0],
  };
}

function makeCursor(userId: string): LiveCursor {
  return {
    userId,
    displayName: userId,
    color: '#0000FF',
    position: { x: 0.5, y: 0.5 },
    lastSeen: Date.now(),
  };
}

function makeLaser(userId: string): LaserPointerState {
  return {
    userId,
    displayName: userId,
    color: '#FF00FF',
    trail: [{ x: 0.5, y: 0.5 }],
    lastSeen: Date.now(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AnnotationStore: Cache Bounding', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAnnotationStore.getState().clearAnnotations();
    // Clear all ephemeral caches
    useAnnotationStore.setState({
      liveStrokes: {},
      cursors: {},
      laserPointers: {},
    });
  });

  // ── Annotations ────────────────────────────────────────────────────────────

  describe(`annotations cache (MAX_ANNOTATIONS = ${MAX_ANNOTATIONS})`, () => {
    it('stores annotations up to the maximum', () => {
      const store = useAnnotationStore.getState();
      for (let i = 0; i < MAX_ANNOTATIONS; i++) {
        store.addAnnotation(makeAnnotation(`ann-${i}`));
      }
      const count = Object.keys(useAnnotationStore.getState().annotations).length;
      expect(count).toBe(MAX_ANNOTATIONS);
    });

    it('evicts the oldest annotation when MAX_ANNOTATIONS is exceeded', () => {
      const store = useAnnotationStore.getState();
      // Fill to max
      for (let i = 0; i < MAX_ANNOTATIONS; i++) {
        store.addAnnotation(makeAnnotation(`ann-${i}`));
      }
      // The first annotation should exist
      expect(useAnnotationStore.getState().annotations['ann-0']).toBeDefined();

      // Add one more — should evict ann-0
      store.addAnnotation(makeAnnotation('ann-overflow'));

      const state = useAnnotationStore.getState();
      expect(Object.keys(state.annotations).length).toBe(MAX_ANNOTATIONS);
      expect(state.annotations['ann-0']).toBeUndefined(); // evicted
      expect(state.annotations['ann-overflow']).toBeDefined(); // newest kept
    });

    it('removes evicted annotation ID from undoStack', () => {
      const store = useAnnotationStore.getState();

      // Add first annotation and simulate it being in the undo stack
      store.addAnnotation(makeAnnotation('undo-ann-0'));
      // Manually push to undo stack (simulating commitStroke path)
      useAnnotationStore.setState((s) => ({ undoStack: [...s.undoStack, 'undo-ann-0'] }));

      // Fill the rest to MAX
      for (let i = 1; i < MAX_ANNOTATIONS; i++) {
        store.addAnnotation(makeAnnotation(`ann-${i}`));
      }
      expect(useAnnotationStore.getState().undoStack).toContain('undo-ann-0');

      // Overflow — first entry (undo-ann-0) gets evicted
      store.addAnnotation(makeAnnotation('trigger-eviction'));

      expect(useAnnotationStore.getState().undoStack).not.toContain('undo-ann-0');
    });

    it('does not trigger eviction when count is below MAX', () => {
      const store = useAnnotationStore.getState();
      for (let i = 0; i < MAX_ANNOTATIONS - 2; i++) {
        store.addAnnotation(makeAnnotation(`ann-${i}`));
      }
      // Well below max — no eviction
      const countBefore = Object.keys(useAnnotationStore.getState().annotations).length;
      store.addAnnotation(makeAnnotation('safe-add'));
      const countAfter = Object.keys(useAnnotationStore.getState().annotations).length;
      expect(countAfter).toBe(countBefore + 1);
      expect(useAnnotationStore.getState().annotations['ann-0']).toBeDefined();
    });
  });

  // ── Live strokes ───────────────────────────────────────────────────────────

  describe(`liveStrokes cache (MAX_LIVE_STROKES = ${MAX_LIVE_STROKES})`, () => {
    it('stores live strokes up to the maximum', () => {
      const store = useAnnotationStore.getState();
      for (let i = 0; i < MAX_LIVE_STROKES; i++) {
        store.setLiveStroke(`user-${i}`, makeLiveStroke(`user-${i}`));
      }
      expect(Object.keys(useAnnotationStore.getState().liveStrokes).length).toBe(MAX_LIVE_STROKES);
    });

    it('evicts oldest live stroke when MAX_LIVE_STROKES exceeded by new user', () => {
      const store = useAnnotationStore.getState();
      for (let i = 0; i < MAX_LIVE_STROKES; i++) {
        store.setLiveStroke(`user-${i}`, makeLiveStroke(`user-${i}`));
      }
      expect(useAnnotationStore.getState().liveStrokes['user-0']).toBeDefined();

      // One more NEW user
      store.setLiveStroke('user-overflow', makeLiveStroke('user-overflow'));

      const state = useAnnotationStore.getState();
      expect(Object.keys(state.liveStrokes).length).toBe(MAX_LIVE_STROKES);
      expect(state.liveStrokes['user-0']).toBeUndefined(); // evicted
      expect(state.liveStrokes['user-overflow']).toBeDefined();
    });

    it('updating existing user does NOT trigger eviction', () => {
      const store = useAnnotationStore.getState();
      for (let i = 0; i < MAX_LIVE_STROKES; i++) {
        store.setLiveStroke(`user-${i}`, makeLiveStroke(`user-${i}`));
      }
      // Update user-0 (already exists) — should not evict anything
      const updated: LiveStroke = { ...makeLiveStroke('user-0'), color: '#FFFFFF' };
      store.setLiveStroke('user-0', updated);

      const state = useAnnotationStore.getState();
      expect(Object.keys(state.liveStrokes).length).toBe(MAX_LIVE_STROKES);
      // user-0 should still exist and be updated
      expect(state.liveStrokes['user-0']).toBeDefined();
      expect(state.liveStrokes['user-0']!.color).toBe('#FFFFFF');
    });
  });

  // ── Cursors ────────────────────────────────────────────────────────────────

  describe(`cursors cache (MAX_CURSORS = ${MAX_CURSORS})`, () => {
    it('stores cursors up to the maximum', () => {
      const store = useAnnotationStore.getState();
      for (let i = 0; i < MAX_CURSORS; i++) {
        store.updateCursor(`user-${i}`, makeCursor(`user-${i}`));
      }
      expect(Object.keys(useAnnotationStore.getState().cursors).length).toBe(MAX_CURSORS);
    });

    it('evicts oldest cursor when MAX_CURSORS exceeded by new user', () => {
      const store = useAnnotationStore.getState();
      for (let i = 0; i < MAX_CURSORS; i++) {
        store.updateCursor(`user-${i}`, makeCursor(`user-${i}`));
      }
      expect(useAnnotationStore.getState().cursors['user-0']).toBeDefined();

      store.updateCursor('user-overflow', makeCursor('user-overflow'));

      const state = useAnnotationStore.getState();
      expect(Object.keys(state.cursors).length).toBe(MAX_CURSORS);
      expect(state.cursors['user-0']).toBeUndefined();
      expect(state.cursors['user-overflow']).toBeDefined();
    });
  });

  // ── Laser pointers ─────────────────────────────────────────────────────────

  describe(`laserPointers cache (MAX_LASERS = ${MAX_LASERS})`, () => {
    it('stores laser pointers up to the maximum', () => {
      const store = useAnnotationStore.getState();
      for (let i = 0; i < MAX_LASERS; i++) {
        store.updateLaser(`user-${i}`, makeLaser(`user-${i}`));
      }
      expect(Object.keys(useAnnotationStore.getState().laserPointers).length).toBe(MAX_LASERS);
    });

    it('evicts oldest laser when MAX_LASERS exceeded by new user', () => {
      const store = useAnnotationStore.getState();
      for (let i = 0; i < MAX_LASERS; i++) {
        store.updateLaser(`user-${i}`, makeLaser(`user-${i}`));
      }
      expect(useAnnotationStore.getState().laserPointers['user-0']).toBeDefined();

      store.updateLaser('user-overflow', makeLaser('user-overflow'));

      const state = useAnnotationStore.getState();
      expect(Object.keys(state.laserPointers).length).toBe(MAX_LASERS);
      expect(state.laserPointers['user-0']).toBeUndefined();
      expect(state.laserPointers['user-overflow']).toBeDefined();
    });
  });
});
