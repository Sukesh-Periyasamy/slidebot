// ─────────────────────────────────────────────────────────────────────────────
// Frame Budget Scheduler Types — Core interfaces for time-aware render scheduling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for the frame budget scheduler.
 */
export interface FrameBudgetConfig {
  /** Frame budget in milliseconds. Default 6. Range [1, 16]. */
  budgetMs: number;
  /** Maximum consecutive follow-up frames before forced completion. Default 10. */
  maxFollowUpFrames: number;
}

/**
 * Tracks what was deferred when a frame's budget was exceeded.
 * Used to resume rendering in follow-up frames.
 */
export interface DeferredWork {
  /** Remaining live stroke userIds not yet rendered. */
  liveStrokes: string[];
  /** Remaining laser userIds not yet rendered. */
  lasers: string[];
  /** Index into the reversed annotation list where rendering should resume. */
  committedAnnotationResumeIndex: number;
  /** Total committed annotations count at time of deferral. */
  committedAnnotationTotal: number;
}

/**
 * Per-category timing data for a single frame.
 * All values are in milliseconds.
 */
export interface CategoryTiming {
  activeStrokeMs: number;
  liveStrokesMs: number;
  lasersMs: number;
  committedAnnotationsMs: number;
}

/**
 * Dirty rectangle metrics for a single frame.
 */
export interface DirtyRectFrameMetrics {
  /** Number of merged dirty regions for this frame. */
  regionCount: number;
  /** Total dirty area in pixels for this frame. */
  totalDirtyArea: number;
  /** Coverage ratio (dirty area / canvas area) for this frame. */
  coverageRatio: number;
  /** Whether Full_Clear_Fallback was triggered for this frame. */
  usedFullClear: boolean;
}

/**
 * A single frame's metrics entry in the rolling window.
 */
export interface FrameMetricsEntry {
  /** Per-category timing breakdown. */
  categoryTimings: CategoryTiming;
  /** Total render duration for the frame in milliseconds. */
  totalDurationMs: number;
  /** Ratio of total render time to configured budget (0.0 to 1.0+). */
  budgetUtilization: number;
  /** Whether this frame deferred any work to a follow-up frame. */
  hadDeferral: boolean;
  /** Dirty rectangle metrics for this frame (present when dirty rect system is active). */
  dirtyRect?: DirtyRectFrameMetrics;
}

/**
 * Aggregated statistics for a single numeric metric (avg, p95, max).
 */
export interface MetricStats {
  avgMs: number;
  p95Ms: number;
  maxMs: number;
}

/**
 * Dirty rectangle statistics computed over the rolling window.
 */
export interface DirtyRectStats {
  /** Statistics for the number of merged dirty regions per frame. */
  regionCount: MetricStats;
  /** Statistics for total dirty area in pixels per frame. */
  totalDirtyArea: MetricStats;
  /** Statistics for coverage ratio per frame. */
  coverageRatio: MetricStats;
  /** Number of frames that triggered Full_Clear_Fallback. */
  fullClearCount: number;
  /** Ratio of frames using partial redraw to total frames (0.0–1.0). */
  partialRedrawRatio: number;
}

/**
 * Aggregated statistics computed over the rolling window of frame metrics.
 * Returned in response to a GET_METRICS command.
 */
export interface MetricsResponse {
  /** Per-category statistics (avg, p95, max) in milliseconds. */
  perCategory: {
    [K in keyof CategoryTiming]: {
      avgMs: number;
      p95Ms: number;
      maxMs: number;
    };
  };
  /** Average budget utilization across the window. */
  overallBudgetUtilization: number;
  /** Number of frames in the window that had deferrals. */
  deferredFrameCount: number;
  /** Current number of entries in the window (may be < 60). */
  windowSize: number;
  /** Dirty rectangle statistics over the rolling window. */
  dirtyRect: DirtyRectStats;
}

/**
 * Interface for the timing helper passed through a render pass.
 * Tracks elapsed time and provides budget-checking utilities.
 */
export interface TimingContext {
  /** The start time of the current render pass. */
  readonly startTime: number;
  /** The configured frame budget in milliseconds. */
  readonly budgetMs: number;
  /** When true, all remaining work must be completed regardless of budget. */
  readonly forceComplete: boolean;

  /** Returns elapsed time since start in milliseconds. */
  elapsed(): number;

  /** Returns true if elapsed time exceeds the budget. */
  isOverBudget(): boolean;
}
