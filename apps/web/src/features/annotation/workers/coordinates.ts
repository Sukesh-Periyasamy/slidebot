/**
 * Coordinate conversion and validation utilities for the annotation render worker.
 * All functions are pure and operate on normalized [0,1] coordinate space.
 */

/** Convert a normalized [0,1] coordinate to pixel space. */
export function toPixel(normalized: number, viewportSize: number): number {
  return normalized * viewportSize;
}

/** Convert a pixel coordinate to normalized [0,1] space. */
export function toNormalized(pixel: number, viewportSize: number): number {
  return pixel / viewportSize;
}

/** Clamp a value to the [0, 1] range. */
export function clampNormalized(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Validate and clamp all points in a Float64Array.
 * Points are stored as [x0, y0, x1, y1, ...] in normalized space.
 * All coordinate values are clamped to [0, 1].
 */
export function validatePoints(points: Float64Array): Float64Array {
  const result = new Float64Array(points.length);
  for (let i = 0; i < points.length; i++) {
    result[i] = clampNormalized(points[i]!);
  }
  return result;
}
