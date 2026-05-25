import { Router } from 'express';
import { authenticate as requireAuth } from '../../middleware/authenticate';
import { prisma } from '../../config/database';

export const workspacesRouter: Router = Router();

// List workspaces for the current user
workspacesRouter.get('/', requireAuth, async (req, res) => {
  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.user!.id },
      include: { workspace: true }
    });
    
    // Extract the workspace from the membership
    const workspaces = memberships.map((m: any) => m.workspace);
    res.json(workspaces);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});
