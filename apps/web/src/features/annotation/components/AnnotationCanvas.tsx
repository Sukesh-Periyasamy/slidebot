import { useRef, useCallback, useEffect, memo, useState } from 'react';
import { recordRenderCount } from '@/features/debug/lib/renderInspector';
import { Stage, Layer, Line, Circle, Text, Arrow, Rect, Group } from 'react-konva';
import { useShallow } from 'zustand/react/shallow';

import {
  useAnnotationStore,
  selectAnnotationList,
  selectActiveStroke,
  selectLiveStrokeList,
  selectLaserList,
} from '../store/annotationStore';
import { useSettingsStore } from '@/features/settings/store/settingsStore';
import type {
  Annotation,
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
 * 4. lasers        — remote laser pointers (no interaction)
 */
export const AnnotationCanvas = memo(function AnnotationCanvas({
  slideId,
  width,
  height,
  sync,
  canAnnotate = true,
}: AnnotationCanvasProps) {
  if (import.meta.env.DEV) {
    recordRenderCount('ANNOTATION_CANVAS_RENDER');
  }

  const toolConfig = useAnnotationStore((s) => s.toolConfig);
  const annotations = useAnnotationStore(useShallow(selectAnnotationList));
  const activeStroke = useAnnotationStore(selectActiveStroke);
  const liveStrokes = useAnnotationStore(useShallow(selectLiveStrokeList));
  const lasers = useAnnotationStore(useShallow(selectLaserList));
  const [hoveredAnnotation, setHoveredAnnotation] = useState<{ id: string, userId: string, displayName?: string, x: number, y: number } | null>(null);

  const { showCursors, showParticipantActivity, annotationSmoothing, cursorAnimation } = useSettingsStore(
    (s) => s.settings
  );

  const drawing = useDrawing({ slideId, slideWidth: width, slideHeight: height, sync });
  const laser = useLaserPointer({ slideWidth: width, slideHeight: height, sync });
  const activeLineRef = useRef<any>(null);

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

  // High-frequency render loop for active stroke
  useEffect(() => {
    let frameId: number;
    const renderLoop = () => {
      if (
        drawing.isDrawing.current &&
        activeLineRef.current &&
        activeStroke?.data.tool === 'freehand'
      ) {
        const currentPoints = drawing.pointsRef.current;
        if (currentPoints.length >= 2) {
          activeLineRef.current.points(pxArr(currentPoints));
        }
      }
      frameId = requestAnimationFrame(renderLoop);
    };
    frameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(frameId);
  }, [drawing.isDrawing, drawing.pointsRef, activeStroke, pxArr]);

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
            <AnnotationShape 
              key={ann.id} 
              annotation={ann} 
              pxArr={pxArr} 
              px={px} 
              onHover={(x, y) => setHoveredAnnotation({ id: ann.id, userId: ann.userId, displayName: ann.displayName, x, y })}
              onUnhover={() => setHoveredAnnotation(null)}
            />
          ))}
        </Layer>

        {/* Layer 2: Remote live strokes */}
        {showParticipantActivity && (
          <Layer listening={false}>
            {liveStrokes.map((stroke) => (
              <LiveStrokeShape key={stroke.userId} stroke={stroke} pxArr={pxArr} smoothing={annotationSmoothing} />
            ))}
          </Layer>
        )}

        {/* Layer 3: Local active stroke */}
        <Layer listening={false}>
          {activeStroke && activeStroke.data.tool === 'freehand' && (
            <Line
              ref={activeLineRef}
              points={pxArr((activeStroke.data as { points: number[] }).points)}
              stroke={activeStroke.color}
              strokeWidth={activeStroke.strokeWidth}
              opacity={activeStroke.opacity}
              tension={annotationSmoothing ? 0.4 : 0}
              lineCap="round"
              lineJoin="round"
              perfectDrawEnabled={false}
            />
          )}
        </Layer>

        {/* Layer 4: Laser pointers */}
        <Layer listening={false}>
          {showCursors && lasers.map((laser) => (
            <LaserTrail key={laser.userId} laser={laser} px={px} animated={cursorAnimation} />
          ))}
          {/* Tooltip for annotation hover */}
          {hoveredAnnotation && (
            <Group x={hoveredAnnotation.x + 10} y={hoveredAnnotation.y + 10}>
              <Rect
                x={0}
                y={0}
                width={80} // Approx, could be dynamic
                height={24}
                fill="#1f2937"
                cornerRadius={4}
                opacity={0.85}
              />
              <Text
                x={8}
                y={6}
                text={hoveredAnnotation.displayName || hoveredAnnotation.userId.substring(0, 8)}
                fontSize={12}
                fill="#f9fafb"
              />
            </Group>
          )}
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
  onHover,
  onUnhover,
}: {
  annotation: Annotation;
  pxArr: (pts: number[]) => number[];
  px: (n: number, axis: 'x' | 'y') => number;
  onHover: (x: number, y: number) => void;
  onUnhover: () => void;
  smoothing?: boolean;
}) {
  const { data, color, strokeWidth, opacity } = ann;
  const smoothing = useSettingsStore((s) => s.settings.annotationSmoothing);

  const handleMouseEnter = (e: any) => {
    const pos = e.target.getStage()?.getPointerPosition();
    if (pos) onHover(pos.x, pos.y);
  };

  switch (data.tool) {
    case 'freehand':
      return (
        <Line
          points={pxArr(data.points)}
          stroke={color}
          strokeWidth={Math.max(strokeWidth, 8)} // Thicker hit area
          opacity={opacity}
          tension={smoothing ? 0.4 : 0}
          lineCap="round"
          lineJoin="round"
          perfectDrawEnabled={false}
          shadowEnabled={false}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={onUnhover}
          hitStrokeWidth={12} // Generous hit area
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
          onMouseEnter={handleMouseEnter}
          onMouseLeave={onUnhover}
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
          strokeWidth={Math.max(strokeWidth, 8)}
          opacity={opacity}
          pointerLength={10}
          pointerWidth={8}
          shadowEnabled={false}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={onUnhover}
          hitStrokeWidth={12}
        />
      );

    case 'text':
      return (
        <Text
          x={px(data.x, 'x')}
          y={px(data.y, 'y')}
          text={data.content}
          fill={color}
          fontSize={px(data.fontSize, 'y')}
          opacity={opacity}
          shadowEnabled={false}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={onUnhover}
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
  smoothing,
}: {
  stroke: LiveStroke;
  pxArr: (pts: number[]) => number[];
  smoothing: boolean;
}) {
  if (stroke.tool !== 'freehand' || stroke.points.length < 2) return null;
  return (
    <Line
      points={pxArr(stroke.points)}
      stroke={stroke.color}
      strokeWidth={stroke.strokeWidth}
      opacity={stroke.opacity * 0.8}
      tension={smoothing ? 0.4 : 0}
      lineCap="round"
      lineJoin="round"
      perfectDrawEnabled={false}
      dash={[4, 2]}
    />
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// LaserTrail — fading laser pointer trail
// ─────────────────────────────────────────────────────────────────────────────

function LaserTrail({
  laser,
  px,
  animated,
}: {
  laser: LaserPointerState;
  px: (n: number, axis: 'x' | 'y') => number;
  animated: boolean;
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
      {animated && (
        <Line
          points={[px(head.x, 'x'), px(head.y, 'y'), ...trailPoints]}
          stroke={laser.color}
          strokeWidth={3}
          opacity={0.5}
          tension={0.5}
          lineCap="round"
          shadowEnabled={false}
        />
      )}
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
