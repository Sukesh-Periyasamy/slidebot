                                                                                                   # Requirements Document

## Introduction

Dirty Rectangle Rendering introduces region-based invalidation tracking to the SlideBot render worker. Instead of clearing and redrawing the entire canvas every frame, the system tracks which rectangular regions of the canvas have changed (become "dirty") and redraws only those regions — along with any overlapping items required for z-order correctness. This is the next major rendering milestone after the Frame Budget Scheduler, targeting massive FPS gains, lower GPU bandwidth consumption, and reduced memory pressure on the OffscreenCanvas pipeline.

The system must integrate with the existing FrameBudgetScheduler (budget enforcement still applies within dirty regions), preserve the deterministic rendering order invariant (Active_Stroke > Live_Strokes > Lasers > Committed_Annotations), and maintain visual correctness by redrawing all overlapping items within each dirty region in proper z-order.

## Glossary

- **Dirty_Region**: An axis-aligned bounding rectangle (in pixel coordinates) marking a portion of the canvas that requires redrawing due to annotation changes.
- **Dirty_Region_Tracker**: The component responsible for accumulating, merging, and managing dirty regions across frames.
- **Bounding_Box**: The minimal axis-aligned rectangle that fully encloses a rendered annotation or stroke, including stroke width padding.
- **Bounding_Box_Calculator**: The component that computes the Bounding_Box for each annotation type (freehand, highlight, arrow, text, laser trail, active stroke, live stroke).
- **Region_Merge**: The process of combining two or more overlapping or adjacent Dirty_Regions into a single larger region to reduce per-region overhead.
- **Overlap_Query**: A spatial lookup that returns all renderable items whose Bounding_Box intersects a given Dirty_Region.
- **Full_Clear_Fallback**: The existing full-canvas clear-and-redraw behavior, used when the number or total area of Dirty_Regions exceeds a configurable threshold.
- **Render_Worker**: The existing Web Worker (`render.worker.ts`) that owns the OffscreenCanvas and performs all annotation rendering.
- **Frame_Budget_Scheduler**: The existing scheduling component that enforces per-frame time budgets with priority-based rendering and deferral.
- **Committed_Annotations**: Finalized annotations stored in the Worker_Annotation_Cache. Only become dirty when added, removed, or modified.
- **Active_Stroke**: The local user's in-progress stroke. Its region is dirty every frame.
- **Live_Strokes**: Remote users' in-progress strokes. Their regions are dirty every frame.
- **Lasers**: Laser pointer trails from all users. Their trail regions are dirty each frame.
- **Clip_Region**: A canvas clipping path set to the union of Dirty_Regions, restricting draw calls to only the invalidated area.
- **Region_Coverage_Ratio**: The ratio of total Dirty_Region area to total canvas area, used to decide between partial redraw and Full_Clear_Fallback.
- **Previous_Frame_Regions**: The set of Dirty_Regions from the previous frame, used to clear areas where dynamic items (Active_Stroke, Live_Strokes, Lasers) were previously drawn.

## Requirements

### Requirement 1: Bounding Box Computation

**User Story:** As a render engine developer, I want accurate bounding boxes for every annotation type so that the dirty region system knows exactly which canvas area each item occupies.

#### Acceptance Criteria

