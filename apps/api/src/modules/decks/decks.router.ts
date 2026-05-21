import { Router, type Router as ExpressRouter } from 'express';

import { authenticate } from '../../middleware/authenticate';

// TODO: Wire up decks controller
const router: ExpressRouter = Router();

/**
 * GET /api/v1/decks
 * List all decks the user owns or collaborates on
 */
router.get('/', authenticate, (_req, res) => {
  // TODO: decksService.listDecks(req.user.id)
  res.json({ data: [] });
});

/**
 * POST /api/v1/decks
 * Create a new deck
 */
router.post('/', authenticate, (_req, res) => {
  // TODO: validate body, decksService.createDeck(...)
  res.status(201).json({ data: {} });
});

/**
 * GET /api/v1/decks/:id
 * Get a single deck with all slides
 */
router.get('/:id', authenticate, (req, res) => {
  // TODO: decksService.getDeck(req.params.id, req.user.id)
  res.json({ data: { id: req.params['id'] } });
});

/**
 * PATCH /api/v1/decks/:id
 * Update deck metadata
 */
router.patch('/:id', authenticate, (_req, res) => {
  // TODO: decksService.updateDeck(...)
  res.json({ data: {} });
});

/**
 * DELETE /api/v1/decks/:id
 * Delete a deck (owner only)
 */
router.delete('/:id', authenticate, (_req, res) => {
  // TODO: decksService.deleteDeck(...)
  res.status(204).send();
});

/**
 * POST /api/v1/decks/:id/duplicate
 * Duplicate a deck
 */
router.post('/:id/duplicate', authenticate, (_req, res) => {
  // TODO: decksService.duplicateDeck(...)
  res.status(201).json({ data: {} });
});

export { router as decksRouter };
