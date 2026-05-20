/**
 * Shared DTO types for annotations — bridge between Prisma models and frontend.
 * These mirror the frontend annotation.types.ts but are backend-safe (no canvas deps).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Annotation data payloads (discriminated union)
// ─────────────────────────────────────────────────────────────────────────────

export interface FreehandPayload {
  tool: 'freehand';
  points: number[]; // flat [x0,y0,x1,y1,...] normalised [0-1]
}

export interface HighlightPayload {
  tool: 'highlight';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrowPayload {
  tool: 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface TextPayload {
  tool: 'text';
  x: number;
  y: number;
  content: string;
  fontSize: number;
}

export type AnnotationDataPayload = FreehandPayload | HighlightPayload | ArrowPayload | TextPayload;

// ─────────────────────────────────────────────────────────────────────────────
// Annotation DTO (returned from API / used in snapshots)
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnotationDto {
  id: string;
  slideId: string;
  userId: string;
  displayName: string;
  color: string;
  strokeWidth: number;
  opacity: number;
  data: AnnotationDataPayload;
  isEphemeral: boolean;
  status: 'committed' | 'deleted';
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Request / Response shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface SaveAnnotationRequest {
  id: string;
  slideId: string;
  sessionId?: string;
  tool: string;
  color: string;
  strokeWidth: number;
  opacity: number;
  data: AnnotationDataPayload;
  isEphemeral?: boolean;
}

export interface DeleteAnnotationRequest {
  annotationId: string;
}

export interface GetAnnotationsResponse {
  data: AnnotationDto[];
  count: number;
}
