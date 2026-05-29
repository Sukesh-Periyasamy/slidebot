import { describe, it, expect, beforeEach } from 'vitest';
import { DirtyRegionTracker } from '../dirtyRegionTracker';
import type { BoundingBox, ViewportDimensions } from '../boundingBoxCalculator';

describe('DirtyRegionTracker - prepareFrame and commitFrame', () => {
  const viewport: ViewportDimensions = { viewportWidth: 1000, viewportHeight: 800 };
  let tracker: DirtyRegionTracker;

  beforeEach(() => {
    tracker = new DirtyRegionTracker();
  });

  describe('Dynamic items contribute their current bbox as dirty regions', () => {
    it('should include active stroke bbox in dirty regions', () => {
      const activeStroke: BoundingBox = { x: 10, y: 20, width: 100, height: 50 };
      const result = tracker.prepareFrame(
        viewport,
        activeStroke,
        new Map(),
        new Map(),
      );

      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBeGreaterThanOrEqual(1);
      // The active stroke region should be contained within the merged regions
      const totalArea = result.regions.reduce((sum, r) => sum + r.width * r.height, 0);
      expect(totalArea).toBeGreaterThanOrEqual(activeStroke.width * activeStroke.height);
    });

    it('should include live stroke bboxes in dirty regions', () => {
      const liveStrokes = new Map<string, BoundingBox>([
        ['user1', { x: 50, y: 50, width: 80, height: 40 }],
        ['user2', { x: 200, y: 200, width: 60, height: 30 }],
      ]);
      const result = tracker.prepareFrame(viewport, null, liveStrokes, new Map());

      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBeGreaterThanOrEqual(1);
      const totalArea = result.regions.reduce((sum, r) => sum + r.width * r.height, 0);
      // Total area should cover both live strokes
      expect(totalArea).toBeGreaterThanOrEqual(80 * 40 + 60 * 30);
    });

    it('should include laser bboxes in dirty regions', () => {
      const lasers = new Map<string, BoundingBox>([
        ['laser1', { x: 300, y: 300, width: 20, height: 20 }],
      ]);
      const result = tracker.prepareFrame(viewport, null, new Map(), lasers);

      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBeGreaterThanOrEqual(1);
      const totalArea = result.regions.reduce((sum, r) => sum + r.width * r.height, 0);
      expect(totalArea).toBeGreaterThanOrEqual(20 * 20);
    });

    it('should include all dynamic item types together', () => {
      const activeStroke: BoundingBox = { x: 10, y: 10, width: 50, height: 50 };
      const liveStrokes = new Map<string, BoundingBox>([
        ['user1', { x: 500, y: 500, width: 40, height: 40 }],
      ]);
      const lasers = new Map<string, BoundingBox>([
        ['laser1', { x: 800, y: 700, width: 30, height: 30 }],
      ]);

      const result = tracker.prepareFrame(viewport, activeStroke, liveStrokes, lasers);

      expect(result.useFullClear).toBe(false);
      // Should have at least 3 separate regions (they're far apart)
      expect(result.regions.length).toBe(3);
    });
  });

  describe('Previous-frame bboxes are added as dirty regions', () => {
    it('should include previous active stroke bbox in dirty regions', () => {
      const prevActiveStroke: BoundingBox = { x: 10, y: 10, width: 50, height: 50 };
      // First frame: commit with an active stroke
      tracker.commitFrame(prevActiveStroke, new Map(), new Map());

      // Second frame: active stroke moved to a new position
      const newActiveStroke: BoundingBox = { x: 200, y: 200, width: 50, height: 50 };
      const result = tracker.prepareFrame(viewport, newActiveStroke, new Map(), new Map());

      expect(result.useFullClear).toBe(false);
      // Should have regions for both old and new positions
      expect(result.regions.length).toBe(2);
    });

    it('should include previous live stroke bboxes in dirty regions', () => {
      const prevLiveStrokes = new Map<string, BoundingBox>([
        ['user1', { x: 100, y: 100, width: 60, height: 40 }],
      ]);
      tracker.commitFrame(null, prevLiveStrokes, new Map());

      // Next frame: live stroke moved
      const newLiveStrokes = new Map<string, BoundingBox>([
        ['user1', { x: 400, y: 400, width: 60, height: 40 }],
      ]);
      const result = tracker.prepareFrame(viewport, null, newLiveStrokes, new Map());

      expect(result.useFullClear).toBe(false);
      // Should have regions for both old and new positions
      expect(result.regions.length).toBe(2);
    });

    it('should include previous laser bboxes in dirty regions', () => {
      const prevLasers = new Map<string, BoundingBox>([
        ['laser1', { x: 50, y: 50, width: 30, height: 30 }],
      ]);
      tracker.commitFrame(null, new Map(), prevLasers);

      // Next frame: laser moved
      const newLasers = new Map<string, BoundingBox>([
        ['laser1', { x: 600, y: 600, width: 30, height: 30 }],
      ]);
      const result = tracker.prepareFrame(viewport, null, new Map(), newLasers);

      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(2);
    });

    it('should handle no previous-frame regions gracefully', () => {
      // First frame with no prior commit
      const activeStroke: BoundingBox = { x: 10, y: 10, width: 50, height: 50 };
      const result = tracker.prepareFrame(viewport, activeStroke, new Map(), new Map());

      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(1);
    });
  });

  describe('Region merging is applied', () => {
    it('should merge overlapping regions', () => {
      // Mark two overlapping regions manually
      tracker.markDirty({ x: 10, y: 10, width: 50, height: 50 });
      tracker.markDirty({ x: 40, y: 40, width: 50, height: 50 });

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(false);
      // Overlapping regions should be merged into one
      expect(result.regions.length).toBe(1);
      expect(result.regions[0]).toEqual({ x: 10, y: 10, width: 80, height: 80 });
    });

    it('should merge adjacent regions within merge margin', () => {
      // Two regions that are within 4px (default merge margin) of each other
      tracker.markDirty({ x: 10, y: 10, width: 50, height: 50 });
      tracker.markDirty({ x: 63, y: 10, width: 50, height: 50 }); // gap of 3px on X

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(1);
    });

    it('should not merge regions beyond merge margin', () => {
      // Two regions that are more than 4px apart
      tracker.markDirty({ x: 10, y: 10, width: 50, height: 50 });
      tracker.markDirty({ x: 200, y: 200, width: 50, height: 50 }); // far apart

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(2);
    });

    it('should merge dynamic item regions with pre-marked dirty regions', () => {
      // Pre-mark a region that overlaps with where the active stroke will be
      tracker.markDirty({ x: 10, y: 10, width: 50, height: 50 });

      const activeStroke: BoundingBox = { x: 40, y: 40, width: 50, height: 50 };
      const result = tracker.prepareFrame(viewport, activeStroke, new Map(), new Map());

      expect(result.useFullClear).toBe(false);
      // Should merge into one region
      expect(result.regions.length).toBe(1);
    });
  });

  describe('Fallback thresholds are evaluated correctly', () => {
    it('should trigger full clear when coverage > threshold', () => {
      // Default coverage threshold is 0.6 (60%)
      // Canvas area = 1000 * 800 = 800000
      // Need dirty area > 480000 (60%)
      tracker.markDirty({ x: 0, y: 0, width: 1000, height: 500 }); // 500000 > 480000

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(true);
      expect(result.coverageRatio).toBeGreaterThan(0.6);
    });

    it('should not trigger full clear when coverage is exactly at threshold', () => {
      // Coverage exactly at 0.6 should NOT trigger (strictly greater than)
      // 800000 * 0.6 = 480000
      tracker.markDirty({ x: 0, y: 0, width: 800, height: 600 }); // 480000 = exactly 60%

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.coverageRatio).toBeCloseTo(0.6);
      expect(result.useFullClear).toBe(false);
    });

    it('should trigger full clear when region count > threshold', () => {
      // Default region count threshold is 16
      // Create 17 non-overlapping, non-adjacent regions
      for (let i = 0; i < 17; i++) {
        tracker.markDirty({ x: i * 55, y: 10, width: 20, height: 20 });
      }

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(true);
    });

    it('should not trigger full clear when region count is exactly at threshold', () => {
      // 16 regions should NOT trigger (strictly greater than)
      for (let i = 0; i < 16; i++) {
        tracker.markDirty({ x: i * 55, y: 10, width: 20, height: 20 });
      }

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(16);
    });

    it('should trigger full clear when either threshold is exceeded', () => {
      // Even if coverage is low, exceeding count should trigger
      for (let i = 0; i < 20; i++) {
        tracker.markDirty({ x: i * 50, y: 10, width: 10, height: 10 });
      }

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(true);
    });

    it('should use custom thresholds from config', () => {
      const customTracker = new DirtyRegionTracker({
        coverageThreshold: 0.3,
        regionCountThreshold: 5,
      });

      // Create 6 small non-overlapping regions
      for (let i = 0; i < 6; i++) {
        customTracker.markDirty({ x: i * 100, y: 10, width: 20, height: 20 });
      }

      const result = customTracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(true);
    });
  });

  describe('commitFrame stores current bboxes and clears accumulated regions', () => {
    it('should store active stroke bbox as previous-frame region', () => {
      const activeStroke: BoundingBox = { x: 100, y: 100, width: 50, height: 50 };
      tracker.commitFrame(activeStroke, new Map(), new Map());

      // Next prepareFrame should include the stored previous active stroke
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(1);
      expect(result.regions[0]).toEqual({ x: 100, y: 100, width: 50, height: 50 });
    });

    it('should store live stroke bboxes as previous-frame regions', () => {
      const liveStrokes = new Map<string, BoundingBox>([
        ['user1', { x: 100, y: 100, width: 50, height: 50 }],
        ['user2', { x: 500, y: 500, width: 40, height: 40 }],
      ]);
      tracker.commitFrame(null, liveStrokes, new Map());

      // Next prepareFrame should include stored previous live strokes
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(2);
    });

    it('should store laser bboxes as previous-frame regions', () => {
      const lasers = new Map<string, BoundingBox>([
        ['laser1', { x: 300, y: 300, width: 25, height: 25 }],
      ]);
      tracker.commitFrame(null, new Map(), lasers);

      // Next prepareFrame should include stored previous lasers
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(1);
      expect(result.regions[0]).toEqual({ x: 300, y: 300, width: 25, height: 25 });
    });

    it('should clear accumulated dirty regions after commit', () => {
      tracker.markDirty({ x: 10, y: 10, width: 50, height: 50 });
      tracker.commitFrame(null, new Map(), new Map());

      // After commit, the previously marked region should be gone
      // Only new regions should appear in next prepareFrame
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.regions.length).toBe(0);
    });

    it('should clear full-clear flag after commit', () => {
      tracker.invalidateAll();
      tracker.commitFrame(null, new Map(), new Map());

      // After commit, full-clear flag should be cleared
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(false);
    });

    it('should replace previous-frame regions on subsequent commits', () => {
      // First commit with active stroke at position A
      tracker.commitFrame({ x: 10, y: 10, width: 50, height: 50 }, new Map(), new Map());

      // Second commit with active stroke at position B
      tracker.commitFrame(
        { x: 200, y: 200, width: 50, height: 50 },
        new Map(),
        new Map(),
      );

      // prepareFrame should only include position B as previous-frame region
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.regions.length).toBe(1);
      expect(result.regions[0]).toEqual({ x: 200, y: 200, width: 50, height: 50 });
    });

    it('should handle null active stroke in commit', () => {
      // Commit with active stroke, then commit without
      tracker.commitFrame({ x: 10, y: 10, width: 50, height: 50 }, new Map(), new Map());
      tracker.commitFrame(null, new Map(), new Map());

      // No previous active stroke should be stored
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.regions.length).toBe(0);
    });
  });

  describe('Disabled state always returns useFullClear=true', () => {
    it('should return useFullClear=true when disabled', () => {
      const disabledTracker = new DirtyRegionTracker({ enabled: false });

      const result = disabledTracker.prepareFrame(
        viewport,
        { x: 10, y: 10, width: 50, height: 50 },
        new Map(),
        new Map(),
      );

      expect(result.useFullClear).toBe(true);
    });

    it('should return useFullClear=true when disabled even with no dirty regions', () => {
      const disabledTracker = new DirtyRegionTracker({ enabled: false });

      const result = disabledTracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(true);
    });

    it('should return useFullClear=true when disabled via setConfig', () => {
      tracker.setConfig({ enabled: false });

      const result = tracker.prepareFrame(
        viewport,
        { x: 10, y: 10, width: 50, height: 50 },
        new Map(),
        new Map(),
      );

      expect(result.useFullClear).toBe(true);
    });

    it('should return empty regions when disabled', () => {
      const disabledTracker = new DirtyRegionTracker({ enabled: false });

      const result = disabledTracker.prepareFrame(
        viewport,
        { x: 10, y: 10, width: 50, height: 50 },
        new Map([['user1', { x: 100, y: 100, width: 50, height: 50 }]]),
        new Map([['laser1', { x: 200, y: 200, width: 30, height: 30 }]]),
      );

      expect(result.useFullClear).toBe(true);
      expect(result.regions).toEqual([]);
      expect(result.totalDirtyArea).toBe(0);
      expect(result.coverageRatio).toBe(0);
    });
  });

  describe('DirtyFrameResult metrics', () => {
    it('should compute correct totalDirtyArea', () => {
      tracker.markDirty({ x: 0, y: 0, width: 100, height: 100 }); // 10000
      tracker.markDirty({ x: 500, y: 500, width: 50, height: 50 }); // 2500

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.totalDirtyArea).toBe(12500);
    });

    it('should compute correct coverageRatio', () => {
      // Canvas area = 1000 * 800 = 800000
      tracker.markDirty({ x: 0, y: 0, width: 100, height: 100 }); // 10000

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.coverageRatio).toBeCloseTo(10000 / 800000);
    });

    it('should handle zero-area viewport gracefully', () => {
      const zeroViewport: ViewportDimensions = { viewportWidth: 0, viewportHeight: 0 };
      tracker.markDirty({ x: 0, y: 0, width: 10, height: 10 });

      const result = tracker.prepareFrame(zeroViewport, null, new Map(), new Map());

      expect(result.coverageRatio).toBe(0);
    });
  });

  describe('Full clear flag behavior in prepareFrame', () => {
    it('should return useFullClear=true when invalidateAll was called', () => {
      tracker.invalidateAll();

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(true);
    });

    it('should return useFullClear=true when invalid bbox is marked dirty', () => {
      tracker.markDirty({ x: NaN, y: 10, width: 50, height: 50 });

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(true);
    });

    it('should return useFullClear=true when bbox with Infinity is marked', () => {
      tracker.markDirty({ x: 10, y: 10, width: Infinity, height: 50 });

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(true);
    });

    it('should return useFullClear=true when bbox with negative dimensions is marked', () => {
      tracker.markDirty({ x: 10, y: 10, width: -5, height: 50 });

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());

      expect(result.useFullClear).toBe(true);
    });
  });

  describe('getFrameMetrics after prepareFrame', () => {
    it('should report correct metrics after partial render', () => {
      tracker.markDirty({ x: 0, y: 0, width: 100, height: 100 });

      tracker.prepareFrame(viewport, null, new Map(), new Map());
      const metrics = tracker.getFrameMetrics();

      expect(metrics.regionCount).toBe(1);
      expect(metrics.totalDirtyArea).toBe(10000);
      expect(metrics.coverageRatio).toBeCloseTo(10000 / 800000);
      expect(metrics.usedFullClear).toBe(false);
    });

    it('should report usedFullClear=true when full clear triggered', () => {
      tracker.invalidateAll();

      tracker.prepareFrame(viewport, null, new Map(), new Map());
      const metrics = tracker.getFrameMetrics();

      expect(metrics.usedFullClear).toBe(true);
    });
  });
});
