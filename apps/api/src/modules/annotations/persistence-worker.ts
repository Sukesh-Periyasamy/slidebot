import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { annotationService } from './annotations.service';
import type { SaveAnnotationInput } from './annotations.service';

const QUEUE_NAME = 'annotation-persistence';

// BullMQ requires maxRetriesPerRequest to be null
const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const persistenceQueue = new Queue<SaveAnnotationInput>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false, // Keep in failed set for DLQ
  },
});

let worker: Worker | null = null;

export function startPersistenceWorker(): void {
  if (worker) return;

  worker = new Worker<SaveAnnotationInput>(
    QUEUE_NAME,
    async (job: Job<SaveAnnotationInput>) => {
      // Actually write to DB
      await annotationService.saveAnnotationInternal(job.data);
    },
    {
      connection,
      concurrency: 50, // Process many annotations concurrently
      // Reduce Redis polling when idle — wait 5s before checking for new jobs
      drainDelay: 5000,
    }
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, annotationId: job.data.id }, 'Annotation persisted via BullMQ');
  });

  worker.on('failed', (job, err) => {
    if (job) {
      logger.error({ err, jobId: job.id, annotationId: job.data.id }, 'Annotation persistence failed');
    } else {
      logger.error({ err }, 'Annotation persistence failed (unknown job)');
    }
  });

  logger.info('Persistence BullMQ worker started');
}

export async function stopPersistenceWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Persistence BullMQ worker stopped');
  }
}
