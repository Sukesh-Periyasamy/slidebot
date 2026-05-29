// ─────────────────────────────────────────────────────────────────────────────
// Dirty Region Tracker — Manages dirty region accumulation, merging,
// previous-frame tracking, and fallback decisions.
// ─────────────────────────────────────────────────────────────────────────────

import type { BoundingBox, ViewportDimensions } from './boundingBoxCalculator';

/** Configuration for dirty rectangle behavior. */
export interface DirtyRectConfig {
  enabled: boolean;
  coverageThreshold: number; // 0.1–1.0, default 0.6
  regionCountThreshold: number; // 1–64, default 16
  mergeMargin: number; // 0–32 pixels, default 4
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

/** Stored bounding boxes from the previous frame for dynamic items. */
export interface PreviousFrameRegions {
  activeStroke: BoundingBox | null;
  liveStrokes: Map<string, BoundingBox>;
  lasers: Map<string, BoundingBox>;
}

/** Default configuration values. */
const DEFAULT_CONFIG: DirtyRectConfig = {
  enabled: true,
  coverageThreshold: 0.6,
  regionCountThreshold: 16,
  mergeMargin: 4,
};

/**
 * Check if a bounding box value is invalid (NaN or Infinity).
 */
function isInvalidValue(v: number): boolean {
  return !Number.isFinite(v);
}

/**
 * Check if a bounding box is invalid:
 * - Any coordinate is NaN or Infinity
 * - Width or height is negative
 */
function isInvalidBBox(bbox: BoundingBox): boolean {
  return (
    isInvalidValue(bbox.x) ||
    isInvalidValue(bbox.y) ||
    isInvalidValue(bbox.width) ||
    isInvalidValue(bbox.height) ||
    bbox.width < 0 ||
    bbox.height < 0
  );
}

/**
 * Compute the gap between two regions on a single axis.
 * Returns 0 if they overlap on that axis, otherwise the positive distance.
 */
function axisGap(aMin: number, aMax: number, bMin: number, bMax: number): number {
  if (aMax < bMin) return bMin - aMax;
  if (bMax < aMin) return aMin - bMax;
  return 0; // overlapping on this axis
}

/**
 * Test whether two regions should be merged given a merge margin.
 * Two regions are mergeable when the gap on the X-axis ≤ margin AND
 * the gap on the Y-axis ≤ margin.
 */
function shouldMerge(a: BoundingBox, b: BoundingBox, mergeMargin: number): boolean {
  const gapX = axisGap(a.x, a.x + a.width, b.x, b.x + b.width);
  const gapY = axisGap(a.y, a.y + a.height, b.y, b.y + b.height);
  return gapX <= mergeMargin && gapY <= mergeMargin;
}

/**
 * Compute the union bounding box of two regions.
 */
function unionBBox(a: BoundingBox, b: BoundingBox): BoundingBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Iterative pairwise merge until no overlapping/adjacent pairs remain.
 * O(n³) worst case for n ≤ 64 input regions — well within 2ms budget.
 */
export function mergeRegions(regions: BoundingBox[], mergeMargin: number): BoundingBox[] {
  if (regions.length <= 1) return [...regions];

  const working = [...regions];

  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < working.length; i++) {
      for (let j = i + 1; j < working.length; j++) {
        if (shouldMerge(working[i]!, working[j]!, mergeMargin)) {
          // Replace i with the union, remove j
          working[i] = unionBBox(working[i]!, working[j]!);
          working.splice(j, 1);
          merged = true;
          break; // restart inner loop
        }
      }
      if (merged) break; // restart outer loop from step 2
    }
  }

  return working;
}

/**
 * DirtyRegionTracker manages dirty region accumulation, merging,
 * previous-frame tracking, and fallback decisions.
 */
export class DirtyRegionTracker {
  private config: DirtyRectConfig;
  private accumulatedRegions: BoundingBox[] = [];
  private fullClearFlag = false;
  private previousFrame: PreviousFrameRegions = {
    activeStroke: null,
    liveStrokes: new Map(),
    lasers: new Map(),
  };
  private lastFrameMetrics: {
    regionCount: number;
    totalDirtyArea: number;
    coverageRatio: number;
    usedFullClear: boolean;
  } = { regionCount: 0, totalDirtyArea: 0, coverageRatio: 0, usedFullClear: false };

