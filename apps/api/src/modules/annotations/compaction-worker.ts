import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { roomManager } from '../../socket/room-manager';

const QUEUE_NAME = 'annotation-compaction';

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export interface CompactionJob {
  deckId: string;
  slideId: string;
}

export const compactionQueue = new Queue<CompactionJob>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

let worker: Worker | null = null;

export function startCompactionWorker(): void {
  if (worker) return;

  worker = new Worker<CompactionJob>(
    QUEUE_NAME,
    async (job: Job<CompactionJob>) => {
      const { deckId, slideId } = job.data;
      await roomManager.compactReplayQueue(deckId, slideId);
    },
    {
      connection,
      concurrency: 5, // Avoid overloading Redis with massive stream ranges
    }
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, deckId: job.data.deckId }, 'Compaction completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Compaction failed');
  });

  logger.info('Compaction BullMQ worker started');
}

export async function stopCompactionWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Compaction BullMQ worker stopped');
  }
}
