/**
 * Compatibility wrapper around centralized managers.
 *
 * New architecture ownership:
 * - socket lifecycle: socketManager
 * - heartbeat lifecycle: heartbeatManager (bound during socket init)
 * - session membership/lifecycle: sessionManager
 */
import type { Socket } from 'socket.io-client';

import { socketManager, type ConnectionStatus } from './socketManager';

export type { ConnectionStatus };

export async function connectSocket(): Promise<void> {
  await socketManager.ensureConnected();
}

export function disconnectSocket(): void {
  socketManager.disconnect();
}

export function getPresenterSocket(): Socket | null {
  return socketManager.getPresenterSocket();
}

export function getCollaborationSocket(): Socket | null {
  return socketManager.getCollaborationSocket();
}

export function getConnectionStatus(): ConnectionStatus {
  return socketManager.getStatus();
}

export function isReconnect(): boolean {
  return socketManager.hasReconnected();
}

export function onStatusChange(fn: (status: ConnectionStatus) => void): () => void {
  return socketManager.onStatusChange(fn);
}

export function onReconnectAttemptsChange(fn: (attempts: number) => void): () => void {
  return socketManager.onReconnectAttemptsChange(fn);
}
