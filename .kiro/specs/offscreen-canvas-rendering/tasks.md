# Implementation Plan: OffscreenCanvas Rendering

## Overview

This plan implements the offscreen canvas rendering feature by building from foundational utilities upward through the worker components, then wiring everything together with the main thread bridge. Each task builds incrementally, ensuring no orphaned code. TypeScript is used throughout, leveraging the existing Vitest + fast-check testing infrastructure.

## Tasks

- [x] 1. Set up project structure and core types
  - [x] 1.1 Create the RenderCommand protocol types
    - Create `apps/web/src/features/annotation/types/renderCommand.types.ts`
    - Define the `RenderCommand` discriminated union (20 command types)
    - Define the `WorkerResponse` discriminated union (4 response types)
    - Define supporting types: `SerializedAnnotation`, `SerializedAnnotationData`, `StrokeConfig`, `ReplayEvent`
    - Export all types for use by worker and bridge modules
    - _Requirements: 2.1, 14.1, 14.2_

  - [x] 1.2 Create coordinate utility functions
    - Create `apps/web/src/features/annotation/workers/coordinates.ts`
    - Implement `toPixel(normalized, viewportSize)` — multiply normalized by viewport size
    - Implement `toNormalized(pixel, viewportSize)` — divide pixel by viewport size
    - Implement `clampNormalized(value)` — clamp to [0, 1]
    - Implement `validatePoints(points: Float64Array)` — clamp all x,y pairs in a flat array
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x]* 1.3 Write property tests for coordinate utilities
    - **Property 1: Coordinate Normalization Round-Trip**
    - **Property 15: Coordinate Clamping**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4**

- [x] 2. Implement Point Smoother
  - [x] 2.1 Implement the Point_Smoother module
    - Create `apps/web/src/features/annotation/workers/pointSmoother.ts`
    - Implement `smooth(points: Float64Array, segmentsPerCurve?: number): Float64Array` using Catmull-Rom spline interpolation (τ = 0.5)
    - Handle boundary segments with reflected control points
    - Ensure all original input points are preserved in output (interpolating, not approximating)
    - Implement `decimate(points: Float64Array, keepEvery: number): Float64Array` — keep every Nth point, always preserving first and last
    - _Requirements: 4.1, 4.3, 4.4, 10.4_

  - [x]* 2.2 Write property tests for Point Smoother
    - **Property 2: Point Smoother Preserves Endpoints and Passes Through Originals**
    - **Property 3: Smoothing Disabled Produces Identity**
    - **Property 14: Point Decimation in Degraded Mode**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 10.2, 10.4**

- [x] 3. Implement Worker Annotation Cache
  - [x] 3.1 Implement the WorkerAnnotationCache class
    - Create `apps/web/src/features/annotation/workers/annotationCache.ts`
    - Implement bounded Map with insertion-order preservation
    - Implement `set(annotation)` with oldest-eviction when at capacity
    - Implement `delete(id)`, `get(id)`, `values()`, `size`, `clear()`, `setMaxCapacity(capacity)`
    - Default max capacity 500 (normal), 100 (degraded)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x]* 3.2 Write property tests for Worker Annotation Cache
    - **Property 7: Bounded Annotation Cache with Eviction**
    - **Property 8: Cache Preserves Insertion Order**
    - **Property 16: Slide Change Resets Cache**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 2.6**

- [x] 4. Implement Hit Tester
  - [x] 4.1 Implement the Hit_Tester module
    - Create `apps/web/src/features/annotation/workers/hitTester.ts`
    - Implement `test(x, y, cache, viewportWidth, viewportHeight): string | null`
    - Implement point-to-polyline-segment distance for freehand strokes
    - Implement point-to-line-segment distance for arrows
    - Implement point-in-rectangle for highlights
    - Implement point-in-bounding-box for text annotations
    - Hit tolerance: strokeWidth/2 + 6px converted to normalized space
    - Test in reverse insertion order (highest z-order first)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x]* 4.2 Write property tests for Hit Tester
    - **Property 4: Hit-Test Geometric Correctness**
    - **Property 5: Hit-Test Returns Highest Z-Order**
    - **Property 6: Hit-Test Resolution Independence**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7**

