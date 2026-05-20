import { useEffect, useRef, useCallback } from 'react';
import { nanoid } from 'nanoid';

import { useAuthStore } from '@/features/auth/store/authStore';
import { getCollaborationSocket } from '@/features/collaboration/lib/socketClient';
import { useAnnotationStore } from '../store/annotationStore';
import type {
  Annotation,
  CursorPosition,
  LaserPointerState,
  LiveStroke,
} from '../types/annotation.types';

// ─────────────────────────────────────────────────────────────────────────────
// Throttle helper (no lodash dependency)
// ─────────────────────────────────────────────────────────────────────────────

function throttle<T extends (...args: Parameters<T>) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let rafId: number | null = null;

  return (...args: Parameters<T>) => {
    const now = performance.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      fn(...args);
    } else if (!rafId) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        lastCall = performance.now();
        fn(...args);
      });
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useAnnotationSync — Socket.IO ↔ annotation store bridge
// ─────────────────────────────────────────────────────────────────────────────

interface UseAnnotationSyncOptions {
  sessionId: string;
  slideId: string;
  /** Whether this user can annotate (false for view-only sessions) */
  canAnnotate?: boolean;
}

export function useAnnotationSync({
  sessionId,
  slideId,
  canAnnotate = true,
}: UseAnnotationSyncOptions) {
  const user = useAuthStore((s) => s.user);
  const store = useAnnotationStore();
  const socketRef = useRef(getCollaborationSocket());

  // ── Incoming events (remote → local store) ────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;

    // Another user started drawing
    const onAnnotationStart = (payload: {
      annotationId: string;
      userId: string;
      displayName: string;
      color: string;
      strokeWidth: number;
      opacity: number;
      tool: string;
      slideId: string;
      initialPoint: CursorPosition;
    }) => {
      if (payload.userId === user?.id) return; // Ignore own events
      if (payload.slideId !== slideId) return;

      const stroke: LiveStroke = {
        annotationId: payload.annotationId,
        userId: payload.userId,
        color: payload.color,
        strokeWidth: payload.strokeWidth,
        opacity: payload.opacity,
        tool: payload.tool as Annotation['data']['tool'],
        points: [payload.initialPoint.x, payload.initialPoint.y],
      };
      store.setLiveStroke(payload.userId, stroke);
    };

    // Incremental points from a remote user
    const onAnnotationDraw = (payload: { userId: string; slideId: string; points: number[] }) => {
      if (payload.userId === user?.id) return;
      if (payload.slideId !== slideId) return;
      store.appendLiveStrokePoints(payload.userId, payload.points);
    };

    // Remote user committed their annotation
    const onAnnotationEnd = (payload: {
      userId: string;
      slideId: string;
      annotation: Annotation;
    }) => {
      if (payload.userId === user?.id) return;
      if (payload.slideId !== slideId) return;
      store.commitLiveStroke(payload.userId, payload.annotation);
    };

    // Annotation deleted
    const onAnnotationDelete = (payload: { slideId: string; annotationId: string }) => {
      if (payload.slideId !== slideId) return;
      store.removeAnnotation(payload.annotationId);
    };

    // Remote cursor position update
    const onCursorUpdate = (payload: {
      userId: string;
      displayName: string;
      color: string;
      slideId: string;
      position: CursorPosition;
    }) => {
      if (payload.userId === user?.id) return;
      if (payload.slideId !== slideId) return;

      store.updateCursor(payload.userId, {
        userId: payload.userId,
        displayName: payload.displayName,
        color: payload.color,
        position: payload.position,
        lastSeen: Date.now(),
      });
    };

    // Laser pointer update
    const onLaserUpdate = (payload: {
      userId: string;
      displayName: string;
      color: string;
      slideId: string;
      trail: CursorPosition[];
    }) => {
      if (payload.userId === user?.id) return;
      if (payload.slideId !== slideId) return;

      store.updateLaser(payload.userId, {
        userId: payload.userId,
        displayName: payload.displayName,
        color: payload.color,
        trail: payload.trail,
        lastSeen: Date.now(),
      });
    };

    const onLaserEnd = (payload: { userId: string }) => {
      store.removeLaser(payload.userId);
    };

    // User left — clean up their cursor and strokes
    const onUserLeft = (payload: { userId: string }) => {
      store.removeCursor(payload.userId);
      store.removeLaser(payload.userId);
      store.removeLiveStroke(payload.userId);
    };

    socket.on('annotation_started', onAnnotationStart);
    socket.on('annotation_drew', onAnnotationDraw);
    socket.on('annotation_ended', onAnnotationEnd);
    socket.on('annotation_deleted', onAnnotationDelete);
    socket.on('cursor_update', onCursorUpdate);
    socket.on('laser_update', onLaserUpdate);
    socket.on('laser_ended', onLaserEnd);
    socket.on('user_left', onUserLeft);

    return () => {
      socket.off('annotation_started', onAnnotationStart);
      socket.off('annotation_drew', onAnnotationDraw);
      socket.off('annotation_ended', onAnnotationEnd);
      socket.off('annotation_deleted', onAnnotationDelete);
      socket.off('cursor_update', onCursorUpdate);
      socket.off('laser_update', onLaserUpdate);
      socket.off('laser_ended', onLaserEnd);
      socket.off('user_left', onUserLeft);
    };
  }, [sessionId, slideId, user?.id, store]);

  // ── Stale cursor cleanup (every 5s) ──────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const STALE_MS = 5000;

      Object.entries(store.cursors).forEach(([userId, cursor]) => {
        if (now - cursor.lastSeen > STALE_MS) store.removeCursor(userId);
      });

      Object.entries(store.laserPointers).forEach(([userId, laser]) => {
        if (now - (laser as LaserPointerState).lastSeen > STALE_MS) store.removeLaser(userId);
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [store]);

  // ── Outgoing emitters (local → socket) ───────────────────────────────────

  const emitAnnotationStart = useCallback(
    (annotationId: string, tool: string, initialPoint: CursorPosition) => {
      if (!canAnnotate || !user) return;
      socketRef.current.emit('annotation_start', {
        sessionId,
        slideId,
        annotationId,
        tool,
        color: store.toolConfig.color,
        strokeWidth: store.toolConfig.strokeWidth,
        opacity: store.toolConfig.opacity,
        initialPoint,
      });
    },
    [canAnnotate, user, sessionId, slideId, store.toolConfig]
  );

  const emitAnnotationPoints = useCallback(
    throttle((points: number[]) => {
      if (!canAnnotate || !user) return;
      socketRef.current.emit('annotation_draw', { sessionId, slideId, points });
    }, 33), // ~30fps
    [canAnnotate, user, sessionId, slideId]
  );

  const emitAnnotationEnd = useCallback(
    (annotation: Annotation) => {
      if (!canAnnotate || !user) return;
      socketRef.current.emit('annotation_end', { sessionId, slideId, annotation });
    },
    [canAnnotate, user, sessionId, slideId]
  );

  const emitAnnotationDelete = useCallback(
    (annotationId: string) => {
      if (!canAnnotate || !user) return;
      socketRef.current.emit('annotation_delete', { sessionId, slideId, annotationId });
    },
    [canAnnotate, user, sessionId, slideId]
  );

  const emitCursorMove = useCallback(
    throttle((position: CursorPosition) => {
      if (!user) return;
      socketRef.current.emit('cursor_move', { sessionId, slideId, position });
    }, 33), // ~30fps
    [user, sessionId, slideId]
  );

  const emitLaserMove = useCallback(
    throttle((trail: CursorPosition[]) => {
      if (!canAnnotate || !user) return;
      socketRef.current.emit('laser_move', { sessionId, slideId, trail });
    }, 16), // ~60fps for laser
    [canAnnotate, user, sessionId, slideId]
  );

  const emitLaserEnd = useCallback(() => {
    socketRef.current.emit('laser_end', { sessionId, slideId });
  }, [sessionId, slideId]);

  return {
    emitAnnotationStart,
    emitAnnotationPoints,
    emitAnnotationEnd,
    emitAnnotationDelete,
    emitCursorMove,
    emitLaserMove,
    emitLaserEnd,
  };
}
