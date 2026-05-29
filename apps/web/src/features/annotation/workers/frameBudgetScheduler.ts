// ─────────────────────────────────────────────────────────────────────────────
// FrameBudgetScheduler — Time-aware render scheduling for the annotation worker
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CategoryTiming,
  DeferredWork,
  FrameBudgetConfig,
  FrameMetricsEntry,
  MetricsResponse,
} from './frameBudgetScheduler.types';
import { MetricsTracker } from './metricsTracker';
import { TimingContext } from './timingContext';

import type { SerializedAnnotation } from '../types/renderCommand.types';
import type { WorkerAnnotationCache } from './annotationCache';
import type { DegradationController } from './degradationController';

// ─── Dirty Rectangle Types (from @slidebot/renderer) ─────────────────────────

/** Axis-aligned bounding box in pixel coordinates. */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Result of preparing dirty regions for a frame. */
export interface DirtyFrameResult {
  /** Whether to use full-clear fallback. */
  useFullClear: boolean;
  /** Merged dirty regions (empty if useFullClear is true). */
  regions: BoundingBox[];
  /** Total dirty area in pixels. */
  totalDirtyArea: number;
  /** Coverage ratio (dirty area / canvas area). */
  coverageRatio: number;
}

/** Deferred work specific to dirty region rendering. */
export interface DirtyRegionDeferredWork {
  /** Index into the merged dirty regions list where rendering should resume. */
  dirtyRegionResumeIndex: number;
  /** Item index within the current dirty region where rendering should resume. */
  itemResumeIndex: number;
  /** The merged dirty regions for this deferred render pass. */
  dirtyRegions: BoundingBox[];
  /** The overlapping items for the deferred render pass (all items in z-order). */
  overlappingItems: OverlappingItemSet;
}

/** Set of items that overlap dirty regions, organized for z-order rendering. */
export interface OverlappingItemSet {
  /** Committed annotations that overlap dirty regions, in insertion order (oldest-to-newest). */
  annotations: SerializedAnnotation[];
  /** Live stroke userIds that overlap dirty regions, ordered by userId ascending. */
  liveStrokes: string[];
  /** Laser userIds that overlap dirty regions, ordered by userId ascending. */
  lasers: string[];
  /** Whether the active stroke overlaps any dirty region. */
  activeStrokeOverlaps: boolean;
}

// ─── Render State Interface ──────────────────────────────────────────────────

/**
 * The subset of worker state needed by executeBudgetedRender.
 * Matches the shape of InternalWorkerState from render.worker.ts.
 */
export interface BudgetRenderState {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  viewportWidth: number;
  viewportHeight: number;
  cache: WorkerAnnotationCache;
  liveStrokes: Map<string, LiveStrokeState>;
  activeStroke: ActiveStrokeState | null;
  lasers: Map<string, LaserState>;
  degradationController: DegradationController;
}

export interface LiveStrokeState {
  userId: string;
  color: string;
  strokeWidth: number;
  opacity: number;
  points: Float64Array;
}

export interface ActiveStrokeState {
  config: {
    tool: 'freehand';
    color: string;
    strokeWidth: number;
    opacity: number;
  };
  points: Float64Array;
}

export interface LaserState {
  userId: string;
  color: string;
  trail: Float64Array;
}

/**
 * Result returned by executeBudgetedRender indicating what was deferred.
 */
export interface BudgetedRenderResult {
  /** Whether any work was deferred to a follow-up frame. */
  hadDeferral: boolean;
  /** The deferred work descriptor, or null if everything was rendered. */
  deferredWork: DeferredWork | null;
  /** Per-category timing breakdown for this frame. */
  categoryTimings: CategoryTiming;
  /** Total frame duration in milliseconds. */
  totalDurationMs: number;
}

// ─── Render Helper Types ─────────────────────────────────────────────────────

/**
 * A function that renders a single annotation item.
 * Used to abstract the actual rendering logic from the budget scheduler.
 */
export type RenderAnnotationFn = (
  ctx: OffscreenCanvasRenderingContext2D,
  annotation: SerializedAnnotation,
  viewportWidth: number,
  viewportHeight: number,
  degradationController: DegradationController,
) => void;

/**
 * A function that renders a single live stroke.
 */
export type RenderLiveStrokeFn = (
  ctx: OffscreenCanvasRenderingContext2D,
  stroke: LiveStrokeState,
  viewportWidth: number,
  viewportHeight: number,
) => void;

/**
 * A function that renders a single laser.
 */
export type RenderLaserFn = (
  ctx: OffscreenCanvasRenderingContext2D,
  laser: LaserState,
  viewportWidth: number,
  viewportHeight: number,
) => void;

/**
 * A function that renders the active stroke.
 */
export type RenderActiveStrokeFn = (
  ctx: OffscreenCanvasRenderingContext2D,
  activeStroke: ActiveStrokeState,
  viewportWidth: number,
  viewportHeight: number,
) => void;

/**
 * Collection of render functions passed to executeBudgetedRender.
 * This allows the scheduler to remain decoupled from the actual rendering logic.
 */