  constructor(config?: Partial<DirtyRectConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Mark a bounding box as dirty for the current frame.
   * Validates the bbox: discards NaN/Infinity/negative dimensions,
   * expands zero-area regions to 1×1 minimum.
   */
  markDirty(bbox: BoundingBox): void {
    if (isInvalidBBox(bbox)) {
      // Discard invalid region and trigger full clear
      this.fullClearFlag = true;
      return;
    }

    // Expand zero-area regions to 1×1 minimum
    let { x, y, width, height } = bbox;
    if (width === 0) width = 1;
    if (height === 0) height = 1;

    this.accumulatedRegions.push({ x, y, width, height });
  }

  /**
   * Mark the entire canvas as dirty (triggers full clear next frame).
   */
  invalidateAll(): void {
    this.fullClearFlag = true;
  }

  /**
   * Prepare dirty regions for rendering.
   * Adds previous-frame regions for dynamic items, merges all regions,
   * evaluates fallback thresholds, and returns the frame decision.
   */
  prepareFrame(
    viewport: ViewportDimensions,
    activeStrokeBBox: BoundingBox | null,
    liveStrokeBBoxes: Map<string, BoundingBox>,
    laserBBoxes: Map<string, BoundingBox>,
  ): DirtyFrameResult {
    // If disabled, always full clear
    if (!this.config.enabled) {
      const result: DirtyFrameResult = {
        useFullClear: true,
        regions: [],
        totalDirtyArea: 0,
        coverageRatio: 0,
      };
      this.lastFrameMetrics = {
        regionCount: 0,
        totalDirtyArea: 0,
        coverageRatio: 0,
        usedFullClear: true,
      };
      return result;
    }

    // If full clear flag is set, return immediately
    if (this.fullClearFlag) {
      const result: DirtyFrameResult = {
        useFullClear: true,
        regions: [],
        totalDirtyArea: 0,
        coverageRatio: 0,
      };
      this.lastFrameMetrics = {
        regionCount: 0,
        totalDirtyArea: 0,
        coverageRatio: 0,
        usedFullClear: true,
      };
      return result;
    }

    // Add current dynamic item bboxes as dirty regions
    if (activeStrokeBBox) {
      this.markDirty(activeStrokeBBox);
    }
    for (const bbox of liveStrokeBBoxes.values()) {
      this.markDirty(bbox);
    }
    for (const bbox of laserBBoxes.values()) {
      this.markDirty(bbox);
    }

    // Add stored previous-frame bboxes as dirty regions
    if (this.previousFrame.activeStroke) {
      this.markDirty(this.previousFrame.activeStroke);
    }
    for (const bbox of this.previousFrame.liveStrokes.values()) {
      this.markDirty(bbox);
    }
    for (const bbox of this.previousFrame.lasers.values()) {
      this.markDirty(bbox);
    }

    // Check if full clear was triggered during markDirty (invalid bbox detected)
    if (this.fullClearFlag) {
      const result: DirtyFrameResult = {
        useFullClear: true,
        regions: [],
        totalDirtyArea: 0,
        coverageRatio: 0,
      };
      this.lastFrameMetrics = {
        regionCount: 0,
        totalDirtyArea: 0,
        coverageRatio: 0,
        usedFullClear: true,
      };
      return result;
    }

    // Merge all accumulated regions
    const merged = mergeRegions(this.accumulatedRegions, this.config.mergeMargin);

    // Compute total dirty area and coverage ratio
    const canvasArea = viewport.viewportWidth * viewport.viewportHeight;
    let totalDirtyArea = 0;
    for (const region of merged) {
      totalDirtyArea += region.width * region.height;
    }
    const coverageRatio = canvasArea > 0 ? totalDirtyArea / canvasArea : 0;

    // Evaluate fallback thresholds
    const useFullClear =
      coverageRatio > this.config.coverageThreshold ||
      merged.length > this.config.regionCountThreshold;

    this.lastFrameMetrics = {
      regionCount: merged.length,
      totalDirtyArea,
      coverageRatio,
      usedFullClear: useFullClear,
    };

    if (useFullClear) {
      return {
        useFullClear: true,
        regions: [],
        totalDirtyArea,
        coverageRatio,
      };
    }

    return {
      useFullClear: false,
      regions: merged,
      totalDirtyArea,
      coverageRatio,
    };
  }

  /**
   * Called after a render pass completes.
   * Stores current dynamic item bounding boxes as previous-frame regions.
   * Clears accumulated dirty regions.
   */
  commitFrame(
    activeStrokeBBox: BoundingBox | null,
    liveStrokeBBoxes: Map<string, BoundingBox>,
    laserBBoxes: Map<string, BoundingBox>,
  ): void {
    // Store current bboxes as previous-frame regions
    this.previousFrame.activeStroke = activeStrokeBBox;

    this.previousFrame.liveStrokes = new Map(liveStrokeBBoxes);
    this.previousFrame.lasers = new Map(laserBBoxes);

    // Clear accumulated dirty regions and full-clear flag
    this.accumulatedRegions = [];
    this.fullClearFlag = false;
  }

  /**
   * Handle removal of a live stroke — marks previous region dirty.
   */
  onLiveStrokeRemoved(userId: string): void {
    const prevBBox = this.previousFrame.liveStrokes.get(userId);
    if (prevBBox) {
      this.markDirty(prevBBox);
      this.previousFrame.liveStrokes.delete(userId);
    }
  }

  /**
   * Handle removal of a laser — marks previous region dirty.
   */
  onLaserRemoved(userId: string): void {
    const prevBBox = this.previousFrame.lasers.get(userId);
    if (prevBBox) {
      this.markDirty(prevBBox);
      this.previousFrame.lasers.delete(userId);
    }
  }

  /**
   * Handle active stroke commit/cancel — marks previous region dirty.
   */
  onActiveStrokeEnded(): void {
    if (this.previousFrame.activeStroke) {
      this.markDirty(this.previousFrame.activeStroke);
      this.previousFrame.activeStroke = null;
    }
  }

  /**
   * Handle resize — invalidates all, clears previous-frame regions.
   */
  onResize(): void {
    this.invalidateAll();
    this.previousFrame.activeStroke = null;
    this.previousFrame.liveStrokes.clear();
    this.previousFrame.lasers.clear();
  }

  /**
   * Handle slide change — invalidates all, clears previous-frame regions.
   */
  onSlideChange(): void {
    this.invalidateAll();
    this.previousFrame.activeStroke = null;
    this.previousFrame.liveStrokes.clear();
    this.previousFrame.lasers.clear();
  }

  /**
   * Update configuration. Returns error message or null on success.
   * Validates ranges: coverageThreshold [0.1, 1.0], regionCountThreshold [1, 64],
   * mergeMargin [0, 32]. Rejects entire command if any value is out of range.
   */
  setConfig(partial: Partial<DirtyRectConfig>): string | null {
    const errors: string[] = [];

    if (partial.coverageThreshold !== undefined) {
      if (partial.coverageThreshold < 0.1 || partial.coverageThreshold > 1.0) {
        errors.push(
          `coverageThreshold (${partial.coverageThreshold}) must be in [0.1, 1.0]`,
        );
      }
    }

    if (partial.regionCountThreshold !== undefined) {
      if (partial.regionCountThreshold < 1 || partial.regionCountThreshold > 64) {
        errors.push(
          `regionCountThreshold (${partial.regionCountThreshold}) must be in [1, 64]`,
        );
      }
    }

    if (partial.mergeMargin !== undefined) {
      if (partial.mergeMargin < 0 || partial.mergeMargin > 32) {
        errors.push(`mergeMargin (${partial.mergeMargin}) must be in [0, 32]`);
      }
    }

    if (errors.length > 0) {
      return `Invalid config: ${errors.join(', ')}`;
    }

    // Track if we're re-enabling
    const wasDisabled = !this.config.enabled;
    const isEnabling = partial.enabled === true;

    // Apply valid config
    Object.assign(this.config, partial);

    // If re-enabling after disable, trigger full clear and clear previous-frame regions
    if (wasDisabled && isEnabling) {
      this.fullClearFlag = true;
      this.previousFrame.activeStroke = null;
      this.previousFrame.liveStrokes.clear();
      this.previousFrame.lasers.clear();
    }

    return null;
  }

  /**
   * Get current configuration.
   */
  getConfig(): Readonly<DirtyRectConfig> {
    return { ...this.config };
  }

  /**
   * Get metrics for the current frame (called after prepareFrame).
   */
  getFrameMetrics(): {
    regionCount: number;
    totalDirtyArea: number;
    coverageRatio: number;
    usedFullClear: boolean;
  } {
    return { ...this.lastFrameMetrics };
  }
}
