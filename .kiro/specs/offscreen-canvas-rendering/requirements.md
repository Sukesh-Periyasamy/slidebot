# Requirements Document

## Introduction

The OffscreenCanvas Rendering feature moves annotation stroke rendering from the main thread (currently using Konva/react-konva) to a dedicated Web Worker using the OffscreenCanvas API. This eliminates UI jank during high-frequency annotation operations such as freehand drawing, laser pointer trails, and live strokes from multiple concurrent users. The worker owns all rendering for Layer 3 (Annotation) in the existing 5-layer rendering stack, while the main thread retains ownership of pointer events, UI interactions, and Socket.IO communication. The worker communicates rendered frames back to the main thread as ImageBitmap Transferable objects for compositing into the visible canvas.

## Glossary

- **Render_Worker**: The dedicated Web Worker thread that owns the OffscreenCanvas and performs all annotation stroke rendering, smoothing, hit-testing, and replay operations
- **Main_Thread_Bridge**: The main-thread module responsible for transferring the canvas control to the worker, forwarding annotation state updates via postMessage, and compositing received ImageBitmap frames into the visible layer
- **OffscreenCanvas**: The browser API that allows a canvas rendering context to be transferred to and owned by a Web Worker, enabling off-main-thread 2D drawing
- **Render_Command**: A structured postMessage payload sent from the main thread to the Render_Worker describing what to draw (annotation additions, removals, live stroke updates, viewport changes)
- **Frame_Output**: An ImageBitmap produced by the Render_Worker and transferred back to the main thread for display in the annotation layer
- **Point_Smoother**: The component within the Render_Worker that applies interpolation and smoothing algorithms to raw pointer input points before rendering strokes
- **Hit_Tester**: The component within the Render_Worker that determines which annotation (if any) intersects a given normalized coordinate, used for selection and eraser tools
- **Replay_Renderer**: The component within the Render_Worker that deterministically replays annotation sequences frame-by-frame for recording playback
- **Worker_Annotation_Cache**: The bounded in-memory annotation store maintained inside the Render_Worker, mirroring committed annotations for the current slide
- **Degradation_Controller**: The component that monitors rendering pressure and reduces visual quality (disabling smoothing, lowering frame rate, simplifying strokes) when the system is under load
- **Normalized_Coordinates**: The 0-1 range coordinate system used for annotation positions, where (0,0) is the top-left and (1,1) is the bottom-right of the slide viewport
- **Viewport_Dimensions**: The current pixel width and height of the annotation canvas, used by the Render_Worker to convert Normalized_Coordinates to pixel space

## Requirements

### Requirement 1: OffscreenCanvas Transfer and Worker Initialization

**User Story:** As a developer, I want the annotation canvas to be transferred to a Web Worker on mount, so that all rendering operations execute off the main thread without blocking UI interactions.

#### Acceptance Criteria

1. WHEN the annotation layer component mounts with a valid canvas element, THE Main_Thread_Bridge SHALL transfer canvas control to the Render_Worker using `canvas.transferControlToOffscreen()` and post the resulting OffscreenCanvas to the worker via postMessage with Transferable transfer
2. WHEN the Render_Worker receives the OffscreenCanvas, THE Render_Worker SHALL acquire a 2D rendering context and confirm readiness by posting a `READY` message back to the main thread
3. IF the browser does not support OffscreenCanvas, THEN THE Main_Thread_Bridge SHALL fall back to main-thread canvas rendering using the existing Konva-based implementation and log a warning
4. WHEN the annotation layer component unmounts, THE Main_Thread_Bridge SHALL post a `TERMINATE` command to the Render_Worker and the Render_Worker SHALL release all resources and close the rendering context
5. WHEN the Render_Worker is initialized, THE Render_Worker SHALL follow the same Web Worker message protocol pattern established by the existing pptx-parser.worker (typed request/response messages with discriminated `type` field)

### Requirement 2: Render Command Protocol

**User Story:** As a developer, I want a well-defined message protocol between the main thread and the render worker, so that annotation state changes are communicated efficiently without ambiguity.

#### Acceptance Criteria

