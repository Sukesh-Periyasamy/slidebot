// ─────────────────────────────────────────────────────────────────────────────
// Render Worker — OffscreenCanvas annotation rendering in a dedicated thread
// ─────────────────────────────────────────────────────────────────────────────

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import type {
  RenderCommand,
  WorkerResponse,
  StrokeConfig,
  SerializedAnnotation,
  SerializedAnnotationData,
  ReplayEvent,
} from '../types/renderCommand.types';
import { WorkerAnnotationCache } from './annotationCache';
import { DegradationController } from './degradationController';
import { smooth, decimate } from './pointSmoother';
import { toPixel, validatePoints } from './coordinates';
import { hitTest } from './hitTester';
import { ReplayRenderer } from './replayRenderer';
import {
  FrameBudgetScheduler,
  CONTENT_AFFECTING_COMMANDS,
} from './frameBudgetScheduler';
import type {
  RenderFunctions,
  ActiveStrokeState as SchedulerActiveStrokeState,
  LiveStrokeState as SchedulerLiveStrokeState,
  LaserState as SchedulerLaserState,
  DirtyFrameResult,
  OverlappingItemSet,
  BoundingBox,
} from './frameBudgetScheduler';
import { DirtyRegionTracker } from '../../../../../../packages/renderer/src/dirtyRegionTracker';
import {
  computeAnnotationBBox,
  computePointsBBox,
  computeLaserBBox,
} from '../../../../../../packages/renderer/src/boundingBoxCalculator';
import type { ViewportDimensions } from '../../../../../../packages/renderer/src/boundingBoxCalculator';
import {
  findOverlappingAnnotations,
  findOverlappingDynamicItems,
} from '../../../../../../packages/renderer/src/overlapQuery';

// ─── Worker Internal State Types ─────────────────────────────────────────────

interface LiveStrokeState {
  userId: string;
  color: string;
  strokeWidth: number;
  opacity: number;
  points: Float64Array;
}

interface ActiveStrokeState {
  config: StrokeConfig;
  points: Float64Array;
}

interface LaserState {
  userId: string;
  color: string;
  trail: Float64Array;
}

interface ReplayState {
  events: ReplayEvent[];
  currentIndex: number;
  annotations: Map<string, SerializedAnnotation>;
}

interface InternalWorkerState {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  viewportWidth: number;
  viewportHeight: number;
  cache: WorkerAnnotationCache;
  liveStrokes: Map<string, LiveStrokeState>;
  activeStroke: ActiveStrokeState | null;
  lasers: Map<string, LaserState>;
  dirty: boolean;
  degradationController: DegradationController;
  frameRequestId: number | null;
  replayState: ReplayState | null;
  scheduler: FrameBudgetScheduler;
  dirtyRegionTracker: DirtyRegionTracker;
  previousBitmap: ImageBitmap | null;
  isFirstFrame: boolean;
  pendingResize: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_LIVE_STROKES = 50;

// ─── Mutable State ───────────────────────────────────────────────────────────

let state: InternalWorkerState | null = null;
const replayRenderer = new ReplayRenderer();

// ─── Response Helpers ────────────────────────────────────────────────────────

function postResponse(response: WorkerResponse): void {
  if (response.type === 'FRAME') {
    self.postMessage(response, [response.bitmap]);
  } else {
    self.postMessage(response);
  }
}

// ─── Command Handlers ────────────────────────────────────────────────────────

function handleInit(command: Extract<RenderCommand, { type: 'INIT' }>): void {
  const canvas = command.canvas;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    postResponse({ type: 'ERROR', message: 'Failed to acquire 2D rendering context' });
    return;
  }

  // Detect performance.now() availability once at worker init (Req 8.2)
  const scheduler = new FrameBudgetScheduler();
  const dirtyRegionTracker = new DirtyRegionTracker();

  state = {
    canvas,
    ctx,
    viewportWidth: canvas.width,
    viewportHeight: canvas.height,
    cache: new WorkerAnnotationCache(),
    liveStrokes: new Map(),
    activeStroke: null,
    lasers: new Map(),
    dirty: false,
    degradationController: new DegradationController('normal'),
    frameRequestId: null,
    replayState: null,
    scheduler,
    dirtyRegionTracker,
    previousBitmap: null,
    isFirstFrame: true,
    pendingResize: false,
  };

  postResponse({ type: 'READY' });
}

function handleResize(command: Extract<RenderCommand, { type: 'RESIZE' }>): void {
  if (!state) return;

  state.viewportWidth = command.width;
  state.viewportHeight = command.height;
  state.canvas.width = command.width;
  state.canvas.height = command.height;
  state.dirty = true;

  // Dirty region tracking: invalidate all and clear previous-frame regions (Req 8.1, 8.3)
  state.dirtyRegionTracker.onResize();
  // Mark pending resize so bounding boxes are recomputed before next render (Req 8.2, 8.4)
  state.pendingResize = true;
}

