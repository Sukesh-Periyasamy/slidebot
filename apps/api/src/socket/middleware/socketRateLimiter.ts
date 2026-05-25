import { getRedisClient } from '../../config/redis';
import type { Socket } from 'socket.io';
import { logger } from '../../config/logger';
import { metrics } from '../../config/metrics';

const RATE_LIMIT_WINDOW = 1; // 1 second
const RATE_LIMIT_MAX = 50; // max 50 events per second

export async function rateLimitSocketEvent(socket: Socket, eventName: string): Promise<boolean> {
  const redis = getRedisClient();
  const key = `ratelimit:${socket.id}:${eventName}`;
  
  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW);
    }
    
    if (current > RATE_LIMIT_MAX) {
      logger.warn({ socketId: socket.id, eventName, count: current }, 'Rate limit exceeded');
      metrics.inc('socket:rate_limit_exceeded');
      
      // Auto-kick if severely abused (> 2x limit)
      if (current > RATE_LIMIT_MAX * 2) {
        logger.error({ socketId: socket.id }, 'Auto-kicking socket for abuse');
        socket.disconnect(true);
      }
      
      return false; // rate limited
    }
  } catch (err) {
    // Fail open if Redis is down for rate limiting, but log
    logger.warn({ err }, 'Failed to process rate limit');
  }
  
  return true; // allowed
}
