import type { NextFunction, Request, Response } from 'express';

import { logger } from '../config/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Typed application error
// ─────────────────────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── Factory helpers ────────────────────────────────────────────────────────

export const Errors = {
  badRequest: (message: string, details?: Record<string, string[]>) =>
    new AppError('BAD_REQUEST', message, 400, details),

  unauthorized: (message = 'Unauthorized') =>
    new AppError('UNAUTHORIZED', message, 401),

  forbidden: (message = 'Forbidden') =>
    new AppError('FORBIDDEN', message, 403),

  notFound: (resource: string) =>
    new AppError('NOT_FOUND', `${resource} not found`, 404),

  conflict: (message: string) =>
    new AppError('CONFLICT', message, 409),

  internal: (message = 'Internal server error') =>
    new AppError('INTERNAL_ERROR', message, 500),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler middleware
// Must be registered LAST in Express (after all routes)
// ─────────────────────────────────────────────────────────────────────────────

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    // Known application error
    if (err.statusCode >= 500) {
      logger.error({ err, req: { method: req.method, url: req.url } }, err.message);
    } else {
      logger.warn({ code: err.code, message: err.message });
    }

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Unhandled / unexpected error
  logger.error({ err, req: { method: req.method, url: req.url } }, 'Unhandled error');

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env['NODE_ENV'] === 'production'
          ? 'An unexpected error occurred'
          : err.message,
    },
  });
}
