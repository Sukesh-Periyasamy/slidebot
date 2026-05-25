import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { authRouter } from './modules/auth/auth.router';
import { decksRouter } from './modules/decks/decks.router';
import { roomsRouter } from './modules/rooms/rooms.router';
import { slidesRouter } from './modules/slides/slides.router';
import { collaboratorsRouter } from './modules/collaborators/collaborators.router';
import { annotationsRouter } from './modules/annotations/annotations.router';

/**
 * Create and configure the Express application.
 * Pure factory function — no side effects, easy to test.
 */
export function createApp(): Application {
  const app = express();
  app.set('trust proxy', 1);
  const allowedOrigins = [
    'https://slidebot-web.vercel.app',
    'http://localhost:5173',
    /^https:\/\/slidebot-.*\.vercel\.app$/,
  ];

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

  // ── Health check ──────────────────────────────────────────────────────────
  // Lightweight production probe for Render, Better Stack, UptimeRobot, and CI.
  // Keep this side-effect free so it never depends on the database, Redis, or external APIs.
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });

  // ── API Routes (v1) ───────────────────────────────────────────────────────
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/decks', decksRouter);
  app.use('/api/v1/rooms', roomsRouter);
  app.use('/api/v1/decks/:deckId/slides', slidesRouter);
  app.use('/api/v1/decks/:deckId/collaborators', collaboratorsRouter);
  app.use('/api/v1/annotations', annotationsRouter);

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use(notFoundHandler);

  // ── Global error handler (must be last) ───────────────────────────────────
  app.use(errorHandler);

  return app;
}
