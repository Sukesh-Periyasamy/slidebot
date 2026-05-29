# Requirements Document

## Introduction

The Frame Budget Scheduler adds intelligent frame time budgeting to the render worker in the SlideBot collaborative presentation app. The existing render loop renders all annotation content every frame when dirty, which can cause frame starvation on low-end devices when hundreds of annotations are present. The scheduler wraps the existing `renderFrame()` logic with time-aware scheduling that caps render work at a configurable budget per frame, deferring lower-priority items to subsequent frames when the budget is exceeded. This complements the existing DegradationController (which reduces frame rate and disables smoothing under load) by preventing individual frames from taking too long.

## Glossary

- **Frame_Budget_Scheduler**: The scheduling component that measures elapsed time during a render pass and decides whether to continue rendering or defer remaining work to the next frame.
- **Render_Worker**: The existing Web Worker (`render.worker.ts`) that owns the OffscreenCanvas and performs all annotation rendering.
- **Frame_Budget**: The maximum time in milliseconds allocated for render work within a single frame. Default is 6ms.
- **Render_Category**: A logical grouping of renderable items processed in priority order: Active_Stroke, Live_Strokes, Lasers, Committed_Annotations.
- **Deferred_Work**: Render items that were not drawn in the current frame because the frame budget was exceeded, scheduled for rendering in the next frame.
- **Active_Stroke**: The local user's in-progress stroke. Highest priority; always rendered regardless of budget.
- **Live_Strokes**: Remote users' in-progress strokes. Second priority after Active_Stroke.
- **Lasers**: Laser pointer trails from all users. Third priority.
- **Committed_Annotations**: Finalized annotations stored in the Worker_Annotation_Cache. Lowest priority; rendered newest-first.
- **Follow_Up_Frame**: An immediate additional frame scheduled when deferred work exists, bypassing the normal frame interval wait.
- **Frame_Timing_Metrics**: Measurements of time spent in each render category per frame, used for adaptive budget adjustment.
- **DegradationController**: The existing component that reduces frame rate (60fps → 30fps) and disables smoothing under load. Operates independently of the Frame_Budget_Scheduler.
- **Budget_Utilization**: The ratio of actual render time to the configured frame budget, expressed as a percentage.

## Requirements

### Requirement 1: Frame Budget Enforcement

**User Story:** As a presenter on a low-end device, I want the render worker to cap its per-frame work so that the browser remains responsive even with hundreds of annotations.

#### Acceptance Criteria

1. WHEN a render pass begins, THE Frame_Budget_Scheduler SHALL record the start time using `performance.now()`.
2. THE Frame_Budget_Scheduler SHALL enforce a configurable frame budget with a default value of 6 milliseconds, where elapsed time is measured as the difference between the current `performance.now()` value and the start time recorded in criterion 1.
3. WHILE rendering Committed_Annotations, THE Frame_Budget_Scheduler SHALL check elapsed time against the Frame_Budget after each annotation is drawn.
4. WHEN elapsed time exceeds the Frame_Budget during Committed_Annotations rendering, THE Frame_Budget_Scheduler SHALL stop rendering remaining annotations and mark them as Deferred_Work for the next frame.
5. WHILE rendering Live_Strokes, THE Frame_Budget_Scheduler SHALL check elapsed time against the Frame_Budget after each live stroke is drawn.
6. WHEN elapsed time exceeds the Frame_Budget during Live_Strokes rendering, THE Frame_Budget_Scheduler SHALL stop rendering remaining live strokes and mark them as Deferred_Work for the next frame.
7. WHILE rendering Lasers, THE Frame_Budget_Scheduler SHALL check elapsed time against the Frame_Budget after each laser is drawn.
8. WHEN elapsed time exceeds the Frame_Budget during Lasers rendering, THE Frame_Budget_Scheduler SHALL stop rendering remaining lasers and mark them as Deferred_Work for the next frame.
9. IF the Frame_Budget is already exceeded when a Render_Category (Live_Strokes, Lasers, or Committed_Annotations) begins processing, THEN THE Frame_Budget_Scheduler SHALL skip that category entirely and mark all its items as Deferred_Work.
10. WHILE rendering within any budget-checked Render_Category, THE Frame_Budget_Scheduler SHALL always complete the item currently being drawn before checking elapsed time, guaranteeing at least one item is rendered per category that begins processing.

### Requirement 2: Priority Ordering

**User Story:** As a presenter, I want my active stroke to always appear immediately so that drawing feels responsive regardless of annotation load.

