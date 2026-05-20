import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';

const router = Router({ mergeParams: true });

router.get('/', authenticate, (_req, res) => res.json({ data: [] }));
router.post('/invite', authenticate, (_req, res) => res.status(201).json({ data: {} }));
router.patch('/:userId', authenticate, (_req, res) => res.json({ data: {} }));
router.delete('/:userId', authenticate, (_req, res) => res.status(204).send());

export { router as collaboratorsRouter };
