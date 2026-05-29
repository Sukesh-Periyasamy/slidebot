import { describe, it, expect } from 'vitest';
import {
  intersects,
  findOverlappingAnnotations,
  findOverlappingDynamicItems,
  type LiveStrokeItem,
  type LaserItem,
  type ActiveStrokeItem,
} from '../overlapQuery';
import type { BoundingBox, ViewportDimensions, SerializedAnnotation } from '../boundingBoxCalculator';

const viewport: ViewportDimensions = { viewportWidth: 1000, viewportHeight: 1000 };

// ─── intersects() ────────────────────────────────────────────────────────────

describe('intersects', () => {
  it('returns true for overlapping boxes', () => {
    const a: BoundingBox = { x: 0, y: 0, width: 100, height: 100 };
    const b: BoundingBox = { x: 50, y: 50, width: 100, height: 100 };
    expect(intersects(a, b)).toBe(true);
  });

  it('returns true when one box contains the other', () => {
    const a: BoundingBox = { x: 0, y: 0, width: 200, height: 200 };
    const b: BoundingBox = { x: 50, y: 50, width: 50, height: 50 };
    expect(intersects(a, b)).toBe(true);
  });

  it('returns false for non-overlapping boxes (separated horizontally)', () => {
    const a: BoundingBox = { x: 0, y: 0, width: 50, height: 50 };
    const b: BoundingBox = { x: 100, y: 0, width: 50, height: 50 };
    expect(intersects(a, b)).toBe(false);
  });

  it('returns false for non-overlapping boxes (separated vertically)', () => {
    const a: BoundingBox = { x: 0, y: 0, width: 50, height: 50 };
    const b: BoundingBox = { x: 0, y: 100, width: 50, height: 50 };
    expect(intersects(a, b)).toBe(false);
  });

  it('returns false for boxes that share only an edge (touching but not overlapping)', () => {
    const a: BoundingBox = { x: 0, y: 0, width: 50, height: 50 };
    const b: BoundingBox = { x: 50, y: 0, width: 50, height: 50 };
    // a.x + a.width === b.x → not strictly less than, so no intersection
    expect(intersects(a, b)).toBe(false);
  });

  it('returns false for zero-width box against a normal box (no area overlap)', () => {
    const a: BoundingBox = { x: 50, y: 0, width: 0, height: 100 };
    const b: BoundingBox = { x: 50, y: 0, width: 100, height: 100 };
    // a.x + a.width = 50, b.x = 50 → a.x + a.width > b.x is false
    expect(intersects(a, b)).toBe(false);
  });

  it('returns false for zero-height box against a normal box (no area overlap)', () => {
    const a: BoundingBox = { x: 0, y: 50, width: 100, height: 0 };
    const b: BoundingBox = { x: 0, y: 50, width: 100, height: 100 };
    expect(intersects(a, b)).toBe(false);
  });

  it('returns false for two zero-area boxes at the same position', () => {
    const a: BoundingBox = { x: 50, y: 50, width: 0, height: 0 };
    const b: BoundingBox = { x: 50, y: 50, width: 0, height: 0 };
    expect(intersects(a, b)).toBe(false);
  });
});

// ─── findOverlappingAnnotations() ────────────────────────────────────────────

