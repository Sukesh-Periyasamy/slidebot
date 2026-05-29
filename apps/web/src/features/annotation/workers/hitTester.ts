import type { SerializedAnnotation } from '../types/renderCommand.types';
import type { WorkerAnnotationCache } from './annotationCache';

/**
 * Compute the squared distance from point (px, py) to the line segment (ax, ay)-(bx, by).
 */
function pointToSegmentDistanceSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Segment is a point
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }

  // Project point onto the line, clamping t to [0, 1]
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) t = 0;
  if (t > 1) t = 1;

  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  const ex = px - closestX;
  const ey = py - closestY;
  return ex * ex + ey * ey;
}

/**
 * Test if a point hits a freehand stroke (polyline).
 * Returns true if the point is within tolerance of any segment.
 */
function hitTestFreehand(
  px: number,
  py: number,
  points: Float64Array,
  toleranceX: number,
  toleranceY: number
): boolean {
  const numPoints = points.length / 2;
  if (numPoints < 1) return false;

  // For a single point, test distance to that point
  if (numPoints === 1) {
    const dx = (px - (points[0] as number)) / toleranceX;
    const dy = (py - (points[1] as number)) / toleranceY;
    return dx * dx + dy * dy <= 1;
  }

  // Test each segment of the polyline
  for (let i = 0; i < numPoints - 1; i++) {
    const ax = points[i * 2] as number;
    const ay = points[i * 2 + 1] as number;
    const bx = points[(i + 1) * 2] as number;
    const by = points[(i + 1) * 2 + 1] as number;

    // Scale coordinates to make the tolerance circular in normalized space
    // We normalize by tolerance so that a distance <= 1 means "within tolerance"
    const scaledPx = px / toleranceX;
    const scaledPy = py / toleranceY;
    const scaledAx = ax / toleranceX;
    const scaledAy = ay / toleranceY;
    const scaledBx = bx / toleranceX;
    const scaledBy = by / toleranceY;

    const distSq = pointToSegmentDistanceSq(
      scaledPx,
      scaledPy,
      scaledAx,
      scaledAy,
      scaledBx,
      scaledBy
    );

    if (distSq <= 1) {
      return true;
    }
  }

  return false;
}

/**
 * Test if a point hits an arrow (line segment from start to end).
 * Returns true if the point is within tolerance of the line segment.
 */
function hitTestArrow(
  px: number,
  py: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  toleranceX: number,
  toleranceY: number
): boolean {
  // Scale coordinates to make the tolerance circular
  const scaledPx = px / toleranceX;
  const scaledPy = py / toleranceY;
  const scaledStartX = startX / toleranceX;
  const scaledStartY = startY / toleranceY;
  const scaledEndX = endX / toleranceX;
  const scaledEndY = endY / toleranceY;

  const distSq = pointToSegmentDistanceSq(
    scaledPx,
    scaledPy,
    scaledStartX,
    scaledStartY,
    scaledEndX,
    scaledEndY
  );

  return distSq <= 1;
}

/**
 * Test if a point is inside a rectangle (highlight).
 */
function hitTestHighlight(
  px: number,
  py: number,
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  return px >= x && px <= x + width && py >= y && py <= y + height;
}

/**
 * Test if a point is inside a text bounding box.
 * Uses fontSize to estimate height and content.length * fontSize * 0.6 for width.
 */
function hitTestText(
  px: number,
  py: number,
  x: number,
  y: number,
  content: string,
  fontSize: number,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  // Estimate bounding box in normalized space
  const widthPx = content.length * fontSize * 0.6;
  const heightPx = fontSize;

  const normalizedWidth = widthPx / viewportWidth;
  const normalizedHeight = heightPx / viewportHeight;

  return px >= x && px <= x + normalizedWidth && py >= y && py <= y + normalizedHeight;
}

/**
 * Find the topmost annotation at the given normalized coordinate.
 * Returns annotation ID or null. Tests in reverse insertion order (highest z first).
 *
 * Hit tolerance: strokeWidth/2 + 6px converted to normalized space.
 */
export function hitTest(
  x: number,
  y: number,
  cache: WorkerAnnotationCache,
  viewportWidth: number,
  viewportHeight: number
): string | null {
  // Collect all annotations and reverse for z-order (highest/most recent first)
  const annotations: SerializedAnnotation[] = [];
  for (const annotation of cache.values()) {
    annotations.push(annotation);
  }
  annotations.reverse();

  for (const annotation of annotations) {
    const { data, strokeWidth } = annotation;

    // Compute hit tolerance in normalized space
    const tolerancePx = strokeWidth / 2 + 6;
    const toleranceX = tolerancePx / viewportWidth;
    const toleranceY = tolerancePx / viewportHeight;

    switch (data.tool) {
      case 'freehand': {
        if (hitTestFreehand(x, y, data.points, toleranceX, toleranceY)) {
          return annotation.id;
        }
        break;
      }
      case 'arrow': {
        if (
          hitTestArrow(
            x,
            y,
            data.startX,
            data.startY,
            data.endX,
            data.endY,
            toleranceX,
            toleranceY
          )
        ) {
          return annotation.id;
        }
        break;
      }
      case 'highlight': {
        if (hitTestHighlight(x, y, data.x, data.y, data.width, data.height)) {
          return annotation.id;
        }
        break;
      }
      case 'text': {
        if (
          hitTestText(
            x,
            y,
            data.x,
            data.y,
            data.content,
            data.fontSize,
            viewportWidth,
            viewportHeight
          )
        ) {
          return annotation.id;
        }
        break;
      }
    }
  }

  return null;
}
