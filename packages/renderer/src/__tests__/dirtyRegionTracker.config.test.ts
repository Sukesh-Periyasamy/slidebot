import { describe, it, expect, beforeEach } from 'vitest';
import { DirtyRegionTracker } from '../dirtyRegionTracker';
import type { BoundingBox, ViewportDimensions } from '../boundingBoxCalculator';

describe('DirtyRegionTracker - setConfig and getConfig', () => {
  const viewport: ViewportDimensions = { viewportWidth: 1000, viewportHeight: 800 };
  let tracker: DirtyRegionTracker;

  beforeEach(() => {
    tracker = new DirtyRegionTracker();
  });

  describe('Default config values (Req 9.6)', () => {
    it('should have correct default values', () => {
      const config = tracker.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.coverageThreshold).toBe(0.6);
      expect(config.regionCountThreshold).toBe(16);
      expect(config.mergeMargin).toBe(4);
    });

    it('should accept partial config in constructor', () => {
      const customTracker = new DirtyRegionTracker({ coverageThreshold: 0.8 });
      const config = customTracker.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.coverageThreshold).toBe(0.8);
      expect(config.regionCountThreshold).toBe(16);
      expect(config.mergeMargin).toBe(4);
    });
  });

  describe('getConfig returns current config as readonly (Req 9.1)', () => {
    it('should return a copy of the config (not a reference)', () => {
      const config1 = tracker.getConfig();
      const config2 = tracker.getConfig();
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // different object references
    });

    it('should reflect changes after setConfig', () => {
      tracker.setConfig({ coverageThreshold: 0.9 });
      const config = tracker.getConfig();
      expect(config.coverageThreshold).toBe(0.9);
    });
  });

  describe('Valid partial config updates only specified fields (Req 9.1)', () => {
    it('should update only coverageThreshold when only that is specified', () => {
      const result = tracker.setConfig({ coverageThreshold: 0.8 });
      expect(result).toBeNull();

      const config = tracker.getConfig();
      expect(config.coverageThreshold).toBe(0.8);
      expect(config.regionCountThreshold).toBe(16);
      expect(config.mergeMargin).toBe(4);
      expect(config.enabled).toBe(true);
    });

    it('should update only regionCountThreshold when only that is specified', () => {
      const result = tracker.setConfig({ regionCountThreshold: 32 });
      expect(result).toBeNull();

      const config = tracker.getConfig();
      expect(config.coverageThreshold).toBe(0.6);
      expect(config.regionCountThreshold).toBe(32);
      expect(config.mergeMargin).toBe(4);
      expect(config.enabled).toBe(true);
    });

    it('should update only mergeMargin when only that is specified', () => {
      const result = tracker.setConfig({ mergeMargin: 8 });
      expect(result).toBeNull();

      const config = tracker.getConfig();
      expect(config.coverageThreshold).toBe(0.6);
      expect(config.regionCountThreshold).toBe(16);
      expect(config.mergeMargin).toBe(8);
      expect(config.enabled).toBe(true);
    });

    it('should update only enabled when only that is specified', () => {
      const result = tracker.setConfig({ enabled: false });
      expect(result).toBeNull();

      const config = tracker.getConfig();
      expect(config.coverageThreshold).toBe(0.6);
      expect(config.regionCountThreshold).toBe(16);
      expect(config.mergeMargin).toBe(4);
      expect(config.enabled).toBe(false);
    });

    it('should update multiple fields when multiple are specified', () => {
      const result = tracker.setConfig({
        coverageThreshold: 0.9,
        mergeMargin: 16,
      });
      expect(result).toBeNull();

      const config = tracker.getConfig();
      expect(config.coverageThreshold).toBe(0.9);
      expect(config.regionCountThreshold).toBe(16);
      expect(config.mergeMargin).toBe(16);
      expect(config.enabled).toBe(true);
    });

    it('should accept boundary values: coverageThreshold = 0.1', () => {
      const result = tracker.setConfig({ coverageThreshold: 0.1 });
      expect(result).toBeNull();
      expect(tracker.getConfig().coverageThreshold).toBe(0.1);
    });

    it('should accept boundary values: coverageThreshold = 1.0', () => {
      const result = tracker.setConfig({ coverageThreshold: 1.0 });
      expect(result).toBeNull();
      expect(tracker.getConfig().coverageThreshold).toBe(1.0);
    });

    it('should accept boundary values: regionCountThreshold = 1', () => {
      const result = tracker.setConfig({ regionCountThreshold: 1 });
      expect(result).toBeNull();
      expect(tracker.getConfig().regionCountThreshold).toBe(1);
    });

    it('should accept boundary values: regionCountThreshold = 64', () => {
      const result = tracker.setConfig({ regionCountThreshold: 64 });
      expect(result).toBeNull();
      expect(tracker.getConfig().regionCountThreshold).toBe(64);
    });

    it('should accept boundary values: mergeMargin = 0', () => {
      const result = tracker.setConfig({ mergeMargin: 0 });
      expect(result).toBeNull();
      expect(tracker.getConfig().mergeMargin).toBe(0);
    });

    it('should accept boundary values: mergeMargin = 32', () => {
      const result = tracker.setConfig({ mergeMargin: 32 });
      expect(result).toBeNull();
      expect(tracker.getConfig().mergeMargin).toBe(32);
    });

    it('should return null on success', () => {
      const result = tracker.setConfig({ coverageThreshold: 0.5 });
      expect(result).toBeNull();
    });

    it('should handle empty partial config (no-op)', () => {
      const result = tracker.setConfig({});
      expect(result).toBeNull();

      const config = tracker.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.coverageThreshold).toBe(0.6);
      expect(config.regionCountThreshold).toBe(16);
      expect(config.mergeMargin).toBe(4);
    });
  });

  describe('Invalid config values reject entire command (Req 9.2)', () => {
    it('should reject coverageThreshold below 0.1', () => {
      const result = tracker.setConfig({ coverageThreshold: 0.05 });
      expect(result).not.toBeNull();
      expect(result).toContain('coverageThreshold');
      expect(tracker.getConfig().coverageThreshold).toBe(0.6); // unchanged
    });

    it('should reject coverageThreshold above 1.0', () => {
      const result = tracker.setConfig({ coverageThreshold: 1.5 });
      expect(result).not.toBeNull();
      expect(result).toContain('coverageThreshold');
      expect(tracker.getConfig().coverageThreshold).toBe(0.6); // unchanged
    });

    it('should reject regionCountThreshold below 1', () => {
      const result = tracker.setConfig({ regionCountThreshold: 0 });
      expect(result).not.toBeNull();
      expect(result).toContain('regionCountThreshold');
      expect(tracker.getConfig().regionCountThreshold).toBe(16); // unchanged
    });

    it('should reject regionCountThreshold above 64', () => {
      const result = tracker.setConfig({ regionCountThreshold: 65 });
      expect(result).not.toBeNull();
      expect(result).toContain('regionCountThreshold');
      expect(tracker.getConfig().regionCountThreshold).toBe(16); // unchanged
    });

    it('should reject mergeMargin below 0', () => {
      const result = tracker.setConfig({ mergeMargin: -1 });
      expect(result).not.toBeNull();
      expect(result).toContain('mergeMargin');
      expect(tracker.getConfig().mergeMargin).toBe(4); // unchanged
    });

    it('should reject mergeMargin above 32', () => {
      const result = tracker.setConfig({ mergeMargin: 33 });
      expect(result).not.toBeNull();
      expect(result).toContain('mergeMargin');
      expect(tracker.getConfig().mergeMargin).toBe(4); // unchanged
    });

    it('should reject entire command when one field is invalid (no partial application)', () => {
      const result = tracker.setConfig({
        coverageThreshold: 0.8, // valid
        regionCountThreshold: 100, // invalid
        mergeMargin: 10, // valid
      });
      expect(result).not.toBeNull();
      // ALL fields should remain unchanged
      const config = tracker.getConfig();
      expect(config.coverageThreshold).toBe(0.6); // not updated to 0.8
      expect(config.regionCountThreshold).toBe(16); // not updated
      expect(config.mergeMargin).toBe(4); // not updated to 10
    });

    it('should reject entire command when multiple fields are invalid', () => {
      const result = tracker.setConfig({
        coverageThreshold: 2.0, // invalid
        mergeMargin: 50, // invalid
      });
      expect(result).not.toBeNull();
      expect(result).toContain('coverageThreshold');
      expect(result).toContain('mergeMargin');
      // All fields unchanged
      const config = tracker.getConfig();
      expect(config.coverageThreshold).toBe(0.6);
      expect(config.mergeMargin).toBe(4);
    });

    it('should not modify enabled when other fields are invalid', () => {
      const result = tracker.setConfig({
        enabled: false,
        coverageThreshold: 5.0, // invalid
      });
      expect(result).not.toBeNull();
      expect(tracker.getConfig().enabled).toBe(true); // unchanged
    });
  });

  describe('Error message lists which fields are out of range (Req 9.2)', () => {
    it('should list the invalid field name in the error message', () => {
      const result = tracker.setConfig({ coverageThreshold: 1.5 });
      expect(result).toContain('coverageThreshold');
      expect(result).toContain('1.5');
      expect(result).toContain('[0.1, 1.0]');
    });

    it('should list the invalid regionCountThreshold in the error message', () => {
      const result = tracker.setConfig({ regionCountThreshold: 100 });
      expect(result).toContain('regionCountThreshold');
      expect(result).toContain('100');
      expect(result).toContain('[1, 64]');
    });

    it('should list the invalid mergeMargin in the error message', () => {
      const result = tracker.setConfig({ mergeMargin: 50 });
      expect(result).toContain('mergeMargin');
      expect(result).toContain('50');
      expect(result).toContain('[0, 32]');
    });

    it('should list all invalid fields when multiple are out of range', () => {
      const result = tracker.setConfig({
        coverageThreshold: 1.5,
        mergeMargin: 50,
      });
      expect(result).toContain('coverageThreshold');
      expect(result).toContain('mergeMargin');
    });

    it('should start with "Invalid config:" prefix', () => {
      const result = tracker.setConfig({ coverageThreshold: 1.5 });
      expect(result).toMatch(/^Invalid config:/);
    });
  });

  describe('enabled: false → prepareFrame always returns useFullClear=true (Req 9.4)', () => {
    it('should return useFullClear=true when disabled via constructor', () => {
      const disabledTracker = new DirtyRegionTracker({ enabled: false });
      const result = disabledTracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(true);
    });

    it('should return useFullClear=true when disabled via setConfig', () => {
      tracker.setConfig({ enabled: false });
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(true);
    });

    it('should return useFullClear=true even with dirty regions when disabled', () => {
      tracker.setConfig({ enabled: false });
      tracker.markDirty({ x: 10, y: 10, width: 50, height: 50 });
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(true);
    });

    it('should return useFullClear=true with dynamic items when disabled', () => {
      tracker.setConfig({ enabled: false });
      const activeStroke: BoundingBox = { x: 10, y: 10, width: 100, height: 100 };
      const liveStrokes = new Map<string, BoundingBox>([
        ['user1', { x: 200, y: 200, width: 50, height: 50 }],
      ]);
      const lasers = new Map<string, BoundingBox>([
        ['laser1', { x: 400, y: 400, width: 30, height: 30 }],
      ]);

      const result = tracker.prepareFrame(viewport, activeStroke, liveStrokes, lasers);
      expect(result.useFullClear).toBe(true);
      expect(result.regions).toEqual([]);
      expect(result.totalDirtyArea).toBe(0);
      expect(result.coverageRatio).toBe(0);
    });

    it('should return useFullClear=true regardless of coverage when disabled', () => {
      tracker.setConfig({ enabled: false });
      // Even a tiny dirty region should still result in full clear
      tracker.markDirty({ x: 0, y: 0, width: 1, height: 1 });
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(true);
    });
  });

  describe('enabled: true after disable → triggers full clear for first frame (Req 9.5)', () => {
    it('should trigger full clear on first frame after re-enable', () => {
      // Disable
      tracker.setConfig({ enabled: false });
      // Re-enable
      tracker.setConfig({ enabled: true });

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(true);
    });

    it('should clear previous-frame regions on re-enable', () => {
      // Commit some previous-frame regions
      const activeStroke: BoundingBox = { x: 50, y: 50, width: 100, height: 100 };
      const liveStrokes = new Map<string, BoundingBox>([
        ['user1', { x: 200, y: 200, width: 60, height: 60 }],
      ]);
      const lasers = new Map<string, BoundingBox>([
        ['laser1', { x: 400, y: 400, width: 30, height: 30 }],
      ]);
      tracker.commitFrame(activeStroke, liveStrokes, lasers);

      // Disable then re-enable
      tracker.setConfig({ enabled: false });
      tracker.setConfig({ enabled: true });

      // First frame after re-enable: full clear
      const result1 = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result1.useFullClear).toBe(true);

      // Commit the frame to clear the full-clear flag
      tracker.commitFrame(null, new Map(), new Map());

      // Second frame: no previous-frame regions should exist
      const result2 = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result2.useFullClear).toBe(false);
      expect(result2.regions.length).toBe(0);
    });

    it('should resume normal partial rendering after the first full-clear frame', () => {
      // Disable then re-enable
      tracker.setConfig({ enabled: false });
      tracker.setConfig({ enabled: true });

      // First frame: full clear
      const result1 = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result1.useFullClear).toBe(true);
      tracker.commitFrame(null, new Map(), new Map());

      // Second frame: should use partial rendering
      tracker.markDirty({ x: 10, y: 10, width: 50, height: 50 });
      const result2 = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result2.useFullClear).toBe(false);
      expect(result2.regions.length).toBe(1);
    });

    it('should not trigger full clear when setting enabled=true when already enabled', () => {
      // Already enabled by default, setting enabled=true should not trigger full clear
      tracker.setConfig({ enabled: true });

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
    });

    it('should trigger full clear only when transitioning from disabled to enabled', () => {
      // Disable
      tracker.setConfig({ enabled: false });

      // While disabled, prepareFrame returns full clear
      const disabledResult = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(disabledResult.useFullClear).toBe(true);
      tracker.commitFrame(null, new Map(), new Map());

      // Re-enable
      tracker.setConfig({ enabled: true });

      // First frame after re-enable should be full clear
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(true);
    });

    it('should clear active stroke previous-frame region on re-enable', () => {
      const activeStroke: BoundingBox = { x: 50, y: 50, width: 100, height: 100 };
      tracker.commitFrame(activeStroke, new Map(), new Map());

      tracker.setConfig({ enabled: false });
      tracker.setConfig({ enabled: true });

      // After full clear frame and commit
      tracker.prepareFrame(viewport, null, new Map(), new Map());
      tracker.commitFrame(null, new Map(), new Map());

      // Previous active stroke should be gone
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.regions.length).toBe(0);
    });

    it('should clear live stroke previous-frame regions on re-enable', () => {
      const liveStrokes = new Map<string, BoundingBox>([
        ['user1', { x: 100, y: 100, width: 50, height: 50 }],
        ['user2', { x: 300, y: 300, width: 60, height: 60 }],
      ]);
      tracker.commitFrame(null, liveStrokes, new Map());

      tracker.setConfig({ enabled: false });
      tracker.setConfig({ enabled: true });

      // After full clear frame and commit
      tracker.prepareFrame(viewport, null, new Map(), new Map());
      tracker.commitFrame(null, new Map(), new Map());

      // Previous live strokes should be gone
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.regions.length).toBe(0);
    });

    it('should clear laser previous-frame regions on re-enable', () => {
      const lasers = new Map<string, BoundingBox>([
        ['laser1', { x: 200, y: 200, width: 30, height: 30 }],
      ]);
      tracker.commitFrame(null, new Map(), lasers);

      tracker.setConfig({ enabled: false });
      tracker.setConfig({ enabled: true });

      // After full clear frame and commit
      tracker.prepareFrame(viewport, null, new Map(), new Map());
      tracker.commitFrame(null, new Map(), new Map());

      // Previous lasers should be gone
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.regions.length).toBe(0);
    });
  });

  describe('Config changes apply to next frame (Req 9.3)', () => {
    it('should use new coverageThreshold on next prepareFrame', () => {
      // Lower the threshold so a smaller area triggers full clear
      tracker.setConfig({ coverageThreshold: 0.1 });

      // Mark a region that covers > 10% of canvas (1000*800 = 800000, 10% = 80000)
      tracker.markDirty({ x: 0, y: 0, width: 300, height: 300 }); // 90000 > 80000

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(true);
    });

    it('should use new regionCountThreshold on next prepareFrame', () => {
      // Lower the threshold
      tracker.setConfig({ regionCountThreshold: 3 });

      // Create 4 non-overlapping regions
      tracker.markDirty({ x: 0, y: 0, width: 20, height: 20 });
      tracker.markDirty({ x: 100, y: 0, width: 20, height: 20 });
      tracker.markDirty({ x: 200, y: 0, width: 20, height: 20 });
      tracker.markDirty({ x: 300, y: 0, width: 20, height: 20 });

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(true);
    });

    it('should use new mergeMargin on next prepareFrame', () => {
      // Increase merge margin so distant regions get merged
      tracker.setConfig({ mergeMargin: 30 });

      // Two regions 25px apart (within new margin of 30)
      tracker.markDirty({ x: 10, y: 10, width: 50, height: 50 });
      tracker.markDirty({ x: 85, y: 10, width: 50, height: 50 }); // gap = 85 - 60 = 25

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(1); // merged due to larger margin
    });
  });
});
