import { Router, type Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import type { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/prisma';

export const workspacesRouter = Router();

// List workspaces for the current user
workspacesRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.user!.id },
      include: { workspace: true }
    });
    
    // Extract the workspace from the membership
    const workspaces = memberships.map(m => m.workspace);
    res.json(workspaces);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});
