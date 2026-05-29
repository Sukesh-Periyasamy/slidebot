import { describe, it, expect, vi } from 'vitest';
import {
  computeAnnotationBBox,
  computeArrowBBox,
  clampToViewport,
  type BoundingBox,
  type ViewportDimensions,
  type SerializedAnnotation,
} from '../boundingBoxCalculator';

const viewport: ViewportDimensions = { viewportWidth: 1920, viewportHeight: 1080 };

describe('computeArrowBBox', () => {
  it('computes bbox for a horizontal arrow pointing right', () => {
    // Start (0.25, 0.5) → (480, 540), End (0.75, 0.5) → (1440, 540)
    // strokeWidth = 4, headLength = max(4*3, 10) = 12
    // Angle = 0 (pointing right)
    // Arrowhead vertices:
    //   v1 = (1440 - 12*cos(-π/6), 540 - 12*sin(-π/6)) = (1440 - 10.39, 540 + 6)
    //   v2 = (1440 - 12*cos(π/6), 540 - 12*sin(π/6)) = (1440 - 10.39, 540 - 6)
    // min/max X: 480 to 1440, min/max Y: 534 to 546
    // Expand by halfStroke=2: x=478, y=532, w=964, h=16
    const result = computeArrowBBox(0.25, 0.5, 0.75, 0.5, 4, viewport);
    expect(result.x).toBeCloseTo(478, 0);
    expect(result.y).toBeCloseTo(532, 0);
    expect(result.width).toBeCloseTo(964, 0);
    expect(result.height).toBeCloseTo(16, 0);
  });

  it('computes bbox for a vertical arrow pointing down', () => {
    // Start (0.5, 0.25) → (960, 270), End (0.5, 0.75) → (960, 810)
    // strokeWidth = 6, headLength = max(6*3, 10) = 18
    // Angle = π/2 (pointing down)
    // Arrowhead vertices:
    //   v1 = (960 - 18*cos(π/2 - π/6), 810 - 18*sin(π/2 - π/6)) = (960 - 18*cos(π/3), 810 - 18*sin(π/3))
    //      = (960 - 9, 810 - 15.59)
    //   v2 = (960 - 18*cos(π/2 + π/6), 810 - 18*sin(π/2 + π/6)) = (960 - 18*cos(2π/3), 810 - 18*sin(2π/3))
    //      = (960 + 9, 810 - 15.59)
    const result = computeArrowBBox(0.5, 0.25, 0.5, 0.75, 6, viewport);
    // All X values: 960, 960, 951, 969 → min=951, max=969
    // All Y values: 270, 810, 794.41, 794.41 → min=270, max=810
    // Expand by 3: x=948, y=267, w=24, h=546
    expect(result.x).toBeCloseTo(948, 0);
    expect(result.y).toBeCloseTo(267, 0);
    expect(result.width).toBeCloseTo(24, 0);
    expect(result.height).toBeCloseTo(546, 0);
  });

  it('uses minimum headLength of 10 when strokeWidth*3 < 10', () => {
    // strokeWidth = 2, headLength = max(2*3, 10) = 10
    const result = computeArrowBBox(0.5, 0.5, 0.6, 0.5, 2, viewport);
    // Horizontal arrow, headLength = 10
    // Start (960, 540), End (1152, 540)
    // v1 = (1152 - 10*cos(-π/6), 540 - 10*sin(-π/6)) = (1152 - 8.66, 540 + 5)
    // v2 = (1152 - 10*cos(π/6), 540 - 10*sin(π/6)) = (1152 - 8.66, 540 - 5)
    expect(result.width).toBeGreaterThan(192); // at least the line length
    expect(result.height).toBeGreaterThan(10); // arrowhead adds vertical extent
  });

  it('clamps to viewport when arrow extends beyond edges', () => {
    // Arrow near the edge
    const result = computeArrowBBox(0.99, 0.5, 1.0, 0.5, 10, viewport);
    expect(result.x + result.width).toBeLessThanOrEqual(viewport.viewportWidth);
    expect(result.x).toBeGreaterThanOrEqual(0);
  });

  it('handles diagonal arrow', () => {
    // 45-degree arrow from (0.2, 0.2) to (0.8, 0.8)
    const result = computeArrowBBox(0.2, 0.2, 0.8, 0.8, 4, viewport);
    // Start (384, 216), End (1536, 864)
    // Should contain both points with padding
    expect(result.x).toBeLessThan(384);
    expect(result.y).toBeLessThan(216);
    expect(result.x + result.width).toBeGreaterThan(1536);
    expect(result.y + result.height).toBeGreaterThan(864);
  });
});

