// ─────────────────────────────────────────────────────────────────────────────
// Overlap Query — Spatial lookup utilities for finding renderable items
// whose bounding boxes intersect dirty regions.
// ─────────────────────────────────────────────────────────────────────────────

import type { BoundingBox, ViewportDimensions, SerializedAnnotation } from './boundingBoxCalculator';
import { computeAnnotationBBox, computePointsBBox, computeLaserBBox } from './boundingBoxCalculator';

// ─── Dynamic Item Types ──────────────────────────────────────────────────────

/** A live stroke from a remote user. */
export interface LiveStrokeItem {
  userId: string;
  points: Float64Array;
  strokeWidth: number;
}

/** A laser trail from any user. */
export interface LaserItem {
  userId: string;
  trail: Float64Array;
}

/** The local user's active (in-progress) stroke. */
export interface ActiveStrokeItem {
  points: Float64Array;
  strokeWidth: number;
}

/** Result of the dynamic items overlap query. */
export interface OverlappingDynamicItems {
  /** Live strokes that intersect dirty regions, ordered by userId ascending. */
  liveStrokes: LiveStrokeItem[];
  /** Lasers that intersect dirty regions, ordered by userId ascending. */
  lasers: LaserItem[];
  /** Whether the active stroke intersects any dirty region. */
  activeStrokeOverlaps: boolean;
}

// ─── AABB Intersection ───────────────────────────────────────────────────────

/**
 * Test axis-aligned bounding box intersection.
 * Returns true if the two boxes share any area (non-zero overlap).
 *
 * Uses the separating axis theorem for AABBs:
 * Two boxes do NOT intersect if separated on any axis.
 * They intersect if and only if they overlap on BOTH axes.
 */
export function intersects(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// ─── Overlap Queries ─────────────────────────────────────────────────────────

/**
 * Find all annotations whose bounding box intersects any dirty region.
 * Returns annotations in insertion order (oldest-to-newest) for z-order correctness.
 *
 * Performs a linear scan over all cached annotations, computing each annotation's
 * bounding box and testing AABB intersection against each dirty region.
 * An annotation is included if it intersects at least one region.
 *
 * @param annotations - Cached annotations in insertion order (oldest-to-newest)
 * @param regions - Merged dirty regions for the current frame
 * @param viewport - Current viewport dimensions for coordinate conversion
 * @param ctx - Optional canvas context needed for text annotation measurement
 * @returns Subset of annotations whose bbox intersects any dirty region, preserving insertion order
 */
export function findOverlappingAnnotations(
  annotations: readonly SerializedAnnotation[],
  regions: readonly BoundingBox[],
  viewport: ViewportDimensions,
  ctx?: OffscreenCanvasRenderingContext2D,
): SerializedAnnotation[] {
  if (regions.length === 0 || annotations.length === 0) {
    return [];
  }

  const result: SerializedAnnotation[] = [];

  for (const annotation of annotations) {
    const bbox = computeAnnotationBBox(annotation, viewport, ctx);
    for (const region of regions) {
      if (intersects(bbox, region)) {
        result.push(annotation);
        break; // No need to check remaining regions for this annotation
      }
    }
  }

  return result;
}

/**
 * Determine which dynamic items (live strokes, lasers, active stroke)
 * intersect the dirty regions.
 *
 * Live strokes are returned ordered by userId ascending.
 * Lasers are returned ordered by userId ascending.
 *
 * @param liveStrokes - All current live strokes
 * @param lasers - All current laser trails
 * @param activeStroke - The local user's active stroke, or null if none
 * @param regions - Merged dirty regions for the current frame
 * @param viewport - Current viewport dimensions for coordinate conversion
 * @returns Which dynamic items overlap the dirty regions
 */
export function findOverlappingDynamicItems(
  liveStrokes: readonly LiveStrokeItem[],
  lasers: readonly LaserItem[],
  activeStroke: ActiveStrokeItem | null,
  regions: readonly BoundingBox[],
  viewport: ViewportDimensions,
): OverlappingDynamicItems {
  if (regions.length === 0) {
    return { liveStrokes: [], lasers: [], activeStrokeOverlaps: false };
  }

  // Filter live strokes that intersect any dirty region
  const overlappingLiveStrokes: LiveStrokeItem[] = [];
  for (const stroke of liveStrokes) {
    const bbox = computePointsBBox(stroke.points, stroke.strokeWidth, viewport);
    for (const region of regions) {
      if (intersects(bbox, region)) {
        overlappingLiveStrokes.push(stroke);
        break;
      }
    }
  }
  // Sort by userId ascending for z-order correctness
  overlappingLiveStrokes.sort((a, b) => a.userId.localeCompare(b.userId));

  // Filter lasers that intersect any dirty region
  const overlappingLasers: LaserItem[] = [];
  for (const laser of lasers) {
    const bbox = computeLaserBBox(laser.trail, viewport);
    for (const region of regions) {
      if (intersects(bbox, region)) {
        overlappingLasers.push(laser);
        break;
      }
    }
  }
  // Sort by userId ascending for z-order correctness
  overlappingLasers.sort((a, b) => a.userId.localeCompare(b.userId));

  // Check if active stroke intersects any dirty region
  let activeStrokeOverlaps = false;
  if (activeStroke) {
    const bbox = computePointsBBox(activeStroke.points, activeStroke.strokeWidth, viewport);
    for (const region of regions) {
      if (intersects(bbox, region)) {
        activeStrokeOverlaps = true;
        break;
      }
    }
  }

  return { liveStrokes: overlappingLiveStrokes, lasers: overlappingLasers, activeStrokeOverlaps };
}
