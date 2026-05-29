# Implementation Plan: Dirty Rectangle Rendering

## Overview

This plan implements region-based invalidation tracking for the SlideBot render worker. The implementation proceeds bottom-up: first the stateless bounding box calculator, then the dirty region tracker with merging logic, then integration with the existing FrameBudgetScheduler and render worker command handler, and finally metrics extension. Each step builds on the previous, with property-based tests validating correctness properties from the design.

## Tasks

- [x] 1. Implement BoundingBoxCalculator module
  - [x] 1.1 Create `boundingBoxCalculator.ts` with core interfaces and point-array bounding box computation
    - Create new file `packages/renderer/src/boundingBoxCalculator.ts`
    - Define `BoundingBox` interface (`x`, `y`, `width`, `height` in pixel coordinates)
    - Define `ViewportDimensions` interface (`viewportWidth`, `viewportHeight`)
    - Implement `computePointsBBox(points: Float64Array, strokeWidthPx: number, viewport: ViewportDimensions): BoundingBox` — iterates coordinate pairs, finds min/max, expands by half strokeWidth, returns zero-area bbox for arrays with fewer than 2 values
    - Implement `computeLaserBBox(trail: Float64Array, viewport: ViewportDimensions): BoundingBox` — same as points but expands by 6px laser head radius
    - Implement `clampToViewport(bbox: BoundingBox, viewport: ViewportDimensions): BoundingBox` — clamps x≥0, y≥0, x+width≤viewportWidth, y+height≤viewportHeight
    - All point coordinates are normalized [0,1] and must be converted to pixel space using viewport dimensions
    - _Requirements: 1.1, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

  - [ ]* 1.2 Write property tests for point-array bounding box (Property 1)
    - **Property 1: Point-array bounding box encloses all points with padding**
    - Create `packages/renderer/src/__tests__/boundingBoxCalculator.property.test.ts`
    - Generate arbitrary Float64Arrays of normalized coordinate pairs (length ≥ 4), positive expansion radii, and viewport dimensions
    - Assert every pixel-space point is within the bbox with at least expansion radius clearance
    - **Validates: Requirements 1.1, 1.5, 1.6, 1.7**

  - [x] 1.3 Implement highlight and arrow bounding box computation
    - Implement `computeAnnotationBBox(annotation: SerializedAnnotation, viewport: ViewportDimensions, ctx?: OffscreenCanvasRenderingContext2D): BoundingBox` — dispatches by tool type
    - Highlight: compute bbox as `(x × viewportWidth, y × viewportHeight, width × viewportWidth, height × viewportHeight)`
    - Implement `computeArrowBBox(startX, startY, endX, endY, strokeWidthPx, viewport): BoundingBox` — compute arrowhead vertices at ±30° from line angle with length = max(strokeWidth×3, 10), find min/max of all points, expand by half strokeWidth
    - Text: use `ctx.measureText` for width and font metrics for height, position from (x, y) in pixel space
    - All results clamped to viewport via `clampToViewport`
    - _Requirements: 1.2, 1.3, 1.4, 1.9, 1.10_

  - [ ]* 1.4 Write property tests for highlight bounding box (Property 2)
    - **Property 2: Highlight bounding box equals pixel-converted rectangle**
    - Generate arbitrary highlight annotations with (x, y, width, height) in [0,1] and viewport dimensions
    - Assert computed bbox equals the pixel-converted rectangle after clamping
    - **Validates: Requirements 1.2**

  - [ ]* 1.5 Write property tests for arrow bounding box (Property 3)
    - **Property 3: Arrow bounding box encloses line and arrowhead geometry**
    - Generate arbitrary arrow start/end points, strokeWidths, and viewports
    - Assert bbox contains start, end, and arrowhead tip vertices with half-strokeWidth clearance
    - **Validates: Requirements 1.3**

  - [ ]* 1.6 Write property tests for viewport clamping (Property 4)
    - **Property 4: Bounding box viewport clamping invariant**
    - Generate arbitrary bounding boxes (including those exceeding viewport) and viewports
    - Assert clamped result satisfies x≥0, y≥0, x+width≤viewportWidth, y+height≤viewportHeight, width≥0, height≥0
    - **Validates: Requirements 1.9, 1.10**

