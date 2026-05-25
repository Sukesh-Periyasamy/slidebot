import { useEffect, useRef, useCallback, useMemo } from 'react';

import { useAuthStore } from '@/features/auth/store/authStore';
import { socketManager } from '@/features/collaboration/lib/socketManager';
import { assertSingleSocketListener } from '@/features/collaboration/lib/socketDebug';
import { logger } from '@/lib/logger';
import { RealtimeSchemas } from '@slidebot/shared-types';
import { useAnnotationStore } from '../store/annotationStore';
import type {
  Annotation,
  CursorPosition,
  LaserPointerState,
  LiveStroke,
} from '../types/annotation.types';

function throttle<T extends (...args: Parameters<T>) => void>(
  fn: T,
  ms: number
): { fn: (...args: Parameters<T>) => void; cancel: () => void } {
  let lastCall = 0;
  let rafId: number | null = null;

  const throttled = (...args: Parameters<T>) => {
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

  const cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return { fn: throttled, cancel };
}

interface UseAnnotationSyncOptions {
  sessionId: string;
  deckId: string;
  slideId: string;
  canAnnotate?: boolean;
  enabled?: boolean;
}

export function useAnnotationSync({
  sessionId,
  deckId,
  slideId,
  canAnnotate = true,
  enabled = true,
}: UseAnnotationSyncOptions) {
  const user = useAuthStore((s) => s.user);
  const socketRef = useRef<ReturnType<typeof socketManager.getCollaborationSocket> | null>(null);
  const toolConfig = useAnnotationStore((s) => s.toolConfig);

  const noop = useCallback(() => {}, []);
  const noopAnnotationPoints = useCallback((_points: number[]) => {}, []);
  const noopAnnotationEnd = useCallback((_annotation: Annotation) => {}, []);
  const noopStart = useCallback((_id: string, _tool: string, _point: CursorPosition) => {}, []);
  const noopDelete = useCallback((_annotationId: string) => {}, []);
  const noopCursorMove = useCallback((_position: CursorPosition) => {}, []);
  const noopLaserMove = useCallback((_trail: CursorPosition[]) => {}, []);

  if (!enabled) {
    return {
      emitAnnotationStart: noopStart,
      emitAnnotationPoints: noopAnnotationPoints,
      emitAnnotationEnd: noopAnnotationEnd,
      emitAnnotationDelete: noopDelete,
      emitCursorMove: noopCursorMove,
      emitLaserMove: noopLaserMove,
      emitLaserEnd: noop,
    };
  }

  useEffect(() => {
    if (!user?.id || !deckId || !slideId || !sessionId || !enabled) {
      return;
    }

    let unbind: (() => void) | undefined;
    let statusUnsub: (() => void) | undefined;

    const bindListeners = (socket: NonNullable<ReturnType<typeof socketManager.getCollaborationSocket>>) => {
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
        if (payload.userId === user.id || payload.slideId !== slideId) {
          return;
        }

        const stroke: LiveStroke = {
          annotationId: payload.annotationId,
          userId: payload.userId,
          color: payload.color,
          strokeWidth: payload.strokeWidth,
          opacity: payload.opacity,
          tool: payload.tool as Annotation['data']['tool'],
          points: [payload.initialPoint.x, payload.initialPoint.y],
        };

        useAnnotationStore.getState().setLiveStroke(payload.userId, stroke);
      };

      const onAnnotationDraw = (payload: { userId: string; slideId: string; points: number[] }) => {
        if (payload.userId === user.id || payload.slideId !== slideId) {
          return;
        }

        useAnnotationStore.getState().appendLiveStrokePoints(payload.userId, payload.points);
      };

      const onAnnotationEnd = (payload: {
        userId: string;
        slideId: string;
        annotation: Annotation;
      }) => {
        if (payload.userId === user.id || payload.slideId !== slideId) {
          return;
        }

        useAnnotationStore.getState().commitLiveStroke(payload.userId, payload.annotation);
      };

      const onAnnotationDelete = (payload: { slideId: string; annotationId: string }) => {
        if (payload.slideId !== slideId) {
          return;
        }

        useAnnotationStore.getState().removeAnnotation(payload.annotationId);
      };

      const onCursorUpdate = (payload: {
        userId: string;
        displayName: string;
        color: string;
        slideId: string;
        position: CursorPosition;
      }) => {
        if (payload.userId === user.id || payload.slideId !== slideId) {
          return;
        }

        useAnnotationStore.getState().updateCursor(payload.userId, {
          userId: payload.userId,
          displayName: payload.displayName,
          color: payload.color,
          position: payload.position,
          lastSeen: Date.now(),
        });
      };

      const onLaserUpdate = (payload: {
        userId: string;
        displayName: string;
        color: string;
        slideId: string;
        trail: CursorPosition[];
      }) => {
        if (payload.userId === user.id || payload.slideId !== slideId) {
          return;
        }

        useAnnotationStore.getState().updateLaser(payload.userId, {
          userId: payload.userId,
          displayName: payload.displayName,
          color: payload.color,
          trail: payload.trail,
          lastSeen: Date.now(),
        });
      };

      const onLaserEnd = (payload: { userId: string }) => {
        useAnnotationStore.getState().removeLaser(payload.userId);
      };

      const onUserLeft = (payload: { userId: string }) => {
        const current = useAnnotationStore.getState();
        current.removeCursor(payload.userId);
        current.removeLaser(payload.userId);
        current.removeLiveStroke(payload.userId);
      };

      socket.on('annotation_started', onAnnotationStart);
      socket.on('annotation_drew', onAnnotationDraw);
      socket.on('annotation_ended', onAnnotationEnd);
      socket.on('annotation_deleted', onAnnotationDelete);
      socket.on('cursor_update', onCursorUpdate);
      socket.on('laser_update', onLaserUpdate);
      socket.on('laser_ended', onLaserEnd);
      socket.on('user_left', onUserLeft);

      assertSingleSocketListener(socket, 'annotation_started', 'AnnotationSync');
      assertSingleSocketListener(socket, 'annotation_drew', 'AnnotationSync');
      assertSingleSocketListener(socket, 'annotation_ended', 'AnnotationSync');
      assertSingleSocketListener(socket, 'cursor_update', 'AnnotationSync');

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
    };

    const attachSocket = () => {
      const socket = socketManager.getCollaborationSocket();
      if (!socket) {
        return false;
      }

      socketRef.current = socket;
      const joinDeckPayload = { deckId, slideId };
      if (!RealtimeSchemas.joinDeck.safeParse(joinDeckPayload).success) {
        logger.warn('[AnnotationSync] Dropped invalid join_deck payload', joinDeckPayload);
        return false;
      }
      socket.emit('join_deck', joinDeckPayload, () => undefined);
      unbind = bindListeners(socket);
      return true;
    };

    if (!attachSocket()) {
      statusUnsub = socketManager.onStatusChange((status) => {
        if (status !== 'connected') {
          return;
        }

        if (attachSocket()) {
          statusUnsub?.();
          statusUnsub = undefined;
        }
      });
    }

    return () => {
      unbind?.();
      statusUnsub?.();
      socketRef.current = null;
    };
  }, [sessionId, deckId, slideId, user?.id]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const interval = setInterval(() => {
      const now = Date.now();
      const staleMs = 5000;
      const state = useAnnotationStore.getState();

      Object.entries(state.cursors).forEach(([userId, cursor]) => {
        if (now - cursor.lastSeen > staleMs) {
          state.removeCursor(userId);
        }
      });

      Object.entries(state.laserPointers).forEach(([userId, laser]) => {
        if (now - (laser as LaserPointerState).lastSeen > staleMs) {
          state.removeLaser(userId);
        }
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [enabled]);

  const emitAnnotationStart = useCallback(
    (annotationId: string, tool: string, initialPoint: CursorPosition) => {
      if (!enabled || !canAnnotate || !user || !socketRef.current) {
        return;
      }

      const payload = {
        sessionId,
        slideId,
        annotationId,
        tool,
        color: toolConfig.color,
        strokeWidth: toolConfig.strokeWidth,
        opacity: toolConfig.opacity,
        initialPoint,
      };
      if (!RealtimeSchemas.annotationStart.safeParse(payload).success) {
        logger.warn('[AnnotationSync] Dropped invalid annotation_start payload', payload);
        return;
      }
      socketRef.current.emit('annotation_start', payload);
    },
    [enabled, canAnnotate, user, sessionId, slideId, toolConfig]
  );

  const emitAnnotationPointsInner = useMemo(
    () =>
      throttle((points: number[]) => {
        if (!enabled || !canAnnotate || !user || !socketRef.current) {
          return;
        }

        const payload = { sessionId, slideId, points };
        if (!RealtimeSchemas.annotationDraw.safeParse(payload).success) {
          logger.warn('[AnnotationSync] Dropped invalid annotation_draw payload', payload);
          return;
        }
        socketRef.current.emit('annotation_draw', payload);
      }, 33),
    [enabled, canAnnotate, user, sessionId, slideId]
  );

  const emitAnnotationPoints = useCallback(
    (...args: Parameters<typeof emitAnnotationPointsInner.fn>) => emitAnnotationPointsInner.fn(...args),
    [emitAnnotationPointsInner]
  );

  useEffect(() => () => emitAnnotationPointsInner.cancel(), [emitAnnotationPointsInner]);

  const emitAnnotationEnd = useCallback(
    (annotation: Annotation) => {
      if (!enabled || !canAnnotate || !user || !socketRef.current) {
        return;
      }

      const payload = { sessionId, slideId, annotation };
      if (!RealtimeSchemas.annotationEnd.safeParse(payload).success) {
        logger.warn('[AnnotationSync] Dropped invalid annotation_end payload', payload);
        return;
      }
      socketRef.current.emit('annotation_end', payload);
    },
    [enabled, canAnnotate, user, sessionId, slideId]
  );

  const emitAnnotationDelete = useCallback(
    (annotationId: string) => {
      if (!enabled || !canAnnotate || !user || !socketRef.current) {
        return;
      }

      const payload = { sessionId, slideId, annotationId };
      if (!RealtimeSchemas.annotationDelete.safeParse(payload).success) {
        logger.warn('[AnnotationSync] Dropped invalid annotation_delete payload', payload);
        return;
      }
      socketRef.current.emit('annotation_delete', payload);
    },
    [enabled, canAnnotate, user, sessionId, slideId]
  );

  const emitCursorMoveInner = useMemo(
    () =>
      throttle((position: CursorPosition) => {
        if (!enabled || !user || !socketRef.current) {
          return;
        }

        const payload = { deckId, sessionId, slideId, position };
        if (!RealtimeSchemas.cursorMove.safeParse(payload).success) {
          logger.warn('[AnnotationSync] Dropped invalid cursor_move payload', payload);
          return;
        }
        socketRef.current.emit('cursor_move', payload);
      }, 33),
    [enabled, user, deckId, sessionId, slideId]
  );

  const emitCursorMove = useCallback(
    (...args: Parameters<typeof emitCursorMoveInner.fn>) => emitCursorMoveInner.fn(...args),
    [emitCursorMoveInner]
  );

  useEffect(() => () => emitCursorMoveInner.cancel(), [emitCursorMoveInner]);

  const emitLaserMoveInner = useMemo(
    () =>
      throttle((trail: CursorPosition[]) => {
        if (!enabled || !canAnnotate || !user || !socketRef.current) {
          return;
        }

        const payload = { sessionId, slideId, trail };
        if (!RealtimeSchemas.laserMove.safeParse(payload).success) {
          logger.warn('[AnnotationSync] Dropped invalid laser_move payload', payload);
          return;
        }
        socketRef.current.emit('laser_move', payload);
      }, 16),
    [enabled, canAnnotate, user, sessionId, slideId]
  );

  const emitLaserMove = useCallback(
    (...args: Parameters<typeof emitLaserMoveInner.fn>) => emitLaserMoveInner.fn(...args),
    [emitLaserMoveInner]
  );

  useEffect(() => () => emitLaserMoveInner.cancel(), [emitLaserMoveInner]);

  const emitLaserEnd = useCallback(() => {
    if (!enabled || !socketRef.current) {
      return;
    }

    const payload = { sessionId, slideId };
    if (!RealtimeSchemas.laserEnd.safeParse(payload).success) {
      logger.warn('[AnnotationSync] Dropped invalid laser_end payload', payload);
      return;
    }
    socketRef.current.emit('laser_end', payload);
  }, [enabled, sessionId, slideId]);

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
