// ─────────────────────────────────────────────────────────────────────────────
// OffscreenAnnotationCanvas — Worker-based annotation rendering with Konva fallback
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useCallback, useEffect, useState, memo } from 'react';
import { nanoid } from 'nanoid';

import { useAuthStore } from '@/features/auth/store/authStore';
import { useAnnotationStore } from '../store/annotationStore';
import { MainThreadBridge } from '../lib/mainThreadBridge';
import { AnnotationCanvas } from './AnnotationCanvas';
import type { useAnnotationSync } from '../hooks/useAnnotationSync';
import type {
  SerializedAnnotation,
  SerializedAnnotationData,
  StrokeConfig,
} from '../types/renderCommand.types';
import type {
  Annotation,
  CursorPosition,
} from '../types/annotation.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface OffscreenAnnotationCanvasProps {
  slideId: string;
  width: number;
  height: number;
  sync: ReturnType<typeof useAnnotationSync>;
  canAnnotate?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — Convert store Annotation to worker SerializedAnnotation
// ─────────────────────────────────────────────────────────────────────────────

function serializeAnnotationData(data: Annotation['data']): SerializedAnnotationData | null {
  switch (data.tool) {
    case 'freehand':
      return { tool: 'freehand', points: new Float64Array(data.points) };
    case 'highlight':
      return { tool: 'highlight', x: data.x, y: data.y, width: data.width, height: data.height };
    case 'arrow':
      return {
        tool: 'arrow',
        startX: data.startX,
        startY: data.startY,
        endX: data.endX,
        endY: data.endY,
      };
    case 'text':
      return { tool: 'text', x: data.x, y: data.y, content: data.content, fontSize: data.fontSize };
    default:
      // 'laser' tool is not rendered by the worker
      return null;
  }
}