#### Acceptance Criteria

1. THE Frame_Budget_Scheduler SHALL render categories in the following fixed priority order: Active_Stroke first, Live_Strokes second, Lasers third, Committed_Annotations last.
2. THE Frame_Budget_Scheduler SHALL always render the Active_Stroke in its entirety (all segments/points), regardless of whether the Frame_Budget has been exceeded.
3. WHEN the Frame_Budget is exceeded during Live_Strokes rendering, THE Frame_Budget_Scheduler SHALL mark the remaining unrendered Live_Strokes, all Lasers, and all Committed_Annotations as Deferred_Work for the current frame.
4. WHEN the Frame_Budget is exceeded during Lasers rendering, THE Frame_Budget_Scheduler SHALL mark the remaining unrendered Lasers and all Committed_Annotations as Deferred_Work for the current frame.
5. WHILE rendering Committed_Annotations, THE Frame_Budget_Scheduler SHALL process annotations in newest-first order (reverse insertion order from the cache).
6. IF a Render_Category contains zero items, THEN THE Frame_Budget_Scheduler SHALL proceed to the next category in priority order without consuming measurable budget time.

### Requirement 3: Deferred Work Scheduling

**User Story:** As a user viewing a busy slide, I want deferred annotations to appear progressively in subsequent frames so that all content eventually renders without a single long blocking frame.

#### Acceptance Criteria

1. WHEN Deferred_Work exists after a render pass completes, THE Frame_Budget_Scheduler SHALL schedule a Follow_Up_Frame with zero delay (e.g., setTimeout 0) rather than waiting for the normal frame interval.
2. WHEN a Follow_Up_Frame begins, THE Frame_Budget_Scheduler SHALL resume rendering from the exact item where the previous frame's budget was exceeded, maintaining the same category priority order (Live_Strokes before Lasers before Committed_Annotations), and respecting the same Frame_Budget for the follow-up frame.
3. WHEN all Deferred_Work has been rendered across follow-up frames, THE Frame_Budget_Scheduler SHALL return to the normal frame scheduling interval controlled by the DegradationController.
4. WHEN a content-affecting RenderCommand (any command that modifies renderable state, excluding diagnostic commands such as GET_METRICS) arrives while Deferred_Work exists, THE Frame_Budget_Scheduler SHALL discard the remaining Deferred_Work and start a fresh full render pass.
5. THE Frame_Budget_Scheduler SHALL produce an ImageBitmap and transfer it to the main thread after each frame, including frames with partial content due to deferral.
6. IF the number of consecutive Follow_Up_Frames for a single render cycle exceeds 10, THEN THE Frame_Budget_Scheduler SHALL render all remaining Deferred_Work in the next frame regardless of budget, to guarantee convergence.

### Requirement 4: Frame Timing Metrics

**User Story:** As a developer, I want the scheduler to track per-category timing so that I can implement adaptive budget adjustment in the future.

#### Acceptance Criteria

1. THE Frame_Budget_Scheduler SHALL measure and record the time spent rendering each Render_Category per frame using the same timing source as budget enforcement (`performance.now()` or `Date.now()` fallback).
2. THE Frame_Budget_Scheduler SHALL calculate Budget_Utilization as the ratio of total render time to the configured Frame_Budget, expressed as a value between 0.0 and 1.0.
3. THE Frame_Budget_Scheduler SHALL maintain a rolling window of the last 60 frame timing measurements, where each measurement includes per-category durations, total frame duration, Budget_Utilization, and whether the frame deferred work. Follow_Up_Frames SHALL each count as a separate entry in the rolling window.
4. WHEN the main thread requests metrics via a `GET_METRICS` command, THE Frame_Budget_Scheduler SHALL respond with the rolling window statistics consisting of: average, p95, and maximum frame times per Render_Category, overall Budget_Utilization average, and the deferred frame count.
5. IF the rolling window contains fewer than 60 entries at the time of a `GET_METRICS` request, THEN THE Frame_Budget_Scheduler SHALL compute statistics over the available entries and include the current entry count in the response.
6. THE Frame_Budget_Scheduler SHALL record the count of deferred frames within the rolling window.

### Requirement 5: Budget Configuration

**User Story:** As a developer, I want to configure the frame budget at runtime so that I can tune performance for different device capabilities.

#### Acceptance Criteria

