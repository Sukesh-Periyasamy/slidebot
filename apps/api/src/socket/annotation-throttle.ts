/**
 * annotation-throttle.ts — Server-side per-user annotation rate limiter.
 *
 * Strategy:
 * - Track event count per (socketId, eventType) within a sliding 1-second window.
 * - If a socket exceeds MAX_EVENTS_PER_SECOND, excess events are dropped.
 * - A warning is logged at the 80% threshold (soft limit).
 * - Counters are reset every WINDOW_MS using a rolling bucket approach.
 *
 * This protects against:
 * - Runaway clients sending cursor/annotation events without throttling
 * - Denial-of-service via annotation flooding
 * - Accidental 60fps cursor floods from unthrottled clients
 *
 * Per SYSTEM_INVARIANTS §9: Ephemeral data must NEVER flood Postgres.
 * This throttle also acts as the last line of defense before broadcast.
 */

import type { Socket } from 'socket.io';
import { logger } from '../config/logger';
import { metrics } from '../config/metrics';
import { socketRateLimiter } from './rate-limiter';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum high-frequency events per socket per second.
 * At 30fps cursor + 30fps annotations = 60 events/s is the expected max.
 * We allow 2× headroom = 120 before dropping.
 */
const MAX_EVENTS_PER_SECOND = parseInt(
  process.env.ANNOTATION_RATE_LIMIT ?? '120',
  10
);

const SOFT_LIMIT_RATIO = 0.8; // Log warning at 80% of limit
const WINDOW_MS = 1000; // 1-second sliding window

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RateBucket {
  count: number;
  windowStart: number;
  droppedTotal: number;
  warned: boolean;
}

// socketId → bucket
const buckets = new Map<string, RateBucket>();

// Clean up buckets for disconnected sockets to prevent memory growth
const CLEANUP_INTERVAL_MS = 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupRunning() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [socketId, bucket] of buckets.entries()) {
      // If the bucket hasn't seen activity in 2 minutes, remove it
      if (now - bucket.windowStart > 120_000) {
        buckets.delete(socketId);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Don't prevent Node from exiting
  cleanupTimer.unref?.();
}

// ─────────────────────────────────────────────────────────────────────────────
// Core rate check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the event should be allowed, false if it should be dropped.
 */
export function checkAnnotationRate(socketId: string, eventName: string): boolean {
  ensureCleanupRunning();

  const now = Date.now();
  let bucket = buckets.get(socketId);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    bucket = { count: 0, windowStart: now, droppedTotal: bucket?.droppedTotal || 0, warned: false };
    buckets.set(socketId, bucket);
  }

  bucket.count++;

  if (bucket.count > MAX_EVENTS_PER_SECOND) {
    bucket.droppedTotal++;
    
    // Log occasionally
    if (Math.random() < 0.05) {
      logger.warn(
        { socketId, eventName },
        'Annotation rate exceeded — dropping event'
      );
    }
    return false;
  }

  if (bucket.count > MAX_EVENTS_PER_SECOND * SOFT_LIMIT_RATIO && !bucket.warned) {
    bucket.warned = true;
    logger.debug({ socketId, eventName }, 'Annotation rate approaching soft limit');
  }

  return true;
}

/**
 * Remove the bucket when a socket disconnects (immediate cleanup).
 */
export function clearAnnotationRate(socketId: string): void {
  buckets.delete(socketId);
}

/**
 * Socket.IO middleware factory for annotation rate limiting.
 * Apply to high-frequency events in the collaboration namespace.
 *
 * @example
 * socket.use(annotationRateLimiterMiddleware(socket));
 *
 * High-frequency events that go through this middleware:
 * - annotation_draw  (~30fps)
 * - cursor_move      (~30fps)
 * - laser_move       (~60fps)
 */
export function annotationRateLimiterMiddleware(socket: Socket) {
  // Register cleanup on disconnect
  socket.on('disconnect', () => clearAnnotationRate(socket.id));

  const HIGH_FREQUENCY_EVENTS = new Set([
    'annotation_draw',
    'cursor_move',
    'laser_move',
  ]);

  return async (event: Parameters<Parameters<Socket['use']>[0]>[0], next: Parameters<Parameters<Socket['use']>[0]>[1]) => {
    const eventName = event[0];

    if (HIGH_FREQUENCY_EVENTS.has(eventName as string)) {
      // 1. Strict byte length limit
      const payloadSize = Buffer.byteLength(JSON.stringify(event));
      if (payloadSize > 50 * 1024) { // 50KB max for annotation updates
        logger.warn({ socketId: socket.id, size: payloadSize }, 'Payload size exceeded, dropping event');
        metrics.inc('socket:payload_size_exceeded');
        return; // Drop silently
      }

      // 2. Rate limit
      if (!checkAnnotationRate(socket.id, eventName as string)) {
        // Check for severe abuse
        const bucket = buckets.get(socket.id);
        if (bucket && bucket.droppedTotal > 200) {
          logger.error({ socketId: socket.id }, 'Auto-kicking socket for severe rate limit abuse');
          metrics.inc('socket:abuse_kick');
          socket.disconnect(true);
        }
        // Drop silently — do not call next(), do not send error to client
        return;
      }
    }

    next();
  };
}

/**
 * Get current rate stats for a socket (useful for monitoring/reporting).
 */
export function getAnnotationRateStats(socketId: string): {
  currentCount: number;
  droppedTotal: number;
  windowStartedAt: number;
} | null {
  const bucket = buckets.get(socketId);
  if (!bucket) return null;
  return {
    currentCount: bucket.count,
    droppedTotal: bucket.droppedTotal,
    windowStartedAt: bucket.windowStart,
  };
}