describe('computeAnnotationBBox - highlight', () => {
  it('computes bbox as pixel-converted rectangle', () => {
    const annotation: SerializedAnnotation = {
      id: 'h1',
      tool: 'highlight',
      color: '#ffff00',
      strokeWidth: 0,
      opacity: 0.3,
      data: { tool: 'highlight', x: 0.1, y: 0.2, width: 0.5, height: 0.3 },
    };
    const result = computeAnnotationBBox(annotation, viewport);
    expect(result.x).toBeCloseTo(192); // 0.1 * 1920
    expect(result.y).toBeCloseTo(216); // 0.2 * 1080
    expect(result.width).toBeCloseTo(960); // 0.5 * 1920
    expect(result.height).toBeCloseTo(324); // 0.3 * 1080
  });

  it('clamps highlight bbox to viewport', () => {
    const annotation: SerializedAnnotation = {
      id: 'h2',
      tool: 'highlight',
      color: '#ffff00',
      strokeWidth: 0,
      opacity: 0.3,
      data: { tool: 'highlight', x: 0.9, y: 0.9, width: 0.2, height: 0.2 },
    };
    const result = computeAnnotationBBox(annotation, viewport);
    // x=1728, y=972, width would be 384 but clamped to 1920-1728=192
    expect(result.x + result.width).toBeLessThanOrEqual(viewport.viewportWidth);
    expect(result.y + result.height).toBeLessThanOrEqual(viewport.viewportHeight);
  });
});

describe('computeAnnotationBBox - arrow', () => {
  it('dispatches to computeArrowBBox correctly', () => {
    const annotation: SerializedAnnotation = {
      id: 'a1',
      tool: 'arrow',
      color: '#ff0000',
      strokeWidth: 4,
      opacity: 1,
      data: { tool: 'arrow', startX: 0.25, startY: 0.5, endX: 0.75, endY: 0.5 },
    };
    const result = computeAnnotationBBox(annotation, viewport);
    const direct = computeArrowBBox(0.25, 0.5, 0.75, 0.5, 4, viewport);
    expect(result).toEqual(direct);
  });
});

describe('computeAnnotationBBox - freehand', () => {
  it('dispatches to computePointsBBox correctly', () => {
    const annotation: SerializedAnnotation = {
      id: 'f1',
      tool: 'freehand',
      color: '#000000',
      strokeWidth: 4,
      opacity: 1,
      data: { tool: 'freehand', points: new Float64Array([0.1, 0.2, 0.8, 0.9]) },
    };
    const result = computeAnnotationBBox(annotation, viewport);
    // Same as computePointsBBox with strokeWidth 4
    expect(result.x).toBeCloseTo(190); // 192 - 2
    expect(result.y).toBeCloseTo(214); // 216 - 2
  });
});

describe('computeAnnotationBBox - text', () => {
  it('returns zero-area bbox at text position when no ctx provided', () => {
    const annotation: SerializedAnnotation = {
      id: 't1',
      tool: 'text',
      color: '#000000',
      strokeWidth: 0,
      opacity: 1,
      data: { tool: 'text', x: 0.5, y: 0.5, content: 'Hello', fontSize: 0.02 },
    };
    const result = computeAnnotationBBox(annotation, viewport);
    expect(result.x).toBeCloseTo(960);
    expect(result.y).toBeCloseTo(540);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it('uses ctx.measureText for width and font metrics for height', () => {
    const annotation: SerializedAnnotation = {
      id: 't2',
      tool: 'text',
      color: '#000000',
      strokeWidth: 0,
      opacity: 1,
      data: { tool: 'text', x: 0.1, y: 0.5, content: 'Test', fontSize: 0.02 },
    };

    // Mock canvas context
    const mockCtx = {
      font: '',
      measureText: vi.fn().mockReturnValue({
        width: 80,
        actualBoundingBoxAscent: 16,
        actualBoundingBoxDescent: 4,
      }),
    } as unknown as OffscreenCanvasRenderingContext2D;

    const result = computeAnnotationBBox(annotation, viewport, mockCtx);

    // fontSize = 0.02 * 1080 = 21.6px
    expect(mockCtx.font).toBe('21.6px Inter, system-ui, sans-serif');
    expect(mockCtx.measureText).toHaveBeenCalledWith('Test');

    // x = 0.1 * 1920 = 192
    // y = 0.5 * 1080 - 16 (ascent) = 540 - 16 = 524
    // width = 80, height = 16 + 4 = 20
    expect(result.x).toBeCloseTo(192);
    expect(result.y).toBeCloseTo(524);
    expect(result.width).toBeCloseTo(80);
    expect(result.height).toBeCloseTo(20);
  });
});
