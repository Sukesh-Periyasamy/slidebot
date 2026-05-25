import 'dotenv/config';

import { createServer } from 'http';

import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { initializeSocket } from './socket';
import { connectRedis, getRedisClient } from './config/redis';
import { connectDatabase } from './config/database';
import { instanceManager } from './socket/instance-manager';
import { startPersistenceWorker, stopPersistenceWorker } from './modules/annotations/persistence-worker';
import { startCompactionWorker, stopCompactionWorker } from './modules/annotations/compaction-worker';

/**
 * SlideBot API Server entry point
 * Bootstraps: Express app → Socket.IO → Redis → HTTP server
 */
async function bootstrap(): Promise<void> {
  try {
    logger.info('Starting SlideBot API server...');

    // 1. Connect to database (Prisma + Supabase)
    await connectDatabase();
    logger.info('✅ Database connected');

    // 2. Connect to Redis (Socket.IO adapter + cache)
    await connectRedis();
    logger.info('✅ Redis connected');

    // Start instance heartbeat
    instanceManager.startHeartbeat();

    // 3. Create Express app
    const app = createApp();

    // 4. Create HTTP server (required for Socket.IO)
    const httpServer = createServer(app);

    // 5. Initialize Socket.IO on the HTTP server
    initializeSocket(httpServer);
    logger.info('✅ Socket.IO initialized');

    // Start BullMQ persistence worker
    startPersistenceWorker();
    startCompactionWorker();

    // 7. Start listening
    httpServer.listen(env.PORT, env.HOST, () => {
      logger.info(
        { port: env.PORT, host: env.HOST, nodeEnv: env.NODE_ENV },
        `🚀 SlideBot API running on http://${env.HOST}:${env.PORT}`
      );
    });

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info({ signal }, 'Received shutdown signal, closing gracefully...');
      
      await stopPersistenceWorker();
      await stopCompactionWorker();
      instanceManager.stopHeartbeat();
      
      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      // Force kill after 10s
      setTimeout(() => process.exit(1), 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, 'Fatal error during bootstrap');
    process.exit(1);
  }
}

void bootstrap();
