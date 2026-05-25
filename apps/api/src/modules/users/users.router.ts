import { Router } from 'express';
import { authenticate as requireAuth } from '../../middleware/authenticate';
import { prisma } from '../../config/database';

export const usersRouter: Router = Router();

// Get settings
usersRouter.get('/me/settings', requireAuth, async (req, res) => {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: req.user!.id }
    });
    res.json(settings ? settings.payload : {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update settings
usersRouter.put('/me/settings', requireAuth, async (req, res) => {
  try {
    const { payload } = req.body;
    
    const settings = await prisma.userSettings.upsert({
      where: { userId: req.user!.id },
      update: { payload },
      create: {
        userId: req.user!.id,
        payload
      }
    });
    
    res.json(settings.payload);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});
