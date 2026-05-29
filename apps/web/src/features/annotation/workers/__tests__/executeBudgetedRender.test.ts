import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FrameBudgetScheduler } from '../frameBudgetScheduler';
import type {
  BudgetRenderState,
  RenderFunctions,
  LiveStrokeState,
  ActiveStrokeState,
  LaserState,
} from '../frameBudgetScheduler';
import { WorkerAnnotationCache } from '../annotationCache';
import { DegradationController } from '../degradationController';
import type { SerializedAnnotation } from '../../types/renderCommand.types';

// ─── Mock Time Source ────────────────────────────────────────────────────────

class MockTimeSource {
  private currentTime = 0;
  private perCallCost = 0;
  private callCount = 0;

  now = (): number => {
    return this.currentTime;
  };

  advance(ms: number): void {
    this.currentTime += ms;
  }

  setPerCallCost(ms: number): void {
    this.perCallCost = ms;
  }

  /** Advance time by perCallCost on each render call. */
  advanceOnRender = (): void => {
    this.callCount++;
    this.currentTime += this.perCallCost;
  };

  reset(): void {
    this.currentTime = 0;
    this.perCallCost = 0;
    this.callCount = 0;
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FrameBudgetScheduler.executeBudgetedRender()', () => {
  let timeSource: MockTimeSource;

  beforeEach(() => {
    timeSource = new MockTimeSource();
  });

  describe('canvas clearing', () => {
    it('clears the entire canvas at the start of every frame', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      // Override getNow
      (scheduler as any).getNow = timeSource.now;

      const state = createState();
      const renderFns = createRenderFns();

      scheduler.executeBudgetedRender(state, renderFns);

      expect(state.ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
      expect(state.ctx.clearRect).toHaveBeenCalledTimes(1);
    });
  });

  describe('active stroke rendering', () => {
    it('renders active stroke when no other items are deferred', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const state = createState({ activeStroke: createActiveStroke() });
      const renderFns = createRenderFns();

      scheduler.executeBudgetedRender(state, renderFns);

      expect(renderFns.renderActiveStroke).toHaveBeenCalledTimes(1);
    });

    it('does not render active stroke when null', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      (scheduler as any).getNow = timeSource.now;

      const state = createState({ activeStroke: null });
      const renderFns = createRenderFns();

      scheduler.executeBudgetedRender(state, renderFns);

      expect(renderFns.renderActiveStroke).not.toHaveBeenCalled();
    });
  });

  describe('priority ordering', () => {
    it('renders in z-order: Committed_Annotations (oldest-to-newest), Live_Strokes (userId asc), Lasers (userId asc), Active_Stroke', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('user1', createLiveStroke('user1'));

      const lasers = new Map<string, LaserState>();
      lasers.set('user2', createLaser('user2'));

      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('ann1'));

      const state = createState({
        activeStroke: createActiveStroke(),
        liveStrokes,
        lasers,
        cache,
      });

      const callOrder: string[] = [];
      const renderFns: RenderFunctions = {
        renderActiveStroke: vi.fn(() => callOrder.push('activeStroke')),
        renderLiveStroke: vi.fn(() => callOrder.push('liveStroke')),
        renderLaser: vi.fn(() => callOrder.push('laser')),
        renderAnnotation: vi.fn(() => callOrder.push('annotation')),
      };

      scheduler.executeBudgetedRender(state, renderFns);

      expect(callOrder).toEqual(['annotation', 'liveStroke', 'laser', 'activeStroke']);
    });
  });

  describe('budget enforcement - live strokes', () => {
    it('defers remaining live strokes when budget exceeded after an item', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(4); // Each render call costs 4ms

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('user1', createLiveStroke('user1'));
      liveStrokes.set('user2', createLiveStroke('user2'));
      liveStrokes.set('user3', createLiveStroke('user3'));

      const state = createState({ liveStrokes });
      const renderFns = createRenderFns(timeSource);

      const result = scheduler.executeBudgetedRender(state, renderFns);

      // First stroke rendered (4ms), over budget (>6ms), second rendered (8ms > 6ms)
      // After first item: 4ms, not over budget yet
      // After second item: 8ms, over budget -> defer user3
      expect(renderFns.renderLiveStroke).toHaveBeenCalledTimes(2);
      expect(result.hadDeferral).toBe(true);
      expect(result.deferredWork?.liveStrokes).toEqual(['user3']);
    });

    it('guarantees at least one live stroke is rendered even if over budget after it', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(5); // Each render costs 5ms, exceeds 2ms budget

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('user1', createLiveStroke('user1'));
      liveStrokes.set('user2', createLiveStroke('user2'));

      const state = createState({ liveStrokes });
      const renderFns = createRenderFns(timeSource);

      const result = scheduler.executeBudgetedRender(state, renderFns);

      // At least one item must be rendered
      expect(renderFns.renderLiveStroke).toHaveBeenCalledTimes(1);
      expect(result.hadDeferral).toBe(true);
      expect(result.deferredWork?.liveStrokes).toEqual(['user2']);
    });

    it('skips live strokes entirely if budget exceeded before category starts', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;

      // Annotations take 5ms, exceeding the 2ms budget before live strokes start
      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('ann1'));

      const state = createState({
        liveStrokes: new Map([['user1', createLiveStroke('user1')]]),
        cache,
      });

      const renderFns: RenderFunctions = {
        renderActiveStroke: vi.fn(),
        renderLiveStroke: vi.fn(),
        renderLaser: vi.fn(),
        renderAnnotation: vi.fn(() => timeSource.advance(5)),
      };

      const result = scheduler.executeBudgetedRender(state, renderFns);

      // Annotation rendered (guaranteed first item), budget exceeded
      // Live strokes should be deferred
      expect(renderFns.renderAnnotation).toHaveBeenCalledTimes(1);
      expect(renderFns.renderLiveStroke).not.toHaveBeenCalled();
      expect(result.hadDeferral).toBe(true);
      expect(result.deferredWork?.liveStrokes).toContain('user1');
    });
  });

  describe('budget enforcement - lasers', () => {
    it('defers all lasers when live strokes were deferred', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(5);

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('user1', createLiveStroke('user1'));
      liveStrokes.set('user2', createLiveStroke('user2'));

      const lasers = new Map<string, LaserState>();
      lasers.set('laser1', createLaser('laser1'));

      const state = createState({ liveStrokes, lasers });
      const renderFns = createRenderFns(timeSource);

      const result = scheduler.executeBudgetedRender(state, renderFns);

      // With new z-order: annotations first (none), then live strokes
      // First live stroke rendered (guaranteed first item), budget exceeded → defer user2
      // Lasers deferred because live strokes were deferred
      expect(renderFns.renderLaser).not.toHaveBeenCalled();
      expect(result.deferredWork?.lasers).toContain('laser1');
    });

    it('skips lasers entirely if budget exceeded before category starts', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 3 });
      (scheduler as any).getNow = timeSource.now;

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('user1', createLiveStroke('user1'));

      const lasers = new Map<string, LaserState>();
      lasers.set('laser1', createLaser('laser1'));

      const state = createState({ liveStrokes, lasers });

      const renderFns: RenderFunctions = {
        renderActiveStroke: vi.fn(),
        renderLiveStroke: vi.fn(() => timeSource.advance(5)), // 5ms > 3ms budget
        renderLaser: vi.fn(),
        renderAnnotation: vi.fn(),
      };

      const result = scheduler.executeBudgetedRender(state, renderFns);

      // Live stroke rendered (guaranteed first), but budget exceeded
      // Lasers should be skipped entirely
      expect(renderFns.renderLaser).not.toHaveBeenCalled();
      expect(result.deferredWork?.lasers).toContain('laser1');
    });
  });

  describe('budget enforcement - committed annotations', () => {
    it('renders annotations in oldest-to-newest order (insertion order)', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('oldest'));
      cache.set(createAnnotation('middle'));
      cache.set(createAnnotation('newest'));

      const state = createState({ cache });
      const renderedIds: string[] = [];
      const renderFns: RenderFunctions = {
        renderActiveStroke: vi.fn(),
        renderLiveStroke: vi.fn(),
        renderLaser: vi.fn(),
        renderAnnotation: vi.fn((_, ann) => renderedIds.push(ann.id)),
      };

      scheduler.executeBudgetedRender(state, renderFns);

      expect(renderedIds).toEqual(['oldest', 'middle', 'newest']);
    });

    it('defers remaining annotations when budget exceeded', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 3 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(2);

      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('ann1'));
      cache.set(createAnnotation('ann2'));
      cache.set(createAnnotation('ann3'));

      const state = createState({ cache });
      const renderFns = createRenderFns(timeSource);

      const result = scheduler.executeBudgetedRender(state, renderFns);

      // First annotation: 2ms (not over 3ms budget)
      // Second annotation: 4ms (over 3ms budget) -> defer remaining
      expect(renderFns.renderAnnotation).toHaveBeenCalledTimes(2);
      expect(result.hadDeferral).toBe(true);
      expect(result.deferredWork?.committedAnnotationResumeIndex).toBe(2);
      expect(result.deferredWork?.committedAnnotationTotal).toBe(3);
    });

    it('defers live strokes and lasers when annotations exhaust budget', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(5);

      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('ann1'));

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('user1', createLiveStroke('user1'));

      const state = createState({ liveStrokes, cache });
      const renderFns = createRenderFns(timeSource);

      const result = scheduler.executeBudgetedRender(state, renderFns);

      // Annotation rendered (guaranteed first item), budget exceeded
      // Live strokes and lasers should be deferred
      expect(renderFns.renderAnnotation).toHaveBeenCalledTimes(1);
      expect(renderFns.renderLiveStroke).not.toHaveBeenCalled();
      expect(result.hadDeferral).toBe(true);
      expect(result.deferredWork?.liveStrokes).toContain('user1');
    });
  });

  describe('deferred work resumption', () => {
    it('resumes live strokes from deferred work', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      // Set up deferred work from a previous frame
      scheduler.setDeferredWork({
        liveStrokes: ['user2', 'user3'],
        lasers: [],
        committedAnnotationResumeIndex: 0,
        committedAnnotationTotal: 0,
      });

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('user1', createLiveStroke('user1'));
      liveStrokes.set('user2', createLiveStroke('user2'));
      liveStrokes.set('user3', createLiveStroke('user3'));

      const state = createState({ liveStrokes });
      const renderedUserIds: string[] = [];
      const renderFns: RenderFunctions = {
        renderActiveStroke: vi.fn(),
        renderLiveStroke: vi.fn((_, stroke) => renderedUserIds.push(stroke.userId)),
        renderLaser: vi.fn(),
        renderAnnotation: vi.fn(),
      };

      scheduler.executeBudgetedRender(state, renderFns);

      // Should only render user2 and user3 (from deferred work), not user1
      expect(renderedUserIds).toEqual(['user2', 'user3']);
    });

    it('resumes committed annotations from deferred resume index', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('ann1'));
      cache.set(createAnnotation('ann2'));
      cache.set(createAnnotation('ann3'));
      cache.set(createAnnotation('ann4'));

      // Deferred from index 2 (already rendered indices 0 and 1 in oldest-to-newest order)
      scheduler.setDeferredWork({
        liveStrokes: [],
        lasers: [],
        committedAnnotationResumeIndex: 2,
        committedAnnotationTotal: 4,
      });

      const state = createState({ cache });
      const renderedIds: string[] = [];
      const renderFns: RenderFunctions = {
        renderActiveStroke: vi.fn(),
        renderLiveStroke: vi.fn(),
        renderLaser: vi.fn(),
        renderAnnotation: vi.fn((_, ann) => renderedIds.push(ann.id)),
      };

      scheduler.executeBudgetedRender(state, renderFns);

      // Annotations in cache: [ann1, ann2, ann3, ann4] (insertion order)
      // Oldest-to-newest: [ann1, ann2, ann3, ann4]
      // Resume from index 2: should render ann3, ann4
      expect(renderedIds).toEqual(['ann3', 'ann4']);
    });
  });

  describe('metrics recording', () => {
    it('records frame metrics after each render pass', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      (scheduler as any).getNow = timeSource.now;

      const state = createState();
      const renderFns = createRenderFns();

      scheduler.executeBudgetedRender(state, renderFns);

      const metrics = scheduler.getMetrics();
      expect(metrics.windowSize).toBe(1);
    });

    it('records budget utilization correctly', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(3);

      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('ann1'));

      const state = createState({ cache });
      const renderFns = createRenderFns(timeSource);

      scheduler.executeBudgetedRender(state, renderFns);

      const metrics = scheduler.getMetrics();
      // Total duration should be 3ms (one annotation render), budget is 6ms
      // Utilization = 3/6 = 0.5
      expect(metrics.overallBudgetUtilization).toBe(0.5);
    });

    it('records hadDeferral correctly when work is deferred', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(5);

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('user1', createLiveStroke('user1'));
      liveStrokes.set('user2', createLiveStroke('user2'));

      const state = createState({ liveStrokes });
      const renderFns = createRenderFns(timeSource);

      scheduler.executeBudgetedRender(state, renderFns);

      const metrics = scheduler.getMetrics();
      expect(metrics.deferredFrameCount).toBe(1);
    });
  });

  describe('force complete (convergence guarantee)', () => {
    it('renders all items when follow-up count exceeds maxFollowUpFrames', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 1, maxFollowUpFrames: 10 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(5); // Each item costs 5ms, way over 1ms budget

      // Simulate 10 follow-up frames already occurred
      for (let i = 0; i < 10; i++) {
        scheduler.incrementFollowUpCount();
      }

      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('ann1'));
      cache.set(createAnnotation('ann2'));
      cache.set(createAnnotation('ann3'));

      const state = createState({ cache });
      const renderFns = createRenderFns(timeSource);

      const result = scheduler.executeBudgetedRender(state, renderFns);

      // All annotations should be rendered despite being over budget
      expect(renderFns.renderAnnotation).toHaveBeenCalledTimes(3);
      expect(result.hadDeferral).toBe(false);
    });
  });

  describe('empty categories', () => {
    it('handles empty state with no items gracefully', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      (scheduler as any).getNow = timeSource.now;

      const state = createState();
      const renderFns = createRenderFns();

      const result = scheduler.executeBudgetedRender(state, renderFns);

      expect(result.hadDeferral).toBe(false);
      expect(result.deferredWork).toBeNull();
      expect(renderFns.renderActiveStroke).not.toHaveBeenCalled();
      expect(renderFns.renderLiveStroke).not.toHaveBeenCalled();
      expect(renderFns.renderLaser).not.toHaveBeenCalled();
      expect(renderFns.renderAnnotation).not.toHaveBeenCalled();
    });

    it('skips empty categories without consuming measurable budget', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      (scheduler as any).getNow = timeSource.now;

      // Only annotations, no live strokes or lasers
      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('ann1'));

      const state = createState({ cache });
      const renderFns = createRenderFns();

      const result = scheduler.executeBudgetedRender(state, renderFns);

      expect(result.hadDeferral).toBe(false);
      expect(renderFns.renderAnnotation).toHaveBeenCalledTimes(1);
    });
  });

  describe('return value', () => {
    it('returns correct result when no deferral occurs', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 100 });
      (scheduler as any).getNow = timeSource.now;

      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('ann1'));

      const state = createState({ cache });
      const renderFns = createRenderFns();

      const result = scheduler.executeBudgetedRender(state, renderFns);

      expect(result.hadDeferral).toBe(false);
      expect(result.deferredWork).toBeNull();
      expect(result.categoryTimings).toBeDefined();
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns deferred work descriptor when deferral occurs', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 2 });
      (scheduler as any).getNow = timeSource.now;
      timeSource.setPerCallCost(5);

      const cache = new WorkerAnnotationCache();
      cache.set(createAnnotation('ann1'));
      cache.set(createAnnotation('ann2'));

      const liveStrokes = new Map<string, LiveStrokeState>();
      liveStrokes.set('user1', createLiveStroke('user1'));

      const lasers = new Map<string, LaserState>();
      lasers.set('laser1', createLaser('laser1'));

      const state = createState({ liveStrokes, lasers, cache });
      const renderFns = createRenderFns(timeSource);

      const result = scheduler.executeBudgetedRender(state, renderFns);

      // With new z-order: annotations first (oldest-to-newest)
      // ann1 rendered (5ms, guaranteed first), budget exceeded → defer ann2
      // Live strokes and lasers deferred because annotations were deferred
      expect(result.hadDeferral).toBe(true);
      expect(result.deferredWork).not.toBeNull();
      expect(result.deferredWork!.committedAnnotationResumeIndex).toBe(1);
      expect(result.deferredWork!.committedAnnotationTotal).toBe(2);
      expect(result.deferredWork!.liveStrokes.length).toBeGreaterThan(0);
      expect(result.deferredWork!.lasers.length).toBeGreaterThan(0);
    });
  });
});
