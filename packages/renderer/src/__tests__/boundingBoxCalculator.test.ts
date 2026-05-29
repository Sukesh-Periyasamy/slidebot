import { describe, it, expect } from 'vitest';
import {
  computePointsBBox,
  computeLaserBBox,
  clampToViewport,
  type BoundingBox,
  type ViewportDimensions,
} from '../boundingBoxCalculator';

const viewport: ViewportDimensions = { viewportWidth: 1920, viewportHeight: 1080 };

describe('computePointsBBox', () => {
  it('returns zero-area bbox for empty array', () => {
    const points = new Float64Array([]);
    const result = computePointsBBox(points, 4, viewport);
    expect(result).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('returns zero-area bbox for single value (fewer than 2)', () => {
    const points = new Float64Array([0.5]);
    const result = computePointsBBox(points, 4, viewport);
    expect(result).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('computes bbox for a single point (2 values)', () => {
    // Point at (0.5, 0.5) → pixel (960, 540), strokeWidth 4 → expand by 2
    const points = new Float64Array([0.5, 0.5]);
    const result = computePointsBBox(points, 4, viewport);
    expect(result.x).toBeCloseTo(958);
    expect(result.y).toBeCloseTo(538);
    expect(result.width).toBeCloseTo(4);
    expect(result.height).toBeCloseTo(4);
  });

  it('computes bbox for multiple points', () => {
    // Points: (0.1, 0.2) → (192, 216), (0.8, 0.9) → (1536, 972)
    // strokeWidth 10 → expand by 5
    const points = new Float64Array([0.1, 0.2, 0.8, 0.9]);
    const result = computePointsBBox(points, 10, viewport);
    expect(result.x).toBeCloseTo(187); // 192 - 5
    expect(result.y).toBeCloseTo(211); // 216 - 5
    expect(result.width).toBeCloseTo(1354); // (1536 - 192) + 10
    expect(result.height).toBeCloseTo(766); // (972 - 216) + 10
  });

  it('clamps bbox to viewport when points are at edges', () => {
    // Points at (0, 0) and (1, 1) with strokeWidth 20 → expand by 10
    // Without clamping: x=-10, y=-10, width=1940, height=1100
    // After clamping: x=0, y=0, width=1920, height=1080
    const points = new Float64Array([0, 0, 1, 1]);
    const result = computePointsBBox(points, 20, viewport);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBeLessThanOrEqual(1920);
    expect(result.height).toBeLessThanOrEqual(1080);
  });

  it('handles odd-length arrays (ignores trailing single value)', () => {
    // [0.5, 0.5, 0.3] → only processes pair (0.5, 0.5), ignores trailing 0.3
    const points = new Float64Array([0.5, 0.5, 0.3]);
    const result = computePointsBBox(points, 4, viewport);
    // Should be same as single point at (0.5, 0.5)
    expect(result.x).toBeCloseTo(958);
    expect(result.y).toBeCloseTo(538);
    expect(result.width).toBeCloseTo(4);
    expect(result.height).toBeCloseTo(4);
  });
});

describe('computeLaserBBox', () => {
  it('returns zero-area bbox for empty array', () => {
    const trail = new Float64Array([]);
    const result = computeLaserBBox(trail, viewport);
    expect(result).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('returns zero-area bbox for single value', () => {
    const trail = new Float64Array([0.5]);
    const result = computeLaserBBox(trail, viewport);
    expect(result).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('computes bbox for a single point with 6px laser radius', () => {
    // Point at (0.5, 0.5) → pixel (960, 540), expand by 6
    const trail = new Float64Array([0.5, 0.5]);
    const result = computeLaserBBox(trail, viewport);
    expect(result.x).toBeCloseTo(954); // 960 - 6
    expect(result.y).toBeCloseTo(534); // 540 - 6
    expect(result.width).toBeCloseTo(12); // 0 + 6*2
    expect(result.height).toBeCloseTo(12); // 0 + 6*2
  });

  it('computes bbox for multiple trail points', () => {
    // Points: (0.25, 0.25) → (480, 270), (0.75, 0.75) → (1440, 810)
    // Expand by 6px on each side
    const trail = new Float64Array([0.25, 0.25, 0.75, 0.75]);
    const result = computeLaserBBox(trail, viewport);
    expect(result.x).toBeCloseTo(474); // 480 - 6
    expect(result.y).toBeCloseTo(264); // 270 - 6
    expect(result.width).toBeCloseTo(972); // (1440 - 480) + 12
    expect(result.height).toBeCloseTo(552); // (810 - 270) + 12
  });

  it('clamps to viewport when trail is at edges', () => {
    const trail = new Float64Array([0, 0, 1, 1]);
    const result = computeLaserBBox(trail, viewport);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBeLessThanOrEqual(1920);
    expect(result.height).toBeLessThanOrEqual(1080);
  });
});

describe('clampToViewport', () => {
  it('returns bbox unchanged when fully within viewport', () => {
    const bbox: BoundingBox = { x: 100, y: 100, width: 200, height: 200 };
    const result = clampToViewport(bbox, viewport);
    expect(result).toEqual({ x: 100, y: 100, width: 200, height: 200 });
  });

  it('clamps negative x to 0 and reduces width', () => {
    const bbox: BoundingBox = { x: -10, y: 50, width: 100, height: 100 };
    const result = clampToViewport(bbox, viewport);
    expect(result.x).toBe(0);
    expect(result.width).toBe(90); // 100 + (-10) = 90
    expect(result.y).toBe(50);
    expect(result.height).toBe(100);
  });

  it('clamps negative y to 0 and reduces height', () => {
    const bbox: BoundingBox = { x: 50, y: -20, width: 100, height: 100 };
    const result = clampToViewport(bbox, viewport);
    expect(result.x).toBe(50);
    expect(result.y).toBe(0);
    expect(result.width).toBe(100);
    expect(result.height).toBe(80); // 100 + (-20) = 80
  });

  it('clamps width when bbox exceeds right edge', () => {
    const bbox: BoundingBox = { x: 1800, y: 100, width: 200, height: 100 };
    const result = clampToViewport(bbox, viewport);
    expect(result.x).toBe(1800);
    expect(result.width).toBe(120); // 1920 - 1800
    expect(result.height).toBe(100);
  });

  it('clamps height when bbox exceeds bottom edge', () => {
    const bbox: BoundingBox = { x: 100, y: 1000, width: 100, height: 200 };
    const result = clampToViewport(bbox, viewport);
    expect(result.y).toBe(1000);
    expect(result.height).toBe(80); // 1080 - 1000
  });

  it('handles bbox completely outside viewport (negative side)', () => {
    const bbox: BoundingBox = { x: -200, y: -200, width: 100, height: 100 };
    const result = clampToViewport(bbox, viewport);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBe(0); // -100 clamped to 0
    expect(result.height).toBe(0); // -100 clamped to 0
  });

  it('handles bbox completely outside viewport (positive side)', () => {
    const bbox: BoundingBox = { x: 2000, y: 1200, width: 100, height: 100 };
    const result = clampToViewport(bbox, viewport);
    expect(result.x).toBe(2000);
    expect(result.y).toBe(1200);
    expect(result.width).toBe(0); // 1920 - 2000 = -80 → 0
    expect(result.height).toBe(0); // 1080 - 1200 = -120 → 0
  });

  it('handles zero-area bbox', () => {
    const bbox: BoundingBox = { x: 100, y: 100, width: 0, height: 0 };
    const result = clampToViewport(bbox, viewport);
    expect(result).toEqual({ x: 100, y: 100, width: 0, height: 0 });
  });
});
