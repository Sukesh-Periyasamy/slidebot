import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FrameBudgetScheduler,
  CONTENT_AFFECTING_COMMANDS,
} from '../frameBudgetScheduler';

describe('FrameBudgetScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('uses default config when no config is provided', () => {
      const scheduler = new FrameBudgetScheduler();
      expect(scheduler.budgetMs).toBe(6);
      expect(scheduler.maxFollowUpFrames).toBe(10);
    });

    it('accepts partial config overrides', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 10 });
      expect(scheduler.budgetMs).toBe(10);
      expect(scheduler.maxFollowUpFrames).toBe(10);
    });

    it('accepts full config overrides', () => {
      const scheduler = new FrameBudgetScheduler({
        budgetMs: 12,
        maxFollowUpFrames: 5,
      });
      expect(scheduler.budgetMs).toBe(12);
      expect(scheduler.maxFollowUpFrames).toBe(5);
    });

    it('detects performance.now() as time source when available', () => {
      const scheduler = new FrameBudgetScheduler();
      // In a test environment, performance.now() should be available
      const now = scheduler.getNow();
      expect(typeof now).toBe('number');
      expect(now).toBeGreaterThanOrEqual(0);
    });
  });

  describe('setFrameBudget()', () => {
    it('accepts valid budget value at minimum (1ms)', () => {
      const scheduler = new FrameBudgetScheduler();
      const error = scheduler.setFrameBudget(1);
      expect(error).toBeNull();
      expect(scheduler.budgetMs).toBe(1);
    });

    it('accepts valid budget value at maximum (16ms)', () => {
      const scheduler = new FrameBudgetScheduler();
      const error = scheduler.setFrameBudget(16);
      expect(error).toBeNull();
      expect(scheduler.budgetMs).toBe(16);
    });

    it('accepts valid budget value in range', () => {
      const scheduler = new FrameBudgetScheduler();
      const error = scheduler.setFrameBudget(8);
      expect(error).toBeNull();
      expect(scheduler.budgetMs).toBe(8);
    });

    it('rejects value below minimum and retains current budget', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      const error = scheduler.setFrameBudget(0.5);
      expect(error).not.toBeNull();
      expect(error).toContain('1');
      expect(error).toContain('16');
      expect(scheduler.budgetMs).toBe(6);
    });

    it('rejects value above maximum and retains current budget', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      const error = scheduler.setFrameBudget(17);
      expect(error).not.toBeNull();
      expect(error).toContain('1');
      expect(error).toContain('16');
      expect(scheduler.budgetMs).toBe(6);
    });

    it('rejects non-numeric value (string)', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      const error = scheduler.setFrameBudget('10');
      expect(error).not.toBeNull();
      expect(error).toContain('finite number');
      expect(scheduler.budgetMs).toBe(6);
    });

    it('rejects NaN', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      const error = scheduler.setFrameBudget(NaN);
      expect(error).not.toBeNull();
      expect(error).toContain('finite number');
      expect(scheduler.budgetMs).toBe(6);
    });

    it('rejects Infinity', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      const error = scheduler.setFrameBudget(Infinity);
      expect(error).not.toBeNull();
      expect(error).toContain('finite number');
      expect(scheduler.budgetMs).toBe(6);
    });

    it('rejects negative Infinity', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      const error = scheduler.setFrameBudget(-Infinity);
      expect(error).not.toBeNull();
      expect(error).toContain('finite number');
      expect(scheduler.budgetMs).toBe(6);
    });

    it('rejects null', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      const error = scheduler.setFrameBudget(null);
      expect(error).not.toBeNull();
      expect(scheduler.budgetMs).toBe(6);
    });

    it('rejects undefined', () => {
      const scheduler = new FrameBudgetScheduler({ budgetMs: 6 });
      const error = scheduler.setFrameBudget(undefined);
      expect(error).not.toBeNull();
      expect(scheduler.budgetMs).toBe(6);
    });
  });

  describe('discardDeferredWork()', () => {
    it('clears deferred work state', () => {
      const scheduler = new FrameBudgetScheduler();
      scheduler.setDeferredWork({
        liveStrokes: ['user1', 'user2'],
        lasers: ['user3'],
        committedAnnotationResumeIndex: 5,
        committedAnnotationTotal: 20,
      });
      expect(scheduler.hasDeferredWork()).toBe(true);

      scheduler.discardDeferredWork();
      expect(scheduler.hasDeferredWork()).toBe(false);
      expect(scheduler.getDeferredWork()).toBeNull();
    });

    it('resets follow-up count', () => {
      const scheduler = new FrameBudgetScheduler();
      scheduler.incrementFollowUpCount();
      scheduler.incrementFollowUpCount();
      expect(scheduler.getFollowUpCount()).toBe(2);

      scheduler.discardDeferredWork();
      expect(scheduler.getFollowUpCount()).toBe(0);
    });

    it('cancels pending follow-up timer', () => {
      const scheduler = new FrameBudgetScheduler();
      const timerId = setTimeout(() => {}, 1000);
      scheduler.setFollowUpTimerId(timerId);

      scheduler.discardDeferredWork();
      expect(scheduler.getFollowUpTimerId()).toBeNull();
    });

    it('handles being called when no deferred work exists', () => {
      const scheduler = new FrameBudgetScheduler();
      expect(scheduler.hasDeferredWork()).toBe(false);
      // Should not throw
      scheduler.discardDeferredWork();
      expect(scheduler.hasDeferredWork()).toBe(false);
    });
  });

  describe('hasDeferredWork()', () => {
    it('returns false when no deferred work exists', () => {
      const scheduler = new FrameBudgetScheduler();
      expect(scheduler.hasDeferredWork()).toBe(false);
    });

    it('returns true when deferred work exists', () => {
      const scheduler = new FrameBudgetScheduler();
      scheduler.setDeferredWork({
        liveStrokes: [],
        lasers: [],
        committedAnnotationResumeIndex: 3,
        committedAnnotationTotal: 10,
      });
      expect(scheduler.hasDeferredWork()).toBe(true);
    });
  });

  describe('getMetrics()', () => {
    it('returns zeroed metrics when no frames have been recorded', () => {
      const scheduler = new FrameBudgetScheduler();
      const metrics = scheduler.getMetrics();
      expect(metrics.windowSize).toBe(0);
      expect(metrics.overallBudgetUtilization).toBe(0);
      expect(metrics.deferredFrameCount).toBe(0);
    });

    it('delegates to MetricsTracker.computeStats()', () => {
      const scheduler = new FrameBudgetScheduler();
      const tracker = scheduler.getMetricsTracker();
      tracker.record({
        categoryTimings: {
          activeStrokeMs: 1,
          liveStrokesMs: 2,
          lasersMs: 1,
          committedAnnotationsMs: 3,
        },
        totalDurationMs: 7,
        budgetUtilization: 1.17,
        hadDeferral: true,
      });

      const metrics = scheduler.getMetrics();
      expect(metrics.windowSize).toBe(1);
      expect(metrics.deferredFrameCount).toBe(1);
      expect(metrics.perCategory.activeStrokeMs.avgMs).toBe(1);
      expect(metrics.perCategory.liveStrokesMs.avgMs).toBe(2);
    });
  });

  describe('performance.now() fallback detection', () => {
    it('getNow returns a number', () => {
      const scheduler = new FrameBudgetScheduler();
      const now = scheduler.getNow();
      expect(typeof now).toBe('number');
      expect(Number.isFinite(now)).toBe(true);
    });
  });

  describe('CONTENT_AFFECTING_COMMANDS', () => {
    it('contains all expected content-affecting command types', () => {
      const expected = [
        'ANNOTATION_UPDATE',
        'ANNOTATION_REMOVE',
        'SLIDE_CHANGE',
        'LIVE_STROKE_UPDATE',
        'LIVE_STROKE_COMMIT',
        'LIVE_STROKE_REMOVE',
        'ACTIVE_STROKE_START',
        'ACTIVE_STROKE_POINTS',
        'ACTIVE_STROKE_COMMIT',
        'ACTIVE_STROKE_CANCEL',
        'LASER_UPDATE',
        'LASER_REMOVE',
      ];
      for (const cmd of expected) {
        expect(CONTENT_AFFECTING_COMMANDS.has(cmd)).toBe(true);
      }
      expect(CONTENT_AFFECTING_COMMANDS.size).toBe(expected.length);
    });

    it('does not contain non-content-affecting commands', () => {
      const nonAffecting = [
        'INIT',
        'RESIZE',
        'TERMINATE',
        'SET_DEGRADATION_MODE',
        'SET_FRAME_BUDGET',
        'GET_METRICS',
        'HIT_TEST',
        'REPLAY_START',
        'REPLAY_SEEK',
        'REPLAY_STOP',
      ];
      for (const cmd of nonAffecting) {
        expect(CONTENT_AFFECTING_COMMANDS.has(cmd)).toBe(false);
      }
    });
  });

  describe('handleContentAffectingCommand()', () => {
    it('returns false for non-content-affecting commands', () => {
      const scheduler = new FrameBudgetScheduler();
      expect(scheduler.handleContentAffectingCommand('INIT')).toBe(false);
      expect(scheduler.handleContentAffectingCommand('RESIZE')).toBe(false);
      expect(scheduler.handleContentAffectingCommand('GET_METRICS')).toBe(false);
      expect(scheduler.handleContentAffectingCommand('SET_FRAME_BUDGET')).toBe(false);
      expect(scheduler.handleContentAffectingCommand('HIT_TEST')).toBe(false);
      expect(scheduler.handleContentAffectingCommand('TERMINATE')).toBe(false);
    });

    it('returns false for content-affecting commands when no deferred work exists', () => {
      const scheduler = new FrameBudgetScheduler();
      expect(scheduler.hasDeferredWork()).toBe(false);
      expect(scheduler.handleContentAffectingCommand('ANNOTATION_UPDATE')).toBe(false);
      expect(scheduler.handleContentAffectingCommand('LIVE_STROKE_UPDATE')).toBe(false);
      expect(scheduler.handleContentAffectingCommand('LASER_UPDATE')).toBe(false);
    });

    it('returns true and discards deferred work for content-affecting commands when deferred work exists', () => {
      const scheduler = new FrameBudgetScheduler();
      scheduler.setDeferredWork({
        liveStrokes: ['user1'],
        lasers: ['user2'],
        committedAnnotationResumeIndex: 5,
        committedAnnotationTotal: 20,
      });
      expect(scheduler.hasDeferredWork()).toBe(true);

      const result = scheduler.handleContentAffectingCommand('ANNOTATION_UPDATE');
      expect(result).toBe(true);
      expect(scheduler.hasDeferredWork()).toBe(false);
      expect(scheduler.getDeferredWork()).toBeNull();
    });

    it('cancels pending follow-up timers when discarding deferred work', () => {
      const scheduler = new FrameBudgetScheduler();
      const timerId = setTimeout(() => {}, 1000);
      scheduler.setFollowUpTimerId(timerId);
      scheduler.setDeferredWork({
        liveStrokes: [],
        lasers: [],
        committedAnnotationResumeIndex: 3,
        committedAnnotationTotal: 10,
      });
      scheduler.incrementFollowUpCount();
      scheduler.incrementFollowUpCount();

      scheduler.handleContentAffectingCommand('LIVE_STROKE_COMMIT');
      expect(scheduler.hasDeferredWork()).toBe(false);
      expect(scheduler.getFollowUpTimerId()).toBeNull();
      expect(scheduler.getFollowUpCount()).toBe(0);
    });

    it('SLIDE_CHANGE always discards deferred work even when none exists', () => {
      const scheduler = new FrameBudgetScheduler();
      expect(scheduler.hasDeferredWork()).toBe(false);

      const result = scheduler.handleContentAffectingCommand('SLIDE_CHANGE');
      expect(result).toBe(true);
      expect(scheduler.hasDeferredWork()).toBe(false);
    });

    it('SLIDE_CHANGE discards existing deferred work and cancels follow-ups', () => {
      const scheduler = new FrameBudgetScheduler();
      const timerId = setTimeout(() => {}, 1000);
      scheduler.setFollowUpTimerId(timerId);
      scheduler.setDeferredWork({
        liveStrokes: ['user1', 'user2'],
        lasers: ['user3'],
        committedAnnotationResumeIndex: 10,
        committedAnnotationTotal: 50,
      });
      scheduler.incrementFollowUpCount();
      scheduler.incrementFollowUpCount();
      scheduler.incrementFollowUpCount();

      const result = scheduler.handleContentAffectingCommand('SLIDE_CHANGE');
      expect(result).toBe(true);
      expect(scheduler.hasDeferredWork()).toBe(false);
      expect(scheduler.getDeferredWork()).toBeNull();
      expect(scheduler.getFollowUpTimerId()).toBeNull();
      expect(scheduler.getFollowUpCount()).toBe(0);
    });

    it('handles all content-affecting command types correctly with deferred work', () => {
      const contentAffectingTypes = [
        'ANNOTATION_UPDATE',
        'ANNOTATION_REMOVE',
        'LIVE_STROKE_UPDATE',
        'LIVE_STROKE_COMMIT',
        'LIVE_STROKE_REMOVE',
        'ACTIVE_STROKE_START',
        'ACTIVE_STROKE_POINTS',
        'ACTIVE_STROKE_COMMIT',
        'ACTIVE_STROKE_CANCEL',
        'LASER_UPDATE',
        'LASER_REMOVE',
      ];

      for (const cmdType of contentAffectingTypes) {
        const scheduler = new FrameBudgetScheduler();
        scheduler.setDeferredWork({
          liveStrokes: ['user1'],
          lasers: [],
          committedAnnotationResumeIndex: 2,
          committedAnnotationTotal: 10,
        });

        const result = scheduler.handleContentAffectingCommand(cmdType);
        expect(result).toBe(true);
        expect(scheduler.hasDeferredWork()).toBe(false);
      }
    });

    it('returns false for unknown command types', () => {
      const scheduler = new FrameBudgetScheduler();
      scheduler.setDeferredWork({
        liveStrokes: ['user1'],
        lasers: [],
        committedAnnotationResumeIndex: 0,
        committedAnnotationTotal: 5,
      });

      expect(scheduler.handleContentAffectingCommand('UNKNOWN_COMMAND')).toBe(false);
      // Deferred work should still exist
      expect(scheduler.hasDeferredWork()).toBe(true);
    });
  });
});