- [x] 2. Implement DirtyRegionTracker with region merging
  - [x] 2.1 Create `dirtyRegionTracker.ts` with core tracking and merging logic
    - Create new file `packages/renderer/src/dirtyRegionTracker.ts`
    - Define `DirtyRectConfig` interface with defaults: `{ enabled: true, coverageThreshold: 0.6, regionCountThreshold: 16, mergeMargin: 4 }`
    - Define `DirtyFrameResult` interface: `{ useFullClear, regions, totalDirtyArea, coverageRatio }`
    - Define `PreviousFrameRegions` interface with `activeStroke`, `liveStrokes` Map, `lasers` Map
    - Implement `DirtyRegionTracker` class with:
      - `markDirty(bbox)` — validates bbox (discards NaN/Infinity/negative, expands zero-area to 1×1), adds to accumulated regions
      - `invalidateAll()` — sets full-clear flag for next frame
      - Internal `mergeRegions(regions, mergeMargin)` — iterative pairwise merge until no overlapping/adjacent pairs remain (O(n³) for n≤64)
      - Region overlap/adjacency test: gap on X-axis ≤ margin AND gap on Y-axis ≤ margin
    - _Requirements: 2.1, 2.2, 2.3, 2.14, 3.1, 3.2, 3.3, 3.4, 3.5, 10.4_

  - [ ]* 2.2 Write property tests for region merging (Property 9)
    - **Property 9: Region merge post-condition — no mergeable pairs remain**
    - Create `packages/renderer/src/__tests__/regionMerge.property.test.ts`
    - Generate arbitrary sets of bounding boxes and merge margins
    - Assert no pair in the output overlaps or has edge-to-edge distance ≤ margin on both axes
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 2.3 Implement `prepareFrame` with previous-frame region handling and fallback decisions
    - Implement `prepareFrame(viewport, activeStrokeBBox, liveStrokeBBoxes, laserBBoxes): DirtyFrameResult`
      - Add current dynamic item bboxes as dirty regions
      - Add stored previous-frame bboxes as dirty regions
      - Merge all accumulated regions
      - Evaluate fallback: if disabled → useFullClear=true; if coverage > threshold or count > threshold → useFullClear=true
      - Return merged regions and metrics
    - Implement `commitFrame(activeStrokeBBox, liveStrokeBBoxes, laserBBoxes)` — stores current bboxes as previous-frame regions, clears accumulated dirty regions
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.12, 5.1, 5.2, 5.5, 9.4_

  - [ ]* 2.4 Write property tests for dirty region tracking (Properties 5, 6, 7)
    - **Property 5: Cache mutations mark affected bounding boxes as dirty**
    - **Property 6: Dynamic items contribute current and previous bounding boxes to dirty regions**
    - **Property 7: Previous-frame regions stored after render pass completion**
    - Create `packages/renderer/src/__tests__/dirtyRegionTracker.property.test.ts`
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 7.1, 7.2, 7.3**

  - [x] 2.5 Implement dynamic item removal and lifecycle event handlers
    - Implement `onLiveStrokeRemoved(userId)` — marks stored previous-frame bbox as dirty, removes entry
    - Implement `onLaserRemoved(userId)` — marks stored previous-frame bbox as dirty, removes entry
    - Implement `onActiveStrokeEnded()` — marks stored previous-frame bbox as dirty, clears entry
    - Implement `onResize()` — clears all previous-frame regions, sets full-clear flag
    - Implement `onSlideChange()` — clears all previous-frame regions, sets full-clear flag
    - Handle case where no previous-frame entry exists (no-op)
    - _Requirements: 7.4, 7.5, 7.6, 7.7, 8.1, 8.3, 2.10, 2.11_

  - [ ]* 2.6 Write property tests for dynamic item removal (Property 8) and resize (Property 14)
    - **Property 8: Dynamic item removal marks previous region dirty and removes entry**
    - **Property 14: Resize clears previous-frame regions and triggers full clear**
    - **Validates: Requirements 7.4, 7.5, 7.6, 8.1, 8.3**

  - [ ]* 2.7 Write property tests for fallback thresholds (Properties 11, 12, 13)
    - **Property 11: Coverage ratio exceeding threshold triggers full clear**
    - **Property 12: Region count exceeding threshold triggers full clear**
    - **Property 13: Full clear resets all tracking state**
    - **Validates: Requirements 5.1, 5.2, 5.4**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement configuration and validation
  - [x] 4.1 Implement `setConfig` with validation and `getConfig`
    - Implement `setConfig(partial: Partial<DirtyRectConfig>): string | null`
      - Validate ranges: coverageThreshold [0.1, 1.0], regionCountThreshold [1, 64], mergeMargin [0, 32]
      - If any value out of range: reject entire command, return error message listing invalid fields
      - If all valid: update only specified fields, return null
    - Implement `getConfig(): Readonly<DirtyRectConfig>`
    - Handle `enabled: false` → prepareFrame always returns useFullClear=true
    - Handle `enabled: true` after disable → trigger full clear for first frame, clear previous-frame regions
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 4.2 Write property tests for configuration (Properties 15, 16, 17)
    - **Property 15: Valid partial config updates only specified fields**
    - **Property 16: Invalid config values reject entire command**
    - **Property 17: Disabled dirty rect always uses full clear**
    - Create `packages/renderer/src/__tests__/dirtyRectConfig.property.test.ts`
    - **Validates: Requirements 9.1, 9.2, 9.4**

  - [ ]* 4.3 Write property tests for invalid region handling (Property 18)
    - **Property 18: Invalid regions trigger full clear fallback**
    - Generate bboxes with NaN, Infinity, negative width/height
    - Assert invalid regions are discarded and full clear is triggered
    - **Validates: Requirements 10.4**