function handleTerminate(): void {
  if (state) {
    // Cancel any pending frame timeout
    if (state.frameRequestId !== null) {
      clearTimeout(state.frameRequestId);
      state.frameRequestId = null;
    }

    // Discard deferred work and cancel pending follow-up frames (Req 8.2)
    state.scheduler.discardDeferredWork();

    // Clear all data structures
    state.cache.clear();
    state.liveStrokes.clear();
    state.lasers.clear();
    state.activeStroke = null;
    state.replayState = null;

    // Release state
    state = null;
  }

  self.close();
}

// ─── Command Handlers (continued) ───────────────────────────────────────────

function handleAnnotationUpdate(
  command: Extract<RenderCommand, { type: 'ANNOTATION_UPDATE' }>
): void {
  if (!state) return;

  const annotation = command.annotation;
  const viewport: ViewportDimensions = {
    viewportWidth: state.viewportWidth,
    viewportHeight: state.viewportHeight,
  };

  // Mark old bbox as dirty if annotation already exists (modification case, Req 2.3)
  const existing = state.cache.get(annotation.id);
  if (existing) {
    const oldBBox = computeAnnotationBBox(existing, viewport, state.ctx);
    state.dirtyRegionTracker.markDirty(oldBBox);
  }

  // Validate and clamp freehand point coordinates to [0,1]
  if (annotation.data.tool === 'freehand') {
    const validatedPoints = validatePoints(annotation.data.points);
    state.cache.set({
      ...annotation,
      data: { tool: 'freehand', points: validatedPoints },
    });
  } else {
    state.cache.set(annotation);
  }

  // Mark new bbox as dirty (Req 2.1 for add, Req 2.3 for modify)
  const newAnnotation = state.cache.get(annotation.id)!;
  const newBBox = computeAnnotationBBox(newAnnotation, viewport, state.ctx);
  state.dirtyRegionTracker.markDirty(newBBox);

  state.dirty = true;
}

function handleAnnotationRemove(
  command: Extract<RenderCommand, { type: 'ANNOTATION_REMOVE' }>
): void {
  if (!state) return;

  // Mark removed annotation's bbox as dirty (Req 2.2)
  const existing = state.cache.get(command.annotationId);
  if (existing) {
    const viewport: ViewportDimensions = {
      viewportWidth: state.viewportWidth,
      viewportHeight: state.viewportHeight,
    };
    const bbox = computeAnnotationBBox(existing, viewport, state.ctx);
    state.dirtyRegionTracker.markDirty(bbox);
  }

  state.cache.delete(command.annotationId);
  state.dirty = true;
}

function handleSlideChange(
  command: Extract<RenderCommand, { type: 'SLIDE_CHANGE' }>
): void {
  if (!state) return;
  state.cache.clear();
  for (const annotation of command.annotations) {
    state.cache.set(annotation);
  }
  state.liveStrokes.clear();
  state.activeStroke = null;
  state.dirty = true;

  // Dirty region tracking: invalidate all and clear previous-frame regions (Req 2.11)
  state.dirtyRegionTracker.onSlideChange();
}

function handleLiveStrokeUpdate(
  command: Extract<RenderCommand, { type: 'LIVE_STROKE_UPDATE' }>
): void {
  if (!state) return;

  // Enforce max live strokes with oldest-eviction
  if (!state.liveStrokes.has(command.userId) && state.liveStrokes.size >= MAX_LIVE_STROKES) {
    const oldestKey = state.liveStrokes.keys().next().value;
    if (oldestKey !== undefined) {
      state.liveStrokes.delete(oldestKey);
    }
  }

  // Validate and clamp all incoming point coordinates to [0,1]
  const validatedPoints = validatePoints(command.points);

  state.liveStrokes.set(command.userId, {
    userId: command.userId,
    color: '#000000',
    strokeWidth: 2,
    opacity: 1,
    points: validatedPoints,
  });
  state.dirty = true;
}

function handleLiveStrokeCommit(
  command: Extract<RenderCommand, { type: 'LIVE_STROKE_COMMIT' }>
): void {
  if (!state) return;

  // Mark previous live stroke region as dirty (Req 7.4)
  state.dirtyRegionTracker.onLiveStrokeRemoved(command.userId);

  state.liveStrokes.delete(command.userId);
  state.cache.set(command.annotation);

  // Mark new annotation bbox as dirty (Req 2.1)
  const viewport: ViewportDimensions = {
    viewportWidth: state.viewportWidth,
    viewportHeight: state.viewportHeight,
  };
  const newBBox = computeAnnotationBBox(command.annotation, viewport, state.ctx);
  state.dirtyRegionTracker.markDirty(newBBox);

  state.dirty = true;
}

function handleLiveStrokeRemove(
  command: Extract<RenderCommand, { type: 'LIVE_STROKE_REMOVE' }>
): void {
  if (!state) return;

  // Mark previous live stroke region as dirty (Req 7.4)
  state.dirtyRegionTracker.onLiveStrokeRemoved(command.userId);

  state.liveStrokes.delete(command.userId);
  state.dirty = true;
}

