import { getRedisClient } from '../config/redis';
import { logger } from '../config/logger';

export class RedisRateLimiter {
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
  }

  /**
   * Consume tokens from a specific bucket in Redis.
   * @param key The bucket key (e.g., socket.id)
   * @param tokens Number of tokens to consume
   * @returns true if tokens were consumed, false if bucket is empty
   */
  async consume(key: string, tokens: number = 1): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const redisKey = `ratelimit:${key}`;
      const now = Date.now();
      
      const currentTokensStr = await redis.hget(redisKey, 'tokens');
      const lastRefillStr = await redis.hget(redisKey, 'lastRefill');
      
      let currentTokens = currentTokensStr ? parseFloat(currentTokensStr) : this.capacity;
      const lastRefill = lastRefillStr ? parseInt(lastRefillStr, 10) : now;
      
      const timePassed = (now - lastRefill) / 1000;
      const refill = timePassed * this.refillRate;
      
      currentTokens = Math.min(this.capacity, currentTokens + refill);
      
      if (currentTokens >= tokens) {
        currentTokens -= tokens;
        await redis.hset(redisKey, 'tokens', currentTokens);
        await redis.hset(redisKey, 'lastRefill', now);
        await redis.expire(redisKey, Math.ceil(this.capacity / this.refillRate) * 2);
        return true;
      }
      
      await redis.hset(redisKey, 'lastRefill', now);
      await redis.expire(redisKey, Math.ceil(this.capacity / this.refillRate) * 2);
      return false;
    } catch (err) {
      logger.warn({ err }, 'Redis rate limiter failed, failing open');
      return true;
    }
  }

  async remove(key: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`ratelimit:${key}`);
  }
}

export const socketRateLimiter = new RedisRateLimiter(100, 30); // Allow bursts of 100, refill 30 per sec
