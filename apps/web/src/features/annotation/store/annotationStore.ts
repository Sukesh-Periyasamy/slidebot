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
import { logger } from '@/lib/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Ownership types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ownership metadata attached to annotation mutations.
 * Rules:
 * - Only the ownerId OR a presenter-override may mutate an annotation.
 * - isPresenterOverride bypasses ownerId check (for presenter erase/lock).
 * - Locked annotations cannot be mutated unless isPresenterOverride=true.
 */
export interface AnnotationOwnershipContext {
  currentUserId: string;
  isPresenter: boolean;
}

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
  // Room pressure mode
  degradationMode: 'normal' | 'degraded';

  // ── Ownership model ──────────────────────────────────────────────────────
  /** Set of annotation IDs that are locked (cannot be mutated by non-presenters) */
  lockedAnnotationIds: Set<string>;
  /** Undo stack: list of annotation IDs that can be undone (LIFO) */
  undoStack: string[];
  /** Redo stack: list of annotation IDs that can be redone (LIFO) */
  redoStack: string[];

  // Actions
  setCurrentSlide: (slideId: string) => void;
  setTool: (tool: AnnotationTool) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setOpacity: (opacity: number) => void;
  setIsAnnotating: (active: boolean) => void;
  setDegradationMode: (mode: 'normal' | 'degraded') => void;

  // Active stroke
  startStroke: (annotation: Annotation) => void;
  appendStrokePoints: (points: number[]) => void;
  updateActiveStrokePoints: (points: number[]) => void;
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

  // ── Ownership actions ────────────────────────────────────────────────────
  /**
   * Selective erase by annotation ID.
   * Only succeeds if:
   * - currentUserId === annotation.userId (owner), OR
   * - isPresenter === true (presenter override)
   * Returns true if annotation was removed, false if ownership check failed.
   */
  eraseAnnotation: (annotationId: string, ownership: AnnotationOwnershipContext) => boolean;

  /**
   * Lock an annotation (only presenter may lock).
   * Locked annotations cannot be mutated by non-presenters.
   */
  lockAnnotation: (annotationId: string, ownership: AnnotationOwnershipContext) => boolean;

  /**
   * Unlock an annotation (only presenter may unlock).
   */
  unlockAnnotation: (annotationId: string, ownership: AnnotationOwnershipContext) => boolean;

  /**
   * Undo the last annotation added by the current user.
   * Only removes from local store — server-side undo emits 'annotation_delete'.
   * Returns the annotation ID that was undone, or null.
   */
  undoLastAnnotation: (ownership: AnnotationOwnershipContext) => string | null;

  /**
   * Redo the last undone annotation.
   * Returns the annotation that was restored, or null.
   */
  redoLastAnnotation: (ownership: AnnotationOwnershipContext) => Annotation | null;
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
        degradationMode: 'normal',
        lockedAnnotationIds: new Set<string>(),
        undoStack: [],
        redoStack: [],

        // ── Context ────────────────────────────────────────────────────
        setCurrentSlide: (slideId) =>
          set((s) => {
            s.currentSlideId = slideId;
            s.annotations = {};
            s.activeStroke = null;
            s.liveStrokes = {};
            // Reset ownership state on slide change
            s.lockedAnnotationIds = new Set();
            s.undoStack = [];
            s.redoStack = [];
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

        setDegradationMode: (mode) =>
          set((s) => {
            s.degradationMode = mode;
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

        updateActiveStrokePoints: (points) =>
          set((s) => {
            if (!s.activeStroke) return;
            if (s.activeStroke.data.tool === 'freehand') {
              (s.activeStroke.data as { points: number[] }).points = [...points];
            }
          }),

        commitStroke: () => {
          const { activeStroke } = get();
          if (!activeStroke) return null;
          set((s) => {
            s.annotations[activeStroke.id] = activeStroke;
            s.activeStroke = null;
            // Track in undo stack (keyed by annotation ID)
            s.undoStack.push(activeStroke.id);
            // Committing clears redo stack
            s.redoStack = [];
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
            s.lockedAnnotationIds = new Set();
            s.undoStack = [];
            s.redoStack = [];
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

        // ── Laser pointers ─────────────────────────────────────────────────────
        updateLaser: (userId, laser) =>
          set((s) => {
            s.laserPointers[userId] = laser;
          }),

        removeLaser: (userId) =>
          set((s) => {
            delete s.laserPointers[userId];
          }),

        // ── Ownership actions ──────────────────────────────────────────────────

        eraseAnnotation: (annotationId, ownership) => {
          const { annotations, lockedAnnotationIds } = get();
          const annotation = annotations[annotationId];

          if (!annotation) {
            return false;
          }

          // Ownership check: only owner or presenter may erase
          const isOwner = annotation.userId === ownership.currentUserId;
          const canMutate = isOwner || ownership.isPresenter;
          if (!canMutate) {
            logger.warn(
              '[AnnotationStore] eraseAnnotation: ownership check failed',
              { annotationId, currentUserId: ownership.currentUserId, ownerId: annotation.userId }
            );
            return false;
          }

          // Lock check: locked annotations require presenter override
          if (lockedAnnotationIds.has(annotationId) && !ownership.isPresenter) {
            logger.warn(
              '[AnnotationStore] eraseAnnotation: annotation is locked',
              { annotationId }
            );
            return false;
          }

          set((s) => {
            delete s.annotations[annotationId];
            s.lockedAnnotationIds.delete(annotationId);
            // Remove from undo/redo stacks
            s.undoStack = s.undoStack.filter((id) => id !== annotationId);
            s.redoStack = s.redoStack.filter((id) => id !== annotationId);
          });

          return true;
        },

        lockAnnotation: (annotationId, ownership) => {
          if (!ownership.isPresenter) {
            logger.warn('[AnnotationStore] lockAnnotation: only presenter may lock');
            return false;
          }
          const annotation = get().annotations[annotationId];
          if (!annotation) return false;

          set((s) => {
            s.lockedAnnotationIds.add(annotationId);
          });
          return true;
        },

        unlockAnnotation: (annotationId, ownership) => {
          if (!ownership.isPresenter) {
            logger.warn('[AnnotationStore] unlockAnnotation: only presenter may unlock');
            return false;
          }

          set((s) => {
            s.lockedAnnotationIds.delete(annotationId);
          });
          return true;
        },

        undoLastAnnotation: (ownership) => {
          const { undoStack, annotations } = get();

          // Find the last annotation in the undo stack owned by the current user
          let annotationId: string | undefined;
          for (let i = undoStack.length - 1; i >= 0; i--) {
            const id = undoStack[i]!;
            const ann = annotations[id];
            if (ann && ann.userId === ownership.currentUserId) {
              annotationId = id;
              break;
            }
          }

          if (!annotationId) return null;

          // Check lock
          if (get().lockedAnnotationIds.has(annotationId) && !ownership.isPresenter) {
            return null;
          }

          const annotation = annotations[annotationId];
          if (!annotation) return null;

          set((s) => {
            delete s.annotations[annotationId!];
            s.undoStack = s.undoStack.filter((id) => id !== annotationId);
            s.redoStack.push(annotationId!);
          });

          return annotationId;
        },

        redoLastAnnotation: (ownership) => {
          const { redoStack } = get();
          const annotationId = redoStack[redoStack.length - 1];
          if (!annotationId) return null;

          // Note: re-adding requires the annotation to still be known.
          // In practice, redo restores from the server (the caller emits
          // the annotation back). Here we just manage the stack.
          set((s) => {
            s.redoStack = s.redoStack.filter((id) => id !== annotationId);
            s.undoStack.push(annotationId);
          });

          // Return null — caller must re-fetch annotation from server or cache
          return null;
        },
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
    const changedKeys = Object.keys(nextState as object).filter(
      (key) => (nextState as unknown as Record<string, unknown>)[key] !== (prevState as unknown as Record<string, unknown>)[key]
    );
    if (changedKeys.length > 0) {
      logger.debug?.('[store:update]', {
        store: 'annotationStore',
        changedKeys,
      });
    }
    prevState = nextState;
  });
}
