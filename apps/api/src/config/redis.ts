import { Redis } from 'ioredis';

import { env } from './env';
import { logger } from './logger';

let redisClient: Redis | null = null;

/**
 * Get or create the singleton Redis client.
 * Used by: Socket.IO adapter, BullMQ, session cache
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redisClient.on('connect', () => logger.debug('Redis connecting...'));
    redisClient.on('ready', () => logger.info('Redis ready'));
    redisClient.on('error', (err) => logger.error({ err }, 'Redis error'));
    redisClient.on('close', () => logger.warn('Redis connection closed'));
  }

  return redisClient;
}

/**
 * Connect to Redis and verify connectivity.
 * Called once during server bootstrap.
 */
export async function connectRedis(): Promise<void> {
  const client = getRedisClient();
  await client.connect();
  await client.ping();
  logger.info('Redis connection established');
}