function handleActiveStrokeStart(
  command: Extract<RenderCommand, { type: 'ACTIVE_STROKE_START' }>
): void {
  if (!state) return;
  state.activeStroke = {
    config: command.config,
    points: new Float64Array(0),
  };
  state.dirty = true;
}

function handleActiveStrokePoints(
  command: Extract<RenderCommand, { type: 'ACTIVE_STROKE_POINTS' }>
): void {
  if (!state || !state.activeStroke) return;

  // Validate and clamp all incoming point coordinates to [0,1]
  const validatedPoints = validatePoints(command.points);

  // Append new points to existing points
  const existing = state.activeStroke.points;
  const combined = new Float64Array(existing.length + validatedPoints.length);
  combined.set(existing, 0);
  combined.set(validatedPoints, existing.length);
  state.activeStroke.points = combined;

  state.dirty = true;
}

function handleActiveStrokeCommit(
  command: Extract<RenderCommand, { type: 'ACTIVE_STROKE_COMMIT' }>
): void {
  if (!state || !state.activeStroke) return;

  // Mark previous active stroke region as dirty (Req 7.6)
  state.dirtyRegionTracker.onActiveStrokeEnded();

  const { config, points } = state.activeStroke;
  const annotation: SerializedAnnotation = {
    id: command.annotationId,
    tool: config.tool,
    color: config.color,
    strokeWidth: config.strokeWidth,
    opacity: config.opacity,
    data: { tool: 'freehand', points },
  };
  state.cache.set(annotation);
  state.activeStroke = null;

  // Mark new annotation bbox as dirty (Req 2.1)
  const viewport: ViewportDimensions = {
    viewportWidth: state.viewportWidth,
    viewportHeight: state.viewportHeight,
  };
  const newBBox = computeAnnotationBBox(annotation, viewport, state.ctx);
  state.dirtyRegionTracker.markDirty(newBBox);

  state.dirty = true;
}

function handleActiveStrokeCancel(): void {
  if (!state) return;

  // Mark previous active stroke region as dirty (Req 7.6)
  state.dirtyRegionTracker.onActiveStrokeEnded();

  state.activeStroke = null;
  state.dirty = true;
}

function handleHitTest(
  command: Extract<RenderCommand, { type: 'HIT_TEST' }>
): void {
  if (!state) return;
  const annotationId = hitTest(
    command.x,
    command.y,
    state.cache,
    state.viewportWidth,
    state.viewportHeight
  );
  postResponse({
    type: 'HIT_RESULT',
    requestId: command.requestId,
    annotationId,
  });
}

function handleLaserUpdate(
  command: Extract<RenderCommand, { type: 'LASER_UPDATE' }>
): void {
  if (!state) return;
  state.lasers.set(command.userId, {
    userId: command.userId,
    color: command.color,
    trail: command.trail,
  });
  state.dirty = true;
}

function handleLaserRemove(
  command: Extract<RenderCommand, { type: 'LASER_REMOVE' }>
): void {
  if (!state) return;

  // Mark previous laser region as dirty (Req 7.5)
  state.dirtyRegionTracker.onLaserRemoved(command.userId);

  state.lasers.delete(command.userId);
  state.dirty = true;
}

function handleSetDegradationMode(
  command: Extract<RenderCommand, { type: 'SET_DEGRADATION_MODE' }>
): void {
  if (!state) return;
  state.degradationController.mode = command.mode;
  state.cache.setMaxCapacity(state.degradationController.maxCacheSize);
  state.dirty = true;
}

function handleReplayStart(
  command: Extract<RenderCommand, { type: 'REPLAY_START' }>
): void {
  if (!state) return;
  replayRenderer.start(command.events);
  // Load initial replay state (empty at timestamp 0) into cache
  state.cache.clear();
  state.replayState = {
    events: command.events,
    currentIndex: 0,
    annotations: new Map(),
  };
  state.dirty = true;
}

function handleReplaySeek(
  command: Extract<RenderCommand, { type: 'REPLAY_SEEK' }>
): void {
  if (!state || !state.replayState) return;
  const annotations = replayRenderer.seekTo(command.timestamp);
  // Clear cache and load replay annotations
  state.cache.clear();
  for (const annotation of annotations) {
    state.cache.set(annotation);
  }
  state.dirty = true;
}

function handleReplayStop(): void {
  if (!state) return;
  replayRenderer.stop();
  state.replayState = null;
  state.dirty = true;
}

// ─── Frame Budget Command Handlers ───────────────────────────────────────────

function handleSetFrameBudget(
  command: Extract<RenderCommand, { type: 'SET_FRAME_BUDGET' }>
): void {
  if (!state) return;
  const error = state.scheduler.setFrameBudget(command.value);
  if (error) {
    postResponse({ type: 'BUDGET_ERROR', message: error });
  } else {
    postResponse({ type: 'BUDGET_UPDATED', value: command.value });
  }
}

