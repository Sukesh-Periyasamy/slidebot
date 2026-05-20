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
import { slidesRouter } from './modules/slides/slides.router';
import { collaboratorsRouter } from './modules/collaborators/collaborators.router';
import { annotationsRouter } from './modules/annotations/annotations.router';

/**
 * Create and configure the Express application.
 * Pure factory function — no side effects, easy to test.
 */
export function createApp(): Application {
  const app = express();

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
      origin: env.CORS_ORIGINS,
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

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'slidebot-api',
      version: process.env['npm_package_version'] ?? '0.0.1',
      timestamp: new Date().toISOString(),
    });
  });

  // ── API Routes (v1) ───────────────────────────────────────────────────────
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/decks', decksRouter);
  app.use('/api/v1/decks/:deckId/slides', slidesRouter);
  app.use('/api/v1/decks/:deckId/collaborators', collaboratorsRouter);
  app.use('/api/v1/annotations', annotationsRouter);

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use(notFoundHandler);

  // ── Global error handler (must be last) ───────────────────────────────────
  app.use(errorHandler);

  return app;
}