- [x] 5. Implement Degradation Controller
  - [x] 5.1 Implement the DegradationController class
    - Create `apps/web/src/features/annotation/workers/degradationController.ts`
    - Implement `mode` property ('normal' | 'degraded')
    - Implement `smoothingEnabled` getter (false when degraded)
    - Implement `frameInterval` getter (16.67ms normal, 33.33ms degraded)
    - Implement `decimatePoints` getter (true when degraded)
    - Implement `maxCacheSize` getter (500 normal, 100 degraded)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 6. Implement Replay Renderer
  - [x] 6.1 Implement the ReplayRenderer class
    - Create `apps/web/src/features/annotation/workers/replayRenderer.ts`
    - Implement `start(events: ReplayEvent[])` — initialize replay with ordered events
    - Implement `advanceTo(timestamp)` — apply all events up to timestamp, return current annotations
    - Implement `seekTo(timestamp)` — replay from beginning to target timestamp
    - Implement `stop()` — clear replay state
    - Implement `isActive` getter
    - Ensure deterministic output: same events always produce same annotation state
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x]* 6.2 Write property test for Replay Renderer
    - **Property 13: Replay Seek Equivalence**
    - **Validates: Requirements 9.3, 9.4**

- [x] 7. Checkpoint - Core utilities complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Render Worker
  - [x] 8.1 Implement the Render_Worker message loop and state management
    - Create `apps/web/src/features/annotation/workers/render.worker.ts`
    - Implement worker internal state (`InternalWorkerState`)
    - Implement message handler that dispatches on `RenderCommand.type`
    - Handle `INIT`: acquire OffscreenCanvas and 2D context, post `READY`
    - Handle `RESIZE`: update viewport dimensions, mark dirty
    - Handle `TERMINATE`: release resources, call `self.close()`
    - Process commands in order received (no reordering or dropping)
    - _Requirements: 1.2, 1.4, 1.5, 2.1, 2.7_

  - [x] 8.2 Implement annotation rendering in the worker
    - Handle `ANNOTATION_UPDATE`: add/update annotation in cache, mark dirty
    - Handle `ANNOTATION_REMOVE`: remove from cache, mark dirty
    - Handle `SLIDE_CHANGE`: clear cache, load new annotations, mark dirty
    - Implement render pass: clear canvas, draw cached annotations in insertion order
    - Render freehand strokes with round caps/joins, applying Point_Smoother when smoothing enabled
    - Render highlights as filled rectangles at 0.3 opacity
    - Render arrows with arrowhead at end point
    - Render text with "Inter, system-ui, sans-serif" font family
    - Convert all normalized coordinates to pixel space before drawing
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 8.3 Implement live stroke and active stroke rendering
    - Handle `LIVE_STROKE_UPDATE`: store/update live stroke for user, mark dirty
    - Handle `LIVE_STROKE_COMMIT`: remove live stroke, add annotation to cache, mark dirty
    - Handle `LIVE_STROKE_REMOVE`: remove live stroke, mark dirty
    - Enforce max 50 concurrent live strokes with oldest-eviction
    - Render live strokes with dashed line style and 0.8 opacity multiplier
    - Handle `ACTIVE_STROKE_START`: initialize active stroke state
    - Handle `ACTIVE_STROKE_POINTS`: append points, mark dirty
    - Handle `ACTIVE_STROKE_COMMIT`: finalize to cache, clear active state
    - Handle `ACTIVE_STROKE_CANCEL`: discard active stroke
    - Render active stroke with full opacity, no dash (solid line)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 8.4 Implement laser pointer rendering
    - Handle `LASER_UPDATE`: store/update laser state for user, mark dirty
    - Handle `LASER_REMOVE`: remove laser for user, mark dirty
    - Render laser head dot (6px radius, 0.9 opacity) at most recent position
    - Render fading trail line (0.5 opacity, 3px stroke width) connecting positions
    - Render lasers above all annotation strokes (drawn last in render pass)
    - Support multiple concurrent laser pointers
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 8.5 Implement frame output and render loop
    - Implement render loop using `setTimeout` at target frame interval
    - Batch multiple commands received within a single frame into one render pass
    - When dirty flag is set: render all layers, produce ImageBitmap via `createImageBitmap(canvas)`, transfer to main thread
    - When no state has changed, do not produce a new frame (no redundant frames)
    - Target 60fps during active drawing, on-demand when idle
    - Integrate DegradationController: respect frame interval, smoothing, decimation settings
    - Handle `SET_DEGRADATION_MODE`: update controller, adjust cache capacity, re-render at new quality
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 8.6 Integrate Hit Tester and Replay Renderer into worker
    - Handle `HIT_TEST`: delegate to Hit_Tester, post `HIT_RESULT` response with requestId
    - Handle `REPLAY_START`: delegate to Replay_Renderer, switch to replay mode
    - Handle `REPLAY_SEEK`: delegate to Replay_Renderer, render frame at target timestamp
    - Handle `REPLAY_STOP`: stop replay, return to live rendering mode
    - Validate and clamp all incoming point coordinates using `validatePoints`
    - _Requirements: 5.1, 9.1, 9.2, 9.4, 9.5, 12.4, 14.4_

  - [x]* 8.7 Write property tests for worker state logic
    - **Property 9: Bounded Live Stroke Map with Eviction**
    - **Property 11: No Redundant Frames**
    - **Property 12: Command Processing Order**
    - **Property 17: Stroke Commit Transfers to Cache**
    - **Validates: Requirements 2.7, 6.4, 8.2, 8.4, 8.5, 13.3**