- [x] 5. Implement overlap query and integrate with render pipeline
  - [x] 5.1 Implement overlap query function
    - Create `findOverlappingAnnotations` function in `dirtyRegionTracker.ts` or a separate utility
    - Linear scan over all cached annotations, compute bbox, test AABB intersection against each dirty region
    - AABB intersection: `a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y`
    - Return annotations in insertion order (oldest-to-newest) for z-order correctness
    - Also determine which live strokes, lasers, and active stroke intersect dirty regions
    - _Requirements: 4.1, 4.2, 10.2_

  - [ ]* 5.2 Write property tests for overlap query (Property 10)
    - **Property 10: Overlap query returns exactly intersecting items in z-order**
    - Create `packages/renderer/src/__tests__/overlapQuery.property.test.ts`
    - Generate sets of annotations with known bboxes and dirty regions
    - Assert result contains exactly those whose bbox intersects any region, in correct z-order
    - **Validates: Requirements 4.1, 4.2, 10.2**

  - [x] 5.3 Integrate dirty rectangle rendering into FrameBudgetScheduler
    - Modify `executeBudgetedRender` to accept optional `DirtyFrameResult` parameter
    - When `dirtyFrame` provided and `useFullClear === false`:
      - `ctx.save()` → build clip path from union of dirty regions (series of `ctx.rect()` calls) → `ctx.clip()`
      - `ctx.clearRect` per dirty region
      - Render only overlapping items in z-order with budget enforcement (check elapsed after each item, render at least one per region)
      - `ctx.restore()`
    - When `useFullClear === true` or no `dirtyFrame`: existing full-canvas behavior unchanged
    - Budget enforcement: defer remaining items/regions when budget exceeded, store resume indices in deferred work
    - _Requirements: 4.4, 4.5, 4.6, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 5.4 Implement deferred work handling for dirty regions
    - Extend `DeferredWork` type with `DirtyRegionDeferredWork` fields: `dirtyRegionResumeIndex`, `itemResumeIndex`, `dirtyRegions`, `overlappingItems`
    - On follow-up frame: re-apply clip for remaining regions, resume from stored indices
    - If content-affecting command arrives while deferred work exists: discard deferred work, cancel follow-up frame, trigger fresh render pass
    - _Requirements: 6.2, 6.3, 6.6_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integrate with render worker command handler
  - [x] 7.1 Wire DirtyRegionTracker into render worker state and command flow
    - Instantiate `DirtyRegionTracker` in render worker initialization
    - Hook into annotation cache mutations (add/remove/modify) to call `markDirty` with old and new bboxes
    - Hook into RESIZE handler to call `onResize()`
    - Hook into SLIDE_CHANGE handler to call `onSlideChange()`
    - Hook into LIVE_STROKE_REMOVE/LIVE_STROKE_COMMIT to call `onLiveStrokeRemoved(userId)`
    - Hook into LASER_REMOVE to call `onLaserRemoved(userId)`
    - Hook into active stroke commit/cancel to call `onActiveStrokeEnded()`
    - In render loop: call `prepareFrame` before rendering, pass result to `executeBudgetedRender`, call `commitFrame` after render pass
    - _Requirements: 2.1, 2.2, 2.3, 2.10, 2.11, 2.13, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 8.4_

  - [x] 7.2 Implement SET_DIRTY_RECT_CONFIG command handler
    - Add `SET_DIRTY_RECT_CONFIG` to the `RenderCommand` union type
    - Add `DirtyRectConfigInput` interface for the command payload
    - In command handler: call `tracker.setConfig(config)`, respond with `DIRTY_RECT_CONFIG_UPDATED` or `DIRTY_RECT_CONFIG_ERROR`
    - Add response types to the worker response union
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 7.3 Implement frame skip optimization and first-frame full clear
    - When no dirty regions exist and previous ImageBitmap is available: skip render pass, reuse previous bitmap
    - On first frame or after canvas re-initialization: force full clear regardless of dirty state
    - _Requirements: 10.3, 10.5_

  - [x] 7.4 Implement bounding box recomputation on resize
    - After RESIZE, before next render pass: recompute all cached annotation bounding boxes using new viewport dimensions
    - Ensure recomputation happens before dirty region merging or overlap queries
    - Handle multiple RESIZE commands before next render: use only the most recent viewport dimensions
    - _Requirements: 8.2, 8.4_

