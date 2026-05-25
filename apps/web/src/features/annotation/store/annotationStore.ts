import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import type {
  Annotation,
  AnnotationTool,
  LaserPointerState,
  LiveCursor,
  LiveStroke,
  ToolConfig,
} from '../types/annotation.types';
import { DEFAULT_TOOL_CONFIG } from '../types/annotation.types';

// ─────────────────────────────────────────────────────────────────────────────
// State shape
// ─────────────────────────────────────────────────────────────────────────────

interface AnnotationState {
  // Committed annotations (persisted or ephemeral-committed) keyed by id
  annotations: Record<string, Annotation>;
  // Current user's in-progress stroke (not yet committed)
  activeStroke: Annotation | null;
  // Remote users' live strokes (keyed by userId)
  liveStrokes: Record<string, LiveStroke>;
  // Remote cursors (keyed by userId)
  cursors: Record<string, LiveCursor>;
  // Laser pointers (keyed by userId)
  laserPointers: Record<string, LaserPointerState>;
  // Tool state
  toolConfig: ToolConfig;
  isAnnotating: boolean;
  // Current slide context
  currentSlideId: string | null;

  // Actions
  setCurrentSlide: (slideId: string) => void;
  setTool: (tool: AnnotationTool) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setOpacity: (opacity: number) => void;
  setIsAnnotating: (active: boolean) => void;

  // Active stroke
  startStroke: (annotation: Annotation) => void;
  appendStrokePoints: (points: number[]) => void;
  commitStroke: () => Annotation | null;
  cancelStroke: () => void;

  // Annotations
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  loadAnnotations: (annotations: Annotation[]) => void;
  clearAnnotations: () => void;

  // Live strokes from remote users
  setLiveStroke: (userId: string, stroke: LiveStroke) => void;
  appendLiveStrokePoints: (userId: string, points: number[]) => void;
  commitLiveStroke: (userId: string, annotation: Annotation) => void;
  removeLiveStroke: (userId: string) => void;

  // Cursors
  updateCursor: (userId: string, cursor: LiveCursor) => void;
  removeCursor: (userId: string) => void;

  // Laser pointers
  updateLaser: (userId: string, laser: LaserPointerState) => void;
  removeLaser: (userId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useAnnotationStore = create<AnnotationState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        annotations: {},
        activeStroke: null,
        liveStrokes: {},
        cursors: {},
        laserPointers: {},
        toolConfig: DEFAULT_TOOL_CONFIG,
        isAnnotating: false,
        currentSlideId: null,

        // ── Context ───────────────────────────────────────────────────────
        setCurrentSlide: (slideId) =>
          set((s) => {
            s.currentSlideId = slideId;
            s.annotations = {};
            s.activeStroke = null;
            s.liveStrokes = {};
          }),

        // ── Tool config ───────────────────────────────────────────────────
        setTool: (tool) =>
          set((s) => {
            s.toolConfig.tool = tool;
            s.isAnnotating = tool !== 'select';
          }),

        setColor: (color) =>
          set((s) => {
            s.toolConfig.color = color;
          }),

        setStrokeWidth: (strokeWidth) =>
          set((s) => {
            s.toolConfig.strokeWidth = strokeWidth;
          }),

        setOpacity: (opacity) =>
          set((s) => {
            s.toolConfig.opacity = opacity;
          }),

        setIsAnnotating: (isAnnotating) =>
          set((s) => {
            s.isAnnotating = isAnnotating;
          }),

        // ── Active stroke ─────────────────────────────────────────────────
        startStroke: (annotation) =>
          set((s) => {
            s.activeStroke = annotation;
          }),

        appendStrokePoints: (points) =>
          set((s) => {
            if (!s.activeStroke) return;
            if (s.activeStroke.data.tool === 'freehand') {
              (s.activeStroke.data as { points: number[] }).points.push(...points);
            }
          }),

        commitStroke: () => {
          const { activeStroke } = get();
          if (!activeStroke) return null;
          set((s) => {
            s.annotations[activeStroke.id] = activeStroke;
            s.activeStroke = null;
          });
          return activeStroke;
        },

        cancelStroke: () =>
          set((s) => {
            s.activeStroke = null;
          }),

        // ── Annotations ───────────────────────────────────────────────────
        addAnnotation: (annotation) =>
          set((s) => {
            s.annotations[annotation.id] = annotation;
          }),

        updateAnnotation: (id, updates) =>
          set((s) => {
            if (s.annotations[id]) {
              Object.assign(s.annotations[id], updates);
            }
          }),

        removeAnnotation: (id) =>
          set((s) => {
            delete s.annotations[id];
          }),

        loadAnnotations: (annotations) =>
          set((s) => {
            s.annotations = Object.fromEntries(annotations.map((a) => [a.id, a]));
          }),

        clearAnnotations: () =>
          set((s) => {
            s.annotations = {};
            s.activeStroke = null;
          }),

        // ── Live strokes ──────────────────────────────────────────────────
        setLiveStroke: (userId, stroke) =>
          set((s) => {
            s.liveStrokes[userId] = stroke;
          }),

        appendLiveStrokePoints: (userId, points) =>
          set((s) => {
            if (s.liveStrokes[userId]) {
              s.liveStrokes[userId]!.points.push(...points);
            }
          }),

        commitLiveStroke: (userId, annotation) =>
          set((s) => {
            delete s.liveStrokes[userId];
            s.annotations[annotation.id] = annotation;
          }),

        removeLiveStroke: (userId) =>
          set((s) => {
            delete s.liveStrokes[userId];
          }),

        // ── Cursors ───────────────────────────────────────────────────────
        updateCursor: (userId, cursor) =>
          set((s) => {
            s.cursors[userId] = cursor;
          }),

        removeCursor: (userId) =>
          set((s) => {
            delete s.cursors[userId];
          }),

        // ── Laser pointers ────────────────────────────────────────────────
        updateLaser: (userId, laser) =>
          set((s) => {
            s.laserPointers[userId] = laser;
          }),

        removeLaser: (userId) =>
          set((s) => {
            delete s.laserPointers[userId];
          }),
      }))
    ),
    { name: 'AnnotationStore' }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────────────────────

export const selectAnnotationList = (s: AnnotationState) =>
  Object.values(s.annotations).filter((a) => a.status !== 'deleted');

export const selectLiveStrokeList = (s: AnnotationState) => Object.values(s.liveStrokes);
export const selectCursorList = (s: AnnotationState) => Object.values(s.cursors);
export const selectLaserList = (s: AnnotationState) => Object.values(s.laserPointers);
export const selectToolConfig = (s: AnnotationState) => s.toolConfig;
export const selectActiveStroke = (s: AnnotationState) => s.activeStroke;

if (import.meta.env.DEV) {
  let prevState = useAnnotationStore.getState();
  useAnnotationStore.subscribe((nextState) => {
    const changedKeys = Object.keys(nextState).filter(
      (key) => (nextState as Record<string, unknown>)[key] !== (prevState as Record<string, unknown>)[key]
    );
    if (changedKeys.length > 0) {
      console.debug('[store:update]', {
        store: 'annotationStore',
        changedKeys,
      });
    }
    prevState = nextState;
  });
}