describe('findOverlappingAnnotations', () => {
  // Helper to create a freehand annotation with known pixel-space bbox
  function makeFreehandAnnotation(
    id: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    strokeWidth = 0,
  ): SerializedAnnotation {
    // Convert pixel coords to normalized [0,1] for the 1000x1000 viewport
    return {
      id,
      tool: 'freehand',
      color: '#000',
      strokeWidth,
      opacity: 1,
      data: {
        tool: 'freehand',
        points: new Float64Array([x1 / 1000, y1 / 1000, x2 / 1000, y2 / 1000]),
      },
    };
  }

  function makeHighlightAnnotation(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): SerializedAnnotation {
    return {
      id,
      tool: 'highlight',
      color: '#ff0',
      strokeWidth: 0,
      opacity: 0.5,
      data: {
        tool: 'highlight',
        x: x / 1000,
        y: y / 1000,
        width: width / 1000,
        height: height / 1000,
      },
    };
  }

  it('returns annotations that intersect at least one dirty region', () => {
    const annotations = [
      makeHighlightAnnotation('a1', 100, 100, 200, 200), // bbox: (100,100,200,200)
      makeHighlightAnnotation('a2', 500, 500, 100, 100), // bbox: (500,500,100,100)
    ];
    const regions: BoundingBox[] = [{ x: 150, y: 150, width: 50, height: 50 }];

    const result = findOverlappingAnnotations(annotations, regions, viewport);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('a1');
  });

  it('excludes annotations that do not intersect any dirty region', () => {
    const annotations = [
      makeHighlightAnnotation('a1', 0, 0, 50, 50),
      makeHighlightAnnotation('a2', 800, 800, 100, 100),
    ];
    const regions: BoundingBox[] = [{ x: 400, y: 400, width: 50, height: 50 }];

    const result = findOverlappingAnnotations(annotations, regions, viewport);
    expect(result).toHaveLength(0);
  });

  it('preserves insertion order in results', () => {
    const annotations = [
      makeHighlightAnnotation('oldest', 100, 100, 200, 200),
      makeHighlightAnnotation('middle', 150, 150, 200, 200),
      makeHighlightAnnotation('newest', 200, 200, 200, 200),
    ];
    // Region that overlaps all three
    const regions: BoundingBox[] = [{ x: 200, y: 200, width: 100, height: 100 }];

    const result = findOverlappingAnnotations(annotations, regions, viewport);
    expect(result).toHaveLength(3);
    expect(result[0]!.id).toBe('oldest');
    expect(result[1]!.id).toBe('middle');
    expect(result[2]!.id).toBe('newest');
  });

  it('includes annotation if it intersects any one of multiple dirty regions', () => {
    const annotations = [
      makeHighlightAnnotation('a1', 100, 100, 50, 50),
      makeHighlightAnnotation('a2', 800, 800, 50, 50),
    ];
    const regions: BoundingBox[] = [
      { x: 0, y: 0, width: 50, height: 50 }, // doesn't hit either
      { x: 810, y: 810, width: 20, height: 20 }, // hits a2
    ];

    const result = findOverlappingAnnotations(annotations, regions, viewport);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('a2');
  });

  it('returns empty array when regions list is empty', () => {
    const annotations = [makeHighlightAnnotation('a1', 100, 100, 200, 200)];
    const result = findOverlappingAnnotations(annotations, [], viewport);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when annotations list is empty', () => {
    const regions: BoundingBox[] = [{ x: 0, y: 0, width: 500, height: 500 }];
    const result = findOverlappingAnnotations([], regions, viewport);
    expect(result).toHaveLength(0);
  });

  it('handles freehand annotations with stroke width expansion', () => {
    // Freehand at (100,100)-(200,200) with strokeWidth=20 → bbox expands by 10 each side
    // Resulting bbox: (90, 90, 130, 130) approximately
    const annotations = [makeFreehandAnnotation('f1', 100, 100, 200, 200, 20)];
    // Region that only overlaps the expanded area
    const regions: BoundingBox[] = [{ x: 85, y: 85, width: 10, height: 10 }];

    const result = findOverlappingAnnotations(annotations, regions, viewport);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('f1');
  });
});

// ─── findOverlappingDynamicItems() ───────────────────────────────────────────