- [x] 8. Implement performance metrics extension
  - [x] 8.1 Extend FrameMetricsEntry with dirty rectangle data
    - Add `dirtyRect?: { regionCount, totalDirtyArea, coverageRatio, usedFullClear }` to `FrameMetricsEntry`
    - Record dirty rect metrics from `DirtyRegionTracker.getFrameMetrics()` after each frame
    - Attribute per-item render time to existing category metrics (activeStrokeMs, liveStrokesMs, etc.) regardless of which dirty region
    - _Requirements: 11.1, 6.4_

  - [x] 8.2 Extend MetricsResponse with dirty rectangle statistics
    - Add `dirtyRect` section to `MetricsResponse` with: avg/p95/max for regionCount, totalDirtyArea, coverageRatio; fullClearCount; partialRedrawRatio
    - Compute statistics over the rolling window in GET_METRICS handler
    - Return zeros when rolling window is empty
    - _Requirements: 11.2, 11.3_

  - [ ]* 8.3 Write unit tests for metrics recording and aggregation
    - Test that dirty rect metrics are recorded per frame
    - Test aggregation over rolling window (avg, p95, max)
    - Test empty window returns zeros
    - Test partialRedrawRatio calculation
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 9. Final integration and correctness validation
  - [x] 9.1 Implement full-clear fallback correctness safeguards
    - When full clear triggered: clear entire canvas, redraw all items in z-order (Committed oldest-to-newest, Live_Strokes by userId ascending, Lasers by userId ascending, Active_Stroke)
    - When full clear triggered: clear all tracked dirty regions and previous-frame regions
    - When full clear triggered with deferred dirty-region work: discard all deferred work
    - _Requirements: 5.3, 5.4, 5.6, 10.1, 10.2_

  - [ ]* 9.2 Write integration tests for end-to-end dirty rectangle rendering
    - Test complete render pass with dirty regions: commands → dirty tracking → merge → clip → render → commit
    - Test deferred work across follow-up frames with dirty regions
    - Test full-clear fallback produces identical output to pre-dirty-rectangle rendering
    - Test frame skip when no dirty regions
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 9.3 Write performance benchmark test for region merging
    - Verify merge of 64 regions completes within 2ms
    - _Requirements: 3.6_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript with Vitest for testing and fast-check for property-based tests
- All bounding box computation operates in pixel space (post-conversion from normalized coordinates)
- The brute-force overlap query (linear scan with AABB intersection) is appropriate given the bounded cache size (max 500 annotations)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "1.5", "1.6", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3"] },
    { "id": 4, "tasks": ["2.4", "2.5", "4.1"] },
    { "id": 5, "tasks": ["2.6", "2.7", "4.2", "4.3", "5.1"] },
    { "id": 6, "tasks": ["5.2", "5.3"] },
    { "id": 7, "tasks": ["5.4"] },
    { "id": 8, "tasks": ["7.1", "7.2", "7.3", "7.4"] },
    { "id": 9, "tasks": ["8.1"] },
    { "id": 10, "tasks": ["8.2", "8.3"] },
    { "id": 11, "tasks": ["9.1"] },
    { "id": 12, "tasks": ["9.2", "9.3"] }
  ]
}
```