1. WHEN a freehand annotation with 2 or more coordinate values in its Float64Array is provided, THE Bounding_Box_Calculator SHALL compute the Bounding_Box as the minimum axis-aligned rectangle enclosing all points (stored as [x0, y0, x1, y1, ...] pairs) in the annotation's Float64Array, expanded by half the strokeWidth in pixels on each side, with point coordinates converted from normalized [0,1] space to pixel space using the current viewport dimensions.
2. WHEN a highlight annotation is provided, THE Bounding_Box_Calculator SHALL compute the Bounding_Box as the rectangle defined by (x, y, width, height) converted from normalized [0,1] space to pixel space.
3. WHEN an arrow annotation is provided, THE Bounding_Box_Calculator SHALL compute the Bounding_Box as the minimum axis-aligned rectangle enclosing the start point, end point, and arrowhead triangle vertices (where arrowhead length equals the greater of strokeWidth multiplied by 3 or 10 pixels, at an angle of ±30 degrees from the line), expanded by half the strokeWidth in pixels on each side, with point coordinates converted from normalized [0,1] space to pixel space.
4. WHEN a text annotation is provided, THE Bounding_Box_Calculator SHALL compute the Bounding_Box using the text position (x, y) converted from normalized [0,1] space to pixel space, with width determined by `ctx.measureText(content).width` and height determined by the font metrics (actualBoundingBoxAscent + actualBoundingBoxDescent) at the computed pixel font size (fontSize converted from normalized space using viewport height).
5. WHEN an active stroke is provided, THE Bounding_Box_Calculator SHALL compute the Bounding_Box as the minimum axis-aligned rectangle enclosing all points (stored as [x0, y0, x1, y1, ...] pairs) in the stroke's Float64Array, expanded by half the strokeWidth in pixels on each side, with point coordinates converted from normalized [0,1] space to pixel space.
6. WHEN a live stroke is provided, THE Bounding_Box_Calculator SHALL compute the Bounding_Box as the minimum axis-aligned rectangle enclosing all points (stored as [x0, y0, x1, y1, ...] pairs) in the stroke's Float64Array, expanded by half the strokeWidth in pixels on each side, with point coordinates converted from normalized [0,1] space to pixel space.
7. WHEN a laser trail is provided, THE Bounding_Box_Calculator SHALL compute the Bounding_Box as the minimum axis-aligned rectangle enclosing all trail points (stored as [x0, y0, x1, y1, ...] pairs), expanded by the laser head radius (6 pixels) on each side, with point coordinates converted from normalized [0,1] space to pixel space.
8. IF a freehand annotation, active stroke, live stroke, or laser trail is provided with fewer than 2 coordinate values in its Float64Array, THEN THE Bounding_Box_Calculator SHALL return a zero-area Bounding_Box (x: 0, y: 0, width: 0, height: 0).
9. THE Bounding_Box_Calculator SHALL clamp the computed Bounding_Box to the canvas viewport boundaries (0, 0, viewportWidth, viewportHeight) so that x is at minimum 0, y is at minimum 0, and x + width does not exceed viewportWidth and y + height does not exceed viewportHeight.
10. THE Bounding_Box_Calculator SHALL return a Bounding_Box represented as four numeric values: x, y, width, height (in pixel coordinates, where width and height are at minimum 0).

### Requirement 2: Dirty Region Tracking

**User Story:** As a render engine developer, I want the system to track which canvas regions are invalidated so that only changed areas are redrawn each frame.

#### Acceptance Criteria