describe('findOverlappingDynamicItems', () => {
  function makeLiveStroke(userId: string, x1: number, y1: number, x2: number, y2: number, strokeWidth = 4): LiveStrokeItem {
    return {
      userId,
      points: new Float64Array([x1 / 1000, y1 / 1000, x2 / 1000, y2 / 1000]),
      strokeWidth,
    };
  }

  function makeLaser(userId: string, x1: number, y1: number, x2: number, y2: number): LaserItem {
    return {
      userId,
      trail: new Float64Array([x1 / 1000, y1 / 1000, x2 / 1000, y2 / 1000]),
    };
  }

  function makeActiveStroke(x1: number, y1: number, x2: number, y2: number, strokeWidth = 4): ActiveStrokeItem {
    return {
      points: new Float64Array([x1 / 1000, y1 / 1000, x2 / 1000, y2 / 1000]),
      strokeWidth,
    };
  }

  it('returns live strokes that intersect dirty regions', () => {
    const liveStrokes = [
      makeLiveStroke('user-a', 100, 100, 200, 200),
      makeLiveStroke('user-b', 800, 800, 900, 900),
    ];
    const regions: BoundingBox[] = [{ x: 150, y: 150, width: 50, height: 50 }];

    const result = findOverlappingDynamicItems(liveStrokes, [], null, regions, viewport);
    expect(result.liveStrokes).toHaveLength(1);
    expect(result.liveStrokes[0]!.userId).toBe('user-a');
  });

  it('returns lasers that intersect dirty regions', () => {
    const lasers = [
      makeLaser('user-x', 500, 500, 600, 600),
      makeLaser('user-y', 50, 50, 60, 60),
    ];
    const regions: BoundingBox[] = [{ x: 520, y: 520, width: 30, height: 30 }];

    const result = findOverlappingDynamicItems([], lasers, null, regions, viewport);
    expect(result.lasers).toHaveLength(1);
    expect(result.lasers[0]!.userId).toBe('user-x');
  });

  it('detects active stroke overlap', () => {
    const activeStroke = makeActiveStroke(300, 300, 400, 400);
    const regions: BoundingBox[] = [{ x: 350, y: 350, width: 20, height: 20 }];

    const result = findOverlappingDynamicItems([], [], activeStroke, regions, viewport);
    expect(result.activeStrokeOverlaps).toBe(true);
  });

  it('returns false for active stroke when it does not overlap', () => {
    const activeStroke = makeActiveStroke(300, 300, 400, 400);
    const regions: BoundingBox[] = [{ x: 0, y: 0, width: 10, height: 10 }];

    const result = findOverlappingDynamicItems([], [], activeStroke, regions, viewport);
    expect(result.activeStrokeOverlaps).toBe(false);
  });

  it('returns live strokes sorted by userId ascending', () => {
    const liveStrokes = [
      makeLiveStroke('user-c', 100, 100, 200, 200),
      makeLiveStroke('user-a', 100, 100, 200, 200),
      makeLiveStroke('user-b', 100, 100, 200, 200),
    ];
    // Region that overlaps all strokes
    const regions: BoundingBox[] = [{ x: 90, y: 90, width: 200, height: 200 }];

    const result = findOverlappingDynamicItems(liveStrokes, [], null, regions, viewport);
    expect(result.liveStrokes).toHaveLength(3);
    expect(result.liveStrokes[0]!.userId).toBe('user-a');
    expect(result.liveStrokes[1]!.userId).toBe('user-b');
    expect(result.liveStrokes[2]!.userId).toBe('user-c');
  });

  it('returns lasers sorted by userId ascending', () => {
    const lasers = [
      makeLaser('user-z', 500, 500, 600, 600),
      makeLaser('user-m', 500, 500, 600, 600),
      makeLaser('user-a', 500, 500, 600, 600),
    ];
    const regions: BoundingBox[] = [{ x: 490, y: 490, width: 200, height: 200 }];

    const result = findOverlappingDynamicItems([], lasers, null, regions, viewport);
    expect(result.lasers).toHaveLength(3);
    expect(result.lasers[0]!.userId).toBe('user-a');
    expect(result.lasers[1]!.userId).toBe('user-m');
    expect(result.lasers[2]!.userId).toBe('user-z');
  });

  it('returns empty results when regions list is empty', () => {
    const liveStrokes = [makeLiveStroke('user-a', 100, 100, 200, 200)];
    const lasers = [makeLaser('user-b', 500, 500, 600, 600)];
    const activeStroke = makeActiveStroke(300, 300, 400, 400);

    const result = findOverlappingDynamicItems(liveStrokes, lasers, activeStroke, [], viewport);
    expect(result.liveStrokes).toHaveLength(0);
    expect(result.lasers).toHaveLength(0);
    expect(result.activeStrokeOverlaps).toBe(false);
  });

  it('handles null active stroke gracefully', () => {
    const regions: BoundingBox[] = [{ x: 0, y: 0, width: 1000, height: 1000 }];
    const result = findOverlappingDynamicItems([], [], null, regions, viewport);
    expect(result.activeStrokeOverlaps).toBe(false);
  });
});
