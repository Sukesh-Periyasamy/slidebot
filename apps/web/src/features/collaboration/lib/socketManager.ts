import { io, type Socket } from 'socket.io-client';
import type { Subscription } from '@supabase/supabase-js';
import customParser from 'socket.io-msgpack-parser';

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { heartbeatManager } from './heartbeatManager';
import { useRealtimeDebugStore } from '@/features/debug/store/realtimeDebugStore';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

type StatusListener = (status: ConnectionStatus) => void;
type ReconnectAttemptsListener = (attempts: number) => void;

const API_URL = (import.meta.env['VITE_API_URL'] as string) ?? 'http://localhost:4000';

function buildSocketOptions(token: string) {
  return {
    auth: { token },
    transports: ['websocket', 'polling'] as ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 20_000,
    reconnectionAttempts: 15,
    randomizationFactor: 0.3,
    timeout: 10_000,
    pingTimeout: 30_000,
    pingInterval: 25_000,
    parser: customParser,
  };
}

class SocketManager {
  private presenterSocket: Socket | null = null;
  private collaborationSocket: Socket | null = null;
  private authSubscription: Subscription | null = null;
  private status: ConnectionStatus = 'disconnected';
  private statusListeners = new Set<StatusListener>();
  private reconnectListeners = new Set<ReconnectAttemptsListener>();
  private reconnectAttempts = 0;
  private hasConnectedOnce = false;
  private connectPromise: Promise<void> | null = null;
  private lifecycleBoundSocket: Socket | null = null;

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onReconnectAttemptsChange(listener: ReconnectAttemptsListener): () => void {
    this.reconnectListeners.add(listener);
    return () => this.reconnectListeners.delete(listener);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  hasReconnected(): boolean {
    return this.hasConnectedOnce && this.reconnectAttempts > 0;
  }

  getPresenterSocket(): Socket | null {
    return this.presenterSocket;
  }

  getCollaborationSocket(): Socket | null {
    return this.collaborationSocket;
  }

  async ensureConnected(): Promise<void> {
    if (this.presenterSocket && this.collaborationSocket) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.connectInternal().finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  async forceReconnect(): Promise<void> {
    this.disconnect();
    await this.ensureConnected();
  }

  disconnect(): void {
    this.authSubscription?.unsubscribe();
    this.authSubscription = null;

    this.presenterSocket?.disconnect();
    this.collaborationSocket?.disconnect();
    heartbeatManager.detach();

    this.presenterSocket = null;
    this.collaborationSocket = null;
    this.lifecycleBoundSocket = null;
    this.reconnectAttempts = 0;
    this.hasConnectedOnce = false;
    this.emitReconnectAttempts(0);
    this.emitStatus('disconnected');
  }

  private async connectInternal(): Promise<void> {
    this.emitStatus('connecting');

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      logger.error('[SocketManager] Failed to resolve auth session:', error.message);
      this.emitStatus('error');
      throw error;
    }

    const token = data.session?.access_token;
    if (!token) {
      const err = new Error('Missing auth token for socket connection');
      logger.error('[SocketManager] No auth token; skipping socket connect');
      this.emitStatus('error');
      throw err;
    }

    const options = buildSocketOptions(token);
    const presenterSocket = io(`${API_URL}/presenter`, options);
    const collaborationSocket = io(`${API_URL}/collaboration`, options);

    this.presenterSocket = presenterSocket;
    this.collaborationSocket = collaborationSocket;

    if (import.meta.env.DEV) {
      const debugStore = useRealtimeDebugStore.getState();
      const trackIncoming = (event: string, ...args: any[]) => {
        debugStore.incrementEvents('received');
        debugStore.incrementBytes('received', JSON.stringify(args).length);
      };
      const trackOutgoing = (event: string, ...args: any[]) => {
        debugStore.incrementEvents('sent');
        debugStore.incrementBytes('sent', JSON.stringify(args).length);
      };

      presenterSocket.onAny(trackIncoming);
      presenterSocket.onAnyOutgoing(trackOutgoing);
      collaborationSocket.onAny(trackIncoming);
      collaborationSocket.onAnyOutgoing(trackOutgoing);
    }

    this.bindLifecycleListeners(presenterSocket, collaborationSocket);
    this.bindAuthRefresh(presenterSocket, collaborationSocket);
    heartbeatManager.attach(presenterSocket);
  }

  private bindLifecycleListeners(presenterSocket: Socket, collaborationSocket: Socket): void {
    if (this.lifecycleBoundSocket === presenterSocket) {
      return;
    }

    this.lifecycleBoundSocket = presenterSocket;

    presenterSocket.on('connect', () => {
      const wasReconnect = this.hasConnectedOnce;
      this.hasConnectedOnce = true;
      this.emitReconnectAttempts(0);
      this.emitStatus('connected');
      logger.info(
        `[SocketManager] /presenter ${wasReconnect ? 're' : ''}connected`,
        presenterSocket.id
      );
    });

    presenterSocket.on('disconnect', (reason) => {
      logger.warn('[SocketManager] /presenter disconnected:', reason);
      if (reason === 'io client disconnect') {
        this.emitStatus('disconnected');
        return;
      }
      this.emitStatus('reconnecting');
    });

    presenterSocket.io.on('reconnect_attempt', (attempt) => {
      this.emitReconnectAttempts(attempt);
      this.emitStatus('reconnecting');
      logger.debug(`[SocketManager] Reconnect attempt ${attempt}`);
    });

    presenterSocket.io.on('reconnect', (attempt) => {
      this.emitReconnectAttempts(0);
      this.emitStatus('connected');
      logger.info(`[SocketManager] Reconnected after ${attempt} attempts`);
    });

    presenterSocket.io.on('reconnect_failed', () => {
      logger.error('[SocketManager] Reconnect failed after max attempts');
      this.emitStatus('error');
    });

    presenterSocket.on('connect_error', (err) => {
      logger.error('[SocketManager] /presenter connect error:', err.message);
      if (!this.hasConnectedOnce) {
        this.emitStatus('error');
      }
    });

    collaborationSocket.on('connect', () => {
      logger.debug('[SocketManager] /collaboration connected', collaborationSocket.id);
    });

    collaborationSocket.on('disconnect', (reason) => {
      logger.warn('[SocketManager] /collaboration disconnected:', reason);
    });
  }

  private bindAuthRefresh(presenterSocket: Socket, collaborationSocket: Socket): void {
    this.authSubscription?.unsubscribe();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextToken = session?.access_token;

      if (!nextToken) {
        this.disconnect();
        return;
      }

      presenterSocket.auth = { token: nextToken };
      collaborationSocket.auth = { token: nextToken };
      logger.debug('[SocketManager] Auth token refreshed for sockets');
    });

    this.authSubscription = subscription;
  }

  private emitStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
    if (import.meta.env.DEV) {
      useRealtimeDebugStore.getState().updateMetrics({
        socketStatus: status === 'connecting' || status === 'error' ? 'disconnected' : status,
      });
    }
  }

  private emitReconnectAttempts(attempts: number): void {
    this.reconnectAttempts = attempts;
    this.reconnectListeners.forEach((listener) => listener(attempts));
  }
}

export const socketManager = new SocketManager();
