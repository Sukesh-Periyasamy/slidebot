import { Router, type Router as ExpressRouter } from 'express';
import multer from 'multer';

import { authenticate } from '../../middleware/authenticate';

// TODO: Wire up decks controller
const router: ExpressRouter = Router();
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF uploads are allowed'));
      return;
    }
    cb(null, true);
  },
});

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
 * POST /api/v1/decks/upload
 * Upload a PDF deck (temporary in-memory handling for MVP)
 */
router.post('/upload', authenticate, (req, res) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      const isLimitError = message.toLowerCase().includes('file too large');
      res.status(400).json({
        error: isLimitError ? 'File is too large. Maximum size is 50MB.' : message,
      });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Missing file upload' });
      return;
    }

    if (file.mimetype !== 'application/pdf') {
      res.status(400).json({ error: 'Only PDF files are supported' });
      return;
    }

    const deckId = `deck_${Math.random().toString(36).slice(2, 10)}`;
    const slides = Math.max(1, Math.ceil(file.size / 180_000));

    res.status(201).json({
      deckId,
      name: file.originalname || 'presentation.pdf',
      slides,
    });
  });
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
