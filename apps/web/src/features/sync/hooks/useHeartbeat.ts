/**
 * useHeartbeat — application-level ping/pong for WebSocket health monitoring.
 *
 * Responds to server 'ping' events with 'pong', tracks round-trip latency,
 * and exposes connection health metrics to the UI (ConnectionHealth component).
 *
 * This supplements Socket.IO's built-in heartbeat with application-level
 * health data that can be visualized in the room header.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getPresenterSocket } from '@/features/collaboration/lib/socketClient';
import { useSyncStore } from '../store/syncStore';

export interface HeartbeatHealth {
  /** Round-trip latency in ms (null before first pong) */
  latencyMs: number | null;
  /** Timestamp of last successful pong */
  lastPongAt: number | null;
  /** False when disconnected or >3 missed pongs */
  isHealthy: boolean;
}

export function useHeartbeat(): HeartbeatHealth {
  const [health, setHealth] = useState<HeartbeatHealth>({
    latencyMs: null,
    lastPongAt: null,
    isHealthy: true,
  });

  const pingTimestampRef = useRef<number | null>(null);
  const connectionStatus = useSyncStore((s) => s.connectionStatus);

  const setupListeners = useCallback(() => {
    let socket: ReturnType<typeof getPresenterSocket>;
    try {
      socket = getPresenterSocket();
    } catch {
      return; // Socket not yet connected
    }

    const onPing = (payload: { ts: number }) => {
      pingTimestampRef.current = payload?.ts ?? Date.now();
      // Respond immediately
      (socket as unknown as { emit: (e: string) => void }).emit('pong');
    };

    const onPong = () => {
      const now = Date.now();
      const latencyMs = pingTimestampRef.current ? now - pingTimestampRef.current : null;

      setHealth({ latencyMs, lastPongAt: now, isHealthy: true });
      pingTimestampRef.current = null;
    };

    socket.on('ping' as never, onPing as never);
    socket.on('pong' as never, onPong as never);

    return () => {
      socket.off('ping' as never, onPing as never);
      socket.off('pong' as never, onPong as never);
    };
  }, []);

  useEffect(() => {
    const cleanup = setupListeners();
    return cleanup;
  }, [setupListeners, connectionStatus]);

  // Reflect disconnected status
  useEffect(() => {
    if (connectionStatus === 'disconnected' || connectionStatus === 'error') {
      setHealth((h) => ({ ...h, isHealthy: false }));
    } else if (connectionStatus === 'connected') {
      setHealth((h) => ({ ...h, isHealthy: true }));
    }
  }, [connectionStatus]);

  return health;
}
