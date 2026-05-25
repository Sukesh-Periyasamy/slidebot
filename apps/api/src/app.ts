import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env } from './config/env';
import { logger } from './config/logger';
import { getRedisClient } from './config/redis';
import { connectDatabase } from './config/database';
import { PrismaClient } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { authRouter } from './modules/auth/auth.router';
import { decksRouter } from './modules/decks/decks.router';
import { roomsRouter } from './modules/rooms/rooms.router';
import { slidesRouter } from './modules/slides/slides.router';
import { collaboratorsRouter } from './modules/collaborators/collaborators.router';
import { annotationsRouter } from './modules/annotations/annotations.router';
import { opsRouter } from './modules/ops/ops.router';
import { usersRouter } from './modules/users/users.router';
import { workspacesRouter } from './modules/workspaces/workspaces.router';

/**
 * Create and configure the Express application.
 * Pure factory function — no side effects, easy to test.
 */
export function createApp(): Application {
  const app = express();
  app.set('trust proxy', 1);
  const allowedOrigins = env.CORS_ORIGINS.map((origin) =>
    origin.includes('*') ? new RegExp(`^${origin.replaceAll('.', '\\.').replaceAll('*', '.*')}$`) : origin
  );

  // ── Security middleware ────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: env.NODE_ENV === 'production',
    })
  );

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (
          allowedOrigins.some((allowedOrigin) =>
            typeof allowedOrigin === 'string' ? allowedOrigin === origin : allowedOrigin.test(origin)
          )
        ) {
          callback(null, true);
          return;
        }

        callback(new Error(`CORS blocked: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // ── Request parsing ───────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── HTTP request logging (pino-http) ──────────────────────────────────────
  app.use(
    pinoHttp({
      logger,
      // Skip logging for health checks
      autoLogging: {
        ignore: (req) => req.url === '/health',
      },
    })
  );

  // ── Global rate limiting ──────────────────────────────────────────────────
  app.use('/api', rateLimiter);

  // ── Root route ────────────────────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'SlideBot API',
      uptime: process.uptime(),
    });
  });

  // ── Health checks ─────────────────────────────────────────────────────────
  // Lightweight production probe for Render, Better Stack, UptimeRobot, and CI.
  // Keep this side-effect free so it never depends on the database, Redis, or external APIs.
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });

  app.get('/health/redis', async (_req, res) => {
    try {
      const redis = getRedisClient();
      await redis.ping();
      res.status(200).json({ status: 'ok', redis: 'connected' });
    } catch (err) {
      res.status(503).json({ status: 'error', redis: 'disconnected' });
    }
  });

  app.get('/health/persistence', async (_req, res) => {
    try {
      const prisma = new PrismaClient();
      await prisma.$queryRaw`SELECT 1`;
      await prisma.$disconnect();
      res.status(200).json({ status: 'ok', db: 'connected' });
    } catch (err) {
      res.status(503).json({ status: 'error', db: 'disconnected' });
    }
  });

  app.get('/health/realtime', (_req, res) => {
    res.status(200).json({ status: 'ok', realtime: 'bound' });
  });

  Sentry.setupExpressErrorHandler(app);

  // ── API Routes (v1) ───────────────────────────────────────────────────────
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/decks', decksRouter);
  app.use('/api/v1/rooms', roomsRouter);
  app.use('/api/v1/decks/:deckId/slides', slidesRouter);
  app.use('/api/v1/decks/:deckId/collaborators', collaboratorsRouter);
  app.use('/api/v1/annotations', annotationsRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/workspaces', workspacesRouter);
  
  app.use('/debug/ops', opsRouter);

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use(notFoundHandler);

  // ── Global error handler (must be last) ───────────────────────────────────
  app.use(errorHandler);

  return app;
}