1. WHEN an annotation is added to the Worker_Annotation_Cache, THE Dirty_Region_Tracker SHALL mark the Bounding_Box of the new annotation as a Dirty_Region.
2. WHEN an annotation is removed from the Worker_Annotation_Cache, THE Dirty_Region_Tracker SHALL mark the Bounding_Box of the removed annotation as a Dirty_Region.
3. WHEN any property of an annotation that affects its rendered output (geometry, position, color, stroke width, or opacity) is modified in the Worker_Annotation_Cache, THE Dirty_Region_Tracker SHALL mark both the old Bounding_Box (before modification) and the new Bounding_Box (after modification) as Dirty_Regions.
4. WHILE an Active_Stroke exists, THE Dirty_Region_Tracker SHALL mark the Active_Stroke's current Bounding_Box as a Dirty_Region every frame.
5. WHILE an Active_Stroke exists, THE Dirty_Region_Tracker SHALL mark the Active_Stroke's Previous_Frame_Regions as a Dirty_Region every frame to clear the previous position.
6. WHILE Live_Strokes exist, THE Dirty_Region_Tracker SHALL mark each Live_Stroke's current Bounding_Box as a Dirty_Region every frame.
7. WHILE Live_Strokes exist, THE Dirty_Region_Tracker SHALL mark each Live_Stroke's Previous_Frame_Regions as a Dirty_Region every frame to clear the previous position.
8. WHILE Lasers exist, THE Dirty_Region_Tracker SHALL mark each Laser's current trail Bounding_Box as a Dirty_Region every frame.
9. WHILE Lasers exist, THE Dirty_Region_Tracker SHALL mark each Laser's Previous_Frame_Regions as a Dirty_Region every frame to clear the previous trail position.
10. WHEN a RESIZE command is received, THE Dirty_Region_Tracker SHALL invalidate the entire canvas (equivalent to Full_Clear_Fallback) for the next frame.
11. WHEN a SLIDE_CHANGE command is received, THE Dirty_Region_Tracker SHALL invalidate the entire canvas for the next frame and clear all tracked Previous_Frame_Regions.
12. WHEN a render pass completes (including all follow-up frames for deferred work from the Frame_Budget_Scheduler), THE Dirty_Region_Tracker SHALL clear all accumulated Dirty_Regions, retaining only the Previous_Frame_Regions needed for the next frame's dynamic item clearing.
13. IF an annotation change (add, remove, or modify) arrives in the Worker_Annotation_Cache while a render pass is in progress, THEN THE Dirty_Region_Tracker SHALL queue the resulting Dirty_Region for inclusion in the next render pass rather than the current one.
14. IF a Dirty_Region has zero area (width or height equals zero), THEN THE Dirty_Region_Tracker SHALL expand it to a minimum size of 1×1 pixel before adding it to the accumulated Dirty_Regions.

### Requirement 3: Region Merging

**User Story:** As a render engine developer, I want overlapping or adjacent dirty regions to be merged so that the system avoids redundant clip/redraw operations and reduces per-region overhead.

#### Acceptance Criteria

1. WHEN two Dirty_Regions overlap (share any pixel area), THE Dirty_Region_Tracker SHALL merge them into a single Dirty_Region whose bounds are the union (bounding rectangle) of both regions.
2. WHEN two Dirty_Regions are adjacent (the minimum axis-aligned edge-to-edge distance between them is less than or equal to the configured merge margin), THE Dirty_Region_Tracker SHALL merge them into a single Dirty_Region whose bounds are the union of both regions, where edge-to-edge distance is computed independently on the X and Y axes and both must be within the margin for a merge to occur.
3. THE Dirty_Region_Tracker SHALL apply region merging iteratively until no remaining pair of Dirty_Regions satisfies the overlap or adjacency merge condition, producing a set of non-overlapping, non-adjacent Dirty_Regions.
4. THE Dirty_Region_Tracker SHALL use a default merge margin of 4 pixels for adjacency detection.
5. THE Dirty_Region_Tracker SHALL perform region merging after all Dirty_Regions for the current frame have been accumulated and before the render pass begins, producing the final set of Dirty_Regions used for clipping and overlap queries.
6. THE Dirty_Region_Tracker SHALL complete the region merging pass within 2 milliseconds for up to 64 input Dirty_Regions.

### Requirement 4: Overlap Detection and Z-Order Correctness

**User Story:** As a user, I want annotations within dirty regions to render with correct layering so that overlapping strokes and shapes appear in the same visual order as the full-canvas render.

#### Acceptance Criteria

