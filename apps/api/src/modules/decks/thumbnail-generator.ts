import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { supabaseAdmin } from '../../config/supabase';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ThumbnailOptions {
  width: 320;
  height: 180;
  format: 'png';
}

export interface ThumbnailResult {
  thumbnailPaths: string[];
  failedSlides: number[];
}

// ── Default options ─────────────────────────────────────────────────────────

export const DEFAULT_THUMBNAIL_OPTIONS: ThumbnailOptions = {
  width: 320,
  height: 180,
  format: 'png',
};

// ── Core thumbnail generation ───────────────────────────────────────────────

/**
 * Generate PNG thumbnails from a PDF buffer, one per slide.
 * Uses pdf-to-img to render each page and sharp to resize to target dimensions.
 *
 * If a single slide thumbnail fails, processing continues for remaining slides
 * and the failure is logged.
 */
export async function generateThumbnails(
  pdfBuffer: Buffer,
  slideCount: number,
  options: ThumbnailOptions = DEFAULT_THUMBNAIL_OPTIONS,
): Promise<Buffer[]> {
  const { default: sharp } = await import('sharp');
  const { pdf } = await import('pdf-to-img');

  const thumbnails: Buffer[] = [];
  let pageIndex = 0;

  try {
    const document = await pdf(pdfBuffer, { scale: 1.5 });

    for await (const pageImage of document) {
      if (pageIndex >= slideCount) break;

      try {
        const resized = await sharp(pageImage)
          .resize(options.width, options.height, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          })
          .png()
          .toBuffer();

        thumbnails.push(resized);
      } catch (err) {
        logger.error(
          { err, slideIndex: pageIndex },
          `Thumbnail generation failed for slide ${pageIndex + 1}`,
        );
        // Push an empty buffer as placeholder to maintain index alignment
        thumbnails.push(Buffer.alloc(0));
      }

      pageIndex++;
    }
  } catch (err) {
    logger.error({ err }, 'Failed to open PDF for thumbnail generation');
    // Return whatever we have so far (may be empty)
  }

  return thumbnails;
}

// ── Upload and persist thumbnails ───────────────────────────────────────────

/**
 * Generate thumbnails from a PDF buffer, upload them to Supabase Storage,
 * and update the Deck record with the thumbnail prefix.
 *
 * @param deckId - The deck ID to associate thumbnails with
 * @param ownerId - The owner ID for the storage path prefix
 * @param pdfBuffer - The PDF file buffer
 * @param slideCount - Number of slides to generate thumbnails for
 * @param options - Thumbnail dimensions and format options
 * @returns Paths of successfully uploaded thumbnails and indices of failed slides
 */
export async function generateAndUploadThumbnails(
  deckId: string,
  ownerId: string,
  pdfBuffer: Buffer,
  slideCount: number,
  options: ThumbnailOptions = DEFAULT_THUMBNAIL_OPTIONS,
): Promise<ThumbnailResult> {
  const thumbnailPrefix = `${ownerId}/${deckId}/thumbnails`;
  const thumbnails = await generateThumbnails(pdfBuffer, slideCount, options);

  const uploadedPaths: string[] = [];
  const failedSlides: number[] = [];

  for (let i = 0; i < thumbnails.length; i++) {
    const buffer = thumbnails[i];

    // Skip empty buffers (failed generation)
    if (!buffer || buffer.length === 0) {
      failedSlides.push(i);
      logger.warn({ deckId, slideIndex: i }, `Skipping upload for failed thumbnail slide ${i + 1}`);
      continue;
    }

    const storagePath = `${thumbnailPrefix}/slide-${String(i + 1).padStart(3, '0')}.png`;

    try {
      const { error: uploadError } = await supabaseAdmin.storage
        .from(env.SUPABASE_STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      uploadedPaths.push(storagePath);
    } catch (err) {
      failedSlides.push(i);
      logger.error(
        { err, deckId, slideIndex: i, storagePath },
        `Failed to upload thumbnail for slide ${i + 1}`,
      );
      // Continue processing remaining slides per Requirement 8.4
    }
  }

  // Update Deck record with thumbnailPrefix
  try {
    await prisma.deck.update({
      where: { id: deckId },
      data: { thumbnailPrefix },
    });

    logger.info(
      {
        deckId,
        thumbnailPrefix,
        uploaded: uploadedPaths.length,
        failed: failedSlides.length,
        total: slideCount,
      },
      'Thumbnail generation complete',
    );
  } catch (err) {
    logger.error({ err, deckId }, 'Failed to update Deck record with thumbnail prefix');
  }

  return { thumbnailPaths: uploadedPaths, failedSlides };
}
