import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';

const router = Router();

router.get('/', authenticate, (_req, res) => res.json({ data: [] }));
router.post('/', authenticate, (_req, res) => res.status(201).json({ data: {} }));
router.delete('/:id', authenticate, (_req, res) => res.status(204).send());

export { router as annotationsRouter };