1. THE Main_Thread_Bridge SHALL send Render_Commands to the Render_Worker using structured postMessage payloads with a discriminated `type` field identifying the command kind
2. WHEN the viewport dimensions change, THE Main_Thread_Bridge SHALL send a `RESIZE` command containing the new pixel width and height, and THE Render_Worker SHALL resize its internal canvas and re-render all visible annotations at the new dimensions
3. WHEN an annotation is added or updated in the annotation store, THE Main_Thread_Bridge SHALL send an `ANNOTATION_UPDATE` command containing the full annotation object in Normalized_Coordinates
4. WHEN an annotation is removed from the annotation store, THE Main_Thread_Bridge SHALL send an `ANNOTATION_REMOVE` command containing the annotation ID
5. WHEN a live stroke point batch arrives from a remote user, THE Main_Thread_Bridge SHALL send a `LIVE_STROKE_UPDATE` command containing the user ID and new points array
6. WHEN the current slide changes, THE Main_Thread_Bridge SHALL send a `SLIDE_CHANGE` command containing the new slide ID and the full set of annotations for that slide, and THE Render_Worker SHALL clear its cache and re-initialize with the provided annotations
7. THE Render_Worker SHALL process commands in the order received and SHALL NOT reorder or drop commands

### Requirement 3: Stroke Rendering

**User Story:** As a presenter, I want all annotation strokes rendered smoothly in the worker, so that drawing feels responsive even when many users are annotating simultaneously.

#### Acceptance Criteria

1. WHEN the Render_Worker receives annotation data with tool type `freehand`, THE Render_Worker SHALL render the stroke as a series of connected line segments with round line caps and round line joins using the annotation's color, stroke width, and opacity
2. WHEN the Render_Worker receives annotation data with tool type `highlight`, THE Render_Worker SHALL render a filled rectangle at the specified position with the annotation's color at 0.3 opacity
3. WHEN the Render_Worker receives annotation data with tool type `arrow`, THE Render_Worker SHALL render a line from start point to end point with an arrowhead at the end point using the annotation's color and stroke width
4. WHEN the Render_Worker receives annotation data with tool type `text`, THE Render_Worker SHALL render the text content at the specified position using the annotation's color, font size, and the font family "Inter, system-ui, sans-serif"
5. THE Render_Worker SHALL convert all Normalized_Coordinates to pixel space using the current Viewport_Dimensions before rendering
6. WHEN rendering freehand strokes, THE Render_Worker SHALL preserve the z-order of annotations as determined by their insertion order in the Worker_Annotation_Cache

### Requirement 4: Point Smoothing and Interpolation

**User Story:** As a presenter, I want my freehand strokes to appear smooth rather than jagged, so that annotations look professional during a live presentation.

#### Acceptance Criteria

1. WHEN smoothing is enabled and the Render_Worker renders a freehand stroke, THE Point_Smoother SHALL apply Catmull-Rom spline interpolation to the raw point array to produce visually smooth curves
2. WHEN smoothing is disabled, THE Render_Worker SHALL render freehand strokes as straight line segments between consecutive points without interpolation
3. THE Point_Smoother SHALL produce output points that pass through all original input points (interpolating, not approximating)
4. FOR ALL input point arrays with 2 or more points, smoothing then rendering SHALL produce a stroke that starts at the first input point and ends at the last input point
5. WHEN the degradation mode is `degraded`, THE Point_Smoother SHALL skip interpolation and render strokes as straight line segments regardless of the smoothing setting

### Requirement 5: Hit-Testing

**User Story:** As a presenter, I want to select or erase annotations by tapping on them, so that I can manage my annotations during a live session.

#### Acceptance Criteria

1. WHEN the Main_Thread_Bridge sends a `HIT_TEST` command with a normalized coordinate, THE Hit_Tester SHALL determine which annotation (if any) contains that point and respond with the annotation ID or null
2. WHEN hit-testing a freehand stroke, THE Hit_Tester SHALL consider a point as hitting the stroke if the point is within a distance of half the stroke width plus 6 pixels (hit tolerance) from any segment of the stroke path
3. WHEN hit-testing a highlight rectangle, THE Hit_Tester SHALL consider a point as hitting the highlight if the point falls within the rectangle bounds
4. WHEN hit-testing an arrow, THE Hit_Tester SHALL consider a point as hitting the arrow if the point is within a distance of half the stroke width plus 6 pixels from the arrow line segment
5. WHEN hit-testing a text annotation, THE Hit_Tester SHALL consider a point as hitting the text if the point falls within the text bounding box
6. WHEN multiple annotations overlap at the hit-test point, THE Hit_Tester SHALL return the annotation with the highest z-order (most recently added)
7. THE Hit_Tester SHALL perform hit-testing in Normalized_Coordinates to ensure results are resolution-independent

### Requirement 6: Frame Output and Compositing

**User Story:** As a developer, I want the worker to produce rendered frames as ImageBitmap objects, so that the main thread can composite them into the visible layer stack without re-rendering.

