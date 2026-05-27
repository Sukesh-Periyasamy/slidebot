import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { roomDeletionService } from './room-deletion.service';

const QUEUE_NAME = 'room-cleanup';

// BullMQ requires maxRetriesPerRequest to be null
const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const roomCleanupQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

let worker: Worker | null = null;

/**
 * Start the room cleanup worker and register the repeatable daily cron job.
 * Runs once per day at 03:00 UTC to delete expired rooms (older than 10 days).
 */
export async function startRoomCleanupWorker(): Promise<void> {
  if (worker) return;

  // Register the repeatable job (daily at 03:00 UTC)
  await roomCleanupQueue.upsertJobScheduler(
    'room-cleanup-daily',
    { pattern: '0 3 * * *' },
    { name: 'room-cleanup' },
  );

  worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      logger.info('Room cleanup job started');

      const results = await roomDeletionService.deleteExpiredRooms();

      const totalProcessed = results.length;
      const failures = results.filter((r) => r.error != null).length;
      const successes = totalProcessed - failures;

      logger.info(
        { totalProcessed, successes, failures },
        `Room cleanup job completed: ${successes} deleted, ${failures} failed out of ${totalProcessed} processed`,
      );
    },
    {
      connection,
      concurrency: 1, // Only one cleanup job at a time
      drainDelay: 30_000, // Check less frequently — job runs daily
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Room cleanup job completed successfully');
  });

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Room cleanup job failed');
  });

  logger.info('Room cleanup BullMQ worker started (daily at 03:00 UTC)');
}

export async function stopRoomCleanupWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Room cleanup BullMQ worker stopped');
  }
}