1. WHEN a `SET_FRAME_BUDGET` command is received with a value between 1 and 16 milliseconds (inclusive), THE Frame_Budget_Scheduler SHALL update the Frame_Budget to the specified value in milliseconds.
2. IF the `SET_FRAME_BUDGET` command specifies a value less than 1 millisecond or greater than 16 milliseconds, THEN THE Frame_Budget_Scheduler SHALL retain the current Frame_Budget unchanged and respond with an error message indicating the value is out of the accepted range of 1 to 16 milliseconds.
3. WHEN the Frame_Budget is successfully updated, THE Frame_Budget_Scheduler SHALL apply the new budget starting from the next render pass after the command is processed.
4. IF the `SET_FRAME_BUDGET` command specifies a non-numeric or non-finite value, THEN THE Frame_Budget_Scheduler SHALL retain the current Frame_Budget unchanged and respond with an error message indicating the value is invalid.

### Requirement 6: Integration with Existing Render Loop

**User Story:** As a developer, I want the budget scheduler to integrate cleanly with the existing render worker without breaking current functionality.

#### Acceptance Criteria

1. THE Frame_Budget_Scheduler SHALL operate within the existing `render.worker.ts` module without requiring changes to the RenderCommand protocol for existing command types.
2. THE Frame_Budget_Scheduler SHALL perform a full canvas clear (`clearRect` over the entire viewport) at the start of each render pass, including Follow_Up_Frames.
3. WHEN no annotations exceed the budget in a frame, THE Frame_Budget_Scheduler SHALL render all items in every Render_Category such that the same set of pixels is drawn as the current unbounded render loop, differing only in the internal draw order across categories.
4. THE Frame_Budget_Scheduler SHALL use the DegradationController `frameInterval` property value as the scheduling delay for normal frames (frames that are not Follow_Up_Frames).
5. WHEN the DegradationController mode transitions while Deferred_Work exists, THE Frame_Budget_Scheduler SHALL continue processing the existing Deferred_Work using Follow_Up_Frame scheduling (zero delay) until all deferred items are rendered, then resume using the updated DegradationController frame interval.

### Requirement 7: Committed Annotation Render Order

**User Story:** As a user, I want the most recent annotations to appear first during progressive rendering so that the most relevant content is visible soonest.

#### Acceptance Criteria

1. WHILE rendering Committed_Annotations within a budget-constrained frame, THE Frame_Budget_Scheduler SHALL draw annotations in descending insertion order, starting from the annotation most recently inserted into the Worker_Annotation_Cache and proceeding toward the oldest.
2. WHEN a Follow_Up_Frame resumes deferred Committed_Annotations, THE Frame_Budget_Scheduler SHALL continue rendering from the next unrendered annotation after the last annotation drawn in the previous frame, proceeding toward older annotations in the same descending insertion order.
3. WHEN all Committed_Annotations have been rendered across one or more frames, THE Frame_Budget_Scheduler SHALL mark the annotation layer as complete for that render cycle, ceasing to schedule Follow_Up_Frames for Committed_Annotations until a new render pass is triggered.
4. IF the Worker_Annotation_Cache is empty when Committed_Annotations rendering begins, THEN THE Frame_Budget_Scheduler SHALL mark the annotation layer as complete immediately without scheduling any Follow_Up_Frames for that category.

### Requirement 8: Edge Cases and Safety

**User Story:** As a developer, I want the scheduler to handle edge cases gracefully so that rendering never enters an inconsistent state.

#### Acceptance Criteria

1. IF the Active_Stroke alone exceeds the Frame_Budget, THEN THE Frame_Budget_Scheduler SHALL still complete rendering the Active_Stroke, defer all remaining categories as Deferred_Work, and produce a frame containing only the Active_Stroke.
2. IF `performance.now()` is unavailable in the worker context, THEN THE Frame_Budget_Scheduler SHALL fall back to `Date.now()` for timing measurements, detecting availability once at worker initialization.
3. WHEN the Frame_Budget is set to 16 milliseconds (maximum), THE Frame_Budget_Scheduler SHALL not defer any render items for annotation loads of up to 500 Committed_Annotations, behaving identically to the unbounded render loop.
4. IF a render category contains zero items, THEN THE Frame_Budget_Scheduler SHALL skip that category with less than 0.1 milliseconds of overhead per empty category.
5. WHEN a SLIDE_CHANGE command is processed, THE Frame_Budget_Scheduler SHALL discard all Deferred_Work from the previous slide and cancel any pending Follow_Up_Frames.
6. IF a SLIDE_CHANGE command arrives while a render pass is in progress, THEN THE Frame_Budget_Scheduler SHALL abort the current render pass, discard its partial output, and begin a fresh render pass for the new slide.