1. WHEN a Dirty_Region is being redrawn, THE Render_Worker SHALL identify all renderable items (Committed_Annotations, Live_Strokes, Lasers, Active_Stroke) whose Bounding_Box intersects that Dirty_Region.
2. WHEN rendering items within a Dirty_Region, THE Render_Worker SHALL draw them in the same deterministic priority and z-order as the full-canvas render: Committed_Annotations (oldest-to-newest in insertion order) first, then Live_Strokes (in the order they were added to the live stroke collection), then Lasers (in the order they were added to the laser collection), then Active_Stroke on top.
3. IF a renderable item's Bounding_Box intersects multiple Dirty_Regions, THEN THE Render_Worker SHALL render that item once per Dirty_Region it intersects (clipped to each region), or render it once with a combined clip path covering all intersecting regions.
4. WHEN rendering a Dirty_Region, THE Render_Worker SHALL save the canvas context state, set a Clip_Region restricting pixel output to within the Dirty_Region boundaries, perform all drawing for that region, and then restore the canvas context state to remove the clip before processing the next Dirty_Region.
5. WHEN the Clip_Region is active, THE Render_Worker SHALL clear only the area within the Clip_Region (not the entire canvas) before redrawing items in that region.
6. IF no renderable items intersect a Dirty_Region, THEN THE Render_Worker SHALL still clear the area within that Dirty_Region's Clip_Region and skip drawing, so that previously rendered content in that area is erased.

### Requirement 5: Full Clear Fallback

**User Story:** As a render engine developer, I want the system to fall back to full-canvas clearing when too many regions are dirty so that the overhead of region tracking does not exceed the cost of a full redraw.

#### Acceptance Criteria

1. WHEN the Region_Coverage_Ratio is strictly greater than the configured coverage threshold (default 0.6, meaning more than 60% of canvas area is dirty), THE Render_Worker SHALL perform a Full_Clear_Fallback instead of partial region redraws.
2. WHEN the number of merged Dirty_Regions is strictly greater than the configured count threshold (default 16 regions), THE Render_Worker SHALL perform a Full_Clear_Fallback instead of partial region redraws.
3. WHEN a Full_Clear_Fallback is triggered, THE Render_Worker SHALL clear the entire canvas and redraw all Committed_Annotations (oldest-to-newest), Live_Strokes, Lasers, and Active_Stroke in that priority and z-order, producing output identical to the pre-dirty-rectangle full-canvas render.
4. WHEN a Full_Clear_Fallback is triggered, THE Dirty_Region_Tracker SHALL clear all tracked Dirty_Regions and Previous_Frame_Regions, resetting to a state with zero tracked regions.
5. THE Render_Worker SHALL evaluate fallback thresholds after region merging is complete but before the render pass begins, triggering Full_Clear_Fallback if either the coverage threshold or the region count threshold is exceeded.
6. WHEN a Full_Clear_Fallback is triggered and deferred dirty-region work exists from a previous frame, THE Render_Worker SHALL discard all deferred dirty-region work and perform the full-canvas redraw from scratch.

### Requirement 6: Integration with Frame Budget Scheduler

**User Story:** As a render engine developer, I want dirty rectangle rendering to work within the existing frame budget system so that per-frame time limits are still enforced.

#### Acceptance Criteria

1. WHILE rendering items within Dirty_Regions, THE Frame_Budget_Scheduler SHALL continue to enforce the configured Frame_Budget, checking elapsed time after each item is drawn within a region, and SHALL render at least one item per Dirty_Region before checking the budget.
2. WHEN the Frame_Budget is exceeded during dirty-region rendering, THE Frame_Budget_Scheduler SHALL defer remaining items within the current Dirty_Region and all subsequent unprocessed Dirty_Regions (in their original merged-list order) as Deferred_Work for follow-up frames.
3. WHEN a follow-up frame resumes deferred dirty-region work, THE Render_Worker SHALL re-apply the Clip_Region for the remaining Dirty_Regions, starting from the deferred region index and the item index within that region where the previous frame stopped, and continue rendering in the same z-order.
4. THE Frame_Budget_Scheduler SHALL include dirty-region rendering time in the per-category timing metrics (activeStrokeMs, liveStrokesMs, lasersMs, committedAnnotationsMs), attributing each item's render time to its category regardless of which Dirty_Region it belongs to.
5. WHEN a Full_Clear_Fallback is triggered, THE Frame_Budget_Scheduler SHALL apply budget enforcement identically to the current full-canvas render behavior (category-level budget checks with per-item elapsed time verification after each draw call).
6. IF a content-affecting command is received while dirty-region Deferred_Work exists, THEN THE Frame_Budget_Scheduler SHALL discard the pending dirty-region Deferred_Work, cancel any scheduled follow-up frame, and trigger a fresh render pass on the next frame.