function serializeAnnotation(ann: Annotation): SerializedAnnotation | null {
  const data = serializeAnnotationData(ann.data);
  if (!data) return null;
  return {
    id: ann.id,
    tool: data.tool,
    color: ann.color,
    strokeWidth: ann.strokeWidth,
    opacity: ann.opacity,
    data,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalise helper
// ─────────────────────────────────────────────────────────────────────────────

function normalise(
  clientX: number,
  clientY: number,
  rect: DOMRect
): CursorPosition {
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OffscreenAnnotationCanvas
// ─────────────────────────────────────────────────────────────────────────────

export const OffscreenAnnotationCanvas = memo(function OffscreenAnnotationCanvas({
  slideId,
  width,
  height,
  sync,
  canAnnotate = true,
}: OffscreenAnnotationCanvasProps) {
  const bridgeRef = useRef<MainThreadBridge | null>(null);
  const workerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Drawing state refs (avoid re-renders during high-frequency pointer events)
  const isDrawingRef = useRef(false);
  const pointsRef = useRef<number[]>([]);
  const activeAnnotationIdRef = useRef<string | null>(null);

  const user = useAuthStore((s) => s.user);
  const toolConfig = useAnnotationStore((s) => s.toolConfig);

  // ─── Initialize bridge on mount ──────────────────────────────────────────

  useEffect(() => {
    const workerCanvas = workerCanvasRef.current;
    const compositingCanvas = compositingCanvasRef.current;
    if (!workerCanvas || !compositingCanvas) return;

    const bridge = new MainThreadBridge();
    bridgeRef.current = bridge;

    let cancelled = false;

    const initBridge = async () => {
      try {
        bridge.setCompositingCanvas(compositingCanvas);
        await bridge.init(workerCanvas);

        if (cancelled) {
          bridge.destroy();
          return;
        }

        if (!bridge.isOffscreen) {
          // OffscreenCanvas not supported — fall back to Konva
          setUseFallback(true);
        } else {
          // Send initial resize
          bridge.sendResize(width, height);
          setInitialized(true);
        }
      } catch (err) {
        console.error('[OffscreenAnnotationCanvas] Bridge init failed, falling back to Konva:', err);
        if (!cancelled) {
          setUseFallback(true);
        }
      }
    };

    initBridge();

    return () => {
      cancelled = true;
      bridge.destroy();
      bridgeRef.current = null;
      setInitialized(false);
    };
    // Only run on mount/unmount — width/height changes handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Handle resize ───────────────────────────────────────────────────────

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge || !initialized || useFallback) return;
    bridge.sendResize(width, height);
  }, [width, height, initialized, useFallback]);

  // ─── Subscribe to annotation store — forward annotation changes ──────────

  useEffect(() => {
    if (!initialized || useFallback) return;
    const bridge = bridgeRef.current;
    if (!bridge) return;

    // Track previous annotation IDs to detect additions/removals
    let prevAnnotationIds = new Set<string>();

    const unsubAnnotations = useAnnotationStore.subscribe(
      (state) => state.annotations,
      (annotations) => {
        const currentIds = new Set(Object.keys(annotations));

        // Detect removed annotations
        for (const id of prevAnnotationIds) {
          if (!currentIds.has(id)) {
            bridge.send({ type: 'ANNOTATION_REMOVE', annotationId: id });
          }
        }

        // Detect added/updated annotations
        for (const id of currentIds) {
          const ann = annotations[id];
          if (!ann) continue;
          const serialized = serializeAnnotation(ann);
          if (serialized) {
            bridge.send({ type: 'ANNOTATION_UPDATE', annotation: serialized });
          }
        }

        prevAnnotationIds = currentIds;
      }
    );

    return unsubAnnotations;
  }, [initialized, useFallback]);

  // ─── Subscribe to slide changes ──────────────────────────────────────────

  useEffect(() => {
    if (!initialized || useFallback) return;
    const bridge = bridgeRef.current;
    if (!bridge) return;

    // Send initial slide state
    const state = useAnnotationStore.getState();
    const annotations = Object.values(state.annotations)
      .map(serializeAnnotation)
      .filter((a): a is SerializedAnnotation => a !== null);
    bridge.sendSlideChange(slideId, annotations);
  }, [slideId, initialized, useFallback]);

  // ─── Subscribe to live strokes ───────────────────────────────────────────

  useEffect(() => {
    if (!initialized || useFallback) return;
    const bridge = bridgeRef.current;
    if (!bridge) return;

    let prevLiveStrokeUserIds = new Set<string>();

    const unsubLiveStrokes = useAnnotationStore.subscribe(
      (state) => state.liveStrokes,
      (liveStrokes) => {
        const currentUserIds = new Set(Object.keys(liveStrokes));

        // Detect removed live strokes
        for (const userId of prevLiveStrokeUserIds) {
          if (!currentUserIds.has(userId)) {
            bridge.send({ type: 'LIVE_STROKE_REMOVE', userId });
          }
        }

        // Detect added/updated live strokes
        for (const userId of currentUserIds) {
          const stroke = liveStrokes[userId];
          if (!stroke || stroke.tool !== 'freehand') continue;
          bridge.send({
            type: 'LIVE_STROKE_UPDATE',
            userId,
            points: new Float64Array(stroke.points),
          });
        }

        prevLiveStrokeUserIds = currentUserIds;
      }
    );

    return unsubLiveStrokes;
  }, [initialized, useFallback]);

  // ─── Subscribe to laser pointers ────────────────────────────────────────

  useEffect(() => {
    if (!initialized || useFallback) return;
    const bridge = bridgeRef.current;
    if (!bridge) return;

    let prevLaserUserIds = new Set<string>();

    const unsubLasers = useAnnotationStore.subscribe(
      (state) => state.laserPointers,
      (laserPointers) => {
        const currentUserIds = new Set(Object.keys(laserPointers));

        // Detect removed lasers
        for (const userId of prevLaserUserIds) {
          if (!currentUserIds.has(userId)) {
            bridge.send({ type: 'LASER_REMOVE', userId });
          }
        }

        // Detect added/updated lasers
        for (const userId of currentUserIds) {
          const laser = laserPointers[userId];
          if (!laser || laser.trail.length === 0) continue;
          // Flatten trail positions into Float64Array [x0, y0, x1, y1, ...]
          const trailArray = new Float64Array(laser.trail.length * 2);
          for (let i = 0; i < laser.trail.length; i++) {
            trailArray[i * 2] = laser.trail[i]!.x;
            trailArray[i * 2 + 1] = laser.trail[i]!.y;
          }
          bridge.send({
            type: 'LASER_UPDATE',
            userId,
            color: laser.color,
            trail: trailArray,
          });
        }

        prevLaserUserIds = currentUserIds;
      }
    );

    return unsubLasers;
  }, [initialized, useFallback]);

  // ─── Subscribe to degradation mode changes ───────────────────────────────

  useEffect(() => {
    if (!initialized || useFallback) return;
    const bridge = bridgeRef.current;
    if (!bridge) return;

    const unsubDegradation = useAnnotationStore.subscribe(
      (state) => state.degradationMode,
      (mode) => {
        bridge.send({ type: 'SET_DEGRADATION_MODE', mode });
      }
    );

    return unsubDegradation;
  }, [initialized, useFallback]);

  // ─── Detect worker becoming unresponsive (bridge sets isOffscreen=false) ─

  useEffect(() => {
    if (!initialized || useFallback) return;

    const checkInterval = setInterval(() => {
      const bridge = bridgeRef.current;
      if (bridge && !bridge.isOffscreen) {
        // Worker became unresponsive — fall back to Konva
        setUseFallback(true);
        clearInterval(checkInterval);
      }
    }, 2000);

    return () => clearInterval(checkInterval);
  }, [initialized, useFallback]);

  // ─── Pointer event handlers for active stroke ────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!canAnnotate || !user) return;
      if (toolConfig.tool === 'select' || toolConfig.tool === 'laser' || toolConfig.tool === 'eraser') return;

      const bridge = bridgeRef.current;
      if (!bridge) return;

      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const norm = normalise(e.clientX, e.clientY, rect);

      const annotationId = nanoid();
      activeAnnotationIdRef.current = annotationId;
      isDrawingRef.current = true;
      pointsRef.current = [norm.x, norm.y];

      // Send ACTIVE_STROKE_START to worker
      const config: StrokeConfig = {
        tool: 'freehand',
        color: toolConfig.color,
        strokeWidth: toolConfig.strokeWidth,
        opacity: toolConfig.opacity,
      };
      bridge.send({ type: 'ACTIVE_STROKE_START', config });
      bridge.send({ type: 'ACTIVE_STROKE_POINTS', points: new Float64Array([norm.x, norm.y]) });

      // Also emit to sync for remote users
      sync.emitAnnotationStart(annotationId, toolConfig.tool, norm);
    },
    [canAnnotate, user, toolConfig, sync]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;

      const bridge = bridgeRef.current;
      if (!bridge) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const norm = normalise(e.clientX, e.clientY, rect);

      pointsRef.current.push(norm.x, norm.y);

      // Send points to worker
      bridge.send({ type: 'ACTIVE_STROKE_POINTS', points: new Float64Array([norm.x, norm.y]) });

      // Emit to sync for remote users
      sync.emitAnnotationPoints([norm.x, norm.y]);
      sync.emitCursorMove(norm);
    },
    [sync]
  );

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      const bridge = bridgeRef.current;
      if (!bridge) return;

      const annotationId = activeAnnotationIdRef.current;
      if (!annotationId) return;

      // Commit the stroke in the worker
      bridge.send({ type: 'ACTIVE_STROKE_COMMIT', annotationId });

      // Also commit in the local store for persistence
      const store = useAnnotationStore.getState();
      // Build the annotation for the store
      const annotation: Annotation = {
        id: annotationId,
        slideId,
        userId: user?.id ?? '',
        displayName: user?.displayName ?? '',
        color: toolConfig.color,
        strokeWidth: toolConfig.strokeWidth,
        opacity: toolConfig.opacity,
        isEphemeral: false,
        status: 'committed',
        createdAt: new Date().toISOString(),
        data: { tool: 'freehand', points: [...pointsRef.current] },
      };
      store.addAnnotation(annotation);
      sync.emitAnnotationEnd(annotation);

      activeAnnotationIdRef.current = null;
      pointsRef.current = [];
    },
    [slideId, user, toolConfig, sync]
  );

  const handlePointerCancel = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const bridge = bridgeRef.current;
    if (bridge) {
      bridge.send({ type: 'ACTIVE_STROKE_CANCEL' });
    }

    activeAnnotationIdRef.current = null;
    pointsRef.current = [];
  }, []);

  // ─── Replay controls (exposed for parent components) ─────────────────────

  // These could be exposed via a ref or context if needed by parent components.
  // For now, they respond to store-level replay state changes.

  // ─── Render ──────────────────────────────────────────────────────────────

  // If fallback is needed, render the existing Konva AnnotationCanvas
  if (useFallback) {
    return (
      <AnnotationCanvas
        slideId={slideId}
        width={width}
        height={height}
        sync={sync}
        canAnnotate={canAnnotate}
      />
    );
  }

  // Determine cursor style
  const cursor =
    toolConfig.tool === 'laser'
      ? 'crosshair'
      : toolConfig.tool === 'eraser'
        ? 'cell'
        : toolConfig.tool === 'select'
          ? 'default'
          : 'crosshair';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: canAnnotate ? 'auto' : 'none',
      }}
    >
      {/* Worker canvas — transferred to OffscreenCanvas, hidden after init */}
      <canvas
        ref={workerCanvasRef}
        width={width}
        height={height}
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      {/* Compositing canvas — visible, receives ImageBitmap frames from worker */}
      <canvas
        ref={compositingCanvasRef}
        width={width}
        height={height}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          cursor: canAnnotate ? cursor : 'default',
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        role="img"
        aria-label="Annotation layer"
      />
    </div>
  );
});
