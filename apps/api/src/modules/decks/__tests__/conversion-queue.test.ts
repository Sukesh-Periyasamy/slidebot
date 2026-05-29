import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mock functions that are available during vi.mock hoisting
const { mockAdd, mockGetJob, mockQueueEventsOn, mockQueueEventsClose, mockQueueConstructor, mockQueueEventsConstructor } = vi.hoisted(() => {
  const mockAdd = vi.fn().mockResolvedValue({ id: 'job-123', data: {} });
  const mockGetJob = vi.fn();
  const mockQueueEventsOn = vi.fn();
  const mockQueueEventsClose = vi.fn().mockResolvedValue(undefined);
  const mockQueueConstructor = vi.fn();
  const mockQueueEventsConstructor = vi.fn();
  return { mockAdd, mockGetJob, mockQueueEventsOn, mockQueueEventsClose, mockQueueConstructor, mockQueueEventsConstructor };
});

// Mock ioredis before importing the module
vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    duplicate: vi.fn().mockReturnThis(),
  }));
  return { default: RedisMock, __esModule: true };
});

// Mock bullmq
vi.mock('bullmq', () => {
  return {
    Queue: vi.fn().mockImplementation((...args: unknown[]) => {
      mockQueueConstructor(...args);
      return {
        add: mockAdd,
        getJob: mockGetJob,
      };
    }),
    QueueEvents: vi.fn().mockImplementation((...args: unknown[]) => {
      mockQueueEventsConstructor(...args);
      return {
        on: mockQueueEventsOn,
        close: mockQueueEventsClose,
      };
    }),
  };
});

// Mock env and logger
vi.mock('../../../config/env', () => ({
  env: { REDIS_URL: 'redis://localhost:6379' },
}));

vi.mock('../../../config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  enqueueConversionJob,
  onConversionEvent,
  startConversionQueueEvents,
  stopConversionQueueEvents,
  CONVERSION_QUEUE_NAME,
  JOB_TIMEOUT_MS,
  type ConversionJobData,
} from '../conversion-queue';

// Capture the constructor args before any test clears them
const queueConstructorArgs = mockQueueConstructor.mock.calls[0];

describe('conversion-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Queue configuration', () => {
    it('uses the correct queue name constant', () => {
      expect(CONVERSION_QUEUE_NAME).toBe('pptx-conversion');
    });

    it('was constructed with correct name and retry configuration', () => {
      // The Queue constructor was called at module load time.
      // We captured the args before beforeEach could clear them.
      expect(queueConstructorArgs[0]).toBe('pptx-conversion');
      expect(queueConstructorArgs[1]).toMatchObject({
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5_000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      });
    });

    it('exports JOB_TIMEOUT_MS as 60 seconds for worker usage', () => {
      expect(JOB_TIMEOUT_MS).toBe(60_000);
    });
  });

  describe('enqueueConversionJob', () => {
    it('enqueues a job with deckId, storagePath, and ownerId', async () => {
      const data: ConversionJobData = {
        deckId: 'deck-abc',
        storagePath: 'user1/deck-abc/file.pptx',
        ownerId: 'user1',
      };

      const jobId = await enqueueConversionJob(data);

      expect(mockAdd).toHaveBeenCalledWith('convert', data, {
        jobId: 'convert-deck-abc',
      });
      expect(jobId).toBe('job-123');
    });

    it('uses deckId to create a deterministic job ID', async () => {
      const data: ConversionJobData = {
        deckId: 'deck-xyz',
        storagePath: 'user2/deck-xyz/presentation.pptx',
        ownerId: 'user2',
      };

      await enqueueConversionJob(data);

      expect(mockAdd).toHaveBeenCalledWith(
        'convert',
        data,
        expect.objectContaining({ jobId: 'convert-deck-xyz' }),
      );
    });
  });

  describe('startConversionQueueEvents / stopConversionQueueEvents', () => {
    it('creates QueueEvents and registers event listeners', async () => {
      // Stop first to reset the singleton state from any prior test
      await stopConversionQueueEvents();
      vi.clearAllMocks();

      startConversionQueueEvents();

      expect(mockQueueEventsConstructor).toHaveBeenCalledWith(
        'pptx-conversion',
        expect.objectContaining({ connection: expect.anything() }),
      );
      expect(mockQueueEventsOn).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockQueueEventsOn).toHaveBeenCalledWith('failed', expect.any(Function));
    });

    it('closes QueueEvents on stop', async () => {
      // Ensure it's started
      await stopConversionQueueEvents();
      startConversionQueueEvents();

      await stopConversionQueueEvents();

      expect(mockQueueEventsClose).toHaveBeenCalled();
    });
  });

  describe('event emission', () => {
    it('emits completion event with deckId and status to registered handlers', async () => {
      const handler = vi.fn();
      onConversionEvent(handler);

      // Reset and start fresh
      await stopConversionQueueEvents();
      vi.clearAllMocks();
      startConversionQueueEvents();

      const completedCallback = mockQueueEventsOn.mock.calls.find(
        (call: unknown[]) => call[0] === 'completed',
      )?.[1] as (args: { jobId: string }) => Promise<void>;

      expect(completedCallback).toBeDefined();

      mockGetJob.mockResolvedValueOnce({
        data: { deckId: 'deck-123', storagePath: 'path/file.pptx', ownerId: 'user1' },
        returnvalue: { pdfStoragePath: 'path/file.pdf', thumbnailPaths: ['thumb1.png'] },
      });

      await completedCallback({ jobId: 'job-1' });

      expect(handler).toHaveBeenCalledWith({
        deckId: 'deck-123',
        status: 'completed',
        pdfStoragePath: 'path/file.pdf',
        thumbnailPaths: ['thumb1.png'],
      });
    });

    it('emits failure event with deckId, status, and error to registered handlers', async () => {
      const handler = vi.fn();
      onConversionEvent(handler);

      // Reset and start fresh
      await stopConversionQueueEvents();
      vi.clearAllMocks();
      startConversionQueueEvents();

      const failedCallback = mockQueueEventsOn.mock.calls.find(
        (call: unknown[]) => call[0] === 'failed',
      )?.[1] as (args: { jobId: string; failedReason: string }) => Promise<void>;

      expect(failedCallback).toBeDefined();

      mockGetJob.mockResolvedValueOnce({
        data: { deckId: 'deck-456', storagePath: 'path/file.pptx', ownerId: 'user2' },
      });

      await failedCallback({ jobId: 'job-2', failedReason: 'LibreOffice timeout' });

      expect(handler).toHaveBeenCalledWith({
        deckId: 'deck-456',
        status: 'failed',
        error: 'LibreOffice timeout',
      });
    });

    it('does not throw if event handler throws', async () => {
      const badHandler = vi.fn().mockImplementation(() => {
        throw new Error('handler error');
      });
      onConversionEvent(badHandler);

      await stopConversionQueueEvents();
      vi.clearAllMocks();
      startConversionQueueEvents();

      const completedCallback = mockQueueEventsOn.mock.calls.find(
        (call: unknown[]) => call[0] === 'completed',
      )?.[1] as (args: { jobId: string }) => Promise<void>;

      mockGetJob.mockResolvedValueOnce({
        data: { deckId: 'deck-789', storagePath: 'path/file.pptx', ownerId: 'user3' },
        returnvalue: { pdfStoragePath: 'path/file.pdf', thumbnailPaths: [] },
      });

      // Should not throw
      await expect(completedCallback({ jobId: 'job-3' })).resolves.not.toThrow();
    });
  });
});
