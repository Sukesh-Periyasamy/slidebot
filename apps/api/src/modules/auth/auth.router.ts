import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';

// TODO: Implement auth controller methods
const router = Router();

/**
 * GET /api/v1/auth/me
 * Returns the currently authenticated user's profile
 */
router.get('/me', authenticate, (_req, res) => {
  // TODO: Return user profile from DB
  res.json({ data: _req.user });
});

/**
 * POST /api/v1/auth/refresh
 * Refresh Supabase session token
 */
router.post('/refresh', (_req, res) => {
  // TODO: Implement token refresh via Supabase
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming soon' } });
});

export { router as authRouter };
