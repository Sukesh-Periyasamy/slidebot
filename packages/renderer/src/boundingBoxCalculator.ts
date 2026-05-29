// ─────────────────────────────────────────────────────────────────────────────
// Bounding Box Calculator — Stateless utility for computing pixel-space
// bounding boxes from normalized annotation coordinates.
// ─────────────────────────────────────────────────────────────────────────────

/** Axis-aligned bounding box in pixel coordinates. */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Viewport dimensions for coordinate conversion. */
export interface ViewportDimensions {
  viewportWidth: number;
  viewportHeight: number;
}

// ─── Annotation Types (mirrored from renderCommand.types.ts) ─────────────────

/** Tool-specific annotation data. */
export type SerializedAnnotationData =
  | { tool: 'freehand'; points: Float64Array }
  | { tool: 'highlight'; x: number; y: number; width: number; height: number }
  | { tool: 'arrow'; startX: number; startY: number; endX: number; endY: number }
  | { tool: 'text'; x: number; y: number; content: string; fontSize: number };

/** Serialized annotation for bounding box computation. */
export interface SerializedAnnotation {
  id: string;
  tool: 'freehand' | 'highlight' | 'arrow' | 'text';
  color: string;
  strokeWidth: number;
  opacity: number;
  data: SerializedAnnotationData;
}

/** Laser head radius in pixels, used for trail bounding box expansion. */
const LASER_HEAD_RADIUS_PX = 6;

/**
 * Compute bounding box for a freehand-style point array.
 * Used for active strokes, live strokes, and freehand annotations.
 *
 * Points are stored as [x0, y0, x1, y1, ...] in normalized [0,1] space.
 * The bbox is expanded by half strokeWidthPx on each side.
 *
 * Returns a zero-area bbox (0, 0, 0, 0) for arrays with fewer than 2 values
 * (i.e., fewer than one complete coordinate pair).
 */
export function computePointsBBox(
  points: Float64Array,
  strokeWidthPx: number,
  viewport: ViewportDimensions,
): BoundingBox {
  if (points.length < 2) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < points.length - 1; i += 2) {
    const px = points[i]! * viewport.viewportWidth;
    const py = points[i + 1]! * viewport.viewportHeight;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  const halfStroke = strokeWidthPx / 2;
  const x = minX - halfStroke;
  const y = minY - halfStroke;
  const width = maxX - minX + strokeWidthPx;
  const height = maxY - minY + strokeWidthPx;

  return clampToViewport({ x, y, width, height }, viewport);
}

/**
 * Compute bounding box for a laser trail.
 * Same logic as point-array bbox but expands by the laser head radius (6px)
 * on each side instead of half strokeWidth.
 *
 * Points are stored as [x0, y0, x1, y1, ...] in normalized [0,1] space.
 *
 * Returns a zero-area bbox (0, 0, 0, 0) for arrays with fewer than 2 values.
 */
export function computeLaserBBox(
  trail: Float64Array,
  viewport: ViewportDimensions,
): BoundingBox {
  if (trail.length < 2) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < trail.length - 1; i += 2) {
    const px = trail[i]! * viewport.viewportWidth;
    const py = trail[i + 1]! * viewport.viewportHeight;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  const x = minX - LASER_HEAD_RADIUS_PX;
  const y = minY - LASER_HEAD_RADIUS_PX;
  const width = maxX - minX + LASER_HEAD_RADIUS_PX * 2;
  const height = maxY - minY + LASER_HEAD_RADIUS_PX * 2;

  return clampToViewport({ x, y, width, height }, viewport);
}

/**
 * Clamp a bounding box to viewport boundaries.
 * Ensures x >= 0, y >= 0, x + width <= viewportWidth, y + height <= viewportHeight.
 * Width and height are guaranteed to be >= 0 after clamping.
 */
export function clampToViewport(
  bbox: BoundingBox,
  viewport: ViewportDimensions,
): BoundingBox {
  let { x, y, width, height } = bbox;

  // Clamp left/top edges to 0
  if (x < 0) {
    width += x; // reduce width by the amount x is negative
    x = 0;
  }
  if (y < 0) {
    height += y; // reduce height by the amount y is negative
    y = 0;
  }

  // Clamp right/bottom edges to viewport
  if (x + width > viewport.viewportWidth) {
    width = viewport.viewportWidth - x;
  }
  if (y + height > viewport.viewportHeight) {
    height = viewport.viewportHeight - y;
  }

  // Ensure non-negative dimensions
  if (width < 0) width = 0;
  if (height < 0) height = 0;

  return { x, y, width, height };
}

