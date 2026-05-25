/**
 * snapshotManager.test.ts
 *
 * Unit tests for snapshot hydration, capture, reconnect restore, and stale cleanup:
 * - Hydrate snapshot into store on reconnect
 * - Stale snapshots are skipped
 * - Room mismatch snapshots are skipped
 * - Active stroke is not overwritten during hydration
 * - Already-known annotations are not duplicated
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnnotationSnapshot } from '../snapshotManager';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// We'll mock the annotation store to avoid Zustand in unit tests
const mockStoreState = {
  annotations: {} as Record<string, unknown>,
  activeStroke: null as unknown,
  addAnnotation: vi.fn(),
};

vi.mock('@/features/annotation/store/annotationStore', () => ({
  useAnnotationStore: {
    getState: () => mockStoreState,
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
    get length() { return Object.keys(store).length; },
    clear() { store = {}; },
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

// Import after mocks (static import — hoisted correctly by vitest)
import { snapshotManager } from '../snapshotManager';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SLIDE_ID = 'slide-abc';
const ROOM_ID = 'room-xyz';

function makeAnnotation(id: string, userId = 'user-1') {
  return {
    id,
    slideId: SLIDE_ID,
    userId,
    displayName: 'Test User',
    color: '#FF0000',
    strokeWidth: 2,
    opacity: 1,
    data: { tool: 'freehand' as const, points: [0, 0, 1, 1] },
    isEphemeral: false,
    status: 'committed' as const,
    createdAt: new Date().toISOString(),
  };
}

function writeSnapshotToStorage(overrides: Partial<AnnotationSnapshot> = {}): void {
  const snapshot: AnnotationSnapshot = {
    slideId: SLIDE_ID,
    roomId: ROOM_ID,
    version: 'v1',
    annotations: [makeAnnotation('ann-1'), makeAnnotation('ann-2')],
    lastSeq: 5,
    capturedAt: Date.now(),
    ...overrides,
  };
  localStorageMock.setItem(
    `slidebot:snapshot:${snapshot.roomId}:${snapshot.slideId}`,
    JSON.stringify(snapshot)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SnapshotManager', () => {
  beforeEach(() => {
    localStorageMock.clear();
    mockStoreState.annotations = {};
    mockStoreState.activeStroke = null;
    mockStoreState.addAnnotation.mockClear();
  });

  // ── hydrate ───────────────────────────────────────────────────────────────

  describe('hydrate', () => {
    it('returns skipped=true when no snapshot exists', () => {
      const result = snapshotManager.hydrate(SLIDE_ID, ROOM_ID);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('no_snapshot');
    });

    it('loads committed annotations from snapshot into store', () => {
      writeSnapshotToStorage();
      const result = snapshotManager.hydrate(SLIDE_ID, ROOM_ID);
      expect(result.skipped).toBe(false);
      expect(result.loaded).toBe(2);
      expect(mockStoreState.addAnnotation).toHaveBeenCalledTimes(2);
    });

    it('skips annotations already in the store (no duplication)', () => {
      writeSnapshotToStorage();
      // Pre-populate store with ann-1
      mockStoreState.annotations = { 'ann-1': makeAnnotation('ann-1') };
      const result = snapshotManager.hydrate(SLIDE_ID, ROOM_ID);
      // Only ann-2 should be added
      expect(result.loaded).toBe(1);
      expect(mockStoreState.addAnnotation).toHaveBeenCalledTimes(1);
    });

    it('skips stale snapshots (older than 30 minutes)', () => {
      const staleTime = Date.now() - (31 * 60 * 1000); // 31 minutes ago
      writeSnapshotToStorage({ capturedAt: staleTime });
      const result = snapshotManager.hydrate(SLIDE_ID, ROOM_ID);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('stale');
      expect(mockStoreState.addAnnotation).not.toHaveBeenCalled();
    });

    it('skips snapshots from a different room', () => {
      writeSnapshotToStorage({ roomId: 'different-room' });
      // The snapshot is stored under different-room key, so read for ROOM_ID returns null
      const result = snapshotManager.hydrate(SLIDE_ID, ROOM_ID);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('no_snapshot');
    });

    it('does not overwrite activeStroke (guard is present in hydration)', () => {
      writeSnapshotToStorage();
      mockStoreState.activeStroke = makeAnnotation('active-stroke');
      // Hydration should still proceed but activeStroke stays untouched
      // (addAnnotation only adds to annotations map, not activeStroke)
      snapshotManager.hydrate(SLIDE_ID, ROOM_ID);
      // activeStroke is managed by the store — snapshotManager never touches it
      expect(mockStoreState.activeStroke).not.toBeNull();
    });
  });

  // ── capture ───────────────────────────────────────────────────────────────

  describe('capture', () => {
    it('serializes committed annotations for the given slide', () => {
      mockStoreState.annotations = {
        'ann-1': makeAnnotation('ann-1'),
        'ann-2': makeAnnotation('ann-2'),
        // Different slide — should be excluded
        'ann-other': { ...makeAnnotation('ann-other'), slideId: 'different-slide' },
      };

      const snapshot = snapshotManager.capture(SLIDE_ID, ROOM_ID, 10);
      expect(snapshot.annotations).toHaveLength(2);
      expect(snapshot.lastSeq).toBe(10);
      expect(snapshot.version).toBe('v1');
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  // ── restoreOnReconnect ────────────────────────────────────────────────────

  describe('restoreOnReconnect', () => {
    it('returns lastSeq from snapshot on successful restore', () => {
      writeSnapshotToStorage({ lastSeq: 42 });
      const lastSeq = snapshotManager.restoreOnReconnect(SLIDE_ID, ROOM_ID);
      expect(lastSeq).toBe(42);
    });

    it('returns 0 when no snapshot is available', () => {
      const lastSeq = snapshotManager.restoreOnReconnect(SLIDE_ID, ROOM_ID);
      expect(lastSeq).toBe(0);
    });

    it('returns 0 for stale snapshot', () => {
      const staleTime = Date.now() - (31 * 60 * 1000);
      writeSnapshotToStorage({ capturedAt: staleTime });
      const lastSeq = snapshotManager.restoreOnReconnect(SLIDE_ID, ROOM_ID);
      expect(lastSeq).toBe(0);
    });
  });

  // ── clearForRoom ──────────────────────────────────────────────────────────

  describe('clearForRoom', () => {
    it('removes all snapshots for a given room', () => {
      writeSnapshotToStorage();
      snapshotManager.clearForRoom(ROOM_ID);
      expect(localStorageMock.removeItem).toHaveBeenCalled();
    });
  });
});
