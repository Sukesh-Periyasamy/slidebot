import type { Server as HttpServer } from 'http';

import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@slidebot/shared-types';

import { getRedisClient } from '../config/redis';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { socketAuthMiddleware } from './middleware/socketAuth';
import { registerCollaborationHandlers } from './namespaces/collaboration';

/**
 * Initialize Socket.IO server with Redis adapter for horizontal scaling.
 * Attaches to the existing HTTP server.
 */
export function initializeSocket(httpServer: HttpServer): Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    httpServer,
    {
      cors: {
        origin: env.CORS_ORIGINS,
        credentials: true,
      },
      // Prefer WebSocket, fall back to polling
      transports: ['websocket', 'polling'],
      // Ping timeout / interval
      pingTimeout: 20_000,
      pingInterval: 10_000,
      // Limit payload size (protect against large Yjs updates)
      maxHttpBufferSize: 5 * 1024 * 1024, // 5MB
    }
  );

  // ── Redis adapter (required for multi-instance scaling) ───────────────────
  const pubClient = getRedisClient();
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));
  logger.info('Socket.IO Redis adapter configured');

  // ── Global middleware ─────────────────────────────────────────────────────
  io.use(socketAuthMiddleware);

  // ── Namespaces ────────────────────────────────────────────────────────────

  // /collaboration — real-time deck editing, presence, Yjs sync, annotations
  const collabNs = io.of('/collaboration');
  collabNs.use(socketAuthMiddleware);
  registerCollaborationHandlers(collabNs);

  // Health / connection logging
  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Default namespace connection');
    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'Socket disconnected');
    });
  });

  logger.info('Socket.IO server initialized');

  return io;
}
