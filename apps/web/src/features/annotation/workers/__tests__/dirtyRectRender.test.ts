import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FrameBudgetScheduler } from '../frameBudgetScheduler';
import type {
  BudgetRenderState,
  RenderFunctions,
  LiveStrokeState,
  ActiveStrokeState,
  LaserState,
  DirtyFrameResult,
  OverlappingItemSet,
} from '../frameBudgetScheduler';
import { WorkerAnnotationCache } from '../annotationCache';
import { DegradationController } from '../degradationController';
import type { SerializedAnnotation } from '../../types/renderCommand.types';

// ─── Mock Time Source ────────────────────────────────────────────────────────

class MockTimeSource {
  private currentTime = 0;
  private perCallCost = 0;

  now = (): number => {
    return this.currentTime;
  };

  advance(ms: number): void {
    this.currentTime += ms;
  }

  setPerCallCost(ms: number): void {
    this.perCallCost = ms;
  }

  advanceOnRender = (): void => {
    this.currentTime += this.perCallCost;
  };
}

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockCanvas(): OffscreenCanvas {
  return {
    width: 800,
    height: 600,
    getContext: vi.fn(),
  } as unknown as OffscreenCanvas;
}

function createMockCtx(): OffscreenCanvasRenderingContext2D {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    setLineDash: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    closePath: vi.fn(),
  } as unknown as OffscreenCanvasRenderingContext2D;
}

function createAnnotation(id: string): SerializedAnnotation {
  return {
    id,
    tool: 'freehand',
    color: '#000000',
    strokeWidth: 2,
    opacity: 1,
    data: { tool: 'freehand', points: new Float64Array([0.1, 0.1, 0.5, 0.5]) },
  };
}

function createLiveStroke(userId: string): LiveStrokeState {
  return {
    userId,
    color: '#ff0000',
    strokeWidth: 2,
    opacity: 1,
    points: new Float64Array([0.2, 0.2, 0.6, 0.6]),
  };
}

function createLaser(userId: string): LaserState {
  return {
    userId,
    color: '#00ff00',
    trail: new Float64Array([0.3, 0.3, 0.7, 0.7]),
  };
}

function createActiveStroke(): ActiveStrokeState {
  return {
    config: { tool: 'freehand', color: '#0000ff', strokeWidth: 3, opacity: 1 },
    points: new Float64Array([0.1, 0.1, 0.4, 0.4, 0.8, 0.8]),
  };
}

function createState(overrides?: Partial<BudgetRenderState>): BudgetRenderState {
  return {
    canvas: createMockCanvas(),
    ctx: createMockCtx(),
    viewportWidth: 800,
    viewportHeight: 600,
    cache: new WorkerAnnotationCache(),
    liveStrokes: new Map(),
    activeStroke: null,
    lasers: new Map(),
    degradationController: new DegradationController('normal'),
    ...overrides,
  };
}

function createRenderFns(timeSource?: MockTimeSource): RenderFunctions {
  return {
    renderAnnotation: vi.fn(() => timeSource?.advanceOnRender()),
    renderLiveStroke: vi.fn(() => timeSource?.advanceOnRender()),
    renderLaser: vi.fn(() => timeSource?.advanceOnRender()),
    renderActiveStroke: vi.fn(() => timeSource?.advanceOnRender()),
  };
}

function createDirtyFrame(regions: { x: number; y: number; width: number; height: number }[]): DirtyFrameResult {
  const totalDirtyArea = regions.reduce((sum, r) => sum + r.width * r.height, 0);
  return {
    useFullClear: false,
    regions,
    totalDirtyArea,
    coverageRatio: totalDirtyArea / (800 * 600),
  };
}