### Requirement 7: Previous Frame Region Tracking

**User Story:** As a render engine developer, I want the system to track where dynamic items were drawn in the previous frame so that their old positions are properly cleared.

#### Acceptance Criteria

1. WHEN a render pass completes, THE Dirty_Region_Tracker SHALL store the Bounding_Box of the Active_Stroke as rendered during that pass as the Previous_Frame_Regions entry for the Active_Stroke, replacing any prior entry.
2. WHEN a render pass completes, THE Dirty_Region_Tracker SHALL store the Bounding_Box of each Live_Stroke as rendered during that pass as the Previous_Frame_Regions entry for that Live_Stroke (keyed by stroke identifier), replacing any prior entry for that stroke.
3. WHEN a render pass completes, THE Dirty_Region_Tracker SHALL store the Bounding_Box of each Laser trail as rendered during that pass as the Previous_Frame_Regions entry for that Laser (keyed by laser identifier), replacing any prior entry for that laser.
4. WHEN a Live_Stroke is removed (LIVE_STROKE_REMOVE or LIVE_STROKE_COMMIT), THE Dirty_Region_Tracker SHALL mark that stroke's Previous_Frame_Regions entry as a Dirty_Region and remove the entry from Previous_Frame_Regions.
5. WHEN a Laser is removed (LASER_REMOVE), THE Dirty_Region_Tracker SHALL mark that laser's Previous_Frame_Regions entry as a Dirty_Region and remove the entry from Previous_Frame_Regions.
6. WHEN the Active_Stroke is committed or cancelled, THE Dirty_Region_Tracker SHALL mark the Active_Stroke's Previous_Frame_Regions entry as a Dirty_Region and clear the Active_Stroke Previous_Frame_Regions entry.
7. IF a Live_Stroke, Laser, or Active_Stroke is removed but has no corresponding Previous_Frame_Regions entry, THEN THE Dirty_Region_Tracker SHALL take no action for that item's previous region (no Dirty_Region is marked and no entry is removed).

### Requirement 8: Viewport Resize Handling

**User Story:** As a user resizing the browser window, I want the dirty region system to handle viewport changes correctly so that annotations render at the correct positions after resize.

#### Acceptance Criteria

1. WHEN a RESIZE command is received, THE Dirty_Region_Tracker SHALL discard all stored Previous_Frame_Regions (since pixel coordinates from the old viewport size are no longer valid) and clear their entries from tracking state.
2. WHEN a RESIZE command is received, THE Bounding_Box_Calculator SHALL recompute all cached Bounding_Boxes for Committed_Annotations using the new viewport dimensions on the next render pass, before dirty region merging or overlap queries are performed.
3. WHEN a RESIZE command is received, THE Dirty_Region_Tracker SHALL trigger a Full_Clear_Fallback for the next frame to ensure all items are redrawn at the new viewport size.
4. IF multiple RESIZE commands are received before the next render pass begins, THEN THE Dirty_Region_Tracker SHALL use only the viewport dimensions from the most recent RESIZE command and trigger a single Full_Clear_Fallback for the next frame.

### Requirement 9: Configuration

**User Story:** As a developer, I want to configure dirty rectangle thresholds at runtime so that I can tune the system for different device capabilities and workloads.

#### Acceptance Criteria

