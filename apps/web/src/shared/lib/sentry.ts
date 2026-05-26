import { logger } from '@/lib/logger';

// Mock Sentry integration for sprint stub
export function initSentry() {
  if (import.meta.env.PROD) {
    logger.info('[Sentry] Initialized');
  }
}

export function captureException(error: Error, context?: Record<string, any>) {
  if (import.meta.env.PROD) {
    console.error('[Sentry] Exception captured:', error, context);
  } else {
    console.error(error);
  }
}

export function captureMessage(message: string, context?: Record<string, any>) {
  if (import.meta.env.PROD) {
    logger.info('[Sentry] Message captured:', message, context);
  } else {
    logger.info(message);
  }
}