export interface RenderFunctions {
  renderAnnotation: RenderAnnotationFn;
  renderLiveStroke: RenderLiveStrokeFn;
  renderLaser: RenderLaserFn;
  renderActiveStroke: RenderActiveStrokeFn;
}

// ─── Content-Affecting Command Classification ───────────────────────────────

/**
 * Commands that modify renderable state and trigger deferred work invalidation.
 * When any of these commands arrive while deferred work exists, the scheduler
 * discards remaining deferred work and triggers a fresh full render pass.
 *
 * Validates: Requirements 3.4, 8.5, 8.6
 */
export const CONTENT_AFFECTING_COMMANDS: ReadonlySet<string> = new Set([
  'ANNOTATION_UPDATE',
  'ANNOTATION_REMOVE',
  'SLIDE_CHANGE',
  'LIVE_STROKE_UPDATE',
  'LIVE_STROKE_COMMIT',
  'LIVE_STROKE_REMOVE',
  'ACTIVE_STROKE_START',
  'ACTIVE_STROKE_POINTS',
  'ACTIVE_STROKE_COMMIT',
  'ACTIVE_STROKE_CANCEL',
  'LASER_UPDATE',
  'LASER_REMOVE',
]);

/** Minimum allowed frame budget in milliseconds. */
const MIN_BUDGET_MS = 1;

/** Maximum allowed frame budget in milliseconds. */
const MAX_BUDGET_MS = 16;

/** Default frame budget configuration. */
const DEFAULT_CONFIG: FrameBudgetConfig = {
  budgetMs: 6,
  maxFollowUpFrames: 10,
};

/**
 * Detects the best available high-resolution time source.
 * Prefers performance.now() for sub-millisecond precision,
 * falls back to Date.now() when unavailable (e.g., some worker contexts).
 */
function detectTimeSource(): () => number {
  if (
    typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
  ) {
    return () => performance.now();
  }
  return () => Date.now();
}

/**
 * FrameBudgetScheduler enforces a configurable per-frame time budget on the
 * render worker. When the budget is exceeded, lower-priority render items are
 * deferred to follow-up frames scheduled with zero delay.
 *
 * This class manages:
 * - Budget configuration and validation
 * - Deferred work state tracking
 * - Follow-up frame scheduling and cancellation
 * - Metrics collection via MetricsTracker
 * - Time source detection (performance.now / Date.now fallback)
 */
export class FrameBudgetScheduler {
  private config: FrameBudgetConfig;
  private deferredWork: DeferredWork | null = null;
  private deferredDirtyRegionWork: DirtyRegionDeferredWork | null = null;
  private followUpCount = 0;
  private followUpTimerId: ReturnType<typeof setTimeout> | null = null;
  private metricsTracker: MetricsTracker;

  /** High-resolution time source, detected once at construction. */
  readonly getNow: () => number;

  constructor(config?: Partial<FrameBudgetConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metricsTracker = new MetricsTracker();
    this.getNow = detectTimeSource();
  }

  // ─── Budget Configuration ────────────────────────────────────────────────

