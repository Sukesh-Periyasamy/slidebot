// ─────────────────────────────────────────────────────────────────────────────
// MetricsTracker — Rolling window of frame timing measurements
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CategoryTiming,
  DirtyRectStats,
  FrameMetricsEntry,
  MetricsResponse,
} from './frameBudgetScheduler.types';

const MAX_WINDOW_SIZE = 60;

const CATEGORY_KEYS: (keyof CategoryTiming)[] = [
  'activeStrokeMs',
  'liveStrokesMs',
  'lasersMs',
  'committedAnnotationsMs',
];

/**
 * Maintains a rolling window of frame timing measurements and computes
 * aggregate statistics (avg, p95, max) per render category.
 */
export class MetricsTracker {
  private window: FrameMetricsEntry[] = [];

  /**
   * Record a frame's timing data. Evicts the oldest entry if at capacity (60).
   */
  record(entry: FrameMetricsEntry): void {
    if (this.window.length >= MAX_WINDOW_SIZE) {
      this.window.shift();
    }
    this.window.push(entry);
  }

  /**
   * Compute statistics over the current window.
   * Returns zeroed MetricsResponse if the window is empty.
   */
  computeStats(): MetricsResponse {
    const size = this.window.length;

    const zeroDirtyRect: DirtyRectStats = {
      regionCount: { avgMs: 0, p95Ms: 0, maxMs: 0 },
      totalDirtyArea: { avgMs: 0, p95Ms: 0, maxMs: 0 },
      coverageRatio: { avgMs: 0, p95Ms: 0, maxMs: 0 },
      fullClearCount: 0,
      partialRedrawRatio: 0,
    };

    if (size === 0) {
      return {
        perCategory: {
          activeStrokeMs: { avgMs: 0, p95Ms: 0, maxMs: 0 },
          liveStrokesMs: { avgMs: 0, p95Ms: 0, maxMs: 0 },
          lasersMs: { avgMs: 0, p95Ms: 0, maxMs: 0 },
          committedAnnotationsMs: { avgMs: 0, p95Ms: 0, maxMs: 0 },
        },
        overallBudgetUtilization: 0,
        deferredFrameCount: 0,
        windowSize: 0,
        dirtyRect: zeroDirtyRect,
      };
    }

    const perCategory = {} as MetricsResponse['perCategory'];

    for (const key of CATEGORY_KEYS) {
      const values = this.window.map((e) => e.categoryTimings[key]);
      perCategory[key] = {
        avgMs: average(values),
        p95Ms: percentile95(values),
        maxMs: Math.max(...values),
      };
    }

    const overallBudgetUtilization = average(
      this.window.map((e) => e.budgetUtilization),
    );

    const deferredFrameCount = this.window.filter(
      (e) => e.hadDeferral,
    ).length;

    // ─── Dirty Rectangle Statistics ────────────────────────────────────────
    const dirtyRect = this.computeDirtyRectStats();

    return {
      perCategory,
      overallBudgetUtilization,
      deferredFrameCount,
      windowSize: size,
      dirtyRect,
    };
  }

  /**
   * Compute dirty rectangle statistics over the rolling window.
   * Returns zeros when no dirty rect data is present.
   */
  private computeDirtyRectStats(): DirtyRectStats {
    const entriesWithDirtyRect = this.window.filter((e) => e.dirtyRect != null);

    if (entriesWithDirtyRect.length === 0) {
      return {
        regionCount: { avgMs: 0, p95Ms: 0, maxMs: 0 },
        totalDirtyArea: { avgMs: 0, p95Ms: 0, maxMs: 0 },
        coverageRatio: { avgMs: 0, p95Ms: 0, maxMs: 0 },
        fullClearCount: 0,
        partialRedrawRatio: 0,
      };
    }

    const regionCounts = entriesWithDirtyRect.map((e) => e.dirtyRect!.regionCount);
    const totalDirtyAreas = entriesWithDirtyRect.map((e) => e.dirtyRect!.totalDirtyArea);
    const coverageRatios = entriesWithDirtyRect.map((e) => e.dirtyRect!.coverageRatio);

    const fullClearCount = entriesWithDirtyRect.filter((e) => e.dirtyRect!.usedFullClear).length;
    const partialRedrawCount = entriesWithDirtyRect.length - fullClearCount;
    const partialRedrawRatio = partialRedrawCount / entriesWithDirtyRect.length;

    return {
      regionCount: {
        avgMs: average(regionCounts),
        p95Ms: percentile95(regionCounts),
        maxMs: Math.max(...regionCounts),
      },
      totalDirtyArea: {
        avgMs: average(totalDirtyAreas),
        p95Ms: percentile95(totalDirtyAreas),
        maxMs: Math.max(...totalDirtyAreas),
      },
      coverageRatio: {
        avgMs: average(coverageRatios),
        p95Ms: percentile95(coverageRatios),
        maxMs: Math.max(...coverageRatios),
      },
      fullClearCount,
      partialRedrawRatio,
    };
  }
}

/**
 * Compute the arithmetic mean of an array of numbers.
 */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  return sum / values.length;
}

/**
 * Compute the 95th percentile value using the nearest-rank method.
 * Sorts the values ascending and picks the value at the 95th percentile index.
 */
function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[index] ?? 0;
}
