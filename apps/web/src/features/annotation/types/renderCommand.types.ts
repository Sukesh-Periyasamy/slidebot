// ─────────────────────────────────────────────────────────────────────────────
// Render Worker Protocol Types — Message types for the OffscreenCanvas worker
// ─────────────────────────────────────────────────────────────────────────────

import type { MetricsResponse } from '../workers/frameBudgetScheduler.types';

// ─── Supporting Types ────────────────────────────────────────────────────────

/**
 * Tool-specific annotation data for the worker.
 * Points stored as Float64Array for Transferable zero-copy transfer.
 */
export type SerializedAnnotationData =
  | { tool: 'freehand'; points: Float64Array }
  | { tool: 'highlight'; x: number; y: number; width: number; height: number }
  | { tool: 'arrow'; startX: number; startY: number; endX: number; endY: number }
  | { tool: 'text'; x: number; y: number; content: string; fontSize: number };

/**
 * Serialized annotation for worker consumption.
 * All coordinates are in normalized [0,1] space.
 */
export interface SerializedAnnotation {
  id: string;
  tool: 'freehand' | 'highlight' | 'arrow' | 'text';
  color: string;
  strokeWidth: number;
  opacity: number;
  data: SerializedAnnotationData;
}

/** Configuration for an active freehand stroke. */
export interface StrokeConfig {
  tool: 'freehand';
  color: string;
  strokeWidth: number;
  opacity: number;
}

/** Input for SET_DIRTY_RECT_CONFIG command (partial update). */
export interface DirtyRectConfigInput {
  enabled?: boolean;
  coverageThreshold?: number;   // 0.1–1.0
  regionCountThreshold?: number; // 1–64
  mergeMargin?: number;          // 0–32
}

/** Full dirty rect configuration (returned in responses). */
export interface DirtyRectConfig {
  enabled: boolean;
  coverageThreshold: number;
  regionCountThreshold: number;
  mergeMargin: number;
}

/** A timestamped annotation event for replay. */
export interface ReplayEvent {
  timestamp: number;
  action: 'add' | 'remove';
  annotation?: SerializedAnnotation;
  annotationId?: string;
}

// ─── Main Thread → Worker Commands ───────────────────────────────────────────

export type RenderCommand =
  | { type: 'INIT'; canvas: OffscreenCanvas }
  | { type: 'RESIZE'; width: number; height: number }
  | { type: 'ANNOTATION_UPDATE'; annotation: SerializedAnnotation }
  | { type: 'ANNOTATION_REMOVE'; annotationId: string }
  | { type: 'SLIDE_CHANGE'; slideId: string; annotations: SerializedAnnotation[] }
  | { type: 'LIVE_STROKE_UPDATE'; userId: string; points: Float64Array }
  | { type: 'LIVE_STROKE_COMMIT'; userId: string; annotation: SerializedAnnotation }
  | { type: 'LIVE_STROKE_REMOVE'; userId: string }
  | { type: 'ACTIVE_STROKE_START'; config: StrokeConfig }
  | { type: 'ACTIVE_STROKE_POINTS'; points: Float64Array }
  | { type: 'ACTIVE_STROKE_COMMIT'; annotationId: string }
  | { type: 'ACTIVE_STROKE_CANCEL' }
  | { type: 'HIT_TEST'; x: number; y: number; requestId: string }
  | { type: 'LASER_UPDATE'; userId: string; color: string; trail: Float64Array }
  | { type: 'LASER_REMOVE'; userId: string }
  | { type: 'SET_DEGRADATION_MODE'; mode: 'normal' | 'degraded' }
  | { type: 'REPLAY_START'; events: ReplayEvent[] }
  | { type: 'REPLAY_SEEK'; timestamp: number }
  | { type: 'REPLAY_STOP' }
  | { type: 'SET_FRAME_BUDGET'; value: number }
  | { type: 'SET_DIRTY_RECT_CONFIG'; config: Partial<DirtyRectConfigInput> }
  | { type: 'GET_METRICS' }
  | { type: 'TERMINATE' };

// ─── Worker → Main Thread Responses ─────────────────────────────────────────

export type WorkerResponse =
  | { type: 'READY' }
  | { type: 'FRAME'; bitmap: ImageBitmap }
  | { type: 'HIT_RESULT'; requestId: string; annotationId: string | null }
  | { type: 'METRICS'; data: MetricsResponse }
  | { type: 'BUDGET_ERROR'; message: string }
  | { type: 'BUDGET_UPDATED'; value: number }
  | { type: 'DIRTY_RECT_CONFIG_UPDATED'; config: DirtyRectConfig }
  | { type: 'DIRTY_RECT_CONFIG_ERROR'; message: string }
  | { type: 'ERROR'; message: string };
