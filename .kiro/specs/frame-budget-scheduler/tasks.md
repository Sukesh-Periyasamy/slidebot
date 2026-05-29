# Implementation Plan: Frame Budget Scheduler

## Overview

Implement a time-aware render scheduler within `render.worker.ts` that enforces a configurable per-frame budget (default 6ms), deferring lower-priority render items to follow-up frames when the budget is exceeded. The implementation adds a `FrameBudgetScheduler` class, a `MetricsTracker`, and a `TimingContext` helper, integrating them into the existing render pipeline without breaking the current RenderCommand protocol.

## Tasks

- [x] 1. Define interfaces and types
  - [x] 1.1 Add new RenderCommand and WorkerResponse types
    - Add `SET_FRAME_BUDGET` and `GET_METRICS` to the `RenderCommand` union in `renderCommand.types.ts`
    - Add `METRICS`, `BUDGET_ERROR`, and `BUDGET_UPDATED` to the `WorkerResponse` union
    - Define `MetricsResponse` and `CategoryTiming` interfaces in a new file `apps/web/src/features/annotation/workers/frameBudgetScheduler.types.ts`
    - _Requirements: 4.4, 5.1, 6.1_

  - [x] 1.2 Create core scheduler interfaces and types
    - Create `apps/web/src/features/annotation/workers/frameBudgetScheduler.types.ts`
    - Define `FrameBudgetConfig`, `DeferredWork`, `CategoryTiming`, `FrameMetricsEntry`, `MetricsResponse`, and `TimingContext` interfaces
    - _Requirements: 1.2, 3.2, 4.1, 4.2, 4.3_

- [x] 2. Implement TimingContext
  - [x] 2.1 Create TimingContext class
    - Create `apps/web/src/features/annotation/workers/timingContext.ts`
    - Implement `elapsed()` and `isOverBudget()` methods
    - Accept a `getNow` function for testability (supports `performance.now()` and `Date.now()` fallback)
    - Include `forceComplete` flag for convergence guarantee
    - _Requirements: 1.1, 1.2, 8.2_

  - [ ]* 2.2 Write property test for TimingContext budget checking
    - **Property 13: Budget validation**
    - **Validates: Requirements 5.1, 5.2, 5.4**

- [x] 3. Implement MetricsTracker
  - [x] 3.1 Create MetricsTracker class
    - Create `apps/web/src/features/annotation/workers/metricsTracker.ts`
    - Implement rolling window of 60 entries with FIFO eviction
    - Implement `record()` method to add frame timing entries
    - Implement `computeStats()` to calculate avg, p95, max per category, overall budget utilization, and deferred frame count
    - Handle partial windows (fewer than 60 entries)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 3.2 Write property test for rolling window bounded at 60 entries
    - **Property 11: Rolling window bounded at 60 entries**
    - **Validates: Requirements 4.3**

  - [ ]* 3.3 Write property test for metrics statistics correctness
    - **Property 12: Metrics statistics correctness**
    - **Validates: Requirements 4.4, 4.5, 4.6**

- [x] 4. Implement FrameBudgetScheduler core
  - [x] 4.1 Create FrameBudgetScheduler class with constructor and config
    - Create `apps/web/src/features/annotation/workers/frameBudgetScheduler.ts`
    - Implement constructor with default config (budgetMs: 6, maxFollowUpFrames: 10)
    - Implement `setFrameBudget()` with validation (range [1, 16], finite number check)
    - Implement `discardDeferredWork()` to clear deferred state and cancel pending follow-ups
    - Implement `hasDeferredWork()` and `getMetrics()` accessors
    - Detect `performance.now()` availability at construction, fallback to `Date.now()`
    - _Requirements: 1.2, 5.1, 5.2, 5.3, 5.4, 8.2_

  - [x] 4.2 Implement `executeBudgetedRender()` method
    - Clear canvas via `clearRect` at start of every frame
    - Render Active_Stroke unconditionally (no budget check)
    - Render Live_Strokes with per-item budget check after each stroke
    - Render Lasers with per-item budget check after each laser
    - Render Committed_Annotations in newest-first order with per-item budget check
    - Skip categories entirely if budget already exceeded when category begins
    - Guarantee at least one item rendered per category that begins processing
    - Record deferred work when budget exceeded (remaining items in current + all lower-priority categories)
    - Record per-category timing and total frame metrics
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 6.2, 6.3, 7.1, 8.1, 8.4_

  - [x] 4.3 Implement `scheduleFrame()` and follow-up frame logic
    - Schedule follow-up frames with zero delay (setTimeout 0) when deferred work exists
    - Resume from exact deferral point in follow-up frames
    - Return to DegradationController `frameInterval` when no deferred work remains
    - Track consecutive follow-up count; force-complete all remaining work after 10 follow-ups
    - Produce ImageBitmap and transfer to main thread after every frame (including partial)
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 6.4, 6.5, 7.2, 7.3, 7.4, 8.3_

  - [ ]* 4.4 Write property test for budget enforcement causes deferral
    - **Property 1: Budget enforcement causes deferral**
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.3, 2.4**

  - [ ]* 4.5 Write property test for priority ordering invariant
    - **Property 2: Priority ordering invariant**
    - **Validates: Requirements 2.1**

  - [ ]* 4.6 Write property test for active stroke always completes
    - **Property 3: Active stroke always completes**
    - **Validates: Requirements 2.2, 8.1**

  - [ ]* 4.7 Write property test for committed annotations newest-first order
    - **Property 4: Committed annotations newest-first order**
    - **Validates: Requirements 2.5, 7.1, 7.2**

  - [ ]* 4.8 Write property test for follow-up frame scheduling
    - **Property 5: Follow-up frame scheduling**
    - **Validates: Requirements 3.1, 3.3**

  - [ ]* 4.9 Write property test for resumption correctness
    - **Property 6: Resumption correctness**
    - **Validates: Requirements 3.2, 7.2**

  - [ ]* 4.10 Write property test for convergence guarantee
    - **Property 8: Convergence guarantee**
    - **Validates: Requirements 3.6**

  - [ ]* 4.11 Write property test for canvas clear on every frame
    - **Property 9: Canvas clear on every frame**
    - **Validates: Requirements 6.2**

  - [ ]* 4.12 Write property test for behavioral equivalence when within budget
    - **Property 10: Behavioral equivalence when within budget**
    - **Validates: Requirements 6.3**

