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
  DirtyRegionDeferredWork,
} from '../frameBudgetScheduler';
import { WorkerAnnotationCache } from '../annotationCache';
import { DegradationController } from '../degradationController';
import type { SerializedAnnotation } from '../../types/renderCommand.types';

// ─── Mock Time Source ────────────────────────────────────────────────────────

class MockTimeSource {
  private currentTime = 0;

  now = (): number => {
    return this.currentTime;
  };

  advance(ms: number): void {
    this.currentTime += ms;
  }
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Full-clear fallback correctness safeguards (Task 9.1)', () => {
  let timeSource: MockTimeSource;

  beforeEach(() => {
    timeSource = new MockTimeSource();
  });

  describe('z-order correctness on full clear (Req 5.3, 10.1, 10.2)', () => {
    it('renders items in correct z-order: Committed (oldest-to-newest), Live_Strokes (userId asc), Lasers (userId asc), Active_Stroke', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('ann-oldest'));
      cache.set(createAnnotation('ann-middle'));
      cache.set(createAnnotation('ann-newest'));

      // Use unsorted userId keys to verify sorting
      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('userC', createLiveStroke('userC'));
      liveStrokes.set('userA', createLiveStroke('userA'));
      liveStrokes.set('userB', createLiveStroke('userB'));

      const lasers = new Map<string, LaserState>();
      lasers.set('laserZ', createLaser('laserZ'));
      lasers.set('laserM', createLaser('laserM'));
      lasers.set('laserA', createLaser('laserA'));

      const state = createState({
        cache,
        liveStrokes,
        lasers,
        activeStroke: createActiveStroke(),
      });

      const callOrder: string[] = [];
      const renderFns: RenderFunctions = {
        renderAnnotation: vi.fn((_, ann) => callOrder.push(`annotation:${ann.id}`)),
        renderLiveStroke: vi.fn((_, stroke) => callOrder.push(`liveStroke:${stroke.userId}`)),
        renderLaser: vi.fn((_, laser) => callOrder.push(`laser:${laser.userId}`)),
        renderActiveStroke: vi.fn(() => callOrder.push('activeStroke')),
      };

      // Full clear path (no dirtyFrame provided)
      scheduler.executeBudgetedRender(state, renderFns);

      expect(callOrder).toEqual([
        // Committed annotations oldest-to-newest (insertion order)
        'annotation:ann-oldest',
        'annotation:ann-middle',
        'annotation:ann-newest',
        // Live strokes by userId ascending
        'liveStroke:userA',
        'liveStroke:userB',
        'liveStroke:userC',
        // Lasers by userId ascending
        'laser:laserA',
        'laser:laserM',
        'laser:laserZ',
        // Active stroke on top
        'activeStroke',
      ]);
    });

    it('renders in same z-order when full clear is triggered via dirtyFrame.useFullClear', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('ann1'));
      cache.set(createAnnotation('ann2'));

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('userB', createLiveStroke('userB'));
      liveStrokes.set('userA', createLiveStroke('userA'));

      const lasers = new Map<string, LaserState>();
      lasers.set('laserB', createLaser('laserB'));
      lasers.set('laserA', createLaser('laserA'));

      const state = createState({
        cache,
        liveStrokes,
        lasers,
        activeStroke: createActiveStroke(),
      });

      const dirtyFrame: DirtyFrameResult = {
        useFullClear: true,
        regions: [],
        totalDirtyArea: 0,
        coverageRatio: 0.7,
      };

      const callOrder: string[] = [];
      const renderFns: RenderFunctions = {
        renderAnnotation: vi.fn((_, ann) => callOrder.push(`annotation:${ann.id}`)),
        renderLiveStroke: vi.fn((_, stroke) => callOrder.push(`liveStroke:${stroke.userId}`)),
        renderLaser: vi.fn((_, laser) => callOrder.push(`laser:${laser.userId}`)),
        renderActiveStroke: vi.fn(() => callOrder.push('activeStroke')),
      };

