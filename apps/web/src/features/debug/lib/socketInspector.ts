import { heartbeatManager } from '@/features/collaboration/lib/heartbeatManager';
import { socketManager } from '@/features/collaboration/lib/socketManager';

export interface SocketSnapshot {
  scope: 'presenter' | 'collaboration';
  id: string | null;
  connected: boolean;
  listeners: number;
}

export interface SocketInspectorSnapshot {
  status: string;
  reconnectAttempts: number;
  hasReconnected: boolean;
  heartbeatHealthy: boolean;
  sockets: SocketSnapshot[];
}

export function inspectSockets(): SocketInspectorSnapshot {
  const presenterSocket = socketManager.getPresenterSocket();
  const collaborationSocket = socketManager.getCollaborationSocket();

  return {
    status: socketManager.getStatus(),
    reconnectAttempts: socketManager.getReconnectAttempts(),
    hasReconnected: socketManager.hasReconnected(),
    heartbeatHealthy: heartbeatManager.getState().isHealthy,
    sockets: [
      {
        scope: 'presenter',
        id: presenterSocket?.id ?? null,
        connected: presenterSocket?.connected ?? false,
        listeners: presenterSocket ? presenterSocket.listeners('connect').length + presenterSocket.listeners('disconnect').length : 0,
      },
      {
        scope: 'collaboration',
        id: collaborationSocket?.id ?? null,
        connected: collaborationSocket?.connected ?? false,
        listeners: collaborationSocket ? collaborationSocket.listeners('connect').length + collaborationSocket.listeners('disconnect').length : 0,
      },
    ],
  };
}
