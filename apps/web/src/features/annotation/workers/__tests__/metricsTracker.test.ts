import { describe, it, expect } from 'vitest';
import { MetricsTracker } from '../metricsTracker';
import type { FrameMetricsEntry } from '../frameBudgetScheduler.types';

function makeEntry(overrides: Partial<FrameMetricsEntry> = {}): FrameMetricsEntry {
  return {
    categoryTimings: {
      activeStrokeMs: 1,
      liveStrokesMs: 1,
      lasersMs: 1,
      committedAnnotationsMs: 1,
    },
    totalDurationMs: 4,
    budgetUtilization: 0.67,
    hadDeferral: false,
    ...overrides,
  };
}

describe('MetricsTracker', () => {
  describe('record()', () => {
    it('adds entries to the window', () => {
      const tracker = new MetricsTracker();
      tracker.record(makeEntry());
      const stats = tracker.computeStats();
      expect(stats.windowSize).toBe(1);
    });

    it('evicts oldest entry when window reaches 60', () => {
      const tracker = new MetricsTracker();
      for (let i = 0; i < 60; i++) {
        tracker.record(makeEntry({ totalDurationMs: i }));
      }
      // Add one more — should evict the first (totalDurationMs: 0)
      tracker.record(makeEntry({ totalDurationMs: 100 }));
      const stats = tracker.computeStats();
      expect(stats.windowSize).toBe(60);
    });

    it('maintains FIFO order (oldest evicted first)', () => {
      const tracker = new MetricsTracker();
      // Fill with entries where activeStrokeMs = index
      for (let i = 0; i < 60; i++) {
        tracker.record(
          makeEntry({
            categoryTimings: {
              activeStrokeMs: i,
              liveStrokesMs: 0,
              lasersMs: 0,
              committedAnnotationsMs: 0,
            },
          }),
        );
      }
      // Add entry with activeStrokeMs = 999
      tracker.record(
        makeEntry({
          categoryTimings: {
            activeStrokeMs: 999,
            liveStrokesMs: 0,
            lasersMs: 0,
            committedAnnotationsMs: 0,
          },
        }),
      );
      const stats = tracker.computeStats();
      // Max should be 999 (the newest), min should be 1 (index 0 was evicted)
      expect(stats.perCategory.activeStrokeMs.maxMs).toBe(999);
    });
  });

  describe('computeStats()', () => {
    it('returns zeroed response when window is empty', () => {
      const tracker = new MetricsTracker();
      const stats = tracker.computeStats();
      expect(stats).toEqual({
        perCategory: {
          activeStrokeMs: { avgMs: 0, p95Ms: 0, maxMs: 0 },
          liveStrokesMs: { avgMs: 0, p95Ms: 0, maxMs: 0 },
          lasersMs: { avgMs: 0, p95Ms: 0, maxMs: 0 },
          committedAnnotationsMs: { avgMs: 0, p95Ms: 0, maxMs: 0 },
        },
        overallBudgetUtilization: 0,
        deferredFrameCount: 0,
        windowSize: 0,
        dirtyRect: {
          regionCount: { avgMs: 0, p95Ms: 0, maxMs: 0 },
          totalDirtyArea: { avgMs: 0, p95Ms: 0, maxMs: 0 },
          coverageRatio: { avgMs: 0, p95Ms: 0, maxMs: 0 },
          fullClearCount: 0,
          partialRedrawRatio: 0,
        },
      });
    });

    it('computes correct average for a single entry', () => {
      const tracker = new MetricsTracker();
      tracker.record(
        makeEntry({
          categoryTimings: {
            activeStrokeMs: 2,
            liveStrokesMs: 3,
            lasersMs: 4,
            committedAnnotationsMs: 5,
          },
        }),
      );
      const stats = tracker.computeStats();
      expect(stats.perCategory.activeStrokeMs.avgMs).toBe(2);
      expect(stats.perCategory.liveStrokesMs.avgMs).toBe(3);
      expect(stats.perCategory.lasersMs.avgMs).toBe(4);
      expect(stats.perCategory.committedAnnotationsMs.avgMs).toBe(5);
    });

    it('computes correct average across multiple entries', () => {
      const tracker = new MetricsTracker();
      tracker.record(
        makeEntry({
          categoryTimings: {
            activeStrokeMs: 2,
            liveStrokesMs: 4,
            lasersMs: 6,
            committedAnnotationsMs: 8,
          },
        }),
      );
      tracker.record(
        makeEntry({
          categoryTimings: {
            activeStrokeMs: 4,
            liveStrokesMs: 6,
            lasersMs: 8,
            committedAnnotationsMs: 10,
          },
        }),
      );
      const stats = tracker.computeStats();
      expect(stats.perCategory.activeStrokeMs.avgMs).toBe(3);
      expect(stats.perCategory.liveStrokesMs.avgMs).toBe(5);
      expect(stats.perCategory.lasersMs.avgMs).toBe(7);
      expect(stats.perCategory.committedAnnotationsMs.avgMs).toBe(9);
    });

    it('computes correct max per category', () => {
      const tracker = new MetricsTracker();
      tracker.record(
        makeEntry({
          categoryTimings: {
            activeStrokeMs: 1,
            liveStrokesMs: 10,
            lasersMs: 5,
            committedAnnotationsMs: 3,
          },
        }),
      );
      tracker.record(
        makeEntry({
          categoryTimings: {
            activeStrokeMs: 7,
            liveStrokesMs: 2,
            lasersMs: 9,
            committedAnnotationsMs: 1,
          },
        }),
      );
      const stats = tracker.computeStats();
      expect(stats.perCategory.activeStrokeMs.maxMs).toBe(7);
      expect(stats.perCategory.liveStrokesMs.maxMs).toBe(10);
      expect(stats.perCategory.lasersMs.maxMs).toBe(9);
      expect(stats.perCategory.committedAnnotationsMs.maxMs).toBe(3);
    });

    it('computes p95 correctly with 20 entries', () => {
      const tracker = new MetricsTracker();
      // Add 20 entries with activeStrokeMs = 1..20
      for (let i = 1; i <= 20; i++) {
        tracker.record(
          makeEntry({
            categoryTimings: {
              activeStrokeMs: i,
              liveStrokesMs: 0,
              lasersMs: 0,
              committedAnnotationsMs: 0,
            },
          }),
        );
      }
      const stats = tracker.computeStats();
      // p95 index = ceil(0.95 * 20) - 1 = ceil(19) - 1 = 18 (0-indexed)
      // sorted values: [1, 2, ..., 20], value at index 18 = 19
      expect(stats.perCategory.activeStrokeMs.p95Ms).toBe(19);
    });

    it('computes overall budget utilization as average', () => {
      const tracker = new MetricsTracker();
      tracker.record(makeEntry({ budgetUtilization: 0.5 }));
      tracker.record(makeEntry({ budgetUtilization: 1.0 }));
      tracker.record(makeEntry({ budgetUtilization: 0.8 }));
      const stats = tracker.computeStats();
      expect(stats.overallBudgetUtilization).toBeCloseTo(0.7667, 3);
    });

    it('counts deferred frames correctly', () => {
      const tracker = new MetricsTracker();
      tracker.record(makeEntry({ hadDeferral: true }));
      tracker.record(makeEntry({ hadDeferral: false }));
      tracker.record(makeEntry({ hadDeferral: true }));
      tracker.record(makeEntry({ hadDeferral: true }));
      tracker.record(makeEntry({ hadDeferral: false }));
      const stats = tracker.computeStats();
      expect(stats.deferredFrameCount).toBe(3);
    });

    it('reports correct windowSize for partial windows', () => {
      const tracker = new MetricsTracker();
      tracker.record(makeEntry());
      tracker.record(makeEntry());
      tracker.record(makeEntry());
      const stats = tracker.computeStats();
      expect(stats.windowSize).toBe(3);
    });

    it('handles p95 with a single entry', () => {
      const tracker = new MetricsTracker();
      tracker.record(
        makeEntry({
          categoryTimings: {
            activeStrokeMs: 5,
            liveStrokesMs: 3,
            lasersMs: 2,
            committedAnnotationsMs: 1,
          },
        }),
      );
      const stats = tracker.computeStats();
      // With 1 entry, p95 index = ceil(0.95 * 1) - 1 = 0, so it's the only value
      expect(stats.perCategory.activeStrokeMs.p95Ms).toBe(5);
      expect(stats.perCategory.liveStrokesMs.p95Ms).toBe(3);
    });
  });
});
