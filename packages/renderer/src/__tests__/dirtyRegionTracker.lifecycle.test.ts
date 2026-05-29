import { describe, it, expect, beforeEach } from 'vitest';
import { DirtyRegionTracker } from '../dirtyRegionTracker';
import type { BoundingBox, ViewportDimensions } from '../boundingBoxCalculator';

describe('DirtyRegionTracker - Dynamic item removal and lifecycle event handlers', () => {
  const viewport: ViewportDimensions = { viewportWidth: 1000, viewportHeight: 800 };
  let tracker: DirtyRegionTracker;

  beforeEach(() => {
    tracker = new DirtyRegionTracker();
  });

  describe('onLiveStrokeRemoved', () => {
    it('should mark previous bbox as dirty and remove entry when live stroke has previous-frame region', () => {
      // Commit a frame with a live stroke to establish previous-frame region
      const liveStrokeBBox: BoundingBox = { x: 100, y: 150, width: 80, height: 60 };
      tracker.commitFrame(null, new Map([['user1', liveStrokeBBox]]), new Map());

      // Remove the live stroke
      tracker.onLiveStrokeRemoved('user1');

      // The previous bbox should now be in the dirty regions
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(1);
      expect(result.regions[0]).toEqual(liveStrokeBBox);
    });

    it('should remove the entry from previous-frame tracking after removal', () => {
      const liveStrokeBBox: BoundingBox = { x: 100, y: 150, width: 80, height: 60 };
      tracker.commitFrame(null, new Map([['user1', liveStrokeBBox]]), new Map());

      // Remove the live stroke
      tracker.onLiveStrokeRemoved('user1');

      // Commit and prepare another frame — the removed entry should not reappear
      tracker.prepareFrame(viewport, null, new Map(), new Map());
      tracker.commitFrame(null, new Map(), new Map());

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.regions.length).toBe(0);
    });

    it('should only remove the specified user entry, leaving others intact', () => {
      const bbox1: BoundingBox = { x: 100, y: 100, width: 50, height: 50 };
      const bbox2: BoundingBox = { x: 500, y: 500, width: 60, height: 60 };
      tracker.commitFrame(
        null,
        new Map([
          ['user1', bbox1],
          ['user2', bbox2],
        ]),
        new Map(),
      );

      // Remove only user1
      tracker.onLiveStrokeRemoved('user1');

      // prepareFrame should include user1's previous bbox (marked dirty by removal)
      // AND user2's previous bbox (still in previous-frame tracking)
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(2);
    });

    it('should be a no-op when no previous-frame entry exists for the user', () => {
      // No commit, so no previous-frame regions exist
      tracker.onLiveStrokeRemoved('nonexistent-user');

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.regions.length).toBe(0);
    });
  });

  describe('onLaserRemoved', () => {
    it('should mark previous bbox as dirty and remove entry when laser has previous-frame region', () => {
      const laserBBox: BoundingBox = { x: 200, y: 250, width: 40, height: 30 };
      tracker.commitFrame(null, new Map(), new Map([['user1', laserBBox]]));

      // Remove the laser
      tracker.onLaserRemoved('user1');

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(1);
      expect(result.regions[0]).toEqual(laserBBox);
    });

    it('should remove the entry from previous-frame tracking after removal', () => {
      const laserBBox: BoundingBox = { x: 200, y: 250, width: 40, height: 30 };
      tracker.commitFrame(null, new Map(), new Map([['user1', laserBBox]]));

      // Remove the laser
      tracker.onLaserRemoved('user1');

      // Commit and prepare another frame — the removed entry should not reappear
      tracker.prepareFrame(viewport, null, new Map(), new Map());
      tracker.commitFrame(null, new Map(), new Map());

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.regions.length).toBe(0);
    });

    it('should only remove the specified laser entry, leaving others intact', () => {
      const bbox1: BoundingBox = { x: 100, y: 100, width: 30, height: 30 };
      const bbox2: BoundingBox = { x: 600, y: 600, width: 35, height: 35 };
      tracker.commitFrame(
        null,
        new Map(),
        new Map([
          ['laser1', bbox1],
          ['laser2', bbox2],
        ]),
      );

      // Remove only laser1
      tracker.onLaserRemoved('laser1');

      // prepareFrame should include laser1's previous bbox (marked dirty by removal)
      // AND laser2's previous bbox (still in previous-frame tracking)
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(2);
    });

    it('should be a no-op when no previous-frame entry exists for the laser', () => {
      tracker.onLaserRemoved('nonexistent-laser');

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.regions.length).toBe(0);
    });
  });

  describe('onActiveStrokeEnded', () => {
    it('should mark previous bbox as dirty and clear entry when active stroke has previous-frame region', () => {
      const activeStrokeBBox: BoundingBox = { x: 50, y: 75, width: 120, height: 90 };
      tracker.commitFrame(activeStrokeBBox, new Map(), new Map());

      // End the active stroke
      tracker.onActiveStrokeEnded();

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(1);
      expect(result.regions[0]).toEqual(activeStrokeBBox);
    });

    it('should clear the active stroke entry from previous-frame tracking', () => {
      const activeStrokeBBox: BoundingBox = { x: 50, y: 75, width: 120, height: 90 };
      tracker.commitFrame(activeStrokeBBox, new Map(), new Map());

      // End the active stroke
      tracker.onActiveStrokeEnded();

      // Commit and prepare another frame — the cleared entry should not reappear
      tracker.prepareFrame(viewport, null, new Map(), new Map());
      tracker.commitFrame(null, new Map(), new Map());

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.regions.length).toBe(0);
    });

    it('should be a no-op when no previous-frame active stroke entry exists', () => {
      // No commit, so no previous active stroke
      tracker.onActiveStrokeEnded();

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.regions.length).toBe(0);
    });

    it('should be a no-op when previous commit had null active stroke', () => {
      tracker.commitFrame(null, new Map(), new Map());

      tracker.onActiveStrokeEnded();

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.regions.length).toBe(0);
    });
  });

  describe('onResize', () => {
    it('should set full-clear flag causing next prepareFrame to return useFullClear=true', () => {
      tracker.onResize();

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(true);
    });

    it('should clear all previous-frame regions (active stroke)', () => {
      const activeStrokeBBox: BoundingBox = { x: 50, y: 50, width: 100, height: 100 };
      tracker.commitFrame(activeStrokeBBox, new Map(), new Map());

      tracker.onResize();

      // After resize, commit the frame to clear the full-clear flag
      tracker.commitFrame(null, new Map(), new Map());

      // Previous active stroke should be gone
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(0);
    });

    it('should clear all previous-frame regions (live strokes)', () => {
      const liveStrokes = new Map<string, BoundingBox>([
        ['user1', { x: 100, y: 100, width: 50, height: 50 }],
        ['user2', { x: 300, y: 300, width: 60, height: 60 }],
      ]);
      tracker.commitFrame(null, liveStrokes, new Map());

      tracker.onResize();

      // After resize, commit to clear the full-clear flag
      tracker.commitFrame(null, new Map(), new Map());

      // Previous live strokes should be gone
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(0);
    });

    it('should clear all previous-frame regions (lasers)', () => {
      const lasers = new Map<string, BoundingBox>([
        ['laser1', { x: 200, y: 200, width: 30, height: 30 }],
      ]);
      tracker.commitFrame(null, new Map(), lasers);

      tracker.onResize();

      // After resize, commit to clear the full-clear flag
      tracker.commitFrame(null, new Map(), new Map());

      // Previous lasers should be gone
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(0);
    });

    it('should clear all previous-frame regions even when all types are populated', () => {
      const activeStroke: BoundingBox = { x: 10, y: 10, width: 50, height: 50 };
      const liveStrokes = new Map<string, BoundingBox>([
        ['user1', { x: 200, y: 200, width: 40, height: 40 }],
      ]);
      const lasers = new Map<string, BoundingBox>([
        ['laser1', { x: 400, y: 400, width: 25, height: 25 }],
      ]);
      tracker.commitFrame(activeStroke, liveStrokes, lasers);

      tracker.onResize();

      // After resize, commit to clear the full-clear flag
      tracker.commitFrame(null, new Map(), new Map());

      // All previous-frame regions should be gone
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(0);
    });
  });

  describe('onSlideChange', () => {
    it('should set full-clear flag causing next prepareFrame to return useFullClear=true', () => {
      tracker.onSlideChange();

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(true);
    });

    it('should clear all previous-frame regions (active stroke)', () => {
      const activeStrokeBBox: BoundingBox = { x: 50, y: 50, width: 100, height: 100 };
      tracker.commitFrame(activeStrokeBBox, new Map(), new Map());

      tracker.onSlideChange();

      // After slide change, commit to clear the full-clear flag
      tracker.commitFrame(null, new Map(), new Map());

      // Previous active stroke should be gone
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(0);
    });

    it('should clear all previous-frame regions (live strokes)', () => {
      const liveStrokes = new Map<string, BoundingBox>([
        ['user1', { x: 100, y: 100, width: 50, height: 50 }],
        ['user2', { x: 300, y: 300, width: 60, height: 60 }],
      ]);
      tracker.commitFrame(null, liveStrokes, new Map());

      tracker.onSlideChange();

      // After slide change, commit to clear the full-clear flag
      tracker.commitFrame(null, new Map(), new Map());

      // Previous live strokes should be gone
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(0);
    });

    it('should clear all previous-frame regions (lasers)', () => {
      const lasers = new Map<string, BoundingBox>([
        ['laser1', { x: 200, y: 200, width: 30, height: 30 }],
      ]);
      tracker.commitFrame(null, new Map(), lasers);

      tracker.onSlideChange();

      // After slide change, commit to clear the full-clear flag
      tracker.commitFrame(null, new Map(), new Map());

      // Previous lasers should be gone
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(0);
    });

    it('should clear all previous-frame regions even when all types are populated', () => {
      const activeStroke: BoundingBox = { x: 10, y: 10, width: 50, height: 50 };
      const liveStrokes = new Map<string, BoundingBox>([
        ['user1', { x: 200, y: 200, width: 40, height: 40 }],
      ]);
      const lasers = new Map<string, BoundingBox>([
        ['laser1', { x: 400, y: 400, width: 25, height: 25 }],
      ]);
      tracker.commitFrame(activeStroke, liveStrokes, lasers);

      tracker.onSlideChange();

      // After slide change, commit to clear the full-clear flag
      tracker.commitFrame(null, new Map(), new Map());

      // All previous-frame regions should be gone
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(0);
    });
  });

  describe('No-op when no previous-frame entry exists', () => {
    it('onLiveStrokeRemoved is no-op for unknown userId', () => {
      // Commit with one user, try to remove a different one
      tracker.commitFrame(
        null,
        new Map([['user1', { x: 100, y: 100, width: 50, height: 50 }]]),
        new Map(),
      );

      tracker.onLiveStrokeRemoved('user-unknown');

      // Only user1's previous bbox should appear (not marked dirty by removal)
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(1);
    });

    it('onLaserRemoved is no-op for unknown userId', () => {
      tracker.commitFrame(
        null,
        new Map(),
        new Map([['laser1', { x: 200, y: 200, width: 30, height: 30 }]]),
      );

      tracker.onLaserRemoved('laser-unknown');

      // Only laser1's previous bbox should appear
      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.useFullClear).toBe(false);
      expect(result.regions.length).toBe(1);
    });

    it('onActiveStrokeEnded is no-op when no active stroke was committed', () => {
      tracker.commitFrame(null, new Map(), new Map());

      tracker.onActiveStrokeEnded();

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.regions.length).toBe(0);
    });

    it('onLiveStrokeRemoved is no-op when called before any commit', () => {
      tracker.onLiveStrokeRemoved('user1');

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.regions.length).toBe(0);
    });

    it('onLaserRemoved is no-op when called before any commit', () => {
      tracker.onLaserRemoved('laser1');

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.regions.length).toBe(0);
    });

    it('onActiveStrokeEnded is no-op when called before any commit', () => {
      tracker.onActiveStrokeEnded();

      const result = tracker.prepareFrame(viewport, null, new Map(), new Map());
      expect(result.regions.length).toBe(0);
    });
  });
});
