import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

import { env } from '../../config/env';
import { logger } from '../../config/logger';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ConversionJobData {
  deckId: string;
  storagePath: string;
  ownerId: string;
}

export interface ConversionJobResult {
  pdfStoragePath: string;
  thumbnailPaths: string[];
}

export interface ConversionEvent {
  deckId: string;
  status: 'completed' | 'failed';
  pdfStoragePath?: string;
  thumbnailPaths?: string[];
  error?: string;
}

export type ConversionEventHandler = (event: ConversionEvent) => void;

// ── Constants ───────────────────────────────────────────────────────────────

export const CONVERSION_QUEUE_NAME = 'pptx-conversion';
export const JOB_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 5_000;

// ── Redis connection (BullMQ requires maxRetriesPerRequest: null) ────────────

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// ── Queue instance ──────────────────────────────────────────────────────────

export const conversionQueue = new Queue<ConversionJobData, ConversionJobResult, 'convert'>(
  CONVERSION_QUEUE_NAME,
  {
    connection,
    defaultJobOptions: {
      attempts: MAX_RETRIES,
      backoff: {
        type: 'exponential',
        delay: INITIAL_BACKOFF_MS,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  },
);

// ── Event listeners ─────────────────────────────────────────────────────────

const eventHandlers: ConversionEventHandler[] = [];

/**
 * Register a handler for conversion completion/failure events.
 * Used to notify clients via Socket.IO when conversion finishes.
 */
export function onConversionEvent(handler: ConversionEventHandler): void {
  eventHandlers.push(handler);
}

function emitConversionEvent(event: ConversionEvent): void {
  for (const handler of eventHandlers) {
    try {
      handler(event);
    } catch (err) {
      logger.error({ err, deckId: event.deckId }, 'Conversion event handler error');
    }
  }
}

// ── QueueEvents for completion/failure tracking ─────────────────────────────

let queueEvents: QueueEvents | null = null;

export function startConversionQueueEvents(): void {
  if (queueEvents) return;

  queueEvents = new QueueEvents(CONVERSION_QUEUE_NAME, { connection });

  queueEvents.on('completed', async ({ jobId }) => {
    try {
      const job = await conversionQueue.getJob(jobId);
      if (!job) return;

      const result = job.returnvalue as ConversionJobResult;
      emitConversionEvent({
        deckId: job.data.deckId,
        status: 'completed',
        pdfStoragePath: result?.pdfStoragePath,
        thumbnailPaths: result?.thumbnailPaths,
      });

      logger.info({ deckId: job.data.deckId, jobId }, 'PPTX conversion completed');
    } catch (err) {
      logger.error({ err, jobId }, 'Error handling conversion completion event');
    }
  });

  queueEvents.on('failed', async ({ jobId, failedReason }) => {
    try {
      const job = await conversionQueue.getJob(jobId);
      if (!job) return;

      emitConversionEvent({
        deckId: job.data.deckId,
        status: 'failed',
        error: failedReason,
      });

      logger.error(
        { deckId: job.data.deckId, jobId, reason: failedReason },
        'PPTX conversion failed after all retries',
      );
    } catch (err) {
      logger.error({ err, jobId }, 'Error handling conversion failure event');
    }
  });

  logger.info('Conversion queue events listener started');
}

export async function stopConversionQueueEvents(): Promise<void> {
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
    logger.info('Conversion queue events listener stopped');
  }
}

// ── Enqueue helper ──────────────────────────────────────────────────────────

/**
 * Enqueue a PPTX-to-PDF conversion job.
 * Returns the BullMQ job ID for tracking.
 */
export async function enqueueConversionJob(data: ConversionJobData): Promise<string> {
  const job = await conversionQueue.add('convert', data, {
    jobId: `convert-${data.deckId}`,
  });

  logger.info(
    { deckId: data.deckId, jobId: job.id, storagePath: data.storagePath },
    'PPTX conversion job enqueued',
  );

  return job.id!;
}
