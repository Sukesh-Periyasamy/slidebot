import { getRedisClient } from '../config/redis';
import { generateId } from '@slidebot/shared-utils';
import { logger } from '../config/logger';

export const INSTANCE_ID = generateId();

class InstanceManager {
  private interval: NodeJS.Timeout | null = null;
  private redis = getRedisClient();

  startHeartbeat() {
    this.interval = setInterval(async () => {
      try {
        await this.redis.set(`instance:${INSTANCE_ID}`, Date.now(), 'EX', 15);
      } catch (err) {
        logger.error({ err }, 'Failed to write instance heartbeat');
      }
    }, 5000);
    logger.info({ instanceId: INSTANCE_ID }, 'Instance manager started');
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