#### Acceptance Criteria

1. WHEN the Render_Worker completes a render pass, THE Render_Worker SHALL produce a Frame_Output as an ImageBitmap and transfer it to the main thread via postMessage with Transferable transfer
2. WHEN the Main_Thread_Bridge receives a Frame_Output, THE Main_Thread_Bridge SHALL draw the ImageBitmap onto the visible annotation layer canvas using `drawImage` and then close the ImageBitmap to release memory
3. THE Render_Worker SHALL produce Frame_Outputs at a target rate of 60 frames per second during active drawing and SHALL reduce to on-demand rendering (only when state changes) when no active strokes are in progress
4. WHEN no annotation state has changed since the last frame, THE Render_Worker SHALL NOT produce a new Frame_Output (no redundant frames)
5. THE Render_Worker SHALL batch multiple Render_Commands received within a single animation frame into one render pass to avoid redundant intermediate frames

### Requirement 7: Worker Annotation Cache

**User Story:** As a developer, I want the worker to maintain its own bounded annotation cache, so that it can re-render the full annotation state without requesting data from the main thread.

#### Acceptance Criteria

1. THE Worker_Annotation_Cache SHALL store committed annotations for the current slide, keyed by annotation ID
2. THE Worker_Annotation_Cache SHALL enforce a maximum capacity of 500 annotations, evicting the oldest annotation (by insertion order) when a new annotation would exceed the limit
3. WHEN the current slide changes, THE Worker_Annotation_Cache SHALL clear all cached annotations and accept the new slide's annotation set
4. THE Worker_Annotation_Cache SHALL maintain annotations in insertion order to preserve z-order for rendering
5. WHEN the degradation mode is `degraded`, THE Worker_Annotation_Cache SHALL enforce a reduced maximum capacity of 100 annotations

### Requirement 8: Live Stroke Rendering

**User Story:** As a participant, I want to see other users' in-progress strokes rendered in real time, so that I can follow along with what the presenter is drawing.

#### Acceptance Criteria

1. WHEN the Render_Worker receives a `LIVE_STROKE_UPDATE` command, THE Render_Worker SHALL render the live stroke with a dashed line style and 0.8 opacity multiplier to visually distinguish it from committed strokes
2. WHEN the Render_Worker receives a `LIVE_STROKE_COMMIT` command for a user, THE Render_Worker SHALL remove the live stroke for that user and add the committed annotation to the Worker_Annotation_Cache
3. WHEN the Render_Worker receives a `LIVE_STROKE_REMOVE` command for a user, THE Render_Worker SHALL remove the live stroke for that user without adding any annotation
4. THE Render_Worker SHALL support rendering up to 50 concurrent live strokes (one per remote user)
5. WHEN the number of concurrent live strokes exceeds 50, THE Render_Worker SHALL evict the oldest live stroke to make room for the new one

### Requirement 9: Replay Rendering

**User Story:** As a viewer, I want annotation playback to render deterministically frame-by-frame, so that recorded sessions replay with identical visual output regardless of playback device or timing.

#### Acceptance Criteria

1. WHEN the Replay_Renderer receives a `REPLAY_START` command with an ordered sequence of timestamped annotation events, THE Replay_Renderer SHALL render annotations frame-by-frame in timestamp order
2. WHEN the Replay_Renderer processes a frame, THE Replay_Renderer SHALL apply all annotation events with timestamps up to and including the current frame time, then produce a single Frame_Output
3. FOR ALL replay sequences, rendering the same sequence of annotation events SHALL produce pixel-identical Frame_Outputs regardless of wall-clock timing or system load
4. WHEN the Replay_Renderer receives a `REPLAY_SEEK` command with a target timestamp, THE Replay_Renderer SHALL reconstruct the annotation state at that timestamp by replaying all events from the beginning up to the target time and produce a single Frame_Output
5. WHEN the Replay_Renderer receives a `REPLAY_STOP` command, THE Replay_Renderer SHALL clear the replay state and return to live rendering mode

### Requirement 10: Degradation Mode

**User Story:** As a system, I want to reduce rendering quality when room pressure is high, so that the application remains responsive even under heavy annotation load.

#### Acceptance Criteria

