import rateLimit from 'express-rate-limit';

import { env } from '../config/env';

/**
 * Global rate limiter applied to all /api/* routes.
 * More specific limits can be applied at the router level.
 */
export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later.',
    },
  },
  skip: (req) => {
    // Skip rate limiting in test environment
    return process.env['NODE_ENV'] === 'test';
  },
});

/**
 * Stricter rate limiter for auth endpoints
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts, please try again later.',
    },
  },
});
