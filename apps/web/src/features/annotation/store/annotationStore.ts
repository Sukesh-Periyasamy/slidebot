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
import { useSettingsStore } from '@/features/settings/store/settingsStore';

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
  
  /** 
   * Internal helper for point compression
   */
  _compressPoints: (existingPoints: number[], newPoints: number[]) => number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache bounds — prevents memory leaks in long sessions
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum committed annotations kept in memory per slide session. Oldest evicted on overflow. */
export const MAX_ANNOTATIONS = 500;

/** Maximum concurrent live strokes (one per remote user). */
export const MAX_LIVE_STROKES = 50;

/** Maximum concurrent remote cursors tracked. */
export const MAX_CURSORS = 50;

/** Maximum concurrent laser pointer trails tracked. */
export const MAX_LASERS = 50;

export const LOW_MEMORY_MAX_ANNOTATIONS = 100;
export const LOW_MEMORY_MAX_LIVE_STROKES = 10;
export const LOW_MEMORY_MAX_CURSORS = 10;
export const LOW_MEMORY_MAX_LASERS = 10;

function getBounds() {
  const isLowMemory = useSettingsStore.getState().settings.lowMemoryMode;
  return {
    maxAnnotations: isLowMemory ? LOW_MEMORY_MAX_ANNOTATIONS : MAX_ANNOTATIONS,
    maxLiveStrokes: isLowMemory ? LOW_MEMORY_MAX_LIVE_STROKES : MAX_LIVE_STROKES,
    maxCursors: isLowMemory ? LOW_MEMORY_MAX_CURSORS : MAX_CURSORS,
    maxLasers: isLowMemory ? LOW_MEMORY_MAX_LASERS : MAX_LASERS,
  };
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

        // ── Point Compression Helper ──────────────────────────────────────
        // Only keep points if they are far enough from the last point
        // Or if it's the very first point.
        // Returns the filtered points array.
        _compressPoints: (existingPoints: number[], newPoints: number[]) => {
          if (newPoints.length === 0) return [];
          const threshold = 0.002; // 0.2% distance threshold
          const compressed = [];
          
          let lastX: number | null = existingPoints.length >= 2 ? (existingPoints[existingPoints.length - 2] ?? null) : null;
          let lastY: number | null = existingPoints.length >= 2 ? (existingPoints[existingPoints.length - 1] ?? null) : null;

          for (let i = 0; i < newPoints.length; i += 2) {
            const x = newPoints[i];
            const y = newPoints[i + 1];
            if (x === undefined || y === undefined) continue;

            if (lastX === null || lastY === null) {
              compressed.push(x, y);
              lastX = x;
              lastY = y;
            } else {
              const dx = x - lastX;
              const dy = y - lastY;
              const distSq = dx * dx + dy * dy;
              if (distSq > threshold * threshold) {
                compressed.push(x, y);
                lastX = x;
                lastY = y;
              }
            }
          }
          return compressed;
        },

        // ── Active stroke ─────────────────────────────────────────────────
        startStroke: (annotation) =>
          set((s) => {
            s.activeStroke = annotation;
          }),

        appendStrokePoints: (points) =>
          set((s) => {
            if (!s.activeStroke) return;
            if (s.activeStroke.data.tool === 'freehand') {
              const freehandData = s.activeStroke.data as { points: number[] };
              const compressed = (get() as any)._compressPoints(freehandData.points, points);
              if (compressed.length > 0) {
                freehandData.points.push(...compressed);
              }
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
            const bounds = getBounds();
            // Enforce bounded cache: evict oldest entry when at capacity
            const ids = Object.keys(s.annotations);
            if (ids.length >= bounds.maxAnnotations) {
              // Remove the oldest annotation (first key in insertion order)
              const oldestId = ids[0];
              if (oldestId) {
                delete s.annotations[oldestId];
                s.undoStack = s.undoStack.filter((id) => id !== oldestId);
                logger.warn('[AnnotationStore] MAX_ANNOTATIONS reached, evicting oldest', { evicted: oldestId });
              }
            }
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
            const bounds = getBounds();
            // Enforce bounded cache: evict oldest live stroke when at capacity
            const userIds = Object.keys(s.liveStrokes);
            if (userIds.length >= bounds.maxLiveStrokes && !s.liveStrokes[userId]) {
              const oldestUserId = userIds[0];
              if (oldestUserId) {
                delete s.liveStrokes[oldestUserId];
                logger.warn('[AnnotationStore] MAX_LIVE_STROKES reached, evicting', { evicted: oldestUserId });
              }
            }
            s.liveStrokes[userId] = stroke;
          }),

        appendLiveStrokePoints: (userId, points) =>
          set((s) => {
            if (s.liveStrokes[userId]) {
              const compressed = (get() as any)._compressPoints(s.liveStrokes[userId]!.points, points);
              if (compressed.length > 0) {
                s.liveStrokes[userId]!.points.push(...compressed);
              }
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
            const bounds = getBounds();
            // Enforce bounded cursor cache
            const cursorIds = Object.keys(s.cursors);
            if (cursorIds.length >= bounds.maxCursors && !s.cursors[userId]) {
              const oldest = cursorIds[0];
              if (oldest) delete s.cursors[oldest];
            }
            s.cursors[userId] = cursor;
          }),

        removeCursor: (userId) =>
          set((s) => {
            delete s.cursors[userId];
          }),

        // ── Laser pointers ─────────────────────────────────────────────────────
        updateLaser: (userId, laser) =>
          set((s) => {
            const bounds = getBounds();
            // Enforce bounded laser cache
            const laserIds = Object.keys(s.laserPointers);
            if (laserIds.length >= bounds.maxLasers && !s.laserPointers[userId]) {
              const oldest = laserIds[0];
              if (oldest) delete s.laserPointers[oldest];
            }
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
