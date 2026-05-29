import type { Server } from 'socket.io';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@slidebot/shared-types';

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

let ioInstance: IoServer | null = null;

/**
 * Store the Socket.IO server instance for use outside of socket handlers.
 * Called during server initialization.
 */
export function setIoInstance(io: IoServer): void {
  ioInstance = io;
}

/**
 * Retrieve the Socket.IO server instance.
 * Returns null if the server hasn't been initialized yet.
 */
export function getIoInstance(): IoServer | null {
  return ioInstance;
}
