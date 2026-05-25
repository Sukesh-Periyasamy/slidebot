import { useCallback, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import type { KonvaEventObject } from 'konva/lib/Node';

import { useAuthStore } from '@/features/auth/store/authStore';
import { useAnnotationStore, selectToolConfig } from '../store/annotationStore';
import type { Annotation, CursorPosition, FreehandData } from '../types/annotation.types';
import type { useAnnotationSync } from './useAnnotationSync';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface UseDrawingOptions {
  slideId: string;
  /** Slide canvas dimensions (CSS pixels) — used for normalisation */
  slideWidth: number;
  slideHeight: number;
  sync: ReturnType<typeof useAnnotationSync>;
}

// ─────────────────────────────────────────────────────────────────────────────
// useDrawing — handles pointer events on the Konva stage for annotation tools
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts absolute canvas pixel coords to normalised [0-1] coords
 * relative to slide dimensions.
 */
function normalise(x: number, y: number, w: number, h: number): CursorPosition {
  return { x: x / w, y: y / h };
}

export function useDrawing({ slideId, slideWidth, slideHeight, sync }: UseDrawingOptions) {
  const user = useAuthStore((s) => s.user);
  const toolConfig = useAnnotationStore(selectToolConfig);
  const store = useAnnotationStore();

  const isDrawingRef = useRef(false);
  const activeAnnotationIdRef = useRef<string | null>(null);
  const pointsRef = useRef<number[]>([]);

  // ── Pointer event handlers ────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      if (!user) return;
      if (toolConfig.tool === 'select' || toolConfig.tool === 'laser') return;

      // Prevent context menu etc.
      e.evt.preventDefault();

      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      const normalised = normalise(pos.x, pos.y, slideWidth, slideHeight);
      const annotationId = nanoid();
      activeAnnotationIdRef.current = annotationId;
      isDrawingRef.current = true;
      pointsRef.current = [normalised.x, normalised.y];

      // Build initial annotation
      const annotation: Annotation = {
        id: annotationId,
        slideId,
        userId: user.id,
        displayName: user.displayName,
        color: toolConfig.color,
        strokeWidth: toolConfig.strokeWidth,
        opacity: toolConfig.opacity,
        isEphemeral: (toolConfig.tool as string) === 'laser',
        status: 'in-progress',
        createdAt: new Date().toISOString(),
        data: buildInitialData(toolConfig.tool as Annotation['data']['tool'], normalised),
      };

      store.startStroke(annotation);
      sync.emitAnnotationStart(annotationId, toolConfig.tool, normalised);
    },
    [user, toolConfig, slideId, slideWidth, slideHeight, store, sync]
  );

  const handlePointerMove = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      if (!isDrawingRef.current) return;

      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      const norm = normalise(pos.x, pos.y, slideWidth, slideHeight);

      // Append points to active stroke (freehand)
      if (toolConfig.tool === 'freehand' || toolConfig.tool === 'highlight') {
        pointsRef.current.push(norm.x, norm.y);
        // We do NOT write to Zustand here to avoid React render storms.
        // Instead, the AnnotationCanvas component reads from pointsRef directly.
        sync.emitAnnotationPoints([norm.x, norm.y]);
      }

      // Emit cursor position regardless of tool
      sync.emitCursorMove(norm);
    },
    [toolConfig.tool, slideWidth, slideHeight, store, sync]
  );

  const handlePointerUp = useCallback(
    (_e: KonvaEventObject<PointerEvent>) => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      // Commit final points back to the store before committing the stroke
      if (toolConfig.tool === 'freehand' || toolConfig.tool === 'highlight') {
        store.updateActiveStrokePoints(pointsRef.current);
      }

      const committed = store.commitStroke();
      if (committed) {
        sync.emitAnnotationEnd(committed);
      }
      activeAnnotationIdRef.current = null;
      pointsRef.current = [];
    },
    [store, sync]
  );

  // Track cursor even when not drawing
  const handleMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (isDrawingRef.current) return; // Already handled in pointer move
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const norm = normalise(pos.x, pos.y, slideWidth, slideHeight);
      sync.emitCursorMove(norm);
    },
    [slideWidth, slideHeight, sync]
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleMouseMove,
    isDrawing: isDrawingRef,
    pointsRef,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildInitialData(
  tool: Annotation['data']['tool'],
  pos: CursorPosition
): Annotation['data'] {
  switch (tool) {
    case 'freehand':
      return { tool: 'freehand', points: [pos.x, pos.y] } satisfies FreehandData;
    case 'highlight':
      return { tool: 'highlight', x: pos.x, y: pos.y, width: 0, height: 0 };
    case 'arrow':
      return { tool: 'arrow', startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y };
    case 'text':
      return { tool: 'text', x: pos.x, y: pos.y, content: '', fontSize: 0.03 };
    case 'laser':
      return { tool: 'laser', points: [pos.x, pos.y] };
    default:
      return { tool: 'freehand', points: [pos.x, pos.y] };
  }
}
