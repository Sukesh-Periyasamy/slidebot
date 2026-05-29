/**
 * Point smoothing and decimation utilities for the annotation render worker.
 * Uses Catmull-Rom spline interpolation (τ = 0.5) for smooth freehand strokes.
 * Points are stored as flat Float64Array: [x0, y0, x1, y1, ...]
 */

/** Default number of interpolated segments between each pair of original points. */
const DEFAULT_SEGMENTS_PER_CURVE = 8;

/** Catmull-Rom tension parameter (centripetal). */
const TAU = 0.5;

/**
 * Smooth a flat point array using Catmull-Rom spline interpolation.
 * Returns a new flat array with interpolated points inserted between originals.
 * All original input points are preserved in the output (interpolating, not approximating).
 *
 * @param points - Flat Float64Array [x0, y0, x1, y1, ...]
 * @param segmentsPerCurve - Number of interpolated segments between each pair of original points (default 8)
 * @returns New Float64Array with smoothed points
 */
export function smooth(
  points: Float64Array,
  segmentsPerCurve: number = DEFAULT_SEGMENTS_PER_CURVE
): Float64Array {
  const numPoints = points.length / 2;

  // Need at least 2 points to interpolate
  if (numPoints < 2) {
    return new Float64Array(points);
  }

  // For exactly 2 points, just return a copy (a single line segment)
  if (numPoints === 2) {
    return new Float64Array(points);
  }

  // Calculate output size:
  // For N input points, there are (N-1) segments.
  // Each segment produces segmentsPerCurve sub-segments (segmentsPerCurve + 1 points),
  // but adjacent segments share their boundary point.
  // Total output points = (N-1) * segmentsPerCurve + 1
  const outputPointCount = (numPoints - 1) * segmentsPerCurve + 1;
  const output = new Float64Array(outputPointCount * 2);

  let outIdx = 0;

  for (let i = 0; i < numPoints - 1; i++) {
    // Get the four control points for this segment: P[i-1], P[i], P[i+1], P[i+2]
    const p0 = getControlPoint(points, i - 1, numPoints);
    const p1x = points[i * 2]!;
    const p1y = points[i * 2 + 1]!;
    const p2x = points[(i + 1) * 2]!;
    const p2y = points[(i + 1) * 2 + 1]!;
    const p3 = getControlPoint(points, i + 2, numPoints);

    // Generate interpolated points for this segment
    const endT = i === numPoints - 2 ? segmentsPerCurve : segmentsPerCurve - 1;
    for (let j = 0; j <= endT; j++) {
      const t = j / segmentsPerCurve;
      const { x, y } = catmullRom(p0.x, p0.y, p1x, p1y, p2x, p2y, p3.x, p3.y, t);
      output[outIdx++] = x;
      output[outIdx++] = y;
    }
  }

  return output;
}

/**
 * Decimate points for degraded mode: keep every Nth point.
 * Always preserves the first and last point.
 *
 * @param points - Flat Float64Array [x0, y0, x1, y1, ...]
 * @param keepEvery - Keep every Nth point (e.g., 2 means keep every other point)
 * @returns New Float64Array with decimated points
 */
export function decimate(points: Float64Array, keepEvery: number): Float64Array {
  const numPoints = points.length / 2;

  // Nothing to decimate for 0, 1, or 2 points
  if (numPoints <= 2) {
    return new Float64Array(points);
  }

  // keepEvery must be at least 1
  if (keepEvery < 1) {
    return new Float64Array(points);
  }

  // If keepEvery is 1, keep all points
  if (keepEvery === 1) {
    return new Float64Array(points);
  }

  // Collect indices to keep: first, every Nth, and last
  const keptIndices: number[] = [0];

  for (let i = keepEvery; i < numPoints - 1; i += keepEvery) {
    keptIndices.push(i);
  }

  // Always include the last point
  const lastIdx = numPoints - 1;
  if (keptIndices[keptIndices.length - 1] !== lastIdx) {
    keptIndices.push(lastIdx);
  }

  const output = new Float64Array(keptIndices.length * 2);
  for (let i = 0; i < keptIndices.length; i++) {
    const srcIdx = keptIndices[i]! * 2;
    output[i * 2] = points[srcIdx]!;
    output[i * 2 + 1] = points[srcIdx + 1]!;
  }

  return output;
}

/**
 * Get a control point for Catmull-Rom interpolation.
 * For boundary segments, uses reflected control points.
 */
function getControlPoint(
  points: Float64Array,
  index: number,
  numPoints: number
): { x: number; y: number } {
  if (index >= 0 && index < numPoints) {
    return { x: points[index * 2]!, y: points[index * 2 + 1]! };
  }

  // Reflect control points at boundaries
  if (index < 0) {
    // Reflect P[0] over itself using P[1]: reflected = 2*P[0] - P[1]
    const p0x = points[0]!;
    const p0y = points[1]!;
    const p1x = points[2]!;
    const p1y = points[3]!;
    return { x: 2 * p0x - p1x, y: 2 * p0y - p1y };
  }

  // index >= numPoints: Reflect P[last] over itself using P[last-1]
  const lastIdx = (numPoints - 1) * 2;
  const prevIdx = (numPoints - 2) * 2;
  const pLastX = points[lastIdx]!;
  const pLastY = points[lastIdx + 1]!;
  const pPrevX = points[prevIdx]!;
  const pPrevY = points[prevIdx + 1]!;
  return { x: 2 * pLastX - pPrevX, y: 2 * pLastY - pPrevY };
}

/**
 * Evaluate a Catmull-Rom spline at parameter t ∈ [0, 1].
 * Uses tension τ = 0.5 (centripetal Catmull-Rom).
 *
 * The Catmull-Rom matrix form with tension τ:
 *   q(t) = [1, t, t², t³] * M * [P0, P1, P2, P3]^T
 *
 * Where M = | 0       1       0       0      |
 *           | -τ      0       τ       0      |
 *           | 2τ      τ-3     3-2τ    -τ     |
 *           | -τ      2-τ     τ-2     τ      |
 */
function catmullRom(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
  t: number
): { x: number; y: number } {
  const t2 = t * t;
  const t3 = t2 * t;

  // Catmull-Rom basis functions with τ = 0.5
  const b0 = -TAU * t3 + 2 * TAU * t2 - TAU * t;
  const b1 = (2 - TAU) * t3 + (TAU - 3) * t2 + 1;
  const b2 = (TAU - 2) * t3 + (3 - 2 * TAU) * t2 + TAU * t;
  const b3 = TAU * t3 - TAU * t2;

  return {
    x: b0 * p0x + b1 * p1x + b2 * p2x + b3 * p3x,
    y: b0 * p0y + b1 * p1y + b2 * p2y + b3 * p3y,
  };
}
