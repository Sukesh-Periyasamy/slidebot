import { describe, it, expect } from 'vitest';
import { TimingContext } from '../timingContext';

describe('TimingContext', () => {
  describe('constructor', () => {
    it('captures startTime at construction using the provided getNow function', () => {
      const getNow = () => 100;
      const ctx = new TimingContext(6, false, getNow);
      expect(ctx.startTime).toBe(100);
    });

    it('stores the budgetMs value', () => {
      const ctx = new TimingContext(8, false, () => 0);
      expect(ctx.budgetMs).toBe(8);
    });

    it('stores the forceComplete flag', () => {
      const ctx = new TimingContext(6, true, () => 0);
      expect(ctx.forceComplete).toBe(true);
    });

    it('defaults forceComplete to false', () => {
      const ctx = new TimingContext(6, undefined, () => 0);
      expect(ctx.forceComplete).toBe(false);
    });

    it('uses default time source when getNow is not provided', () => {
      const ctx = new TimingContext(6);
      // startTime should be a reasonable number (not NaN or undefined)
      expect(ctx.startTime).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(ctx.startTime)).toBe(true);
    });
  });

  describe('elapsed()', () => {
    it('returns the difference between current time and start time', () => {
      let currentTime = 50;
      const getNow = () => currentTime;
      const ctx = new TimingContext(6, false, getNow);

      // Start time is 50, advance to 53
      currentTime = 53;
      expect(ctx.elapsed()).toBe(3);

      // Advance further to 58
      currentTime = 58;
      expect(ctx.elapsed()).toBe(8);
    });

    it('returns 0 when time has not advanced', () => {
      const getNow = () => 100;
      const ctx = new TimingContext(6, false, getNow);
      expect(ctx.elapsed()).toBe(0);
    });
  });

  describe('isOverBudget()', () => {
    it('returns false when elapsed time is less than budget', () => {
      let currentTime = 0;
      const getNow = () => currentTime;
      const ctx = new TimingContext(6, false, getNow);

      currentTime = 5;
      expect(ctx.isOverBudget()).toBe(false);
    });

    it('returns false when elapsed time equals budget exactly', () => {
      let currentTime = 0;
      const getNow = () => currentTime;
      const ctx = new TimingContext(6, false, getNow);

      currentTime = 6;
      expect(ctx.isOverBudget()).toBe(false);
    });

    it('returns true when elapsed time exceeds budget', () => {
      let currentTime = 0;
      const getNow = () => currentTime;
      const ctx = new TimingContext(6, false, getNow);

      currentTime = 7;
      expect(ctx.isOverBudget()).toBe(true);
    });

    it('returns false when forceComplete is true, even if over budget', () => {
      let currentTime = 0;
      const getNow = () => currentTime;
      const ctx = new TimingContext(6, true, getNow);

      currentTime = 100; // Way over budget
      expect(ctx.isOverBudget()).toBe(false);
    });

    it('returns false when forceComplete is true regardless of elapsed time', () => {
      let currentTime = 0;
      const getNow = () => currentTime;
      const ctx = new TimingContext(1, true, getNow);

      currentTime = 1000;
      expect(ctx.isOverBudget()).toBe(false);
    });
  });

  describe('Date.now() fallback', () => {
    it('works with a Date.now-style time source (integer milliseconds)', () => {
      let currentTime = 1700000000000;
      const getNow = () => currentTime;
      const ctx = new TimingContext(6, false, getNow);

      expect(ctx.startTime).toBe(1700000000000);

      currentTime = 1700000000004;
      expect(ctx.elapsed()).toBe(4);
      expect(ctx.isOverBudget()).toBe(false);

      currentTime = 1700000000007;
      expect(ctx.elapsed()).toBe(7);
      expect(ctx.isOverBudget()).toBe(true);
    });
  });
});
