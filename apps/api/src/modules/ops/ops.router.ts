import { Router, type Router as ExpressRouter } from 'express';
import { metrics } from '../../config/metrics';
import { getRedisClient } from '../../config/redis';
import { instanceManager, INSTANCE_ID } from '../../socket/instance-manager';

export const opsRouter: ExpressRouter = Router();

opsRouter.get('/', async (_req, res) => {
  const memory = process.memoryUsage();
  
  let redisConnected = false;
  try {
     const redis = getRedisClient();
     redisConnected = redis.status === 'ready';
  } catch (e) {
    // ignore
  }
  
  res.json({
    metrics: metrics.toJSON(),
    memory,
    redisConnected,
    uptime: process.uptime()
  });
});

opsRouter.get('/distributed', async (_req, res) => {
  const instances = await instanceManager.getAllInstances();
  res.json({
    topology: {
      totalInstances: instances.length,
      instances,
      me: INSTANCE_ID
    },
    metrics: metrics.toJSON()
  });
});