  /**
   * Update the frame budget. Returns an error message string if the value is
   * invalid, or null on success.
   *
   * Validates:
   * - Value must be a finite number
   * - Value must be in the range [1, 16] milliseconds
   */
  setFrameBudget(value: unknown): string | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 'Invalid frame budget: value must be a finite number.';
    }

    if (value < MIN_BUDGET_MS || value > MAX_BUDGET_MS) {
      return `Invalid frame budget: value must be between ${MIN_BUDGET_MS} and ${MAX_BUDGET_MS} milliseconds (inclusive). Received: ${value}.`;
    }

    this.config.budgetMs = value;
    return null;
  }

  /** Returns the current frame budget in milliseconds. */
  get budgetMs(): number {
    return this.config.budgetMs;
  }

  /** Returns the maximum consecutive follow-up frames before forced completion. */
  get maxFollowUpFrames(): number {
    return this.config.maxFollowUpFrames;
  }

  // ─── Deferred Work Management ────────────────────────────────────────────

  /**
   * Discard all deferred work and cancel any pending follow-up frame timer.
   * Called when content-affecting commands arrive or on slide change.
   */
  discardDeferredWork(): void {
    this.deferredWork = null;
    this.deferredDirtyRegionWork = null;
    this.followUpCount = 0;

    if (this.followUpTimerId !== null) {
      clearTimeout(this.followUpTimerId);
      this.followUpTimerId = null;
    }
  }

  // ─── Content-Affecting Command Handling ──────────────────────────────────

  /**
   * Handle a content-affecting command by invalidating deferred work if needed.
   *
   * For most content-affecting commands:
   * - If deferred work exists, discards it and returns true (indicating a fresh
   *   full render pass is needed).
   * - If no deferred work exists, returns false (no action needed).
   *
   * For SLIDE_CHANGE specifically:
   * - Always discards deferred work (and cancels pending follow-ups) regardless
   *   of whether deferred work currently exists, because the entire render context
   *   is changing. Also signals that any in-progress render pass should be aborted.
   * - Returns true to indicate a fresh render pass is needed.
   *
   * Returns false if the command type is not content-affecting.
   *
   * Validates: Requirements 3.4, 8.5, 8.6
   */
  handleContentAffectingCommand(commandType: string): boolean {
    if (!CONTENT_AFFECTING_COMMANDS.has(commandType)) {
      return false;
    }

    if (commandType === 'SLIDE_CHANGE') {
      // SLIDE_CHANGE always discards deferred work, cancels pending follow-ups,
      // and signals abort of in-progress render pass (Req 8.5, 8.6)
      this.discardDeferredWork();
      return true;
    }

    // For other content-affecting commands, only act if deferred work exists (Req 3.4)
    if (this.hasDeferredWork()) {
      this.discardDeferredWork();
      return true;
    }

    return false;
  }

  /** Returns whether there is pending deferred work (including dirty region deferred work). */
  hasDeferredWork(): boolean {
    return this.deferredWork !== null || this.deferredDirtyRegionWork !== null;
  }

  /** Get the current deferred work state (for use by render logic). */
  getDeferredWork(): DeferredWork | null {
    return this.deferredWork;
  }

  /** Get the current dirty region deferred work state. */
  getDeferredDirtyRegionWork(): DirtyRegionDeferredWork | null {
    return this.deferredDirtyRegionWork;
  }

  /** Set deferred work state (called by executeBudgetedRender). */
  setDeferredWork(work: DeferredWork | null): void {
    this.deferredWork = work;
  }

  /** Get the current follow-up frame count. */
  getFollowUpCount(): number {
    return this.followUpCount;
  }

  /** Increment the follow-up frame counter. */
  incrementFollowUpCount(): void {
    this.followUpCount++;
  }

  /** Reset the follow-up frame counter (when a fresh render cycle starts). */
  resetFollowUpCount(): void {
    this.followUpCount = 0;
  }

  /** Store the follow-up timer ID (for cancellation). */
  setFollowUpTimerId(id: ReturnType<typeof setTimeout> | null): void {
    this.followUpTimerId = id;
  }

  /** Get the follow-up timer ID. */
  getFollowUpTimerId(): ReturnType<typeof setTimeout> | null {
    return this.followUpTimerId;
  }

  // ─── Metrics ─────────────────────────────────────────────────────────────

  /** Get current metrics snapshot from the rolling window. */
  getMetrics(): MetricsResponse {
    return this.metricsTracker.computeStats();
  }

  /** Access the internal metrics tracker (for recording frame entries). */
  getMetricsTracker(): MetricsTracker {
    return this.metricsTracker;
  }

  // ─── Budgeted Render ───────────────────────────────────────────────────────

  /**
   * Execute a budgeted render pass. Clears the canvas, renders items in priority
   * order (Active_Stroke > Live_Strokes > Lasers > Committed_Annotations), and
   * defers remaining work when the frame budget is exceeded.
   *
   * When a DirtyFrameResult is provided with useFullClear === false, the renderer
   * uses clip-based partial rendering: saves context, builds a clip path from the
   * union of dirty regions, clears each region, renders only overlapping items in
   * z-order with budget enforcement, and restores context.
   *
   * Returns a result describing what was rendered and what was deferred.
   *
   * @param state - The render worker state (canvas, ctx, annotations, strokes, etc.)
   * @param renderFns - The actual render functions to call for each item type
   * @param dirtyFrame - Optional dirty frame result for partial rendering
   * @param overlappingItems - Optional pre-computed overlapping items for dirty region rendering
   * @returns BudgetedRenderResult with deferral info and timing metrics
   */
  executeBudgetedRender(
    state: BudgetRenderState,
    renderFns: RenderFunctions,
    dirtyFrame?: DirtyFrameResult,
    overlappingItems?: OverlappingItemSet,
  ): BudgetedRenderResult {
    // If there is deferred dirty region work from a previous frame, resume it
    if (this.deferredDirtyRegionWork) {
      return this.resumeDeferredDirtyRectRender(state, renderFns);
    }

    // If dirty frame is provided and partial redraw is possible, use dirty rect path
    if (dirtyFrame && !dirtyFrame.useFullClear && dirtyFrame.regions.length > 0 && overlappingItems) {
      return this.executeDirtyRectRender(state, renderFns, dirtyFrame, overlappingItems);
    }

    // Otherwise, use the existing full-canvas render path
    return this.executeFullCanvasRender(state, renderFns, dirtyFrame);
  }

  /**
   * Execute a full-canvas render pass.
   * Clears the entire canvas and renders all items in correct z-order:
   * Committed_Annotations (oldest-to-newest), Live_Strokes (userId ascending),
   * Lasers (userId ascending), Active_Stroke on top.
   *
   * When full clear is triggered, any existing deferred dirty-region work is
   * discarded (Req 5.6).
   *
   * Validates: Requirements 5.3, 5.4, 5.6, 10.1, 10.2
   */
  private executeFullCanvasRender(
    state: BudgetRenderState,
    renderFns: RenderFunctions,
    dirtyFrame?: DirtyFrameResult,
  ): BudgetedRenderResult {
    const forceComplete = this.followUpCount >= this.config.maxFollowUpFrames;
    const timing = new TimingContext(this.config.budgetMs, forceComplete, this.getNow);

    const { ctx, viewportWidth, viewportHeight, cache, degradationController } = state;

    // ─── Discard deferred dirty-region work on full clear (Req 5.6) ─────
    this.deferredDirtyRegionWork = null;

    // ─── Clear canvas at start of every frame (Req 6.2) ─────────────────
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    const categoryTimings: CategoryTiming = {
      activeStrokeMs: 0,
      liveStrokesMs: 0,
      lasersMs: 0,
      committedAnnotationsMs: 0,
    };

    let deferredWork: DeferredWork | null = null;

    // ─── Full clear z-order (Req 5.3, 10.2): ────────────────────────────
    // 1. Committed_Annotations (oldest-to-newest)
    // 2. Live_Strokes (userId ascending)
    // 3. Lasers (userId ascending)
    // 4. Active_Stroke on top

    const currentDeferred = this.deferredWork;

    let deferredLiveStrokes: string[] = [];
    let deferredLasers: string[] = [];
    let deferredAnnotationResumeIndex = 0;
    let deferredAnnotationTotal = 0;

    // ─── 1. Render Committed_Annotations oldest-to-newest (Req 5.3, 10.2) ─
    const annotationsStart = this.getNow();
    const allAnnotations = Array.from(cache.values());
    const annotationCount = allAnnotations.length;

    // Determine the resume index: either from deferred work or start from 0
    let resumeIndex = currentDeferred?.committedAnnotationResumeIndex ?? 0;
    // Validate resume index against current annotation count
    if (resumeIndex >= annotationCount) {
      resumeIndex = 0;
    }

    if (annotationCount > 0 && resumeIndex < annotationCount) {
      if (timing.isOverBudget()) {
        // Budget already exceeded before this category — skip entirely (Req 1.9)
        deferredAnnotationResumeIndex = resumeIndex;
        deferredAnnotationTotal = annotationCount;
      } else {
        // Render in oldest-to-newest order (insertion order from cache)
        let renderedCount = 0;
        for (let i = resumeIndex; i < annotationCount; i++) {
          const annotation = allAnnotations[i]!;
          renderFns.renderAnnotation(
            ctx,
            annotation,
            viewportWidth,
            viewportHeight,
            degradationController,
          );
          renderedCount++;

          // After rendering the item, check budget (but always render at least one) (Req 1.10)
          if (renderedCount > 1 && timing.isOverBudget()) {
            deferredAnnotationResumeIndex = i + 1;
            deferredAnnotationTotal = annotationCount;
            break;
          }
          if (renderedCount === 1 && i + 1 < annotationCount && timing.isOverBudget()) {
            deferredAnnotationResumeIndex = i + 1;
            deferredAnnotationTotal = annotationCount;
            break;
          }
        }
      }
    }
    categoryTimings.committedAnnotationsMs = this.getNow() - annotationsStart;

    // ─── 2. Render Live_Strokes by userId ascending (Req 5.3, 10.2) ─────
    const liveStrokesStart = this.getNow();
    const liveStrokeKeys = currentDeferred?.liveStrokes
      ?? Array.from(state.liveStrokes.keys()).sort();

    if (deferredAnnotationTotal > 0) {
      // If annotations were deferred, all lower-priority categories are deferred too
      deferredLiveStrokes = liveStrokeKeys;
    } else if (liveStrokeKeys.length > 0) {
      if (timing.isOverBudget()) {
        // Budget already exceeded before this category — skip entirely (Req 1.9)
        deferredLiveStrokes = liveStrokeKeys;
      } else {
        // Render at least one item, then check budget after each (Req 1.10)
        for (let i = 0; i < liveStrokeKeys.length; i++) {
          const userId = liveStrokeKeys[i]!;
          const stroke = state.liveStrokes.get(userId);
          if (stroke) {
            renderFns.renderLiveStroke(ctx, stroke, viewportWidth, viewportHeight);
          }
          // After rendering the item, check budget (but always render at least one)
          if (i > 0 && timing.isOverBudget()) {
            deferredLiveStrokes = liveStrokeKeys.slice(i + 1);
            break;
          }
          if (i === 0 && liveStrokeKeys.length > 1 && timing.isOverBudget()) {
            deferredLiveStrokes = liveStrokeKeys.slice(1);
            break;
          }
        }
      }
    }
    categoryTimings.liveStrokesMs = this.getNow() - liveStrokesStart;

    // ─── 3. Render Lasers by userId ascending (Req 5.3, 10.2) ───────────
    const lasersStart = this.getNow();
    const laserKeys = currentDeferred?.lasers
      ?? Array.from(state.lasers.keys()).sort();

    if (deferredAnnotationTotal > 0 || deferredLiveStrokes.length > 0) {
      // If higher-priority categories were deferred, all lower-priority are deferred too
      deferredLasers = laserKeys;
    } else if (laserKeys.length > 0) {
      if (timing.isOverBudget()) {
        // Budget already exceeded before this category — skip entirely (Req 1.9)
        deferredLasers = laserKeys;
      } else {
        // Render at least one item, then check budget after each (Req 1.10)
        for (let i = 0; i < laserKeys.length; i++) {
          const userId = laserKeys[i]!;
          const laser = state.lasers.get(userId);
          if (laser) {
            renderFns.renderLaser(ctx, laser, viewportWidth, viewportHeight);
          }
          // After rendering the item, check budget (but always render at least one)
          if (i > 0 && timing.isOverBudget()) {
            deferredLasers = laserKeys.slice(i + 1);
            break;
          }
          if (i === 0 && laserKeys.length > 1 && timing.isOverBudget()) {
            deferredLasers = laserKeys.slice(1);
            break;
          }
        }
      }
    }
    categoryTimings.lasersMs = this.getNow() - lasersStart;

    // ─── 4. Render Active_Stroke on top (Req 5.3, 10.2) ─────────────────
    const activeStrokeStart = this.getNow();
    if (deferredAnnotationTotal > 0 || deferredLiveStrokes.length > 0 || deferredLasers.length > 0) {
      // If higher-priority categories were deferred, active stroke is deferred too
      // (Active stroke will be rendered in the follow-up frame)
    } else if (state.activeStroke) {
      renderFns.renderActiveStroke(ctx, state.activeStroke, viewportWidth, viewportHeight);
    }
    categoryTimings.activeStrokeMs = this.getNow() - activeStrokeStart;

    // ─── Determine if work was deferred ──────────────────────────────────
    const hadDeferral =
      deferredLiveStrokes.length > 0 ||
      deferredLasers.length > 0 ||
      deferredAnnotationTotal > 0;

    if (hadDeferral) {
      deferredWork = {
        liveStrokes: deferredLiveStrokes,
        lasers: deferredLasers,
        committedAnnotationResumeIndex: deferredAnnotationResumeIndex,
        committedAnnotationTotal: deferredAnnotationTotal,
      };
    }

    // Update scheduler state
    this.deferredWork = deferredWork;

    // ─── Record metrics (Req 4.1, 4.2, 11.1) ────────────────────────────
    const totalDurationMs = timing.elapsed();
    const budgetUtilization = totalDurationMs / this.config.budgetMs;

    const metricsEntry: FrameMetricsEntry = {
      categoryTimings,
      totalDurationMs,
      budgetUtilization,
      hadDeferral,
    };

    // Record dirty rect metrics when a dirty frame was provided (full clear fallback case)
    if (dirtyFrame) {
      metricsEntry.dirtyRect = {
        regionCount: dirtyFrame.regions.length,
        totalDirtyArea: dirtyFrame.totalDirtyArea,
        coverageRatio: dirtyFrame.coverageRatio,
        usedFullClear: true,
      };
    }

    this.metricsTracker.record(metricsEntry);

    return {
      hadDeferral,
      deferredWork,
      categoryTimings,
      totalDurationMs,
    };
  }

  // ─── Dirty Rectangle Render ─────────────────────────────────────────────────

  /**
   * Execute a dirty-rectangle-based partial render pass.
   * Saves context, builds a clip path from the union of dirty regions,
   * clears each region, renders overlapping items in z-order with budget
   * enforcement, and restores context.
   *
   * Items are rendered in z-order: Committed_Annotations (oldest-to-newest),
   * Live_Strokes (by userId ascending), Lasers (by userId ascending),
   * Active_Stroke on top.
   *
   * Budget enforcement: checks elapsed after each item, renders at least one
   * item per region before checking. Defers remaining items/regions when
   * budget exceeded.
   *
   * Per-category timing attribution: each item's render time is attributed to
   * its category regardless of which dirty region it belongs to.
   *
   * Validates: Requirements 4.4, 4.5, 4.6, 6.1, 6.2, 6.3, 6.4, 6.5
   */
  private executeDirtyRectRender(
    state: BudgetRenderState,
    renderFns: RenderFunctions,
    dirtyFrame: DirtyFrameResult,
    overlappingItems: OverlappingItemSet,
  ): BudgetedRenderResult {
    const forceComplete = this.followUpCount >= this.config.maxFollowUpFrames;
    const timing = new TimingContext(this.config.budgetMs, forceComplete, this.getNow);

    const { ctx, viewportWidth, viewportHeight, degradationController } = state;

    const categoryTimings: CategoryTiming = {
      activeStrokeMs: 0,
      liveStrokesMs: 0,
      lasersMs: 0,
      committedAnnotationsMs: 0,
    };

    const regions = dirtyFrame.regions;

    // ─── 1. Save context and build clip path from union of dirty regions ──
    ctx.save();
    ctx.beginPath();
    for (const region of regions) {
      ctx.rect(region.x, region.y, region.width, region.height);
    }
    ctx.clip();

    // ─── 2. Clear each dirty region individually (Req 4.5) ───────────────
    for (const region of regions) {
      ctx.clearRect(region.x, region.y, region.width, region.height);
    }

    // ─── 3. Build the flat z-ordered item list for rendering ─────────────
    // Z-order: Committed_Annotations (oldest-to-newest), Live_Strokes (userId asc),
    // Lasers (userId asc), Active_Stroke on top.
    // We render all overlapping items under the combined clip path.

    // Track item index for budget enforcement and deferral
    let totalItemsRendered = 0;
    let hadDeferral = false;
    let deferredDirtyRegionWork: DirtyRegionDeferredWork | null = null;

    // ─── 3a. Render Committed_Annotations (oldest-to-newest) ─────────────
    const annotations = overlappingItems.annotations;
    let annotationStartIdx = 0;

    // Check if we're resuming from deferred dirty-region work
    // (For now, fresh render — deferred work resumption is handled in task 5.4)

    for (let i = annotationStartIdx; i < annotations.length; i++) {
      const itemStart = this.getNow();
      const annotation = annotations[i]!;
      renderFns.renderAnnotation(
        ctx,
        annotation,
        viewportWidth,
        viewportHeight,
        degradationController,
      );
      categoryTimings.committedAnnotationsMs += this.getNow() - itemStart;
      totalItemsRendered++;

      // Budget enforcement: check after each item, but render at least one total
      if (totalItemsRendered > 1 && timing.isOverBudget()) {
        // Defer remaining annotations and all subsequent categories
        deferredDirtyRegionWork = {
          dirtyRegionResumeIndex: 0,
          itemResumeIndex: i + 1,
          dirtyRegions: regions,
          overlappingItems,
        };
        hadDeferral = true;
        break;
      }
      if (totalItemsRendered === 1 && i + 1 < annotations.length && timing.isOverBudget()) {
        deferredDirtyRegionWork = {
          dirtyRegionResumeIndex: 0,
          itemResumeIndex: i + 1,
          dirtyRegions: regions,
          overlappingItems,
        };
        hadDeferral = true;
        break;
      }
    }

    // ─── 3b. Render Live_Strokes (userId ascending) ──────────────────────
    if (!hadDeferral) {
      const liveStrokeKeys = overlappingItems.liveStrokes;
      for (let i = 0; i < liveStrokeKeys.length; i++) {
        const userId = liveStrokeKeys[i]!;
        const stroke = state.liveStrokes.get(userId);
        if (stroke) {
          const itemStart = this.getNow();
          renderFns.renderLiveStroke(ctx, stroke, viewportWidth, viewportHeight);
          categoryTimings.liveStrokesMs += this.getNow() - itemStart;
          totalItemsRendered++;

          if (totalItemsRendered > 1 && timing.isOverBudget()) {
            deferredDirtyRegionWork = {
              dirtyRegionResumeIndex: 0,
              itemResumeIndex: annotations.length + i + 1,
              dirtyRegions: regions,
              overlappingItems,
            };
            hadDeferral = true;
            break;
          }
          if (totalItemsRendered === 1 && timing.isOverBudget()) {
            deferredDirtyRegionWork = {
              dirtyRegionResumeIndex: 0,
              itemResumeIndex: annotations.length + i + 1,
              dirtyRegions: regions,
              overlappingItems,
            };
            hadDeferral = true;
            break;
          }
        }
      }
    }

    // ─── 3c. Render Lasers (userId ascending) ────────────────────────────
    if (!hadDeferral) {
      const laserKeys = overlappingItems.lasers;
      for (let i = 0; i < laserKeys.length; i++) {
        const userId = laserKeys[i]!;
        const laser = state.lasers.get(userId);
        if (laser) {
          const itemStart = this.getNow();
          renderFns.renderLaser(ctx, laser, viewportWidth, viewportHeight);
          categoryTimings.lasersMs += this.getNow() - itemStart;
          totalItemsRendered++;

          if (totalItemsRendered > 1 && timing.isOverBudget()) {
            deferredDirtyRegionWork = {
              dirtyRegionResumeIndex: 0,
              itemResumeIndex: annotations.length + overlappingItems.liveStrokes.length + i + 1,
              dirtyRegions: regions,
              overlappingItems,
            };
            hadDeferral = true;
            break;
          }
          if (totalItemsRendered === 1 && timing.isOverBudget()) {
            deferredDirtyRegionWork = {
              dirtyRegionResumeIndex: 0,
              itemResumeIndex: annotations.length + overlappingItems.liveStrokes.length + i + 1,
              dirtyRegions: regions,
              overlappingItems,
            };
            hadDeferral = true;
            break;
          }
        }
      }
    }

    // ─── 3d. Render Active_Stroke (on top) ───────────────────────────────
    if (!hadDeferral && overlappingItems.activeStrokeOverlaps && state.activeStroke) {
      const itemStart = this.getNow();
      renderFns.renderActiveStroke(ctx, state.activeStroke, viewportWidth, viewportHeight);
      categoryTimings.activeStrokeMs += this.getNow() - itemStart;
      totalItemsRendered++;
    }

    // ─── 4. Restore context (removes clip) ───────────────────────────────
    ctx.restore();

    // ─── 5. Build deferred work for the standard DeferredWork interface ──
    let deferredWork: DeferredWork | null = null;
    if (hadDeferral && deferredDirtyRegionWork) {
      // Store deferred work in the standard format for compatibility
      // The dirty-region-specific data is stored separately
      deferredWork = {
        liveStrokes: [],
        lasers: [],
        committedAnnotationResumeIndex: 0,
        committedAnnotationTotal: 0,
      };
    }

    // Update scheduler state
    this.deferredWork = deferredWork;

    // Store dirty region deferred work for follow-up frames
    this.deferredDirtyRegionWork = deferredDirtyRegionWork;

    // ─── 6. Record metrics (Req 11.1, 6.4) ─────────────────────────────
    const totalDurationMs = timing.elapsed();
    const budgetUtilization = totalDurationMs / this.config.budgetMs;

    const metricsEntry: FrameMetricsEntry = {
      categoryTimings,
      totalDurationMs,
      budgetUtilization,
      hadDeferral,
      dirtyRect: {
        regionCount: dirtyFrame.regions.length,
        totalDirtyArea: dirtyFrame.totalDirtyArea,
        coverageRatio: dirtyFrame.coverageRatio,
        usedFullClear: false,
      },
    };
    this.metricsTracker.record(metricsEntry);

    return {
      hadDeferral,
      deferredWork,
      categoryTimings,
      totalDurationMs,
    };
  }

  // ─── Deferred Dirty Rectangle Render Resumption ──────────────────────────────

  /**
   * Resume a deferred dirty-rectangle render pass on a follow-up frame.
   * Re-applies the clip path for all dirty regions (since items may span multiple
   * regions), then resumes rendering from the stored item index in the flat
   * z-ordered item list.
   *
   * The flat z-order is: Committed_Annotations (oldest-to-newest),
   * Live_Strokes (userId ascending), Lasers (userId ascending), Active_Stroke.
   *
   * Validates: Requirements 6.2, 6.3
   */
  private resumeDeferredDirtyRectRender(
    state: BudgetRenderState,
    renderFns: RenderFunctions,
  ): BudgetedRenderResult {
    const deferred = this.deferredDirtyRegionWork!;
    const forceComplete = this.followUpCount >= this.config.maxFollowUpFrames;
    const timing = new TimingContext(this.config.budgetMs, forceComplete, this.getNow);

    const { ctx, viewportWidth, viewportHeight, degradationController } = state;

    const categoryTimings: CategoryTiming = {
      activeStrokeMs: 0,
      liveStrokesMs: 0,
      lasersMs: 0,
      committedAnnotationsMs: 0,
    };

    const { dirtyRegions, overlappingItems, itemResumeIndex } = deferred;

    // ─── 1. Re-apply clip path for all dirty regions ─────────────────────
    // The clip covers all dirty regions since items may span multiple regions.
    ctx.save();
    ctx.beginPath();
    for (const region of dirtyRegions) {
      ctx.rect(region.x, region.y, region.width, region.height);
    }
    ctx.clip();

    // ─── 2. Build the flat z-ordered item list and resume from stored index ─
    // Z-order: annotations (oldest-to-newest), liveStrokes (userId asc),
    // lasers (userId asc), activeStroke on top.
    const annotations = overlappingItems.annotations;
    const liveStrokeKeys = overlappingItems.liveStrokes;
    const laserKeys = overlappingItems.lasers;
    const hasActiveStroke = overlappingItems.activeStrokeOverlaps && state.activeStroke !== null;

    const totalFlatItems =
      annotations.length +
      liveStrokeKeys.length +
      laserKeys.length +
      (hasActiveStroke ? 1 : 0);

    let hadDeferral = false;
    let deferredDirtyRegionWork: DirtyRegionDeferredWork | null = null;
    let totalItemsRendered = 0;

    for (let flatIdx = itemResumeIndex; flatIdx < totalFlatItems; flatIdx++) {
      if (flatIdx < annotations.length) {
        // Render annotation
        const annotation = annotations[flatIdx]!;
        const itemStart = this.getNow();
        renderFns.renderAnnotation(
          ctx,
          annotation,
          viewportWidth,
          viewportHeight,
          degradationController,
        );
        categoryTimings.committedAnnotationsMs += this.getNow() - itemStart;
      } else if (flatIdx < annotations.length + liveStrokeKeys.length) {
        // Render live stroke
        const liveIdx = flatIdx - annotations.length;
        const userId = liveStrokeKeys[liveIdx]!;
        const stroke = state.liveStrokes.get(userId);
        if (stroke) {
          const itemStart = this.getNow();
          renderFns.renderLiveStroke(ctx, stroke, viewportWidth, viewportHeight);
          categoryTimings.liveStrokesMs += this.getNow() - itemStart;
        }
      } else if (flatIdx < annotations.length + liveStrokeKeys.length + laserKeys.length) {
        // Render laser
        const laserIdx = flatIdx - annotations.length - liveStrokeKeys.length;
        const userId = laserKeys[laserIdx]!;
        const laser = state.lasers.get(userId);
        if (laser) {
          const itemStart = this.getNow();
          renderFns.renderLaser(ctx, laser, viewportWidth, viewportHeight);
          categoryTimings.lasersMs += this.getNow() - itemStart;
        }
      } else {
        // Render active stroke (last item)
        if (state.activeStroke) {
          const itemStart = this.getNow();
          renderFns.renderActiveStroke(ctx, state.activeStroke, viewportWidth, viewportHeight);
          categoryTimings.activeStrokeMs += this.getNow() - itemStart;
        }
      }

      totalItemsRendered++;

      // Budget enforcement: render at least one item, then check budget
      if (totalItemsRendered > 1 && timing.isOverBudget()) {
        deferredDirtyRegionWork = {
          dirtyRegionResumeIndex: 0,
          itemResumeIndex: flatIdx + 1,
          dirtyRegions,
          overlappingItems,
        };
        hadDeferral = true;
        break;
      }
      if (totalItemsRendered === 1 && flatIdx + 1 < totalFlatItems && timing.isOverBudget()) {
        deferredDirtyRegionWork = {
          dirtyRegionResumeIndex: 0,
          itemResumeIndex: flatIdx + 1,
          dirtyRegions,
          overlappingItems,
        };
        hadDeferral = true;
        break;
      }
    }

    // ─── 3. Restore context (removes clip) ───────────────────────────────
    ctx.restore();

    // ─── 4. Update scheduler state ───────────────────────────────────────
    let deferredWork: DeferredWork | null = null;
    if (hadDeferral && deferredDirtyRegionWork) {
      deferredWork = {
        liveStrokes: [],
        lasers: [],
        committedAnnotationResumeIndex: 0,
        committedAnnotationTotal: 0,
      };
    }

    this.deferredWork = deferredWork;
    this.deferredDirtyRegionWork = deferredDirtyRegionWork;

    // ─── 5. Record metrics (Req 11.1, 6.4) ──────────────────────────────
    const totalDurationMs = timing.elapsed();
    const budgetUtilization = totalDurationMs / this.config.budgetMs;

    const metricsEntry: FrameMetricsEntry = {
      categoryTimings,
      totalDurationMs,
      budgetUtilization,
      hadDeferral,
      dirtyRect: {
        regionCount: dirtyRegions.length,
        totalDirtyArea: dirtyRegions.reduce((sum, r) => sum + r.width * r.height, 0),
        coverageRatio: 0, // Coverage ratio not recomputed for follow-up frames
        usedFullClear: false,
      },
    };
    this.metricsTracker.record(metricsEntry);

    return {
      hadDeferral,
      deferredWork,
      categoryTimings,
      totalDurationMs,
    };
  }

  // ─── Frame Scheduling ──────────────────────────────────────────────────────

  /**
   * Schedule and execute a frame, producing an ImageBitmap and transferring it
   * to the main thread. Handles follow-up frame scheduling when work is deferred.
   *
   * Flow:
   * 1. Execute a budgeted render pass
   * 2. Produce an ImageBitmap from the canvas (including partial frames)
   * 3. Post the bitmap to the main thread via the provided callback
   * 4. If work was deferred: increment followUpCount, schedule a follow-up frame
   *    with zero delay (setTimeout 0)
   * 5. If no work was deferred: reset followUpCount, clear deferred state, and
   *    return (caller resumes normal scheduling via DegradationController frameInterval)
   *
   * The convergence guarantee is enforced by executeBudgetedRender: when
   * followUpCount >= maxFollowUpFrames, the TimingContext's forceComplete flag
   * is set to true, causing isOverBudget() to always return false so all
   * remaining work completes in that frame.
   *
   * @param state - The render worker state (canvas, ctx, annotations, strokes, etc.)
   * @param renderFns - The actual render functions to call for each item type
   * @param postFrame - Callback to send the produced ImageBitmap to the main thread
   */
  async scheduleFrame(
    state: BudgetRenderState,
    renderFns: RenderFunctions,
    postFrame: (bitmap: ImageBitmap) => void,
  ): Promise<void> {
    // Execute the budgeted render pass
    const result = this.executeBudgetedRender(state, renderFns);

    // Produce ImageBitmap and transfer to main thread after every frame (Req 3.5)
    // This includes partial frames from follow-up renders
    try {
      const bitmap = await createImageBitmap(state.canvas);
      postFrame(bitmap);
    } catch (error) {
      // Log error but don't break the scheduling loop
      console.error('[FrameBudgetScheduler] Failed to produce ImageBitmap:', error);
    }

    // Handle follow-up scheduling based on deferral result
    if (result.hadDeferral) {
      // Work was deferred — schedule a follow-up frame with zero delay (Req 3.1)
      this.followUpCount++;

      // Schedule the follow-up frame immediately (setTimeout 0)
      const timerId = setTimeout(() => {
        this.followUpTimerId = null;
        // Recursively schedule the next frame to continue deferred work
        this.scheduleFrame(state, renderFns, postFrame);
      }, 0);

      this.followUpTimerId = timerId;
    } else {
      // All work completed — reset follow-up state (Req 3.3)
      this.followUpCount = 0;
      this.deferredWork = null;
      this.deferredDirtyRegionWork = null;

      if (this.followUpTimerId !== null) {
        clearTimeout(this.followUpTimerId);
        this.followUpTimerId = null;
      }

      // Return to normal scheduling — the caller will use
      // DegradationController.frameInterval for the next frame (Req 6.4, 6.5)
    }
  }
}
