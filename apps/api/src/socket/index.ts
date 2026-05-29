import type { Server as HttpServer } from 'http';

import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import customParser from 'socket.io-msgpack-parser';

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
import { registerPresenterHandlers } from './namespaces/presenter';
import { setIoInstance } from './io-instance';

/**
 * Initialize Socket.IO server.
 * When `options.useRedis` is true, attaches the Redis adapter for horizontal scaling.
 * Otherwise uses the default in-memory adapter (single-instance only).
 */
export function initializeSocket(
  httpServer: HttpServer,
  options: { useRedis?: boolean } = {}
): Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> {
  const { useRedis = true } = options;

  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS,
      credentials: true,
    },
    // Prefer WebSocket, fall back to polling
    transports: ['websocket', 'polling'],
    // Ping timeout / interval — relaxed in dev to reduce Redis pub/sub commands
    pingTimeout: env.NODE_ENV === 'development' ? 30_000 : 20_000,
    pingInterval: env.NODE_ENV === 'development' ? 25_000 : 10_000,
    // Limit payload size (protect against large Yjs updates)
    maxHttpBufferSize: 5 * 1024 * 1024, // 5MB
    // Binary transport parser
    parser: customParser,
  });

  // Store the io instance for use outside socket handlers (e.g., conversion queue events)
  setIoInstance(io);

  // ── Redis adapter (required for multi-instance scaling) ───────────────────
  if (useRedis) {
    const pubClient = getRedisClient();
    const subClient = pubClient.duplicate();
    
    // Redis outage fallback mode
    let isRedisHealthy = true;
    const setRedisAdapter = () => io.adapter(createAdapter(pubClient, subClient));
    
    pubClient.on('error', (err) => {
      if (isRedisHealthy) {
        logger.error({ err }, 'Redis pub client error, falling back to memory adapter');
        isRedisHealthy = false;
        io.adapter(); // Reverts to the default memory adapter
      }
    });

    pubClient.on('ready', () => {
      if (!isRedisHealthy) {
        logger.info('Redis recovered, restoring Redis adapter');
        isRedisHealthy = true;
        setRedisAdapter();
      }
    });

    setRedisAdapter();
    logger.info('Socket.IO Redis adapter configured with fallback');
  } else {
    logger.warn('Socket.IO using in-memory adapter (no Redis — single instance only)');
  }

  // ── Global middleware ─────────────────────────────────────────────────────
  io.use(socketAuthMiddleware);

  // ── Namespaces ────────────────────────────────────────────────────────────

  // /collaboration — real-time deck editing, presence, Yjs sync, annotations
  const collabNs = io.of('/collaboration');
  collabNs.use(socketAuthMiddleware);
  registerCollaborationHandlers(collabNs);

  // /presenter — presentation lifecycle and navigation
  const presenterNs = io.of('/presenter');
  presenterNs.use(socketAuthMiddleware);
  registerPresenterHandlers(presenterNs);

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