function handleGetMetrics(): void {
  if (!state) return;
  const metrics = state.scheduler.getMetrics();
  postResponse({ type: 'METRICS', data: metrics });
}

// ─── Dirty Rect Config Command Handler ───────────────────────────────────────

function handleSetDirtyRectConfig(
  command: Extract<RenderCommand, { type: 'SET_DIRTY_RECT_CONFIG' }>
): void {
  if (!state) return;
  const error = state.dirtyRegionTracker.setConfig(command.config);
  if (error) {
    postResponse({ type: 'DIRTY_RECT_CONFIG_ERROR', message: error });
  } else {
    const config = state.dirtyRegionTracker.getConfig();
    postResponse({ type: 'DIRTY_RECT_CONFIG_UPDATED', config });
  }
}

// ─── Annotation Rendering Functions ──────────────────────────────────────────

/**
 * Render a freehand stroke annotation.
 * Applies point decimation and smoothing based on degradation mode.
 * Uses round caps/joins for smooth appearance.
 */
function renderFreehand(
  ctx: OffscreenCanvasRenderingContext2D,
  annotation: SerializedAnnotation,
  data: Extract<SerializedAnnotationData, { tool: 'freehand' }>,
  viewportWidth: number,
  viewportHeight: number,
  degradationController: DegradationController
): void {
  let points = data.points;

  if (points.length < 4) return; // Need at least 2 points (x,y pairs)

  // Apply decimation first if in degraded mode and enough points
  const numPoints = points.length / 2;
  if (degradationController.decimatePoints && numPoints > 20) {
    points = decimate(points, 2);
  }

  // Apply smoothing if enabled
  if (degradationController.smoothingEnabled) {
    points = smooth(points);
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = annotation.color;
  ctx.lineWidth = annotation.strokeWidth;
  ctx.globalAlpha = annotation.opacity;

  ctx.beginPath();
  const startX = toPixel(points[0]!, viewportWidth);
  const startY = toPixel(points[1]!, viewportHeight);
  ctx.moveTo(startX, startY);

  for (let i = 2; i < points.length; i += 2) {
    const px = toPixel(points[i]!, viewportWidth);
    const py = toPixel(points[i + 1]!, viewportHeight);
    ctx.lineTo(px, py);
  }

  ctx.stroke();
  ctx.restore();
}

/**
 * Render a highlight annotation as a filled rectangle at 0.3 opacity.
 */
function renderHighlight(
  ctx: OffscreenCanvasRenderingContext2D,
  annotation: SerializedAnnotation,
  data: Extract<SerializedAnnotationData, { tool: 'highlight' }>,
  viewportWidth: number,
  viewportHeight: number
): void {
  ctx.save();
  ctx.fillStyle = annotation.color;
  ctx.globalAlpha = 0.3;

  const x = toPixel(data.x, viewportWidth);
  const y = toPixel(data.y, viewportHeight);
  const width = toPixel(data.width, viewportWidth);
  const height = toPixel(data.height, viewportHeight);

  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

/**
 * Render an arrow annotation with a line and arrowhead at the end point.
 */
function renderArrow(
  ctx: OffscreenCanvasRenderingContext2D,
  annotation: SerializedAnnotation,
  data: Extract<SerializedAnnotationData, { tool: 'arrow' }>,
  viewportWidth: number,
  viewportHeight: number
): void {
  const startX = toPixel(data.startX, viewportWidth);
  const startY = toPixel(data.startY, viewportHeight);
  const endX = toPixel(data.endX, viewportWidth);
  const endY = toPixel(data.endY, viewportHeight);

  ctx.save();
  ctx.strokeStyle = annotation.color;
  ctx.lineWidth = annotation.strokeWidth;
  ctx.globalAlpha = annotation.opacity;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Draw the line
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Draw arrowhead at end point
  const angle = Math.atan2(endY - startY, endX - startX);
  const headLength = Math.max(annotation.strokeWidth * 3, 10);

  ctx.fillStyle = annotation.color;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - headLength * Math.cos(angle - Math.PI / 6),
    endY - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    endX - headLength * Math.cos(angle + Math.PI / 6),
    endY - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Render a text annotation with Inter font family.
 */
function renderText(
  ctx: OffscreenCanvasRenderingContext2D,
  annotation: SerializedAnnotation,
  data: Extract<SerializedAnnotationData, { tool: 'text' }>,
  viewportWidth: number,
  viewportHeight: number
): void {
  ctx.save();
  ctx.font = `${data.fontSize}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = annotation.color;
  ctx.globalAlpha = annotation.opacity;

  const x = toPixel(data.x, viewportWidth);
  const y = toPixel(data.y, viewportHeight);

  ctx.fillText(data.content, x, y);
  ctx.restore();
}

/**
 * Render all cached annotations in insertion order (z-order).
 * Iterates state.cache.values() and dispatches to the appropriate
 * render function based on annotation.data.tool.
 */
function renderAnnotations(): void {
  if (!state) return;

  const { ctx, viewportWidth, viewportHeight, cache, degradationController } = state;

  for (const annotation of cache.values()) {
    const data = annotation.data;

    switch (data.tool) {
      case 'freehand':
        renderFreehand(ctx, annotation, data, viewportWidth, viewportHeight, degradationController);
        break;
      case 'highlight':
        renderHighlight(ctx, annotation, data, viewportWidth, viewportHeight);
        break;
      case 'arrow':
        renderArrow(ctx, annotation, data, viewportWidth, viewportHeight);
        break;
      case 'text':
        renderText(ctx, annotation, data, viewportWidth, viewportHeight);
        break;
    }
  }
}

/**
 * Perform a full render frame:
 * 1. Clear the entire canvas
 * 2. Render all cached annotations (z-order)
 * 3. Render live strokes (remote users, dashed)
 * 4. Render active stroke (local user, solid)
 * 5. Render laser pointers (above all)
 *
 * @deprecated Replaced by FrameBudgetScheduler.executeBudgetedRender() for budgeted rendering.
 * Kept for reference; the scheduler now handles the render pipeline.
 */
function renderFrame(): void {
  if (!state) return;

  const { ctx, viewportWidth, viewportHeight } = state;

  // Clear the entire canvas
  ctx.clearRect(0, 0, viewportWidth, viewportHeight);

  // Render cached annotations in insertion order
  renderAnnotations();

  // Render remote live strokes (dashed, 0.8 opacity)
  renderLiveStrokes();

  // Render local active stroke (solid, full opacity)
  renderActiveStroke();

  // Render laser pointers above all annotation content
  renderLasers();
}

// ─── Frame Production and Scheduling ─────────────────────────────────────────

// ─── Render Functions for Scheduler ──────────────────────────────────────────

/**
 * Render a single annotation item. Wraps the existing per-tool render functions
 * into the RenderAnnotationFn interface expected by the scheduler.
 */
function renderSingleAnnotation(
  ctx: OffscreenCanvasRenderingContext2D,
  annotation: SerializedAnnotation,
  viewportWidth: number,
  viewportHeight: number,
  degradationController: DegradationController,
): void {
  const data = annotation.data;
  switch (data.tool) {
    case 'freehand':
      renderFreehand(ctx, annotation, data, viewportWidth, viewportHeight, degradationController);
      break;
    case 'highlight':
      renderHighlight(ctx, annotation, data, viewportWidth, viewportHeight);
      break;
    case 'arrow':
      renderArrow(ctx, annotation, data, viewportWidth, viewportHeight);
      break;
    case 'text':
      renderText(ctx, annotation, data, viewportWidth, viewportHeight);
      break;
  }
}

/**
 * Render a single live stroke. Wraps the existing live stroke rendering logic
 * into the RenderLiveStrokeFn interface expected by the scheduler.
 */
function renderSingleLiveStroke(
  ctx: OffscreenCanvasRenderingContext2D,
  stroke: SchedulerLiveStrokeState,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const { points, color, strokeWidth, opacity } = stroke;
  if (points.length < 2) return;

  ctx.save();
  ctx.setLineDash([8, 4]);
  ctx.globalAlpha = opacity * 0.8;
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  const startX = toPixel(points[0]!, viewportWidth);
  const startY = toPixel(points[1]!, viewportHeight);
  ctx.moveTo(startX, startY);

  for (let i = 2; i < points.length; i += 2) {
    const px = toPixel(points[i]!, viewportWidth);
    const py = toPixel(points[i + 1]!, viewportHeight);
    ctx.lineTo(px, py);
  }

  ctx.stroke();
  ctx.restore();

  // Reset line dash
  ctx.setLineDash([]);
}

/**
 * Render a single laser pointer. Wraps the existing laser rendering logic
 * into the RenderLaserFn interface expected by the scheduler.
 */
function renderSingleLaser(
  ctx: OffscreenCanvasRenderingContext2D,
  laser: SchedulerLaserState,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const trail = laser.trail;
  if (trail.length < 2) return;

  const pixelX = (i: number) => toPixel(trail[i]!, viewportWidth);
  const pixelY = (i: number) => toPixel(trail[i + 1]!, viewportHeight);

  // Render the trail line (if more than 1 position)
  if (trail.length >= 4) {
    ctx.beginPath();
    ctx.strokeStyle = laser.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(pixelX(0), pixelY(0));
    for (let i = 2; i < trail.length; i += 2) {
      ctx.lineTo(pixelX(i), pixelY(i));
    }
    ctx.stroke();
  }

  // Render the head dot at the most recent position
  ctx.beginPath();
  ctx.arc(pixelX(0), pixelY(0), 6, 0, Math.PI * 2);
  ctx.fillStyle = laser.color;
  ctx.globalAlpha = 0.9;
  ctx.fill();

  // Reset globalAlpha
  ctx.globalAlpha = 1.0;
}

/**
 * Render the active stroke (local user's in-progress stroke).
 * Wraps the existing active stroke rendering logic into the RenderActiveStrokeFn
 * interface expected by the scheduler.
 */
function renderSingleActiveStroke(
  ctx: OffscreenCanvasRenderingContext2D,
  activeStroke: SchedulerActiveStrokeState,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const { config, points } = activeStroke;
  if (points.length < 2) return;

  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = config.opacity;
  ctx.strokeStyle = config.color;
  ctx.lineWidth = config.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  const startX = toPixel(points[0]!, viewportWidth);
  const startY = toPixel(points[1]!, viewportHeight);
  ctx.moveTo(startX, startY);

  for (let i = 2; i < points.length; i += 2) {
    const px = toPixel(points[i]!, viewportWidth);
    const py = toPixel(points[i + 1]!, viewportHeight);
    ctx.lineTo(px, py);
  }

  ctx.stroke();
  ctx.restore();
}

/** The render functions object passed to the scheduler. */
const renderFns: RenderFunctions = {
  renderAnnotation: renderSingleAnnotation,
  renderLiveStroke: renderSingleLiveStroke,
  renderLaser: renderSingleLaser,
  renderActiveStroke: renderSingleActiveStroke,
};

/**
 * Schedule the next frame production using the FrameBudgetScheduler.
 * Uses the DegradationController's frameInterval for normal frames (Req 6.4).
 * The scheduler handles follow-up frames with zero delay internally.
 * Does nothing if a frame is already scheduled.
 */
function scheduleFrame(): void {
  if (!state || state.frameRequestId !== null) return;

  // If the scheduler already has a follow-up frame pending, don't schedule another
  if (state.scheduler.getFollowUpTimerId() !== null) return;

  state.frameRequestId = setTimeout(() => {
    if (state) {
      state.frameRequestId = null;
    }
    produceFrame();
  }, state.degradationController.frameInterval) as unknown as number;
}

/**
 * Produce a rendered frame using the FrameBudgetScheduler with dirty region tracking.
 * The scheduler handles budgeted rendering, ImageBitmap production,
 * and follow-up frame scheduling for deferred work.
 *
 * Dirty region flow:
 * 1. If first frame or pending resize: force full clear
 * 2. Recompute bounding boxes on resize (Req 8.2, 8.4)
 * 3. Call prepareFrame to get dirty regions
 * 4. If no dirty regions and previous bitmap available: skip render (Req 10.3)
 * 5. Compute overlapping items for dirty regions
 * 6. Execute budgeted render with dirty frame info
 * 7. Call commitFrame to store previous-frame regions
 */
async function produceFrame(): Promise<void> {
  if (!state || !state.dirty) return;

  const viewport: ViewportDimensions = {
    viewportWidth: state.viewportWidth,
    viewportHeight: state.viewportHeight,
  };

  // Task 7.4: Recompute bounding boxes on resize before dirty region processing
  // (The DirtyRegionTracker.onResize() already invalidates all and clears previous-frame
  // regions, so the full clear will be triggered. No explicit bbox recomputation cache
  // is needed since bboxes are computed on-demand during overlap queries using current viewport.)
  if (state.pendingResize) {
    state.pendingResize = false;
    // Bounding boxes are recomputed on-demand using the new viewport dimensions
    // during overlap queries in findOverlappingAnnotations/findOverlappingDynamicItems.
    // The onResize() call already triggered full clear, so all items will be redrawn.
  }

  // Task 7.3: Force full clear on first frame or after canvas re-initialization (Req 10.5)
  if (state.isFirstFrame) {
    state.dirtyRegionTracker.invalidateAll();
    state.isFirstFrame = false;
  }

  // Compute current dynamic item bounding boxes
  const activeStrokeBBox = state.activeStroke
    ? computePointsBBox(
        state.activeStroke.points,
        state.activeStroke.config.strokeWidth,
        viewport,
      )
    : null;

  const liveStrokeBBoxes = new Map<string, BoundingBox>();
  for (const [userId, stroke] of state.liveStrokes) {
    liveStrokeBBoxes.set(
      userId,
      computePointsBBox(stroke.points, stroke.strokeWidth, viewport),
    );
  }

  const laserBBoxes = new Map<string, BoundingBox>();
  for (const [userId, laser] of state.lasers) {
    laserBBoxes.set(userId, computeLaserBBox(laser.trail, viewport));
  }

  // Call prepareFrame to get dirty regions and fallback decision
  const dirtyFrame = state.dirtyRegionTracker.prepareFrame(
    viewport,
    activeStrokeBBox,
    liveStrokeBBoxes,
    laserBBoxes,
  );

  // Task 7.3: Frame skip optimization — if no dirty regions and previous bitmap available (Req 10.3)
  if (
    !dirtyFrame.useFullClear &&
    dirtyFrame.regions.length === 0 &&
    state.previousBitmap !== null
  ) {
    // No dirty regions: reuse previous bitmap
    postResponse({ type: 'FRAME', bitmap: state.previousBitmap });
    state.dirtyRegionTracker.commitFrame(activeStrokeBBox, liveStrokeBBoxes, laserBBoxes);
    state.dirty = false;
    return;
  }

  // Compute overlapping items for dirty region rendering (only when not full clear)
  let overlappingItems: OverlappingItemSet | undefined;
  if (!dirtyFrame.useFullClear && dirtyFrame.regions.length > 0) {
    // Find overlapping annotations
    const allAnnotations = Array.from(state.cache.values());
    const overlappingAnnotations = findOverlappingAnnotations(
      allAnnotations,
      dirtyFrame.regions,
      viewport,
      state.ctx,
    );

    // Find overlapping dynamic items
    const liveStrokeItems = Array.from(state.liveStrokes.values()).map((s) => ({
      userId: s.userId,
      points: s.points,
      strokeWidth: s.strokeWidth,
    }));
    const laserItems = Array.from(state.lasers.values()).map((l) => ({
      userId: l.userId,
      trail: l.trail,
    }));
    const activeStrokeItem = state.activeStroke
      ? { points: state.activeStroke.points, strokeWidth: state.activeStroke.config.strokeWidth }
      : null;

    const dynamicOverlap = findOverlappingDynamicItems(
      liveStrokeItems,
      laserItems,
      activeStrokeItem,
      dirtyFrame.regions,
      viewport,
    );

    overlappingItems = {
      annotations: overlappingAnnotations,
      liveStrokes: dynamicOverlap.liveStrokes.map((s) => s.userId),
      lasers: dynamicOverlap.lasers.map((l) => l.userId),
      activeStrokeOverlaps: dynamicOverlap.activeStrokeOverlaps,
    };
  }

  // Execute the budgeted render pass with dirty frame info
  const result = state.scheduler.executeBudgetedRender(
    state as unknown as import('./frameBudgetScheduler').BudgetRenderState,
    renderFns,
    dirtyFrame,
    overlappingItems,
  );

  // Produce ImageBitmap and transfer to main thread
  try {
    const bitmap = await createImageBitmap(state.canvas);
    // Store for potential frame skip reuse
    state.previousBitmap = bitmap;
    postResponse({ type: 'FRAME', bitmap });
  } catch (error) {
    console.error('[RenderWorker] Failed to produce ImageBitmap:', error);
  }

  // Call commitFrame to store current dynamic item bboxes as previous-frame regions
  state.dirtyRegionTracker.commitFrame(activeStrokeBBox, liveStrokeBBoxes, laserBBoxes);

  state.dirty = false;

  // Handle follow-up scheduling for deferred work
  if (result.hadDeferral) {
    state.scheduler.incrementFollowUpCount();
    const timerId = setTimeout(() => {
      state?.scheduler.setFollowUpTimerId(null);
      // Mark dirty to trigger follow-up render
      if (state) {
        state.dirty = true;
        produceFrame();
      }
    }, 0);
    state.scheduler.setFollowUpTimerId(timerId);
  } else {
    state.scheduler.resetFollowUpCount();
    state.scheduler.setDeferredWork(null);
    const existingTimer = state.scheduler.getFollowUpTimerId();
    if (existingTimer !== null) {
      clearTimeout(existingTimer);
      state.scheduler.setFollowUpTimerId(null);
    }
  }
}

// ─── Rendering Functions ─────────────────────────────────────────────────────

/**
 * Render all active laser pointers above all other annotation content.
 * Each laser has a trail line and a head dot at the most recent position.
 * Must be called LAST in the render pass to ensure lasers are above all strokes.
 */
function renderLasers(): void {
  if (!state) return;
  const { ctx, viewportWidth, viewportHeight, lasers } = state;

  for (const laser of lasers.values()) {
    const trail = laser.trail;
    // Trail is [x0, y0, x1, y1, ...] where first position is newest
    if (trail.length < 2) continue;

    // Convert all positions from normalized to pixel space
    const pixelX = (i: number) => toPixel(trail[i]!, viewportWidth);
    const pixelY = (i: number) => toPixel(trail[i + 1]!, viewportHeight);

    // Render the trail line (if more than 1 position)
    if (trail.length >= 4) {
      ctx.beginPath();
      ctx.strokeStyle = laser.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(pixelX(0), pixelY(0));
      for (let i = 2; i < trail.length; i += 2) {
        ctx.lineTo(pixelX(i), pixelY(i));
      }
      ctx.stroke();
    }

    // Render the head dot at the most recent position (first in trail)
    ctx.beginPath();
    ctx.arc(pixelX(0), pixelY(0), 6, 0, Math.PI * 2);
    ctx.fillStyle = laser.color;
    ctx.globalAlpha = 0.9;
    ctx.fill();
  }

  // Reset globalAlpha to default after rendering lasers
  ctx.globalAlpha = 1.0;
}

// ─── Live Stroke & Active Stroke Rendering ──────────────────────────────────

/**
 * Render all live strokes (remote users' in-progress strokes).
 * Live strokes are rendered with a dashed line style and 0.8 opacity multiplier
 * to visually distinguish them from committed strokes.
 */
function renderLiveStrokes(): void {
  if (!state) return;
  const { ctx, viewportWidth, viewportHeight } = state;

  for (const stroke of state.liveStrokes.values()) {
    const { points, color, strokeWidth, opacity } = stroke;
    // Need at least one point (x, y pair) to draw
    if (points.length < 2) continue;

    ctx.save();
    ctx.setLineDash([8, 4]);
    ctx.globalAlpha = opacity * 0.8;
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    const startX = toPixel(points[0]!, viewportWidth);
    const startY = toPixel(points[1]!, viewportHeight);
    ctx.moveTo(startX, startY);

    for (let i = 2; i < points.length; i += 2) {
      const px = toPixel(points[i]!, viewportWidth);
      const py = toPixel(points[i + 1]!, viewportHeight);
      ctx.lineTo(px, py);
    }

    ctx.stroke();
    ctx.restore();
  }

  // Reset line dash after all live strokes
  if (state.liveStrokes.size > 0) {
    state.ctx.setLineDash([]);
  }
}

/**
 * Render the active stroke (local user's in-progress stroke).
 * Active stroke is rendered with full opacity and solid line (no dash)
 * to visually distinguish it from remote live strokes.
 */
function renderActiveStroke(): void {
  if (!state || !state.activeStroke) return;

  const { ctx, viewportWidth, viewportHeight } = state;
  const { config, points } = state.activeStroke;

  // Need at least one point (x, y pair) to draw
  if (points.length < 2) return;

  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = config.opacity;
  ctx.strokeStyle = config.color;
  ctx.lineWidth = config.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  const startX = toPixel(points[0]!, viewportWidth);
  const startY = toPixel(points[1]!, viewportHeight);
  ctx.moveTo(startX, startY);

  for (let i = 2; i < points.length; i += 2) {
    const px = toPixel(points[i]!, viewportWidth);
    const py = toPixel(points[i + 1]!, viewportHeight);
    ctx.lineTo(px, py);
  }

  ctx.stroke();
  ctx.restore();
}

// ─── Message Handler ─────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<RenderCommand>) => {
  const command = event.data;

  // For content-affecting commands, check if deferred work should be invalidated (Req 3.4, 8.5)
  if (state && CONTENT_AFFECTING_COMMANDS.has(command.type)) {
    state.scheduler.handleContentAffectingCommand(command.type);
  }

  switch (command.type) {
    case 'INIT':
      handleInit(command);
      break;
    case 'RESIZE':
      handleResize(command);
      break;
    case 'TERMINATE':
      handleTerminate();
      break;
    case 'ANNOTATION_UPDATE':
      handleAnnotationUpdate(command);
      break;
    case 'ANNOTATION_REMOVE':
      handleAnnotationRemove(command);
      break;
    case 'SLIDE_CHANGE':
      handleSlideChange(command);
      break;
    case 'LIVE_STROKE_UPDATE':
      handleLiveStrokeUpdate(command);
      break;
    case 'LIVE_STROKE_COMMIT':
      handleLiveStrokeCommit(command);
      break;
    case 'LIVE_STROKE_REMOVE':
      handleLiveStrokeRemove(command);
      break;
    case 'ACTIVE_STROKE_START':
      handleActiveStrokeStart(command);
      break;
    case 'ACTIVE_STROKE_POINTS':
      handleActiveStrokePoints(command);
      break;
    case 'ACTIVE_STROKE_COMMIT':
      handleActiveStrokeCommit(command);
      break;
    case 'ACTIVE_STROKE_CANCEL':
      handleActiveStrokeCancel();
      break;
    case 'HIT_TEST':
      handleHitTest(command);
      break;
    case 'LASER_UPDATE':
      handleLaserUpdate(command);
      break;
    case 'LASER_REMOVE':
      handleLaserRemove(command);
      break;
    case 'SET_DEGRADATION_MODE':
      handleSetDegradationMode(command);
      break;
    case 'REPLAY_START':
      handleReplayStart(command);
      break;
    case 'REPLAY_SEEK':
      handleReplaySeek(command);
      break;
    case 'REPLAY_STOP':
      handleReplayStop();
      break;
    case 'SET_FRAME_BUDGET':
      handleSetFrameBudget(command);
      break;
    case 'SET_DIRTY_RECT_CONFIG':
      handleSetDirtyRectConfig(command);
      break;
    case 'GET_METRICS':
      handleGetMetrics();
      break;
  }

  // After processing each command, schedule a frame if state is dirty.
  // This batches multiple commands within a single frame interval into one render pass.
  if (state && state.dirty) {
    scheduleFrame();
  }
};
