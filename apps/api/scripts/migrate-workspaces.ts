import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting workspace migration...');
  const users = await prisma.user.findMany();
  
  for (const user of users) {
    // 1. Check if user already has a workspace
    const existingWorkspaces = await prisma.workspace.findMany({
      where: { ownerId: user.id }
    });
    
    let workspaceId: string;
    
    if (existingWorkspaces.length === 0) {
      console.log(`Creating default workspace for user ${user.id} (${user.email})...`);
      const workspace = await prisma.workspace.create({
        data: {
          name: 'Personal Workspace',
          ownerId: user.id,
          members: {
            create: {
              userId: user.id,
              role: 'owner'
            }
          }
        }
      });
      workspaceId = workspace.id;
    } else {
      workspaceId = existingWorkspaces[0].id;
    }
    
    // 2. Migrate decks for this user
    const decks = await prisma.deck.findMany({
      where: { ownerId: user.id, workspaceId: null }
    });
    
    for (const deck of decks) {
      console.log(`Migrating deck ${deck.id} to workspace ${workspaceId}...`);
      await prisma.deck.update({
        where: { id: deck.id },
        data: { workspaceId }
      });
    }
    
    // 3. Create settings and profile if they don't exist
    const profile = await prisma.userProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      await prisma.userProfile.create({
        data: {
          userId: user.id
        }
      });
    }
    
    const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    if (!settings) {
      await prisma.userSettings.create({
        data: {
          userId: user.id
        }
      });
    }
  }
  
  console.log('Workspace migration completed successfully.');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
