/**
 * Annotations REST API
 *
 * Routes:
 *   GET  /api/v1/annotations/slide/:slideId       — fetch annotations for a slide (restore)
 *   POST /api/v1/annotations                      — save (upsert) a single annotation
 *   DELETE /api/v1/annotations/:id                — soft-delete an annotation
 *
 * Design decisions:
 * - POST is idempotent (upsert by annotation ID) — safe to retry on network failures
 * - GET returns from snapshot cache (O(1)) for fast reconnect restore
 * - DELETE is a soft delete (sets deletedAt) — supports undo-redo in future
 */

import { Router, type Request, type Response, type NextFunction } from 'express';

import { authenticate } from '../../middleware/authenticate';
import { annotationService } from './annotations.service';
import type { SaveAnnotationRequest } from './annotations.types';
import { Errors } from '../../middleware/errorHandler';

const router = Router();

// ── GET /slide/:slideId — restore annotations for a slide ─────────────────────

router.get(
  '/slide/:slideId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slideId } = req.params as { slideId: string };
      if (!slideId) throw Errors.badRequest('slideId is required');

      const annotations = await annotationService.getAnnotationsForSlide(slideId);

      res.json({
        data: annotations,
        count: annotations.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST / — save (upsert) annotation ────────────────────────────────────────

router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const body = req.body as SaveAnnotationRequest;

    if (!body.id) throw Errors.badRequest('annotation id is required');
    if (!body.slideId) throw Errors.badRequest('slideId is required');
    if (!body.tool) throw Errors.badRequest('tool is required');
    if (!body.data) throw Errors.badRequest('data is required');

    // Map frontend tool string → Prisma enum (they now match)
    const tool = body.tool as
      | 'freehand'
      | 'highlight'
      | 'arrow'
      | 'text'
      | 'laser'
      | 'select'
      | 'eraser';

    const annotation = await annotationService.saveAnnotation({
      id: body.id,
      slideId: body.slideId,
      sessionId: body.sessionId ?? null,
      userId: user.id,
      displayName: user.email, // resolved in socket flow with displayName
      tool,
      color: body.color,
      strokeWidth: body.strokeWidth ?? 3,
      opacity: body.opacity ?? 1,
      data: body.data,
      isEphemeral: body.isEphemeral ?? false,
    });

    res.status(201).json({ data: annotation });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /:id — soft-delete annotation ─────────────────────────────────────

router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const user = req.user!;

    const deleted = await annotationService.deleteAnnotation(id, user.id);

    if (!deleted) {
      throw Errors.forbidden('Cannot delete this annotation');
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── GET /session/:sessionId/bulk — batch restore all slides in a session ──────

router.get(
  '/session/:sessionId/bulk',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params as { sessionId: string };
      const rawSlideIds = req.query['slideIds'] as string | undefined;

      if (!rawSlideIds) throw Errors.badRequest('slideIds query param required');
      const slideIds = rawSlideIds.split(',').filter(Boolean);

      const annotationMap = await annotationService.getAnnotationsForSession(slideIds);

      res.json({ data: annotationMap });
    } catch (err) {
      next(err);
    }
  }
);

export { router as annotationsRouter };
