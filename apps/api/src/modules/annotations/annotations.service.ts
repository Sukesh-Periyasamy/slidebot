/**
 * AnnotationService — the single source of truth for annotation persistence.
 *
 * Architecture decisions:
 * - All DB writes are non-blocking (fire & forget with error logging).
 * - Reads are synchronous — caller awaits only for reconnect restore.
 * - Snapshot pattern: after each write, we upsert AnnotationSnapshot for O(1)
 *   reconnect restore instead of rescanning the full annotations table.
 * - isEphemeral=true annotations (laser pointer) are NEVER persisted.
 */

import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import type { AnnotationDto, AnnotationDataPayload } from './annotations.types';

type AnnotationTool =
  | 'freehand'
  | 'highlight'
  | 'arrow'
  | 'text'
  | 'laser'
  | 'select'
  | 'eraser';

interface PersistedAnnotation {
  id: string;
  slideId: string;
  sessionId: string | null;
  userId: string;
  displayName: string;
  tool: AnnotationTool;
  color: string;
  strokeWidth: number;
  opacity: number;
  data: unknown;
  isEphemeral: boolean;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SaveAnnotationInput {
  id: string;
  slideId: string;
  sessionId?: string | null;
  userId: string;
  displayName: string;
  tool: AnnotationTool;
  color: string;
  strokeWidth: number;
  opacity: number;
  data: AnnotationDataPayload;
  isEphemeral: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class AnnotationService {
  // ── Save (create or upsert) ────────────────────────────────────────────────

  async saveAnnotation(input: SaveAnnotationInput): Promise<PersistedAnnotation | null> {
    if (input.isEphemeral) return null; // Laser pointer etc — never persist

    try {
      const annotation = await prisma.annotation.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          slideId: input.slideId,
          sessionId: input.sessionId ?? null,
          userId: input.userId,
          displayName: input.displayName,
          tool: input.tool,
          color: input.color,
          strokeWidth: input.strokeWidth,
          opacity: input.opacity,
          data: input.data as object,
          isEphemeral: false,
        },
        update: {
          // On re-emit of same ID — update data only
          data: input.data as object,
          color: input.color,
          strokeWidth: input.strokeWidth,
          opacity: input.opacity,
        },
      });

      // Rebuild snapshot asynchronously (non-blocking)
      this._rebuildSnapshot(input.slideId, input.sessionId ?? null).catch((err) =>
        logger.error({ err, slideId: input.slideId }, 'Failed to rebuild annotation snapshot')
      );

      return annotation;
    } catch (err) {
      logger.error({ err, annotationId: input.id }, 'Failed to save annotation');
      return null;
    }
  }

  // ── Soft-delete ────────────────────────────────────────────────────────────

  async deleteAnnotation(annotationId: string, userId: string): Promise<boolean> {
    try {
      const annotation = await prisma.annotation.findUnique({
        where: { id: annotationId },
        select: { userId: true, slideId: true, sessionId: true, isEphemeral: true },
      });

      if (!annotation) return false;

      // Only owner can delete
      if (annotation.userId !== userId) {
        logger.warn({ annotationId, userId }, 'Unauthorized annotation delete attempt');
        return false;
      }

      await prisma.annotation.update({
        where: { id: annotationId },
        data: { deletedAt: new Date() },
      });

      // Rebuild snapshot
      this._rebuildSnapshot(annotation.slideId, annotation.sessionId ?? null).catch((err) =>
        logger.error({ err }, 'Failed to rebuild snapshot after delete')
      );

      return true;
    } catch (err) {
      logger.error({ err, annotationId }, 'Failed to delete annotation');
      return false;
    }
  }

  // ── Fetch for reconnect restore (O(1) via snapshot) ───────────────────────

  /**
   * Primary restore path: returns pre-built snapshot if available.
   * Falls back to a full DB scan if snapshot doesn't exist yet.
   */
  async getAnnotationsForSlide(slideId: string): Promise<AnnotationDto[]> {
    // Try snapshot first
    const snapshot = await prisma.annotationSnapshot.findUnique({
      where: { slideId },
      select: { payload: true },
    });

    if (snapshot) {
      return snapshot.payload as AnnotationDto[];
    }

    // Fallback: scan + build snapshot
    return this._scanAndBuildSnapshot(slideId, null);
  }

  /**
   * Batch restore: fetch snapshots for multiple slides (called on session join).
   * Returns a map of slideId → annotations.
   */
  async getAnnotationsForSession(slideIds: string[]): Promise<Record<string, AnnotationDto[]>> {
    const snapshots = await prisma.annotationSnapshot.findMany({
      where: { slideId: { in: slideIds } },
      select: { slideId: true, payload: true },
    });

    const result: Record<string, AnnotationDto[]> = {};

    // Fill from snapshots
    for (const snap of snapshots) {
      result[snap.slideId] = snap.payload as AnnotationDto[];
    }

    // For any slide without a snapshot, scan + build
    const missingSlides = slideIds.filter((id) => !result[id]);
    await Promise.all(
      missingSlides.map(async (slideId) => {
        result[slideId] = await this._scanAndBuildSnapshot(slideId, null);
      })
    );

    return result;
  }

  // ── Soft-delete all for a session (on session end) ─────────────────────────

  async clearSessionAnnotations(sessionId: string): Promise<void> {
    try {
      await prisma.annotation.updateMany({
        where: { sessionId, deletedAt: null, isEphemeral: false },
        data: { deletedAt: new Date() },
      });
    } catch (err) {
      logger.error({ err, sessionId }, 'Failed to clear session annotations');
    }
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  /**
   * Rebuild the AnnotationSnapshot for a slide.
   * Called asynchronously after every add/delete.
   */
  private async _rebuildSnapshot(slideId: string, sessionId: string | null): Promise<void> {
    const annotations = await prisma.annotation.findMany({
      where: { slideId, deletedAt: null, isEphemeral: false },
      orderBy: { createdAt: 'asc' },
    });

    const payload: AnnotationDto[] = annotations.map(toAnnotationDto);

    await prisma.annotationSnapshot.upsert({
      where: { slideId },
      create: {
        slideId,
        sessionId,
        payload: payload as unknown as object,
        annotationCount: payload.length,
      },
      update: {
        payload: payload as unknown as object,
        annotationCount: payload.length,
        sessionId,
      },
    });
  }

  /**
   * Full table scan fallback + build snapshot.
   */
  private async _scanAndBuildSnapshot(
    slideId: string,
    sessionId: string | null
  ): Promise<AnnotationDto[]> {
    const annotations = await prisma.annotation.findMany({
      where: { slideId, deletedAt: null, isEphemeral: false },
      orderBy: { createdAt: 'asc' },
    });

    const payload: AnnotationDto[] = annotations.map(toAnnotationDto);

    // Write snapshot asynchronously
    prisma.annotationSnapshot
      .upsert({
        where: { slideId },
        create: {
          slideId,
          sessionId,
          payload: payload as unknown as object,
          annotationCount: payload.length,
        },
        update: {
          payload: payload as unknown as object,
          annotationCount: payload.length,
        },
      })
      .catch((err: unknown) => logger.error({ err }, 'Failed to build snapshot'));

    return payload;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapper — Prisma row → AnnotationDto (frontend shape)
// ─────────────────────────────────────────────────────────────────────────────

function toAnnotationDto(row: PersistedAnnotation): AnnotationDto {
  return {
    id: row.id,
    slideId: row.slideId,
    userId: row.userId,
    displayName: row.displayName,
    color: row.color,
    strokeWidth: row.strokeWidth,
    opacity: row.opacity,
    data: row.data as AnnotationDataPayload,
    isEphemeral: row.isEphemeral,
    status: 'committed',
    createdAt: row.createdAt.toISOString(),
  };
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const annotationService = new AnnotationService();
