import { getRedisClient } from '../config/redis';
import { generateId } from '@slidebot/shared-utils';
import { logger } from '../config/logger';
import { env } from '../config/env';

export const INSTANCE_ID = generateId();

// In development with a single instance, heartbeat every 30s is plenty.
// In production with multiple instances, keep it tighter at 10s.
const HEARTBEAT_INTERVAL_MS = env.NODE_ENV === 'development' ? 30_000 : 10_000;
const HEARTBEAT_TTL_SEC = env.NODE_ENV === 'development' ? 60 : 15;

class InstanceManager {
  private interval: NodeJS.Timeout | null = null;
  private redis = getRedisClient();

  startHeartbeat() {
    // Write immediately on start, then at the configured interval
    this.writeHeartbeat();
    this.interval = setInterval(() => this.writeHeartbeat(), HEARTBEAT_INTERVAL_MS);
    logger.info({ instanceId: INSTANCE_ID, intervalMs: HEARTBEAT_INTERVAL_MS }, 'Instance manager started');
  }

  private async writeHeartbeat(): Promise<void> {
    try {
      await this.redis.set(`instance:${INSTANCE_ID}`, Date.now(), 'EX', HEARTBEAT_TTL_SEC);
    } catch (err) {
      logger.error({ err }, 'Failed to write instance heartbeat');
    }
  }

  stopHeartbeat() {
    if (this.interval) clearInterval(this.interval);
    this.redis.del(`instance:${INSTANCE_ID}`).catch(() => {});
    logger.info({ instanceId: INSTANCE_ID }, 'Instance manager stopped');
  }

  async isInstanceAlive(instanceId: string): Promise<boolean> {
    const exists = await this.redis.exists(`instance:${instanceId}`);
    return exists === 1;
  }
  
  async getAllInstances(): Promise<string[]> {
    const keys = await this.redis.keys('instance:*');
    return keys.map(k => k.replace('instance:', ''));
  }
}

export const instanceManager = new InstanceManager();