- [x] 9. Checkpoint - Worker implementation complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Main Thread Bridge
  - [x] 10.1 Implement the MainThreadBridge class
    - Create `apps/web/src/features/annotation/lib/mainThreadBridge.ts`
    - Implement `init(canvas: HTMLCanvasElement): Promise<void>` — feature-detect OffscreenCanvas, transfer canvas to worker, wait for READY
    - Implement `destroy()` — send TERMINATE, terminate worker after 1s timeout, close pending ImageBitmaps
    - Implement `send(command: RenderCommand)` — postMessage with Transferable extraction for Float64Array buffers
    - Implement `hitTest(x, y): Promise<string | null>` — send HIT_TEST with requestId, return promise resolved by HIT_RESULT
    - Implement `isOffscreen` getter
    - Handle fallback: if OffscreenCanvas unsupported, set `isOffscreen = false` and log warning
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 5.1, 14.4_

  - [x] 10.2 Implement frame compositing and store subscription
    - Listen for `FRAME` messages from worker, draw ImageBitmap onto visible canvas via `drawImage`, close ImageBitmap after drawing
    - Listen for `ERROR` messages from worker, log errors
    - Implement unresponsive detection: if no FRAME received for 5s during active drawing, terminate worker and fall back to Konva
    - Subscribe to Zustand `annotationStore` changes and forward as appropriate RenderCommand messages
    - Forward viewport resize events as `RESIZE` commands
    - Forward slide change events as `SLIDE_CHANGE` commands with full annotation set
    - _Requirements: 1.3, 6.1, 6.2, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x]* 10.3 Write property test for RenderCommand serialization
    - **Property 10: Render Command Serialization Round-Trip**
    - **Validates: Requirements 14.1, 14.2, 14.3**

- [x] 11. Integration and wiring
  - [x] 11.1 Integrate MainThreadBridge into AnnotationCanvas component
    - Modify `apps/web/src/features/annotation/components/AnnotationCanvas.tsx` (or create new component)
    - On mount: initialize MainThreadBridge with the annotation layer canvas element
    - On unmount: call `destroy()` on the bridge
    - Wire pointer events to send `ACTIVE_STROKE_START`, `ACTIVE_STROKE_POINTS`, `ACTIVE_STROKE_COMMIT`, `ACTIVE_STROKE_CANCEL` commands
    - Wire Socket.IO live stroke events to send `LIVE_STROKE_UPDATE`, `LIVE_STROKE_COMMIT`, `LIVE_STROKE_REMOVE` commands
    - Wire laser pointer events to send `LASER_UPDATE`, `LASER_REMOVE` commands
    - Wire degradation mode changes to send `SET_DEGRADATION_MODE` commands
    - Wire replay controls to send `REPLAY_START`, `REPLAY_SEEK`, `REPLAY_STOP` commands
    - Conditionally render Konva fallback when `bridge.isOffscreen === false`
    - _Requirements: 1.1, 1.3, 1.4, 2.3, 2.4, 2.5, 8.1, 11.1, 13.1_

  - [x]* 11.2 Write unit tests for MainThreadBridge and worker integration
    - Test worker initialization handshake (INIT → READY)
    - Test OffscreenCanvas fallback detection
    - Test TERMINATE cleanup sequence
    - Test hit-test request/response flow
    - Test Float64Array Transferable inclusion in commands
    - Test unresponsive worker detection and fallback
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.1_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check (already in devDependencies)
- Unit tests validate specific examples and edge cases
- The worker follows the same discriminated-union message protocol as the existing `pptx-parser.worker.ts`
- All coordinate work uses normalized [0,1] space internally, converting to pixels only at render time
- Float64Array is used for point data to enable zero-copy Transferable transfer across the postMessage boundary

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "3.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.1", "6.1"] },
    { "id": 3, "tasks": ["4.2", "6.2"] },
    { "id": 4, "tasks": ["8.1"] },
    { "id": 5, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 6, "tasks": ["8.5", "8.6"] },
    { "id": 7, "tasks": ["8.7"] },
    { "id": 8, "tasks": ["10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3"] },
    { "id": 10, "tasks": ["11.1"] },
    { "id": 11, "tasks": ["11.2"] }
  ]
}
```
