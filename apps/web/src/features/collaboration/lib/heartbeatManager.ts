import type { Socket } from 'socket.io-client';

import { logger } from '@/lib/logger';
import { assertSingleSocketListener } from './socketDebug';
import { useRealtimeDebugStore } from '@/features/debug/store/realtimeDebugStore';

export interface HeartbeatHealth {
  latencyMs: number | null;
  lastPongAt: number | null;
  isHealthy: boolean;
}

type HeartbeatListener = (state: HeartbeatHealth) => void;

class HeartbeatManager {
  private socket: Socket | null = null;
  private cleanup: (() => void) | null = null;
  private listeners = new Set<HeartbeatListener>();
  private state: HeartbeatHealth = {
    latencyMs: null,
    lastPongAt: null,
    isHealthy: true,
  };

  attach(socket: Socket | null): void {
    if (!socket) {
      this.detach();
      this.update({ isHealthy: false });
      return;
    }

    if (this.socket === socket) {
      return;
    }

    this.detach();
    this.socket = socket;

    const onPing = (payload: { ts?: number }) => {
      const now = Date.now();
      const latencyMs = typeof payload?.ts === 'number' ? Math.max(0, now - payload.ts) : null;

      if (latencyMs !== null && import.meta.env.DEV) {
        useRealtimeDebugStore.getState().recordPing(latencyMs);
      }

      socket.emit('app:pong');
      this.update({ latencyMs, lastPongAt: now, isHealthy: true });
    };

    const onDisconnect = () => {
      this.update({ isHealthy: false });
    };

    const onConnect = () => {
      this.update({ isHealthy: true });
    };

    socket.on('app:ping', onPing);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    assertSingleSocketListener(socket, 'app:ping', 'HeartbeatManager');

    this.cleanup = () => {
      socket.off('app:ping', onPing);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
    };

    logger.debug('[HeartbeatManager] Attached heartbeat listeners');
  }

  detach(): void {
    this.cleanup?.();
    this.cleanup = null;
    this.socket = null;
  }

  getState(): HeartbeatHealth {
    return this.state;
  }

  subscribe(listener: HeartbeatListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  markUnhealthy(): void {
    this.update({ isHealthy: false });
  }

  private update(patch: Partial<HeartbeatHealth>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener(this.state));
  }
}

export const heartbeatManager = new HeartbeatManager();