- [x] 5. Implement content-affecting command invalidation
  - [x] 5.1 Add deferred work invalidation on content-affecting commands
    - In the command handler, detect content-affecting commands (ANNOTATION_UPDATE, ANNOTATION_REMOVE, SLIDE_CHANGE, LIVE_STROKE_UPDATE, LIVE_STROKE_COMMIT, LIVE_STROKE_REMOVE, ACTIVE_STROKE_START, ACTIVE_STROKE_POINTS, ACTIVE_STROKE_COMMIT, ACTIVE_STROKE_CANCEL, LASER_UPDATE, LASER_REMOVE)
    - Call `discardDeferredWork()` and trigger a fresh full render pass when deferred work exists
    - Handle SLIDE_CHANGE specifically: discard deferred work, cancel pending follow-ups, abort in-progress render pass
    - _Requirements: 3.4, 8.5, 8.6_

  - [ ]* 5.2 Write property test for content-affecting command invalidates deferred work
    - **Property 7: Content-affecting command invalidates deferred work**
    - **Validates: Requirements 3.4**

  - [ ]* 5.3 Write property test for slide change discards deferred work
    - **Property 14: Slide change discards deferred work**
    - **Validates: Requirements 8.5**

  - [ ]* 5.4 Write property test for frame production invariant
    - **Property 15: Frame production invariant**
    - **Validates: Requirements 3.5**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integrate scheduler into render.worker.ts
  - [x] 7.1 Wire FrameBudgetScheduler into the worker lifecycle
    - Instantiate `FrameBudgetScheduler` in `handleInit()` and attach to `InternalWorkerState`
    - Replace existing `scheduleFrame()` / `produceFrame()` / `renderFrame()` pipeline with scheduler calls
    - Ensure `handleTerminate()` clears scheduler state including deferred work
    - Detect `performance.now()` availability once at worker init
    - _Requirements: 6.1, 6.4, 8.2_

  - [x] 7.2 Add SET_FRAME_BUDGET and GET_METRICS command handlers
    - Add case handlers in the `self.onmessage` switch for `SET_FRAME_BUDGET` and `GET_METRICS`
    - `SET_FRAME_BUDGET`: call `scheduler.setFrameBudget()`, respond with `BUDGET_UPDATED` or `BUDGET_ERROR`
    - `GET_METRICS`: call `scheduler.getMetrics()`, respond with `METRICS`
    - _Requirements: 4.4, 5.1, 5.2, 5.3, 5.4_

  - [x] 7.3 Update existing render functions to accept TimingContext
    - Modify `renderLiveStrokes()` to accept `TimingContext` and return remaining userIds on budget exceeded
    - Modify `renderLasers()` to accept `TimingContext` and return remaining userIds on budget exceeded
    - Modify `renderAnnotations()` to accept `TimingContext` and resume index, return next resume index on budget exceeded
    - Keep `renderActiveStroke()` unchanged (no budget check)
    - _Requirements: 1.3, 1.5, 1.7, 2.2, 7.1_

  - [ ]* 7.4 Write unit tests for worker integration
    - Test SET_FRAME_BUDGET with valid and invalid values
    - Test GET_METRICS returns correct response shape
    - Test existing commands still work unchanged
    - Test DegradationController mode transition during deferred work
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.5_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses a `MockTimeSource` pattern for deterministic testing (see design Testing Strategy section)
- All new files go under `apps/web/src/features/annotation/workers/`
- The existing `RenderCommand` protocol is extended (not modified) for backward compatibility

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "3.3", "4.1"] },
    { "id": 3, "tasks": ["4.2"] },
    { "id": 4, "tasks": ["4.3", "4.4", "4.5", "4.6", "4.7"] },
    { "id": 5, "tasks": ["4.8", "4.9", "4.10", "4.11", "4.12", "5.1"] },
    { "id": 6, "tasks": ["5.2", "5.3", "5.4"] },
    { "id": 7, "tasks": ["7.1"] },
    { "id": 8, "tasks": ["7.2", "7.3"] },
    { "id": 9, "tasks": ["7.4"] }
  ]
}
```