function createOverlappingItems(overrides?: Partial<OverlappingItemSet>): OverlappingItemSet {
  return {
    annotations: [],
    liveStrokes: [],
    lasers: [],
    activeStrokeOverlaps: false,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FrameBudgetScheduler.executeBudgetedRender() — dirty rectangle rendering', () => {
  let timeSource: MockTimeSource;

  beforeEach(() => {
    timeSource = new MockTimeSource();
  });

  describe('clip path construction', () => {
    it('builds clip path from dirty regions using ctx.rect() calls', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const state = createState();
      const renderFns = createRenderFns();
      const dirtyFrame = createDirtyFrame([
        { x: 10, y: 20, width: 100, height: 50 },
        { x: 200, y: 300, width: 80, height: 60 },
      ]);
      const overlapping = createOverlappingItems();

      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      expect(state.ctx.save).toHaveBeenCalledTimes(1);
      expect(state.ctx.beginPath).toHaveBeenCalledTimes(1);
      expect(state.ctx.rect).toHaveBeenCalledTimes(2);
      expect(state.ctx.rect).toHaveBeenCalledWith(10, 20, 100, 50);
      expect(state.ctx.rect).toHaveBeenCalledWith(200, 300, 80, 60);
      expect(state.ctx.clip).toHaveBeenCalledTimes(1);
      expect(state.ctx.restore).toHaveBeenCalledTimes(1);
    });

    it('calls save before clip and restore after rendering', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const state = createState();
      const callOrder: string[] = [];
      (state.ctx.save as any).mockImplementation(() => callOrder.push('save'));
      (state.ctx.beginPath as any).mockImplementation(() => callOrder.push('beginPath'));
      (state.ctx.rect as any).mockImplementation(() => callOrder.push('rect'));
      (state.ctx.clip as any).mockImplementation(() => callOrder.push('clip'));
      (state.ctx.clearRect as any).mockImplementation(() => callOrder.push('clearRect'));
      (state.ctx.restore as any).mockImplementation(() => callOrder.push('restore'));

      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 50, height: 50 }]);
      const overlapping = createOverlappingItems();
      const renderFns = createRenderFns();

      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      expect(callOrder.indexOf('save')).toBeLessThan(callOrder.indexOf('clip'));
      expect(callOrder.indexOf('clip')).toBeLessThan(callOrder.indexOf('clearRect'));
      expect(callOrder.indexOf('clearRect')).toBeLessThan(callOrder.indexOf('restore'));
    });
  });

  describe('clearRect per dirty region', () => {
    it('calls clearRect for each dirty region', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const state = createState();
      const renderFns = createRenderFns();
      const dirtyFrame = createDirtyFrame([
        { x: 10, y: 20, width: 100, height: 50 },
        { x: 200, y: 300, width: 80, height: 60 },
        { x: 400, y: 100, width: 30, height: 30 },
      ]);
      const overlapping = createOverlappingItems();

      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      expect(state.ctx.clearRect).toHaveBeenCalledTimes(3);
      expect(state.ctx.clearRect).toHaveBeenCalledWith(10, 20, 100, 50);
      expect(state.ctx.clearRect).toHaveBeenCalledWith(200, 300, 80, 60);
      expect(state.ctx.clearRect).toHaveBeenCalledWith(400, 100, 30, 30);
    });

    it('clears regions even when no items overlap (erases previous content)', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const state = createState();
      const renderFns = createRenderFns();
      const dirtyFrame = createDirtyFrame([{ x: 50, y: 50, width: 200, height: 200 }]);
      const overlapping = createOverlappingItems(); // no items overlap

      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      expect(state.ctx.clearRect).toHaveBeenCalledWith(50, 50, 200, 200);
      expect(renderFns.renderAnnotation).not.toHaveBeenCalled();
      expect(renderFns.renderLiveStroke).not.toHaveBeenCalled();
      expect(renderFns.renderLaser).not.toHaveBeenCalled();
      expect(renderFns.renderActiveStroke).not.toHaveBeenCalled();
    });
  });

  describe('z-order rendering within clip', () => {
    it('renders items in z-order: annotations (oldest-to-newest), live strokes, lasers, active stroke', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('userA', createLiveStroke('userA'));

      const lasers = new Map<string, LaserState>();
      lasers.set('userB', createLaser('userB'));

      const state = createState({
        activeStroke: createActiveStroke(),
        liveStrokes,
        lasers,
      });

      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 800, height: 600 }]);
      const overlapping = createOverlappingItems({
        annotations: [ann1, ann2], // oldest-to-newest
        liveStrokes: ['userA'],
        lasers: ['userB'],
        activeStrokeOverlaps: true,
      });

      const callOrder: string[] = [];
      const renderFns: RenderFunctions = {
        renderAnnotation: vi.fn((_, ann) => callOrder.push(`annotation:${ann.id}`)),
        renderLiveStroke: vi.fn((_, stroke) => callOrder.push(`liveStroke:${stroke.userId}`)),
        renderLaser: vi.fn((_, laser) => callOrder.push(`laser:${laser.userId}`)),
        renderActiveStroke: vi.fn(() => callOrder.push('activeStroke')),
      };

      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      expect(callOrder).toEqual([
        'annotation:ann1',
        'annotation:ann2',
        'liveStroke:userA',
        'laser:userB',
        'activeStroke',
      ]);
    });

    it('renders only overlapping items, not all items in state', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');
      const ann3 = createAnnotation('ann3');

      const cache = new WorkerAnnotationCache();
      cache.set(ann1);
      cache.set(ann2);
      cache.set(ann3);

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('userA', createLiveStroke('userA'));
      liveStrokes.set('userB', createLiveStroke('userB'));

      const state = createState({ cache, liveStrokes });

      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 100, height: 100 }]);
      // Only ann1 and userA overlap the dirty region
      const overlapping = createOverlappingItems({
        annotations: [ann1],
        liveStrokes: ['userA'],
        lasers: [],
        activeStrokeOverlaps: false,
      });

      const renderFns = createRenderFns();

      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      expect(renderFns.renderAnnotation).toHaveBeenCalledTimes(1);
      expect(renderFns.renderLiveStroke).toHaveBeenCalledTimes(1);
      expect(renderFns.renderActiveStroke).not.toHaveBeenCalled();
    });
  });

  describe('budget enforcement with dirty regions', () => {
    it('defers remaining items when budget exceeded', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 3 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(2);

      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');
      const ann3 = createAnnotation('ann3');

      const state = createState();
      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 800, height: 600 }]);
      const overlapping = createOverlappingItems({
        annotations: [ann1, ann2, ann3],
      });

      const renderFns = createRenderFns(timeSource);

      const result = scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      // First annotation: 2ms (not over 3ms budget)
      // Second annotation: 4ms (over 3ms budget) -> defer remaining
      expect(renderFns.renderAnnotation).toHaveBeenCalledTimes(2);
      expect(result.hadDeferral).toBe(true);
    });

    it('renders at least one item before checking budget', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 1 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(5); // Each item costs 5ms, way over 1ms budget

      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');

      const state = createState();
      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 800, height: 600 }]);
      const overlapping = createOverlappingItems({
        annotations: [ann1, ann2],
      });

      const renderFns = createRenderFns(timeSource);

      const result = scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      // At least one item must be rendered even if over budget
      expect(renderFns.renderAnnotation).toHaveBeenCalledTimes(1);
      expect(result.hadDeferral).toBe(true);
    });

    it('defers live strokes and subsequent categories when annotations exhaust budget', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 3 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(4); // Each item costs 4ms

      // Only one annotation so it completes the annotation category,
      // then budget is exceeded before live strokes start
      const ann1 = createAnnotation('ann1');
      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('userA', createLiveStroke('userA'));

      const lasers = new Map<string, LaserState>();
      lasers.set('userB', createLaser('userB'));

      const state = createState({ liveStrokes, lasers, activeStroke: createActiveStroke() });
      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 800, height: 600 }]);
      const overlapping = createOverlappingItems({
        annotations: [ann1],
        liveStrokes: ['userA'],
        lasers: ['userB'],
        activeStrokeOverlaps: true,
      });

      const renderFns = createRenderFns(timeSource);

      const result = scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      // First annotation rendered (4ms > 3ms budget), guaranteed first item
      // Annotation category completes (only 1 annotation)
      // Live stroke is the second item overall (totalItemsRendered=2), rendered then budget check triggers
      expect(renderFns.renderAnnotation).toHaveBeenCalledTimes(1);
      expect(renderFns.renderLiveStroke).toHaveBeenCalledTimes(1);
      // Lasers and active stroke are deferred
      expect(renderFns.renderLaser).not.toHaveBeenCalled();
      expect(renderFns.renderActiveStroke).not.toHaveBeenCalled();
      expect(result.hadDeferral).toBe(true);
    });
  });

  describe('per-category timing attribution', () => {
    it('attributes render time to correct categories regardless of dirty region', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const ann1 = createAnnotation('ann1');
      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('userA', createLiveStroke('userA'));
      const lasers = new Map<string, LaserState>();
      lasers.set('userB', createLaser('userB'));

      const state = createState({
        activeStroke: createActiveStroke(),
        liveStrokes,
        lasers,
      });

      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 800, height: 600 }]);
      const overlapping = createOverlappingItems({
        annotations: [ann1],
        liveStrokes: ['userA'],
        lasers: ['userB'],
        activeStrokeOverlaps: true,
      });

      // Each category takes different time
      const renderFns: RenderFunctions = {
        renderAnnotation: vi.fn(() => timeSource.advance(2)),
        renderLiveStroke: vi.fn(() => timeSource.advance(3)),
        renderLaser: vi.fn(() => timeSource.advance(1)),
        renderActiveStroke: vi.fn(() => timeSource.advance(4)),
      };

      const result = scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      expect(result.categoryTimings.committedAnnotationsMs).toBe(2);
      expect(result.categoryTimings.liveStrokesMs).toBe(3);
      expect(result.categoryTimings.lasersMs).toBe(1);
      expect(result.categoryTimings.activeStrokeMs).toBe(4);
      expect(result.totalDurationMs).toBe(10);
    });
  });

  describe('full clear fallback behavior unchanged', () => {
    it('uses full-canvas clear when dirtyFrame.useFullClear is true', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const state = createState({ activeStroke: createActiveStroke() });
      const renderFns = createRenderFns();
      const dirtyFrame: DirtyFrameResult = {
        useFullClear: true,
        regions: [],
        totalDirtyArea: 0,
        coverageRatio: 0,
      };
      const overlapping = createOverlappingItems({ activeStrokeOverlaps: true });

      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      // Should use full-canvas clear behavior
      expect(state.ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
      expect(state.ctx.save).not.toHaveBeenCalled();
      expect(state.ctx.clip).not.toHaveBeenCalled();
      // Active stroke rendered unconditionally in full-clear mode
      expect(renderFns.renderActiveStroke).toHaveBeenCalledTimes(1);
    });

    it('uses full-canvas clear when no dirtyFrame is provided', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const state = createState({ activeStroke: createActiveStroke() });
      const renderFns = createRenderFns();

      scheduler.executeBudgetedRender(state, renderFns);

      // Should use full-canvas clear behavior
      expect(state.ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
      expect(state.ctx.save).not.toHaveBeenCalled();
      expect(state.ctx.clip).not.toHaveBeenCalled();
      expect(renderFns.renderActiveStroke).toHaveBeenCalledTimes(1);
    });

    it('uses full-canvas clear when dirtyFrame has empty regions', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const state = createState({ activeStroke: createActiveStroke() });
      const renderFns = createRenderFns();
      const dirtyFrame: DirtyFrameResult = {
        useFullClear: false,
        regions: [],
        totalDirtyArea: 0,
        coverageRatio: 0,
      };
      const overlapping = createOverlappingItems();

      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      // Empty regions should fall back to full-canvas clear
      expect(state.ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
      expect(state.ctx.save).not.toHaveBeenCalled();
    });

    it('uses full-canvas clear when overlappingItems is not provided', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const state = createState({ activeStroke: createActiveStroke() });
      const renderFns = createRenderFns();
      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 100, height: 100 }]);

      // No overlappingItems parameter
      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame);

      // Should fall back to full-canvas clear
      expect(state.ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
      expect(state.ctx.save).not.toHaveBeenCalled();
    });
  });

  describe('metrics recording', () => {
    it('records metrics for dirty rect render passes', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(2);

      const ann1 = createAnnotation('ann1');
      const state = createState();
      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 100, height: 100 }]);
      const overlapping = createOverlappingItems({ annotations: [ann1] });
      const renderFns = createRenderFns(timeSource);

      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      const metrics = scheduler.getMetrics();
      expect(metrics.windowSize).toBe(1);
    });
  });

  describe('deferred dirty region work', () => {
    it('stores deferred dirty region work when budget exceeded', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(5);

      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');

      const state = createState();
      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 800, height: 600 }]);
      const overlapping = createOverlappingItems({
        annotations: [ann1, ann2],
      });

      const renderFns = createRenderFns(timeSource);

      const result = scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      expect(result.hadDeferral).toBe(true);
      expect(scheduler.hasDeferredWork()).toBe(true);
      expect(scheduler.getDeferredDirtyRegionWork()).not.toBeNull();
      expect(scheduler.getDeferredDirtyRegionWork()!.dirtyRegions).toEqual(dirtyFrame.regions);
    });

    it('discards deferred dirty region work on discardDeferredWork()', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(5);

      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');

      const state = createState();
      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 800, height: 600 }]);
      const overlapping = createOverlappingItems({
        annotations: [ann1, ann2],
      });

      const renderFns = createRenderFns(timeSource);
      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      expect(scheduler.getDeferredDirtyRegionWork()).not.toBeNull();

      scheduler.discardDeferredWork();

      expect(scheduler.getDeferredDirtyRegionWork()).toBeNull();
      expect(scheduler.hasDeferredWork()).toBe(false);
    });

    it('hasDeferredWork() returns true when only dirty region deferred work exists', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(5);

      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');

      const state = createState();
      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 800, height: 600 }]);
      const overlapping = createOverlappingItems({
        annotations: [ann1, ann2],
      });

      const renderFns = createRenderFns(timeSource);
      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      // Verify hasDeferredWork detects dirty region deferred work
      expect(scheduler.hasDeferredWork()).toBe(true);
      expect(scheduler.getDeferredDirtyRegionWork()).not.toBeNull();
    });
  });

  describe('follow-up frame resumption for dirty regions', () => {
    it('resumes from deferred item index on follow-up frame', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 3 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(2);

      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');
      const ann3 = createAnnotation('ann3');
      const ann4 = createAnnotation('ann4');

      const state = createState();
      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 800, height: 600 }]);
      const overlapping = createOverlappingItems({
        annotations: [ann1, ann2, ann3, ann4],
      });

      const renderFns = createRenderFns(timeSource);

      // First frame: renders ann1 (2ms), ann2 (4ms > 3ms budget) → defers at index 2
      const result1 = scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);
      expect(result1.hadDeferral).toBe(true);
      expect(renderFns.renderAnnotation).toHaveBeenCalledTimes(2);
      expect(scheduler.getDeferredDirtyRegionWork()!.itemResumeIndex).toBe(2);

      // Reset time and render fns for follow-up frame
      timeSource = new MockTimeSource();
      timeSource.setPerCallCost(2);
      (scheduler as any).getNow = timeSource.now;
      const renderFns2 = createRenderFns(timeSource);

      // Follow-up frame: resumes from index 2, renders ann3 (2ms), ann4 (4ms > 3ms) → defers at index 3
      const result2 = scheduler.executeBudgetedRender(state, renderFns2);
      expect(result2.hadDeferral).toBe(true);
      expect(renderFns2.renderAnnotation).toHaveBeenCalledTimes(2);
      // Should have rendered ann3 and ann4 (indices 2 and 3)
      expect(renderFns2.renderAnnotation).toHaveBeenCalledWith(
        state.ctx, ann3, 800, 600, expect.anything(),
      );
      expect(renderFns2.renderAnnotation).toHaveBeenCalledWith(
        state.ctx, ann4, 800, 600, expect.anything(),
      );
    });

    it('re-applies clip path for all dirty regions on follow-up frame', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(5);

      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');

      const state = createState();
      const dirtyFrame = createDirtyFrame([
        { x: 10, y: 20, width: 100, height: 50 },
        { x: 200, y: 300, width: 80, height: 60 },
      ]);
      const overlapping = createOverlappingItems({
        annotations: [ann1, ann2],
      });

      const renderFns = createRenderFns(timeSource);

      // First frame: renders ann1, defers ann2
      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);
      expect(scheduler.getDeferredDirtyRegionWork()).not.toBeNull();

      // Reset mocks for follow-up frame
      vi.clearAllMocks();
      timeSource = new MockTimeSource();
      timeSource.setPerCallCost(1);
      (scheduler as any).getNow = timeSource.now;
      const renderFns2 = createRenderFns(timeSource);

      // Follow-up frame: should re-apply clip for all dirty regions
      scheduler.executeBudgetedRender(state, renderFns2);

      expect(state.ctx.save).toHaveBeenCalledTimes(1);
      expect(state.ctx.beginPath).toHaveBeenCalledTimes(1);
      expect(state.ctx.rect).toHaveBeenCalledTimes(2);
      expect(state.ctx.rect).toHaveBeenCalledWith(10, 20, 100, 50);
      expect(state.ctx.rect).toHaveBeenCalledWith(200, 300, 80, 60);
      expect(state.ctx.clip).toHaveBeenCalledTimes(1);
      expect(state.ctx.restore).toHaveBeenCalledTimes(1);
    });

    it('completes all items across multiple follow-up frames', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(3); // Each item costs 3ms, budget is 2ms

      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');
      const ann3 = createAnnotation('ann3');

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('userA', createLiveStroke('userA'));

      const state = createState({ liveStrokes });
      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 800, height: 600 }]);
      const overlapping = createOverlappingItems({
        annotations: [ann1, ann2, ann3],
        liveStrokes: ['userA'],
      });

      // Frame 1: renders ann1 (3ms > 2ms budget, but guaranteed first item) → defers at index 1
      const renderFns1 = createRenderFns(timeSource);
      const result1 = scheduler.executeBudgetedRender(state, renderFns1, dirtyFrame, overlapping);
      expect(result1.hadDeferral).toBe(true);
      expect(renderFns1.renderAnnotation).toHaveBeenCalledTimes(1);
      expect(scheduler.getDeferredDirtyRegionWork()!.itemResumeIndex).toBe(1);

      // Frame 2: resumes from index 1, renders ann2 (3ms > 2ms) → defers at index 2
      timeSource = new MockTimeSource();
      timeSource.setPerCallCost(3);
      (scheduler as any).getNow = timeSource.now;
      const renderFns2 = createRenderFns(timeSource);
      const result2 = scheduler.executeBudgetedRender(state, renderFns2);
      expect(result2.hadDeferral).toBe(true);
      expect(renderFns2.renderAnnotation).toHaveBeenCalledTimes(1);
      expect(scheduler.getDeferredDirtyRegionWork()!.itemResumeIndex).toBe(2);

      // Frame 3: resumes from index 2, renders ann3 (3ms > 2ms) → defers at index 3
      timeSource = new MockTimeSource();
      timeSource.setPerCallCost(3);
      (scheduler as any).getNow = timeSource.now;
      const renderFns3 = createRenderFns(timeSource);
      const result3 = scheduler.executeBudgetedRender(state, renderFns3);
      expect(result3.hadDeferral).toBe(true);
      expect(renderFns3.renderAnnotation).toHaveBeenCalledTimes(1);
      expect(scheduler.getDeferredDirtyRegionWork()!.itemResumeIndex).toBe(3);

      // Frame 4: resumes from index 3, renders liveStroke userA → completes
      timeSource = new MockTimeSource();
      timeSource.setPerCallCost(1);
      (scheduler as any).getNow = timeSource.now;
      const renderFns4 = createRenderFns(timeSource);
      const result4 = scheduler.executeBudgetedRender(state, renderFns4);
      expect(result4.hadDeferral).toBe(false);
      expect(renderFns4.renderLiveStroke).toHaveBeenCalledTimes(1);
      expect(scheduler.getDeferredDirtyRegionWork()).toBeNull();
      expect(scheduler.hasDeferredWork()).toBe(false);
    });

    it('content-affecting command discards dirty region deferred work', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(5);

      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');

      const state = createState();
      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 800, height: 600 }]);
      const overlapping = createOverlappingItems({
        annotations: [ann1, ann2],
      });

      const renderFns = createRenderFns(timeSource);
      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      // Verify deferred work exists
      expect(scheduler.hasDeferredWork()).toBe(true);
      expect(scheduler.getDeferredDirtyRegionWork()).not.toBeNull();

      // Content-affecting command arrives
      const result = scheduler.handleContentAffectingCommand('ANNOTATION_UPDATE');
      expect(result).toBe(true);

      // All deferred work should be discarded
      expect(scheduler.hasDeferredWork()).toBe(false);
      expect(scheduler.getDeferredWork()).toBeNull();
      expect(scheduler.getDeferredDirtyRegionWork()).toBeNull();
    });

    it('SLIDE_CHANGE discards dirty region deferred work', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(5);

      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');

      const state = createState();
      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 800, height: 600 }]);
      const overlapping = createOverlappingItems({
        annotations: [ann1, ann2],
      });

      const renderFns = createRenderFns(timeSource);
      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame, overlapping);

      expect(scheduler.hasDeferredWork()).toBe(true);

      const result = scheduler.handleContentAffectingCommand('SLIDE_CHANGE');
      expect(result).toBe(true);
      expect(scheduler.hasDeferredWork()).toBe(false);
      expect(scheduler.getDeferredDirtyRegionWork()).toBeNull();
    });

    it('follow-up frame renders live strokes and lasers after annotations complete', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(3);

      const ann1 = createAnnotation('ann1');
      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('userA', createLiveStroke('userA'));
      const lasers = new Map<string, LaserState>();
      lasers.set('userB', createLaser('userB'));

      const state = createState({
        liveStrokes,
        lasers,
        activeStroke: createActiveStroke(),
      });
      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 800, height: 600 }]);
      const overlapping = createOverlappingItems({
        annotations: [ann1],
        liveStrokes: ['userA'],
        lasers: ['userB'],
        activeStrokeOverlaps: true,
      });

      // Frame 1: renders ann1 (3ms, first item guaranteed), then liveStroke userA (6ms > 2ms budget)
      // After liveStroke, totalItemsRendered=2 and budget exceeded → defers at index 2
      const renderFns1 = createRenderFns(timeSource);
      scheduler.executeBudgetedRender(state, renderFns1, dirtyFrame, overlapping);
      expect(scheduler.getDeferredDirtyRegionWork()!.itemResumeIndex).toBe(2);

      // Frame 2: budget is generous, renders remaining items (laser userB, active stroke)
      timeSource = new MockTimeSource();
      timeSource.setPerCallCost(0.5);
      (scheduler as any).getNow = timeSource.now;
      const renderFns2 = createRenderFns(timeSource);
      const result2 = scheduler.executeBudgetedRender(state, renderFns2);

      expect(result2.hadDeferral).toBe(false);
      expect(renderFns2.renderLaser).toHaveBeenCalledTimes(1);
      expect(renderFns2.renderActiveStroke).toHaveBeenCalledTimes(1);
      expect(scheduler.getDeferredDirtyRegionWork()).toBeNull();
    });

    it('forceComplete renders all remaining items when maxFollowUpFrames reached', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 1, maxFollowUpFrames: 2 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(5);

      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');
      const ann3 = createAnnotation('ann3');

      const state = createState();
      const dirtyFrame = createDirtyFrame([{ x: 0, y: 0, width: 800, height: 600 }]);
      const overlapping = createOverlappingItems({
        annotations: [ann1, ann2, ann3],
      });

      // Frame 1: renders ann1, defers rest
      const renderFns1 = createRenderFns(timeSource);
      scheduler.executeBudgetedRender(state, renderFns1, dirtyFrame, overlapping);
      expect(scheduler.getDeferredDirtyRegionWork()).not.toBeNull();

      // Simulate follow-up count reaching maxFollowUpFrames
      scheduler.incrementFollowUpCount();
      scheduler.incrementFollowUpCount();

      // Frame 2 (forceComplete): should render all remaining items regardless of budget
      timeSource = new MockTimeSource();
      timeSource.setPerCallCost(5);
      (scheduler as any).getNow = timeSource.now;
      const renderFns2 = createRenderFns(timeSource);
      const result2 = scheduler.executeBudgetedRender(state, renderFns2);

      // All remaining items should be rendered (ann2, ann3)
      expect(result2.hadDeferral).toBe(false);
      expect(renderFns2.renderAnnotation).toHaveBeenCalledTimes(2);
      expect(scheduler.getDeferredDirtyRegionWork()).toBeNull();
    });
  });
});
