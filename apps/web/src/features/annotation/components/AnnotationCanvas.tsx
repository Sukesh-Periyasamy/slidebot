import { useRef, useCallback, useEffect, memo } from 'react';
import { Stage, Layer, Line, Circle, Text, Arrow, Rect } from 'react-konva';
import { useShallow } from 'zustand/react/shallow';

import {
  useAnnotationStore,
  selectAnnotationList,
  selectActiveStroke,
  selectLiveStrokeList,
  selectCursorList,
  selectLaserList,
} from '../store/annotationStore';
import type {
  Annotation,
  LiveCursor,
  LaserPointerState,
  LiveStroke,
} from '../types/annotation.types';
import { useDrawing } from '../hooks/useDrawing';
import { useLaserPointer } from '../hooks/useLaserPointer';
import type { useAnnotationSync } from '../hooks/useAnnotationSync';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AnnotationCanvasProps {
  slideId: string;
  /** Pixel dimensions of the slide canvas underneath */
  width: number;
  height: number;
  sync: ReturnType<typeof useAnnotationSync>;
  canAnnotate?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// AnnotationCanvas — Konva stage overlaid on the PDF slide canvas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Layer strategy (bottom → top):
 * 1. annotations   — committed, persistent annotations
 * 2. liveStrokes   — remote users' in-progress strokes (no interaction)
 * 3. activeStroke  — current user's in-progress stroke (no interaction)
 * 4. cursors       — remote cursors + laser pointers (no interaction)
 */
export const AnnotationCanvas = memo(function AnnotationCanvas({
  slideId,
  width,
  height,
  sync,
  canAnnotate = true,
}: AnnotationCanvasProps) {
  if (import.meta.env.DEV) {
    console.count('ANNOTATION_CANVAS_RENDER');
  }

  const toolConfig = useAnnotationStore((s) => s.toolConfig);
  const annotations = useAnnotationStore(useShallow(selectAnnotationList));
  const activeStroke = useAnnotationStore(selectActiveStroke);
  const liveStrokes = useAnnotationStore(useShallow(selectLiveStrokeList));
  const cursors = useAnnotationStore(useShallow(selectCursorList));
  const lasers = useAnnotationStore(useShallow(selectLaserList));

  const drawing = useDrawing({ slideId, slideWidth: width, slideHeight: height, sync });
  const laser = useLaserPointer({ slideWidth: width, slideHeight: height, sync });

  // Denormalise helper: [0-1] → px
  const px = useCallback(
    (n: number, axis: 'x' | 'y') => n * (axis === 'x' ? width : height),
    [width, height]
  );
  const pxArr = useCallback(
    (pts: number[]) => {
      const out: number[] = [];
      for (let i = 0; i < pts.length; i += 2) {
        out.push(pts[i]! * width, pts[i + 1]! * height);
      }
      return out;
    },
    [width, height]
  );

  // Determine cursor style
  const cursor =
    toolConfig.tool === 'laser'
      ? 'crosshair'
      : toolConfig.tool === 'eraser'
        ? 'cell'
        : toolConfig.tool === 'select'
          ? 'default'
          : 'crosshair';

  if (width === 0 || height === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        cursor: canAnnotate ? cursor : 'default',
        pointerEvents: canAnnotate ? 'auto' : 'none',
      }}
    >
      <Stage
        width={width}
        height={height}
        onPointerDown={(e) => {
          if (!canAnnotate) return;
          if (laser.isLaserActive) laser.startLaser(e);
          else drawing.handlePointerDown(e);
        }}
        onPointerMove={(e) => {
          if (!canAnnotate) return;
          if (laser.isLaserActive) laser.moveLaser(e);
          else drawing.handlePointerMove(e);
        }}
        onPointerUp={(e) => {
          if (!canAnnotate) return;
          if (laser.isLaserActive) laser.endLaser();
          else drawing.handlePointerUp(e);
        }}
        onMouseMove={drawing.handleMouseMove}
      >
        {/* Layer 1: Committed annotations */}
        <Layer>
          {annotations.map((ann) => (
            <AnnotationShape key={ann.id} annotation={ann} pxArr={pxArr} px={px} />
          ))}
        </Layer>

        {/* Layer 2: Remote live strokes */}
        <Layer listening={false}>
          {liveStrokes.map((stroke) => (
            <LiveStrokeShape key={stroke.userId} stroke={stroke} pxArr={pxArr} />
          ))}
        </Layer>

        {/* Layer 3: Local active stroke */}
        <Layer listening={false}>
          {activeStroke && activeStroke.data.tool === 'freehand' && (
            <Line
              points={pxArr((activeStroke.data as { points: number[] }).points)}
              stroke={activeStroke.color}
              strokeWidth={activeStroke.strokeWidth}
              opacity={activeStroke.opacity}
              tension={0.4}
              lineCap="round"
              lineJoin="round"
              perfectDrawEnabled={false}
            />
          )}
        </Layer>

        {/* Layer 4: Cursors + Laser pointers */}
        <Layer listening={false}>
          {cursors.map((cursor) => (
            <RemoteCursor key={cursor.userId} cursor={cursor} px={px} />
          ))}
          {lasers.map((laser) => (
            <LaserTrail key={laser.userId} laser={laser} px={px} />
          ))}
        </Layer>
      </Stage>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// AnnotationShape — renders a committed annotation by tool type
// ─────────────────────────────────────────────────────────────────────────────

const AnnotationShape = memo(function AnnotationShape({
  annotation: ann,
  pxArr,
  px,
}: {
  annotation: Annotation;
  pxArr: (pts: number[]) => number[];
  px: (n: number, axis: 'x' | 'y') => number;
}) {
  const { data, color, strokeWidth, opacity } = ann;

  switch (data.tool) {
    case 'freehand':
      return (
        <Line
          points={pxArr(data.points)}
          stroke={color}
          strokeWidth={strokeWidth}
          opacity={opacity}
          tension={0.4}
          lineCap="round"
          lineJoin="round"
          perfectDrawEnabled={false}
          shadowEnabled={false}
        />
      );

    case 'highlight':
      return (
        <Rect
          x={px(data.x, 'x')}
          y={px(data.y, 'y')}
          width={px(data.width, 'x')}
          height={px(data.height, 'y')}
          fill={color}
          opacity={0.3}
          shadowEnabled={false}
        />
      );

    case 'arrow':
      return (
        <Arrow
          points={[
            px(data.startX, 'x'),
            px(data.startY, 'y'),
            px(data.endX, 'x'),
            px(data.endY, 'y'),
          ]}
          stroke={color}
          fill={color}
          strokeWidth={strokeWidth}
          opacity={opacity}
          pointerLength={10}
          pointerWidth={8}
          shadowEnabled={false}
        />
      );

    case 'text':
      return (
        <Text
          x={px(data.x, 'x')}
          y={px(data.y, 'y')}
          text={data.content}
          fontSize={px(data.fontSize, 'y')}
          fill={color}
          opacity={opacity}
          fontFamily="Inter, system-ui, sans-serif"
        />
      );

    default:
      return null;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LiveStrokeShape — remote user's in-progress stroke
// ─────────────────────────────────────────────────────────────────────────────

const LiveStrokeShape = memo(function LiveStrokeShape({
  stroke,
  pxArr,
}: {
  stroke: LiveStroke;
  pxArr: (pts: number[]) => number[];
}) {
  if (stroke.tool !== 'freehand' || stroke.points.length < 2) return null;
  return (
    <Line
      points={pxArr(stroke.points)}
      stroke={stroke.color}
      strokeWidth={stroke.strokeWidth}
      opacity={stroke.opacity * 0.8}
      tension={0.4}
      lineCap="round"
      lineJoin="round"
      perfectDrawEnabled={false}
      dash={[4, 2]}
    />
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// RemoteCursor — shows another user's cursor position
// ─────────────────────────────────────────────────────────────────────────────

function RemoteCursor({
  cursor,
  px,
}: {
  cursor: LiveCursor;
  px: (n: number, axis: 'x' | 'y') => number;
}) {
  const x = px(cursor.position.x, 'x');
  const y = px(cursor.position.y, 'y');

  return (
    <>
      <Circle x={x} y={y} radius={5} fill={cursor.color} opacity={0.9} />
      <Text
        x={x + 8}
        y={y - 8}
        text={cursor.displayName}
        fontSize={11}
        fill={cursor.color}
        fontStyle="600"
        fontFamily="Inter, system-ui, sans-serif"
        opacity={0.9}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LaserTrail — fading laser pointer trail
// ─────────────────────────────────────────────────────────────────────────────

function LaserTrail({
  laser,
  px,
}: {
  laser: LaserPointerState;
  px: (n: number, axis: 'x' | 'y') => number;
}) {
  if (laser.trail.length === 0) return null;

  const head = laser.trail[0]!;
  const trailPoints = laser.trail.slice(1).flatMap((pt) => [px(pt.x, 'x'), px(pt.y, 'y')]);

  if (trailPoints.length < 2) {
    return (
      <Circle
        x={px(head.x, 'x')}
        y={px(head.y, 'y')}
        radius={6}
        fill={laser.color}
        opacity={0.85}
      />
    );
  }

  return (
    <>
      {/* Trail line fading to transparent */}
      <Line
        points={[px(head.x, 'x'), px(head.y, 'y'), ...trailPoints]}
        stroke={laser.color}
        strokeWidth={3}
        opacity={0.5}
        tension={0.5}
        lineCap="round"
        shadowEnabled={false}
      />
      {/* Bright head dot */}
      <Circle
        x={px(head.x, 'x')}
        y={px(head.y, 'y')}
        radius={6}
        fill={laser.color}
        opacity={0.9}
        shadowBlur={8}
        shadowColor={laser.color}
      />
    </>
  );
}
