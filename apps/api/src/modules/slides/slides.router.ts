import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';

// TODO: Wire up slides controller
const router = Router({ mergeParams: true }); // mergeParams to access deckId

/**
 * GET /api/v1/decks/:deckId/slides
 */
router.get('/', authenticate, (_req, res) => {
  res.json({ data: [] });
});

/**
 * POST /api/v1/decks/:deckId/slides
 */
router.post('/', authenticate, (_req, res) => {
  res.status(201).json({ data: {} });
});

/**
 * GET /api/v1/decks/:deckId/slides/:slideId
 */
router.get('/:slideId', authenticate, (req, res) => {
  res.json({ data: { id: req.params['slideId'] } });
});

/**
 * PATCH /api/v1/decks/:deckId/slides/:slideId
 */
router.patch('/:slideId', authenticate, (_req, res) => {
  res.json({ data: {} });
});

/**
 * DELETE /api/v1/decks/:deckId/slides/:slideId
 */
router.delete('/:slideId', authenticate, (_req, res) => {
  res.status(204).send();
});

/**
 * POST /api/v1/decks/:deckId/slides/reorder
 */
router.post('/reorder', authenticate, (_req, res) => {
  res.json({ data: {} });
});

export { router as slidesRouter };