      scheduler.executeBudgetedRender(state, renderFns, dirtyFrame);

      expect(callOrder).toEqual([
        'annotation:ann1',
        'annotation:ann2',
        'liveStroke:userA',
        'liveStroke:userB',
        'laser:laserA',
        'laser:laserB',
        'activeStroke',
      ]);
    });

    it('clears entire canvas before rendering on full clear', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const state = createState();
      const renderFns: RenderFunctions = {
        renderAnnotation: vi.fn(),
        renderLiveStroke: vi.fn(),
        renderLaser: vi.fn(),
        renderActiveStroke: vi.fn(),
      };

      scheduler.executeBudgetedRender(state, renderFns);

      expect(state.ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
      expect(state.ctx.clearRect).toHaveBeenCalledTimes(1);
    });
  });

  describe('deferred dirty-region work discarding on full clear (Req 5.6)', () => {
    it('discards existing deferred dirty-region work when full clear is triggered', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;

      // First, create deferred dirty-region work via a partial render
      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');
      const state = createState();
      const dirtyFrame: DirtyFrameResult = {
        useFullClear: false,
        regions: [{ x: 0, y: 0, width: 800, height: 600 }],
        totalDirtyArea: 480000,
        coverageRatio: 1.0,
      };
      const overlapping: OverlappingItemSet = {
        annotations: [ann1, ann2],
        liveStrokes: [],
        lasers: [],
        activeStrokeOverlaps: false,
      };

      // Each item costs 5ms, budget is 2ms → defers after first item
      const renderFns1: RenderFunctions = {
        renderAnnotation: vi.fn(() => timeSource.advance(5)),
        renderLiveStroke: vi.fn(),
        renderLaser: vi.fn(),
        renderActiveStroke: vi.fn(),
      };

      scheduler.executeBudgetedRender(state, renderFns1, dirtyFrame, overlapping);
      expect(scheduler.getDeferredDirtyRegionWork()).not.toBeNull();

      // Now trigger a full clear render (no dirtyFrame → full clear path)
      timeSource = new MockTimeSource();
      (scheduler as any).getNow = timeSource.now;
      const renderFns2: RenderFunctions = {
        renderAnnotation: vi.fn(),
        renderLiveStroke: vi.fn(),
        renderLaser: vi.fn(),
        renderActiveStroke: vi.fn(),
      };

      // Full clear should discard the deferred dirty-region work
      scheduler.executeBudgetedRender(state, renderFns2);

      expect(scheduler.getDeferredDirtyRegionWork()).toBeNull();
    });

    it('discards deferred dirty-region work when dirtyFrame.useFullClear is true', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;

      // Create deferred dirty-region work
      const ann1 = createAnnotation('ann1');
      const ann2 = createAnnotation('ann2');
      const state = createState();
      const dirtyFrame: DirtyFrameResult = {
        useFullClear: false,
        regions: [{ x: 0, y: 0, width: 800, height: 600 }],
        totalDirtyArea: 480000,
        coverageRatio: 1.0,
      };
      const overlapping: OverlappingItemSet = {
        annotations: [ann1, ann2],
        liveStrokes: [],
        lasers: [],
        activeStrokeOverlaps: false,
      };

      const renderFns1: RenderFunctions = {
        renderAnnotation: vi.fn(() => timeSource.advance(5)),
        renderLiveStroke: vi.fn(),
        renderLaser: vi.fn(),
        renderActiveStroke: vi.fn(),
      };

      scheduler.executeBudgetedRender(state, renderFns1, dirtyFrame, overlapping);
      expect(scheduler.getDeferredDirtyRegionWork()).not.toBeNull();

      // Now trigger full clear via dirtyFrame.useFullClear = true
      timeSource = new MockTimeSource();
      (scheduler as any).getNow = timeSource.now;
      const fullClearFrame: DirtyFrameResult = {
        useFullClear: true,
        regions: [],
        totalDirtyArea: 0,
        coverageRatio: 0.8,
      };
      const renderFns2: RenderFunctions = {
        renderAnnotation: vi.fn(),
        renderLiveStroke: vi.fn(),
        renderLaser: vi.fn(),
        renderActiveStroke: vi.fn(),
      };

      scheduler.executeBudgetedRender(state, renderFns2, fullClearFrame);

      expect(scheduler.getDeferredDirtyRegionWork()).toBeNull();
    });
  });

  describe('full clear produces identical output regardless of dirty region state (Req 10.1)', () => {
    it('produces same render calls whether triggered by no dirtyFrame or by useFullClear=true', () => {
      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('ann1'));
      cache.set(createAnnotation('ann2'));

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('userA', createLiveStroke('userA'));

      const lasers = new Map<string, LaserState>();
      lasers.set('laserA', createLaser('laserA'));

      // Run 1: no dirtyFrame (full clear path)
      const scheduler1 = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler1 as any).getNow = timeSource.now;
      const state1 = createState({ cache, liveStrokes, lasers, activeStroke: createActiveStroke() });
      const callOrder1: string[] = [];
      const renderFns1: RenderFunctions = {
        renderAnnotation: vi.fn((_, ann) => callOrder1.push(`annotation:${ann.id}`)),
        renderLiveStroke: vi.fn((_, stroke) => callOrder1.push(`liveStroke:${stroke.userId}`)),
        renderLaser: vi.fn((_, laser) => callOrder1.push(`laser:${laser.userId}`)),
        renderActiveStroke: vi.fn(() => callOrder1.push('activeStroke')),
      };
      scheduler1.executeBudgetedRender(state1, renderFns1);

      // Run 2: dirtyFrame with useFullClear=true
      timeSource = new MockTimeSource();
      const scheduler2 = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler2 as any).getNow = timeSource.now;
      const state2 = createState({ cache, liveStrokes, lasers, activeStroke: createActiveStroke() });
      const callOrder2: string[] = [];
      const renderFns2: RenderFunctions = {
        renderAnnotation: vi.fn((_, ann) => callOrder2.push(`annotation:${ann.id}`)),
        renderLiveStroke: vi.fn((_, stroke) => callOrder2.push(`liveStroke:${stroke.userId}`)),
        renderLaser: vi.fn((_, laser) => callOrder2.push(`laser:${laser.userId}`)),
        renderActiveStroke: vi.fn(() => callOrder2.push('activeStroke')),
      };
      const dirtyFrame: DirtyFrameResult = {
        useFullClear: true,
        regions: [],
        totalDirtyArea: 0,
        coverageRatio: 0.8,
      };
      scheduler2.executeBudgetedRender(state2, renderFns2, dirtyFrame);

      // Both should produce identical render call sequences
      expect(callOrder1).toEqual(callOrder2);
    });

    it('full clear with prior dirty regions produces same output as clean full clear', () => {
      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('ann1'));

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('userA', createLiveStroke('userA'));

      // Scheduler with some prior deferred work (simulating dirty region state)
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const state = createState({ cache, liveStrokes, activeStroke: createActiveStroke() });

      const callOrder: string[] = [];
      const renderFns: RenderFunctions = {
        renderAnnotation: vi.fn((_, ann) => callOrder.push(`annotation:${ann.id}`)),
        renderLiveStroke: vi.fn((_, stroke) => callOrder.push(`liveStroke:${stroke.userId}`)),
        renderLaser: vi.fn(),
        renderActiveStroke: vi.fn(() => callOrder.push('activeStroke')),
      };

      // Full clear should render everything in correct z-order
      scheduler.executeBudgetedRender(state, renderFns);

      expect(callOrder).toEqual([
        'annotation:ann1',
        'liveStroke:userA',
        'activeStroke',
      ]);
    });
  });
});