/**
 * Compute bounding box for an arrow annotation.
 * Includes the line segment (start to end) and the arrowhead triangle vertices.
 *
 * The arrowhead is drawn at the end point with two vertices at ±30° (π/6)
 * from the line angle, with length = max(strokeWidth × 3, 10).
 * The bbox is expanded by half strokeWidth on each side.
 *
 * All input coordinates are in normalized [0,1] space.
 */
export function computeArrowBBox(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  strokeWidthPx: number,
  viewport: ViewportDimensions,
): BoundingBox {
  // Convert to pixel space
  const sx = startX * viewport.viewportWidth;
  const sy = startY * viewport.viewportHeight;
  const ex = endX * viewport.viewportWidth;
  const ey = endY * viewport.viewportHeight;

  // Compute arrowhead geometry
  const angle = Math.atan2(ey - sy, ex - sx);
  const headLength = Math.max(strokeWidthPx * 3, 10);

  // Arrowhead vertices at ±30° from line angle
  const arrowV1x = ex - headLength * Math.cos(angle - Math.PI / 6);
  const arrowV1y = ey - headLength * Math.sin(angle - Math.PI / 6);
  const arrowV2x = ex - headLength * Math.cos(angle + Math.PI / 6);
  const arrowV2y = ey - headLength * Math.sin(angle + Math.PI / 6);

  // Find min/max of all points (start, end, arrowhead vertices)
  const allX = [sx, ex, arrowV1x, arrowV2x];
  const allY = [sy, ey, arrowV1y, arrowV2y];

  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);

  // Expand by half strokeWidth
  const halfStroke = strokeWidthPx / 2;
  const x = minX - halfStroke;
  const y = minY - halfStroke;
  const width = maxX - minX + strokeWidthPx;
  const height = maxY - minY + strokeWidthPx;

  return clampToViewport({ x, y, width, height }, viewport);
}

/**
 * Compute bounding box for a committed annotation.
 * Dispatches by tool type to the appropriate computation.
 *
 * @param annotation - The serialized annotation to compute bbox for
 * @param viewport - Current viewport dimensions for coordinate conversion
 * @param ctx - Canvas context needed for text measurement (required for text annotations)
 */
export function computeAnnotationBBox(
  annotation: SerializedAnnotation,
  viewport: ViewportDimensions,
  ctx?: OffscreenCanvasRenderingContext2D,
): BoundingBox {
  const { data, strokeWidth } = annotation;

  switch (data.tool) {
    case 'freehand':
      return computePointsBBox(data.points, strokeWidth, viewport);

    case 'highlight': {
      const x = data.x * viewport.viewportWidth;
      const y = data.y * viewport.viewportHeight;
      const width = data.width * viewport.viewportWidth;
      const height = data.height * viewport.viewportHeight;
      return clampToViewport({ x, y, width, height }, viewport);
    }

    case 'arrow':
      return computeArrowBBox(
        data.startX,
        data.startY,
        data.endX,
        data.endY,
        strokeWidth,
        viewport,
      );

    case 'text': {
      if (!ctx) {
        // Without a canvas context, we cannot measure text.
        // Return a zero-area bbox at the text position.
        const px = data.x * viewport.viewportWidth;
        const py = data.y * viewport.viewportHeight;
        return clampToViewport({ x: px, y: py, width: 0, height: 0 }, viewport);
      }

      // Compute pixel font size (fontSize is in normalized space, scaled by viewport height)
      const pixelFontSize = data.fontSize * viewport.viewportHeight;
      ctx.font = `${pixelFontSize}px Inter, system-ui, sans-serif`;

      const metrics = ctx.measureText(data.content);
      const textWidth = metrics.width;
      const textHeight =
        metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

      // Text position in pixel space
      const textX = data.x * viewport.viewportWidth;
      // The text baseline is at (x, y). The bbox top is above the baseline by ascent.
      const textY = data.y * viewport.viewportHeight - metrics.actualBoundingBoxAscent;

      return clampToViewport(
        { x: textX, y: textY, width: textWidth, height: textHeight },
        viewport,
      );
    }
  }
}
