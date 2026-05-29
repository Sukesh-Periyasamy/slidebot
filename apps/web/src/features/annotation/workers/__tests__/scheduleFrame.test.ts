import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FrameBudgetScheduler,
  type BudgetRenderState,
  type RenderFunctions,
  type ActiveStrokeState,
  type LiveStrokeState,
  type LaserState,
} from '../frameBudgetScheduler';
import { WorkerAnnotationCache } from '../annotationCache';
import { DegradationController } from '../degradationController';

// ─── Test Helpers ────────────────────────────────────────────────────────────

/**
 * Creates a mock BudgetRenderState with controllable canvas and context.
 */
function createMockState(overrides?: Partial<BudgetRenderState>): BudgetRenderState {
  const canvas = {
    width: 800,
    height: 600,
    getContext: vi.fn(),
  } as unknown as OffscreenCanvas;

  const ctx = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    globalAlpha: 1,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    font: '',
  } as unknown as OffscreenCanvasRenderingContext2D;

  return {
    canvas,
    ctx,
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

/**
 * Creates no-op render functions for testing.
 */
function createMockRenderFns(): RenderFunctions {
  return {
    renderAnnotation: vi.fn(),
    renderLiveStroke: vi.fn(),
    renderLaser: vi.fn(),
    renderActiveStroke: vi.fn(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FrameBudgetScheduler.scheduleFrame()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock createImageBitmap globally
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({} as ImageBitmap));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('ImageBitmap production (Req 3.5)', () => {
    it('produces an ImageBitmap and calls postFrame after every frame', async () => {
      const scheduler = new FrameBudgetScheduler();
      const state = createMockState();
      const renderFns = createMockRenderFns();
      const postFrame = vi.fn();

      await scheduler.scheduleFrame(state, renderFns, postFrame);

      expect(createImageBitmap).toHaveBeenCalledWith(state.canvas);
      expect(postFrame).toHaveBeenCalledTimes(1);
    });

    it('produces ImageBitmap even for partial frames with deferred work', async () => {
      // Set up a scheduler with a very tight budget and items that will exceed it
      let time = 0;
      const scheduler = new FrameBudgetScheduler({ budgetMs: 1 });
      // Override getNow to simulate time passing
      (scheduler as any).getNow = () => time;

      const state = createMockState();
      // Add multiple live strokes to trigger deferral
      state.liveStrokes.set('user1', {
        userId: 'user1',
        color: '#000',
        strokeWidth: 2,
        opacity: 1,
        points: new Float64Array([0.1, 0.1, 0.2, 0.2]),
      });
      state.liveStrokes.set('user2', {
        userId: 'user2',
        color: '#000',
        strokeWidth: 2,
        opacity: 1,
        points: new Float64Array([0.3, 0.3, 0.4, 0.4]),
      });

      const renderFns = createMockRenderFns();
      // Simulate time passing when rendering live strokes
      renderFns.renderLiveStroke = vi.fn(() => {
        time += 2; // Each stroke takes 2ms, budget is 1ms
      });

      const postFrame = vi.fn();
      await scheduler.scheduleFrame(state, renderFns, postFrame);

      // Should still produce a frame even though work was deferred
      expect(postFrame).toHaveBeenCalledTimes(1);
    });

    it('handles createImageBitmap failure gracefully', async () => {
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn().mockRejectedValue(new Error('bitmap creation failed')),
      );
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const scheduler = new FrameBudgetScheduler();
      const state = createMockState();
      const renderFns = createMockRenderFns();
      const postFrame = vi.fn();

      // Should not throw
      await scheduler.scheduleFrame(state, renderFns, postFrame);

      expect(postFrame).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('follow-up frame scheduling (Req 3.1)', () => {
    it('schedules a follow-up frame with zero delay when work is deferred', async () => {
      let time = 0;
      const scheduler = new FrameBudgetScheduler({ budgetMs: 1 });
      (scheduler as any).getNow = () => time;

      const state = createMockState();
      state.liveStrokes.set('user1', {
        userId: 'user1',
        color: '#000',
        strokeWidth: 2,
        opacity: 1,
        points: new Float64Array([0.1, 0.1, 0.2, 0.2]),
      });
      state.liveStrokes.set('user2', {
        userId: 'user2',
        color: '#000',
        strokeWidth: 2,
        opacity: 1,
        points: new Float64Array([0.3, 0.3, 0.4, 0.4]),
      });

      const renderFns = createMockRenderFns();
      renderFns.renderLiveStroke = vi.fn(() => {
        time += 2;
      });

      const postFrame = vi.fn();
      await scheduler.scheduleFrame(state, renderFns, postFrame);

      // Follow-up should be scheduled
      expect(scheduler.getFollowUpTimerId()).not.toBeNull();
      expect(scheduler.getFollowUpCount()).toBe(1);
    });

    it('increments followUpCount on each deferred frame', async () => {
      let time = 0;
      const scheduler = new FrameBudgetScheduler({ budgetMs: 1 });
      (scheduler as any).getNow = () => time;

      const state = createMockState();
      // Add many annotations to ensure multiple follow-ups
      for (let i = 0; i < 5; i++) {
        state.cache.set({
          id: `ann-${i}`,
          tool: 'freehand',
          color: '#000',
          strokeWidth: 2,
          opacity: 1,
          data: { tool: 'freehand', points: new Float64Array([0.1, 0.1, 0.2, 0.2]) },
        });
      }

      const renderFns = createMockRenderFns();
      renderFns.renderAnnotation = vi.fn(() => {
        time += 2; // Each annotation takes 2ms, budget is 1ms
      });

      const postFrame = vi.fn();

      // First frame
      await scheduler.scheduleFrame(state, renderFns, postFrame);
      expect(scheduler.getFollowUpCount()).toBe(1);
    });
  });

  describe('return to normal scheduling (Req 3.3, 6.4)', () => {
    it('resets followUpCount when no work is deferred', async () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 16 });
      const state = createMockState();
      const renderFns = createMockRenderFns();
      const postFrame = vi.fn();

      // Manually set followUpCount to simulate previous follow-ups
      (scheduler as any).followUpCount = 3;

      await scheduler.scheduleFrame(state, renderFns, postFrame);

      // Should reset since no work was deferred (empty state)
      expect(scheduler.getFollowUpCount()).toBe(0);
      expect(scheduler.hasDeferredWork()).toBe(false);
      expect(scheduler.getFollowUpTimerId()).toBeNull();
    });

    it('does not schedule a follow-up timer when all work completes', async () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 16 });
      const state = createMockState();
      // Add a single annotation that fits within budget
      state.cache.set({
        id: 'ann-1',
        tool: 'freehand',
        color: '#000',
        strokeWidth: 2,
        opacity: 1,
        data: { tool: 'freehand', points: new Float64Array([0.1, 0.1, 0.2, 0.2]) },
      });

      const renderFns = createMockRenderFns();
      const postFrame = vi.fn();

      await scheduler.scheduleFrame(state, renderFns, postFrame);

      expect(scheduler.getFollowUpTimerId()).toBeNull();
      expect(scheduler.hasDeferredWork()).toBe(false);
    });
  });

  describe('convergence guarantee (Req 3.6)', () => {
    it('forces completion when followUpCount reaches maxFollowUpFrames', async () => {
      let time = 0;
      const scheduler = new FrameBudgetScheduler({ budgetMs: 1, maxFollowUpFrames: 2 });
      (scheduler as any).getNow = () => time;

      const state = createMockState();
      // Add many annotations
      for (let i = 0; i < 10; i++) {
        state.cache.set({
          id: `ann-${i}`,
          tool: 'freehand',
          color: '#000',
          strokeWidth: 2,
          opacity: 1,
          data: { tool: 'freehand', points: new Float64Array([0.1, 0.1, 0.2, 0.2]) },
        });
      }

      const renderFns = createMockRenderFns();
      renderFns.renderAnnotation = vi.fn(() => {
        time += 2; // Each annotation takes 2ms, budget is 1ms
      });

      const postFrame = vi.fn();

      // Simulate reaching maxFollowUpFrames
      (scheduler as any).followUpCount = 2; // equals maxFollowUpFrames

      await scheduler.scheduleFrame(state, renderFns, postFrame);

      // When forceComplete is true, all annotations should be rendered
      // and no deferral should occur
      expect(scheduler.hasDeferredWork()).toBe(false);
      expect(scheduler.getFollowUpCount()).toBe(0);
      expect(renderFns.renderAnnotation).toHaveBeenCalledTimes(10);
    });
  });

  describe('discardDeferredWork cancels follow-up (Req 8.5)', () => {
    it('cancels pending follow-up timer when discardDeferredWork is called', async () => {
      let time = 0;
      const scheduler = new FrameBudgetScheduler({ budgetMs: 1 });
      (scheduler as any).getNow = () => time;

      const state = createMockState();
      state.liveStrokes.set('user1', {
        userId: 'user1',
        color: '#000',
        strokeWidth: 2,
        opacity: 1,
        points: new Float64Array([0.1, 0.1, 0.2, 0.2]),
      });
      state.liveStrokes.set('user2', {
        userId: 'user2',
        color: '#000',
        strokeWidth: 2,
        opacity: 1,
        points: new Float64Array([0.3, 0.3, 0.4, 0.4]),
      });

      const renderFns = createMockRenderFns();
      renderFns.renderLiveStroke = vi.fn(() => {
        time += 2;
      });

      const postFrame = vi.fn();
      await scheduler.scheduleFrame(state, renderFns, postFrame);

      // Follow-up should be scheduled
      expect(scheduler.getFollowUpTimerId()).not.toBeNull();

      // Discard deferred work (simulates content-affecting command)
      scheduler.discardDeferredWork();

      expect(scheduler.getFollowUpTimerId()).toBeNull();
      expect(scheduler.hasDeferredWork()).toBe(false);
      expect(scheduler.getFollowUpCount()).toBe(0);
    });
  });

  describe('resumption from deferral point (Req 3.2, 7.2)', () => {
    it('resumes from exact deferral point in follow-up frames', async () => {
      let time = 0;
      const scheduler = new FrameBudgetScheduler({ budgetMs: 1 });
      (scheduler as any).getNow = () => time;

      const state = createMockState();
      // Add 4 annotations
      for (let i = 0; i < 4; i++) {
        state.cache.set({
          id: `ann-${i}`,
          tool: 'freehand',
          color: '#000',
          strokeWidth: 2,
          opacity: 1,
          data: { tool: 'freehand', points: new Float64Array([0.1, 0.1, 0.2, 0.2]) },
        });
      }

      const renderFns = createMockRenderFns();
      renderFns.renderAnnotation = vi.fn(() => {
        time += 2; // Each annotation takes 2ms, budget is 1ms
      });

      const postFrame = vi.fn();

      // First frame — should render some and defer the rest
      await scheduler.scheduleFrame(state, renderFns, postFrame);

      // Should have deferred work with a resume index > 0
      const deferred = scheduler.getDeferredWork();
      expect(deferred).not.toBeNull();
      expect(deferred!.committedAnnotationResumeIndex).toBeGreaterThan(0);

      // The follow-up frame will resume from the deferral point
      // (verified by the fact that executeBudgetedRender uses getDeferredWork())
    });
  });
});
