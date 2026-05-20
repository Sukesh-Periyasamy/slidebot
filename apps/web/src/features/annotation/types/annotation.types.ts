/**
 * Annotation types shared across the annotation engine.
 * These mirror the Prisma schema but are frontend-optimised.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tool types
// ─────────────────────────────────────────────────────────────────────────────

export type AnnotationTool =
  | 'freehand'
  | 'highlight'
  | 'arrow'
  | 'text'
  | 'laser'
  | 'select'
  | 'eraser';

export type AnnotationStatus = 'in-progress' | 'committed' | 'deleted';

// ─────────────────────────────────────────────────────────────────────────────
// Annotation data shapes (discriminated union per tool)
// ─────────────────────────────────────────────────────────────────────────────

export interface FreehandData {
  tool: 'freehand';
  /** Flat array [x0, y0, x1, y1, …] in slide-relative coordinates [0-1] */
  points: number[];
}

export interface HighlightData {
  tool: 'highlight';
  x: number; // [0-1] relative to slide width
  y: number; // [0-1] relative to slide height
  width: number;
  height: number;
}

export interface ArrowData {
  tool: 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface TextData {
  tool: 'text';
  x: number;
  y: number;
  content: string;
  fontSize: number; // normalized [0-1] relative to slide height
}

export interface LaserData {
  tool: 'laser';
  points: number[];
}

export type AnnotationData = FreehandData | HighlightData | ArrowData | TextData | LaserData;

// ─────────────────────────────────────────────────────────────────────────────
// Core annotation model
// ─────────────────────────────────────────────────────────────────────────────

export interface Annotation {
  id: string;
  slideId: string;
  userId: string;
  displayName: string;
  color: string;
  strokeWidth: number;
  opacity: number;
  data: AnnotationData;
  isEphemeral: boolean;
  status: AnnotationStatus;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Live presence / cursor types
// ─────────────────────────────────────────────────────────────────────────────

export interface CursorPosition {
  /** Normalised [0-1] relative to slide dimensions */
  x: number;
  y: number;
}

export interface LiveCursor {
  userId: string;
  displayName: string;
  color: string;
  position: CursorPosition;
  lastSeen: number; // timestamp ms — stale if > 5s old
}

export interface LiveStroke {
  /** Partial annotation being drawn by a remote user */
  annotationId: string;
  userId: string;
  color: string;
  strokeWidth: number;
  opacity: number;
  tool: AnnotationTool;
  points: number[];
}

export interface LaserPointerState {
  userId: string;
  displayName: string;
  color: string;
  /** Trail: array of positions from newest to oldest */
  trail: CursorPosition[];
  lastSeen: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool config
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolConfig {
  tool: AnnotationTool;
  color: string;
  strokeWidth: number;
  opacity: number;
}

export const DEFAULT_TOOL_CONFIG: ToolConfig = {
  tool: 'freehand',
  color: '#6173F2',
  strokeWidth: 3,
  opacity: 1,
};

export const STROKE_WIDTHS = [2, 4, 6, 10] as const;

export const ANNOTATION_COLORS = [
  '#6173F2', // brand blue
  '#EC4899', // pink
  '#F59E0B', // amber
  '#10B981', // emerald
  '#EF4444', // red
  '#8B5CF6', // violet
  '#FFFFFF', // white
] as const;
