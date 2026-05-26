import type { Socket } from 'socket.io-client';

import { socketManager } from '@/features/collaboration/lib/socketManager';
import { presenceManager } from '@/features/presence/lib/presenceManager';
import { usePresenceStore } from '@/features/presence/store/presenceStore';
import { logger } from '@/lib/logger';
import { assertSingleSocketListener } from '@/features/collaboration/lib/socketDebug';

import { useCursorStore } from '../store/cursorStore';

interface CursorUpdatePayload {
  userId: string;
  deckId: string;
  slideId: string;
  position: { x: number; y: number };
}

class CursorManager {
  private started = false;
  private boundSocket: Socket | null = null;
  private cleanup: (() => void) | null = null;
  private rafId: number | null = null;
  private unsubscribers: Array<() => void> = [];
  private stats = {
    bindCount: 0,
    cursorUpdateCount: 0,
    reconnectCount: 0,
    cleanupCount: 0,
    lastHydrationAt: 0,
  };

  start(): void {
    if (this.started) return;
    this.started = true;

    this.unsubscribers.push(
      socketManager.onStatusChange((status) => {
        if (status === 'reconnecting') {
          this.stats.reconnectCount += 1;
        }

        if (status === 'connected' || status === 'reconnecting') {
          this.bindSocket();
        }

        if (status === 'disconnected' || status === 'error') {
          useCursorStore.getState().reset();
        }
      })
    );

    this.bindSocket();
    this.startFrameLoop();
    logger.debug('[CursorManager] Started');
  }

  reset(): void {
    this.cleanup?.();
    this.cleanup = null;
    this.boundSocket = null;
    this.stopFrameLoop();
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    this.started = false;
    useCursorStore.getState().reset();
    this.stats.cleanupCount += 1;
  }

  removeCursor(userId: string): void {
    useCursorStore.getState().removeCursor(userId);
  }

  private bindSocket(): void {
    const socket = socketManager.getCollaborationSocket();
    if (!socket || this.boundSocket === socket) {
      return;
    }

    this.cleanup?.();
    this.boundSocket = socket;
    this.stats.bindCount += 1;

    const onCursorUpdate = (payload: CursorUpdatePayload) => {
      this.stats.cursorUpdateCount += 1;
      const presence = useCursorStore.getState().cursors[payload.userId];
      const now = Date.now();
      useCursorStore.getState().upsertCursor({
        userId: payload.userId,
        displayName: presence?.displayName ?? payload.userId,
        color: presence?.color ?? '#94a3b8',
        slideId: payload.slideId,
        x: payload.position.x,
        y: payload.position.y,
        targetX: payload.position.x,
        targetY: payload.position.y,
        velocityX: 0,
        velocityY: 0,
        updatedAt: now,
        lastSeenAt: now,
        cursorPulseAt: now,
        isOffscreen: payload.position.x < 0 || payload.position.x > 1 || payload.position.y < 0 || payload.position.y > 1,
      });
      presenceManager.touchParticipant(payload.userId, {
        slideId: payload.slideId,
        cursorPulseAt: now,
      });
    };

    const onParticipantLeft = (payload: { userId: string }) => {
      useCursorStore.getState().removeCursor(payload.userId);
    };

    const onParticipantReconnected = (payload: { userId: string }) => {
      presenceManager.setParticipantReconnecting(payload.userId, false);
    };

    // Ensure no duplicate listeners are present (can happen during dev hot-reloads
    // or React strict-mode double mounts). Clear existing listeners for these
    // events before attaching to guarantee a single listener.
    // Attempt targeted removal of listeners owned by this module before
    // attaching. This avoids removing listeners owned by other systems
    // while ensuring we don't attach duplicates during hot-reloads.
    try {
      socket.off('cursor_update', onCursorUpdate);
      socket.off('participant:left', onParticipantLeft);
      socket.off('participant:reconnected', onParticipantReconnected);
    } catch (err) {
      // Ignore non-fatal errors from socket implementations.
    }

    socket.on('cursor_update', onCursorUpdate);
    socket.on('participant:left', onParticipantLeft);
    socket.on('participant:reconnected', onParticipantReconnected);

    assertSingleSocketListener(socket, 'cursor_update', 'CursorManager');

    this.cleanup = () => {
      socket.off('cursor_update', onCursorUpdate);
      socket.off('participant:left', onParticipantLeft);
      socket.off('participant:reconnected', onParticipantReconnected);
      // hydrate stats snapshot timestamp
      this.stats.lastHydrationAt = Date.now();
    };

    // Hydrate cursors from presence snapshot on new socket bind
    this.hydrateFromPresence();
  }

  private hydrateFromPresence(): void {
    try {
      const participants = usePresenceStore.getState().participants;
      const now = Date.now();
      Object.values(participants).forEach((p) => {
        if (!p || !p.userId) return;
        // Only hydrate participants that report a slide context
        if (!p.slideId) return;

        // Do not overwrite an existing recent cursor
        const existing = useCursorStore.getState().cursors[p.userId];
        if (existing && now - existing.lastSeenAt < 5_000) return;

        useCursorStore.getState().upsertCursor({
          userId: p.userId,
          displayName: p.displayName,
          color: p.color,
          slideId: p.slideId,
          x: existing?.x ?? 0.5,
          y: existing?.y ?? 0.5,
          targetX: existing?.targetX ?? 0.5,
          targetY: existing?.targetY ?? 0.5,
          velocityX: 0,
          velocityY: 0,
          updatedAt: now,
          lastSeenAt: p.lastSeenAt ?? now,
          cursorPulseAt: p.cursorPulseAt ?? null,
          isOffscreen: true,
        });
      });
      this.stats.lastHydrationAt = now;
    } catch (err) {
      logger.debug('[CursorManager] Hydration failed', err);
    }
  }

  getStats() {
    return { ...this.stats };
  }

  private startFrameLoop(): void {
    const tick = () => {
      useCursorStore.getState().advanceFrame(Date.now());
      this.rafId = window.requestAnimationFrame(tick);
    };

    this.stopFrameLoop();
    if (typeof window !== 'undefined') {
      this.rafId = window.requestAnimationFrame(tick);
    }
  }

  private stopFrameLoop(): void {
    if (this.rafId !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

export const cursorManager = new CursorManager();