1. WHEN a `SET_DIRTY_RECT_CONFIG` command is received with valid parameters, THE Dirty_Region_Tracker SHALL update only the specified configuration values (supporting partial updates where unspecified fields retain their current values): coverage ratio threshold (range 0.1 to 1.0), region count threshold (range 1 to 64), and merge margin (range 0 to 32 pixels).
2. IF the `SET_DIRTY_RECT_CONFIG` command specifies one or more values outside the accepted ranges, THEN THE Dirty_Region_Tracker SHALL reject the entire command, retain all current configuration values unchanged, and respond with an error message indicating which values are out of range.
3. WHEN a `SET_DIRTY_RECT_CONFIG` command is accepted, THE Dirty_Region_Tracker SHALL apply the new configuration starting from the next render frame (the current in-progress frame, if any, completes with the previous configuration).
4. WHEN dirty rectangle rendering is disabled via a `SET_DIRTY_RECT_CONFIG` command with `enabled: false`, THE Render_Worker SHALL revert to Full_Clear_Fallback behavior for all subsequent frames until re-enabled.
5. WHEN dirty rectangle rendering is re-enabled via a `SET_DIRTY_RECT_CONFIG` command with `enabled: true`, THE Render_Worker SHALL resume dirty-region-based partial rendering starting from the next render frame, treating all Previous_Frame_Regions as invalid and triggering a Full_Clear_Fallback for the first frame after re-enable.
6. THE Dirty_Region_Tracker SHALL use the following default configuration: coverage ratio threshold of 0.6, region count threshold of 16, merge margin of 4 pixels, and enabled state of true.

### Requirement 10: Correctness Invariants

**User Story:** As a render engine developer, I want the dirty rectangle system to preserve all existing rendering invariants so that visual output is identical to the full-canvas render when all regions are considered.

#### Acceptance Criteria

1. FOR ALL frames produced by the dirty rectangle system, THE Render_Worker SHALL produce pixel-identical output within each Dirty_Region compared to what a full-canvas render would produce for those same pixels.
2. THE Render_Worker SHALL maintain the deterministic rendering order invariant: within any Dirty_Region, items are drawn in the order Committed_Annotations (oldest-to-newest by insertion order), Live_Strokes (ordered by user ID ascending), Lasers (ordered by user ID ascending), Active_Stroke.
3. WHEN no Dirty_Regions exist for a frame and a previous frame's ImageBitmap is available, THE Render_Worker SHALL skip the render pass entirely and reuse the previous frame's ImageBitmap.
4. IF the Dirty_Region_Tracker detects an invalid region (negative width or height, zero width or height, NaN coordinates, or Infinity coordinates), THEN THE Render_Worker SHALL discard the invalid region, log a warning, and trigger a Full_Clear_Fallback for that frame.
5. IF no previous ImageBitmap is available (first frame or after canvas re-initialization), THEN THE Render_Worker SHALL perform a Full_Clear_Fallback regardless of the Dirty_Region state.

### Requirement 11: Performance Metrics Extension

**User Story:** As a developer, I want dirty rectangle metrics included in the existing metrics system so that I can measure the effectiveness of partial redraws.

#### Acceptance Criteria

1. THE Frame_Budget_Scheduler SHALL record the following dirty rectangle data in each FrameMetricsEntry within the rolling window: number of merged Dirty_Regions for that frame, total dirty area in pixels for that frame, Region_Coverage_Ratio for that frame, and whether Full_Clear_Fallback was triggered for that frame.
2. WHEN a `GET_METRICS` command is received, THE Frame_Budget_Scheduler SHALL include dirty rectangle statistics in the MetricsResponse computed over the rolling window: average, p95, and max values for Dirty_Region count per frame; average, p95, and max values for total dirty area in pixels; average, p95, and max values for Region_Coverage_Ratio; count of frames that triggered Full_Clear_Fallback; and the partial redraw ratio (number of frames using partial redraw divided by total frames in the window, expressed as a value from 0.0 to 1.0).
3. IF the rolling window is empty when a `GET_METRICS` command is received, THEN THE Frame_Budget_Scheduler SHALL return zero for all dirty rectangle statistics and 0.0 for the partial redraw ratio.
