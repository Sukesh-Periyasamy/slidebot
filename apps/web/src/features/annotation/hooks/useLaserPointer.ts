import { useCallback, useEffect, useRef } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';

import { useAuthStore } from '@/features/auth/store/authStore';
import { useAnnotationStore } from '../store/annotationStore';
import type { CursorPosition } from '../types/annotation.types';
import type { useAnnotationSync } from './useAnnotationSync';

const MAX_TRAIL_LENGTH = 20;
const LASER_FADE_MS = 1500;

interface UseLaserPointerOptions {
  slideWidth: number;
  slideHeight: number;
  sync: ReturnType<typeof useAnnotationSync>;
}

/**
 * useLaserPointer — ephemeral laser pointer with a fading trail.
 *
 * The trail is an array of normalised positions [newest → oldest].
 * Each position fades out after LASER_FADE_MS, creating a natural
 * "glow" trail effect rendered in Konva.
 */
export function useLaserPointer({ slideWidth, slideHeight, sync }: UseLaserPointerOptions) {
  const user = useAuthStore((s) => s.user);
  const updateLaser = useAnnotationStore((s) => s.updateLaser);
  const removeLaser = useAnnotationStore((s) => s.removeLaser);
  const toolConfig = useAnnotationStore((s) => s.toolConfig);

  const trailRef = useRef<CursorPosition[]>([]);
  const isActiveRef = useRef(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLaserActive = toolConfig.tool === 'laser';

  // Normalise pixel → [0-1]
  const normalise = useCallback((x: number, y: number): CursorPosition => ({
    x: x / slideWidth,
    y: y / slideHeight,
  }), [slideWidth, slideHeight]);

  const startLaser = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      if (!isLaserActive || !user) return;
      e.evt.preventDefault();

      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      isActiveRef.current = true;
      const norm = normalise(pos.x, pos.y);
      trailRef.current = [norm];

      // Update local store (for self-preview)
      updateLaser(user.id, {
        userId: user.id,
        displayName: user.displayName,
        color: toolConfig.color,
        trail: [norm],
        lastSeen: Date.now(),
      });
    },
    [isLaserActive, user, updateLaser, toolConfig.color, normalise]
  );

  const moveLaser = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      if (!isActiveRef.current || !isLaserActive || !user) return;

      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      const norm = normalise(pos.x, pos.y);

      // Prepend newest position, cap trail length
      trailRef.current = [norm, ...trailRef.current].slice(0, MAX_TRAIL_LENGTH);

      const laser = {
        userId: user.id,
        displayName: user.displayName,
        color: toolConfig.color,
        trail: trailRef.current,
        lastSeen: Date.now(),
      };

      updateLaser(user.id, laser);
      sync.emitLaserMove(trailRef.current);
    },
    [isLaserActive, user, updateLaser, toolConfig.color, sync, normalise]
  );

  const endLaser = useCallback(() => {
    if (!isActiveRef.current || !user) return;
    isActiveRef.current = false;

    // Fade trail out
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      removeLaser(user.id);
      trailRef.current = [];
      sync.emitLaserEnd();
    }, LASER_FADE_MS);
  }, [user, removeLaser, sync]);

  // Cleanup fade timer on unmount
  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  return {
    startLaser,
    moveLaser,
    endLaser,
    isLaserActive,
  };
}