1. WHEN the Main_Thread_Bridge sends a `SET_DEGRADATION_MODE` command with mode `degraded`, THE Degradation_Controller SHALL activate degraded rendering mode in the Render_Worker
2. WHILE the degradation mode is `degraded`, THE Render_Worker SHALL disable point smoothing for all freehand strokes
3. WHILE the degradation mode is `degraded`, THE Render_Worker SHALL reduce the target frame rate from 60 fps to 30 fps
4. WHILE the degradation mode is `degraded`, THE Render_Worker SHALL apply point decimation to freehand strokes, rendering only every second point for strokes with more than 20 points
5. WHEN the Main_Thread_Bridge sends a `SET_DEGRADATION_MODE` command with mode `normal`, THE Degradation_Controller SHALL deactivate degraded rendering mode and restore full quality rendering
6. WHEN transitioning from `degraded` to `normal` mode, THE Render_Worker SHALL re-render all cached annotations at full quality within the next frame

### Requirement 11: Laser Pointer Rendering

**User Story:** As a participant, I want to see the presenter's laser pointer rendered smoothly, so that I can follow where the presenter is pointing on the slide.

#### Acceptance Criteria

1. WHEN the Render_Worker receives a `LASER_UPDATE` command containing a user ID, color, and trail of positions, THE Render_Worker SHALL render a bright circular head dot at the most recent position with a radius of 6 pixels and 0.9 opacity
2. WHEN the laser trail contains more than one position, THE Render_Worker SHALL render a fading trail line connecting the positions from newest to oldest with 0.5 opacity and 3-pixel stroke width
3. WHEN the Render_Worker receives a `LASER_REMOVE` command for a user, THE Render_Worker SHALL stop rendering that user's laser pointer
4. THE Render_Worker SHALL support rendering laser pointers for multiple concurrent users simultaneously
5. THE Render_Worker SHALL render laser pointers above all annotation strokes in the z-order (drawn last)

### Requirement 12: Coordinate Normalization Round-Trip

**User Story:** As a developer, I want coordinate conversions between normalized and pixel space to be lossless within floating-point precision, so that annotations render at the correct positions regardless of viewport size changes.

#### Acceptance Criteria

1. THE Render_Worker SHALL convert Normalized_Coordinates to pixel coordinates by multiplying x values by viewport width and y values by viewport height
2. THE Hit_Tester SHALL convert pixel coordinates to Normalized_Coordinates by dividing x values by viewport width and y values by viewport height
3. FOR ALL normalized coordinate values in the range [0, 1], converting to pixel space and back to normalized space SHALL produce a value within 1e-10 of the original value (round-trip property)
4. FOR ALL Render_Commands containing point arrays, THE Render_Worker SHALL validate that all coordinate values are within the range [0, 1] inclusive and SHALL clamp out-of-range values to the nearest bound

### Requirement 13: Active Stroke Rendering

**User Story:** As a presenter, I want my in-progress stroke to appear immediately as I draw, so that there is no perceptible delay between my pointer movement and the rendered stroke.

#### Acceptance Criteria

1. WHEN the Main_Thread_Bridge sends an `ACTIVE_STROKE_START` command, THE Render_Worker SHALL begin rendering the current user's active stroke as a continuous line that updates with each subsequent point batch
2. WHEN the Main_Thread_Bridge sends an `ACTIVE_STROKE_POINTS` command with new points, THE Render_Worker SHALL append the points to the active stroke and produce a new Frame_Output within the current animation frame
3. WHEN the Main_Thread_Bridge sends an `ACTIVE_STROKE_COMMIT` command, THE Render_Worker SHALL finalize the active stroke, add it to the Worker_Annotation_Cache, and clear the active stroke state
4. WHEN the Main_Thread_Bridge sends an `ACTIVE_STROKE_CANCEL` command, THE Render_Worker SHALL discard the active stroke without adding it to the cache
5. THE Render_Worker SHALL render the active stroke with full opacity (no dashed style) to visually distinguish it from remote live strokes

### Requirement 14: Render Command Serialization and Deserialization

**User Story:** As a developer, I want render commands to be serializable and deserializable without data loss, so that the postMessage boundary does not corrupt annotation data.

#### Acceptance Criteria

1. THE Main_Thread_Bridge SHALL serialize Render_Commands as structured-cloneable objects compatible with the postMessage API
2. THE Render_Worker SHALL deserialize received messages back into typed Render_Command objects with full type safety
3. FOR ALL valid Render_Command objects, serializing via structured clone then deserializing SHALL produce a deeply-equal Render_Command with identical property values, types, and array ordering (round-trip property)
4. WHEN a Render_Command contains point arrays, THE Main_Thread_Bridge SHALL transfer Float64Array buffers as Transferable objects to avoid copying overhead for large stroke data
