import { execFile } from 'node:child_process';
import { mkdtemp, rm, readFile as fsReadFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { prisma } from '../../config/database';
import { supabaseAdmin } from '../../config/supabase';
import {
  CONVERSION_QUEUE_NAME,
  JOB_TIMEOUT_MS,
  type ConversionJobData,
  type ConversionJobResult,
} from './conversion-queue';

// ── Redis connection (BullMQ workers require maxRetriesPerRequest: null) ─────

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// ── LibreOffice conversion ──────────────────────────────────────────────────

/**
 * Execute LibreOffice headless conversion in a sandboxed child process.
 * - No network access (unshare --net on Linux)
 * - 60-second timeout
 * - Converts PPTX to PDF
 */
async function convertPptxToPdf(inputPath: string, outputDir: string): Promise<string> {
  const isLinux = process.platform === 'linux';

  // Build the command and arguments for sandboxed execution
  const command = isLinux ? 'unshare' : 'libreoffice';
  const args = isLinux
    ? [
        '--net', // No network access
        'libreoffice',
        '--headless',
        '--norestore',
        '--convert-to',
        'pdf',
        '--outdir',
        outputDir,
        inputPath,
      ]
    : ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', outputDir, inputPath];

  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        timeout: JOB_TIMEOUT_MS,
        env: {
          HOME: outputDir, // Isolate LibreOffice user profile
          PATH: process.env['PATH'],
        },
      },
      async (error, _stdout, stderr) => {
        if (error) {
          const message = error.killed
            ? `LibreOffice conversion timed out after ${JOB_TIMEOUT_MS}ms`
            : `LibreOffice conversion failed: ${stderr || error.message}`;
          reject(new Error(message));
          return;
        }

        // Find the generated PDF in the output directory
        try {
          const files = await readdir(outputDir);
          const pdfFile = files.find((f) => f.endsWith('.pdf'));
          if (!pdfFile) {
            reject(new Error('LibreOffice did not produce a PDF output file'));
            return;
          }
          resolve(join(outputDir, pdfFile));
        } catch (err) {
          reject(new Error(`Failed to locate PDF output: ${(err as Error).message}`));
        }
      },
    );

    // Ensure the child process is killed on timeout
    child.on('error', (err) => {
      reject(new Error(`Failed to spawn LibreOffice process: ${err.message}`));
    });
  });
}

// ── Worker processor ────────────────────────────────────────────────────────

async function processConversionJob(job: Job<ConversionJobData>): Promise<ConversionJobResult> {
  const { deckId, storagePath } = job.data;
  let tempDir: string | null = null;

  try {
    logger.info({ deckId, storagePath, jobId: job.id }, 'Starting PPTX conversion');

    // Update status to processing
    await prisma.deck.update({
      where: { id: deckId },
      data: { conversionStatus: 'processing' },
    });

    // 1. Download PPTX from Supabase Storage
    const { data: downloadData, error: downloadError } = await supabaseAdmin.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .download(storagePath);

    if (downloadError || !downloadData) {
      throw new Error(`Failed to download PPTX from storage: ${downloadError?.message ?? 'No data returned'}`);
    }

    // 2. Write PPTX to a temporary directory
    tempDir = await mkdtemp(join(tmpdir(), 'slidebot-convert-'));
    const pptxFileName = basename(storagePath);
    const pptxPath = join(tempDir, pptxFileName);

    const buffer = Buffer.from(await downloadData.arrayBuffer());
    const { writeFile } = await import('node:fs/promises');
    await writeFile(pptxPath, buffer);

    logger.info({ deckId, tempDir, pptxPath }, 'PPTX downloaded to temp directory');

    // 3. Execute LibreOffice headless conversion
    const pdfPath = await convertPptxToPdf(pptxPath, tempDir);

    logger.info({ deckId, pdfPath }, 'LibreOffice conversion completed');

    // 4. Upload resulting PDF to Supabase Storage
    const pdfBuffer = await fsReadFile(pdfPath);
    const pdfStoragePath = storagePath.replace(/\.pptx$/i, '.pdf');

    const { error: uploadError } = await supabaseAdmin.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .upload(pdfStoragePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload PDF to storage: ${uploadError.message}`);
    }

    logger.info({ deckId, pdfStoragePath }, 'PDF uploaded to storage');

    // 5. Update Deck record with PDF path and completed status
    await prisma.deck.update({
      where: { id: deckId },
      data: {
        pdfStoragePath,
        conversionStatus: 'completed',
      },
    });

    logger.info({ deckId, jobId: job.id }, 'Deck record updated with conversion result');

    return {
      pdfStoragePath,
      thumbnailPaths: [], // Thumbnails are generated in a separate task (5.3)
    };
  } finally {
    // Clean up temporary directory
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        logger.warn({ err: cleanupErr, tempDir }, 'Failed to clean up temp directory');
      }
    }
  }
}

// ── Worker instance ─────────────────────────────────────────────────────────

let worker: Worker<ConversionJobData, ConversionJobResult> | null = null;

/**
 * Start the BullMQ conversion worker.
 * Processes PPTX-to-PDF conversion jobs from the queue.
 */
export function startConversionWorker(): Worker<ConversionJobData, ConversionJobResult> {
  if (worker) return worker;

  worker = new Worker<ConversionJobData, ConversionJobResult>(
    CONVERSION_QUEUE_NAME,
    processConversionJob,
    {
      connection,
      concurrency: 1, // Process one conversion at a time to avoid resource contention
      lockDuration: JOB_TIMEOUT_MS + 10_000, // Lock slightly longer than timeout
    },
  );

  // Handle job failure after all retries exhausted
  worker.on('failed', async (job, err) => {
    if (!job) return;

    const { deckId } = job.data;
    const attemptsUsed = job.attemptsMade;
    const maxAttempts = job.opts.attempts ?? 3;

    logger.error(
      { deckId, jobId: job.id, err, attemptsUsed, maxAttempts },
      'Conversion job failed',
    );

    // Only mark as failed when all retries are exhausted
    if (attemptsUsed >= maxAttempts) {
      try {
        await prisma.deck.update({
          where: { id: deckId },
          data: { conversionStatus: 'failed' },
        });
        logger.error(
          { deckId, jobId: job.id },
          'All conversion retries exhausted — marked deck as failed',
        );
      } catch (updateErr) {
        logger.error(
          { err: updateErr, deckId },
          'Failed to update deck status after conversion failure',
        );
      }
    }
  });

  worker.on('completed', (job) => {
    logger.info(
      { deckId: job.data.deckId, jobId: job.id },
      'Conversion worker completed job',
    );
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Conversion worker error');
  });

  logger.info('PPTX conversion worker started');
  return worker;
}

/**
 * Gracefully stop the conversion worker.
 */
export async function stopConversionWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('PPTX conversion worker stopped');
  }
}
